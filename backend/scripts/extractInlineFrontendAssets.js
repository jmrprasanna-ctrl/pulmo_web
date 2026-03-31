const fs = require("fs");
const path = require("path");

const FRONTEND_DIR = path.resolve(__dirname, "..", "..", "frontend");
const EXTRACTED_ROOT = path.join(FRONTEND_DIR, "assets", "extracted");

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listHtmlFiles(dirPath) {
  const out = [];
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (toPosix(fullPath).includes("/assets/extracted/")) continue;
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
        out.push(fullPath);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function cleanExtractedForFile(relativeHtmlPath) {
  const relNoExt = relativeHtmlPath.replace(/\.html$/i, "");
  const outDir = path.join(EXTRACTED_ROOT, path.dirname(relNoExt));
  const base = path.basename(relNoExt);
  if (!fs.existsSync(outDir)) return;
  for (const fileName of fs.readdirSync(outDir)) {
    if (fileName.startsWith(`${base}.inline-style-`) || fileName.startsWith(`${base}.inline-script-`)) {
      fs.unlinkSync(path.join(outDir, fileName));
    }
  }
}

function main() {
  ensureDir(EXTRACTED_ROOT);
  const htmlFiles = listHtmlFiles(FRONTEND_DIR);
  let updatedCount = 0;
  let styleCount = 0;
  let scriptCount = 0;

  for (const htmlPath of htmlFiles) {
    const relativeHtmlPath = toPosix(path.relative(FRONTEND_DIR, htmlPath));
    let html = fs.readFileSync(htmlPath, "utf8");
    const original = html;

    cleanExtractedForFile(relativeHtmlPath);
    const relNoExt = relativeHtmlPath.replace(/\.html$/i, "");
    const outDir = path.join(EXTRACTED_ROOT, path.dirname(relNoExt));
    const base = path.basename(relNoExt);
    ensureDir(outDir);

    let localStyleIndex = 0;
    html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, cssBody) => {
      const css = String(cssBody || "").trim();
      if (!css) return "";
      localStyleIndex += 1;
      styleCount += 1;
      const fileName = `${base}.inline-style-${localStyleIndex}.css`;
      const outPath = path.join(outDir, fileName);
      fs.writeFileSync(outPath, `${css}\n`, "utf8");
      const relHref = toPosix(path.relative(path.dirname(htmlPath), outPath));
      return `<link rel="stylesheet" href="${relHref}">`;
    });

    let localScriptIndex = 0;
    html = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (_match, jsBody) => {
      const js = String(jsBody || "").trim();
      if (!js) return "";
      localScriptIndex += 1;
      scriptCount += 1;
      const fileName = `${base}.inline-script-${localScriptIndex}.js`;
      const outPath = path.join(outDir, fileName);
      fs.writeFileSync(outPath, `${js}\n`, "utf8");
      const relSrc = toPosix(path.relative(path.dirname(htmlPath), outPath));
      return `<script src="${relSrc}"></script>`;
    });

    if (html !== original) {
      fs.writeFileSync(htmlPath, html, "utf8");
      updatedCount += 1;
    }
  }

  console.log(`Updated HTML files: ${updatedCount}`);
  console.log(`Extracted style blocks: ${styleCount}`);
  console.log(`Extracted script blocks: ${scriptCount}`);
}

main();


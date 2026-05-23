const fs = require("fs");
const { Readable } = require("stream");

let cachedGoogleModule = null;

function getGoogleModule() {
  if (cachedGoogleModule) {
    return cachedGoogleModule;
  }
  try {
    // Optional dependency: install with `npm install googleapis`
    cachedGoogleModule = require("googleapis");
    return cachedGoogleModule;
  } catch (_err) {
    return null;
  }
}

function ensureGoogleApisInstalled() {
  const mod = getGoogleModule();
  if (!mod || !mod.google) {
    throw new Error("Google Drive integration requires package `googleapis`. Run: npm install googleapis");
  }
  return mod.google;
}

function sanitizeDriveName(value, fallback = "file") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 200);
  return cleaned || fallback;
}

function parseCredentials(raw) {
  const input = String(raw || "").trim();
  if (!input) {
    throw new Error("Google Drive credentials JSON is required.");
  }

  if (input.startsWith("{")) {
    return JSON.parse(input);
  }

  if (fs.existsSync(input)) {
    const fileText = fs.readFileSync(input, "utf8");
    return JSON.parse(fileText);
  }

  try {
    const decoded = Buffer.from(input, "base64").toString("utf8");
    if (decoded.trim().startsWith("{")) {
      return JSON.parse(decoded);
    }
  } catch (_err) {
  }

  throw new Error("Invalid Google Drive credentials format. Paste service account JSON, base64 JSON, or a file path.");
}

async function createDriveClientFromSettings(settings = {}) {
  const credentials = parseCredentials(settings.drive_credentials_json || "");
  const google = ensureGoogleApisInstalled();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

function escapeDriveQueryValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolderByName(drive, name, parentId) {
  const safeName = sanitizeDriveName(name, "Folder");
  const queryParts = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${escapeDriveQueryValue(safeName)}'`,
  ];
  if (parentId) {
    queryParts.push(`'${escapeDriveQueryValue(parentId)}' in parents`);
  }
  const res = await drive.files.list({
    q: queryParts.join(" and "),
    fields: "files(id,name,parents)",
    spaces: "drive",
    pageSize: 10,
  });
  return (res.data.files || [])[0] || null;
}

async function createFolder(drive, name, parentId) {
  const safeName = sanitizeDriveName(name, "Folder");
  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id,name,parents",
  });
  return res.data;
}

async function ensureFolderByName(drive, name, parentId) {
  const existing = await findFolderByName(drive, name, parentId);
  if (existing) return existing;
  return createFolder(drive, name, parentId);
}

async function ensureFolderPath(drive, rootFolderName, segments = []) {
  const normalizedRoot = sanitizeDriveName(rootFolderName || "AXIS CMS PULMO", "AXIS CMS PULMO");
  const root = await ensureFolderByName(drive, normalizedRoot, null);
  let parent = root;
  const resolvedPath = [root.name];
  for (const segment of Array.isArray(segments) ? segments : []) {
    const name = sanitizeDriveName(segment, "Folder");
    parent = await ensureFolderByName(drive, name, parent.id);
    resolvedPath.push(parent.name);
  }
  return {
    rootId: root.id,
    folderId: parent.id,
    folderPath: resolvedPath.join(" > "),
  };
}

async function findFileByName(drive, name, parentId) {
  const safeName = sanitizeDriveName(name, "file");
  const queryParts = [
    "trashed = false",
    `name = '${escapeDriveQueryValue(safeName)}'`,
    `'${escapeDriveQueryValue(parentId)}' in parents`,
  ];
  const res = await drive.files.list({
    q: queryParts.join(" and "),
    fields: "files(id,name,size,modifiedTime,webViewLink)",
    spaces: "drive",
    pageSize: 10,
  });
  return (res.data.files || [])[0] || null;
}

async function uploadBufferFile(drive, { parentId, fileName, mimeType, buffer }) {
  const safeName = sanitizeDriveName(fileName, "file");
  const media = {
    mimeType: String(mimeType || "application/octet-stream"),
    body: Readable.from(buffer || Buffer.alloc(0)),
  };
  const existing = await findFileByName(drive, safeName, parentId);
  if (existing && existing.id) {
    const updated = await drive.files.update({
      fileId: existing.id,
      media,
      requestBody: { name: safeName },
      fields: "id,name,size,modifiedTime,webViewLink",
    });
    return updated.data;
  }
  const created = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: parentId ? [parentId] : undefined,
    },
    media,
    fields: "id,name,size,modifiedTime,webViewLink",
  });
  return created.data;
}

async function deleteFileSafe(drive, fileId) {
  const id = String(fileId || "").trim();
  if (!id) return { deleted: false };
  try {
    await drive.files.delete({ fileId: id });
    return { deleted: true };
  } catch (err) {
    const status = Number(err?.code || err?.status || 0);
    if (status === 404) return { deleted: false, missing: true };
    throw err;
  }
}

async function getFileMetadataSafe(drive, fileId) {
  const id = String(fileId || "").trim();
  if (!id) return null;
  try {
    const res = await drive.files.get({
      fileId: id,
      fields: "id,name,size,modifiedTime,trashed,webViewLink",
    });
    const file = res.data || null;
    if (!file || file.trashed) return null;
    return file;
  } catch (err) {
    const status = Number(err?.code || err?.status || 0);
    if (status === 404) return null;
    throw err;
  }
}

async function testDriveConnection(settings = {}) {
  const drive = await createDriveClientFromSettings(settings);
  const folderName = sanitizeDriveName(settings.drive_root_folder_name || "AXIS CMS PULMO", "AXIS CMS PULMO");
  const ensured = await ensureFolderPath(drive, folderName, []);
  return {
    ok: true,
    root_folder_name: folderName,
    root_folder_id: ensured.rootId,
    folder_path: ensured.folderPath,
  };
}

module.exports = {
  sanitizeDriveName,
  createDriveClientFromSettings,
  ensureFolderPath,
  uploadBufferFile,
  deleteFileSafe,
  getFileMetadataSafe,
  testDriveConnection,
};


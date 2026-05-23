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

function normalizeDriveAuthType(value, fallback = "service_account") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "oauth") return "oauth";
  if (raw === "service_account") return "service_account";
  return fallback;
}

function extractDriveErrorMeta(err) {
  const reason = String(
    err?.response?.data?.error?.errors?.[0]?.reason
    || err?.errors?.[0]?.reason
    || ""
  ).trim();
  const message = String(
    err?.response?.data?.error?.message
    || err?.message
    || ""
  ).trim();
  return { reason, message };
}

function isStorageQuotaError(err) {
  const { reason, message } = extractDriveErrorMeta(err);
  if (reason.toLowerCase() === "storagequotaexceeded") return true;
  return /service accounts do not have storage quota|storage quota has been exceeded/i.test(message);
}

function buildSharedDriveInstruction(rootName) {
  const safeRoot = sanitizeDriveName(rootName || "AXIS CMS PULMO", "AXIS CMS PULMO");
  return (
    `Google Drive service account cannot store files in My Drive. `
    + `Create folder "${safeRoot}" inside a Google Shared Drive and add the service account as Editor/Content manager, then retry. `
    + `If you only use personal Gmail (no Shared Drive), switch this integration from Service Account to OAuth user access.`
  );
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

function parseJsonLike(raw, requiredMessage, invalidMessage) {
  const input = String(raw || "").trim();
  if (!input) {
    throw new Error(requiredMessage);
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
  throw new Error(invalidMessage);
}

function parseOAuthClient(rawOAuthClientJson) {
  const parsed = parseJsonLike(
    rawOAuthClientJson,
    "Google OAuth client JSON is required.",
    "Invalid Google OAuth client JSON. Paste OAuth client JSON, base64 JSON, or a file path."
  );
  const webLike = parsed?.web || parsed?.installed || parsed || {};
  const clientId = String(webLike.client_id || "").trim();
  const clientSecret = String(webLike.client_secret || "").trim();
  const redirectUrisRaw = Array.isArray(webLike.redirect_uris) ? webLike.redirect_uris : [];
  const redirectUris = redirectUrisRaw.map((x) => String(x || "").trim()).filter(Boolean);
  if (!clientId || !clientSecret) {
    throw new Error("OAuth client JSON must include client_id and client_secret.");
  }
  return { clientId, clientSecret, redirectUris };
}

function buildOAuthClient(parsedOAuthConfig, redirectUri) {
  const google = ensureGoogleApisInstalled();
  const chosenRedirect =
    String(redirectUri || "").trim()
    || String(parsedOAuthConfig?.redirectUris?.[0] || "").trim()
    || "http://localhost";
  const oauth2Client = new google.auth.OAuth2(
    parsedOAuthConfig.clientId,
    parsedOAuthConfig.clientSecret,
    chosenRedirect
  );
  return { google, oauth2Client, chosenRedirect };
}

function toExpiryDateMs(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  const raw = String(value || "").trim();
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) return Math.floor(asNum);
  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) return asDate.getTime();
  return null;
}

async function createDriveClientFromSettings(settings = {}) {
  const authType = normalizeDriveAuthType(settings.drive_auth_type, "service_account");
  if (authType === "oauth") {
    const parsedOAuth = parseOAuthClient(settings.drive_oauth_client_json || "");
    const { google, oauth2Client } = buildOAuthClient(parsedOAuth, settings.drive_oauth_redirect_uri);
    const refreshToken = String(settings.drive_oauth_refresh_token || "").trim();
    if (!refreshToken) {
      throw new Error("Google OAuth connection is missing refresh token. Please reconnect Google account.");
    }
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
      access_token: String(settings.drive_oauth_access_token || "").trim() || undefined,
      expiry_date: toExpiryDateMs(settings.drive_oauth_expiry_at),
    });
    return google.drive({ version: "v3", auth: oauth2Client });
  }

  const credentials = parseCredentials(settings.drive_credentials_json || "");
  const google = ensureGoogleApisInstalled();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

function buildGoogleOAuthAuthorizeUrl(settings = {}, { redirectUri, state } = {}) {
  const parsedOAuth = parseOAuthClient(settings.drive_oauth_client_json || "");
  const { oauth2Client, chosenRedirect } = buildOAuthClient(parsedOAuth, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state: String(state || "").trim() || undefined,
  });
  return { authUrl, redirectUri: chosenRedirect };
}

async function exchangeGoogleOAuthCode(settings = {}, { redirectUri, code } = {}) {
  const parsedOAuth = parseOAuthClient(settings.drive_oauth_client_json || "");
  const { google, oauth2Client, chosenRedirect } = buildOAuthClient(parsedOAuth, redirectUri);
  const safeCode = String(code || "").trim();
  if (!safeCode) {
    throw new Error("Missing Google OAuth authorization code.");
  }

  const tokenRes = await oauth2Client.getToken(safeCode);
  const tokens = tokenRes?.tokens || {};
  oauth2Client.setCredentials(tokens);

  let email = "";
  try {
    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2Client });
    const info = await oauth2Api.userinfo.get();
    email = String(info?.data?.email || "").trim().toLowerCase();
  } catch (_err) {
  }

  return {
    redirectUri: chosenRedirect,
    tokens,
    email,
  };
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
    fields: "files(id,name,parents,driveId)",
    spaces: "drive",
    pageSize: 25,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: "allDrives",
  });
  const files = Array.isArray(res.data.files) ? res.data.files.slice() : [];
  if (!parentId) {
    files.sort((a, b) => Number(Boolean(b?.driveId)) - Number(Boolean(a?.driveId)));
  }
  return files[0] || null;
}

async function createFolder(drive, name, parentId) {
  const safeName = sanitizeDriveName(name, "Folder");
  try {
    const res = await drive.files.create({
      requestBody: {
        name: safeName,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined,
      },
      fields: "id,name,parents,driveId",
      supportsAllDrives: true,
    });
    return res.data;
  } catch (err) {
    if (isStorageQuotaError(err)) {
      throw new Error(buildSharedDriveInstruction(safeName));
    }
    throw err;
  }
}

async function ensureFolderByName(drive, name, parentId) {
  const safeName = sanitizeDriveName(name, "Folder");
  const existing = await findFolderByName(drive, name, parentId);
  if (existing) return existing;
  if (!parentId) {
    throw new Error(
      `Root folder "${safeName}" not found. ${buildSharedDriveInstruction(safeName)}`
    );
  }
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
    fields: "files(id,name,size,modifiedTime,webViewLink,driveId)",
    spaces: "drive",
    pageSize: 10,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: "allDrives",
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
      supportsAllDrives: true,
    });
    return updated.data;
  }
  try {
    const created = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: parentId ? [parentId] : undefined,
      },
      media,
      fields: "id,name,size,modifiedTime,webViewLink,driveId",
      supportsAllDrives: true,
    });
    return created.data;
  } catch (err) {
    if (isStorageQuotaError(err)) {
      throw new Error(buildSharedDriveInstruction());
    }
    throw err;
  }
}

async function deleteFileSafe(drive, fileId) {
  const id = String(fileId || "").trim();
  if (!id) return { deleted: false };
  try {
    await drive.files.delete({ fileId: id, supportsAllDrives: true });
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
      supportsAllDrives: true,
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
  normalizeDriveAuthType,
  parseOAuthClient,
  createDriveClientFromSettings,
  buildGoogleOAuthAuthorizeUrl,
  exchangeGoogleOAuthCode,
  ensureFolderPath,
  uploadBufferFile,
  deleteFileSafe,
  getFileMetadataSafe,
  testDriveConnection,
};

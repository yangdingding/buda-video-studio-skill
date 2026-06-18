import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { summarizeConfig } from "../config.mjs";
import { writeJson } from "../common.mjs";
import { buildProjectItem, extensionOf } from "../google-drive-shared.mjs";

const folderMimeType = "application/vnd.google-apps.folder";
const driveFilesEndpoint = "https://www.googleapis.com/drive/v3/files";
const execFileAsync = promisify(execFile);
const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const visionOcrScriptPath = join(skillRoot, "scripts", "ocr_image.swift");

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const readJsonIfExists = async (path) => {
  if (!path || !(await exists(path))) return null;
  return JSON.parse(await readFile(path, "utf8"));
};

const escapeQueryString = (value) => String(value).replace(/'/g, "\\'");

const getAccessToken = async (config) => {
  const drive = config.google_drive || {};

  if (drive.access_token_env && process.env[drive.access_token_env]) {
    return {
      accessToken: process.env[drive.access_token_env],
      source: "access_token_env",
      ready: true,
    };
  }

  const token = await readJsonIfExists(drive.token_path);
  if (token?.access_token) {
    if (token.expires_at && new Date(token.expires_at).getTime() > Date.now() + 60_000) {
      return {
        accessToken: token.access_token,
        source: "token_path",
        ready: true,
      };
    }

    if (token.refresh_token && drive.client_secret_path) {
      const refreshed = await refreshAccessToken({ config, token });
      return {
        accessToken: refreshed.access_token,
        source: "token_path_refreshed",
        ready: true,
      };
    }

    return {
      accessToken: token.access_token,
      source: "token_path",
      ready: true,
    };
  }

  return {
    accessToken: "",
    source: "",
    ready: false,
  };
};

const refreshAccessToken = async ({ config, token }) => {
  const drive = config.google_drive || {};
  const clientJson = await readJsonIfExists(drive.client_secret_path);
  const client = clientJson?.installed || clientJson?.web;
  if (!client?.client_id) {
    throw new Error("OAuth client JSON is missing installed.client_id or web.client_id.");
  }

  const body = new URLSearchParams({
    client_id: client.client_id,
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
  });
  if (client.client_secret) {
    body.set("client_secret", client.client_secret);
  }

  const response = await fetch(client.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${JSON.stringify(json)}`);
  }

  const expiresIn = Number(json.expires_in || 3600);
  const refreshed = {
    ...token,
    ...json,
    refresh_token: json.refresh_token || token.refresh_token,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
  await writeJson(drive.token_path, refreshed);
  return refreshed;
};

const listChildren = async ({ accessToken, folderId }) => {
  const query = `'${escapeQueryString(folderId)}' in parents and trashed = false`;
  const fields =
    "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents)";
  const files = [];
  let pageToken = "";

  do {
    const url = new URL(driveFilesEndpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("fields", fields);
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Drive API list failed (${response.status}): ${body}`);
    }

    const json = await response.json();
    files.push(...(json.files || []));
    pageToken = json.nextPageToken || "";
  } while (pageToken);

  return files;
};

const downloadFileText = async ({ accessToken, fileId, maxChars = 8000 }) => {
  const url = new URL(`${driveFilesEndpoint}/${fileId}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return "";
  }

  const text = await response.text();
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
};

const downloadFileBytes = async ({ accessToken, fileId, maxBytes = 8 * 1024 * 1024 }) => {
  const url = new URL(`${driveFilesEndpoint}/${fileId}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) return null;
  return buffer;
};

const extractCoverText = async ({ accessToken, file }) => {
  try {
    const bytes = await downloadFileBytes({ accessToken, fileId: file.id });
    if (!bytes) return "";
    const dir = await mkdtemp(join(tmpdir(), "buda-cover-ocr-"));
    const imagePath = join(dir, `cover${extname(file.name).toLowerCase() || ".png"}`);
    await writeFile(imagePath, bytes);
    try {
      try {
        const { stdout } = await execFileAsync("swift", [visionOcrScriptPath, imagePath], {
          timeout: 20_000,
          maxBuffer: 1024 * 1024,
        });
        const visionText = String(stdout || "")
          .replace(/[ \t]+/g, " ")
          .trim()
          .slice(0, 600);
        if (visionText) return visionText;
      } catch {
        // Fall back to Tesseract when macOS Vision is unavailable or returns no text.
      }
      const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout", "-l", "eng"], {
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
      return String(stdout || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch {
    return "";
  }
};

const walkDrive = async ({ accessToken, folderId, folderPath = [], maxDepth = 4 }) => {
  if (maxDepth < 0) return [];
  const children = await listChildren({ accessToken, folderId });
  const files = [];

  for (const child of children) {
    if (child.mimeType === folderMimeType) {
      files.push({
        id: child.id,
        name: child.name,
        mime_type: child.mimeType,
        is_folder: true,
        folder_path: folderPath,
        path: [...folderPath, child.name].join("/"),
        web_view_link: child.webViewLink || "",
        created_at: child.createdTime || "",
      });
      files.push(
        ...(await walkDrive({
          accessToken,
          folderId: child.id,
          folderPath: [...folderPath, child.name],
          maxDepth: maxDepth - 1,
        }))
      );
      continue;
    }

    files.push({
      id: child.id,
      name: child.name,
      mime_type: child.mimeType,
      is_folder: false,
      extension: extensionOf(child.name),
      folder_path: folderPath,
      path: [...folderPath, child.name].join("/"),
      web_view_link: child.webViewLink || "",
      created_at: child.createdTime || "",
      modified_at: child.modifiedTime || "",
      size: Number(child.size || 0),
    });
  }

  return files;
};

const buildProjects = (files) => {
  const folders = files.filter((file) => file.is_folder && file.folder_path.length === 0);
  const projects = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    path: folder.path,
  }));

  return projects.map((project) => ({
    project,
    files: files.filter((file) => !file.is_folder && file.folder_path[0] === project.name),
  }));
};

export const createGoogleDriveApiReader = ({ config, path, isExample }) => {
  const drive = config.google_drive || {};

  return {
    name: "google_drive_api",
    async getState() {
      const tokenState = await getAccessToken(config);
      const hasClientSecret = Boolean(drive.client_secret_path && (await exists(drive.client_secret_path)));
      const hasRootFolder = Boolean(drive.root_folder_id && !String(drive.root_folder_id).includes("Google Drive folder id"));
      const onlineReady = hasRootFolder && tokenState.ready;

      const reasons = [
        ...(isExample ? ["Using config.example.yml; create private config with Google Drive OAuth settings."] : []),
        ...(!hasRootFolder ? ["Missing google_drive.root_folder_id for the online Buda Videos folder."] : []),
        ...(!tokenState.ready
          ? [
              hasClientSecret
                ? "OAuth client exists, but no token is configured yet. Run the auth flow to create google-oauth-token.json."
                : "Missing OAuth client JSON or access token for online Google Drive.",
            ]
          : []),
      ];

      return {
        onboarding: {
          required: reasons.length > 0,
          reasons,
        },
        auth: {
          token_source: tokenState.source,
          client_secret_ready: hasClientSecret,
        },
        config_summary: summarizeConfig({ config, path, isExample, rootExists: false, onlineReady }),
      };
    },
    async listVideoItems() {
      const state = await this.getState();
      if (state.onboarding.required) {
        return {
          state,
          items: [],
        };
      }

      const tokenState = await getAccessToken(config);
      const files = await walkDrive({
        accessToken: tokenState.accessToken,
        folderId: drive.root_folder_id,
        maxDepth: Number(drive.max_depth || 4),
      });

      const projects = buildProjects(files);
      const snippets = new Map();
      const coverTexts = new Map();
      const markdownFiles = files.filter((file) => !file.is_folder && file.extension === ".md");
      await Promise.all(
        markdownFiles.map(async (file) => {
          const snippet = await downloadFileText({
            accessToken: tokenState.accessToken,
            fileId: file.id,
          });
          if (snippet) {
            snippets.set(file.id, snippet);
          }
        })
      );
      const coverFiles = files.filter((file) => !file.is_folder && [".png", ".jpg", ".jpeg"].includes(file.extension));
      await Promise.all(
        coverFiles.map(async (file) => {
          const text = await extractCoverText({
            accessToken: tokenState.accessToken,
            file,
          });
          if (text) {
            coverTexts.set(file.id, text);
          }
        })
      );
      const readSnippet = (file) => snippets.get(file.id) || "";
      const readCoverText = (file) => coverTexts.get(file.id) || "";
      const items = projects
        .filter(({ files: projectFiles }) => projectFiles.length > 0)
        .map(({ project, files: projectFiles }, index) =>
          buildProjectItem({
            project,
            files: projectFiles,
            config,
            index,
            readSnippet,
            readCoverText,
          })
        );

      return {
        state,
        items,
      };
    },
  };
};

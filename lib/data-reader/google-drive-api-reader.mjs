import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { summarizeConfig } from "../config.mjs";
import { getAccessToken, readDriveStatus } from "../google-drive-state.mjs";
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

const escapeQueryString = (value) => String(value).replace(/'/g, "\\'");

const driveUserInfo = (user = {}) => ({
  name: user?.displayName || "",
  email: user?.emailAddress || "",
});

const firstDriveUser = (users = []) => driveUserInfo(Array.isArray(users) ? users[0] : null);

const listChildren = async ({ accessToken, folderId }) => {
  const query = `'${escapeQueryString(folderId)}' in parents and trashed = false`;
  const fields =
    "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))";
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

const getUploadUserFromRevisions = async ({ accessToken, fileId }) => {
  const url = new URL(`${driveFilesEndpoint}/${fileId}/revisions`);
  url.searchParams.set("fields", "revisions(id,modifiedTime,lastModifyingUser(displayName,emailAddress))");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("pageSize", "100");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return driveUserInfo();
  const json = await response.json();
  const firstRevision = (json.revisions || [])
    .filter((revision) => revision.modifiedTime)
    .sort((a, b) => new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime())[0];

  return driveUserInfo(firstRevision?.lastModifyingUser);
};

const enrichUploadUsers = async ({ accessToken, files }) => {
  const fileItems = files.filter((file) => !file.is_folder && file.id);
  let cursor = 0;
  const workerCount = 5;

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < fileItems.length) {
      const file = fileItems[cursor];
      cursor += 1;
      const uploadUser = await getUploadUserFromRevisions({ accessToken, fileId: file.id });
      file.created_by_name = uploadUser.name;
      file.created_by_email = uploadUser.email;
      file.uploaded_by_name = uploadUser.name;
      file.uploaded_by_email = uploadUser.email;
    }
  });

  await Promise.all(workers);
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
    const owner = firstDriveUser(child.owners);
    const lastModifiedBy = driveUserInfo(child.lastModifyingUser);

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
        modified_at: child.modifiedTime || "",
        owner_name: owner.name,
        owner_email: owner.email,
        last_modified_by_name: lastModifiedBy.name,
        last_modified_by_email: lastModifiedBy.email,
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
      owner_name: owner.name,
      owner_email: owner.email,
      last_modified_by_name: lastModifiedBy.name,
      last_modified_by_email: lastModifiedBy.email,
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
    created_at: folder.created_at || "",
    modified_at: folder.modified_at || "",
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
      const files = await enrichUploadUsers({
        accessToken: tokenState.accessToken,
        files: await walkDrive({
          accessToken: tokenState.accessToken,
          folderId: drive.root_folder_id,
          maxDepth: Number(drive.max_depth || 4),
        }),
      });
      const driveStatusState = await readDriveStatus({
        config,
        accessToken: tokenState.accessToken,
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
        .map(({ project, files: projectFiles }, index) => {
          const item = buildProjectItem({
            project,
            files: projectFiles,
            config,
            index,
            readSnippet,
            readCoverText,
          });
          const remoteDecision = driveStatusState.status.videos[item.id];
          return remoteDecision
            ? {
                ...item,
                decision: {
                  ...item.decision,
                  ...remoteDecision,
                },
              }
            : item;
        });

      return {
        state: {
          ...state,
          drive_status: {
            file_id: driveStatusState.file?.id || "",
            file_name: driveStatusState.file?.name || drive.status_file_name || "buda-video-status.json",
            ready: Boolean(driveStatusState.ready),
            item_count: Object.keys(driveStatusState.status.videos || {}).length,
          },
        },
        items,
      };
    },
  };
};

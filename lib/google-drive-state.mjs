import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.mjs";
import { writeJson } from "./common.mjs";

const driveFilesEndpoint = "https://www.googleapis.com/drive/v3/files";
const uploadEndpoint = "https://www.googleapis.com/upload/drive/v3/files";
const defaultStatusFileName = "buda-video-status.json";

const escapeQueryString = (value) => String(value).replace(/'/g, "\\'");

const readJsonIfExists = async (path) => {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const getOAuthClient = async (drive) => {
  const clientJson = await readJsonIfExists(drive.client_secret_path);
  const client = clientJson?.installed || clientJson?.web;
  if (!client?.client_id) {
    throw new Error("OAuth client JSON is missing installed.client_id or web.client_id.");
  }
  return client;
};

const refreshAccessToken = async ({ config, token }) => {
  const drive = config.google_drive || {};
  const client = await getOAuthClient(drive);
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
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${JSON.stringify(json)}`);
  }

  const expiresIn = Number(json.expires_in || 3600);
  return {
    ...token,
    ...json,
    refresh_token: json.refresh_token || token.refresh_token,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
};

export const getAccessToken = async (config) => {
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
      if (drive.token_path) {
        await writeJson(drive.token_path, refreshed);
      }
      return {
        accessToken: refreshed.access_token,
        refreshedToken: refreshed,
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

export const defaultDriveStatus = () => ({
  version: 1,
  updated_at: new Date().toISOString(),
  videos: {},
});

export const normalizeDriveStatus = (status) => ({
  ...defaultDriveStatus(),
  ...(status && typeof status === "object" ? status : {}),
  videos: status && typeof status.videos === "object" && !Array.isArray(status.videos) ? status.videos : {},
});

const normalizeDistributionApprovals = (value) => ({
  kelly: Boolean(value?.kelly),
  kelvin: Boolean(value?.kelvin),
});

const normalizeAssetOverrides = (value) => ({
  raw_video: value?.raw_video === "rejected" ? "rejected" : "",
  voiceover: value?.voiceover === "rejected" ? "rejected" : "",
  cover_source: value?.cover_source === "rejected" ? "rejected" : "",
});

const hasDistributionApprovals = (value) =>
  Object.values(normalizeDistributionApprovals(value)).every(Boolean);

export const getStatusFileName = (config) =>
  config.google_drive?.status_file_name || defaultStatusFileName;

const findStatusFile = async ({ accessToken, rootFolderId, fileName }) => {
  const url = new URL(driveFilesEndpoint);
  url.searchParams.set(
    "q",
    `'${escapeQueryString(rootFolderId)}' in parents and name = '${escapeQueryString(fileName)}' and trashed = false`
  );
  url.searchParams.set("fields", "files(id,name,modifiedTime,webViewLink)");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("pageSize", "10");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive status lookup failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  return (json.files || [])[0] || null;
};

const downloadJsonFile = async ({ accessToken, fileId }) => {
  const url = new URL(`${driveFilesEndpoint}/${fileId}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive status download failed (${response.status}): ${body}`);
  }

  return JSON.parse(await response.text());
};

const createJsonFile = async ({ accessToken, rootFolderId, fileName, value }) => {
  const boundary = `buda-video-${Date.now()}`;
  const metadata = {
    name: fileName,
    mimeType: "application/json",
    parents: [rootFolderId],
  };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    `${JSON.stringify(value, null, 2)}\n`,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const url = new URL(uploadEndpoint);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,modifiedTime,webViewLink");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive status create failed (${response.status}): ${text}`);
  }

  return response.json();
};

const updateJsonFile = async ({ accessToken, fileId, value }) => {
  const url = new URL(`${uploadEndpoint}/${fileId}`);
  url.searchParams.set("uploadType", "media");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,modifiedTime,webViewLink");

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
    },
    body: `${JSON.stringify(value, null, 2)}\n`,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive status update failed (${response.status}): ${text}`);
  }

  return response.json();
};

export const readDriveStatus = async ({ config, accessToken }) => {
  const drive = config.google_drive || {};
  const rootFolderId = drive.root_folder_id;
  if (!rootFolderId || !accessToken) {
    return { status: defaultDriveStatus(), file: null, ready: false };
  }

  const fileName = getStatusFileName(config);
  const file = await findStatusFile({ accessToken, rootFolderId, fileName });
  if (!file) {
    return { status: defaultDriveStatus(), file: null, ready: true };
  }

  const status = normalizeDriveStatus(await downloadJsonFile({ accessToken, fileId: file.id }));
  return { status, file, ready: true };
};

export const writeDriveStatus = async ({ config, accessToken, status }) => {
  const drive = config.google_drive || {};
  const rootFolderId = drive.root_folder_id;
  if (!rootFolderId || !accessToken) {
    throw new Error("Missing Google Drive root folder id or access token.");
  }

  const fileName = getStatusFileName(config);
  const normalized = normalizeDriveStatus({
    ...status,
    updated_at: new Date().toISOString(),
  });
  const file = await findStatusFile({ accessToken, rootFolderId, fileName });
  const savedFile = file
    ? await updateJsonFile({ accessToken, fileId: file.id, value: normalized })
    : await createJsonFile({ accessToken, rootFolderId, fileName, value: normalized });

  return { status: normalized, file: savedFile };
};

export const loadDriveStatusContext = async () => {
  const loadedConfig = await loadConfig();
  const tokenState = await getAccessToken(loadedConfig.config);
  return {
    loadedConfig,
    tokenState,
  };
};

export const decisionToStatusEntry = (decision) => ({
  action: decision.action || "",
  comment: decision.comment || "",
  topic_decision: decision.topic_decision || "",
  topic_priority: decision.topic_priority || "",
  owner: decision.owner || "",
  due_date: decision.due_date || "",
  recording_status: decision.recording_status || "",
  cover_title: decision.cover_title || "",
  cover_subtitle: decision.cover_subtitle || "",
  cover_zh_title: decision.cover_zh_title || decision.cover_title || "",
  cover_zh_subtitle: decision.cover_zh_subtitle || decision.cover_subtitle || "",
  cover_en_title: decision.cover_en_title || "",
  cover_en_subtitle: decision.cover_en_subtitle || "",
  outputs: Array.isArray(decision.outputs) ? decision.outputs : [],
  asset_overrides: normalizeAssetOverrides(decision.asset_overrides),
  published_links:
    decision.published_links && typeof decision.published_links === "object" && !Array.isArray(decision.published_links)
      ? decision.published_links
      : {},
  workflow_step: decision.workflow_step || "",
  distribution_approvals: normalizeDistributionApprovals(decision.distribution_approvals),
  workflow_done: Boolean(decision.workflow_done && hasDistributionApprovals(decision.distribution_approvals)),
  decided_at: decision.decided_at || new Date().toISOString(),
});

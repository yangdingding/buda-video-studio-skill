import { loadConfig } from "../../lib/config.mjs";
import { getAccessToken } from "../../lib/google-drive-state.mjs";

const driveFilesEndpoint = "https://www.googleapis.com/drive/v3/files";

const safeFileName = (name) =>
  String(name || "download")
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .trim() || "download";

const getDriveFile = async ({ accessToken, fileId }) => {
  const url = new URL(`${driveFilesEndpoint}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,mimeType,size");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;
  return response.json();
};

export const serveDownload = async ({ fileId, response }) => {
  const loadedConfig = await loadConfig();
  const tokenState = await getAccessToken(loadedConfig.config);
  if (!tokenState.ready) {
    response.writeHead(404, { "cache-control": "no-store" });
    response.end();
    return;
  }

  const file = await getDriveFile({ accessToken: tokenState.accessToken, fileId });
  const mediaUrl = new URL(`${driveFilesEndpoint}/${encodeURIComponent(fileId)}`);
  mediaUrl.searchParams.set("alt", "media");
  mediaUrl.searchParams.set("supportsAllDrives", "true");

  const mediaResponse = await fetch(mediaUrl, {
    headers: { authorization: `Bearer ${tokenState.accessToken}` },
  });

  if (!mediaResponse.ok) {
    response.writeHead(mediaResponse.status, { "cache-control": "no-store" });
    response.end(await mediaResponse.text().catch(() => ""));
    return;
  }

  const headers = {
    "cache-control": "no-store",
    "content-type": mediaResponse.headers.get("content-type") || file?.mimeType || "application/octet-stream",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(file?.name))}`,
  };
  const contentLength = mediaResponse.headers.get("content-length") || file?.size;
  if (contentLength) headers["content-length"] = String(contentLength);

  response.writeHead(200, headers);
  if (mediaResponse.body) {
    for await (const chunk of mediaResponse.body) {
      response.write(chunk);
    }
  }
  response.end();
};

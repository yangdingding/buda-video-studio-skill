import { loadConfig } from "../../lib/config.mjs";
import { getAccessToken } from "../../lib/google-drive-state.mjs";

const driveFilesEndpoint = "https://www.googleapis.com/drive/v3/files";

const driveThumbnailUrl = (fileId) =>
  `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w640-h360`;

const getDriveFile = async ({ accessToken, fileId }) => {
  const url = new URL(`${driveFilesEndpoint}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,mimeType,thumbnailLink");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  return response.json();
};

const fetchImage = async ({ accessToken, url }) => {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;
  return {
    contentType,
    bytes: Buffer.from(await response.arrayBuffer()),
  };
};

const fetchMediaImage = async ({ accessToken, fileId }) => {
  const url = new URL(`${driveFilesEndpoint}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  return fetchImage({ accessToken, url });
};

export const serveThumbnail = async ({ fileId, response }) => {
  const loadedConfig = await loadConfig();
  const tokenState = await getAccessToken(loadedConfig.config);
  if (!tokenState.ready) {
    response.writeHead(404, { "cache-control": "no-store" });
    response.end();
    return;
  }

  const file = await getDriveFile({ accessToken: tokenState.accessToken, fileId });
  const image =
    (file?.thumbnailLink && (await fetchImage({ accessToken: tokenState.accessToken, url: file.thumbnailLink }))) ||
    (await fetchImage({ accessToken: tokenState.accessToken, url: driveThumbnailUrl(fileId) })) ||
    (file?.mimeType?.startsWith("image/")
      ? await fetchMediaImage({ accessToken: tokenState.accessToken, fileId })
      : null);

  if (!image) {
    response.writeHead(404, { "cache-control": "no-store" });
    response.end();
    return;
  }

  response.writeHead(200, {
    "content-type": image.contentType,
    "cache-control": "public, max-age=3600",
  });
  response.end(image.bytes);
};

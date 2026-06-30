import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { appJsPath, indexPath, stylesPath } from "./paths.mjs";
import { readBody, sendJson } from "./json.mjs";
import { saveDecision } from "./decisions.mjs";
import { getState } from "./state.mjs";
import { generateBatch } from "../../scripts/generate_batch.mjs";
import { serveDownload } from "./downloads.mjs";
import { serveThumbnail } from "./thumbnails.mjs";

const staticFiles = {
  "/": indexPath,
  "/index.html": indexPath,
  "/app.js": appJsPath,
  "/styles.css": stylesPath,
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const serveStatic = async (request, response, path) => {
  const filePath = staticFiles[path];
  if (!filePath) return false;

  await stat(filePath);
  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
  return true;
};

export const handleRequest = async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { app: "buda-video-studio", ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/state") {
      sendJson(response, 200, await getState());
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/thumbnail/")) {
      const fileId = decodeURIComponent(url.pathname.replace("/api/thumbnail/", ""));
      await serveThumbnail({ fileId, response });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/download/")) {
      const fileId = decodeURIComponent(url.pathname.replace("/api/download/", ""));
      await serveDownload({ fileId, response });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/decision") {
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, { decision: await saveDecision(payload) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sync") {
      const generated = await generateBatch();
      sendJson(response, 200, {
        ok: true,
        batch_id: generated.batch.batch_id,
        generated_at: generated.batch.generated_at,
        item_count: generated.itemCount,
        onboarding: generated.state.onboarding,
      });
      return;
    }

    if (request.method === "GET" && (await serveStatic(request, response, url.pathname))) {
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.message || "Server error",
      lock: error.lock || null,
    });
  }
};

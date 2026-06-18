#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const startPort = Number(process.env.BUDA_VIDEO_STUDIO_UI_PORT || 3000);
const maxPort = 4000;
const serverPath = join(dirname(fileURLToPath(import.meta.url)), "index.mjs");

const checkHealth = async (port) => {
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, { signal: AbortSignal.timeout(400) });
    const json = await response.json();
    return json.app === "buda-video-studio";
  } catch {
    return false;
  }
};

const canListen = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });

let selectedPort = null;
let reuse = false;

for (let port = startPort; port <= maxPort; port += 1) {
  if (await checkHealth(port)) {
    selectedPort = port;
    reuse = true;
    break;
  }
  if (await canListen(port)) {
    selectedPort = port;
    break;
  }
}

if (!selectedPort) {
  console.error("No available port in 3000-4000.");
  process.exit(1);
}

if (reuse) {
  process.stdout.write(`Buda Video Studio already running at http://${host}:${selectedPort}\n`);
  process.exit(0);
}

const child = spawn(process.execPath, [serverPath], {
  detached: true,
  stdio: "ignore",
  env: {
    ...process.env,
    BUDA_VIDEO_STUDIO_UI_PORT: String(selectedPort),
  },
});
child.unref();

process.stdout.write(`Buda Video Studio running at http://${host}:${selectedPort}\n`);

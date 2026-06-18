import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const serverDir = dirname(fileURLToPath(import.meta.url));
export const appDir = dirname(serverDir);
export const skillRoot = dirname(appDir);
export const cacheDir = join(appDir, ".cache");
export const currentBatchPath = join(cacheDir, "current_batch.json");
export const decisionsPath = join(cacheDir, "decisions.json");
export const executionReportPath = join(cacheDir, "execution_report.json");
export const lockPath = join(cacheDir, "agent.lock");
export const indexPath = join(appDir, "index.html");
export const appJsPath = join(appDir, "app.js");
export const stylesPath = join(appDir, "styles.css");

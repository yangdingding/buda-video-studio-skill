import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const appDir = join(skillRoot, "app");
export const cacheDir = join(appDir, ".cache");
export const currentBatchPath = join(cacheDir, "current_batch.json");
export const decisionsPath = join(cacheDir, "decisions.json");
export const executionReportPath = join(cacheDir, "execution_report.json");
export const lockPath = join(cacheDir, "agent.lock");
export const briefsDir = join(cacheDir, "briefs");
export const productionDir = join(cacheDir, "production");
export const deliveryDir = join(cacheDir, "delivery");
export const distributionDir = join(cacheDir, "distribution");
export const configExamplePath = join(skillRoot, "config.example.yml");
export const configLocalPath = join(skillRoot, "config.local.yml");

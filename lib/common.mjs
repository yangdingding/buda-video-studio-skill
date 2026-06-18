import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cacheDir, lockPath } from "./paths.mjs";

export const readJson = async (path, fallback = null) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
};

export const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const ensureCache = async () => {
  await mkdir(cacheDir, { recursive: true });
};

export const createLock = async (message) => {
  await ensureCache();
  await writeJson(lockPath, {
    owner: "buda-video-studio",
    message,
    started_at: new Date().toISOString(),
  });
};

export const removeLock = async () => {
  await rm(lockPath, { force: true });
};

export const withLock = async (message, fn) => {
  await createLock(message);
  try {
    return await fn();
  } finally {
    await removeLock();
  }
};

export const slugify = (value) =>
  String(value || "untitled")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80) || "untitled";

export const stableId = (value) => {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).padStart(6, "0");
};

export const safeArray = (value) => (Array.isArray(value) ? value : []);

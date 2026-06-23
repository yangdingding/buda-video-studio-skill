import { lockPath } from "./paths.mjs";
import { readJson } from "./json.mjs";
import { rm } from "node:fs/promises";

const staleLockMs = 10 * 60 * 1000;

const lockStartedAt = (lock) => {
  const timestamp = lock?.started_at || lock?.created_at || "";
  const time = new Date(timestamp).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const readLock = async () => {
  const lock = await readJson(lockPath, null);
  if (!lock) return null;

  const startedAt = lockStartedAt(lock);
  if (startedAt && Date.now() - startedAt > staleLockMs) {
    await rm(lockPath, { force: true });
    return null;
  }

  return lock;
};

export const ensureUnlocked = async () => {
  const lock = await readLock();
  if (lock) {
    const error = new Error("Agent is currently writing or executing. UI is read-only.");
    error.statusCode = 423;
    error.lock = lock;
    throw error;
  }
};

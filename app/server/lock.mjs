import { lockPath } from "./paths.mjs";
import { readJson } from "./json.mjs";

export const readLock = async () => readJson(lockPath, null);

export const ensureUnlocked = async () => {
  const lock = await readLock();
  if (lock) {
    const error = new Error("Agent is currently writing or executing. UI is read-only.");
    error.statusCode = 423;
    error.lock = lock;
    throw error;
  }
};

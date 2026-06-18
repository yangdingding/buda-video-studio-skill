#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const blockedPatterns = [
  /(^|\/)app\/\.cache(\/|$)/,
  /(^|\/)config\.local\.ya?ml$/,
  /(^|\/).*\.local\.ya?ml$/,
  /(^|\/)\.env(\.local)?$/,
  /token/i,
  /secret/i,
  /credential/i,
];

const allowedSecretNamedFiles = new Set(["scripts/auth_google_drive.mjs"]);

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

const files = await walk(root);
const offenders = [];

for (const file of files) {
  const rel = relative(root, file);
  if (allowedSecretNamedFiles.has(rel)) continue;
  if (blockedPatterns.some((pattern) => pattern.test(rel))) {
    offenders.push(rel);
    continue;
  }
  const info = await stat(file);
  if (info.size > 2 * 1024 * 1024) {
    offenders.push(`${rel} (${info.size} bytes)`);
  }
}

if (offenders.length > 0) {
  console.error("Release check failed. Remove or ignore these files:");
  for (const offender of offenders) {
    console.error(`- ${offender}`);
  }
  process.exit(1);
}

console.log(`Release check OK. ${files.length} file(s) scanned.`);

import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { configExamplePath, configLocalPath } from "./paths.mjs";
import { normalizeDistributionChannels } from "./google-drive-shared.mjs";

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const parseScalar = (value) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  return trimmed;
};

const setNested = (target, path, value) => {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
};

export const parseSimpleYaml = (text) => {
  const root = {};
  const stack = [{ indent: -1, path: [], value: root }];
  const lines = text.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;

    const indent = withoutComment.match(/^\s*/)[0].length;
    const line = withoutComment.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    if (line.startsWith("- ")) {
      const item = parseScalar(line.slice(2));
      if (!Array.isArray(parent.value)) {
        const key = parent.path[parent.path.length - 1];
        const grand = stack[stack.length - 2]?.value;
        if (grand && key) {
          grand[key] = [];
          parent.value = grand[key];
        }
      }
      parent.value.push(item);
      continue;
    }

    const match = line.match(/^([^:]+):(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const rest = match[2].trim();
    if (rest) {
      setNested(root, [...parent.path, key], parseScalar(rest));
      continue;
    }

    const nextLine = lines
      .slice(lineIndex + 1)
      .find((candidate) => candidate.trim() && !candidate.trim().startsWith("#"));
    const value = nextLine && nextLine.trim().startsWith("- ") ? [] : {};
    setNested(root, [...parent.path, key], value);
    stack.push({ indent, path: [...parent.path, key], value });
  }

  return root;
};

export const discoverConfigPath = async () => {
  const candidates = [
    process.env.BUDA_VIDEO_STUDIO_CONFIG,
    configLocalPath,
    join(homedir(), ".config", "buda-video-studio", "config.yml"),
    configExamplePath,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  return configExamplePath;
};

export const loadConfig = async () => {
  const path = await discoverConfigPath();
  const text = await readFile(path, "utf8");
  const config = parseSimpleYaml(text);
  const isExample = path === configExamplePath;

  return {
    config,
    path,
    isExample,
  };
};

export const summarizeConfig = ({ config, path, isExample, rootExists, onlineReady = false }) => ({
  data_reader: config.data_reader || "google_drive_api",
  config_path: path,
  uses_example_config: isExample,
  google_drive: {
    mode: config.google_drive?.mode || "api",
    auth_mode: config.google_drive?.auth_mode || "device",
    root_folder_id_configured: Boolean(config.google_drive?.root_folder_id),
    online_ready: Boolean(onlineReady),
    client_secret_configured: Boolean(config.google_drive?.client_secret_path),
    token_path_configured: Boolean(config.google_drive?.token_path),
    access_token_env_configured: Boolean(config.google_drive?.access_token_env),
    access_token_env_ready: Boolean(config.google_drive?.access_token_env && process.env[config.google_drive.access_token_env]),
    root_path_configured: Boolean(config.google_drive?.root_path),
    root_path_exists: Boolean(rootExists),
  },
  folders: config.video_library?.folders || {},
  channels: normalizeDistributionChannels(config.channels),
  style: config.style || {},
});

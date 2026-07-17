import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { stableId } from "./common.mjs";
import { getAccessToken } from "./google-drive-state.mjs";
import {
  buildDistributionCopy,
  contentTitleFromName,
  displayIdFromName,
  filenameFromName,
  normalizeDistributionChannels,
  outputForChannel,
  parseScriptDocument,
} from "./google-drive-shared.mjs";
import { cacheDir } from "./paths.mjs";

const driveFilesEndpoint = "https://www.googleapis.com/drive/v3/files";
const execFileAsync = promisify(execFile);

const defaultTopicCsvCandidates = [
  process.env.BUDA_VIDEO_TOPICS_CSV,
  join(cacheDir, "topics.csv"),
  "/agent/选题表/topics.csv",
  join(homedir(), "选题表", "topics.csv"),
].filter(Boolean);

const googleSheetMimeType = "application/vnd.google-apps.spreadsheet";
const googleDocMimeType = "application/vnd.google-apps.document";

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

export const defaultTopicCsvPath = join(cacheDir, "topics.csv");

export const firstExistingPath = async (candidates) => {
  for (const candidate of candidates) {
    if (candidate && (await exists(candidate))) return candidate;
  }
  return "";
};

export const parseCsvLine = (line) => {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
};

export const parseCsv = (text) => {
  const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!source.trim()) return [];

  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
      continue;
    }
    if (char === "\n" && !quoted) {
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
};

export const formatCsvValue = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const formatCsv = (rows, headers) => {
  const allHeaders = headers?.length ? headers : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `${allHeaders.map(formatCsvValue).join(",")}\n${rows
    .map((row) => allHeaders.map((header) => formatCsvValue(row[header] || "")).join(","))
    .join("\n")}\n`;
};

const normalizeFieldKey = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .toLowerCase();

export const getField = (row, keys) => {
  for (const key of keys) {
    if (row[key]) return String(row[key]).trim();
  }
  const normalizedKeys = new Set(keys.map(normalizeFieldKey));
  for (const [key, value] of Object.entries(row)) {
    if (value && normalizedKeys.has(normalizeFieldKey(key))) return String(value).trim();
  }
  return "";
};

const topicTitleKeys = ["topic", "title", "标题", "选题", "主题"];
const topicDescriptionKeys = [
  "description",
  "desc",
  "summary",
  "brief",
  "body",
  "content",
  "context",
  "note",
  "notes",
  "备注",
  "说明",
  "描述",
  "简介",
  "摘要",
  "内容",
  "正文",
  "背景",
  "选题描述",
  "选题说明",
  "内容简介",
  "内容摘要",
  "补充说明",
  "补充角度",
  "拍摄说明",
  "录制说明",
  "录制要求",
  "视频描述",
  "需求",
];
const topicDirectionKeys = [
  "topic_direction",
  "direction",
  "angle",
  "方向",
  "角度",
  "建议方向",
  "选题方向",
  "内容方向",
  "拍摄方向",
  "录制方向",
];
const targetAudienceKeys = ["target_audience", "audience", "icp", "目标受众", "受众", "用户", "人群", "目标用户"];
const topicSourceKeys = ["source", "来源"];
const topicStatusKeys = ["status", "状态"];
const topicOwnerKeys = ["owner", "负责人"];
const topicDueDateKeys = ["due_date", "dueDate", "交付时间", "截止时间"];
const topicPriorityKeys = ["priority", "优先级"];
const topicIdKeys = ["id", "ID"];
const topicScriptKeys = ["script", "script_text", "storyboard", "storyboard_text", "剧本", "脚本", "分镜", "分镜脚本", "口播稿"];
const defaultMarkdownPatterns = ["apps/*/content/video-ideas/*.md", "apps/*/content/influencer/thread-kit/*.md"];
const hostedDefaultTopicRepositoryPaths = ["/agent/buda/works/vikadata-kapps"];

const asList = (value) => {
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  if (!value || typeof value === "object") return [];
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const stripQuotes = (value) =>
  String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "");

const cleanMarkdownInline = (value) =>
  stripQuotes(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const markdownSectionBody = (text, headingPattern) => {
  const lines = String(text || "").split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) return "";
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s{0,3}#{1,4}\s+/.test(line) && body.some((entry) => entry.trim())) break;
    body.push(line);
  }
  return body.join("\n").trim();
};

const firstParagraph = (text) =>
  String(text || "")
    .split(/\n\s*\n/)
    .map(cleanMarkdownInline)
    .find(Boolean) || "";

const parseMarkdownFrontmatter = (text) => {
  const source = String(text || "").replace(/^\uFEFF/, "");
  if (!source.startsWith("---\n")) return { attributes: {}, body: source };
  const end = source.indexOf("\n---", 4);
  if (end < 0) return { attributes: {}, body: source };
  const frontmatter = source.slice(4, end).trim();
  const attributes = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) attributes[match[1].trim()] = stripQuotes(match[2]);
  }
  return { attributes, body: source.slice(end + 4).replace(/^\s+/, "") };
};

const titleFromMarkdown = ({ attributes, body, path }) => {
  const heading = body.match(/^\s{0,3}#\s+(.+)$/m)?.[1];
  const raw = attributes.title || heading || path.split("/").pop()?.replace(/\.md$/i, "") || "视频选题";
  return cleanMarkdownInline(raw)
    .replace(/^视频\s*Idea\s*\d*\s*[：:]\s*/i, "")
    .replace(/^Idea\s*\d*\s*[：:]\s*/i, "")
    .trim();
};

const globToRegExp = (pattern) =>
  new RegExp(
    `^${String(pattern || "")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\u0000")
      .replace(/\*/g, "[^/]*")
      .replace(/\u0000/g, ".*")}$`
  );

const git = async (repoPath, args) => {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
};

const repositoryPathsForConfig = (config = {}) => {
  const topicSources = config.topic_sources || {};
  const configuredPaths = [
    ...asList(process.env.BUDA_VIDEO_TOPIC_REPO_PATHS),
    ...asList(topicSources.repository_paths || topicSources.repository_path),
  ];
  return configuredPaths.length ? configuredPaths : hostedDefaultTopicRepositoryPaths;
};

const repositoryTopicRows = async (config = {}) => {
  const topicSources = config.topic_sources || {};
  const repositoryPaths = repositoryPathsForConfig(config);

  const refs = asList(process.env.BUDA_VIDEO_TOPIC_REPO_REFS || topicSources.repository_refs || topicSources.repository_ref || "origin/develop");
  const patterns = asList(process.env.BUDA_VIDEO_TOPIC_MARKDOWN_PATTERNS || topicSources.markdown_patterns);
  const effectivePatterns = patterns.length ? patterns : defaultMarkdownPatterns;
  const patternRegexps = effectivePatterns.map(globToRegExp);
  const shouldFetch = topicSources.repository_fetch !== false;
  const rows = [];

  for (const repoPath of repositoryPaths) {
    if (!(await exists(repoPath))) continue;
    if (shouldFetch) {
      try {
        await git(repoPath, ["fetch", "--all", "--prune"]);
      } catch {
        // A stale remote ref is still better than hiding already available scripts.
      }
    }

    for (const ref of refs) {
      let files = [];
      try {
        files = (await git(repoPath, ["ls-tree", "-r", "--name-only", ref]))
          .split(/\r?\n/)
          .filter((path) => path && !/\/index\.md$/i.test(path) && patternRegexps.some((regexp) => regexp.test(path)));
      } catch {
        continue;
      }

      for (const path of files) {
        let rawText = "";
        try {
          rawText = await git(repoPath, ["show", `${ref}:${path}`]);
        } catch {
          continue;
        }
        const { attributes, body } = parseMarkdownFrontmatter(rawText);
        const title = titleFromMarkdown({ attributes, body, path });
        const description = firstParagraph(markdownSectionBody(body, /^#{1,4}\s+一句话主题\b/)) || firstParagraph(body);
        rows.push({
          id: attributes.video_slug || attributes.slug || path.replace(/\.md$/i, ""),
          topic: title,
          status: attributes.status || "待确认",
          priority: attributes.priority || "P1",
          source: "kapps video-ideas",
          note: description,
          topic_direction: "Buda product/GTM video",
          script: rawText,
          script_name: path.split("/").pop() || "script.md",
          __source_path: `${ref}:${path}`,
          __source_label: `${ref}:${path}`,
        });
      }
    }
  }

  return rows;
};

const mergeTopicRows = (primaryRows, repositoryRows, { includeRepositoryTopics = false } = {}) => {
  const rowsByIdentity = new Map();
  for (const row of primaryRows) {
    const identity = getField(row, topicIdKeys) || getField(row, topicTitleKeys);
    if (!identity) continue;
    const key = identity.trim().toLowerCase();
    rowsByIdentity.set(key, row);
  }

  for (const scriptRow of repositoryRows) {
    const identity = getField(scriptRow, topicIdKeys) || getField(scriptRow, topicTitleKeys);
    if (!identity) continue;
    const key = identity.trim().toLowerCase();
    const primaryRow = rowsByIdentity.get(key);
    if (!primaryRow) {
      if (includeRepositoryTopics) rowsByIdentity.set(key, scriptRow);
      continue;
    }
    rowsByIdentity.set(key, {
      ...scriptRow,
      ...primaryRow,
      script: scriptRow.script || primaryRow.script || "",
      script_name: scriptRow.script_name || primaryRow.script_name || "",
      __source_path: scriptRow.__source_path || primaryRow.__source_path || "",
      __source_label: scriptRow.__source_label || primaryRow.__source_label || "",
    });
  }
  return [...rowsByIdentity.values()];
};

const topicSourceDriveFileId = (topicSources = {}) => {
  if (topicSources.drive_file_id) return topicSources.drive_file_id;
  const url = topicSources.drive_file_url || topicSources.file_url || "";
  return (
    String(url).match(/\/d\/([^/]+)/)?.[1] ||
    String(url).match(/[?&]id=([^&]+)/)?.[1] ||
    ""
  );
};

const topicSourceBudaFilePath = (topicSources = {}) => {
  if (topicSources.buda_file_path) return topicSources.buda_file_path;
  const url = topicSources.buda_drive_url || topicSources.buda_url || "";
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const file = parsed.searchParams.get("file");
    if (!file) return "";
    return file.startsWith("/") ? file : join("/agent", file);
  } catch {
    return "";
  }
};

const fetchDriveText = async ({ config, fileId }) => {
  const tokenState = await getAccessToken(config);
  if (!tokenState.ready) {
    throw new Error("Topic Drive file is configured, but Google Drive OAuth is not ready.");
  }

  const metadataUrl = new URL(`${driveFilesEndpoint}/${fileId}`);
  metadataUrl.searchParams.set("fields", "id,name,mimeType,webViewLink");
  metadataUrl.searchParams.set("supportsAllDrives", "true");
  const metadataResponse = await fetch(metadataUrl, {
    headers: { authorization: `Bearer ${tokenState.accessToken}` },
  });
  if (!metadataResponse.ok) {
    throw new Error(`Topic Drive file metadata failed (${metadataResponse.status}): ${await metadataResponse.text()}`);
  }
  const metadata = await metadataResponse.json();

  const isGoogleSheet = metadata.mimeType === googleSheetMimeType;
  const isGoogleDoc = metadata.mimeType === googleDocMimeType;
  const url = isGoogleSheet
    ? new URL(`${driveFilesEndpoint}/${fileId}/export`)
    : isGoogleDoc
      ? new URL(`${driveFilesEndpoint}/${fileId}/export`)
      : new URL(`${driveFilesEndpoint}/${fileId}`);
  if (isGoogleSheet) url.searchParams.set("mimeType", "text/csv");
  else if (isGoogleDoc) url.searchParams.set("mimeType", "text/plain");
  else {
    url.searchParams.set("alt", "media");
    url.searchParams.set("supportsAllDrives", "true");
  }

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${tokenState.accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Topic Drive file download failed (${response.status}): ${await response.text()}`);
  }

  return {
    text: await response.text(),
    sourceLabel: metadata.name || fileId,
    sourcePath: metadata.webViewLink || `drive:${fileId}`,
  };
};

const readTopicSourceRows = async (config = {}) => {
  const topicSources = config.topic_sources || {};
  const shouldReadRepository =
    topicSources.repository_enrichment === true ||
    topicSources.include_repository_topics === true ||
    topicSources.repository_only === true;
  const repositoryRows = shouldReadRepository ? await repositoryTopicRows(config) : [];
  const includeRepositoryTopics = topicSources.include_repository_topics === true;
  if (topicSources.repository_only === true && repositoryRows.length > 0) {
    return {
      rows: mergeTopicRows([], repositoryRows, { includeRepositoryTopics: true }),
      sourcePath: "repository-topic-source",
      sourceLabel: "Repository Thread Kit",
      available: true,
    };
  }
  const fileId = topicSourceDriveFileId(topicSources);
  if (fileId) {
    const { text, sourceLabel, sourcePath } = await fetchDriveText({ config, fileId });
    return {
      rows: mergeTopicRows(parseCsv(text).filter((row) => getField(row, topicTitleKeys)), repositoryRows, { includeRepositoryTopics }),
      sourcePath,
      sourceLabel,
      available: true,
    };
  }

  const budaFilePath = topicSourceBudaFilePath(topicSources);
  if (budaFilePath && (await exists(budaFilePath))) {
    return {
      rows: mergeTopicRows(parseCsv(await readFile(budaFilePath, "utf8")).filter((row) => getField(row, topicTitleKeys)), repositoryRows, { includeRepositoryTopics }),
      sourcePath: budaFilePath,
      sourceLabel: budaFilePath,
      available: true,
    };
  }

  const csvPath = topicSources.csv_path || (await firstExistingPath(defaultTopicCsvCandidates));
  if (!csvPath || !(await exists(csvPath))) {
    return {
      rows: mergeTopicRows([], repositoryRows, { includeRepositoryTopics }),
      sourcePath: "",
      sourceLabel: "",
      available: repositoryRows.length > 0,
    };
  }

  return {
    rows: mergeTopicRows(parseCsv(await readFile(csvPath, "utf8")).filter((row) => getField(row, topicTitleKeys)), repositoryRows, { includeRepositoryTopics }),
    sourcePath: csvPath,
    sourceLabel: csvPath,
    available: true,
  };
};

const normalizeTopicStatus = (value) => String(value || "").replace(/\s+/g, "").trim();

const scriptIsUndecided = (text, status) =>
  ["open", "blocked", "tbd", "未定", "阻塞"].includes(String(status || "").trim().toLowerCase()) ||
  /intentionally\s+no\s+storyboard|not\s+decided|don't\s+invent|feature\s+itself\s+isn't\s+decided|未定题|没有分镜|不要编造/.test(
    String(text || "").toLowerCase()
  );

const decisionForStatus = ({ status, owner, dueDate }) => {
  const normalized = normalizeTopicStatus(status);
  if (["待分配录制", "待分配", "已确认", "确认录制"].includes(normalized)) {
    return {
      workflow_step: "topic_selected",
      recording_status: "未分配",
    };
  }
  if (["待录制", "已分配", "录制中"].includes(normalized)) {
    return {
      workflow_step: "assigned_recording",
      recording_status: normalized === "录制中" ? "录制中" : "已分配",
    };
  }
  if (["跳过", "不做", "放弃"].includes(normalized)) {
    return {
      action: "no_action",
    };
  }
  return {
    workflow_step: "",
    recording_status: "",
  };
};

const buildTopicItem = ({ row, index, config, csvPath, existingDecision }) => {
  const rawTopic = getField(row, topicTitleKeys);
  const topic = contentTitleFromName(rawTopic);
  const source = getField(row, topicSourceKeys) || "选题表";
  const description = getField(row, topicDescriptionKeys);
  const scriptText = getField(row, topicScriptKeys);
  const scriptDocument = scriptText
    ? {
        name: row.script_name || "script.md",
        path: row.__source_path || csvPath || "",
        web_view_link: "",
        ...parseScriptDocument(scriptText),
      }
    : null;
  const scriptDocuments = scriptDocument?.raw_text ? [scriptDocument] : [];
  const hasStoryboard = scriptDocuments.some((document) => Array.isArray(document.tables) && document.tables.some((table) => table.row_count > 0));
  const topicDirection =
    getField(row, topicDirectionKeys) || config.video_rules?.default_topic_direction || "Web Buda 内容转视频";
  const targetAudience =
    getField(row, targetAudienceKeys) ||
    config.video_rules?.default_target_audience ||
    "SaaS founders, indie hackers, and GTM operators";
  const status = getField(row, topicStatusKeys) || "待确认";
  const blockedBySource = scriptIsUndecided(scriptText, status);
  const hasScript = scriptDocuments.length > 0 && hasStoryboard && !blockedBySource;
  const owner = getField(row, topicOwnerKeys);
  const dueDate = getField(row, topicDueDateKeys);
  const priority = getField(row, topicPriorityKeys) || "P1";
  const rowId = getField(row, topicIdKeys) || rawTopic || topic;
  const filename = filenameFromName(rawTopic || rowId);
  const displayId = displayIdFromName(rowId || topic);
  const channels = normalizeDistributionChannels(config.channels);
  const outputs = channels.map(outputForChannel);
  const coverCopy = {
    title: topic.slice(0, 42),
    subtitle: "",
    locales: {
      zh: {
        title: topic.slice(0, 42),
        subtitle: "",
      },
      en: {
        title: "",
        subtitle: "",
      },
    },
    variants: [topic.slice(0, 42)],
    source: "topic_data_source",
    extracted_text: "",
    needs_review: true,
  };
  const statusDecision = decisionForStatus({ status, owner, dueDate });
  const decision = {
    action: "",
    comment: "",
    topic_decision: status,
    topic_priority: priority,
    owner,
    due_date: dueDate,
    recording_status: statusDecision.recording_status || "",
    decided_at: "",
    workflow_step: statusDecision.workflow_step || "",
    ...statusDecision,
    ...existingDecision,
  };

  return {
    id: `topic-${stableId(rowId)}`,
    ref: `Topic #${index + 1}`,
    display_id: displayId,
    filename,
    title: topic,
    summary: description,
    body: scriptText || description,
    category: "topic_data_source",
    risk: ["missing_raw_video", ...(hasScript ? [] : ["missing_voiceover"]), "missing_cover_source"],
    status: blockedBySource ? "blocked" : "needs_review",
    stage: blockedBySource ? "blocked" : "idea",
    proposed_action: blockedBySource ? "block" : "revise",
    reason: "Topic captured from the topic data source.",
    rule: {
      id: "topic_data_source",
      evidence: {
        source_path: row.__source_path || csvPath,
        source,
        status,
        description,
      },
      explanation: blockedBySource ? "Topic source explicitly says the storyboard is not decided." : "Topic captured from the topic data source.",
    },
    required_checks: [
      {
        key: "voiceover",
        label: "脚本/分镜",
        ready: hasScript,
        count: scriptDocuments.length,
        missing_risk: "missing_voiceover",
        hint: hasScript ? "已读取脚本/分镜" : "需要补齐脚本/分镜",
      },
      {
        key: "cover_source",
        label: "封面素材",
        ready: false,
        count: 0,
        missing_risk: "missing_cover_source",
        hint: "需要补齐封面素材",
      },
      {
        key: "raw_video",
        label: "原始视频",
        ready: false,
        count: 0,
        missing_risk: "missing_raw_video",
        hint: "需要录制原始视频",
      },
    ],
    source_assets: [],
    script_documents: scriptDocuments,
    topic_source: source,
    topic_direction: topicDirection,
    target_audience: targetAudience,
    topic_decision: status,
    topic_priority: priority,
    owner,
    due_date: dueDate,
    recording_status: decision.recording_status || "未分配",
    edit_brief: {
      format: "横屏长视频 + 竖屏短切片",
      duration_target: config.video_rules?.default_long_form_duration || "3-5 分钟长版；30-60 秒短版",
      key_beats: ["先展示具体业务场景", "演示 Buda Agent 如何接手流程", "说明人工审核点和交付物", "用一句 CTA 收尾"],
      transcript_ready: false,
      assets_ready: false,
      voiceover_ready: hasScript,
      cover_ready: false,
      final_cover_ready: false,
    },
    cover_copy: coverCopy,
    outputs,
    distribution_copy: buildDistributionCopy({
      title: topic,
      summary: description || topicDirection,
      body: description || topicDirection,
      coverCopy,
      channels: outputs.map((output) => output.channel),
      cta: config.style?.default_cta,
    }),
    decision,
    execution: {
      status: "pending",
      reason: "",
      executed_at: "",
    },
  };
};

export const readTopicDataSourceItems = async ({ config, decisions = {}, existingItems = [] }) => {
  if (config.topic_sources?.enabled === false) return [];
  const { rows, sourcePath } = await readTopicSourceRows(config);
  if (rows.length === 0) return [];

  const existingTitles = new Set(existingItems.map((item) => String(item.title || "").toLowerCase()));
  const items = [];

  for (const row of rows) {
    const topic = getField(row, topicTitleKeys);
    if (existingTitles.has(topic.toLowerCase())) continue;
    const id = `topic-${stableId(getField(row, topicIdKeys) || topic)}`;
    items.push(buildTopicItem({ row, index: items.length, config, csvPath: sourcePath, existingDecision: decisions[id] }));
  }

  return items;
};

export const topicDataSourceAvailable = async (config = {}) => {
  if (config.topic_sources?.enabled === false) return false;
  if (config.topic_sources?.include_repository_topics === true && (await Promise.all(repositoryPathsForConfig(config).map(exists))).some(Boolean)) {
    return true;
  }
  if (topicSourceDriveFileId(config.topic_sources || {})) return true;
  const budaFilePath = topicSourceBudaFilePath(config.topic_sources || {});
  if (budaFilePath) return await exists(budaFilePath);
  const csvPath = config.topic_sources?.csv_path || (await firstExistingPath(defaultTopicCsvCandidates));
  return Boolean(csvPath && (await exists(csvPath)));
};

export const resolveTopicCsvPath = async (config = {}) =>
  topicSourceBudaFilePath(config.topic_sources || {}) ||
  config.topic_sources?.csv_path ||
  (await firstExistingPath(defaultTopicCsvCandidates)) ||
  defaultTopicCsvPath;

export const readTopicRows = async (csvPath) => {
  if (!csvPath || !(await exists(csvPath))) return [];
  return parseCsv(await readFile(csvPath, "utf8")).filter((row) => getField(row, topicTitleKeys));
};

export const writeTopicRows = async (csvPath, rows) => {
  const headers = ["id", "topic", "status", "owner", "due_date", "priority", "source", "note", "script", "script_name", "script_source_path"];
  await mkdir(dirname(csvPath), { recursive: true });
  await writeFile(csvPath, formatCsv(rows, headers), "utf8");
};

export const topicRowId = (row) => getField(row, topicIdKeys) || getField(row, topicTitleKeys);

export const normalizeTopicRow = (row) => ({
  id: getField(row, topicIdKeys) || stableId(getField(row, topicTitleKeys)),
  topic: getField(row, topicTitleKeys),
  status: getField(row, topicStatusKeys) || "待确认",
  owner: getField(row, topicOwnerKeys),
  due_date: getField(row, topicDueDateKeys),
  priority: getField(row, topicPriorityKeys) || "P1",
  source: getField(row, topicSourceKeys) || "选题表",
  note: getField(row, topicDescriptionKeys),
  script: getField(row, topicScriptKeys),
  script_name: String(row.script_name || ""),
  script_source_path: String(row.script_source_path || row.__source_path || ""),
});

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stableId } from "./common.mjs";
import { getAccessToken } from "./google-drive-state.mjs";
import {
  buildDistributionCopy,
  contentTitleFromName,
  displayIdFromName,
  filenameFromName,
  normalizeDistributionChannels,
  outputForChannel,
} from "./google-drive-shared.mjs";
import { cacheDir } from "./paths.mjs";

const driveFilesEndpoint = "https://www.googleapis.com/drive/v3/files";

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
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
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
  const fileId = topicSourceDriveFileId(topicSources);
  if (fileId) {
    const { text, sourceLabel, sourcePath } = await fetchDriveText({ config, fileId });
    return {
      rows: parseCsv(text).filter((row) => getField(row, topicTitleKeys)),
      sourcePath,
      sourceLabel,
      available: true,
    };
  }

  const budaFilePath = topicSourceBudaFilePath(topicSources);
  if (budaFilePath && (await exists(budaFilePath))) {
    return {
      rows: parseCsv(await readFile(budaFilePath, "utf8")).filter((row) => getField(row, topicTitleKeys)),
      sourcePath: budaFilePath,
      sourceLabel: budaFilePath,
      available: true,
    };
  }

  const csvPath = topicSources.csv_path || (await firstExistingPath(defaultTopicCsvCandidates));
  if (!csvPath || !(await exists(csvPath))) {
    return {
      rows: [],
      sourcePath: "",
      sourceLabel: "",
      available: false,
    };
  }

  return {
    rows: parseCsv(await readFile(csvPath, "utf8")).filter((row) => getField(row, topicTitleKeys)),
    sourcePath: csvPath,
    sourceLabel: csvPath,
    available: true,
  };
};

const normalizeTopicStatus = (value) => String(value || "").replace(/\s+/g, "").trim();

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
  const topicDirection =
    getField(row, topicDirectionKeys) || config.video_rules?.default_topic_direction || "Web Buda 内容转视频";
  const targetAudience =
    getField(row, targetAudienceKeys) ||
    config.video_rules?.default_target_audience ||
    "SaaS founders, indie hackers, and GTM operators";
  const status = getField(row, topicStatusKeys) || "待确认";
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
    body: description,
    category: "topic_data_source",
    risk: ["missing_raw_video", "missing_voiceover", "missing_cover_source"],
    status: "needs_review",
    stage: "idea",
    proposed_action: "revise",
    reason: "Topic captured from the topic data source.",
    rule: {
      id: "topic_data_source",
      evidence: {
        csv_path: csvPath,
        source,
        status,
        description,
      },
      explanation: "Topic captured from the topic data source.",
    },
    required_checks: [
      {
        key: "voiceover",
        label: "口播稿",
        ready: false,
        count: 0,
        missing_risk: "missing_voiceover",
        hint: "需要补录口播稿或字幕稿",
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
    script_documents: [],
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
      voiceover_ready: false,
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
  const headers = ["id", "topic", "status", "owner", "due_date", "priority", "source", "note"];
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
});

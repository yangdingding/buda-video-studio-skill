import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { stableId } from "./common.mjs";
import { normalizeDistributionChannels, outputForChannel } from "./google-drive-shared.mjs";

const defaultTopicCsvCandidates = [
  process.env.BUDA_VIDEO_TOPICS_CSV,
  "/agent/选题表/topics.csv",
  join(homedir(), "选题表", "topics.csv"),
].filter(Boolean);

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const firstExistingPath = async (candidates) => {
  for (const candidate of candidates) {
    if (candidate && (await exists(candidate))) return candidate;
  }
  return "";
};

const parseCsvLine = (line) => {
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

const parseCsv = (text) => {
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

const getField = (row, keys) => {
  for (const key of keys) {
    if (row[key]) return String(row[key]).trim();
  }
  return "";
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
  const topic = getField(row, ["topic", "title", "标题", "选题", "主题"]);
  const source = getField(row, ["source", "来源"]) || "选题表";
  const note = getField(row, ["note", "notes", "备注", "说明", "description", "描述"]);
  const status = getField(row, ["status", "状态"]) || "待确认";
  const owner = getField(row, ["owner", "负责人"]);
  const dueDate = getField(row, ["due_date", "dueDate", "交付时间", "截止时间"]);
  const priority = getField(row, ["priority", "优先级"]) || "P1";
  const rowId = getField(row, ["id", "ID"]) || topic;
  const channels = normalizeDistributionChannels(config.channels);
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
    title: topic,
    summary: note || `${source}; 需要确认是否进入录制。`,
    body: note,
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
    topic_source: source,
    topic_direction: "Web Buda 内容转视频",
    target_audience: config.video_rules?.default_target_audience || "SaaS founders, indie hackers, and GTM operators",
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
    cover_copy: {
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
    },
    outputs: channels.map(outputForChannel),
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
  const csvPath = config.topic_sources?.csv_path || (await firstExistingPath(defaultTopicCsvCandidates));
  if (!csvPath || !(await exists(csvPath))) return [];

  const rows = parseCsv(await readFile(csvPath, "utf8")).filter((row) => getField(row, ["topic", "title", "标题", "选题", "主题"]));
  const existingTitles = new Set(existingItems.map((item) => String(item.title || "").toLowerCase()));
  const items = [];

  for (const row of rows) {
    const topic = getField(row, ["topic", "title", "标题", "选题", "主题"]);
    if (existingTitles.has(topic.toLowerCase())) continue;
    const id = `topic-${stableId(getField(row, ["id", "ID"]) || topic)}`;
    items.push(buildTopicItem({ row, index: items.length, config, csvPath, existingDecision: decisions[id] }));
  }

  return items;
};

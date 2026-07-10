import { access, readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { summarizeConfig } from "../config.mjs";
import { stableId } from "../common.mjs";
import { buildDistributionCopy, normalizeDistributionChannels, outputForChannel } from "../google-drive-shared.mjs";

const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const transcriptExtensions = new Set([".srt", ".txt", ".vtt"]);
const docExtensions = new Set([".md", ".txt"]);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const walk = async (root, base = root) => {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath, base)));
    } else if (entry.isFile()) {
      const stats = await stat(absolutePath);
      files.push({
        name: entry.name,
        absolute_path: absolutePath,
        relative_path: relative(base, absolutePath),
        extension: extname(entry.name).toLowerCase(),
        size: stats.size,
        created_at: stats.birthtime.toISOString(),
        modified_at: stats.mtime.toISOString(),
      });
    }
  }
  return files;
};

const readSnippet = async (file, maxChars = 1400) => {
  if (!docExtensions.has(file.extension) && !transcriptExtensions.has(file.extension)) {
    return "";
  }
  try {
    const text = await readFile(file.absolute_path, "utf8");
    return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  } catch {
    return "";
  }
};

const normalizeTitle = (name) =>
  basename(name, extname(name))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const folderPath = (root, folders, key) => join(root, folders[key] || key);

const collectFolder = async (root, folders, key) => {
  const path = folderPath(root, folders, key);
  if (!(await exists(path))) {
    return [];
  }
  return walk(path, path);
};

const buildItem = async ({ sourceKey, file, related, config, index }) => {
  const title = normalizeTitle(file.name);
  const transcript = related.transcripts.find((candidate) =>
    normalizeTitle(candidate.name).toLowerCase().includes(title.toLowerCase()) ||
    title.toLowerCase().includes(normalizeTitle(candidate.name).toLowerCase())
  );
  const cover = related.covers.find((candidate) =>
    normalizeTitle(candidate.name).toLowerCase().includes(title.toLowerCase()) ||
    title.toLowerCase().includes(normalizeTitle(candidate.name).toLowerCase())
  );
  const snippet = await readSnippet(file);
  const transcriptSnippet = transcript ? await readSnippet(transcript) : "";

  const hasVideo = videoExtensions.has(file.extension) || sourceKey === "raw" || sourceKey === "ready_for_edit";
  const hasTranscript = Boolean(transcript);
  const hasCover = Boolean(cover);

  let stage = "idea";
  let status = "needs_review";
  let proposedAction = "revise";
  let reason = "Needs user direction before post-production.";

  if (sourceKey === "published") {
    stage = "published";
    status = "done";
    proposedAction = "no_action";
    reason = "Already in the published folder.";
  } else if (sourceKey === "exports") {
    stage = "distribution_ready";
    status = "to_approve";
    proposedAction = "approve";
    reason = "Exported asset appears ready for distribution planning.";
  } else if (sourceKey === "editing") {
    stage = "editing";
    status = "needs_review";
    proposedAction = "revise";
    reason = "Item is already in editing; confirm current owner and next output.";
  } else if (sourceKey === "ready_for_edit") {
    stage = "ready_for_edit";
    status = "to_approve";
    proposedAction = "approve";
    reason = "Located in the ready-for-edit folder.";
  } else if (hasVideo && hasTranscript) {
    stage = "ready_for_edit";
    status = "to_approve";
    proposedAction = "approve";
    reason = "Raw footage and a likely transcript are available.";
  } else if (hasVideo) {
    stage = "assets_ready";
    status = "needs_review";
    proposedAction = "revise";
    reason = "Raw footage exists, but no matching transcript was found.";
  } else if (sourceKey === "ideas") {
    stage = snippet ? "script_ready" : "idea";
    status = "needs_review";
    proposedAction = "revise";
    reason = snippet ? "Idea/script file exists; confirm whether footage is needed." : "Topic idea needs detail.";
  }

  const channels = normalizeDistributionChannels(config.channels);
  const id = `video-${stableId(`${sourceKey}:${file.relative_path}`)}`;
  const outputs = channels.map(outputForChannel);
  const coverCopy = {
    title: title.length > 42 ? title.slice(0, 42) : title,
    subtitle: "",
    locales: {
      zh: {
        title: title.length > 42 ? title.slice(0, 42) : title,
        subtitle: "",
      },
      en: {
        title: "",
        subtitle: "",
      },
    },
    variants: [
      `${title}：Buda 实战案例`,
      `用 Buda 自动完成 ${title}`,
      `别再手动做 ${title}`,
    ],
    needs_review: !hasCover,
  };

  return {
    id,
    ref: `Video #${index + 1}`,
    title,
    summary: transcriptSnippet || snippet || `${title} from ${sourceKey.replaceAll("_", " ")}.`,
    body: transcriptSnippet || snippet || "",
    category: sourceKey,
    risk: hasCover ? [] : ["cover_copy"],
    status,
    stage,
    proposed_action: proposedAction,
    reason,
    source_assets: [
      {
        type: videoExtensions.has(file.extension) ? "video" : "document",
        name: file.name,
        path: file.relative_path,
        absolute_path: file.absolute_path,
        created_at: file.created_at,
        modified_at: file.modified_at,
        size: file.size,
        owner_name: "",
        owner_email: "",
        created_by_name: "",
        created_by_email: "",
        uploaded_by_name: "",
        uploaded_by_email: "",
        last_modified_by_name: "",
        last_modified_by_email: "",
      },
      ...(transcript
        ? [
            {
              type: "transcript",
              name: transcript.name,
              path: transcript.relative_path,
              absolute_path: transcript.absolute_path,
              created_at: transcript.created_at,
              modified_at: transcript.modified_at,
              size: transcript.size,
              owner_name: "",
              owner_email: "",
              created_by_name: "",
              created_by_email: "",
              uploaded_by_name: "",
              uploaded_by_email: "",
              last_modified_by_name: "",
              last_modified_by_email: "",
            },
          ]
        : []),
      ...(cover
        ? [
            {
              type: "cover",
              name: cover.name,
              path: cover.relative_path,
              absolute_path: cover.absolute_path,
              created_at: cover.created_at,
              modified_at: cover.modified_at,
              size: cover.size,
              owner_name: "",
              owner_email: "",
              created_by_name: "",
              created_by_email: "",
              uploaded_by_name: "",
              uploaded_by_email: "",
              last_modified_by_name: "",
              last_modified_by_email: "",
            },
          ]
        : []),
    ],
    topic_direction: sourceKey === "ideas" ? "Video topic candidate" : "Buda product/GTM video",
    target_audience: "SaaS founders, indie hackers, and GTM operators",
    topic_decision: "待确认",
    topic_priority: "P1",
    owner: "",
    due_date: "",
    recording_status: "未分配",
    edit_brief: {
      format: "横屏长视频 + 竖屏短切片",
      duration_target: stage === "distribution_ready" ? "按已导出视频为准" : "3-5 分钟长版；30-60 秒短版",
      key_beats: [
        "开头直接交代用户痛点或最终结果",
        "展示 Buda 工作流或具体产物",
        "说明这个流程为什么有价值",
        "结尾给出明确行动引导",
      ],
      transcript_ready: hasTranscript,
      assets_ready: hasVideo,
    },
    cover_copy: coverCopy,
    outputs,
    distribution_copy: buildDistributionCopy({
      title,
      summary: transcriptSnippet || snippet,
      body: transcriptSnippet || snippet,
      coverCopy,
      channels: outputs.map((output) => output.channel),
      cta: config.style?.default_cta,
    }),
    decision: {
      action: "",
      comment: "",
      topic_decision: "",
      topic_priority: "",
      owner: "",
      due_date: "",
      recording_status: "",
      decided_at: "",
    },
    execution: {
      status: "pending",
      reason: "",
      executed_at: "",
    },
  };
};

export const createLocalDriveReader = ({ config, path, isExample }) => {
  const rootPath = config.google_drive?.root_path || "";
  const folders = config.video_library?.folders || {};

  return {
    name: "local_drive",
    async getState() {
      const rootExists = Boolean(rootPath) && !isExample && (await exists(rootPath));
      return {
        onboarding: {
          required: isExample || !rootExists,
          reasons: [
            ...(isExample ? ["Using config.example.yml; create config.local.yml with your real Google Drive path."] : []),
            ...(!rootExists ? ["Configured google_drive.root_path does not exist or is not accessible."] : []),
          ],
        },
        config_summary: summarizeConfig({ config, path, isExample, rootExists, onlineReady: false }),
      };
    },
    async listVideoItems() {
      const state = await this.getState();
      if (state.onboarding.required) {
        return {
          state,
          items: [],
        };
      }

      const grouped = {
        ideas: await collectFolder(rootPath, folders, "ideas"),
        raw: await collectFolder(rootPath, folders, "raw"),
        ready_for_edit: await collectFolder(rootPath, folders, "ready_for_edit"),
        editing: await collectFolder(rootPath, folders, "editing"),
        exports: await collectFolder(rootPath, folders, "exports"),
        published: await collectFolder(rootPath, folders, "published"),
        transcripts: await collectFolder(rootPath, folders, "transcripts"),
        covers: await collectFolder(rootPath, folders, "covers"),
      };

      const sourceFiles = [
        ...grouped.ideas.filter((file) => docExtensions.has(file.extension)),
        ...grouped.raw.filter((file) => videoExtensions.has(file.extension)),
        ...grouped.ready_for_edit.filter((file) => videoExtensions.has(file.extension) || docExtensions.has(file.extension)),
        ...grouped.editing.filter((file) => videoExtensions.has(file.extension) || docExtensions.has(file.extension)),
        ...grouped.exports.filter((file) => videoExtensions.has(file.extension)),
        ...grouped.published.filter((file) => videoExtensions.has(file.extension)),
      ];

      const related = {
        transcripts: grouped.transcripts.filter((file) => transcriptExtensions.has(file.extension)),
        covers: grouped.covers.filter((file) => imageExtensions.has(file.extension) || docExtensions.has(file.extension)),
      };

      const items = [];
      for (const [index, file] of sourceFiles.entries()) {
        const sourceKey = Object.entries(grouped)
          .filter(([key]) => !["transcripts", "covers"].includes(key))
          .find(([, files]) => files.some((candidate) => candidate.absolute_path === file.absolute_path))?.[0] || "inbox";
        items.push(await buildItem({ sourceKey, file, related, config, index }));
      }

      return {
        state,
        items,
      };
    },
  };
};

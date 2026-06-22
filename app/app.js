const filters = [
  ["all", "全部"],
  ["topic_board", "选题表"],
  ["assignment", "待分配录制"],
  ["recording", "待录制"],
  ["waiting_upload", "待补齐素材"],
  ["material_review", "待检查素材"],
  ["edit_output", "待剪辑输出"],
  ["editing", "剪辑中"],
  ["cover_generation", "待制作封面"],
  ["distribution_confirm", "待确认分发"],
  ["done", "已完成"],
  ["blocked", "阻塞"],
];

let state = null;
let activeFilter = "all";
let activeId = null;
let detailOpen = false;
let search = "";
let editing = false;

const $ = (selector) => document.querySelector(selector);

const ruleLabels = {
  channel_export_found: "已有渠道导出",
  export_found_missing_required_items: "有导出但必要项不齐",
  raw_plus_direction: "原始视频 + 口播稿",
  raw_without_direction: "有原片，缺方向",
  direction_without_raw: "有口播稿，缺原始视频",
  cover_without_source: "有封面，缺源素材",
  no_source_material: "缺源素材",
};

const assetLabels = {
  raw_video: "原片",
  voiceover: "口播稿",
  script: "口播稿",
  transcript: "字幕文件",
  cover_source: "封面素材",
  cover: "最终封面",
  youtube_export: "YouTube",
  shorts_export: "Shorts",
  video_account_export: "视频号",
};

const evidenceLabels = {
  raw: "原片",
  voiceover: "口播稿",
  script: "口播稿",
  transcript: "字幕文件",
  cover_source: "封面素材",
  cover: "最终封面",
  youtube_export: "YouTube",
  shorts_export: "Shorts",
  video_account_export: "视频号",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const normalizeSavedOutputs = (item, decision) => {
  const validChannels = new Set((item.outputs || []).map((output) => output.channel));
  const selected = new Set();
  const saved = Array.isArray(decision?.outputs) ? decision.outputs : [];

  for (const channel of saved) {
    if (channel === "YouTube") {
      if (validChannels.has("YouTube 中文")) selected.add("YouTube 中文");
      if (validChannels.has("YouTube English")) selected.add("YouTube English");
      continue;
    }
    if (validChannels.has(channel)) selected.add(channel);
  }

  return selected;
};

const stageLabel = (stage) =>
  ({
    idea: "选题",
    script_ready: "待补素材",
    assets_ready: "待补素材",
    ready_for_edit: "后期就绪",
    editing: "剪辑中",
    cover_review: "封面审核",
    render_ready: "可输出",
    distribution_ready: "待分发",
    published: "已发布",
    blocked: "阻塞",
  })[stage] || stage;

const statusLabel = (status) =>
  ({
    needs_review: "待处理",
    to_approve: "待处理",
    approved: "已批准",
    done: "已完成",
    blocked: "阻塞",
  })[status] || status;

const decisionLabel = (action) =>
  ({
    approve: "已批准",
    revise: "要修改",
    block: "已阻塞",
    no_action: "跳过",
  })[action] || "";

const decisionDisplayLabel = (item, decision) => {
  if (decision?.workflow_done) return "已确认";
  return decisionLabel(decision?.action);
};

const topicHintLabel = (item) => {
  const decision = currentDecision(item);
  if (decision.action === "revise") return "补充角度";
  if (decision.action === "block") return "暂缓";
  if (decision.action === "no_action") return "跳过";
  if (decision.workflow_step === "topic_selected") return "可分配录制";
  return "确认是否要拍";
};

const topicTypeLabel = (item) => {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/tutorial|教程|how to|如何/.test(text)) return "教程";
  if (/case|案例|use case|实战/.test(text)) return "案例";
  if (/vs|alternative|对比|替代/.test(text)) return "对比";
  if (/why|为什么|观点|趋势/.test(text)) return "观点";
  return "工作流";
};

const topicSourceLabel = (item) => item.topic_source || "选题表";

const topicPriorityLabel = (item) => currentDecision(item).topic_priority || item.topic_priority || item.priority || "P1";

const assetOwnerName = (asset) =>
  asset.uploaded_by_name ||
  asset.created_by_name ||
  asset.owner_name ||
  asset.uploaded_by_email ||
  asset.created_by_email ||
  asset.owner_email ||
  "";

const inferredProductionOwner = (item) => {
  const priority = {
    raw_video: 0,
    voiceover: 1,
    script: 2,
    cover_source: 3,
    cover: 4,
    transcript: 4,
  };
  return [...(item.source_assets || [])]
    .sort((a, b) => (priority[a.type] ?? 99) - (priority[b.type] ?? 99))
    .map(assetOwnerName)
    .find(Boolean) || "";
};

const productionOwner = (item) => currentDecision(item).owner || item.owner || inferredProductionOwner(item) || "未分配";

const productionDueDate = (item) => {
  const value = currentDecision(item).due_date || item.due_date || "";
  return formatDateTime(value) || value || "";
};

const recordingStatusLabel = (item) => {
  const decision = currentDecision(item);
  return decision.recording_status || item.recording_status || (decision.workflow_step === "assigned_recording" ? "已分配" : "未分配");
};

const hasManualProductionPlan = (item) => {
  const decision = currentDecision(item);
  return Boolean(decision.workflow_step === "assigned_recording" || decision.owner || decision.due_date || item.owner || item.due_date);
};

const hasAnySourceAsset = (item) => (item.source_assets || []).length > 0;

const riskLabel = (risk) =>
  ({
    cover_copy: "需封面文案",
    missing_voiceover: "缺口播稿",
    missing_cover_source: "缺封面素材",
    missing_cover: "缺最终封面",
    missing_raw_video: "缺原始视频",
  })[risk] || risk;

const actionLabel = (action) =>
  ({
    approve: "批准",
    revise: "修改",
    block: "阻塞",
    no_action: "跳过",
  })[action] || action;

const reasonLabel = (reason) =>
  ({
    "Cloud Drive has exported channel assets; review distribution and status.": "已找到渠道导出文件，可以检查分发状态。",
    "Cloud Drive has exported channel assets, but required production items are missing.": "已找到渠道导出文件，但必要项还不完整。",
    "Script or transcript exists online; confirm whether footage is needed.": "已找到口播稿，需要确认是否还缺原始视频。",
    "Raw footage exists online, but script/transcript material was not found.": "已找到原始视频，但还缺口播稿。",
    "Online Google Drive has raw footage and script/transcript material.": "原始视频和口播稿已齐，可以进入后期。",
    "Online Google Drive has raw video, voiceover/script, and cover material.": "口播稿、封面素材、原始视频都已就绪。",
    "Some required production items are missing.": "必要素材未齐，需要补充口播稿、封面素材或原始视频。",
    "Project folder needs source material or direction.": "项目文件夹还缺素材或选题方向。",
    "Topic captured from the agent topic sheet.": "来自选题表，等待确认是否进入录制。",
    "Cover assets exist, but source footage/script was not found.": "已有封面素材，但缺原始视频或口播稿。",
  })[reason] || reason;

const rowSummaryLabel = (item) => {
  const summary = String(item.summary || "").trim();
  if (summary && !/cloud asset\(s\) found in Google Drive/i.test(summary)) return summary;
  const queue = workflowQueue(item);
  if (queue === "topic_board") return "确认这个方向是否值得进入录制。";
  if (queue === "assignment") return "等待分配录制负责人和交付时间。";
  if (queue === "recording") return "已分配录制，等待素材上传。";
  if (queue === "waiting_upload") return "素材未齐，先看右侧三项缺口。";
  if (queue === "edit_output") return "素材已确认，准备交给后期剪辑。";
  if (queue === "editing") return "后期剪辑中，等待渠道导出文件。";
  if (queue === "cover_generation") return "已有剪辑输出，等待最终封面上传到 Covers。";
  if (queue === "distribution_confirm") return "已有剪辑输出，待确认分发渠道和发布链接。";
  return reasonLabel(item.reason);
};

const coverSourceLabel = (item) => {
  const source = item.cover_copy.source;
  if (source === "cover_image_ocr") return "标题和副标题来自最终封面文字识别，可继续人工修改。";
  if (hasCoverAsset(item)) return "已找到最终封面，暂未识别出封面文字；可先点封面预览确认。";
  if (source === "voiceover_markdown") return "标题和副标题根据口播稿初步提炼，可继续人工修改。";
  if (source === "project_folder_name") return "当前未读取到口播稿正文，先根据项目名生成候选。";
  return "标题默认取项目文件夹名，副标题默认留空；下面是可选方向。";
};

const items = () => state?.batch?.items || [];

const currentDecision = (item) => state?.decisions?.[item.id] || item.decision || {};

const itemAssetCount = (item, type) => item.source_assets.filter((asset) => asset.type === type).length;

const requiredChecks = (item) => item.required_checks || [];

const missingCheck = (item, key) => requiredChecks(item).some((check) => check.key === key && !check.ready);

const hasReadyCheck = (item, key) => requiredChecks(item).some((check) => check.key === key && check.ready);

const missingRequiredKeys = (item) => requiredChecks(item).filter((check) => !check.ready).map((check) => check.key);

const allRequiredReady = (item) => requiredChecks(item).length > 0 && requiredChecks(item).every((check) => check.ready);

const canStartEditingWithoutCover = (item) => {
  const missing = missingRequiredKeys(item);
  return missing.length === 1 && missing[0] === "cover_source" && hasReadyCheck(item, "voiceover") && hasReadyCheck(item, "raw_video");
};

const hasChannelExport = (item) => item.stage === "distribution_ready";

const hasCoverAsset = (item) => item.source_assets.some((asset) => asset.type === "cover");

const isDone = (item) => item.status === "done" || item.stage === "published";

const isWorkflowDone = (item) => currentDecision(item).workflow_done || isDone(item);

const isBlocked = (item) => currentDecision(item).action === "block" || item.status === "blocked";

const coverLocaleValue = (item, decision, locale, key) => {
  const legacyKey = locale === "zh" && key === "title" ? "cover_title" : locale === "zh" && key === "subtitle" ? "cover_subtitle" : "";
  const decisionKey = `cover_${locale}_${key}`;
  return decision[decisionKey] || (legacyKey ? decision[legacyKey] : "") || item.cover_copy?.locales?.[locale]?.[key] || "";
};

const workflowQueue = (item) => {
  const decision = currentDecision(item);
  if (isBlocked(item)) return "blocked";
  if (isWorkflowDone(item)) return "done";
  if (hasChannelExport(item)) return hasCoverAsset(item) ? "distribution_confirm" : "cover_generation";
  if (item.stage === "idea") {
    if (decision.workflow_step === "assigned_recording" || hasManualProductionPlan(item)) return "recording";
    return decision.workflow_step === "topic_selected" ? "assignment" : "topic_board";
  }
  if (!hasAnySourceAsset(item) && hasManualProductionPlan(item)) return "recording";
  if (decision.workflow_step === "editing") return "editing";
  if (decision.workflow_step === "cover_done") return "editing";
  if (!allRequiredReady(item)) return "waiting_upload";
  if (decision.workflow_step === "material_reviewed") return "edit_output";
  if (decision.action !== "approve") return "material_review";
  return "edit_output";
};

const workflowLabel = (item) =>
  ({
    topic_board: "选题表",
    assignment: "待分配录制",
    recording: "待录制",
    waiting_upload: "待补齐素材",
    material_review: "待检查素材",
    edit_output: "待剪辑输出",
    editing: "剪辑中",
    cover_generation: "待制作封面",
    distribution_confirm: "待确认分发",
    done: "已完成",
    blocked: "阻塞",
  })[workflowQueue(item)] || "全部";

const nextStepLabel = (item) =>
  ({
    topic_board: "确认选题是否要进入录制计划",
    assignment: "分配录制人和交付时间",
    recording: "等待录制人完成录制并上传素材",
    waiting_upload: "等待录制人补齐口播稿、原始视频和封面素材",
    material_review: "检查三项上传物是否符合后期要求",
    edit_output: "交给后期开始剪辑",
    editing: "等待后期导出各渠道视频",
    cover_generation: "根据口播稿调用封面 skill 制作封面",
    distribution_confirm: "确认输出文件和分发渠道",
    done: "流程已完成",
    blocked: "先处理阻塞原因",
  })[workflowQueue(item)] || "检查视频状态";

const detailTitle = (item) =>
  ({
    topic_board: "选题方向确认",
    assignment: "录制分配",
    recording: "等待录制",
    waiting_upload: "素材补齐",
    material_review: "素材检查",
    edit_output: "剪辑输出",
    editing: "剪辑中",
    cover_generation: "封面制作",
    distribution_confirm: "分发确认",
    done: "已完成",
    blocked: "阻塞处理",
  })[workflowQueue(item)] || item.title;

const detailDescription = (item) =>
  ({
    topic_board: "先判断这个方向是否值得拍，再进入录制分配。",
    assignment: "确认录制人、交付时间和录制注意事项。",
    recording: "录制已分配，等待素材上传到 Google Drive。",
    waiting_upload: "等待口播稿、原始视频和封面素材补齐。",
    material_review: "检查上传物是否符合后期要求。",
    edit_output: "素材已确认，准备交给后期开始剪辑。",
    editing: "后期正在剪辑，等 YouTube、Shorts、视频号等导出视频出现。",
    cover_generation: "剪辑输出已出现，还需要补齐 Covers 里的最终封面。",
    distribution_confirm: "确认输出文件和分发渠道。",
    done: "这条视频流程已完成。",
    blocked: "先处理阻塞原因。",
  })[workflowQueue(item)] || reasonLabel(item.reason);

const approveButtonLabel = (item) => {
  const queue = workflowQueue(item);
  if (queue === "waiting_upload" && canStartEditingWithoutCover(item)) return "先开始剪辑";
  return ({
    topic_board: "确定选题",
    assignment: "已分配录制",
    recording: "等待上传",
    waiting_upload: "素材未齐",
    material_review: "素材合格",
    edit_output: "开始剪辑",
    editing: "等待导出",
    cover_generation: "封面已完成",
    distribution_confirm: "确认分发",
    done: "已完成",
    blocked: "已阻塞",
  })[queue] || "批准";
};

const statusDisplayLabel = (item) => {
  if (isWorkflowDone(item)) return "已完成";
  if (isBlocked(item)) return "阻塞";
  return statusLabel(item.status);
};

const filterMatch = (item, filter) => {
  if (filter === "all") return true;
  return workflowQueue(item) === filter;
};

const requiredCheckSummary = (item) =>
  requiredChecks(item)
    .map((check) => `${check.ready ? "✓" : "缺"}${check.label}`)
    .join(" · ");

const assetTypes = {
  source: ["raw_video", "voiceover", "script", "transcript", "cover_source", "cover"],
  sourceCore: ["raw_video", "voiceover", "script", "transcript", "cover_source"],
  exports: ["youtube_export", "shorts_export", "video_account_export"],
  cover: ["cover"],
};

const filterAssetsByTypes = (assetsByType, types) =>
  Object.fromEntries(types.filter((type) => assetsByType[type]?.length).map((type) => [type, assetsByType[type]]));

const hasAssets = (assetsByType) => Object.keys(assetsByType).length > 0;

const stepSummaryHtml = (item) => {
  if (workflowQueue(item) === "done") return "";
  return `
    <section class="decision-summary next-step-summary">
      <span>后续动作</span>
      <strong>${escapeHtml(nextStepLabel(item))}</strong>
    </section>`;
};

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const assetTimeLabel = (asset) => {
  const created = formatDateTime(asset.created_at);
  const modified = formatDateTime(asset.modified_at);
  if (created && modified && created !== modified) return `上传 ${created} · 更新 ${modified}`;
  if (created) return `上传 ${created}`;
  if (modified) return `更新 ${modified}`;
  return "";
};

const joinAccount = (name, email) => [name, email].filter(Boolean).join(" · ");

const assetAccountLabel = (asset) => {
  const uploadedBy = joinAccount(asset.uploaded_by_name, asset.uploaded_by_email);
  if (uploadedBy) return `创建/上传账号 ${uploadedBy}`;

  const createdBy = joinAccount(asset.created_by_name, asset.created_by_email);
  if (createdBy) return `创建账号 ${createdBy}`;

  const owner = joinAccount(asset.owner_name, asset.owner_email);
  if (owner) return `文件归属账号 ${owner}`;

  return "";
};

const canPreviewAsset = (asset) => Boolean(asset.drive_file_id);

const drivePreviewUrl = (fileId) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;

const openFilePreview = (fileId, title) => {
  const preview = $("#videoPreview");
  const frame = $("#videoPreviewFrame");
  const titleNode = $("#videoPreviewTitle");
  if (!preview || !frame || !titleNode || !fileId) return;
  titleNode.textContent = title || "文件预览";
  frame.src = drivePreviewUrl(fileId);
  preview.hidden = false;
};

const closeFilePreview = () => {
  const preview = $("#videoPreview");
  const frame = $("#videoPreviewFrame");
  if (!preview || !frame) return;
  preview.hidden = true;
  frame.src = "";
};

const topicBriefHtml = (item) => {
  const queue = workflowQueue(item);
  if (!["topic_board", "assignment"].includes(queue)) return "";
  return `
    <section class="section compact">
      <div class="section-title">
        <h4>选题说明</h4>
        <p>确认这个方向是否值得进入录制。</p>
      </div>
      <div class="brief-box">
        <p>${escapeHtml(item.summary || item.title)}</p>
        <ul>
          <li>目标受众：${escapeHtml(item.target_audience || "待确认")}</li>
          <li>建议方向：${escapeHtml(item.topic_direction || "待确认")}</li>
          <li>下一步：${escapeHtml(nextStepLabel(item))}</li>
        </ul>
      </div>
    </section>`;
};

const productionMetaHtml = (item, locked) => {
  const queue = workflowQueue(item);
  if (!["topic_board", "assignment", "recording", "waiting_upload"].includes(queue)) return "";
  const decision = currentDecision(item);
  const priority = topicPriorityLabel(item);
  const owner = productionOwner(item) === "未分配" ? "" : productionOwner(item);
  const dueDate = productionDueDate(item);
  const recordingStatus = recordingStatusLabel(item);

  return `
    <section class="section compact">
      <div class="section-title">
        <h4>生产信息</h4>
        <p>${queue === "topic_board" ? "先确认选题，再进入录制分配。" : "记录负责人、交付时间和录制进度。"}</p>
      </div>
      <div class="production-form">
        <label>
          <span>优先级</span>
          <select id="topicPriority" ${locked ? "disabled" : ""}>
            ${["P0", "P1", "P2", "P3"].map((value) => `<option value="${escapeHtml(value)}" ${value === priority ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>负责人</span>
          <input id="recordingOwner" ${locked ? "disabled" : ""} value="${escapeHtml(owner)}" placeholder="例如：小明 / 小红 / 待分配" />
        </label>
        <label>
          <span>交付时间</span>
          <input id="recordingDueDate" ${locked ? "disabled" : ""} value="${escapeHtml(dueDate)}" placeholder="例如：下周三 / 2026-06-24" />
        </label>
        <label>
          <span>录制状态</span>
          <select id="recordingStatus" ${locked ? "disabled" : ""}>
            ${["未分配", "已分配", "录制中", "已上传"].map((value) => `<option value="${escapeHtml(value)}" ${value === recordingStatus ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
          </select>
        </label>
      </div>
    </section>`;
};

const recordingBriefHtml = (item) => {
  const queue = workflowQueue(item);
  if (!["assignment", "recording", "waiting_upload"].includes(queue)) return "";
  return `
    <section class="section">
      <div class="section-title">
        <h4>录制要求</h4>
        <p>给录制人的简洁版 SOP。</p>
      </div>
      <div class="brief-box">
        <p>16:9 · 1280 × 720 viewport · 高清录屏 · MP4 优先</p>
        <ul>
          <li>浏览器缩放固定 100%，画面不要出现通知、无关窗口、个人信息或水印。</li>
          <li>录屏动作尽量对应口播稿，关键点击、输入、页面切换处稍微停顿。</li>
          <li>开头和结尾各预留 1 秒静止画面，方便后期剪辑。</li>
          <li>交付原始视频、中文口播稿、英文口播稿；视频里不要加字幕。</li>
          <li>命名暂用 <code>use-case-xx.mp4</code>、<code>use-case-xx-cn.md</code>、<code>use-case-xx-en.md</code>。</li>
        </ul>
      </div>
    </section>`;
};

const editBriefHtml = (item) => {
  const queue = workflowQueue(item);
  if (["topic_board", "assignment", "waiting_upload", "cover_generation", "distribution_confirm", "done"].includes(queue)) return "";
  return `
    <section class="section">
      <div class="section-title">
        <h4>剪辑要求</h4>
        <p>给后期看的基础 brief。</p>
      </div>
      <div class="brief-box">
        <p>${escapeHtml(item.edit_brief.format)} · ${escapeHtml(item.edit_brief.duration_target)}</p>
        <ul>
          ${item.edit_brief.key_beats.map((beat) => `<li>${escapeHtml(beat)}</li>`).join("")}
        </ul>
      </div>
    </section>`;
};

const requiredChecksHtml = (item) => {
  const queue = workflowQueue(item);
  if (["topic_board", "assignment", "recording"].includes(queue)) return "";
  return `
    <section class="section compact">
      <div class="section-title">
        <h4>必要项检查</h4>
        <p>进入后期前至少确认这三项。</p>
      </div>
      <div class="check-grid">
        ${requiredChecks(item)
          .map(
            (check) => `
              <div class="check-card ${check.ready ? "ready" : "missing"}">
                <strong>${check.ready ? "已就绪" : "缺失"}</strong>
                <span>${escapeHtml(check.label)}</span>
                <small>${escapeHtml(check.ready ? `${check.count} 个文件` : check.hint)}</small>
              </div>`
          )
          .join("")}
      </div>
    </section>`;
};

const assetGroupsHtml = (assetsByType) => `
  <div class="asset-groups">
        ${Object.entries(assetsByType)
          .map(
            ([type, assets]) => `
              <div class="asset-group">
                <div class="asset-group-head">
                  <strong>${escapeHtml(assetLabels[type] || type)}</strong>
                  <span>${assets.length}</span>
                </div>
                ${assets
                  .map(
                    (asset) => `
                      <div class="asset-link">
                        <div class="asset-main">
                          <span class="asset-name">${escapeHtml(asset.name)}</span>
                          <small class="asset-path">${escapeHtml(asset.path)}</small>
                          <small class="asset-time">${escapeHtml(assetTimeLabel(asset))}</small>
                          ${
                            assetAccountLabel(asset)
                              ? `<small class="asset-account">${escapeHtml(assetAccountLabel(asset))}</small>`
                              : ""
                          }
                        </div>
                        <div class="asset-side">
                          <small class="asset-size">${escapeHtml(formatBytes(asset.size))}</small>
                          <div class="asset-actions">
                            ${
                              canPreviewAsset(asset)
                                ? `<button type="button" class="asset-action" data-preview-file="${escapeHtml(asset.drive_file_id)}" data-preview-title="${escapeHtml(asset.name)}">预览</button>`
                                : ""
                            }
                            <a class="asset-action" href="${escapeHtml(asset.absolute_path)}" target="_blank" rel="noreferrer">打开</a>
                          </div>
                        </div>
                      </div>`
                  )
                  .join("")}
	              </div>`
          )
          .join("")}
      </div>`;

const assetsHtml = (item, assetsByType) => {
  const queue = workflowQueue(item);
  if (queue === "topic_board") return "";
  if (!hasAssets(assetsByType)) return "";
  return `
    <section class="section">
      <div class="section-title">
        <h4>素材文件</h4>
        <p>来自在线 Google Drive，只做读取和引用。</p>
      </div>
      ${assetGroupsHtml(assetsByType)}
    </section>`;
};

const archivedAssetsHtml = (item, assetsByType) => {
  if (!hasAssets(assetsByType)) return "";
  return `
    <details class="section archived-assets">
      <summary>
        <span class="archived-assets-title">
          <strong>相关素材</strong>
          <small>需要核对源文件时展开查看</small>
        </span>
      </summary>
      <div class="archived-assets-body">
        ${assetGroupsHtml(assetsByType)}
      </div>
    </details>`;
};

const missingFocusHtml = (item) => {
  const missing = requiredChecks(item).filter((check) => !check.ready);
  if (missing.length === 0) return "";
  return `
    <section class="section compact">
      <div class="section-title">
        <h4>当前缺项</h4>
        <p>先补齐这些内容，后面流程才有意义。</p>
      </div>
      <div class="missing-list">
        ${missing
          .map(
            (check) => `
              <div>
                <span>${escapeHtml(check.label)}</span>
                <small>${escapeHtml(check.hint)}</small>
              </div>`
          )
          .join("")}
      </div>
    </section>`;
};

const queueGuideHtml = (title, description, items = []) => `
  <section class="section queue-guide">
    <div class="section-title">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(description)}</p>
    </div>
    ${
      items.length
        ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : ""
    }
  </section>`;

const coverCopyHtml = (item, decision, locked) => {
  const queue = workflowQueue(item);
  if (["topic_board", "assignment", "recording", "waiting_upload", "done"].includes(queue)) return "";
  const zhTitle = coverLocaleValue(item, decision, "zh", "title") || item.cover_copy.title;
  const zhSubtitle = coverLocaleValue(item, decision, "zh", "subtitle") || item.cover_copy.subtitle || "";
  const enTitle = coverLocaleValue(item, decision, "en", "title");
  const enSubtitle = coverLocaleValue(item, decision, "en", "subtitle");
  return `
    <section class="section form-section">
      <div class="section-title">
        <h4>封面文案</h4>
        <p class="source-note">${escapeHtml(coverSourceLabel(item))}</p>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>中文标题</span>
          <input id="coverZhTitle" value="${escapeHtml(zhTitle)}" ${locked ? "disabled" : ""} />
          <small>用于中文封面，可直接改成面向观众的标题。</small>
        </label>
        <label class="field">
          <span>中文副标题</span>
          <input id="coverZhSubtitle" value="${escapeHtml(zhSubtitle)}" placeholder="可选：补一句利益点或使用场景" ${locked ? "disabled" : ""} />
          <small>不确定就留空，交给封面设计时再定。</small>
        </label>
        <label class="field">
          <span>English title</span>
          <input id="coverEnTitle" value="${escapeHtml(enTitle)}" placeholder="Optional English cover title" ${locked ? "disabled" : ""} />
          <small>从英文封面文字识别；没读到就留空。</small>
        </label>
        <label class="field">
          <span>English subtitle</span>
          <input id="coverEnSubtitle" value="${escapeHtml(enSubtitle)}" placeholder="Optional English subtitle" ${locked ? "disabled" : ""} />
          <small>用于英文封面，支持人工补充。</small>
        </label>
      </div>
      <div class="copy-suggestions">
        <span>备选方向</span>
        <div>
          ${item.cover_copy.variants.map((variant) => `<button type="button" class="copy-chip" data-cover-title-target="coverZhTitle" data-cover-title="${escapeHtml(variant)}">${escapeHtml(variant)}</button>`).join("")}
        </div>
      </div>
    </section>`;
};

const outputsHtml = (item, selectedOutputs, locked) => {
  const queue = workflowQueue(item);
  if (!["distribution_confirm", "done"].includes(queue)) return "";
  const title = queue === "done" ? "已交付渠道" : "输出渠道";
  const description = queue === "done" ? "记录这条视频实际交付或发布的平台。" : "勾选这条视频要交付的平台规格。";
  return `
    <section class="section">
      <div class="section-title">
        <h4>${title}</h4>
        <p>${description}</p>
      </div>
      <div class="output-grid">
        ${item.outputs
          .map(
            (output) => `
          <label class="output-row">
            <span class="output-main">
              <input type="checkbox" data-output="${escapeHtml(output.channel)}" ${selectedOutputs.has(output.channel) ? "checked" : ""} ${locked ? "disabled" : ""} />
              <span>${escapeHtml(output.channel)}</span>
            </span>
            <small>${escapeHtml(output.aspect_ratio)} · ${output.caption ? "字幕" : "无字幕"} · ${output.cover_required ? "要封面" : "不强制封面"}</small>
          </label>`
          )
          .join("")}
      </div>
	    </section>`;
};

const doneSummaryHtml = (item, selectedOutputs) => {
  const queue = workflowQueue(item);
  if (queue !== "done") return "";
  const selectedChannels = item.outputs.filter((output) => selectedOutputs.has(output.channel));
  const publishedCount = Object.keys(currentDecision(item).published_links || {}).filter((channel) => selectedOutputs.has(channel)).length;
  return `
    <section class="section done-summary">
      <div class="section-title">
        <h4>分发归档</h4>
        <p>这条视频已经完成，重点记录发到哪些渠道，以及最终公开链接。</p>
      </div>
      <div class="done-summary-grid">
        <div>
          <span>已选渠道</span>
          <strong>${selectedChannels.length}</strong>
        </div>
        <div>
          <span>已填链接</span>
          <strong>${publishedCount}</strong>
        </div>
        <div>
          <span>当前状态</span>
          <strong>已完成</strong>
        </div>
      </div>
    </section>`;
};

const publishedLinksHtml = (item, locked) => {
  const queue = workflowQueue(item);
  if (queue !== "done") return "";
  const decision = currentDecision(item);
  const selectedOutputs = normalizeSavedOutputs(item, decision);
  const publishedLinks =
    decision.published_links && typeof decision.published_links === "object" && !Array.isArray(decision.published_links)
      ? decision.published_links
      : {};
  const selected = item.outputs.filter((output) => selectedOutputs.has(output.channel));
  if (selected.length === 0) {
    return `
    <section class="section form-section">
      <div class="section-title">
        <h4>发布链接</h4>
        <p>先在已交付渠道里勾选已经发布的平台，再填写公开链接。</p>
      </div>
    </section>`;
  }
  return `
    <section class="section form-section">
      <div class="section-title">
        <h4>发布链接</h4>
        <p>视频已经发出去后，把每个平台的公开链接填在这里。</p>
      </div>
      <div class="published-link-list">
        ${selected
          .map(
            (output) => `
          <label class="published-link-row">
            <span>${escapeHtml(output.channel)}</span>
            <input type="url" data-published-link="${escapeHtml(output.channel)}" value="${escapeHtml(publishedLinks[output.channel] || (output.channel.startsWith("YouTube ") ? publishedLinks.YouTube || "" : ""))}" placeholder="https://..." ${locked ? "disabled" : ""} />
          </label>`
          )
          .join("")}
      </div>
	    </section>`;
};

const detailBodyHtml = (item, assetsByType, selectedOutputs, decision, locked) => {
  const queue = workflowQueue(item);
  const sourceAssets = filterAssetsByTypes(assetsByType, assetTypes.source);
  const sourceCoreAssets = filterAssetsByTypes(assetsByType, assetTypes.sourceCore);
  const exportAssets = filterAssetsByTypes(assetsByType, assetTypes.exports);
  const coverAssets = filterAssetsByTypes(assetsByType, assetTypes.cover);

  const bodies = {
    topic_board: `
      ${topicBriefHtml(item)}
      ${productionMetaHtml(item, locked)}
      ${queueGuideHtml("选题判断", "这一阶段只看方向本身，不检查素材。", [
        "是否符合 Buda 当前传播重点",
        "是否有清楚的受众和使用场景",
        "是否值得安排录制人继续推进",
      ])}`,
    assignment: `
      ${topicBriefHtml(item)}
      ${productionMetaHtml(item, locked)}
      ${recordingBriefHtml(item)}
      ${queueGuideHtml("分配录制", "把方向交给具体录制人，并约定交付时间。", [
        "确认录制人",
        "确认预计交付时间",
        "把录制要求同步给对方",
      ])}`,
    recording: `
      ${productionMetaHtml(item, locked)}
      ${recordingBriefHtml(item)}
      ${queueGuideHtml("等待录制", "负责人和交付时间已确定，等录制人上传素材。", [
        "确认录制人已经收到 SOP",
        "等原始视频、中文口播稿、英文口播稿上传到 Google Drive",
        "素材开始出现后会进入待补齐素材",
      ])}`,
    waiting_upload: `
      ${productionMetaHtml(item, locked)}
      ${missingFocusHtml(item)}
      ${recordingBriefHtml(item)}
      ${archivedAssetsHtml(item, sourceAssets)}`,
    material_review: `
      ${requiredChecksHtml(item)}
      ${assetsHtml(item, sourceCoreAssets)}
      ${queueGuideHtml("检查重点", "确认口播稿、封面素材和原始视频是否真的能进入后期。", [
        "口播稿中英文是否齐全、方向是否明确",
        "原始视频画面是否清楚，是否有敏感信息",
        "封面素材是否是 PNG/JPG/JPEG；如果已有 Covers 最终封面，也可以直接进入后续流程",
      ])}`,
    cover_generation: `
      ${coverCopyHtml(item, decision, locked)}
      ${assetsHtml(item, hasAssets(exportAssets) ? exportAssets : {})}
      ${archivedAssetsHtml(item, sourceCoreAssets)}`,
    edit_output: `
      ${editBriefHtml(item)}
      ${assetsHtml(item, sourceCoreAssets)}
      ${archivedAssetsHtml(item, coverAssets)}`,
    editing: `
      ${editBriefHtml(item)}
      ${assetsHtml(item, sourceCoreAssets)}
      ${queueGuideHtml("剪辑中", "后期已经开始处理，等待导出视频上传到渠道文件夹。", [
        "等待 YouTube、Shorts、视频号等文件夹出现导出视频",
        "导出视频出现后检查 Covers 文件夹是否已有最终封面",
        "导出视频和封面都齐了会自动进入待确认分发",
      ])}
      ${archivedAssetsHtml(item, coverAssets)}`,
    distribution_confirm: `
      ${outputsHtml(item, selectedOutputs, locked)}
      ${assetsHtml(item, hasAssets(exportAssets) ? exportAssets : assetsByType)}
      ${queueGuideHtml("确认分发", "这里确认导出文件和分发渠道，不需要再看剪辑要求。", [
        "确认每个平台是否有对应导出文件",
        "确认勾选的平台规格是否正确",
        "分发完成后再进入已完成并填写公开链接",
      ])}`,
    done: `
      ${doneSummaryHtml(item, selectedOutputs)}
      ${outputsHtml(item, selectedOutputs, locked)}
      ${publishedLinksHtml(item, locked)}
      ${archivedAssetsHtml(item, assetsByType)}`,
    blocked: `
      ${queueGuideHtml("阻塞原因", "这条视频暂时不能继续推进，需要先处理备注里的问题。", [
        "补齐缺失素材或方向",
        "明确负责人和下一步动作",
        "解除阻塞后再回到对应流程",
      ])}
      ${missingFocusHtml(item)}
      ${archivedAssetsHtml(item, assetsByType)}`,
  };

  return bodies[queue] || "";
};

const reviewNoteLabel = (item) => {
  const queue = workflowQueue(item);
  if (queue === "topic_board") return "选题备注";
  if (queue === "assignment") return "分配备注";
  if (queue === "recording") return "录制备注";
  if (queue === "waiting_upload") return "录制备注";
  if (queue === "done") return "归档备注";
  return "审核备注";
};

const reviewNoteHint = (item) => {
  const queue = workflowQueue(item);
  if (queue === "topic_board") return "记录选题判断、受众、角度或是否需要先放弃。";
  if (queue === "assignment") return "记录录制人、交付时间或录制注意事项。";
  if (queue === "recording") return "记录录制进度、交付风险或提醒事项。";
  if (queue === "waiting_upload") return "记录还缺什么素材、谁来补、什么时候补齐。";
  if (queue === "done") return "记录发布后的补充说明、异常或复盘事项。";
  return "写给后期、设计或分发同事看的具体动作。";
};

const filteredItems = () =>
  items().filter((item) => {
    const text = `${item.title} ${item.summary} ${item.stage} ${item.status} ${item.outputs
      .map((output) => output.channel)
      .join(" ")}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesFilter = filterMatch(item, activeFilter);
    return matchesSearch && matchesFilter;
  });

const humanWorkflowQueues = ["topic_board", "assignment", "recording", "waiting_upload", "material_review", "editing", "cover_generation", "distribution_confirm"];
const executionWorkflowQueues = ["edit_output"];
const workflowPriority = [
  "blocked",
  "topic_board",
  "assignment",
  "recording",
  "waiting_upload",
  "material_review",
  "edit_output",
  "editing",
  "cover_generation",
  "distribution_confirm",
];

const needsHumanAction = (item) => humanWorkflowQueues.includes(workflowQueue(item));

const readyForSkillExecution = (item) => {
  const queue = workflowQueue(item);
  const decision = currentDecision(item);
  return decision.action === "approve" && executionWorkflowQueues.includes(queue);
};

const primaryActionLabel = (humanItems, blockedItems, executionItems) => {
  if (blockedItems.length) return "先处理阻塞说明，解除后回到对应流程";

  const primaryQueue = workflowPriority.find((queue) => humanItems.some((item) => workflowQueue(item) === queue));
  if (primaryQueue === "topic_board") return "确认选题是否进入录制计划";
  if (primaryQueue === "assignment") return "分配录制人和交付时间";
  if (primaryQueue === "recording") return "等待录制完成并上传素材";
  if (primaryQueue === "waiting_upload") return "补齐口播稿、封面素材和原始视频";
  if (primaryQueue === "material_review") return "检查上传素材是否符合后期要求";
  if (primaryQueue === "editing") return "等待后期导出 YouTube、Shorts、视频号等视频";
  if (primaryQueue === "cover_generation") return "制作最终封面并上传到 Covers 文件夹";
  if (primaryQueue === "distribution_confirm") return "确认分发渠道，并在发布后记录链接";
  if (executionItems.length) return "已有批准项，等待 skill 执行下一步";
  return "暂无需要你处理的事项";
};

const primaryActionCountLabel = (humanItems, blockedItems) => {
  if (blockedItems.length) return "阻塞待处理";

  const primaryQueue = workflowPriority.find((queue) => humanItems.some((item) => workflowQueue(item) === queue));
  if (primaryQueue === "topic_board") return "待确认选题";
  if (primaryQueue === "assignment") return "待分配录制";
  if (primaryQueue === "recording") return "待录制";
  if (primaryQueue === "waiting_upload") return "待补齐素材";
  if (primaryQueue === "material_review") return "待检查素材";
  if (primaryQueue === "editing") return "剪辑中";
  if (primaryQueue === "cover_generation") return "待制作封面";
  if (primaryQueue === "distribution_confirm") return "待确认分发";
  return "待人工处理";
};

const primaryActionItems = (humanItems, blockedItems) => {
  if (blockedItems.length) return blockedItems;

  const primaryQueue = workflowPriority.find((queue) => humanItems.some((item) => workflowQueue(item) === queue));
  return primaryQueue ? humanItems.filter((item) => workflowQueue(item) === primaryQueue) : humanItems;
};

const renderActionPanel = () => {
  const all = items();
  const humanItems = all.filter(needsHumanAction);
  const executionItems = all.filter(readyForSkillExecution);
  const blockedItems = all.filter(isBlocked);
  const primaryItems = primaryActionItems(humanItems, blockedItems);

  $("#approvalPanel").innerHTML = `
    <div class="approval-kicker">需要你</div>
    <h2>人类操作审批区</h2>
    <p>${escapeHtml(primaryActionLabel(humanItems, blockedItems, executionItems))}</p>
    <div class="approval-primary">
      <strong>${primaryItems.length}</strong>
      <span>${escapeHtml(primaryActionCountLabel(humanItems, blockedItems))}</span>
    </div>
    <div class="approval-mini-grid">
      <div>
        <strong>${executionItems.length}</strong>
        <span>AI 待执行</span>
      </div>
      <div>
        <strong>${blockedItems.length}</strong>
        <span>受阻</span>
      </div>
    </div>`;
};

const renderFilters = () => {
  const counts = Object.fromEntries(filters.map(([key]) => [key, items().filter((item) => filterMatch(item, key)).length]));

  $("#filters").innerHTML = filters
    .map(
      ([key, label]) => `
        <button class="filter-button ${activeFilter === key ? "active" : ""}" data-filter="${key}" title="Filter: ${label}">
          <span>${label}</span>
          <span class="count">${counts[key] || 0}</span>
        </button>`
    )
    .join("");

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      render();
    });
  });
};

const renderSettings = () => {
  const summary = state?.batch?.config_summary;
  if (!summary) {
    $("#settings").innerHTML = "";
    return;
  }

  $("#settings").innerHTML = `
    <h3>规则和数据源</h3>
    <dl>
      <div>
        <dt>数据源</dt>
        <dd>${escapeHtml(summary.data_reader)}</dd>
      </div>
      <div>
        <dt>Drive 模式</dt>
        <dd>${escapeHtml(summary.google_drive?.mode || "")}</dd>
      </div>
      <div>
        <dt>在线授权</dt>
        <dd>${summary.google_drive?.online_ready ? "已连接" : "需配置"}</dd>
      </div>
      <div>
        <dt>渠道</dt>
        <dd>${escapeHtml((summary.channels || []).join(", "))}</dd>
      </div>
    </dl>`;
};

const renderMetrics = () => {
  const all = items();
  const value = (predicate) => all.filter(predicate).length;
  const cards = [
    ["总项目", all.length, "云端硬盘文件夹"],
    ["待检查素材", value((item) => workflowQueue(item) === "material_review"), "三项上传物已齐"],
    ["待确认分发", value((item) => workflowQueue(item) === "distribution_confirm"), "已有剪辑输出"],
  ];

  $("#metrics").innerHTML = cards
    .map(
      ([label, count, hint]) => `
        <div class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${count}</strong>
          <small>${escapeHtml(hint)}</small>
        </div>`
    )
    .join("");
};

const renderList = () => {
  const list = filteredItems();
  const isOverviewView = activeFilter === "all";
  const isTopicBoardView =
    !isOverviewView &&
    (activeFilter === "topic_board" || (list.length > 0 && list.every((item) => workflowQueue(item) === "topic_board")));
  const isRecordingPlanView =
    !isTopicBoardView &&
    (["assignment", "recording"].includes(activeFilter) ||
      (list.length > 0 && list.every((item) => ["assignment", "recording"].includes(workflowQueue(item)))));
  const isMaterialGapView =
    !isTopicBoardView &&
    !isRecordingPlanView &&
    (activeFilter === "waiting_upload" || (list.length > 0 && list.every((item) => workflowQueue(item) === "waiting_upload")));
  const header = isTopicBoardView
    ? `<div class="list-header topic-header">
      <span>选题</span>
      <span>来源</span>
      <span>优先级</span>
      <span>负责人</span>
      <span>交付时间</span>
      <span>提示</span>
    </div>`
    : isRecordingPlanView
      ? `<div class="list-header recording-header">
      <span>视频项目</span>
      <span>阶段</span>
      <span>负责人</span>
      <span>交付时间</span>
      <span>录制状态</span>
      <span>提示</span>
    </div>`
      : isMaterialGapView
        ? `<div class="list-header gap-header">
      <span>视频项目</span>
      <span>阶段</span>
      <span>负责人/交付</span>
      <span>视频</span>
      <span>口播稿</span>
      <span>封面素材</span>
    </div>`
      : isOverviewView
        ? `<div class="list-header overview-header">
      <span>视频项目</span>
      <span>阶段</span>
      <span>负责人</span>
      <span>交付时间</span>
      <span>视频</span>
      <span>口播稿</span>
      <span>封面素材</span>
      <span>提示</span>
    </div>`
    : `<div class="list-header">
      <span>视频项目</span>
      <span>阶段</span>
      <span>状态</span>
      <span>口播稿</span>
      <span>封面素材</span>
      <span>原始视频</span>
      <span>提示</span>
    </div>`;

  $("#videoList").innerHTML =
    header +
    (list
      .map((item) => {
        const decision = currentDecision(item);
        if (isTopicBoardView) {
          return `
        <button class="video-row topic-row ${activeId === item.id ? "active" : ""}" data-id="${item.id}" data-stage="${escapeHtml(item.stage)}">
          <div class="video-main">
            <div class="queue-code">${escapeHtml(item.ref.replace(/^Video/i, "Topic"))}</div>
            <div class="row-title">${escapeHtml(item.title)}</div>
            <p class="row-summary">${escapeHtml(rowSummaryLabel(item))}</p>
          </div>
          <div class="stage-cell" data-label="来源">
            <span class="stage-text">${escapeHtml(topicSourceLabel(item))}</span>
          </div>
          <div class="asset-cell" data-label="优先级">
            <span class="inline-text">${escapeHtml(topicPriorityLabel(item))}</span>
          </div>
          <div class="asset-cell" data-label="负责人">
            <span class="inline-text">${escapeHtml(productionOwner(item))}</span>
          </div>
          <div class="asset-cell" data-label="交付时间">
            <span class="inline-text">${escapeHtml(productionDueDate(item))}</span>
          </div>
          <div class="action-cell" data-label="提示">
            <span class="hint-text muted">${escapeHtml(topicHintLabel(item))}</span>
          </div>
        </button>`;
        }
        const missingRequired = requiredChecks(item).filter((check) => !check.ready);
        const checkByKey = Object.fromEntries(requiredChecks(item).map((check) => [check.key, check]));
        const owner = productionOwner(item);
        const dueDate = productionDueDate(item);
        const rowViewClass = isRecordingPlanView
          ? "recording-plan-row"
          : isMaterialGapView
            ? "material-gap-row"
            : isOverviewView
              ? "overview-row"
              : "";
        const materialStateCells = (keys) =>
          keys
            .map((key) => {
              const check = checkByKey[key];
              const count = (item.source_assets || []).filter((asset) => asset.type === key).length;
              return `
                    <div class="asset-cell" data-label="${escapeHtml(check?.label || key)}">
                      <span class="asset-state ${check?.ready ? "ready" : "missing"}">${check?.ready ? `✓ ${count || 1}` : "缺"}</span>
                    </div>`;
            })
            .join("");
        return `
        <button class="video-row ${rowViewClass} ${activeId === item.id ? "active" : ""}" data-id="${item.id}" data-stage="${escapeHtml(item.stage)}">
          <div class="video-main">
            <div class="queue-code">${escapeHtml(item.ref)}</div>
            <div class="row-title">${escapeHtml(item.title)}</div>
            <p class="row-summary">${escapeHtml(rowSummaryLabel(item))}</p>
          </div>
          <div class="stage-cell" data-label="阶段">
            <span class="stage-text">${escapeHtml(workflowLabel(item))}</span>
          </div>
          ${
            isRecordingPlanView
              ? `
                <div class="asset-cell" data-label="负责人">
                  <span class="inline-text">${escapeHtml(productionOwner(item))}</span>
                </div>
                <div class="asset-cell" data-label="交付时间">
                  <span class="inline-text">${escapeHtml(productionDueDate(item))}</span>
                </div>
                <div class="asset-cell" data-label="录制状态">
                  <span class="inline-text">${escapeHtml(recordingStatusLabel(item))}</span>
                </div>`
              : isMaterialGapView
                ? `
                <div class="handoff-cell" data-label="负责人/交付">
                  <span>${escapeHtml(owner)}</span>
                  ${dueDate ? `<small>${escapeHtml(dueDate)}</small>` : ""}
                </div>
                ${materialStateCells(["raw_video", "voiceover", "cover_source"])}`
              : isOverviewView
                ? `
                <div class="asset-cell" data-label="负责人">
                  <span class="inline-text">${escapeHtml(owner)}</span>
                </div>
                <div class="asset-cell" data-label="交付时间">
                  <span class="inline-text">${escapeHtml(dueDate)}</span>
                </div>
                ${materialStateCells(["raw_video", "voiceover", "cover_source"])}`
              : requiredChecks(item)
                  .map((check, index) => `
                    ${index === 0 ? `<div class="status-cell" data-label="状态">
                      <span class="status-text">${escapeHtml(statusDisplayLabel(item))}</span>
                    </div>` : ""}
                    <div class="asset-cell" data-label="${escapeHtml(check.label)}">
                      <span class="asset-state ${check.ready ? "ready" : "missing"}">${check.ready ? "✓" : "缺"} ${escapeHtml(check.label)}</span>
                    </div>`)
                  .join("")
          }
          ${
            isMaterialGapView
              ? ""
              : `<div class="action-cell" data-label="提示">
            ${
              decision.action
                ? `<span class="hint-text decision">${escapeHtml(decisionDisplayLabel(item, decision))}</span>`
                : missingRequired.length
                  ? `<span class="hint-text risk">缺 ${missingRequired.length} 项</span>`
                  : `<span class="hint-text muted">正常</span>`
            }
          </div>`
          }
        </button>`;
      })
      .join("") ||
    `<div class="empty-state"><h3>没有视频</h3><p>当前筛选下没有匹配项目。</p></div>`);

  document.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeId = button.dataset.id;
      detailOpen = true;
      render();
    });
  });
};

const onboardingHtml = () => {
  const onboarding = state?.batch?.onboarding;
  if (!onboarding?.required) return "";

  return `
    <div class="notice">
      <strong>需要配置。</strong>
      <p>${escapeHtml(onboarding.reasons.join(" "))}</p>
      <p>请配置私有 config，并设置 <code>google_drive.root_folder_id</code> 与 Google Drive OAuth。</p>
    </div>`;
};

const renderDetail = () => {
  const item = items().find((candidate) => candidate.id === activeId);
  $("#detailPane").classList.toggle("open", Boolean(detailOpen && item));
  $("#drawerBackdrop").hidden = !Boolean(detailOpen && item);
  if (!item || !detailOpen) {
    $("#detailPane").innerHTML = `${onboardingHtml()}<div class="empty-state"><h3>选择一个视频</h3><p>点击卡片后查看规则、素材、封面和分发渠道。</p></div>`;
    return;
  }

  const locked = Boolean(state?.lock);
  const decision = currentDecision(item);
  const selectedOutputs = normalizeSavedOutputs(item, decision);
  const assetsByType = item.source_assets.reduce((groups, asset) => {
    const key = asset.type;
    groups[key] = groups[key] || [];
    groups[key].push(asset);
    return groups;
  }, {});
	  const missingRequired = requiredChecks(item).filter((check) => !check.ready);
	  const queue = workflowQueue(item);
	  const allowManualEditing = queue === "waiting_upload" && canStartEditingWithoutCover(item);
	  const approveDisabled =
	    locked || isWorkflowDone(item) || ["recording", "editing"].includes(queue) || (queue === "waiting_upload" && !allowManualEditing);
	  const workflowText = workflowLabel(item);
	  const statusText = statusDisplayLabel(item);

  $("#detailPane").innerHTML = `
    ${onboardingHtml()}
    <div class="drawer-top">
      <div>
        <span class="drawer-kicker">视频详情</span>
        <strong>${escapeHtml(item.ref)}</strong>
      </div>
      <button class="drawer-close" id="closeDetail" aria-label="关闭详情" title="关闭详情">×</button>
    </div>
    <div class="detail-header">
      <div>
        <h3>${escapeHtml(detailTitle(item))}</h3>
        <p>${escapeHtml(detailDescription(item))}</p>
	      </div>
	      <div class="detail-state-line">
	        <span>${escapeHtml(workflowText)}</span>
	        ${workflowText === statusText ? "" : `<span>${escapeHtml(statusText)}</span>`}
	      </div>
	    </div>
    ${detailBodyHtml(item, assetsByType, selectedOutputs, decision, locked)}
    ${stepSummaryHtml(item)}

    <section class="section">
      <div class="section-title">
        <h4>${escapeHtml(reviewNoteLabel(item))}</h4>
        <p>${escapeHtml(reviewNoteHint(item))}</p>
      </div>
      <textarea id="reviewNote" ${locked ? "disabled" : ""} placeholder="${escapeHtml(reviewNoteHint(item))}">${escapeHtml(decision.comment || "")}</textarea>
    </section>

    <div class="drawer-actions">
      ${
        queue === "done"
          ? `<button class="action-button primary" data-action="${escapeHtml(decision.action || "approve")}" ${locked ? "disabled" : ""} title="保存已发布链接">保存链接</button>`
          : `<button class="action-button primary" data-action="approve" ${approveDisabled ? "disabled" : ""} title="${queue === "recording" ? "录制人上传素材后会进入下一步" : queue === "waiting_upload" ? (allowManualEditing ? "口播稿和原始视频已齐，可以先进入剪辑；封面后补" : "口播稿和原始视频至少齐了以后再进入剪辑") : queue === "editing" ? "等渠道导出视频出现后自动进入下一步" : isWorkflowDone(item) ? "这条视频已确认完成" : "确认进入下一步"}">${escapeHtml(approveButtonLabel(item))}</button>`
      }
      ${queue === "done" ? "" : `<button class="action-button" data-save-only="true" data-action="${escapeHtml(decision.action || "")}" ${locked ? "disabled" : ""} title="只保存负责人、交付时间、录制状态和备注，不推进流程">保存信息</button>`}
      <button class="action-button" data-action="revise" ${locked ? "disabled" : ""} title="保存修改意见">要修改</button>
      <button class="action-button danger" data-action="block" ${locked ? "disabled" : ""} title="缺素材或方向，先阻塞">阻塞</button>
      <button class="action-button" data-action="no_action" ${locked ? "disabled" : ""} title="这条暂时跳过">跳过</button>
    </div>`;

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await saveDecision(item.id, button.dataset.action, { saveOnly: button.dataset.saveOnly === "true" });
    });
  });
  document.querySelectorAll("[data-preview-file]").forEach((button) => {
    button.addEventListener("click", () => {
      openFilePreview(button.dataset.previewFile, button.dataset.previewTitle);
    });
  });
  $("#closeDetail")?.addEventListener("click", () => {
    detailOpen = false;
    render();
  });
  document.querySelectorAll("[data-cover-title]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = $(`#${button.dataset.coverTitleTarget || "coverZhTitle"}`);
      if (input && !locked) {
        input.value = button.dataset.coverTitle || "";
        input.focus();
      }
    });
  });
};

const inputValue = (selector, fallback = "") => {
  const element = $(selector);
  return element ? element.value : fallback;
};

const saveDecision = async (id, action, options = {}) => {
  const item = items().find((candidate) => candidate.id === id);
  const decision = item ? currentDecision(item) : {};
  const outputs = [...document.querySelectorAll("[data-output]:checked")].map((input) => input.dataset.output);
  const publishedLinkInputs = [...document.querySelectorAll("[data-published-link]")];
  const publishedLinks = Object.fromEntries(
    publishedLinkInputs
      .map((input) => [input.dataset.publishedLink, input.value.trim()])
      .filter(([channel, url]) => channel && url)
  );
  const previousPublishedLinks =
    decision.published_links && typeof decision.published_links === "object" && !Array.isArray(decision.published_links)
      ? decision.published_links
      : {};
  const queue = item ? workflowQueue(item) : "";
  const effectiveAction = options.saveOnly ? decision.action || "" : action;
  const workflowDone = Boolean(item && effectiveAction === "approve" && queue === "distribution_confirm");
  const workflowStep =
    effectiveAction === "approve" && queue === "topic_board"
      ? "topic_selected"
      : effectiveAction === "approve" && queue === "assignment"
        ? "assigned_recording"
        : effectiveAction === "approve" && queue === "waiting_upload" && item && canStartEditingWithoutCover(item)
          ? "editing"
          : effectiveAction === "approve" && queue === "material_review"
          ? "material_reviewed"
          : effectiveAction === "approve" && queue === "edit_output"
            ? "editing"
            : effectiveAction === "approve" && queue === "cover_generation"
              ? "cover_done"
              : decision.workflow_step || "";
  const selectedRecordingStatus = inputValue("#recordingStatus", decision.recording_status || "");
  const recordingStatus =
    effectiveAction === "approve" && queue === "assignment" && (!selectedRecordingStatus || selectedRecordingStatus === "未分配")
      ? "已分配"
      : selectedRecordingStatus;
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id,
      action: effectiveAction,
      comment: inputValue("#reviewNote", decision.comment || ""),
      topic_priority: inputValue("#topicPriority", decision.topic_priority || ""),
      owner: inputValue("#recordingOwner", decision.owner || ""),
      due_date: inputValue("#recordingDueDate", decision.due_date || ""),
      recording_status: recordingStatus,
      cover_title: inputValue("#coverZhTitle", decision.cover_title || ""),
      cover_subtitle: inputValue("#coverZhSubtitle", decision.cover_subtitle || ""),
      cover_zh_title: inputValue("#coverZhTitle", decision.cover_zh_title || ""),
      cover_zh_subtitle: inputValue("#coverZhSubtitle", decision.cover_zh_subtitle || ""),
      cover_en_title: inputValue("#coverEnTitle", decision.cover_en_title || ""),
      cover_en_subtitle: inputValue("#coverEnSubtitle", decision.cover_en_subtitle || ""),
      outputs,
      published_links: publishedLinkInputs.length ? publishedLinks : previousPublishedLinks,
      workflow_step: workflowStep,
      workflow_done: workflowDone || Boolean(decision.workflow_done),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    alert(error.error || "Could not save decision.");
    return;
  }

  const result = await response.json();
  if (result.decision?.drive_sync?.error) {
    console.warn("Google Drive status sync failed:", result.decision.drive_sync.error);
  }

  await loadState({ force: true });
};

const renderTop = () => {
  const batch = state?.batch;
  $("#batchMeta").textContent = batch ? `${batch.items.length} 个视频` : "暂无批次";
  $("#viewTitle").textContent = filters.find(([key]) => key === activeFilter)?.[1] || "All Videos";
  $("#viewSubtitle").textContent = batch?.generated_at ? `最近同步：${new Date(batch.generated_at).toLocaleString()}` : "请先同步视频库。";

  const lock = state?.lock;
  $("#lockStatus").hidden = !lock;
  $("#lockStatus").textContent = lock ? `同步中：${lock.message}` : "";
  $("#lockStatus").classList.toggle("locked", Boolean(lock));
};

const render = () => {
  if (!filters.some(([key]) => key === activeFilter)) {
    activeFilter = "all";
  }
  renderTop();
  renderActionPanel();
  renderFilters();
  renderSettings();
  renderMetrics();
  renderList();
  renderDetail();
};

const loadState = async ({ force = false } = {}) => {
  if (editing && !force) return;
  const response = await fetch("/api/state", { cache: "no-store" });
  state = await response.json();
  render();
};

$("#searchInput").addEventListener("input", (event) => {
  search = event.target.value;
  render();
});

$("#drawerBackdrop").addEventListener("click", () => {
  detailOpen = false;
  render();
});

$("#closeVideoPreview")?.addEventListener("click", closeFilePreview);

$("#videoPreview")?.addEventListener("click", (event) => {
  if (event.target === $("#videoPreview")) {
    closeFilePreview();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if ($("#videoPreview") && !$("#videoPreview").hidden) {
    closeFilePreview();
    return;
  }
  if (detailOpen) {
    detailOpen = false;
    render();
  }
});

document.addEventListener("focusin", (event) => {
  editing = ["INPUT", "TEXTAREA"].includes(event.target.tagName) && event.target.type !== "search";
});

document.addEventListener("focusout", () => {
  editing = false;
});

await loadState();
setInterval(() => loadState(), 4000);

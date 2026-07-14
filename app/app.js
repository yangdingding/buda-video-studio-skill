const filters = [
  ["dashboard", "总览"],
  ["all", "全部"],
  ["topic_board", "选题表"],
  ["assignment", "AI 视频制作中"],
  ["waiting_upload", "待确认 AI 视频"],
  ["recording", "待录制"],
  ["material_review", "待进入后期"],
  ["editing", "后期剪辑中"],
  ["distribution_confirm", "待确认分发"],
  ["done", "已完成"],
  ["blocked", "阻塞"],
];

let state = null;
let activeFilter = "dashboard";
let activeId = null;
let detailOpen = false;
let search = "";
let editing = false;
let syncing = false;
let isApplyingRoute = false;
let stateSnapshot = "";
const openArchivedAssetIds = new Set();
const sidebarCollapsedStorageKey = "buda-video-studio-sidebar-collapsed";
let sidebarCollapsed = window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
let mobileSidebarOpen = false;

const $ = (selector) => document.querySelector(selector);

const sidebarIcon = (collapsed) => `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true" focusable="false">
    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
    <path d="M9 4v16"></path>
    ${collapsed ? '<path d="m14 9 3 3-3 3"></path>' : '<path d="m17 9-3 3 3 3"></path>'}
  </svg>`;

const renderSidebarState = () => {
  const shell = $(".shell");
  const toggle = $("#sidebarToggle");
  shell?.classList.toggle("sidebar-collapsed", sidebarCollapsed);
  shell?.classList.toggle("mobile-sidebar-open", mobileSidebarOpen);
  const backdrop = $("#sidebarBackdrop");
  if (backdrop) {
    backdrop.hidden = !mobileSidebarOpen;
  }
  if (!toggle) return;
  toggle.innerHTML = sidebarIcon(sidebarCollapsed);
  toggle.setAttribute("aria-label", sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏");
  toggle.setAttribute("title", sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏");
};

const toggleSidebar = () => {
  sidebarCollapsed = !sidebarCollapsed;
  window.localStorage.setItem(sidebarCollapsedStorageKey, String(sidebarCollapsed));
  renderSidebarState();
};

const openMobileSidebar = () => {
  mobileSidebarOpen = true;
  renderSidebarState();
};

const closeMobileSidebar = () => {
  mobileSidebarOpen = false;
  renderSidebarState();
};

const routeFilters = () => filters.map(([key]) => key);

const encodeRoutePart = (value) => encodeURIComponent(String(value || ""));

const decodeRoutePart = (value) => {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
};

const routeFor = () => {
  const filterPart = routeFilters().includes(activeFilter) ? activeFilter : "all";
  return detailOpen && activeId ? `/${filterPart}/${encodeRoutePart(activeId)}` : `/${filterPart}`;
};

const parseHashRoute = () => {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeRoutePart);
  return {
    filter: routeFilters().includes(parts[0]) ? parts[0] : "dashboard",
    id: parts[1] || null,
  };
};

const applyRouteFromHash = () => {
  isApplyingRoute = true;
  const route = parseHashRoute();
  activeFilter = route.filter;
  activeId = route.id;
  detailOpen = Boolean(route.id);
  isApplyingRoute = false;
};

const syncRoute = ({ push = false } = {}) => {
  if (isApplyingRoute) return;
  const target = `#${routeFor()}`;
  if (window.location.hash === target) return;
  if (push) window.location.hash = target;
  else history.replaceState(null, "", target);
};

const navigateTo = (next = {}, { replace = false } = {}) => {
  if ("filter" in next) activeFilter = next.filter;
  if ("id" in next) activeId = next.id;
  if ("detailOpen" in next) detailOpen = next.detailOpen;
  const target = `#${routeFor()}`;
  if (window.location.hash === target) {
    render();
    return;
  }
  if (replace) {
    history.replaceState(null, "", target);
    render();
    return;
  }
  window.location.hash = target;
};

const ruleLabels = {
  channel_export_found: "已有渠道导出",
  export_found_missing_required_items: "有导出但必要项不齐",
  raw_plus_direction: "录屏 + 脚本",
  raw_without_direction: "有录屏，缺脚本",
  direction_without_raw: "有脚本，缺录屏",
  ai_video_ready_for_review: "AI 视频待确认",
  draft_video_ready_for_recording: "AI 视频可录屏",
  cover_without_source: "有封面，缺源素材",
  no_source_material: "缺源素材",
};

const assetLabels = {
  raw_video: "录屏素材",
  draft_video: "AI 视频",
  production_project: "AI 工程文件",
  production_manifest: "AI 工程 Manifest",
  voiceover: "剧本/脚本",
  script: "剧本/脚本",
  transcript: "字幕文件",
  cover_source: "封面素材",
  cover: "最终封面",
  youtube_export: "YouTube",
  shorts_export: "Shorts",
  video_account_export: "视频号",
  social_export: "社媒导出",
};

const evidenceLabels = {
  raw: "录屏素材",
  draft_video: "AI 视频",
  production_project: "AI 工程文件",
  production_manifest: "AI 工程 Manifest",
  voiceover: "剧本/脚本",
  script: "剧本/脚本",
  transcript: "字幕文件",
  cover_source: "封面素材",
  cover: "最终封面",
  youtube_export: "YouTube",
  shorts_export: "Shorts",
  video_account_export: "视频号",
  social_export: "社媒导出",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const compactPlainText = (value, maxLength = 180) => {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).replace(/\s+\S*$/, "")}...` : text;
};

const looksLikeTechnicalCaptionSummary = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^SRT\s+Review\s*:/i.test(text)) return true;
  if (/^(language|locale|lang)\s*[:：]\s*[\w-]+$/i.test(text)) return true;
  if (/^(duration|source|file|filename|encoding|format|reviewed|created|updated|generated this run|reference source|reference path|brand replacements|missing brand terms from srt)\s*[:：]/i.test(text) && text.length <= 180) return true;
  if (/^(human review notes|reference-only tokens sample|srt-only tokens sample|reference only tokens sample|srt only tokens sample)$/i.test(text)) return true;
  if (/^no obvious brand-term issues found\b/i.test(text)) return true;
  if (/^(字幕|字幕文件|subtitle|caption|transcript)\s*(review|校对)?\s*[:：]/i.test(text)) return true;
  if (/^[\w .()[\]\-]+\.(srt|ass|vtt|sbv)$/i.test(text)) return true;
  return /\.(srt|ass|vtt|sbv)\b/i.test(text) && text.length <= 120;
};

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

const selectedOutputChannels = (item) => normalizeSavedOutputs(item, currentDecision(item));

const defaultRequiredOutputChannels = ["YouTube 中文", "YouTube English", "视频号"];

const inferredDefaultOutputChannels = (item) => {
  const evidence = item.rule?.evidence || {};
  const hasSocialOnlyExport =
    channelEvidenceCount(item, "social_export") > 0 &&
    channelEvidenceCount(item, "youtube_export") === 0 &&
    channelEvidenceCount(item, "shorts_export") === 0 &&
    channelEvidenceCount(item, "video_account_export") === 0;
  if (hasSocialOnlyExport) return ["Twitter"];
  if (evidence.social_export && !evidence.youtube_export && !evidence.shorts_export && !evidence.video_account_export) return ["Twitter"];
  return defaultRequiredOutputChannels;
};

const selectedOrDefaultOutputChannels = (item) => {
  const selected = selectedOutputChannels(item);
  return selected.size > 0 ? selected : new Set(inferredDefaultOutputChannels(item));
};

const selectedOutputsForPublishing = (item, decision = currentDecision(item)) => {
  const selected = normalizeSavedOutputs(item, decision);
  return selected.size > 0 ? selected : selectedOrDefaultOutputChannels(item);
};

const normalizeDistributionCopy = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([channel, copy]) => {
        if (!channel) return null;
        if (copy && typeof copy === "object" && !Array.isArray(copy)) {
          return [
            channel,
            {
              title: String(copy.title || ""),
              body: String(copy.body || ""),
            },
          ];
        }
        return [
          channel,
          {
            title: "",
            body: String(copy || ""),
          },
        ];
      })
      .filter(Boolean)
  );
};

const fallbackDistributionCopyFor = (item, channel) => {
  const title = item.cover_copy?.locales?.zh?.title || item.cover_copy?.title || item.title || channel;
  const summary = compactPlainText(item.summary || item.body || item.cover_copy?.subtitle || title, 180);
  const tags =
    channel === "小红书"
      ? "#Buda #AI工作流 #效率工具"
      : channel === "视频号"
        ? "#Buda #AI工作流"
        : channel === "LinkedIn"
          ? "#AIAgents #WorkflowAutomation #Buda"
          : "#Buda #AIAgents";
  return {
    title,
    body: `${title}\n\n${summary}\n\n关注 Buda，获取更多 AI GTM 自动化工作流。\n\n${tags}`,
  };
};

const distributionCopyEntry = (item, decision, channel) => {
  const saved = normalizeDistributionCopy(decision.distribution_copy);
  const defaults = normalizeDistributionCopy(item.distribution_copy);
  const fallback = fallbackDistributionCopyFor(item, channel);
  const hasSaved = Object.prototype.hasOwnProperty.call(saved, channel);
  const savedCopy = saved[channel] || {};
  const defaultCopy = defaults[channel] || {};
  return {
    title: hasSaved ? savedCopy.title : defaultCopy.title || fallback.title,
    body: hasSaved ? savedCopy.body : defaultCopy.body || fallback.body,
  };
};

const channelRequirementLabel = (item) => {
  const labels = selectedChannelExportChecks(item).map((check) => check.label);
  return labels.length ? labels.join("、") : "任一导出视频";
};

const stageLabel = (stage) =>
  ({
    idea: "选题",
    script_ready: "AI 视频制作中",
    assets_ready: "待进入后期",
    ready_for_edit: "待进入后期",
    editing: "后期剪辑中",
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

const distributionApprovers = [
  {
    key: "kelly",
    name: "Kelly",
    role: "完成确认",
    description: "确认这条视频的导出、封面、分发状态和发布链接都已核对。",
  },
  {
    key: "kelvin",
    name: "Kelvin",
    role: "完成确认",
    description: "确认这条视频的导出、封面、分发状态和发布链接都已核对。",
  },
];

const normalizeDistributionApprovals = (value) => ({
  kelly: Boolean(value?.kelly),
  kelvin: Boolean(value?.kelvin),
});

const distributionApprovals = (decision = {}) => normalizeDistributionApprovals(decision.distribution_approvals);

const distributionApprovalCount = (decision = {}) => {
  const approvals = distributionApprovals(decision);
  return distributionApprovers.filter(({ key }) => approvals[key]).length;
};

const hasDistributionApprovals = (decision = {}) => distributionApprovalCount(decision) === distributionApprovers.length;

const publishedLinksFor = (item) => {
  const decision = currentDecision(item);
  if (!decision.published_links || typeof decision.published_links !== "object" || Array.isArray(decision.published_links)) return {};
  return decision.published_links;
};

const selectedOutputsFor = (item) => {
  const selected = selectedOrDefaultOutputChannels(item);
  return item.outputs.filter((output) => selected.has(output.channel));
};

const publishedChannelEntries = (item) => {
  const links = publishedLinksFor(item);
  const selectedOutputs = selectedOutputsFor(item);
  return selectedOutputs.map((output) => {
    const link = links[output.channel] || (output.channel.startsWith("YouTube ") ? links.YouTube : "") || "";
    return {
      channel: output.channel,
      url: link,
    };
  });
};

const decisionDisplayLabel = (item, decision) => {
  const approvalCount = distributionApprovalCount(decision);
  if (decision?.workflow_done && hasDistributionApprovals(decision)) return "已完成";
  if (workflowQueue(item) === "distribution_confirm") {
    if (approvalCount === distributionApprovers.length) return `${distributionApprovers.length} 人已确认`;
    if (approvalCount > 0) return `已确认 ${approvalCount}/${distributionApprovers.length}`;
    return `待 ${distributionApprovers.length} 人确认`;
  }
  return decisionLabel(decision?.action);
};

const topicHintLabel = (item) => {
  const decision = currentDecision(item);
  if (decision.action === "revise") return "补充角度";
  if (decision.action === "block") return "暂缓";
  if (decision.action === "no_action") return "跳过";
  if (decision.workflow_step === "topic_selected") return "AI 视频制作中";
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
    voiceover: 0,
    script: 1,
    transcript: 2,
    draft_video: 3,
    cover: 4,
    raw_video: 5,
    cover_source: 5,
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
  const saved = decision.recording_status || item.recording_status || "";
  if (saved && saved !== "未分配") return saved;
  if (hasReadyCheck(item, "raw_video")) return "已上传";
  if (aiVideoReady(item)) return "待录屏";
  if (["ai_video_approved", "assigned_recording"].includes(decision.workflow_step)) return "待录屏";
  if (productionOwner(item) !== "未分配" || productionDueDate(item)) return "已分配";
  return "未分配";
};

const hasAiProductionRequest = (item) => {
  const decision = currentDecision(item);
  return ["topic_selected", "ai_video_production_requested"].includes(decision.workflow_step);
};

const productionEngine = (item) => (currentDecision(item).production_engine === "remotion" ? "remotion" : "hyperframes");

const brandProfile = (item) => (currentDecision(item).brand_profile === "buda" ? "buda" : "project");

const riskLabel = (risk) =>
  ({
    cover_copy: "需封面文案",
    missing_voiceover: "缺剧本/脚本",
    missing_draft_video: "缺 AI 视频",
    missing_cover_source: "缺封面素材",
    missing_cover: "缺最终封面",
    missing_raw_video: "缺录屏素材",
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
    "Cloud Drive has all required channel exports and final cover; review distribution and status.": "所选渠道导出和最终封面都已齐，可以确认分发。",
    "Cloud Drive has all required channel exports, but final cover is missing.": "所选渠道导出已齐，还缺 Covers 最终封面。",
    "Cloud Drive has partial channel exports; wait for YouTube, Shorts, and video account outputs.": "已有部分渠道导出，还要等所选渠道产出。",
    "Cloud Drive has YouTube CN/EN, Shorts, video account exports, and final cover; review distribution and status.":
      "所选渠道导出和最终封面都已齐，可以确认分发。",
    "Cloud Drive has YouTube CN/EN, Shorts, and video account exports, but final cover is missing.":
      "所选渠道导出已齐，还缺 Covers 最终封面。",
    "Cloud Drive has partial channel exports; wait for YouTube CN/EN, Shorts, and video account outputs.":
      "已有部分渠道导出，还要等所选渠道产出。",
    "Cloud Drive has YouTube CN/EN, video account exports, and final cover; review distribution and status. Shorts is optional.":
      "所选渠道导出和最终封面都已齐，可以确认分发。",
    "Cloud Drive has YouTube CN/EN and video account exports, but final cover is missing. Shorts is optional.":
      "所选渠道导出已齐，还缺 Covers 最终封面。",
    "Cloud Drive has partial channel exports; wait for YouTube CN/EN and video account outputs. Shorts is optional.":
      "已有部分渠道导出，还要等所选渠道产出。",
    "Script or transcript exists online; confirm whether footage is needed.": "已找到剧本/脚本，需要进入 AI 视频制作。",
    "Raw footage exists online, but script/transcript material was not found.": "已找到录屏素材，但还缺剧本、AI 视频或 Cover。",
    "Online Google Drive has raw footage and script/transcript material.": "已找到录屏素材和剧本，还需要确认 AI 视频与 Cover。",
    "Online Google Drive has raw video, voiceover/script, and cover material.": "剧本、AI 视频和 Cover 都已就绪。",
    "Online Google Drive has the approved AI video package and human screen recording ready for post-production.":
      "AI 视频已确认且录屏素材已就绪，可以进入后期。",
    "AI video package is ready: script, rendered preview video, voice/subtitles, and cover are available for review.":
      "AI 视频已渲染导出，已包含画面、语音、字幕和 Cover，等待确认。",
    "Script and draft video are ready; human screen recording is the final recording step.":
      "剧本和 AI 视频已就绪，下一步才是分配录屏。",
    "Some required production items are missing.": "AI 视频制作阶段还在进行，等待剧本、AI 视频或 Cover 文件就绪。",
    "Project folder needs source material or direction.": "项目文件夹还缺素材或选题方向。",
    "Topic captured from the agent topic sheet.": "来自选题表，等待确认是否进入 AI 视频制作。",
    "Cover assets exist, but source footage/script was not found.": "已有封面素材，但缺剧本或 AI 视频。",
  })[reason] || reason;

const rowSummaryLabel = (item) => {
  const summary = String(item.summary || "").trim();
  if (/^(video\s+title|title|subtitle|视频标题|标题|副标题)$/i.test(summary)) return "";
  if (looksLikeTechnicalCaptionSummary(summary)) return "";
  if (summary && !/cloud asset\(s\) found in Google Drive/i.test(summary)) return summary;
  return "";
};

const cleanDisplayText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const titleKey = (value) => cleanDisplayText(value).toLowerCase();

const usableDisplayTitle = (value) => {
  const text = cleanDisplayText(value);
  if (!text) return "";
  if (/^(video\s+title|title|subtitle|视频标题|标题|副标题)$/i.test(text)) return "";
  if (/cloud asset\(s\) found in Google Drive/i.test(text)) return "";
  if (looksLikeTechnicalCaptionSummary(text)) return "";
  return text;
};

const firstDisplayTitle = (...values) => values.map(usableDisplayTitle).find(Boolean) || "";

const secondaryDisplayTitle = (primary, values, fallbackSecondary = "") => {
  const primaryKey = titleKey(primary);
  return [...values, fallbackSecondary].map(usableDisplayTitle).find((value) => titleKey(value) !== primaryKey) || "";
};

const itemTitleDisplay = (item, fallbackSecondary = "") => {
  const decision = currentDecision(item);
  const baseTitle = usableDisplayTitle(item.title);
  const confirmedCoverTitle = firstDisplayTitle(decision.cover_zh_title, decision.cover_title);
  if (confirmedCoverTitle) {
    return {
      primary: confirmedCoverTitle,
      secondary: secondaryDisplayTitle(
        confirmedCoverTitle,
        [decision.cover_zh_subtitle, decision.cover_subtitle, baseTitle],
        fallbackSecondary
      ),
      source: "confirmed_cover",
    };
  }

  const coverTitle = firstDisplayTitle(item.cover_copy?.locales?.zh?.title, item.cover_copy?.title);
  const coverSubtitle = firstDisplayTitle(item.cover_copy?.locales?.zh?.subtitle, item.cover_copy?.subtitle);
  const coverTitleIsTrusted =
    coverTitle && (item.cover_copy?.source === "cover_image_ocr" || decision.workflow_step === "cover_done");
  if (coverTitleIsTrusted) {
    return {
      primary: coverTitle,
      secondary: secondaryDisplayTitle(coverTitle, [coverSubtitle, baseTitle], fallbackSecondary),
      source: item.cover_copy?.source === "cover_image_ocr" ? "cover_image_ocr" : "confirmed_cover",
    };
  }

  const summary = rowSummaryLabel(item);
  const hasReadableSummary = summary && titleKey(summary) !== titleKey(baseTitle);
  return {
    primary: hasReadableSummary ? summary : baseTitle || item.ref,
    secondary: hasReadableSummary ? secondaryDisplayTitle(summary, [baseTitle], fallbackSecondary) : fallbackSecondary,
    source: hasReadableSummary ? "script_or_reference" : "project_title",
  };
};

const rowTitleBlockHtml = (item) => {
  const title = itemTitleDisplay(item);
  return `
            <div class="row-title">${escapeHtml(title.primary)}</div>
            ${title.secondary ? `<p class="row-summary">${escapeHtml(title.secondary)}</p>` : ""}`;
};

const coverSourceLabel = (item) => {
  const source = item.cover_copy.source;
  if (source === "cover_image_ocr") return "标题和副标题来自最终封面文字识别，可继续人工修改。";
  if (hasCoverAsset(item)) return "已找到最终封面，暂未识别出封面文字；可先点封面预览确认。";
  if (source === "voiceover_markdown") return "标题和副标题根据脚本初步提炼，可继续人工修改。";
  if (source === "project_folder_name") return "当前未读取到脚本正文，先根据项目名生成候选。";
  return "标题默认取项目文件夹名，副标题默认留空；下面是可选方向。";
};

const items = () => state?.batch?.items || [];

const currentDecision = (item) => state?.decisions?.[item.id] || item.decision || {};

const itemDisplayId = (item) => item.display_id || item.content_id || String(item.id || "").replace(/^(video|topic)-/, "") || item.ref;

const itemFilename = (item) =>
  item.filename || item.file_name || item.source_assets?.find((asset) => asset.name)?.name || item.title || item.ref;

const itemKickerHtml = (item) => `
  <div class="queue-code">
    <span>${escapeHtml(item.ref)}</span>
    <span>ID ${escapeHtml(itemDisplayId(item))}</span>
  </div>`;

const rowFilenameHtml = (item) => {
  const filename = itemFilename(item);
  return filename && filename !== item.title
    ? `<p class="row-filename"><span>Filename</span>${escapeHtml(filename)}</p>`
    : "";
};

const itemAssetCount = (item, type) => item.source_assets.filter((asset) => asset.type === type).length;

const requiredAssetKeys = ["voiceover", "draft_video", "cover"];

const missingCheckPriority = {
  voiceover: 0,
  draft_video: 1,
  cover: 2,
  raw_video: 3,
  cover_source: 4,
};

const assetReviewLabel = (check) => check.label;

const assetReviewOverrides = (item) => {
  const value = currentDecision(item).asset_overrides;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
};

const requiredChecks = (item) =>
  (item.required_checks || []).map((check) => {
    const override = assetReviewOverrides(item)[check.key];
    if (override === "rejected") {
      return {
        ...check,
        ready: false,
        manually_rejected: true,
        hint: `${check.label}已被人工标记为不对，需要重新补齐。`,
      };
    }
    return check;
  });

const missingCheck = (item, key) => requiredChecks(item).some((check) => check.key === key && !check.ready);

const hasReadyCheck = (item, key) => requiredChecks(item).some((check) => check.key === key && check.ready);

const sortMissingChecks = (checks) =>
  checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) => (missingCheckPriority[a.check.key] ?? 99) - (missingCheckPriority[b.check.key] ?? 99) || a.index - b.index)
    .map(({ check }) => check);

const missingRequiredChecks = (item) => sortMissingChecks(requiredChecks(item).filter((check) => !check.ready));

const missingRequiredKeys = (item) => missingRequiredChecks(item).map((check) => check.key);

const missingRequiredLabels = (item) => missingRequiredChecks(item).map((check) => check.label);

const missingRequiredLabelText = (item) => missingRequiredLabels(item).join("、");

const aiVideoReady = (item) =>
  hasReadyCheck(item, "voiceover") && hasReadyCheck(item, "draft_video") && (hasReadyCheck(item, "cover") || hasCoverAsset(item));

const screenRecordingReady = (item) => itemAssetCount(item, "raw_video") > 0;

const aiVideoApproved = (item) => ["ai_video_approved", "assigned_recording"].includes(currentDecision(item).workflow_step);

const readyForHumanRecording = (item) => aiVideoApproved(item) && aiVideoReady(item) && !screenRecordingReady(item);

const channelEvidenceCount = (item, key) => Number(item.rule?.evidence?.[key] || 0) || itemAssetCount(item, key);

const hasYoutubeExport = (item) => channelEvidenceCount(item, "youtube_export") > 0;

const hasShortsExport = (item) => channelEvidenceCount(item, "shorts_export") > 0;

const hasVideoAccountExport = (item) => channelEvidenceCount(item, "video_account_export") > 0;

const hasSocialExport = (item) => channelEvidenceCount(item, "social_export") > 0;

const hasAnyChannelExport = (item) => hasYoutubeExport(item) || hasShortsExport(item) || hasVideoAccountExport(item) || hasSocialExport(item);

const selectedChannelExportChecks = (item) => {
  const selected = selectedOrDefaultOutputChannels(item);
  const checks = [];
  const youtubeLanguages = ["YouTube 中文", "YouTube English"].filter((channel) => selected.has(channel));

  if (youtubeLanguages.length > 0) {
    checks.push({
      key: "youtube_export",
      label: youtubeLanguages.length > 1 ? "YouTube 中文/English" : youtubeLanguages[0],
      ready: channelEvidenceCount(item, "youtube_export") >= youtubeLanguages.length,
    });
  }

  if (selected.has("YouTube Shorts")) {
    checks.push({
      key: "shorts_export",
      label: "YouTube Shorts",
      ready: hasShortsExport(item),
    });
  }

  if (selected.has("视频号")) {
    checks.push({
      key: "video_account_export",
      label: "视频号",
      ready: hasVideoAccountExport(item),
    });
  }

  if (selected.has("Twitter") || selected.has("X")) {
    checks.push({
      key: "social_export",
      label: selected.has("X") ? "X" : "Twitter",
      ready: hasSocialExport(item),
    });
  }

  return checks;
};

const hasRequiredChannelExports = (item) => {
  const checks = selectedChannelExportChecks(item);
  return checks.length > 0 && checks.every((check) => check.ready);
};

const hasChannelExport = (item) => item.stage === "distribution_ready" || hasAnyChannelExport(item);

const hasCoverAsset = (item) => item.source_assets.some((asset) => asset.type === "cover");

const selectedOutputsRequireCover = (item) => selectedOutputsFor(item).some((output) => output.cover_required);

const isDone = (item) => item.status === "done" || item.stage === "published";

const isWorkflowDone = (item) => {
  const decision = currentDecision(item);
  return isDone(item) || (Boolean(decision.workflow_done) && hasDistributionApprovals(decision));
};

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
  const coverReady = hasCoverAsset(item) || decision.workflow_step === "cover_done";
  const coverRequired = selectedOutputsRequireCover(item);
  if (hasRequiredChannelExports(item) && (!coverRequired || coverReady)) return "distribution_confirm";
  if (hasChannelExport(item) && coverRequired && !coverReady) return "editing";
  if (decision.workflow_step === "delivery_requested") return "editing";
  if (item.stage === "editing" || decision.workflow_step === "editing") return "editing";
  if (hasAiProductionRequest(item)) return aiVideoReady(item) ? "waiting_upload" : "assignment";
  if (item.stage === "idea") return "topic_board";
  if (readyForHumanRecording(item)) return "recording";
  if (aiVideoApproved(item) && screenRecordingReady(item)) {
    if (decision.workflow_step === "material_reviewed") return "edit_output";
    if (decision.action !== "approve") return "material_review";
    return "edit_output";
  }
  if (aiVideoReady(item)) return "waiting_upload";
  if (item.stage === "script_ready") return "topic_board";
  if (item.stage === "assets_ready") return "material_review";
  if (decision.workflow_step === "material_reviewed") return "edit_output";
  if (decision.action !== "approve") return "material_review";
  return "edit_output";
};

const workflowLabel = (item) =>
  ({
    topic_board: "选题表",
    assignment: "AI 视频制作中",
    recording: "待录制",
    waiting_upload: "待确认 AI 视频",
    material_review: "待进入后期",
    edit_output: "待进入后期",
    editing: "后期剪辑中",
    distribution_confirm: "待确认分发",
    done: "已完成",
    blocked: "阻塞",
  })[workflowQueue(item)] || "全部";

const nextStepLabel = (item) => {
  const queue = workflowQueue(item);
  if (queue === "waiting_upload") {
    const missingText = missingRequiredLabelText(item);
    return missingText ? `等待 AI 制作补齐${missingText}` : "确认 AI 视频的画面、语音、字幕和 Cover";
  }
  return ({
    topic_board: "确认选题和剧本是否进入 AI 视频制作",
    assignment: "创建 AI 制作任务后，由 HyperFrames/Remotion 渲染 AI 视频与 Cover",
    recording: "AI 视频已确认，等待人类录屏",
    material_review: "确认录屏素材后交给后期剪辑",
    edit_output: "交给后期开始剪辑导出",
    editing: "生成后期交付任务，完成渠道视频、Shorts、分发资料并补齐 AI 制作包中的 Cover",
    distribution_confirm: "Kelly 和 Kelvin 都确认完成状态",
    done: "流程已完成",
    blocked: "先处理阻塞原因",
  })[queue] || "检查视频状态";
};

const detailTitle = (item) =>
  ({
    topic_board: "选题方向确认",
    assignment: "AI 视频制作",
    recording: "等待录制",
    waiting_upload: "AI 视频确认",
    material_review: "进入后期确认",
    edit_output: "进入后期确认",
    editing: "后期剪辑中",
    distribution_confirm: "双人完成确认",
    done: "已完成",
    blocked: "阻塞处理",
  })[workflowQueue(item)] || item.title;

const detailDescription = (item) =>
  ({
    topic_board: "选题里已经包含剧本；先确认方向和剧本是否进入 AI 视频制作。",
    assignment: "剧本已经确认；创建 AI 制作任务后，由 HyperFrames/Remotion 生成 AI 视频和 Cover。",
    recording: "AI 视频已确认，开始分配或等待人类录屏。",
    waiting_upload: "AI 视频已经可以预览；确认画面、语音、字幕和 Cover 后再分配录屏。",
    material_review: "录屏素材已出现，确认质量后交给后期剪辑。",
    edit_output: "录屏已确认，准备交给后期开始剪辑导出。",
    editing: "后期正在剪辑；统一处理渠道视频、Shorts、分发资料，并确保 AI 制作包里的 Cover 已齐。",
    distribution_confirm: "Kelly 和 Kelvin 都核对同一条完成状态；两个人都确认后才进入已完成。",
    done: "这条视频流程已完成。",
    blocked: "先处理阻塞原因。",
  })[workflowQueue(item)] || reasonLabel(item.reason);

const approveButtonLabel = (item) => {
  const queue = workflowQueue(item);
  if (queue === "waiting_upload" && aiVideoReady(item)) return "AI 视频确认通过";
  return ({
    topic_board: "确定选题",
    assignment: currentDecision(item).workflow_step === "ai_video_production_requested" ? "AI 制作任务已创建" : "创建 AI 制作任务",
    recording: "等待录屏",
    waiting_upload: "等待 AI 视频",
    material_review: "进入后期",
    edit_output: "开始剪辑",
    editing: "等待导出",
    distribution_confirm: "确认分发",
    done: "已完成",
    blocked: "已阻塞",
  })[queue] || "批准";
};

const distributionApprovalBarHtml = (item) => {
  if (workflowQueue(item) !== "distribution_confirm") return "";
  const decision = currentDecision(item);
  const approvalCount = distributionApprovalCount(decision);

  return `
    <div class="drawer-approval-strip">
      <div class="drawer-approval-main">
        <div class="drawer-approval-title">
          <strong>双人确认</strong>
          <span>${approvalCount}/${distributionApprovers.length}</span>
        </div>
        <p class="drawer-approval-copy">Kelly 和 Kelvin 都确认同一条视频已完成后，才会进入已完成。</p>
      </div>
    </div>`;
};

const distributionApprovalChecksHtml = (item, locked) => {
  if (workflowQueue(item) !== "distribution_confirm") return "";
  const approvals = distributionApprovals(currentDecision(item));

  return `
    <div class="drawer-approval-checks">
      ${distributionApprovers
        .map(
          ({ key, name, role }) => `
            <label class="drawer-approval-check">
              <input type="checkbox" data-distribution-approval="${escapeHtml(key)}" ${approvals[key] ? "checked" : ""} ${locked ? "disabled" : ""} />
              <span>${escapeHtml(name)}</span>
              <small>${escapeHtml(role)}</small>
            </label>`
        )
        .join("")}
    </div>`;
};

const statusDisplayLabel = (item) => {
  if (isWorkflowDone(item)) return "已完成";
  if (isBlocked(item)) return "阻塞";
  return statusLabel(item.status);
};

const filterMatch = (item, filter) => {
  if (filter === "dashboard") return true;
  if (filter === "all") return true;
  if (filter === "material_review") return ["material_review", "edit_output"].includes(workflowQueue(item));
  return workflowQueue(item) === filter;
};

const requiredCheckSummary = (item) =>
  requiredChecks(item)
    .map((check) => `${check.ready ? "✓" : "缺"}${check.label}`)
    .join(" · ");

const assetTypes = {
  source: ["voiceover", "script", "transcript", "production_manifest", "production_project", "draft_video", "raw_video", "cover_source", "cover"],
  sourceCore: ["voiceover", "script", "transcript", "production_manifest", "production_project", "draft_video", "raw_video", "cover_source"],
  exports: ["youtube_export", "shorts_export", "video_account_export", "social_export"],
  cover: ["cover"],
};

const filterAssetsByTypes = (assetsByType, types) =>
  Object.fromEntries(types.filter((type) => assetsByType[type]?.length).map((type) => [type, assetsByType[type]]));

const hasAssets = (assetsByType) => Object.keys(assetsByType).length > 0;

const mergeAssetGroups = (...groupsList) =>
  groupsList.reduce((merged, groups) => {
    Object.entries(groups || {}).forEach(([type, assets]) => {
      if (!assets?.length) return;
      merged[type] = [...(merged[type] || []), ...assets];
    });
    return merged;
  }, {});

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

const canPreviewAsset = (asset) => Boolean(asset.preview_url || asset.drive_file_id);

const drivePreviewUrl = (fileId) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;

const assetPreviewUrl = (asset) => asset.preview_url || drivePreviewUrl(asset.drive_file_id);

const assetOpenUrl = (asset) => asset.folder_url || asset.absolute_path || "";

const assetDownloadUrl = (asset) =>
  asset.drive_file_id ? `/api/download/${encodeURIComponent(asset.drive_file_id)}` : "";

const driveThumbnailUrl = (fileId) =>
  fileId ? `/api/thumbnail/${encodeURIComponent(fileId)}` : "";

const visualAssetTypes = new Set([
  "draft_video",
  "raw_video",
  "youtube_export",
  "shorts_export",
  "video_account_export",
  "social_export",
  "cover",
  "cover_source",
]);

const assetThumbnailUrl = (asset) => asset.thumbnail_url || driveThumbnailUrl(asset.drive_file_id);

const assetThumbLabel = (asset) => {
  if (asset.type === "cover" || asset.type === "cover_source") return "封面";
  if (asset.type === "youtube_export") return "YouTube";
  if (asset.type === "shorts_export") return "Shorts";
  if (asset.type === "video_account_export") return "视频号";
  if (asset.type === "social_export") return "社媒导出";
  if (asset.type === "production_project") return "工程";
  if (asset.type === "production_manifest") return "Manifest";
  return "视频";
};

const assetThumbClass = (asset) =>
  asset.type === "shorts_export" ? "asset-thumb portrait" : "asset-thumb landscape";

const exportAssetTypes = new Set(["youtube_export", "shorts_export", "video_account_export", "social_export"]);

const thumbnailFallbackUrl = (asset, { coverThumbnailFileId = "" } = {}) => {
  if (!exportAssetTypes.has(asset.type) || !coverThumbnailFileId || coverThumbnailFileId === asset.drive_file_id) return "";
  return driveThumbnailUrl(coverThumbnailFileId);
};

const assetThumbnailHtml = (asset, { showThumbnails = false, coverThumbnailFileId = "" } = {}) => {
  if (!showThumbnails || !visualAssetTypes.has(asset.type)) return "";
  const thumbnailUrl = assetThumbnailUrl(asset);
  const fallbackUrl = thumbnailFallbackUrl(asset, { coverThumbnailFileId });
  const fallback = assetThumbLabel(asset);
  const imageError = fallbackUrl
    ? `this.onerror=null; this.src='${escapeHtml(fallbackUrl)}';`
    : "this.remove()";
  return `
    <button type="button" class="${assetThumbClass(asset)}" ${canPreviewAsset(asset) ? `data-preview-file="${escapeHtml(asset.preview_url || asset.drive_file_id)}" data-preview-title="${escapeHtml(asset.name)}"` : ""} aria-label="预览 ${escapeHtml(asset.name)}" title="预览 ${escapeHtml(asset.name)}">
      ${thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="${imageError}" />` : ""}
      <span>${escapeHtml(fallback)}</span>
    </button>`;
};

const openFilePreview = (fileId, title) => {
  const preview = $("#videoPreview");
  const frame = $("#videoPreviewFrame");
  const titleNode = $("#videoPreviewTitle");
  if (!preview || !frame || !titleNode || !fileId) return;
  titleNode.textContent = title || "文件预览";
  frame.src = drivePreviewUrl(fileId);
  preview.hidden = false;
};

const openAssetPreview = (assetRef, title) => {
  const asset = items()
    .flatMap((item) => item.source_assets || [])
    .find((candidate) => candidate.drive_file_id === assetRef || candidate.preview_url === assetRef);
  if (!asset) {
    openFilePreview(assetRef, title);
    return;
  }
  const preview = $("#videoPreview");
  const frame = $("#videoPreviewFrame");
  const titleNode = $("#videoPreviewTitle");
  if (!preview || !frame || !titleNode) return;
  titleNode.textContent = title || asset.name || "文件预览";
  frame.src = assetPreviewUrl(asset);
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
  const engine = productionEngine(item);
  const profile = brandProfile(item);

  return `
    <section class="section compact">
      <div class="section-title">
        <h4>生产信息</h4>
        <p>${queue === "topic_board" ? "选题里已经带剧本；确认后进入 AI 视频制作。" : queue === "assignment" ? "选择渲染引擎和品牌规则，再生成 AI 制作任务。" : "记录负责人、交付时间和最后录屏进度。"}</p>
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
            ${["未分配", "AI 视频制作中", "待录屏", "录制中", "已上传"].map((value) => `<option value="${escapeHtml(value)}" ${value === recordingStatus ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
          </select>
        </label>
        ${
          queue === "assignment"
            ? `<label>
                <span>制作引擎</span>
                <select id="productionEngine" ${locked ? "disabled" : ""}>
                  <option value="hyperframes" ${engine === "hyperframes" ? "selected" : ""}>HyperFrames</option>
                  <option value="remotion" ${engine === "remotion" ? "selected" : ""}>Remotion</option>
                </select>
              </label>
              <label>
                <span>品牌封面</span>
                <select id="brandProfile" ${locked ? "disabled" : ""}>
                  <option value="project" ${profile === "project" ? "selected" : ""}>项目品牌（通用）</option>
                  <option value="buda" ${profile === "buda" ? "selected" : ""}>Buda 品牌</option>
                </select>
              </label>`
            : ""
        }
      </div>
    </section>`;
};

const scriptPreviewText = (item) => {
  const body = String(item.body || "").trim();
  if (body) return body.length > 8000 ? `${body.slice(0, 8000).trim()}\n\n...` : body;
  const summary = String(item.summary || "").trim();
  return summary && !/cloud asset\(s\) found in Google Drive/i.test(summary) ? summary : "";
};

const splitMarkdownTableRow = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isMarkdownSeparatorRow = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const isLooseStoryboardRow = (line) => {
  if (!String(line || "").includes("|") || isMarkdownSeparatorRow(line)) return false;
  return splitMarkdownTableRow(line).filter(Boolean).length >= 3;
};

const headerLooksLikeStoryboard = (headers) => {
  const text = headers.join(" ");
  return /分镜|镜头|序号|#|时长|时间|画面|场景|台词|旁白|文案|voice|line|visual|scene/i.test(text);
};

const scriptStoryboardRows = (text) => {
  const lines = String(text || "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line, index) => {
    if (!line.includes("|") || !isMarkdownSeparatorRow(lines[index + 1] || "")) return false;
    const headers = splitMarkdownTableRow(line).join(" ");
    return headerLooksLikeStoryboard(splitMarkdownTableRow(line));
  });

  let headers = [];
  let dataLines = [];
  if (headerIndex >= 0) {
    headers = splitMarkdownTableRow(lines[headerIndex]);
    dataLines = lines.slice(headerIndex + 2).filter((line) => line.includes("|") && !isMarkdownSeparatorRow(line));
  } else {
    const looseStart = lines.findIndex(isLooseStoryboardRow);
    if (looseStart < 0) return [];
    const looseLines = [];
    for (const line of lines.slice(looseStart)) {
      if (!isLooseStoryboardRow(line)) break;
      looseLines.push(line);
    }
    if (looseLines.length < 2) return [];
    const firstRow = splitMarkdownTableRow(looseLines[0]);
    const firstRowIsHeader = headerLooksLikeStoryboard(firstRow) && !/^\d+$/.test(firstRow[0] || "");
    headers = firstRowIsHeader ? firstRow : ["#", "时长", "画面", "台词", "备注"].slice(0, Math.max(firstRow.length, 3));
    dataLines = firstRowIsHeader ? looseLines.slice(1) : looseLines;
  }

  const shotIndex = headers.findIndex((header) => /分镜|镜头|shot/i.test(header));
  const durationIndex = headers.findIndex((header) => /时长|时间|duration|time/i.test(header));
  const visualIndex = headers.findIndex((header) => /画面|视觉|visual|scene/i.test(header));
  const lineIndex = headers.findIndex((header) => /台词|旁白|文案|voice|line/i.test(header));
  const rows = [];

  for (const line of dataLines) {
    if (!line.includes("|") || isMarkdownSeparatorRow(line)) continue;
    const cells = splitMarkdownTableRow(line);
    const shot = cells[shotIndex >= 0 ? shotIndex : 0] || "";
    const duration = durationIndex >= 0 ? cells[durationIndex] || "" : "";
    const visual = cells[visualIndex >= 0 ? visualIndex : duration ? 2 : 1] || "";
    const spoken = cells[lineIndex >= 0 ? lineIndex : duration ? 3 : 2] || "";
    if (shot || visual || spoken) rows.push({ shot, visual, spoken });
  }

  return rows;
};

const scriptPreviewHtml = (item) => {
  const text = scriptPreviewText(item);
  if (!text) return "";
  const rows = scriptStoryboardRows(text);
  return `
    <section class="section script-preview-section">
      <div class="section-title">
        <h4>剧本</h4>
        <p>选题里已经带剧本；确认分镜、画面和台词后进入 AI 视频制作。</p>
      </div>
      ${
        rows.length
          ? `<div class="script-table-wrap">
              <table class="script-storyboard-table">
                <thead>
                  <tr>
                    <th>分镜</th>
                    <th>画面</th>
                    <th>台词</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (row) => `
                        <tr>
                          <td>${escapeHtml(row.shot)}</td>
                          <td>${escapeHtml(row.visual)}</td>
                          <td>${escapeHtml(row.spoken)}</td>
                        </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<pre class="script-preview-text">${escapeHtml(text)}</pre>`
      }
    </section>`;
};

const recordingBriefHtml = (item) => {
  const queue = workflowQueue(item);
  if (queue !== "recording") return "";
  return `
    <section class="section">
      <div class="section-title">
        <h4>录制要求</h4>
        <p>录屏是 AI 视频确认后的最后一个人类生产环节。</p>
      </div>
      <div class="brief-box">
        <p>先确认 AI 视频，再录屏；AI 视频里已经有画面、语音、字幕和 Cover。</p>
        <ul>
          <li>浏览器缩放固定 100%，画面不要出现通知、无关窗口、个人信息或水印。</li>
          <li>按已确认 AI 视频的节奏录屏，关键点击、输入、页面切换处稍微停顿。</li>
          <li>开头和结尾各预留 1 秒静止画面，方便后期剪辑。</li>
          <li>交付录屏素材即可；录屏里不要额外加字幕。</li>
          <li>命名建议用 <code>screen-recording-xx.mp4</code> 或项目文件名加 <code>-recording.mp4</code>。</li>
        </ul>
      </div>
    </section>`;
};

const editBriefHtml = (item) => {
  const queue = workflowQueue(item);
  if (["topic_board", "assignment", "waiting_upload", "distribution_confirm", "done"].includes(queue)) return "";
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
        <h4>AI 视频检查</h4>
        <p>进入录屏前先确认这三项。</p>
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

const assetReviewHtml = (item, locked) => {
  const queue = workflowQueue(item);
  if (!["waiting_upload", "material_review", "edit_output"].includes(queue)) return "";
  const overrides = assetReviewOverrides(item);
  const checks = requiredAssetKeys
    .map((key) => requiredChecks(item).find((check) => check.key === key))
    .filter(Boolean);
  if (checks.length === 0) return "";

  return `
    <section class="section compact asset-review">
      <div class="section-title">
        <h4>素材核对</h4>
        <p>文件存在但内容不对时，在这里标记；保存后会按缺失处理。</p>
      </div>
      <div class="asset-review-grid">
        ${checks
          .map(
            (check) => `
              <label class="asset-review-row ${overrides[check.key] === "rejected" ? "rejected" : ""}">
                <input type="checkbox" data-asset-reject="${escapeHtml(check.key)}" ${overrides[check.key] === "rejected" ? "checked" : ""} ${locked ? "disabled" : ""} />
                <span>
                  <strong>${escapeHtml(assetReviewLabel(check))}不对</strong>
                  <small>${escapeHtml(check.count ? `Drive 已找到 ${check.count} 个文件，可人工退回。` : "当前自动识别为缺失。")}</small>
                </span>
              </label>`
          )
          .join("")}
      </div>
    </section>`;
};

const productionProjectFilesHtml = (item, assetsByType) => {
  const queue = workflowQueue(item);
  const projectAssets = [...(assetsByType.production_manifest || []), ...(assetsByType.production_project || [])];
  const manifest = item.production_manifest || {};
  const manifestRows = [
    ["Repo", manifest.repo],
    ["PR", manifest.pr],
    ["Commit", manifest.commit],
    ["Engine", manifest.engine],
    ["Project path", manifest.project_path],
    ["Preview", manifest.preview_url],
  ].filter(([, value]) => value);
  const exports = manifest.exports && typeof manifest.exports === "object" ? Object.entries(manifest.exports).filter(([, value]) => value) : [];
  if (!["assignment", "waiting_upload"].includes(queue) || (projectAssets.length === 0 && manifestRows.length === 0 && exports.length === 0)) return "";
  return `
    <section class="section compact">
      <div class="section-title">
        <h4>AI 工程文件</h4>
        <p>HyperFrames/Remotion 源文件、PR/commit 或 R2 预览 manifest；它们说明制作进度，但不替代导出的 AI 视频。</p>
      </div>
      ${
        manifestRows.length || exports.length
          ? `<div class="brief-box">
              ${manifestRows
                .map(
                  ([label, value]) => `
                    <p><strong>${escapeHtml(label)}：</strong>${/^https?:\/\//i.test(String(value)) ? `<a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>` : escapeHtml(value)}</p>`
                )
                .join("")}
              ${
                exports.length
                  ? `<ul>${exports.map(([label, value]) => `<li>${escapeHtml(label)}：${escapeHtml(value)}</li>`).join("")}</ul>`
                  : ""
              }
            </div>`
          : ""
      }
      ${
        projectAssets.length
          ? assetGroupsHtml({
              production_manifest: assetsByType.production_manifest || [],
              production_project: assetsByType.production_project || [],
            })
          : ""
      }
    </section>`;
};

const assetMoreDetailsHtml = (asset) => {
  const rows = [
    ["文件路径", asset.path],
    ["上传/更新", assetTimeLabel(asset)],
    ["创建/上传账号", assetAccountLabel(asset)],
  ].filter(([, value]) => value);

  if (rows.length === 0) return "";

  return `
    <details class="asset-more">
      <summary aria-label="查看更多文件信息" title="查看更多文件信息">...</summary>
      <div class="asset-more-body">
        ${rows
          .map(
            ([label, value]) => `
              <div class="asset-detail-line">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </div>`
          )
          .join("")}
      </div>
    </details>`;
};

const assetGroupsHtml = (assetsByType, options = {}) => `
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
                        ${assetThumbnailHtml(asset, options)}
                        <div class="asset-main">
                          <span class="asset-name">${escapeHtml(asset.name)}</span>
                        </div>
                        <div class="asset-side">
                          <small class="asset-size">${escapeHtml(formatBytes(asset.size))}</small>
                          <div class="asset-actions">
                            ${
                              canPreviewAsset(asset)
                                ? `<button type="button" class="asset-action" data-preview-file="${escapeHtml(asset.preview_url || asset.drive_file_id)}" data-preview-title="${escapeHtml(asset.name)}">预览</button>`
                                : ""
                            }
                            <a class="asset-action" href="${escapeHtml(assetOpenUrl(asset))}" target="_blank" rel="noreferrer" title="${escapeHtml(asset.folder_url ? "打开所在 Google Drive 文件夹" : "打开 Google Drive 文件")}">云端打开</a>
                            ${
                              assetDownloadUrl(asset)
                                ? `<a class="asset-action" href="${escapeHtml(assetDownloadUrl(asset))}" download title="下载 ${escapeHtml(asset.name)}">下载</a>`
                                : ""
                            }
                            ${assetMoreDetailsHtml(asset)}
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
  const coverThumbnailFileId =
    assetsByType.cover?.find((asset) => asset.drive_file_id)?.drive_file_id ||
    item.source_assets?.find((asset) => asset.type === "cover" && asset.drive_file_id)?.drive_file_id ||
    "";
  return `
    <section class="section">
      <div class="section-title">
        <h4>素材文件</h4>
        <p>来自在线 Google Drive，只做读取和引用。</p>
      </div>
      ${assetGroupsHtml(assetsByType, { showThumbnails: queue === "distribution_confirm", coverThumbnailFileId })}
    </section>`;
};

const archivedAssetsHtml = (item, assetsByType, options = {}) => {
  if (!hasAssets(assetsByType)) return "";
  const open = options.defaultOpen || openArchivedAssetIds.has(item.id);
  return `
    <details class="section archived-assets" data-archived-assets="${escapeHtml(item.id)}" ${open ? "open" : ""}>
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
  const missing = missingRequiredChecks(item);
  if (missing.length === 0) return "";
  return `
    <section class="section compact">
      <div class="section-title">
        <h4>当前缺项</h4>
        <p>AI 视频制作阶段等待这些内容就绪。</p>
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

const outputSpecsHtml = (output) => {
  const specs = [output.aspect_ratio, output.caption ? "字幕" : "", output.cover_required ? "封面" : ""].filter(Boolean);
  return `<span class="output-specs">${specs.map((spec) => `<span>${escapeHtml(spec)}</span>`).join("")}</span>`;
};

const outputRowHtml = (output, selectedOutputs, locked) => `
  <label class="output-row">
    <span class="output-main">
      <input type="checkbox" data-output="${escapeHtml(output.channel)}" ${selectedOutputs.has(output.channel) ? "checked" : ""} ${locked ? "disabled" : ""} />
      <span>${escapeHtml(output.channel)}</span>
    </span>
    ${outputSpecsHtml(output)}
  </label>`;

const publishOutputRowHtml = (output, selectedOutputs, publishedLinks, locked) => {
  const checked = selectedOutputs.has(output.channel);
  const value = publishedLinks[output.channel] || (output.channel.startsWith("YouTube ") ? publishedLinks.YouTube || "" : "");
  return `
    <label class="publish-output-row">
      <span class="publish-output-check">
        <input type="checkbox" data-output="${escapeHtml(output.channel)}" ${checked ? "checked" : ""} ${locked ? "disabled" : ""} />
        <span>${escapeHtml(output.channel)}</span>
      </span>
      ${outputSpecsHtml(output)}
      <input type="url" data-published-link="${escapeHtml(output.channel)}" value="${escapeHtml(value)}" placeholder="${checked ? "https://..." : "勾选后填写链接"}" ${locked || !checked ? "disabled" : ""} />
    </label>`;
};

const outputsHtml = (item, selectedOutputs, locked) => {
  const queue = workflowQueue(item);
  if (!["material_review", "edit_output", "editing", "distribution_confirm", "done"].includes(queue)) return "";
  const title = queue === "done" ? "已交付渠道" : "输出渠道";
  const description =
    queue === "done"
      ? "记录这条视频实际交付或发布的平台。"
      : ["material_review", "edit_output"].includes(queue)
        ? "在进入后期前确定实际交付平台；后续自动按这些平台检查导出是否齐。"
        : "选择实际交付平台，未交付的取消勾选。";
  return `
    <section class="section">
      <div class="section-title">
        <h4>${title}</h4>
        <p>${description}</p>
      </div>
      <div class="output-grid">
        ${item.outputs.map((output) => outputRowHtml(output, selectedOutputs, locked)).join("")}
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
  if (!["distribution_confirm", "done"].includes(queue)) return "";
  const decision = currentDecision(item);
  const selectedOutputs = selectedOutputsForPublishing(item, decision);
  const publishedLinks =
    decision.published_links && typeof decision.published_links === "object" && !Array.isArray(decision.published_links)
      ? decision.published_links
      : {};
  return `
    <section class="section form-section">
      <div class="section-title">
        <h4>发布渠道和链接</h4>
        <p>${queue === "done" ? "勾选实际已经发布的平台；勾选后在同一行填写公开链接。" : "勾选需要交付或已发布的平台；发布后在同一行填写公开链接。"}</p>
      </div>
      <div class="publish-output-list">
        ${item.outputs.map((output) => publishOutputRowHtml(output, selectedOutputs, publishedLinks, locked)).join("")}
      </div>
	    </section>`;
};

const distributionCopyCardHtml = (item, decision, output, selectedOutputs, locked) => {
  const checked = selectedOutputs.has(output.channel);
  const copy = distributionCopyEntry(item, decision, output.channel);
  return `
    <div class="distribution-copy-card ${checked ? "" : "disabled"}" data-distribution-copy-card="${escapeHtml(output.channel)}">
      <div class="distribution-copy-head">
        <strong>${escapeHtml(output.channel)}</strong>
        ${checked ? "" : '<span class="distribution-copy-state">未选</span>'}
        ${outputSpecsHtml(output)}
      </div>
      <label class="field">
        <span>发布标题</span>
        <input data-distribution-copy-title="${escapeHtml(output.channel)}" value="${escapeHtml(copy.title)}" ${locked ? "disabled" : ""} />
      </label>
      <label class="field">
        <span>发布正文</span>
        <textarea data-distribution-copy-body="${escapeHtml(output.channel)}" ${locked ? "disabled" : ""}>${escapeHtml(copy.body)}</textarea>
      </label>
    </div>`;
};

const distributionCopyHtml = (item, locked) => {
  const queue = workflowQueue(item);
  if (!["distribution_confirm", "done"].includes(queue)) return "";
  const decision = currentDecision(item);
  const selectedOutputs = selectedOutputsForPublishing(item, decision);
  return `
    <section class="section form-section distribution-copy-section">
      <div class="section-title">
        <h4>各平台发布内容</h4>
        <p>按当前勾选平台预填，可直接改成最终发布文案；取消勾选的平台会停用。</p>
      </div>
      <div class="distribution-copy-list">
        ${item.outputs.map((output) => distributionCopyCardHtml(item, decision, output, selectedOutputs, locked)).join("")}
      </div>
    </section>`;
};

const detailBodyHtml = (item, assetsByType, selectedOutputs, decision, locked) => {
  const queue = workflowQueue(item);
  const sourceAssets = filterAssetsByTypes(assetsByType, assetTypes.source);
  const sourceCoreAssets = filterAssetsByTypes(assetsByType, assetTypes.sourceCore);
  const exportAssets = filterAssetsByTypes(assetsByType, assetTypes.exports);
  const coverAssets = filterAssetsByTypes(assetsByType, assetTypes.cover);
  const distributionAssets = hasAssets(exportAssets) ? mergeAssetGroups(coverAssets, exportAssets) : assetsByType;
  const scriptSection = scriptPreviewHtml(item);

  const bodies = {
    topic_board: `
      ${topicBriefHtml(item)}
      ${scriptSection}
      ${productionMetaHtml(item, locked)}
      ${queueGuideHtml("选题判断", "这一阶段只看方向本身，不检查素材。", [
        "是否符合 Buda 当前传播重点",
        "是否有清楚的受众和使用场景",
        "剧本里的分镜、画面和台词是否能进入 AI 视频制作",
      ])}`,
    assignment: `
      ${topicBriefHtml(item)}
      ${scriptSection}
      ${productionMetaHtml(item, locked)}
      ${productionProjectFilesHtml(item, assetsByType)}
      ${missingFocusHtml(item)}
      ${archivedAssetsHtml(item, sourceAssets, { defaultOpen: true })}
      ${queueGuideHtml("AI 视频制作", "HyperFrames/Remotion 根据剧本生成视频，渲染后导出到 Google Drive。", [
        "AI 视频应包含画面、语音和字幕",
        "Cover 文件也应随 AI 视频一起出现",
        "视频和 Cover 出现后会进入待确认 AI 视频",
      ])}`,
    recording: `
      ${scriptSection}
      ${productionMetaHtml(item, locked)}
      ${assetsHtml(item, sourceCoreAssets)}
      ${recordingBriefHtml(item)}
      ${queueGuideHtml("等待录屏", "AI 视频已确认，等录制人按最终方案完成录屏。", [
        "确认录制人已经看过 AI 视频",
        "等录屏素材上传到 Google Drive",
        "录屏出现后会进入后期确认",
      ])}`,
    waiting_upload: `
      ${scriptSection}
      ${requiredChecksHtml(item)}
      ${productionProjectFilesHtml(item, assetsByType)}
      ${assetsHtml(item, sourceAssets)}
      ${assetReviewHtml(item, locked)}`,
    material_review: `
      ${scriptSection}
      ${assetReviewHtml(item, locked)}
      ${outputsHtml(item, selectedOutputs, locked)}
      ${assetsHtml(item, sourceCoreAssets)}
      ${queueGuideHtml("检查重点", "确认录屏是否真的能进入后期剪辑。", [
        "AI 视频已经确认通过",
        "录屏画面是否清楚，是否有敏感信息",
        "后期是否能基于录屏和 AI 视频继续剪辑",
      ])}`,
    edit_output: `
      ${scriptSection}
      ${editBriefHtml(item)}
      ${assetReviewHtml(item, locked)}
      ${outputsHtml(item, selectedOutputs, locked)}
      ${assetsHtml(item, sourceCoreAssets)}
      ${archivedAssetsHtml(item, coverAssets)}`,
    editing: `
      ${scriptSection}
      ${editBriefHtml(item)}
      ${outputsHtml(item, selectedOutputs, locked)}
      ${assetsHtml(item, sourceCoreAssets)}
      ${queueGuideHtml("后期剪辑中", "后期已经开始处理录屏和 AI 视频，等待导出视频上传到渠道文件夹。", [
        `等待 ${channelRequirementLabel(item)} 文件夹出现导出视频`,
        "Shorts 有就一起确认，没有也不阻断待确认分发",
        "导出视频与 AI 制作包里的 Covers 都齐了会自动进入待确认分发",
      ])}
      ${archivedAssetsHtml(item, coverAssets)}`,
    distribution_confirm: `
      ${scriptSection}
      ${assetsHtml(item, distributionAssets)}
      ${distributionCopyHtml(item, locked)}
      ${publishedLinksHtml(item, locked)}`,
    done: `
      ${scriptSection}
      ${doneSummaryHtml(item, selectedOutputs)}
      ${distributionCopyHtml(item, locked)}
      ${publishedLinksHtml(item, locked)}
      ${archivedAssetsHtml(item, assetsByType)}`,
    blocked: `
      ${scriptSection}
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
  if (queue === "waiting_upload") return "AI 视频备注";
  if (queue === "done") return "归档备注";
  return "审核备注";
};

const reviewNoteHint = (item) => {
  const queue = workflowQueue(item);
  if (queue === "topic_board") return "记录选题判断、受众、角度或是否需要先放弃。";
  if (queue === "assignment") return "记录 AI 视频制作负责人、交付时间或渲染注意事项。";
  if (queue === "recording") return "记录录制进度、交付风险或提醒事项。";
  if (queue === "waiting_upload") return "记录 AI 视频确认意见，是否可以进入录屏。";
  if (queue === "done") return "记录发布后的补充说明、异常或复盘事项。";
  return "写给后期、设计或分发同事看的具体动作。";
};

const reviewNotePlaceholder = (item) => {
  const queue = workflowQueue(item);
  if (queue === "topic_board") return "例如：适合演示哪类场景，是否先放弃。";
  if (queue === "assignment") return "例如：负责人、交付时间或录屏注意事项。";
  if (queue === "recording") return "例如：录制进度、风险或需要提醒的动作。";
  if (queue === "waiting_upload") {
    const missingText = missingRequiredLabelText(item);
    return missingText ? `例如：${missingText} - 小明周五前补齐。` : "例如：AI 视频确认通过，可以进入录屏。";
  }
  if (queue === "done") return "例如：发布链接异常、复盘事项或补充说明。";
  return "例如：给后期、设计或分发同事的具体动作。";
};

const filteredItems = () =>
  items().filter((item) => {
    const text = `${itemDisplayId(item)} ${itemFilename(item)} ${item.title} ${item.summary} ${item.stage} ${item.status} ${item.outputs
      .map((output) => output.channel)
      .join(" ")}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesFilter = filterMatch(item, activeFilter);
    return matchesSearch && matchesFilter;
  });

const dashboardItems = (predicate) =>
  items().filter((item) => {
    const text = `${itemDisplayId(item)} ${itemFilename(item)} ${item.title} ${item.summary} ${workflowLabel(item)} ${publishedChannelEntries(item)
      .map((entry) => entry.channel)
      .join(" ")}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && predicate(item);
  });

const compactDateLabel = (value) => {
  if (!value) return "未定";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const dashboardItemButtonHtml = (item, options = {}) => {
  const decision = currentDecision(item);
  const queue = workflowQueue(item);
  const links = publishedChannelEntries(item).filter((entry) => entry.url);
  const selectedChannels = publishedChannelEntries(item).map((entry) => entry.channel);
  const missing = missingRequiredLabels(item);
  const meta = options.meta || (queue === "done" ? "已发布" : workflowLabel(item));
  const detail =
    options.detail ||
    (links.length
      ? links.map((entry) => entry.channel).join(" / ")
      : selectedChannels.length
        ? selectedChannels.join(" / ")
        : missing.length
          ? `❌ 缺 ${missing.join("、")}`
          : nextStepLabel(item));
  const title = itemTitleDisplay(item, detail);

  return `
    <button class="dashboard-item ${activeId === item.id ? "active" : ""}" data-dashboard-id="${escapeHtml(item.id)}" type="button">
      <div>
        <span class="dashboard-item-kicker">${escapeHtml(`${item.ref} / ID ${itemDisplayId(item)}`)}</span>
        <strong>${escapeHtml(title.primary)}</strong>
        <small>${escapeHtml(title.secondary)}</small>
      </div>
      <div class="dashboard-item-meta">
        <span>${escapeHtml(meta)}</span>
        ${decision.due_date ? `<small>${escapeHtml(compactDateLabel(decision.due_date))}</small>` : ""}
      </div>
    </button>`;
};

const dashboardPublishedHtml = (publishedItems) => {
  if (!publishedItems.length) {
    return `<div class="dashboard-empty">还没有记录发布链接的视频。</div>`;
  }

  return publishedItems
    .map((item) => {
      const entries = publishedChannelEntries(item);
      const title = itemTitleDisplay(item);
      return `
        <div class="published-dashboard-row">
          <button class="published-title" data-dashboard-open="${escapeHtml(item.id)}" type="button">
            <span>${escapeHtml(`${item.ref} / ID ${itemDisplayId(item)}`)}</span>
            <strong>${escapeHtml(title.primary)}</strong>
            ${title.secondary ? `<small>${escapeHtml(title.secondary)}</small>` : ""}
          </button>
          <div class="published-channel-list">
            ${
              entries.length
                ? entries
                    .map(
                      (entry) =>
                        entry.url
                          ? `
                        <a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer">
                          ${escapeHtml(entry.channel)}
                        </a>`
                          : `<span class="published-channel-missing">${escapeHtml(entry.channel)} · 未填链接</span>`
                    )
                    .join("")
                : `<span class="dashboard-muted">已完成，未填公开链接</span>`
            }
          </div>
        </div>`;
    })
    .join("");
};

const isDueThisWeek = (item) => {
  const due = currentDecision(item).due_date;
  if (!due || workflowQueue(item) === "done") return false;
  const time = new Date(due).getTime();
  if (!Number.isFinite(time)) return false;
  const end = new Date();
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return time <= end.getTime();
};

const dashboardStatusBadgesHtml = (item, detail) => {
  const missing = missingRequiredLabels(item);
  const badges = missing.length
    ? missing.map((label) => ({ label: `缺 ${label}`, tone: "risk" }))
    : detail
      ? [{ label: detail.replace(/^❌\s*/, ""), tone: "muted" }]
      : [];
  const dueDate = currentDecision(item).due_date;
  if (dueDate) badges.push({ label: compactDateLabel(dueDate), tone: "date" });
  return badges.length
    ? `<div class="dashboard-status-badges">${badges
        .map((badge) => `<span class="dashboard-status-badge ${escapeHtml(badge.tone)}">${escapeHtml(badge.label)}</span>`)
        .join("")}</div>`
    : "";
};

const dashboardStatusCardHtml = (item, options = {}) => {
  const queue = workflowQueue(item);
  const missing = missingRequiredLabelText(item);
  const channels = publishedChannelEntries(item).map((entry) => entry.channel).join(" / ");
  const detail =
    options.detail ||
    (queue === "done"
      ? channels || "已完成"
      : queue === "waiting_upload"
        ? `❌ 缺 ${missing || "素材"}`
        : queue === "recording" || queue === "assignment"
          ? `${productionOwner(item)} · ${productionDueDate(item)}`
          : nextStepLabel(item));
  const meta = options.meta || workflowLabel(item);
  const title = itemTitleDisplay(item);

  return `
    <button class="dashboard-status-card" data-dashboard-open="${escapeHtml(item.id)}" type="button">
      <div class="dashboard-status-top">
        <span>${escapeHtml(`${item.ref} · ID ${itemDisplayId(item)}`)}</span>
        <span>${escapeHtml(meta)}</span>
      </div>
      <strong>${escapeHtml(title.primary)}</strong>
      ${title.secondary ? `<p>${escapeHtml(title.secondary)}</p>` : ""}
      ${dashboardStatusBadgesHtml(item, detail)}
    </button>`;
};

const dashboardSectionEmoji = {
  选题表: "📝",
  "AI 视频制作中": "👤",
  "待确认 AI 视频": "🧩",
  待录制: "🎥",
  待进入后期: "🚪",
  后期剪辑中: "✂️",
  待确认分发: "✅",
  本期计划要发: "🗓️",
  "已完成：发在哪里": "📍",
  阻塞: "⛔",
};

const dashboardSectionTitleHtml = (title) => `
  <h4>
    <span class="dashboard-section-emoji" aria-hidden="true">${escapeHtml(dashboardSectionEmoji[title] || "•")}</span>
    <span>${escapeHtml(title)}</span>
  </h4>`;

const dashboardSectionHtml = ({ title, count, sectionItems, empty, meta, detail }) => `
  <section class="dashboard-section">
    <div class="dashboard-section-title">
      ${dashboardSectionTitleHtml(title)}
      <span>${count}</span>
    </div>
    <div class="dashboard-card-grid">
      ${
        sectionItems.length
          ? sectionItems.map((item) => dashboardStatusCardHtml(item, { meta: meta?.(item), detail: detail?.(item) })).join("")
          : `<div class="dashboard-empty">${escapeHtml(empty)}</div>`
      }
      ${count > sectionItems.length ? `<div class="dashboard-more-note">还有 ${count - sectionItems.length} 条，可从左侧队列进入查看。</div>` : ""}
    </div>
  </section>`;

const dashboardMasonryColumnCount = (width) => {
  if (width >= 1680) return 4;
  if (width <= 760) return 1;
  if (width <= 1280) return 2;
  return 3;
};

const layoutDashboardMasonry = () => {
  const flow = document.querySelector(".dashboard-section-flow");
  if (!flow) return;
  const sections = Array.from(flow.querySelectorAll(".dashboard-section"));
  if (!sections.length) {
    flow.style.height = "0px";
    return;
  }
  const gap = 22;
  const columnCount = dashboardMasonryColumnCount(flow.clientWidth);
  const columnWidth = (flow.clientWidth - gap * (columnCount - 1)) / columnCount;
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  sections.forEach((section) => {
    section.style.width = `${columnWidth}px`;
    section.style.transform = "translate(0, 0)";
  });
  sections.forEach((section) => {
    const columnIndex = columnHeights.indexOf(Math.min(...columnHeights));
    section.style.transform = `translate(${Math.round((columnWidth + gap) * columnIndex)}px, ${Math.round(columnHeights[columnIndex])}px)`;
    columnHeights[columnIndex] += section.offsetHeight + gap;
  });
  flow.style.height = `${Math.max(...columnHeights) - gap}px`;
};

const scheduleDashboardMasonry = () => {
  requestAnimationFrame(layoutDashboardMasonry);
};

const renderDashboard = () => {
  const topicItems = dashboardItems((item) => workflowQueue(item) === "topic_board");
  const assignmentItems = dashboardItems((item) => workflowQueue(item) === "assignment");
  const recordingItems = dashboardItems((item) => workflowQueue(item) === "recording");
  const missingItems = dashboardItems((item) => workflowQueue(item) === "waiting_upload");
  const materialReviewItems = dashboardItems((item) => ["material_review", "edit_output"].includes(workflowQueue(item)));
  const editingItems = dashboardItems((item) => workflowQueue(item) === "editing");
  const distributionItems = dashboardItems((item) => workflowQueue(item) === "distribution_confirm");
  const doneItems = dashboardItems((item) => workflowQueue(item) === "done");
  const blockedItems = dashboardItems((item) => workflowQueue(item) === "blocked");
  const publishedItems = dashboardItems((item) => workflowQueue(item) === "done" || Object.keys(publishedLinksFor(item)).length > 0);
  const plannedPublishItems = dashboardItems((item) => ["distribution_confirm", "editing"].includes(workflowQueue(item)));
  const thisWeekOutputItems = dashboardItems((item) => isDueThisWeek(item) && ["material_review", "edit_output"].includes(workflowQueue(item)));
  const publishedLinkCount = publishedItems.reduce(
    (total, item) => total + publishedChannelEntries(item).filter((entry) => entry.url).length,
    0
  );

  $("#videoList").innerHTML = `
    <div class="dashboard-board">
      <section class="dashboard-kpi-strip">
        <div><strong>${distributionItems.length}</strong><span>待确认分发</span></div>
        <div><strong>${publishedItems.length}</strong><span>已发布/已完成</span></div>
        <div><strong>${publishedLinkCount}</strong><span>已填发布链接</span></div>
        <div><strong>${plannedPublishItems.length}</strong><span>本期计划要发</span></div>
        <div><strong>${thisWeekOutputItems.length}</strong><span>本周预计输出</span></div>
        <div><strong>${missingItems.length}</strong><span>AI 视频待确认</span></div>
      </section>

      <div class="dashboard-section-flow">
        ${dashboardSectionHtml({
          title: "待确认分发",
          count: distributionItems.length,
          sectionItems: distributionItems.slice(0, 6),
          empty: "没有等待确认分发的视频。",
          meta: () => "待确认分发",
          detail: (item) => decisionDisplayLabel(item, currentDecision(item)),
        })}
        ${dashboardSectionHtml({
          title: "本期计划要发",
          count: plannedPublishItems.length,
          sectionItems: plannedPublishItems.slice(0, 6),
          empty: "本期暂时没有计划发布的视频。",
          meta: (item) => workflowLabel(item),
          detail: (item) => nextStepLabel(item),
        })}
        ${dashboardSectionHtml({
          title: "后期剪辑中",
          count: editingItems.length,
          sectionItems: editingItems.slice(0, 6),
          empty: "当前没有后期剪辑中的视频。",
          meta: () => "后期剪辑中",
          detail: (item) => nextStepLabel(item),
        })}
        <section class="dashboard-section dashboard-published-wide">
          <div class="dashboard-section-title">${dashboardSectionTitleHtml("已完成：发在哪里")}<span>${doneItems.length}</span></div>
          ${dashboardPublishedHtml(doneItems)}
        </section>
        ${dashboardSectionHtml({
          title: "待确认 AI 视频",
          count: missingItems.length,
          sectionItems: missingItems.slice(0, 6),
          empty: "没有等待确认 AI 视频的视频。",
          meta: (item) => productionOwner(item),
          detail: (item) => (missingRequiredLabelText(item) ? `❌ 缺 ${missingRequiredLabelText(item)}` : "确认 AI 视频"),
        })}
        ${dashboardSectionHtml({
          title: "待进入后期",
          count: materialReviewItems.length,
          sectionItems: materialReviewItems.slice(0, 6),
          empty: "没有等待进入后期的视频。",
          meta: (item) => workflowLabel(item),
          detail: (item) => nextStepLabel(item),
        })}
        ${dashboardSectionHtml({
          title: "待录制",
          count: recordingItems.length,
          sectionItems: recordingItems.slice(0, 6),
          empty: "没有等待录制的视频。",
          meta: (item) => recordingStatusLabel(item),
          detail: (item) => `${productionOwner(item)} · ${productionDueDate(item)}`,
        })}
        ${dashboardSectionHtml({
          title: "AI 视频制作中",
          count: assignmentItems.length,
          sectionItems: assignmentItems.slice(0, 6),
          empty: "没有正在等待 AI 视频制作的选题。",
          meta: () => "AI 视频制作中",
          detail: (item) => nextStepLabel(item),
        })}
        ${dashboardSectionHtml({
          title: "选题表",
          count: topicItems.length,
          sectionItems: topicItems.slice(0, 6),
          empty: "选题表里暂时没有待判断的视频方向。",
          meta: (item) => topicPriorityLabel(item),
          detail: (item) => topicHintLabel(item),
        })}
        ${dashboardSectionHtml({
          title: "阻塞",
          count: blockedItems.length,
          sectionItems: blockedItems.slice(0, 6),
          empty: "没有阻塞的视频。",
          meta: () => "阻塞",
          detail: (item) => currentDecision(item).comment || nextStepLabel(item),
        })}
      </div>
    </div>`;

  document.querySelectorAll("[data-dashboard-open]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo({ id: button.dataset.dashboardOpen, detailOpen: true });
    });
  });
  scheduleDashboardMasonry();
};

const humanWorkflowQueues = ["topic_board", "assignment", "waiting_upload", "recording", "material_review", "editing", "distribution_confirm"];
const executionWorkflowQueues = ["edit_output"];
const workflowPriority = [
  "blocked",
  "distribution_confirm",
  "editing",
  "edit_output",
  "material_review",
  "waiting_upload",
  "recording",
  "assignment",
  "topic_board",
];

const needsHumanAction = (item) => humanWorkflowQueues.includes(workflowQueue(item));

const readyForSkillExecution = (item) => {
  const queue = workflowQueue(item);
  const decision = currentDecision(item);
  return decision.action === "approve" && executionWorkflowQueues.includes(queue);
};

const primaryActionQueue = (humanItems, blockedItems) => {
  if (blockedItems.length) return "blocked";
  return workflowPriority.find((queue) => humanItems.some((item) => workflowQueue(item) === queue)) || "";
};

const primaryActionLabel = (humanItems, blockedItems, executionItems) => {
  if (blockedItems.length) return "先处理阻塞说明，解除后回到对应流程";

  const primaryQueue = primaryActionQueue(humanItems, blockedItems);
  if (primaryQueue === "topic_board") return "确认选题和剧本是否进入 AI 视频制作";
  if (primaryQueue === "assignment") return "等待 HyperFrames/Remotion 导出 AI 视频";
  if (primaryQueue === "recording") return "等待录屏完成并上传素材";
  if (primaryQueue === "waiting_upload") return "确认 AI 视频的画面、语音、字幕和 Cover";
  if (primaryQueue === "material_review") return "确认录屏素材并交给后期剪辑";
  if (primaryQueue === "edit_output") return "开始后期剪辑";
  if (primaryQueue === "editing") return "等待后期导出所选渠道视频";
  if (primaryQueue === "distribution_confirm") return "Kelly 和 Kelvin 都确认同一条完成状态";
  if (executionItems.length) return "已有批准项，等待 skill 执行下一步";
  return "暂无需要你处理的事项";
};

const primaryActionCountLabel = (humanItems, blockedItems) => {
  if (blockedItems.length) return "阻塞待处理";

  const primaryQueue = primaryActionQueue(humanItems, blockedItems);
  if (primaryQueue === "topic_board") return "待确认选题";
  if (primaryQueue === "assignment") return "AI 视频制作中";
  if (primaryQueue === "recording") return "待录制";
  if (primaryQueue === "waiting_upload") return "待确认 AI 视频";
  if (primaryQueue === "material_review") return "待进入后期";
  if (primaryQueue === "edit_output") return "待进入后期";
  if (primaryQueue === "editing") return "后期剪辑中";
  if (primaryQueue === "distribution_confirm") return "待确认分发";
  return "待人工处理";
};

const primaryActionItems = (humanItems, blockedItems) => {
  if (blockedItems.length) return blockedItems;

  const primaryQueue = primaryActionQueue(humanItems, blockedItems);
  return primaryQueue ? humanItems.filter((item) => workflowQueue(item) === primaryQueue) : humanItems;
};

const renderActionPanel = () => {
  const all = items();
  const humanItems = all.filter(needsHumanAction);
  const executionItems = all.filter(readyForSkillExecution);
  const blockedItems = all.filter(isBlocked);
  const primaryItems = primaryActionItems(humanItems, blockedItems);
  const primaryQueue = primaryActionQueue(humanItems, blockedItems);
  const primaryFilter = primaryQueue === "blocked" ? "blocked" : filters.find(([key]) => key === primaryQueue)?.[0] || "";

  $("#approvalPanel").innerHTML = `
    <div class="approval-kicker">需要你</div>
    <h2>人类操作审批区</h2>
    <p>${escapeHtml(primaryActionLabel(humanItems, blockedItems, executionItems))}</p>
    <button type="button" class="approval-primary" ${primaryFilter ? `data-primary-filter="${escapeHtml(primaryFilter)}"` : "disabled"}>
      <strong>${primaryItems.length}</strong>
      <span>${escapeHtml(primaryActionCountLabel(humanItems, blockedItems))}</span>
    </button>
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
  $("#approvalPanel").querySelector("[data-primary-filter]")?.addEventListener("click", (event) => {
    navigateTo({ filter: event.currentTarget.dataset.primaryFilter, id: null, detailOpen: false });
  });
};

const renderFilters = () => {
  const counts = Object.fromEntries(filters.map(([key]) => [key, items().filter((item) => filterMatch(item, key)).length]));

  $("#filters").innerHTML = filters
    .map(
      ([key, label]) => `
        <button class="filter-button ${activeFilter === key ? "active" : ""}" data-filter="${key}" title="Filter: ${label}">
          <span class="filter-short" aria-hidden="true">${escapeHtml(label.slice(0, 1))}</span>
          <span class="filter-label">${label}</span>
          <span class="count">${counts[key] || 0}</span>
        </button>`
    )
    .join("");

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      closeMobileSidebar();
      navigateTo({ filter: button.dataset.filter, id: null, detailOpen: false });
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
  if (activeFilter === "dashboard") {
    $("#metrics").innerHTML = "";
    $("#metrics").hidden = true;
    return;
  }
  $("#metrics").hidden = false;
  const all = items();
  const value = (predicate) => all.filter(predicate).length;
  const cards = [
    ["待确认分发", value((item) => workflowQueue(item) === "distribution_confirm"), "导出和最终封面已齐"],
    ["待确认 AI 视频", value((item) => workflowQueue(item) === "waiting_upload"), "剧本、AI 视频和 Cover 待确认"],
    ["AI 视频制作中", value((item) => workflowQueue(item) === "assignment"), "AI 视频与 Cover 一起制作"],
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
  if (activeFilter === "dashboard") {
    renderDashboard();
    return;
  }
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
      <span>ID / Title / Filename</span>
      <span>来源</span>
      <span>优先级</span>
      <span>负责人</span>
      <span>交付时间</span>
      <span>提示</span>
    </div>`
    : isRecordingPlanView
      ? `<div class="list-header recording-header">
      <span>ID / Title / Filename</span>
      <span>阶段</span>
      <span>负责人</span>
      <span>交付时间</span>
      <span>录制状态</span>
      <span>提示</span>
    </div>`
      : isMaterialGapView
        ? `<div class="list-header gap-header">
      <span>ID / Title / Filename</span>
      <span>阶段</span>
      <span>负责人/交付</span>
      <span>脚本</span>
      <span>AI 视频</span>
      <span>Cover</span>
    </div>`
      : isOverviewView
        ? `<div class="list-header overview-header">
      <span>ID / Title / Filename</span>
      <span>阶段</span>
      <span>负责人</span>
      <span>交付时间</span>
      <span>脚本</span>
      <span>AI 视频</span>
      <span>Cover</span>
      <span>提示</span>
    </div>`
    : `<div class="list-header">
      <span>ID / Title / Filename</span>
      <span>阶段</span>
      <span>状态</span>
      <span>脚本</span>
      <span>AI 视频</span>
      <span>Cover</span>
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
            ${itemKickerHtml({ ...item, ref: item.ref.replace(/^Video/i, "Topic") })}
            ${rowTitleBlockHtml(item)}
            ${rowFilenameHtml(item)}
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
        const missingRequired = missingRequiredChecks(item);
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
              const count = check?.count || (item.source_assets || []).filter((asset) => asset.type === key).length;
              return `
                    <div class="asset-cell" data-label="${escapeHtml(check?.label || key)}">
                      <span class="asset-state ${check?.ready ? "ready" : "missing"}">${check?.ready ? `✓ ${count || 1}` : "❌ 缺"}</span>
                    </div>`;
            })
            .join("");
        return `
        <button class="video-row ${rowViewClass} ${activeId === item.id ? "active" : ""}" data-id="${item.id}" data-stage="${escapeHtml(item.stage)}">
          <div class="video-main">
            ${itemKickerHtml(item)}
            ${rowTitleBlockHtml(item)}
            ${rowFilenameHtml(item)}
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
                ${materialStateCells(requiredAssetKeys)}`
              : isOverviewView
                ? `
                <div class="asset-cell" data-label="负责人">
                  <span class="inline-text">${escapeHtml(owner)}</span>
                </div>
                <div class="asset-cell" data-label="交付时间">
                  <span class="inline-text">${escapeHtml(dueDate)}</span>
                </div>
                ${materialStateCells(requiredAssetKeys)}`
              : requiredChecks(item)
                  .map((check, index) => `
                    ${index === 0 ? `<div class="status-cell" data-label="状态">
                      <span class="status-text">${escapeHtml(statusDisplayLabel(item))}</span>
                    </div>` : ""}
                    <div class="asset-cell" data-label="${escapeHtml(check.label)}">
                      <span class="asset-state ${check.ready ? "ready" : "missing"}">${check.ready ? "✓" : "❌ 缺"} ${escapeHtml(check.label)}</span>
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
      navigateTo({ id: button.dataset.id, detailOpen: true });
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
  const selectedOutputs = selectedOutputsForPublishing(item, decision);
  const assetsByType = item.source_assets.reduce((groups, asset) => {
    const key = asset.type;
    groups[key] = groups[key] || [];
    groups[key].push(asset);
    return groups;
  }, {});
  const missingRequired = missingRequiredChecks(item);
  const queue = workflowQueue(item);
  const allowAiVideoApproval = queue === "waiting_upload" && aiVideoReady(item);
  const approveDisabled =
    locked || isWorkflowDone(item) || ["assignment", "recording", "editing"].includes(queue) || (queue === "waiting_upload" && !allowAiVideoApproval);
  const workflowText = workflowLabel(item);
  const statusText = statusDisplayLabel(item);
  const drawerTitle = itemTitleDisplay(item);

  $("#detailPane").innerHTML = `
    ${onboardingHtml()}
    <div class="drawer-top">
      <div>
        <span class="drawer-kicker">${escapeHtml(`视频详情 · ${item.ref} · ID ${itemDisplayId(item)}`)}</span>
        <strong>${escapeHtml(drawerTitle.primary)}</strong>
        ${drawerTitle.secondary ? `<small>${escapeHtml(drawerTitle.secondary)}</small>` : ""}
      </div>
      <button class="drawer-close" id="closeDetail" aria-label="关闭详情" title="关闭详情">×</button>
    </div>
    <div class="detail-header">
      <div>
        <h3>${escapeHtml(detailTitle(item))}</h3>
        <p>${escapeHtml(detailDescription(item))}</p>
        <div class="detail-meta-grid">
          <div>
            <span>ID</span>
            <strong>${escapeHtml(itemDisplayId(item))}</strong>
          </div>
          <div>
            <span>Filename</span>
            <strong>${escapeHtml(itemFilename(item))}</strong>
          </div>
          <div>
            <span>Title</span>
            <strong>${escapeHtml(drawerTitle.primary)}</strong>
          </div>
        </div>
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
      <textarea id="reviewNote" ${locked ? "disabled" : ""} placeholder="${escapeHtml(reviewNotePlaceholder(item))}">${escapeHtml(decision.comment || "")}</textarea>
    </section>

    <div class="drawer-actions">
      ${distributionApprovalBarHtml(item)}
      <div class="drawer-action-buttons">
        ${distributionApprovalChecksHtml(item, locked)}
        ${
          queue === "done"
            ? `<button class="action-button primary" data-action="${escapeHtml(decision.action || "approve")}" ${locked ? "disabled" : ""} title="保存已发布链接">保存链接</button>`
            : `<button class="action-button primary" data-action="approve" ${approveDisabled ? "disabled" : ""} title="${queue === "recording" ? "录屏上传后会进入后期确认" : queue === "waiting_upload" ? "剧本、AI 视频和 Cover 齐了才能确认通过" : queue === "editing" ? "等渠道导出视频出现后自动进入下一步" : queue === "distribution_confirm" ? "保存当前勾选的分发确认；Kelly 和 Kelvin 都确认后才进入已完成" : isWorkflowDone(item) ? "这条视频已确认完成" : "确认进入下一步"}">${escapeHtml(approveButtonLabel(item))}</button>`
        }
        ${
          queue === "assignment"
            ? `<button class="action-button primary" data-action="approve" data-workflow-step="ai_video_production_requested" data-execute-handoff="true" ${locked ? "disabled" : ""} title="生成 HyperFrames 或 Remotion 的 AI 制作任务，并调用统一封面交付模式">${currentDecision(item).workflow_step === "ai_video_production_requested" ? "重新生成 AI 制作任务" : "生成 AI 制作任务"}</button>`
            : ""
        }
        ${
          queue === "editing"
            ? `<button class="action-button primary" data-action="approve" data-workflow-step="delivery_requested" data-execute-handoff="true" ${locked ? "disabled" : ""} title="生成统一后期交付任务，包含渠道视频、Shorts 和分发资料">${currentDecision(item).workflow_step === "delivery_requested" ? "重新生成后期交付任务" : "生成后期交付任务"}</button>`
            : ""
        }
        ${queue === "done" ? "" : `<button class="action-button" data-save-only="true" data-action="${escapeHtml(decision.action || "")}" ${locked ? "disabled" : ""} title="只保存负责人、交付时间、录制状态和备注，不推进流程">保存信息</button>`}
        <details class="drawer-more-actions">
          <summary>更多</summary>
          <div>
            <button class="action-button" data-action="revise" ${locked ? "disabled" : ""} title="保存修改意见">要修改</button>
            ${queue === "distribution_confirm" ? "" : `<button class="action-button danger" data-action="block" ${locked ? "disabled" : ""} title="缺素材或方向，先阻塞">阻塞</button>`}
            <button class="action-button" data-action="no_action" ${locked ? "disabled" : ""} title="这条暂时跳过">跳过</button>
          </div>
        </details>
      </div>
      <span class="action-feedback" id="actionFeedback" role="status" aria-live="polite"></span>
    </div>`;

  const setActionFeedback = (text = "", tone = "") => {
    const feedback = $("#actionFeedback");
    if (!feedback) return;
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  };

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      const wasEditing = editing;
      editing = true;
      button.disabled = true;
      button.textContent = "保存中…";
      button.dataset.state = "saving";
      setActionFeedback("保存中…", "saving");
      try {
        const result = await saveDecision(item.id, button.dataset.action, {
          saveOnly: button.dataset.saveOnly === "true",
          workflowStep: button.dataset.workflowStep || "",
          reload: false,
        });
        if (result?.ok) {
          if (button.dataset.executeHandoff === "true") {
            button.textContent = "生成任务中…";
            setActionFeedback("生成任务中…", "saving");
            const handoff = await executeHandoff(item.id);
            const handoffResult = handoff.results?.find((entry) => entry.id === item.id && entry.status === "executed");
            if (!handoffResult) throw new Error("任务文件没有生成。");
            button.textContent = "任务已生成";
            setActionFeedback(handoffResult.kind === "ai_video_production" ? "AI 制作任务已生成" : "后期交付任务已生成", "success");
          } else {
            button.textContent = "保存成功";
            setActionFeedback("已保存", "success");
          }
          button.dataset.state = "success";
          await sleep(1600);
          editing = wasEditing;
          await loadState({ force: true });
          return;
        }
        button.textContent = "保存失败";
        button.dataset.state = "error";
        setActionFeedback("保存失败", "error");
        await sleep(1400);
        editing = wasEditing;
        button.disabled = false;
        button.textContent = originalText;
        button.dataset.state = "";
        setActionFeedback("");
      } catch (error) {
        console.error("Could not save decision:", error);
        showToast({
          title: "保存失败",
          message: error.message || "Could not save decision.",
          tone: "error",
          duration: 5200,
        });
        button.textContent = "保存失败";
        button.dataset.state = "error";
        setActionFeedback("保存失败", "error");
        await sleep(1400);
        editing = wasEditing;
        button.disabled = false;
        button.textContent = originalText;
        button.dataset.state = "";
        setActionFeedback("");
      }
    });
  });
  document.querySelectorAll(".publish-output-row [data-output]").forEach((input) => {
    input.addEventListener("change", () => {
      const row = input.closest(".publish-output-row");
      const linkInput = row?.querySelector("[data-published-link]");
      const copyCard = [...document.querySelectorAll("[data-distribution-copy-card]")].find(
        (card) => card.dataset.distributionCopyCard === input.dataset.output
      );
      if (locked) return;
      if (linkInput) {
        linkInput.disabled = !input.checked;
        linkInput.placeholder = input.checked ? "https://..." : "勾选后填写链接";
      }
      if (copyCard) {
        copyCard.classList.toggle("disabled", !input.checked);
        const stateBadge = copyCard.querySelector(".distribution-copy-state");
        if (stateBadge) stateBadge.remove();
        if (!input.checked) {
          copyCard.querySelector(".distribution-copy-head strong")?.insertAdjacentHTML("afterend", '<span class="distribution-copy-state">未选</span>');
        }
      }
      if (input.checked && linkInput) linkInput.focus();
    });
  });
  document.querySelectorAll("[data-preview-file]").forEach((button) => {
    button.addEventListener("click", () => {
      openAssetPreview(button.dataset.previewFile, button.dataset.previewTitle);
    });
  });
  document.querySelectorAll("[data-archived-assets]").forEach((details) => {
    details.addEventListener("toggle", () => {
      const id = details.dataset.archivedAssets;
      if (!id) return;
      if (details.open) openArchivedAssetIds.add(id);
      else openArchivedAssetIds.delete(id);
    });
  });
  $("#closeDetail")?.addEventListener("click", () => {
    navigateTo({ id: null, detailOpen: false }, { replace: true });
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

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const summarizeDriveSyncError = (error) => {
  const text = String(error || "");
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|PERMISSION_DENIED/i.test(text)) {
    return "当前 OAuth token 只有读取权限，缺少写入 Drive 状态文件的权限。";
  }
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
};

const toastTimers = new WeakMap();

const showToast = ({ title, message = "", tone = "success", duration = 3200 } = {}) => {
  let stack = $("#toastStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toastStack";
    stack.className = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    stack.setAttribute("aria-atomic", "false");
    document.body.append(stack);
  }
  if (!stack || !title) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    ${message ? `<span>${escapeHtml(message)}</span>` : ""}`;
  stack.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  const remove = () => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 180);
  };
  const timer = window.setTimeout(remove, duration);
  toastTimers.set(toast, timer);
  toast.addEventListener("click", () => {
    window.clearTimeout(toastTimers.get(toast));
    remove();
  });
};

const checkedDistributionApproverNames = (approvals = {}) =>
  distributionApprovers.filter(({ key }) => approvals[key]).map(({ name }) => name);

const savedActionToast = ({ item, action, options, decision }) => {
  const queue = item ? workflowQueue(item) : "";
  const synced = decision?.drive_sync?.synced === true;
  const syncText = synced ? "已同步到 Google Drive" : "已保存到当前工作台";

  if (queue === "distribution_confirm" && action === "approve") {
    const names = checkedDistributionApproverNames(decision?.distribution_approvals);
    const progress = `${distributionApprovalCount(decision)}/${distributionApprovers.length}`;
    return {
      title: names.length ? `${names.join("、")} 确认已保存` : "确认状态已保存",
      message: `${progress}，${syncText}`,
    };
  }

  if (options.saveOnly) return { title: "信息已保存", message: syncText };
  if (queue === "done") return { title: "发布链接已保存", message: syncText };

  return (
    {
      approve: { title: `${approveButtonLabel(item)}已保存`, message: syncText },
      revise: { title: "修改意见已保存", message: syncText },
      block: { title: "已标记阻塞", message: syncText },
      no_action: { title: "已记录跳过", message: syncText },
    }[action] || { title: "操作已保存", message: syncText }
  );
};

const saveDecision = async (id, action, options = {}) => {
  const item = items().find((candidate) => candidate.id === id);
  const decision = item ? currentDecision(item) : {};
  const outputInputs = [...document.querySelectorAll("[data-output]")];
  const outputs = outputInputs.length
    ? outputInputs.filter((input) => input.checked).map((input) => input.dataset.output)
    : Array.isArray(decision.outputs)
      ? decision.outputs
      : [...selectedOrDefaultOutputChannels(item)];
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
  const distributionCopyTitleInputs = [...document.querySelectorAll("[data-distribution-copy-title]")];
  const distributionCopyBodyInputs = [...document.querySelectorAll("[data-distribution-copy-body]")];
  const previousDistributionCopy = normalizeDistributionCopy(decision.distribution_copy);
  const distributionCopy =
    distributionCopyTitleInputs.length || distributionCopyBodyInputs.length
      ? Object.fromEntries(
          [
            ...new Set(
              [...distributionCopyTitleInputs, ...distributionCopyBodyInputs]
                .map((input) => input.dataset.distributionCopyTitle || input.dataset.distributionCopyBody)
                .filter(Boolean)
            ),
          ]
            .map((channel) => {
              const titleInput = distributionCopyTitleInputs.find((input) => input.dataset.distributionCopyTitle === channel);
              const bodyInput = distributionCopyBodyInputs.find((input) => input.dataset.distributionCopyBody === channel);
              const title = (titleInput?.value || "").trim();
              const body = (bodyInput?.value || "").trim();
              return title || body ? [channel, { title, body }] : null;
            })
            .filter(Boolean)
        )
      : previousDistributionCopy;
  const distributionApprovalInputs = [...document.querySelectorAll("[data-distribution-approval]")];
  const assetRejectInputs = [...document.querySelectorAll("[data-asset-reject]")];
  const previousAssetOverrides =
    decision.asset_overrides && typeof decision.asset_overrides === "object" && !Array.isArray(decision.asset_overrides)
      ? decision.asset_overrides
      : {};
  const assetOverrides = assetRejectInputs.length
    ? Object.fromEntries(
        requiredAssetKeys.map((key) => [
          key,
          assetRejectInputs.find((input) => input.dataset.assetReject === key)?.checked ? "rejected" : "",
        ])
      )
    : previousAssetOverrides;
  const nextDistributionApprovals = distributionApprovalInputs.length
    ? Object.fromEntries(
        distributionApprovers.map(({ key }) => [
          key,
          Boolean(distributionApprovalInputs.find((input) => input.dataset.distributionApproval === key)?.checked),
        ])
      )
    : distributionApprovals(decision);
  const nextDistributionDecision = {
    ...decision,
    distribution_approvals: nextDistributionApprovals,
  };
  const queue = item ? workflowQueue(item) : "";
  const effectiveAction = options.saveOnly ? decision.action || "" : action;
  const workflowDone = Boolean(
    item && effectiveAction === "approve" && queue === "distribution_confirm" && hasDistributionApprovals(nextDistributionDecision)
  );
  const derivedWorkflowStep =
    effectiveAction === "approve" && queue === "topic_board"
      ? "topic_selected"
      : effectiveAction === "approve" && queue === "assignment"
        ? "topic_selected"
        : effectiveAction === "approve" && queue === "waiting_upload" && item && aiVideoReady(item)
          ? "ai_video_approved"
          : effectiveAction === "approve" && queue === "material_review"
          ? "material_reviewed"
        : effectiveAction === "approve" && queue === "edit_output"
          ? "editing"
          : decision.workflow_step || "";
  const workflowStep = options.workflowStep || derivedWorkflowStep;
  const selectedRecordingStatus = inputValue("#recordingStatus", recordingStatusLabel(item));
  const recordingStatus =
    effectiveAction === "approve" && queue === "waiting_upload" && (!selectedRecordingStatus || selectedRecordingStatus === "未分配")
      ? "待录屏"
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
      asset_overrides: assetOverrides,
      published_links: publishedLinkInputs.length ? publishedLinks : previousPublishedLinks,
      distribution_copy: distributionCopy,
      production_engine: inputValue("#productionEngine", decision.production_engine || "hyperframes"),
      brand_profile: inputValue("#brandProfile", decision.brand_profile || "project"),
      distribution_approvals: nextDistributionApprovals,
      workflow_step: workflowStep,
      workflow_done: workflowDone || Boolean(decision.workflow_done && hasDistributionApprovals(nextDistributionDecision)),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    showToast({
      title: "保存失败",
      message: error.error || "Could not save decision.",
      tone: "error",
      duration: 5200,
    });
    return { ok: false };
  }

  const result = await response.json();
  if (result.decision?.drive_sync?.error) {
    console.warn("Google Drive status sync failed:", result.decision.drive_sync.error);
    showToast({
      title: "已保存，Drive 同步失败",
      message: summarizeDriveSyncError(result.decision.drive_sync.error),
      tone: "warning",
      duration: 6200,
    });
  } else if (result.decision?.drive_sync?.synced === false) {
    showToast({
      title: "已保存到当前工作台",
      message: result.decision.drive_sync.reason || "尚未同步到 Google Drive 状态文件。",
      tone: "warning",
      duration: 5200,
    });
  } else {
    showToast(savedActionToast({ item, action: effectiveAction, options, decision: result.decision }));
  }

  if (options.reload !== false) {
    await loadState({ force: true });
  }
  return { ok: true, decision: result.decision };
};

const executeHandoff = async (id) => {
  const response = await fetch("/api/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Could not generate the production handoff.");
  }
  return (await response.json()).report || { results: [] };
};

const renderTop = () => {
  const batch = state?.batch;
  $("#batchMeta").textContent = batch ? `${batch.items.length} 个视频` : "暂无批次";
  $("#viewTitle").textContent = filters.find(([key]) => key === activeFilter)?.[1] || "All Videos";
  $("#viewSubtitle").textContent = batch?.generated_at ? `最近同步：${new Date(batch.generated_at).toLocaleString()}` : "请先同步视频库。";
  const syncButton = $("#syncButton");
  if (syncButton) {
    syncButton.disabled = syncing || Boolean(state?.lock);
    syncButton.querySelector("span:last-child").textContent = syncing ? "同步中" : "重新同步";
  }

  const lock = state?.lock;
  $("#lockStatus").hidden = !lock;
  $("#lockStatus").textContent = lock ? `同步中：${lock.message}` : "";
  $("#lockStatus").classList.toggle("locked", Boolean(lock));
};

const render = () => {
  if (!filters.some(([key]) => key === activeFilter)) {
    activeFilter = "dashboard";
  }
  const activeItem = activeId ? items().find((item) => item.id === activeId) : null;
  if (activeId && (!activeItem || !filterMatch(activeItem, activeFilter))) {
    if (activeItem) {
      activeFilter = workflowQueue(activeItem);
      detailOpen = true;
    } else {
      activeId = null;
      detailOpen = false;
    }
    syncRoute();
  }
  renderTop();
  renderSidebarState();
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
  const nextState = await response.json();
  const nextSnapshot = JSON.stringify(nextState);
  if (!force && stateSnapshot === nextSnapshot) return;
  state = nextState;
  stateSnapshot = nextSnapshot;
  render();
};

const syncNow = async () => {
  if (syncing) return;
  syncing = true;
  const previousCount = items().length;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180000);
  render();
  try {
    const response = await fetch("/api/sync", { method: "POST", cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showToast({
        title: "同步失败",
        message: error.error || "请稍后重试。",
        tone: "error",
        duration: 5200,
      });
      return;
    }
    const result = await response.json();
    await loadState({ force: true });
    const nextCount = Number(result.item_count || items().length || 0);
    const diff = nextCount - previousCount;
    if (diff !== 0) {
      $("#viewSubtitle").textContent = `刚刚同步：${nextCount} 个项目（${diff > 0 ? "+" : ""}${diff}）`;
    }
    showToast({
      title: "同步完成",
      message: `${nextCount} 个项目${diff !== 0 ? `（${diff > 0 ? "+" : ""}${diff}）` : ""}`,
    });
  } catch (error) {
    const message = error?.name === "AbortError" ? "同步超过 3 分钟还没有返回，后台可能仍在生成；稍后刷新页面再看。" : error.message || "同步失败，请稍后重试。";
    showToast({
      title: "同步失败",
      message,
      tone: "error",
      duration: 6200,
    });
  } finally {
    window.clearTimeout(timeout);
    syncing = false;
    render();
  }
};

$("#searchInput").addEventListener("input", (event) => {
  search = event.target.value;
  render();
});

$("#syncButton")?.addEventListener("click", syncNow);
$("#sidebarToggle")?.addEventListener("click", toggleSidebar);
$("#mobileSidebarButton")?.addEventListener("click", openMobileSidebar);
$("#sidebarBackdrop")?.addEventListener("click", closeMobileSidebar);

$("#drawerBackdrop").addEventListener("click", () => {
  navigateTo({ id: null, detailOpen: false }, { replace: true });
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
  if (mobileSidebarOpen) {
    closeMobileSidebar();
    return;
  }
  if (detailOpen) {
    navigateTo({ id: null, detailOpen: false }, { replace: true });
  }
});

document.addEventListener("focusin", (event) => {
  editing = ["INPUT", "TEXTAREA"].includes(event.target.tagName) && event.target.type !== "search";
});

document.addEventListener("focusout", () => {
  editing = false;
});

applyRouteFromHash();
window.addEventListener("hashchange", () => {
  applyRouteFromHash();
  render();
});
window.addEventListener("resize", () => {
  if (activeFilter === "dashboard") {
    scheduleDashboardMasonry();
  }
});
await loadState();
setInterval(() => loadState(), 4000);

import { stableId } from "./common.mjs";

export const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
export const transcriptExtensions = new Set([".srt", ".txt", ".vtt"]);
export const docExtensions = new Set([".md", ".txt"]);
export const coverImageExtensions = new Set([".png", ".jpg", ".jpeg"]);
export const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export const defaultDistributionChannels = [
  "YouTube 中文",
  "YouTube English",
  "YouTube Shorts",
  "Twitter",
  "LinkedIn",
  "小红书",
  "视频号",
  "Facebook",
  "Instagram",
];

export const normalizeDistributionChannels = (channels) => {
  const source = Array.isArray(channels) && channels.length > 0 ? channels : defaultDistributionChannels;
  const normalized = [];
  const add = (channel) => {
    const value = String(channel || "").trim();
    if (!value || /bilibili/i.test(value)) return;
    if (!normalized.includes(value)) normalized.push(value);
  };

  for (const channel of source) {
    const value = String(channel || "").trim();
    if (value === "YouTube") {
      add("YouTube 中文");
      add("YouTube English");
      continue;
    }
    add(value);
  }

  add("LinkedIn");
  add("Twitter");
  add("Facebook");
  add("Instagram");

  return normalized;
};

export const driveFolderUrl = (folderId) =>
  folderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}` : "";

export const extensionOf = (name) => {
  const index = String(name).lastIndexOf(".");
  return index >= 0 ? String(name).slice(index).toLowerCase() : "";
};

export const normalizeTitle = (name) =>
  String(name)
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sentenceCase = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

const stripContentTitleNoise = (value) =>
  String(value || "")
    .replace(/^(buda|use\s*cases?|case study|demo)\s*/i, "")
    .replace(/\s+(final|draft|export|render|version|v\d+)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

export const filenameFromName = (name) => String(name || "").trim();

export const contentTitleFromName = (name) => {
  const normalized = normalizeTitle(name);
  return sentenceCase(stripContentTitleNoise(normalized) || normalized);
};

export const displayIdFromName = (name) => {
  const title = contentTitleFromName(name) || normalizeTitle(name) || "video";
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "video"
  );
};

export const outputForChannel = (channel) => ({
  channel,
  aspect_ratio:
    channel === "YouTube" || channel === "YouTube 中文" || channel === "YouTube English"
      ? "16:9"
      : channel === "YouTube Shorts" || channel === "视频号" || channel === "Instagram"
        ? "9:16"
        : channel === "小红书"
          ? "3:4"
          : "1:1",
  caption: true,
  cover_required: ["YouTube", "YouTube 中文", "YouTube English", "小红书", "视频号", "Instagram"].includes(channel),
  copy_required: true,
});

const compactText = (value, maxLength = 180) => {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).replace(/\s+\S*$/, "")}...` : text;
};

const firstNonEmpty = (...values) => values.map((value) => String(value || "").trim()).find(Boolean) || "";

const platformHashtagLine = (channel) => {
  if (channel === "小红书") return "#Buda #AI工作流 #效率工具 #创业工具";
  if (channel === "视频号") return "#Buda #AI工作流";
  if (channel === "LinkedIn") return "#AIAgents #WorkflowAutomation #Buda";
  if (channel === "YouTube English") return "#AIAgents #SaaS #WorkflowAutomation";
  return "#Buda #AIAgents";
};

export const buildDistributionCopy = ({ title, summary = "", body = "", coverCopy = {}, channels = [], cta = "" }) => {
  const topic = compactText(title, 72);
  const zhTitle = firstNonEmpty(coverCopy.locales?.zh?.title, coverCopy.title, topic);
  const zhSubtitle = firstNonEmpty(coverCopy.locales?.zh?.subtitle, coverCopy.subtitle);
  const enTitle = firstNonEmpty(coverCopy.locales?.en?.title, topic);
  const enSubtitle = firstNonEmpty(coverCopy.locales?.en?.subtitle);
  const summaryText = compactText(summary || body || zhSubtitle || topic, 220);
  const shortSummary = compactText(summaryText, 110);
  const defaultCta = cta || "关注 Buda，获取更多 AI GTM 自动化工作流。";
  const copy = {};

  for (const channel of channels) {
    const tags = platformHashtagLine(channel);
    if (channel === "YouTube English") {
      copy[channel] = {
        title: enTitle,
        body: `${enTitle}\n\n${enSubtitle || shortSummary}\n\nIn this Buda demo, we show how an AI agent can turn a repeatable business process into a reviewable workflow.\n\n${tags}`,
      };
      continue;
    }

    if (channel === "LinkedIn") {
      copy[channel] = {
        title: zhTitle,
        body: `${zhTitle}\n\n${summaryText}\n\n这条视频适合想把重复业务流程交给 AI Agent 的创始人、增长负责人和运营团队参考。\n\n${defaultCta}\n\n${tags}`,
      };
      continue;
    }

    if (channel === "Twitter" || channel === "X") {
      copy[channel] = {
        title: zhTitle,
        body: `${zhTitle}\n\n${shortSummary}\n\n用 Buda 把重复流程变成可交付、可审核的 AI 工作流。\n\n${tags}`,
      };
      continue;
    }

    if (channel === "小红书") {
      copy[channel] = {
        title: zhTitle,
        body: `${zhTitle}\n\n${zhSubtitle || shortSummary}\n\n适合：\n- 想减少手动操作的团队\n- 想把流程沉淀成 AI Agent 的创业者\n- 需要可审核交付物的增长/运营同学\n\n${defaultCta}\n\n${tags}`,
      };
      continue;
    }

    if (channel === "视频号") {
      copy[channel] = {
        title: zhTitle,
        body: `${zhTitle}\n\n${shortSummary}\n\n${defaultCta}\n\n${tags}`,
      };
      continue;
    }

    if (channel === "YouTube Shorts" || channel === "Instagram") {
      copy[channel] = {
        title: zhTitle,
        body: `${zhTitle}\n\n${compactText(zhSubtitle || summaryText, 90)}\n\n${tags}`,
      };
      continue;
    }

    copy[channel] = {
      title: zhTitle,
      body: `${zhTitle}\n\n${summaryText}\n\n${defaultCta}\n\n${tags}`,
    };
  }

  return copy;
};

const includesName = (names, value) => names.some((name) => name.toLowerCase() === String(value).toLowerCase());

const includesKeyword = (keywords, value) => keywords.some((keyword) => String(value).toLowerCase().includes(String(keyword).toLowerCase()));

const normalizeName = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

const stripTrailingPunctuation = (value) => String(value || "").replace(/[.。,，!！?？;；:：\s]+$/g, "").trim();

const humanizeTopic = (title) => {
  const words = String(title || "")
    .replace(/\buse case\b/gi, "")
    .replace(/\btutorial\b/gi, "")
    .replace(/\buse\b/gi, "")
    .replace(/\bwechat\b/gi, "微信")
    .replace(/\balipay\b/gi, "支付宝")
    .replace(/\bpayment\b/gi, "支付")
    .replace(/\bwhisper\b/gi, "Whisper 字幕")
    .replace(/\bsnakegame\b/gi, "小游戏案例")
    .replace(/\bimage and video\b/gi, "图像与视频")
    .replace(/\bcodex\b/gi, "Codex")
    .replace(/\bmoonrouter\b/gi, "MoonRouter")
    .replace(/\bsurvey\b/gi, "问卷")
    .replace(/\bsvg\b/gi, "SVG")
    .replace(/\bppt\b/gi, "PPT")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return words || title;
};

const cleanMarkdownLine = (line) =>
  stripTrailingPunctuation(
    String(line || "")
      .replace(/^[-*#>\s]+/g, "")
      .replace(/^\d+[.)、\s]+/g, "")
      .replace(/^\|+\s*/g, "")
      .replace(/\s*\|+$/g, "")
      .replace(/\s*\|\s*/g, " · ")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );

const looksLikeGarbledText = (value) => {
  const text = String(value || "");
  if (!text) return false;
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  if (replacementCount >= 2 || replacementCount / text.length > 0.02) return true;
  const visible = text.replace(/\s/g, "");
  if (visible.length < 12) return false;
  const oddSymbolCount = (visible.match(/[^\w\u4e00-\u9fff.,!?;:'"()[\]{}<>/@#%&+=\-—–，。！？；：“”‘’（）【】、·…]/g) || []).length;
  return oddSymbolCount / visible.length > 0.35;
};

const looksLikeTechnicalCaptionLine = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^SRT\s+Review\s*:/i.test(text)) return true;
  if (/^(language|locale|lang)\s*[:：]\s*[\w-]+$/i.test(text)) return true;
  if (/^(duration|source|file|filename|encoding|format|reviewed|created|updated|generated this run|reference source|reference path|brand replacements|missing brand terms from srt)\s*[:：]/i.test(text) && text.length <= 180) return true;
  if (/^(human review notes|reference-only tokens sample|srt-only tokens sample|reference only tokens sample|srt only tokens sample)$/i.test(text)) return true;
  if (/^no obvious brand-term issues found\b/i.test(text)) return true;
  if (/^(字幕|字幕文件|subtitle|caption|transcript)\s*(review|校对)?\s*[:：]/i.test(text)) return true;
  if (/^[\w .()[\]\-]+\.(srt|ass|vtt|sbv)$/i.test(text)) return true;
  if (/\.(srt|ass|vtt|sbv)\b/i.test(text) && text.length <= 120) return true;
  return false;
};

export const summarizeVoiceover = (value) => {
  if (looksLikeGarbledText(value)) return "";
  const lines = String(value || "")
    .split(/\r?\n|。|！|？|\. |\? |! /)
    .map(cleanMarkdownLine)
    .filter((line) => {
      if (line.length < 8 || line.length > 90) return false;
      if (looksLikeGarbledText(line)) return false;
      if (looksLikeTechnicalCaptionLine(line)) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(line)) return false;
      if (/^(WEBVTT|NOTE|STYLE|REGION)$/i.test(line)) return false;
      if (/^(title|subtitle|标题|副标题|备注|note|script|口播稿)$/i.test(line)) return false;
      if (/^https?:\/\//i.test(line)) return false;
      return true;
    });
  return [...new Set(lines)][0] || "";
};

const hasChinese = (value) => /[\u4e00-\u9fff]/.test(value);

const hasLatinLetters = (value) => /[A-Za-z]/.test(value);

const looksLikeReviewTextFile = (file) => /\.srt\.review\.md$/i.test(file?.name || "") || /\breview\b/i.test(`${file?.name || ""} ${file?.path || ""}`);

const looksLikeRawTextFile = (file) => /(^|[/_-])raw([/_-]|$)|原始|口播/i.test(`${file?.path || ""} ${file?.name || ""}`);

const preferChineseTextFile = (files) =>
  [
    files.find((file) => !looksLikeReviewTextFile(file) && looksLikeRawTextFile(file) && /(^|[-_/ ])(zh|cn|zh-cn|中文)([-_. /]|$)/i.test(`${file.name || ""} ${file.path || ""}`)),
    files.find((file) => !looksLikeReviewTextFile(file) && looksLikeRawTextFile(file) && hasChinese(`${file.name || ""} ${file.path || ""}`)),
    files.find((file) => !looksLikeReviewTextFile(file) && looksLikeRawTextFile(file)),
    files.find((file) => !looksLikeReviewTextFile(file) && /(^|[-_/ ])(zh|cn|zh-cn|中文)([-_. /]|$)/i.test(`${file.name || ""} ${file.path || ""}`)),
    files.find((file) => !looksLikeReviewTextFile(file) && hasChinese(`${file.name || ""} ${file.path || ""}`)),
    files.find((file) => !looksLikeReviewTextFile(file)),
    files.find((file) => /(^|[-_/ ])(zh|cn|zh-cn|中文)([-_. /]|$)/i.test(`${file.name || ""} ${file.path || ""}`)),
    files.find((file) => hasChinese(`${file.name || ""} ${file.path || ""}`)),
    files[0],
  ].find(Boolean);

const isMostlyEnglish = (value) => hasLatinLetters(value) && !hasChinese(value);

const looksLikeChineseCover = (file) => /(^|[-_/])zh(-|_|$)|zh-cn|cn\./i.test(`${file?.name || ""} ${file?.path || ""}`);

const looksLikeVerticalCover = (file) => /9x16|vertical|short/i.test(`${file?.name || ""} ${file?.path || ""}`);

const normalizedLineKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");

const isDistinctLine = (line, other) => {
  const current = normalizedLineKey(line);
  const previous = normalizedLineKey(other);
  return current && previous && current !== previous && !current.includes(previous) && !previous.includes(current);
};

const isQuestionTitleLine = (line) => /^(如何|怎么|怎样|How to\b|How\b|Use\b)/i.test(String(line || "").trim());

const normalizeCoverPhrase = (value) =>
  stripTrailingPunctuation(
    String(value || "")
      .replace(/\bAl\b/g, "AI")
      .replace(/,and\b/gi, ", and")
      .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
  );

const isEnglishCopyLine = (line) => /^(How to|How\b|Use\b|Schedule\b|Stop\b|From\b|Turn\b|Build\b|Create\b|Run\b|Make\b|Why\b|What\b|with AI\b|to run\b)/i.test(String(line || "").trim());

const isNoiseCoverLine = (line) =>
  /^buda\.im$/i.test(line) ||
  /New Chat|Drive|Automations|Settings|PROJECTS|SESSIONS|Content Calendar|Design Studio|Desian|Go-to-Market|Market strat|DPD|IEATO|Greeting|Greetina|Initiation|Initlatlo|initiatio|Used .*tool|Member|days ago|Create a|Draft a|Weekly|Quick|Customer|Search|Workspace|Worked for|Automation create|Runs:|Timezone:|Focus:|Output:|Delivery:/i.test(line);

const selectTitleCandidate = (lines, maxLength, { preferQuestion = false } = {}) => {
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    const first = lines[index];
    if (first.length <= maxLength) {
      candidates.push({
        line: first,
        endIndex: index,
        score: scoreCoverLine(first) + (preferQuestion && isQuestionTitleLine(first) ? 10 : 0) - index * 0.05,
      });
    }
    const next = lines[index + 1];
    if (!next || !isDistinctLine(first, next)) continue;
    const joined = `${first} ${next}`.trim();
    if (joined.length <= maxLength) {
      candidates.push({
        line: joined,
        endIndex: index + 1,
        score: scoreCoverLine(first) + scoreCoverLine(next) + 2 + (preferQuestion && isQuestionTitleLine(first) ? 10 : 0) - index * 0.05,
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score)[0] || { line: "", endIndex: -1 };
};

const combineAdjacentTitleLines = (lines, maxLength, options = {}) => selectTitleCandidate(lines, maxLength, options).line;

const isSubtitleContinuation = (line, { english }) => {
  if (english) {
    return (
      isMostlyEnglish(line) &&
      !isNoiseCoverLine(line) &&
      !/[)）(（•◎<>]/.test(line) &&
      /\b(the|a|an|and|to|with|latest|news|every|day|summarize|organize|gather|reports?|agent)\b/i.test(line)
    );
  }
  return hasChinese(line) && !isNoiseCoverLine(line);
};

const needsEnglishContinuation = (line) => /(?:,?\s*and|,?\s*or|,?\s*to|,?\s*with)$/i.test(String(line || "").trim());

const naturalEnglishWordCount = (line) => {
  const words = String(line || "").match(/\b[a-z]{2,}\b/gi) || [];
  return words.filter((word) => !/^[A-Z]{3,}$/.test(word)).length;
};

const combineSubtitleAfterTitle = (lines, titleCandidate, maxLength, { english = false } = {}) => {
  const parts = [];
  for (let index = titleCandidate.endIndex + 1; index < lines.length && parts.length < 2; index += 1) {
    const line = lines[index];
    if (!isDistinctLine(line, titleCandidate.line) || isNoiseCoverLine(line)) break;
    if (parts.length === 0) {
      if (english && !isEnglishCopyLine(line)) continue;
      if (!english && !hasChinese(line)) continue;
    } else if (!isSubtitleContinuation(line, { english }) && !(english && needsEnglishContinuation(parts[parts.length - 1]))) {
      break;
    }
    const joined = [...parts, line].join(" ");
    if (joined.length > maxLength) break;
    parts.push(line);
  }
  return parts.join(" ");
};

const selectEnglishSubtitle = (lines, title, maxLength) => {
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    const first = lines[index];
    if (!isEnglishCopyLine(first) || !isDistinctLine(first, title) || isNoiseCoverLine(first)) continue;
    const forcedContinuation =
      needsEnglishContinuation(first)
        ? lines
            .slice(index + 1)
            .find(
              (line) =>
                isMostlyEnglish(line) &&
                !isNoiseCoverLine(line) &&
                !/[)）(（•◎<>]/.test(line) &&
                /^summarize\b/i.test(line)
            ) ||
          lines
            .slice(index + 1)
            .find(
              (line) =>
                isMostlyEnglish(line) &&
                !isNoiseCoverLine(line) &&
                !/[)）(（•◎<>]/.test(line) &&
                /\blatest news every day\b/i.test(line)
            )
        : "";
    const second = lines.slice(index + 1).find((line) => isDistinctLine(line, title) && !isNoiseCoverLine(line));
    const preferredSecond = forcedContinuation || second;
    const canJoin =
      preferredSecond &&
      isDistinctLine(preferredSecond, title) &&
      !isNoiseCoverLine(preferredSecond) &&
      !/[)）(（•◎<>]/.test(preferredSecond) &&
      naturalEnglishWordCount(preferredSecond) >= 4 &&
      (needsEnglishContinuation(first) || /\b(the|latest|news|every|day|summarize|organize|gather)\b/i.test(preferredSecond));
    const line = canJoin ? `${first} ${preferredSecond}`.trim() : first;
    if (line.length > maxLength) continue;
    candidates.push({
      line,
      score:
        Math.min(line.length, 90) * 0.08 +
        (/\bSchedule\b/i.test(line) ? 8 : 0) +
        (/\bsummarize\b/i.test(line) ? 6 : 0) +
        (/\blatest news every day\b/i.test(line) ? 6 : 0) -
        index * 0.01,
    });
  }
  return candidates.sort((a, b) => b.score - a.score)[0]?.line || "";
};

const scoreCoverLine = (line) => {
  let score = 0;
  if (hasChinese(line)) score += 4;
  if (/Buda|AI|Agent|自动|生成|管理|工作流|支付|字幕|图像|视频|项目|渠道|工具|文件|浏览器/i.test(line)) score += 3;
  if (/如何|怎么|一键|自动|不用|别再|从.+到|把.+变成/.test(line)) score += 2;
  if (/How to|Use .+ to|with AI|Multitask|Sessions?|Projects?|parallel/i.test(line)) score += 4;
  if (line.length >= 8 && line.length <= 30) score += 2;
  if (isMostlyEnglish(line) && line.length < 8) score -= 4;
  if (line.length > 44) score -= 3;
  if (/大家好|今天|我们来|欢迎|关注|订阅|谢谢|下面|首先|然后/.test(line)) score -= 2;
  if (isNoiseCoverLine(line)) score -= 6;
  return score;
};

export const deriveCoverCopy = ({ title, snippet, coverText = "" }) => {
  const topic = humanizeTopic(title);
  const coverLines = String(coverText || "")
    .split(/\r?\n|。|！|？|\. |\? |! /)
    .map(cleanMarkdownLine)
    .filter((line) => line.length >= 2 && line.length <= 52);
  const bestCoverLines = [...new Set(coverLines)]
    .map((line) => ({ line, score: scoreCoverLine(line) + 2 }))
    .filter((item) => item.score > 2)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.line);
  if (bestCoverLines.length > 0) {
    const coverLinesByOrder = [...new Set(coverLines)].filter((line) => scoreCoverLine(line) + 2 > 2);
    const zhLines = coverLinesByOrder.filter(hasChinese);
    const enLines = coverLinesByOrder.filter(isMostlyEnglish);
    const zhTitleCandidate = selectTitleCandidate(zhLines, 32, { preferQuestion: true });
    const coverTitle =
      zhTitleCandidate.line ||
      bestCoverLines.find((line) => line.length <= 32) ||
      bestCoverLines[0];
    const coverSubtitle = combineSubtitleAfterTitle(zhLines, zhTitleCandidate, 64) || "";
    const enTitleCandidate = selectTitleCandidate(enLines, 44, { preferQuestion: true });
    const enTitle = enTitleCandidate.line;
    const enSubtitle =
      selectEnglishSubtitle(enLines, enTitle, 100) ||
      combineSubtitleAfterTitle(enLines, enTitleCandidate, 90, { english: true }) ||
      "";
    const variants = [coverTitle, ...bestCoverLines.filter((line) => line !== coverTitle)]
      .map(normalizeCoverPhrase)
      .filter(Boolean);
    return {
      title: normalizeCoverPhrase(coverTitle).slice(0, 42),
      subtitle: normalizeCoverPhrase(coverSubtitle).slice(0, 64),
      locales: {
        zh: {
          title: normalizeCoverPhrase(coverTitle).slice(0, 42),
          subtitle: normalizeCoverPhrase(coverSubtitle).slice(0, 64),
        },
        en: {
          title: normalizeCoverPhrase(enTitle).slice(0, 64),
          subtitle: normalizeCoverPhrase(enSubtitle).slice(0, 80),
        },
      },
      variants: [...new Set(variants)].slice(0, 3),
      source: "cover_image_ocr",
    };
  }

  const lines = String(snippet || "")
    .split(/\r?\n|。|！|？|\. |\? |! /)
    .map(cleanMarkdownLine)
    .filter((line) => line.length >= 6 && line.length <= 52 && !looksLikeTechnicalCaptionLine(line) && !looksLikeGarbledText(line));
  const bestLines = [...new Set(lines)]
    .map((line) => ({ line, score: scoreCoverLine(line) }))
    .filter((item) => item.score > 2)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.line);

  const titleFromScript = bestLines.find((line) => line.length <= 28);
  const subtitleFromScript = bestLines.find((line) => line !== titleFromScript && line.length <= 42);
  const source = snippet ? "voiceover_markdown" : "project_folder_name";
  const coverTitle = titleFromScript || `${topic}实战`;
  const subtitle = subtitleFromScript || (snippet ? `把 ${topic} 做成可交付的 Buda 工作流` : "");
  const variants = [
    coverTitle,
    `如何用 Buda 做${topic}`,
    `${topic}，不用再手动处理`,
  ]
    .map(stripTrailingPunctuation)
    .filter(Boolean);

  return {
    title: normalizeCoverPhrase(coverTitle).slice(0, 42),
    subtitle: normalizeCoverPhrase(subtitle).slice(0, 64),
    locales: {
      zh: {
        title: normalizeCoverPhrase(coverTitle).slice(0, 42),
        subtitle: normalizeCoverPhrase(subtitle).slice(0, 64),
      },
      en: {
        title: "",
        subtitle: "",
      },
    },
    variants: [...new Set(variants)].slice(0, 3),
    source,
  };
};

export const deriveLocalizedCoverCopy = ({ title, snippet, coverTexts = [] }) => {
  const zhText = coverTexts
    .filter((entry) => entry.locale === "zh")
    .map((entry) => entry.text)
    .filter(Boolean)
    .join("\n");
  const enText = coverTexts
    .filter((entry) => entry.locale === "en")
    .map((entry) => entry.text)
    .filter(Boolean)
    .join("\n");
  const allText = coverTexts.map((entry) => entry.text).filter(Boolean).join("\n");
  const base = deriveCoverCopy({ title, snippet, coverText: zhText || allText });
  const english = enText ? deriveCoverCopy({ title, snippet: "", coverText: enText }) : null;

  return {
    ...base,
    locales: {
      zh: base.locales?.zh || {
        title: base.title || "",
        subtitle: base.subtitle || "",
      },
      en: english?.locales?.en || {
        title: "",
        subtitle: "",
      },
    },
    extracted_text: allText,
  };
};

export const inferProjectStage = ({
  rawFiles,
  voiceoverFiles,
  scriptFiles,
  transcriptFiles,
  coverSourceFiles,
  coverFiles,
  youtubeFiles,
  shortsFiles,
  videoAccountFiles,
  socialExportFiles = [],
  requiredChecks,
  rules = {},
}) => {
  const hasRaw = rawFiles.length > 0;
  const hasVoiceover = voiceoverFiles.length > 0;
  const hasScript = scriptFiles.length > 0;
  const hasTranscript = transcriptFiles.length > 0;
  const hasCoverSource = coverSourceFiles.length > 0;
  const hasAnyChannelOutput = youtubeFiles.length > 0 || shortsFiles.length > 0 || videoAccountFiles.length > 0 || socialExportFiles.length > 0;
  const hasCoreChannelOutputs = youtubeFiles.length >= 2 && videoAccountFiles.length > 0;
  const hasSocialOnlyOutput = socialExportFiles.length > 0 && youtubeFiles.length === 0 && shortsFiles.length === 0 && videoAccountFiles.length === 0;
  const hasFinalCover = coverFiles.length > 0;
  const acceptsScript = rules.ready_for_edit_accepts_script !== false;
  const acceptsTranscript = rules.ready_for_edit_accepts_transcript !== false;
  const hasEditDirection = (acceptsScript && hasScript) || (acceptsTranscript && hasTranscript);
  const allRequiredReady = requiredChecks.every((check) => check.ready);
  const evidence = {
    raw: rawFiles.length,
    voiceover: voiceoverFiles.length,
    script: scriptFiles.length,
    transcript: transcriptFiles.length,
    cover_source: coverSourceFiles.length,
    cover: coverFiles.length,
    youtube_export: youtubeFiles.length,
    shorts_export: shortsFiles.length,
    video_account_export: videoAccountFiles.length,
    social_export: socialExportFiles.length,
  };

  if (hasCoreChannelOutputs && hasFinalCover && rules.distribution_ready_requires_export !== false) {
    return {
      stage: "distribution_ready",
      status: "to_approve",
      proposedAction: "approve",
      reason: "Cloud Drive has YouTube CN/EN, video account exports, and final cover; review distribution and status. Shorts is optional.",
      rule: "required_channel_exports_and_cover_found",
      evidence,
    };
  }

  if (hasSocialOnlyOutput && hasFinalCover && rules.distribution_ready_requires_export !== false) {
    return {
      stage: "distribution_ready",
      status: "to_approve",
      proposedAction: "approve",
      reason: "Cloud Drive has a social-only export and final cover; review distribution and status.",
      rule: "social_only_export_and_cover_found",
      evidence,
    };
  }

  if (hasSocialOnlyOutput && rules.distribution_ready_requires_export !== false) {
    return {
      stage: "distribution_ready",
      status: "needs_review",
      proposedAction: "revise",
      reason: "Cloud Drive has a social-only export, but final cover is missing.",
      rule: "social_only_export_missing_final_cover",
      evidence,
    };
  }

  if (hasCoreChannelOutputs && rules.distribution_ready_requires_export !== false) {
    return {
      stage: "distribution_ready",
      status: "needs_review",
      proposedAction: "revise",
      reason: "Cloud Drive has YouTube CN/EN and video account exports, but final cover is missing. Shorts is optional.",
      rule: "required_channel_exports_missing_final_cover",
      evidence,
    };
  }

  if (hasAnyChannelOutput && rules.distribution_ready_requires_export !== false) {
    return {
      stage: "editing",
      status: "needs_review",
      proposedAction: "revise",
      reason: "Cloud Drive has partial channel exports; wait for YouTube CN/EN and video account outputs. Shorts is optional.",
      rule: "partial_channel_exports_found",
      evidence,
    };
  }

  if (allRequiredReady || (hasRaw && hasEditDirection && rules.ready_for_edit_requires_cover === false)) {
    return {
      stage: "ready_for_edit",
      status: "to_approve",
      proposedAction: "approve",
      reason: "Online Google Drive has raw video, voiceover/script, and cover material.",
      rule: "required_production_items_ready",
      evidence,
    };
  }

  if (hasRaw || hasVoiceover || hasScript || hasTranscript || hasCoverSource || coverFiles.length > 0) {
    return {
      stage: hasRaw ? "assets_ready" : "script_ready",
      status: "needs_review",
      proposedAction: "revise",
      reason: "Some required production items are missing.",
      rule: "missing_required_production_items",
      evidence,
    };
  }

  return {
    stage: "idea",
    status: "needs_review",
    proposedAction: "revise",
    reason: "Project folder needs source material or direction.",
    rule: "no_source_material",
    evidence,
  };
};

export const buildProjectItem = ({ project, files, config, index, readSnippet, readCoverText = () => "" }) => {
  const library = config.video_library || {};
  const rules = config.video_rules || {};
  const rawNames = library.raw_folder_names || ["Raw", "原始视频", "原视频"];
  const coverNames = library.cover_folder_names || ["Covers"];
  const coverSourceNames = library.cover_source_folder_names || ["成品样片", "封面素材", "Cover Source", "Cover Sources"];
  const youtubeNames = library.youtube_folder_names || ["Youtube", "YouTube"];
  const shortsNames = library.shorts_folder_names || ["Shorts"];
  const videoAccountNames = library.video_account_folder_names || ["视频号"];
  const socialExportNames = library.social_export_folder_names || ["Twitter", "X", "X Twitter"];

  const inFolder = (file, names) => file.folder_path?.some((part) => includesName(names, part));
  const hasExt = (file, extensions) => extensions.has(file.extension);
  const isChannelExport = (file) => inFolder(file, youtubeNames) || inFolder(file, shortsNames) || inFolder(file, videoAccountNames) || inFolder(file, socialExportNames);
  const looksLikeCoverSourceAsset = (file) => {
    const name = normalizeName(file.name || "");
    const pathText = normalizeName([file.path, ...(file.folder_path || [])].filter(Boolean).join(" "));
    return (
      inFolder(file, coverSourceNames) ||
      ["cover source", "cover-source", "thumbnail source", "封面素材", "成品样片", "样片"].some((keyword) => {
        const normalizedKeyword = normalizeName(keyword);
        return name.includes(normalizedKeyword) || pathText.includes(normalizedKeyword);
      })
    );
  };

  const rawFiles = files.filter((file) => hasExt(file, videoExtensions) && (inFolder(file, rawNames) || !isChannelExport(file)));
  const coverFiles = files.filter((file) => inFolder(file, coverNames) && hasExt(file, coverImageExtensions));
  const coverSourceFiles = files.filter(
    (file) => hasExt(file, coverImageExtensions) && looksLikeCoverSourceAsset(file) && !coverFiles.some((cover) => cover.id === file.id)
  );
  const voiceoverFiles = files.filter((file) => hasExt(file, new Set([".md"])));
  const youtubeFiles = files.filter((file) => inFolder(file, youtubeNames) && hasExt(file, videoExtensions));
  const shortsFiles = files.filter((file) => inFolder(file, shortsNames) && hasExt(file, videoExtensions));
  const videoAccountFiles = files.filter((file) => inFolder(file, videoAccountNames) && hasExt(file, videoExtensions));
  const socialExportFiles = files.filter((file) => inFolder(file, socialExportNames) && hasExt(file, videoExtensions));
  const transcriptFiles = files.filter((file) => hasExt(file, transcriptExtensions));
  const scriptFiles = files.filter((file) => hasExt(file, docExtensions) && !voiceoverFiles.some((voiceover) => voiceover.id === file.id));
  const voiceoverEvidenceFiles = [
    ...new Map(
      [...voiceoverFiles, ...scriptFiles, ...transcriptFiles].map((file) => [file.id || file.path || file.name, file])
    ).values(),
  ];
  const requiredChecks = [
    {
      key: "voiceover",
      label: "口播稿",
      ready: voiceoverEvidenceFiles.length > 0,
      count: voiceoverEvidenceFiles.length,
      missing_risk: "missing_voiceover",
      hint: "需要 .md 口播稿，或 .srt/.vtt/.txt 字幕稿",
    },
    {
      key: "cover_source",
      label: "封面素材",
      ready: coverSourceFiles.length > 0 || coverFiles.length > 0,
      count: coverSourceFiles.length + coverFiles.length,
      missing_risk: "missing_cover_source",
      hint: "需要 PNG/JPG/JPEG 封面素材，例如 Raw/成品样片；如已有 Covers 最终封面也算满足",
    },
    {
      key: "raw_video",
      label: "原始视频",
      ready: rawFiles.length > 0,
      count: rawFiles.length,
      missing_risk: "missing_raw_video",
      hint: "需要项目里的 MP4/MOV 原始素材，导出文件夹除外",
    },
  ];

  const allAssets = [
    ...rawFiles.map((file) => ({ type: "raw_video", file })),
    ...voiceoverFiles.map((file) => ({ type: "voiceover", file })),
    ...scriptFiles.map((file) => ({ type: "script", file })),
    ...transcriptFiles.map((file) => ({ type: "transcript", file })),
    ...coverSourceFiles.map((file) => ({ type: "cover_source", file })),
    ...coverFiles.map((file) => ({ type: "cover", file })),
    ...youtubeFiles.map((file) => ({ type: "youtube_export", file })),
    ...shortsFiles.map((file) => ({ type: "shorts_export", file })),
    ...videoAccountFiles.map((file) => ({ type: "video_account_export", file })),
    ...socialExportFiles.map((file) => ({ type: "social_export", file })),
  ];

  const inferred = inferProjectStage({
    rawFiles,
    voiceoverFiles,
    scriptFiles,
    transcriptFiles,
    coverSourceFiles,
    coverFiles,
    youtubeFiles,
    shortsFiles,
    videoAccountFiles,
    socialExportFiles,
    requiredChecks,
    rules,
  });

  const missingRisks = requiredChecks.filter((check) => !check.ready).map((check) => check.missing_risk);
  const snippetFile =
    preferChineseTextFile(voiceoverFiles) || preferChineseTextFile(scriptFiles) || preferChineseTextFile(transcriptFiles);
  const rawSnippet = snippetFile ? readSnippet(snippetFile) : "";
  const snippet = looksLikeGarbledText(rawSnippet) ? "" : rawSnippet;
  const contentSummary = summarizeVoiceover(snippet);
  const coverTextEntries = coverFiles
    .map((file) => ({
      text: readCoverText(file),
      locale: looksLikeChineseCover(file) ? "zh" : "en",
      vertical: looksLikeVerticalCover(file),
    }))
    .filter((entry) => entry.text)
    .sort((a, b) => Number(a.vertical) - Number(b.vertical));
  const coverText = coverTextEntries.map((entry) => entry.text).join("\n");
  const channels = normalizeDistributionChannels(config.channels);
  const filename = filenameFromName(project.name);
  const displayId = displayIdFromName(project.name);
  const title = contentTitleFromName(project.name);
  const coverCopy = deriveLocalizedCoverCopy({ title, snippet, coverTexts: coverTextEntries });
  const outputs = channels.map(outputForChannel);
  const distributionCopy = buildDistributionCopy({
    title,
    summary: contentSummary,
    body: snippet,
    coverCopy,
    channels: outputs.map((output) => output.channel),
    cta: config.style?.default_cta,
  });

  return {
    id: `video-${stableId(project.id || project.path || project.name)}`,
    ref: `Video #${index + 1}`,
    display_id: displayId,
    filename,
    title,
    summary: contentSummary || `${title}: ${allAssets.length} cloud asset(s) found in Google Drive.`,
    body: snippet,
    category: "google_drive_project",
    risk: missingRisks,
    status: inferred.status,
    stage: inferred.stage,
    proposed_action: inferred.proposedAction,
    reason: inferred.reason,
    rule: {
      id: inferred.rule,
      evidence: inferred.evidence,
      explanation: inferred.reason,
    },
    required_checks: requiredChecks,
    source_assets: allAssets.map(({ type, file }) => ({
      type,
      name: file.name,
      path: file.path,
      absolute_path: file.web_view_link || file.path,
      folder_url: driveFolderUrl(file.parent_folder_id),
      parent_folder_id: file.parent_folder_id || "",
      thumbnail_url: file.thumbnail_link || "",
      created_at: file.created_at || "",
      modified_at: file.modified_at || "",
      size: file.size || 0,
      drive_file_id: file.id,
      mime_type: file.mime_type,
      owner_name: file.owner_name || "",
      owner_email: file.owner_email || "",
      created_by_name: file.created_by_name || "",
      created_by_email: file.created_by_email || "",
      uploaded_by_name: file.uploaded_by_name || "",
      uploaded_by_email: file.uploaded_by_email || "",
      last_modified_by_name: file.last_modified_by_name || "",
      last_modified_by_email: file.last_modified_by_email || "",
    })),
    topic_direction: rules.default_topic_direction || "Buda product/GTM video",
    target_audience: rules.default_target_audience || "SaaS founders, indie hackers, and GTM operators",
    topic_decision: "待确认",
    topic_priority: "P1",
    owner: "",
    due_date: allAssets.length > 0 ? project.created_at || "" : "",
    recording_status: "未分配",
    edit_brief: {
      format: "横屏长视频 + 竖屏短切片",
      duration_target: inferred.stage === "distribution_ready" ? "按已导出视频为准" : rules.default_long_form_duration || "3-5 分钟长版；30-60 秒短版",
      key_beats: [
        "开头直接交代用户痛点或最终结果",
        "展示 Buda 工作流或具体产物",
        "说明这个流程为什么有价值",
        "结尾给出明确行动引导",
      ],
      transcript_ready: transcriptFiles.length > 0,
      assets_ready: rawFiles.length > 0,
      voiceover_ready: voiceoverEvidenceFiles.length > 0,
      cover_ready: coverSourceFiles.length > 0 || coverFiles.length > 0,
      final_cover_ready: coverFiles.length > 0,
    },
    cover_copy: {
      title: coverCopy.title || (title.length > 42 ? title.slice(0, 42) : title),
      subtitle: coverCopy.subtitle,
      locales: coverCopy.locales || {
        zh: {
          title: coverCopy.title || (title.length > 42 ? title.slice(0, 42) : title),
          subtitle: coverCopy.subtitle || "",
        },
        en: {
          title: "",
          subtitle: "",
        },
      },
      variants: coverCopy.variants,
      source: coverCopy.source,
      extracted_text: coverText,
      needs_review: coverFiles.length === 0,
    },
    outputs,
    distribution_copy: distributionCopy,
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

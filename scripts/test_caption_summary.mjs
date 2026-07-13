#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  buildProjectItem,
  contentTitleFromName,
  deriveCoverCopy,
  displayIdFromName,
  summarizeVoiceover,
} from "../lib/google-drive-shared.mjs";

assert.equal(contentTitleFromName("Buda-release-video-agent-permission"), "Release video agent permission");
assert.equal(displayIdFromName("Buda-release-video-agent-permission"), "release-video-agent-permission");
assert.equal(contentTitleFromName("use-case-multi-person-collaboration"), "Multi person collaboration");
assert.equal(contentTitleFromName("use-casexxx"), "Xxx");

const summary = summarizeVoiceover(`SRT Review: use-case-multi-person-collaboration-zh-cn.srt
Language: zh-cn

1
00:00:00,000 --> 00:00:03,000
你的 Agent 能多人一起用吗

2
00:00:03,100 --> 00:00:06,000
今天我们来看 Buda 里的多人协作流程`);

assert.equal(summary, "你的 Agent 能多人一起用吗");

const reviewSummary = summarizeVoiceover(`# SRT Review: use-case-multi-person-collaboration-zh-cn.srt

- Language: \`zh-cn\`
- Generated this run: \`false\`
- Reference source: \`raw\`
- Reference path: \`/private/path/use-case-multi-person-collaboration-cn.md\`
- Brand replacements: None
- Missing brand terms from SRT: None

## Human Review Notes

- No obvious brand-term issues found by the automatic check.

## Reference-only Tokens Sample

agent, 就不是某个人电脑里的黑盒, 里继续处理

## SRT-only Tokens Sample

就不再是只跑在某个人电脑里的黑盒, 继续处理`);

assert.equal(reviewSummary, "就不是某个人电脑里的黑盒");

const structuredReferenceSummary = summarizeVoiceover(`## Video Title

Introducing Agent Permissions: Not Every Agent Should Be Visible to Everyone

## Summary

Demo script notes.`);

assert.equal(structuredReferenceSummary, "Introducing Agent Permissions: Not Every Agent Should Be Visible to Everyone");

const generatedTitle = summarizeVoiceover(
  "现在写合同、审合同，不用再从零手动整理，直接用 AI 就可以完成。把合同发给 Buda，它会帮你整理重点和修改建议。",
  { fallbackTitle: "Gerenate word" }
);

assert.equal(generatedTitle, "用 AI 写合同、审合同");

const personalWebsiteTitle = summarizeVoiceover(
  "还在给 HR 看无聊的简历？现在可以用 AI 生成一个长期可访问的个人网站。",
  { fallbackTitle: "Personal website" }
);

assert.equal(personalWebsiteTitle, "还在给 HR 看无聊的简历");

const personalWebsiteCoverCopy = deriveCoverCopy({
  title: "Personal website",
  snippet: "还在给 HR 看无聊的简历？",
  coverText: `如何用 AI
搭建个人网站
用AI生成并部署，获得长期可访问链接`,
});

assert.equal(personalWebsiteCoverCopy.source, "cover_image_ocr");
assert.equal(personalWebsiteCoverCopy.title, "如何用 AI 搭建个人网站");

const item = buildProjectItem({
  project: {
    id: "project-1",
    name: "use-case-multi-person-collaboration",
    path: "use-case-multi-person-collaboration",
    created_at: "2026-06-26T00:00:00.000Z",
  },
  index: 0,
  config: {},
  files: [
    {
      id: "review-zh",
      name: "use-case-multi-person-collaboration-zh-cn.srt.review.md",
      path: "use-case-multi-person-collaboration/YouTube/use-case-multi-person-collaboration-zh-cn.srt.review.md",
      extension: ".md",
    },
    {
      id: "raw-zh",
      name: "use-case-multi-person-collaboration-cn.md",
      path: "use-case-multi-person-collaboration/Raw/use-case-multi-person-collaboration-cn.md",
      extension: ".md",
    },
  ],
  readSnippet: (file) =>
    file.id === "review-zh"
      ? reviewSummary
      : "你的 Agent 能多人一起用吗？现在我们可以把 Agent 从单人电脑里的黑盒，升级成团队一起协作的工作台。",
});

assert.equal(item.summary, "你的 Agent 能多人一起用吗");
assert.equal(item.display_id, "multi-person-collaboration");
assert.equal(item.filename, "use-case-multi-person-collaboration");
assert.equal(item.title, "Multi person collaboration");

const draftReadyItem = buildProjectItem({
  project: {
    id: "project-draft",
    name: "Buda-release-video-agent-permission",
    path: "Buda-release-video-agent-permission",
  },
  index: 1,
  config: {},
  files: [
    {
      id: "script",
      name: "release-script.md",
      path: "Buda-release-video-agent-permission/Raw/release-script.md",
      extension: ".md",
    },
    {
      id: "draft",
      name: "release-draft.mp4",
      path: "Buda-release-video-agent-permission/Draft/release-draft.mp4",
      folder_path: ["Buda-release-video-agent-permission", "Draft"],
      extension: ".mp4",
    },
  ],
  readSnippet: () => "Release video agent permission script.",
});

assert.equal(draftReadyItem.stage, "script_ready");
assert.equal(draftReadyItem.rule.id, "draft_video_ready_for_recording");
assert.equal(draftReadyItem.required_checks.find((check) => check.key === "draft_video")?.ready, true);
assert.equal(draftReadyItem.required_checks.find((check) => check.key === "raw_video")?.ready, false);

const overlayReadyItem = buildProjectItem({
  project: {
    id: "project-overlay",
    name: "Buda-release-video-agent-permission",
    path: "Buda-release-video-agent-permission",
  },
  index: 2,
  config: {},
  files: [
    {
      id: "script",
      name: "release-script.md",
      path: "Buda-release-video-agent-permission/Raw/release-script.md",
      extension: ".md",
    },
    {
      id: "draft",
      name: "release-draft.mp4",
      path: "Buda-release-video-agent-permission/Draft/release-draft.mp4",
      folder_path: ["Buda-release-video-agent-permission", "Draft"],
      extension: ".mp4",
    },
    {
      id: "recording",
      name: "screen-recording-release.mp4",
      path: "Buda-release-video-agent-permission/Raw/screen-recording-release.mp4",
      folder_path: ["Buda-release-video-agent-permission", "Raw"],
      extension: ".mp4",
    },
  ],
  readSnippet: () => "Release video agent permission script.",
});

assert.equal(overlayReadyItem.stage, "ready_for_edit");
assert.equal(overlayReadyItem.rule.id, "required_production_items_ready");
assert.equal(overlayReadyItem.required_checks.map((check) => `${check.key}:${check.ready}`).join(","), "voiceover:true,draft_video:true,raw_video:true");
console.log("Caption summary OK.");

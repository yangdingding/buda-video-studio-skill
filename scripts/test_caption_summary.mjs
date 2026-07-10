#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildProjectItem, contentTitleFromName, displayIdFromName, summarizeVoiceover } from "../lib/google-drive-shared.mjs";

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
console.log("Caption summary OK.");

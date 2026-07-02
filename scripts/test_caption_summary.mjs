#!/usr/bin/env node
import assert from "node:assert/strict";
import { summarizeVoiceover } from "../lib/google-drive-shared.mjs";

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

assert.equal(reviewSummary, "agent, 就不是某个人电脑里的黑盒, 里继续处理");
console.log("Caption summary OK.");

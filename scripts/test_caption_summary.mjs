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
console.log("Caption summary OK.");

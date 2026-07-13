#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  handoffBaseName,
  handoffKind,
  renderAiVideoProductionHandoff,
  renderPostProductionDeliveryHandoff,
} from "../lib/production-handoff.mjs";

const item = {
  id: "video-busabase-intro",
  ref: "Video #1",
  display_id: "busabase-intro",
  filename: "busabase-intro",
  title: "Busabase intro",
  body: "| 分镜 | 画面 | 台词 |\n| --- | --- | --- |\n| 1 | Spaces | 用 Busabase 管理 AI coder 的工作。 |",
  source_assets: [{ type: "script", name: "intro.md", path: "Script/intro.md" }],
  outputs: [{ channel: "YouTube 中文" }, { channel: "YouTube Shorts" }],
  cover_copy: { locales: { zh: { title: "Busabase 入门", subtitle: "" }, en: { title: "Busabase", subtitle: "" } } },
};

const production = {
  default_engine: "hyperframes",
  default_brand_profile: "project",
  video_workspace_repository: "vikadata/videos",
  delivery_skill: "buda-video-delivery",
};

const aiDecision = {
  action: "approve",
  workflow_step: "ai_video_production_requested",
  production_engine: "remotion",
  brand_profile: "project",
  outputs: ["YouTube 中文", "YouTube Shorts"],
};

const deliveryDecision = {
  ...aiDecision,
  workflow_step: "delivery_requested",
};

assert.equal(handoffKind(aiDecision), "ai_video_production");
assert.equal(handoffKind(deliveryDecision), "post_production_delivery");
assert.match(handoffBaseName(item), /^video-#1-busabase-intro$/);

const aiHandoff = renderAiVideoProductionHandoff({ item, decision: aiDecision, production });
assert.match(aiHandoff, /Engine: remotion/);
assert.match(aiHandoff, /\$remotion/);
assert.match(aiHandoff, /\$buda-video-delivery in covers mode/);
assert.match(aiHandoff, /Cover production happens in this AI production stage/);
assert.match(aiHandoff, /matching 9:16 Shorts cover variant/);
assert.match(aiHandoff, /Script\//);
assert.match(aiHandoff, /Remotion\//);
assert.match(aiHandoff, /Covers\//);
assert.equal(aiHandoff.includes("/Users/"), false);

const deliveryHandoff = renderPostProductionDeliveryHandoff({ item, decision: deliveryDecision, production });
assert.match(deliveryHandoff, /\$buda-video-delivery in publish mode/);
assert.match(deliveryHandoff, /SRT extraction\/regeneration/);
assert.match(deliveryHandoff, /hard subtitles/);
assert.match(deliveryHandoff, /matching 9:16 cover/);
assert.match(deliveryHandoff, /native 9:16 composition/);
assert.match(deliveryHandoff, /Distribution\//);
assert.equal(deliveryHandoff.includes("/Users/"), false);

process.stdout.write("Production handoff contract OK.\n");

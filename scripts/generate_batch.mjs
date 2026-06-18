#!/usr/bin/env node
import { createDataReader } from "../lib/data-reader/index.mjs";
import { loadConfig } from "../lib/config.mjs";
import { currentBatchPath, decisionsPath } from "../lib/paths.mjs";
import { readJson, withLock, writeJson } from "../lib/common.mjs";

const countMetrics = (items) =>
  items.reduce(
    (metrics, item) => {
      metrics[item.status] = (metrics[item.status] || 0) + 1;
      return metrics;
    },
    {
      needs_review: 0,
      to_approve: 0,
      approved: 0,
      done: 0,
      blocked: 0,
    }
  );

const decisionHasValue = (decision) =>
  Boolean(
    decision?.action ||
      decision?.comment ||
      decision?.cover_title ||
      decision?.cover_subtitle ||
      decision?.cover_zh_title ||
      decision?.cover_zh_subtitle ||
      decision?.cover_en_title ||
      decision?.cover_en_subtitle ||
      decision?.workflow_step ||
      decision?.workflow_done ||
      decision?.outputs?.length
  );

const decisionTime = (decision) => {
  const time = decision?.decided_at ? new Date(decision.decided_at).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const mergeDriveDecisionsIntoLocalCache = async (items) => {
  const remoteDecisions = Object.fromEntries(
    items
      .filter((item) => decisionHasValue(item.decision))
      .map((item) => [item.id, item.decision])
  );
  if (Object.keys(remoteDecisions).length === 0) return;

  const localFile = await readJson(decisionsPath, { decisions: {} });
  const localDecisions = localFile.decisions || {};
  const decisions = { ...localDecisions };

  for (const [id, remoteDecision] of Object.entries(remoteDecisions)) {
    const localDecision = localDecisions[id];
    decisions[id] = decisionTime(remoteDecision) >= decisionTime(localDecision) ? remoteDecision : localDecision;
  }

  await writeJson(decisionsPath, {
    updated_at: new Date().toISOString(),
    decisions,
  });
};

const main = async () => {
  await withLock("Generating video production batch", async () => {
    const loadedConfig = await loadConfig();
    const reader = createDataReader(loadedConfig);
    const { state, items } = await reader.listVideoItems();
    await mergeDriveDecisionsIntoLocalCache(items);
    const now = new Date();
    const batch = {
      batch_id: `buda-video-${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}`,
      generated_at: now.toISOString(),
      source: "buda-video-studio",
      mode: "app-in-skill",
      metrics: countMetrics(items),
      onboarding: state.onboarding,
      drive_status: state.drive_status || null,
      config_summary: {
        ...state.config_summary,
        data_reader: reader.name,
      },
      items,
    };

    await writeJson(currentBatchPath, batch);
    process.stdout.write(
      [
        `Generated ${items.length} video item(s).`,
        `Batch: ${currentBatchPath}`,
        state.onboarding.required ? `Onboarding required: ${state.onboarding.reasons.join(" ")}` : "Ready for review.",
      ].join("\n") + "\n"
    );
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
import { createDataReader } from "../lib/data-reader/index.mjs";
import { loadConfig } from "../lib/config.mjs";
import { currentBatchPath, decisionsPath } from "../lib/paths.mjs";
import { readJson, withLock, writeJson } from "../lib/common.mjs";

const isCli = import.meta.url === `file://${process.argv[1]}`;

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
      decision?.topic_decision ||
      decision?.topic_priority ||
      decision?.owner ||
      decision?.due_date ||
      decision?.recording_status ||
      decision?.workflow_step ||
      decision?.workflow_done ||
      Object.values(decision?.distribution_approvals || {}).some(Boolean) ||
      decision?.outputs?.length ||
      Object.keys(decision?.published_links || {}).length
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

  return decisions;
};

export const generateBatch = async () => {
  let generated = null;
  await withLock("Generating video production batch", async () => {
    const loadedConfig = await loadConfig();
    const reader = createDataReader(loadedConfig);
    const { state, items } = await reader.listVideoItems();
    const decisions = await mergeDriveDecisionsIntoLocalCache(items);
    const mergedItems = items.map((item) => ({
      ...item,
      decision: decisions[item.id] || item.decision || {},
    }));
    const now = new Date();
    const batch = {
      batch_id: `buda-video-${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}`,
      generated_at: now.toISOString(),
      source: "buda-video-studio",
      mode: "app-in-skill",
      metrics: countMetrics(mergedItems),
      onboarding: state.onboarding,
      drive_status: state.drive_status || null,
      config_summary: {
        ...state.config_summary,
        data_reader: reader.name,
      },
      items: mergedItems,
    };

    await writeJson(currentBatchPath, batch);
    generated = { batch, state, itemCount: mergedItems.length };
  });

  return generated;
};

const main = async () => {
  const generated = await generateBatch();
  process.stdout.write(
    [
      `Generated ${generated.itemCount} video item(s).`,
      `Batch: ${currentBatchPath}`,
      generated.state.onboarding.required ? `Onboarding required: ${generated.state.onboarding.reasons.join(" ")}` : "Ready for review.",
    ].join("\n") + "\n"
  );
};

if (isCli) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

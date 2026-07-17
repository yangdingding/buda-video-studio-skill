#!/usr/bin/env node
import { basename } from "node:path";
import { createDataReader } from "../lib/data-reader/index.mjs";
import { loadConfig } from "../lib/config.mjs";
import { currentBatchPath, decisionsPath } from "../lib/paths.mjs";
import { readJson, withLock, writeJson } from "../lib/common.mjs";
import { readTopicDataSourceItems, topicDataSourceAvailable } from "../lib/topics-data-source.mjs";

const isCli = basename(process.argv[1] || "") === "generate_batch.mjs";

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
      Object.keys(decision?.distribution_copy || {}).length ||
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

const existingTopicDataSourceItems = async () => {
  const previousBatch = await readJson(currentBatchPath, { items: [] });
  return (previousBatch.items || []).filter((item) => item.category === "topic_data_source");
};

const mergeTopicDataSourceItems = (previousTopicItems, freshTopicItems) => {
  const itemsById = new Map();
  for (const item of previousTopicItems) itemsById.set(item.id, item);
  for (const item of freshTopicItems) itemsById.set(item.id, item);
  return [...itemsById.values()];
};

export const generateBatch = async () => {
  let generated = null;
  await withLock("Generating video production batch", async () => {
    const loadedConfig = await loadConfig();
    const reader = createDataReader(loadedConfig);
    const { state, items } = await reader.listVideoItems();
    const decisions = await mergeDriveDecisionsIntoLocalCache(items);
    const hasTopicDataSource = await topicDataSourceAvailable(loadedConfig.config);
    const previousTopicItems = hasTopicDataSource ? [] : await existingTopicDataSourceItems();
    const freshTopicItems = await readTopicDataSourceItems({
      config: loadedConfig.config,
      decisions,
      existingItems: items,
    });
    const topicItems = mergeTopicDataSourceItems(previousTopicItems, freshTopicItems);
    const mergedItems = items.map((item) => ({
      ...item,
      decision: decisions[item.id] || item.decision || {},
    }));
    const allItems = [...mergedItems, ...topicItems];
    const now = new Date();
    const batch = {
      batch_id: `buda-video-${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}`,
      generated_at: now.toISOString(),
      source: "buda-video-studio",
      mode: "app-in-skill",
      metrics: countMetrics(allItems),
      onboarding: state.onboarding,
      drive_status: state.drive_status || null,
      topic_source: {
        kind: "canonical_topics_csv",
        active_count: topicItems.length,
        expected_count: 8,
        bilingual_complete_count: topicItems.filter((item) => item.translation_status === "complete").length,
      },
      config_summary: {
        ...state.config_summary,
        data_reader: reader.name,
      },
      items: allItems,
    };

    await writeJson(currentBatchPath, batch);
    generated = { batch, state, itemCount: allItems.length };
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

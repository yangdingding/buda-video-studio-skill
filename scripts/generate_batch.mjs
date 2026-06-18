#!/usr/bin/env node
import { createDataReader } from "../lib/data-reader/index.mjs";
import { loadConfig } from "../lib/config.mjs";
import { currentBatchPath } from "../lib/paths.mjs";
import { withLock, writeJson } from "../lib/common.mjs";

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

const main = async () => {
  await withLock("Generating video production batch", async () => {
    const loadedConfig = await loadConfig();
    const reader = createDataReader(loadedConfig);
    const { state, items } = await reader.listVideoItems();
    const now = new Date();
    const batch = {
      batch_id: `buda-video-${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}`,
      generated_at: now.toISOString(),
      source: "buda-video-studio",
      mode: "app-in-skill",
      metrics: countMetrics(items),
      onboarding: state.onboarding,
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

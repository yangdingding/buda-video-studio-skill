#!/usr/bin/env node
import { currentBatchPath, decisionsPath } from "../lib/paths.mjs";
import { readJson } from "../lib/common.mjs";

const requiredBatchFields = [
  "batch_id",
  "generated_at",
  "source",
  "mode",
  "metrics",
  "config_summary",
  "items",
];

const requiredItemFields = [
  "id",
  "ref",
  "title",
  "summary",
  "body",
  "category",
  "risk",
  "status",
  "stage",
  "proposed_action",
  "reason",
  "source_assets",
  "script_documents",
  "topic_direction",
  "target_audience",
  "topic_decision",
  "topic_priority",
  "owner",
  "due_date",
  "recording_status",
  "edit_brief",
  "cover_copy",
  "outputs",
  "decision",
  "execution",
];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  const batch = await readJson(currentBatchPath);
  assert(batch, `Missing batch file: ${currentBatchPath}`);

  for (const field of requiredBatchFields) {
    assert(Object.prototype.hasOwnProperty.call(batch, field), `Batch missing field "${field}".`);
  }

  assert(Array.isArray(batch.items), "Batch items must be an array.");

  const ids = new Set();
  for (const [index, item] of batch.items.entries()) {
    for (const field of requiredItemFields) {
      assert(Object.prototype.hasOwnProperty.call(item, field), `Item ${index + 1} missing field "${field}".`);
    }
    assert(!ids.has(item.id), `Duplicate item id "${item.id}".`);
    ids.add(item.id);
    assert(Array.isArray(item.risk), `Item "${item.id}" risk must be an array.`);
    assert(Array.isArray(item.source_assets), `Item "${item.id}" source_assets must be an array.`);
    assert(Array.isArray(item.script_documents), `Item "${item.id}" script_documents must be an array.`);
    assert(Array.isArray(item.outputs), `Item "${item.id}" outputs must be an array.`);
    if (item.category === "topic_data_source") {
      assert(item.content_locales && typeof item.content_locales === "object", `Topic "${item.id}" must include content_locales.`);
      assert(typeof item.content_locales.en?.title === "string", `Topic "${item.id}" must preserve an English title.`);
      assert(typeof item.translation_status === "string", `Topic "${item.id}" must include translation_status.`);
    }
  }

  const decisions = await readJson(decisionsPath, { decisions: {} });
  assert(typeof decisions === "object" && decisions !== null, "decisions.json must contain an object.");
  if (decisions.decisions) {
    for (const id of Object.keys(decisions.decisions)) {
      assert(ids.has(id), `Decision references unknown item id "${id}".`);
    }
  }

  process.stdout.write(`Schema OK. ${batch.items.length} item(s) validated.\n`);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { loadConfig } from "../lib/config.mjs";
import { readJson, writeJson } from "../lib/common.mjs";
import { currentBatchPath } from "../lib/paths.mjs";
import {
  defaultTopicCsvPath,
  normalizeTopicRow,
  readTopicDataSourceItems,
  readTopicRows,
  resolveTopicCsvPath,
  topicRowId,
  writeTopicRows,
} from "../lib/topics-data-source.mjs";

const usage = () => `Usage:
  node scripts/topics-data-source.mjs list
  node scripts/topics-data-source.mjs upsert --topic "标题" [--status 待确认] [--owner 小明] [--due-date 2026-06-30] [--priority P1] [--source 选题表] [--note 备注] [--id stable-id]
  node scripts/topics-data-source.mjs sync

Options:
  --csv /path/to/topics.csv   Override the topic CSV path. Defaults to app/.cache/topics.csv when no configured source exists.
`;

const readArgs = (argv) => {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
};

const topicMarkdown = (rows) =>
  [
    "# Buda Video Topics",
    "",
    "| Topic | Status | Owner | Due Date | Priority | Source | Note |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.topic || ""} | ${row.status || ""} | ${row.owner || ""} | ${row.due_date || ""} | ${row.priority || ""} | ${row.source || ""} | ${
          row.note || ""
        } |`
    ),
    "",
  ].join("\n");

const resolveCsvPathForCommand = async (config, args) => args.csv || config.topic_sources?.csv_path || defaultTopicCsvPath;

const listTopics = async (csvPath) => {
  const rows = await readExistingTopicRows(csvPath);
  process.stdout.write(JSON.stringify({ csv_path: csvPath, count: rows.length, rows }, null, 2) + "\n");
};

const topicRowsFromBatch = async () => {
  const batch = await readJson(currentBatchPath, { items: [] });
  return (batch.items || [])
    .filter((item) => item.category === "topic_data_source")
    .map((item) =>
      normalizeTopicRow({
        id: item.id?.replace(/^topic-/, "") || item.title,
        topic: item.title,
        status: item.topic_decision || item.decision?.topic_decision || "待确认",
        owner: item.owner || item.decision?.owner || "",
        due_date: item.due_date || item.decision?.due_date || "",
        priority: item.topic_priority || item.decision?.topic_priority || "P1",
        source: item.topic_source || "选题表",
        note: item.body || item.summary || "",
      })
    );
};

const readExistingTopicRows = async (csvPath) => {
  const rows = (await readTopicRows(csvPath)).map(normalizeTopicRow);
  if (rows.length > 0) return rows;
  const seededRows = await topicRowsFromBatch();
  if (seededRows.length > 0) await writeTopicRows(csvPath, seededRows);
  return seededRows;
};

const upsertTopic = async (csvPath, args) => {
  if (!args.topic && !args.title) throw new Error("--topic is required");
  const rows = await readExistingTopicRows(csvPath);
  const nextRow = normalizeTopicRow({
    id: args.id || args.topic || args.title,
    topic: args.topic || args.title,
    status: args.status || "待确认",
    owner: args.owner || "",
    due_date: args.dueDate || args.due || "",
    priority: args.priority || "P1",
    source: args.source || "选题表",
    note: args.note || "",
  });
  const rowKey = topicRowId(nextRow).toLowerCase();
  const index = rows.findIndex((row) => topicRowId(row).toLowerCase() === rowKey || String(row.topic || "").toLowerCase() === String(nextRow.topic || "").toLowerCase());
  if (index >= 0) rows[index] = { ...rows[index], ...nextRow };
  else rows.push(nextRow);

  await writeTopicRows(csvPath, rows);
  await writeFile(`${csvPath.replace(/\.csv$/i, "")}.md`, topicMarkdown(rows), "utf8");
  return rows;
};

const syncTopics = async (config, csvPath) => {
  const batch = await readJson(currentBatchPath, null);
  if (!batch?.items) throw new Error(`Missing batch file: ${currentBatchPath}. Run scripts/generate_batch.mjs first.`);
  const decisions = Object.fromEntries((batch.items || []).filter((item) => item.decision).map((item) => [item.id, item.decision]));
  const existingItems = (batch.items || []).filter((item) => item.category !== "topic_data_source");
  const topicItems = await readTopicDataSourceItems({ config: { ...config, topic_sources: { ...(config.topic_sources || {}), csv_path: csvPath } }, decisions, existingItems });
  const itemsById = new Map();
  for (const item of existingItems) itemsById.set(item.id, item);
  for (const item of topicItems) itemsById.set(item.id, item);
  const nextBatch = {
    ...batch,
    generated_at: new Date().toISOString(),
    items: [...itemsById.values()],
  };
  await writeJson(currentBatchPath, nextBatch);
  return { count: topicItems.length, total: nextBatch.items.length };
};

const main = async () => {
  const args = readArgs(process.argv.slice(2));
  const command = args._[0] || "help";
  if (command === "help" || args.help) {
    process.stdout.write(usage());
    return;
  }

  const loaded = await loadConfig();
  const config = loaded.config;
  const csvPath = command === "list" ? args.csv || (await resolveTopicCsvPath(config)) : await resolveCsvPathForCommand(config, args);

  if (command === "list") {
    await listTopics(csvPath);
    return;
  }

  if (command === "upsert") {
    const rows = await upsertTopic(csvPath, args);
    const synced = await syncTopics(config, csvPath);
    process.stdout.write(JSON.stringify({ csv_path: csvPath, rows: rows.length, synced }, null, 2) + "\n");
    return;
  }

  if (command === "sync") {
    const rows = await readExistingTopicRows(csvPath);
    await writeFile(`${csvPath.replace(/\.csv$/i, "")}.md`, topicMarkdown(rows), "utf8");
    const synced = await syncTopics(config, csvPath);
    process.stdout.write(JSON.stringify({ csv_path: csvPath, rows: rows.length, synced }, null, 2) + "\n");
    return;
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

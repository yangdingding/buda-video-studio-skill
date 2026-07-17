#!/usr/bin/env node
import { copyFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
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
  node scripts/topics-data-source.mjs import-thread-kit [--apply] [--source-repo /path/to/kapps] [--source-ref origin/develop]

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

const topicMarkdown = (rows, { legacyPath = "" } = {}) =>
  [
    "# Buda Video Topics",
    "",
    ...(legacyPath ? [`<!-- Previous topic table archived at ${basename(legacyPath)}. It is excluded from the active source. -->`, ""] : []),
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

const resolveCsvPathForCommand = async (config, args) => args.csv || (await resolveTopicCsvPath(config)) || defaultTopicCsvPath;

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
        title_en: item.content_locales?.en?.title || item.title,
        title_zh: item.content_locales?.zh?.title || "",
        summary_en: item.content_locales?.en?.summary || item.summary || "",
        summary_zh: item.content_locales?.zh?.summary || "",
        script_en: item.content_locales?.en?.script || item.body || "",
        script_zh: item.content_locales?.zh?.script || "",
        translation_status: item.translation_status || "source_only",
        source_ref: item.rule?.evidence?.source_ref || "",
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

const isLegacyTopicItem = (item) => item.category === "topic_data_source" || /^Topic\s*#/i.test(String(item.ref || ""));

const syncTopics = async (config, csvPath, { replaceTopics = false } = {}) => {
  const batch = await readJson(currentBatchPath, null);
  if (!batch?.items) throw new Error(`Missing batch file: ${currentBatchPath}. Run scripts/generate_batch.mjs first.`);
  const decisions = Object.fromEntries((batch.items || []).filter((item) => item.decision).map((item) => [item.id, item.decision]));
  const existingItems = (batch.items || []).filter((item) => (replaceTopics ? !isLegacyTopicItem(item) : item.category !== "topic_data_source"));
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
  return { count: topicItems.length, total: nextBatch.items.length, removed_legacy_topics: batch.items.length - existingItems.length };
};

const threadKitImportConfig = (config, args) => ({
  ...config,
  topic_sources: {
    ...(config.topic_sources || {}),
    repository_paths: args.sourceRepo ? [args.sourceRepo] : config.topic_sources?.repository_paths,
    repository_refs: args.sourceRef ? [args.sourceRef] : config.topic_sources?.repository_refs,
    markdown_patterns: ["apps/busabase-cloud/content/influencer/thread-kit/*.md"],
    repository_fetch: true,
    repository_enrichment: true,
    include_repository_topics: true,
    repository_only: true,
  },
});

const legacyTopicPath = (csvPath) => `${csvPath.replace(/\.csv$/i, "")}.legacy-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;

const importThreadKit = async (config, csvPath, args) => {
  const topicItems = await readTopicDataSourceItems({
    config: threadKitImportConfig(config, args),
    decisions: {},
    existingItems: [],
  });
  if (topicItems.length === 0) throw new Error("No Thread Kit topics were found. Check --source-repo and --source-ref.");
  if (topicItems.length !== 8) {
    throw new Error(`Thread Kit import expected exactly 8 topics, found ${topicItems.length}. Refuse to replace the canonical topic table.`);
  }

  const rows = topicItems.map((item) => {
    const document = item.script_documents?.[0] || {};
    return normalizeTopicRow({
      id: item.display_id || item.id.replace(/^topic-/, ""),
      topic: item.title,
      status: item.topic_decision || "待确认",
      owner: item.owner || "",
      due_date: item.due_date || "",
      priority: item.topic_priority || "P1",
      source: "Busabase Thread Kit",
      note: item.summary || "",
      title_en: item.content_locales?.en?.title || item.title,
      title_zh: item.content_locales?.zh?.title || "",
      summary_en: item.content_locales?.en?.summary || item.summary || "",
      summary_zh: item.content_locales?.zh?.summary || "",
      script: item.content_locales?.en?.script || document.locales?.en?.raw_text || document.raw_text || "",
      script_en: item.content_locales?.en?.script || document.locales?.en?.raw_text || document.raw_text || "",
      script_zh: item.content_locales?.zh?.script || document.locales?.zh?.raw_text || "",
      translation_status: item.translation_status || "source_only",
      source_ref: item.rule?.evidence?.source_ref || args.sourceRef || "",
      script_name: document.name || "",
      script_source_path: document.path || "",
    });
  });

  if (!args.apply) {
    return {
      csv_path: csvPath,
      rows: rows.length,
      bilingual_complete: rows.filter((row) => row.translation_status === "complete").length,
      apply_required: true,
    };
  }

  const backupPath = legacyTopicPath(csvPath);
  try {
    await copyFile(csvPath, backupPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeTopicRows(csvPath, rows);
  await writeFile(`${csvPath.replace(/\.csv$/i, "")}.md`, topicMarkdown(rows, { legacyPath: backupPath }), "utf8");

  let synced = null;
  try {
    synced = await syncTopics(
      {
        ...config,
        topic_sources: {
          ...(config.topic_sources || {}),
          csv_path: csvPath,
          repository_enrichment: false,
          include_repository_topics: false,
          repository_only: false,
        },
      },
      csvPath,
      { replaceTopics: true }
    );
  } catch (error) {
    synced = { pending: true, reason: error.message || "Run scripts/generate_batch.mjs after importing." };
  }

  return {
    csv_path: csvPath,
    backup_path: backupPath,
    rows: rows.length,
    bilingual_complete: rows.filter((row) => row.translation_status === "complete").length,
    synced,
  };
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

  if (command === "import-thread-kit") {
    const result = await importThreadKit(config, csvPath, args);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readTopicDataSourceItems } from "../lib/topics-data-source.mjs";

const root = new URL("..", import.meta.url).pathname;
const sourceRepo = process.env.BUDA_VIDEO_THREAD_KIT_REPO || "/Users/dingding/Documents/vika/kapps";
const sourceRef = process.env.BUDA_VIDEO_THREAD_KIT_REF || "HEAD";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const items = await readTopicDataSourceItems({
  config: {
    topic_sources: {
      enabled: true,
      repository_paths: [sourceRepo],
      repository_refs: [sourceRef],
      markdown_patterns: ["apps/busabase-cloud/content/influencer/thread-kit/*.md"],
      repository_fetch: false,
      repository_only: true,
    },
  },
  decisions: {},
  existingItems: [
    {
      id: "video-busabase-intro-general",
      title: "Post 1: Launch",
      category: "drive_project",
    },
  ],
});

assert(items.length === 8, `Expected 8 Thread Kit topics, received ${items.length}.`);
assert(items.every((item) => item.category === "topic_data_source"), "Every imported item must be a topic entity.");
assert(items.some((item) => item.title === "Post 1: Launch"), "A Drive project title must not suppress its topic.");

const postOne = items.find((item) => item.display_id === "busabase-intro-general");
assert(postOne?.content_locales?.en?.title === "Post 1: Launch", "Post 1 must preserve its English source title.");
assert(postOne?.content_locales?.en?.script?.includes("## 分镜表格"), "Post 1 must preserve its Markdown storyboard.");
assert(postOne?.script_documents?.[0]?.tables?.some((table) => table.row_count >= 15), "Post 1 must parse its storyboard table.");

const postEight = items.find((item) => item.display_id === "tbd");
assert(postEight?.status === "blocked", "Post 8 must remain blocked.");

const appSource = await readFile(join(root, "app/app.js"), "utf8");
assert(appSource.includes('if (isTopicSourceItem(item)) return "topic_board";'), "Topic board routing must use topic entity identity.");
assert(appSource.includes('if (filter === "topic_board") return isTopicSourceItem(item);'), "Topic board filtering must exclude Drive projects.");
assert(appSource.includes("contentLocaleStorageKey"), "The app must persist the selected content language.");

console.log("Topic data contract OK: 8 canonical topics, Drive separation, storyboard preservation, and bilingual UI contract verified.");

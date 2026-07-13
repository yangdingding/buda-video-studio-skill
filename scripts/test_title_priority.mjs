#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildProjectItem } from "../lib/google-drive-shared.mjs";

const script = `# Temporary folder title

## 录制注意事项

- 标题保持：BudaAI connect your local computer
`;

const file = {
  id: "script",
  name: "temporary-folder-title.md",
  path: "temporary-folder-title/temporary-folder-title.md",
  folder_path: ["temporary-folder-title"],
  extension: ".md",
};

const item = buildProjectItem({
  project: {
    id: "project",
    name: "temporary-folder-title",
    path: "temporary-folder-title",
  },
  files: [file],
  config: { channels: [] },
  index: 0,
  readSnippet: () => script,
});

assert.equal(item.title, "BudaAI connect your local computer");
assert.equal(item.filename, "temporary-folder-title");

process.stdout.write("Video title priority OK.\n");

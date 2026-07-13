#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildProjectItem } from "../lib/google-drive-shared.mjs";

const item = buildProjectItem({
  project: {
    id: "project-1",
    name: "busabase-intro",
    path: "busabase-intro",
    created_at: "2026-07-13T00:00:00.000Z",
  },
  files: [
    {
      id: "script-1",
      name: "script.md",
      path: "busabase-intro/Script/script.md",
      folder_path: ["Script"],
      extension: ".md",
      mime_type: "text/markdown",
    },
    {
      id: "project-asset-1",
      name: "IntroComposition.tsx",
      path: "busabase-intro/Remotion/IntroComposition.tsx",
      folder_path: ["Remotion"],
      extension: ".tsx",
      mime_type: "text/plain",
    },
    {
      id: "project-asset-2",
      name: "manifest.json",
      path: "busabase-intro/HyperFrames/manifest.json",
      folder_path: ["HyperFrames"],
      extension: ".json",
      mime_type: "application/json",
    },
  ],
  config: {},
  index: 0,
  readSnippet: () => "Busabase intro script",
});

const projectAssets = item.source_assets.filter((asset) => asset.type === "production_project");
assert.equal(projectAssets.length, 2);
assert.deepEqual(
  projectAssets.map((asset) => asset.name).sort(),
  ["IntroComposition.tsx", "manifest.json"]
);
assert.equal(item.rule.evidence.production_project, 2);
assert.equal(item.required_checks.find((check) => check.key === "draft_video")?.ready, false);

process.stdout.write("Production project asset detection OK.\n");

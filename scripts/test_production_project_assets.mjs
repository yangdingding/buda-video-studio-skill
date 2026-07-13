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
      name: "scene-manifest.json",
      path: "busabase-intro/HyperFrames/scene-manifest.json",
      folder_path: ["HyperFrames"],
      extension: ".json",
      mime_type: "application/json",
    },
    {
      id: "production-manifest-1",
      name: "production-manifest.json",
      path: "busabase-intro/HyperFrames/production-manifest.json",
      folder_path: ["HyperFrames"],
      extension: ".json",
      mime_type: "application/json",
      preview_url: "https://r2.example.com/busabase-intro/preview.html",
    },
  ],
  config: {},
  index: 0,
  readSnippet: (file) =>
    file.name === "production-manifest.json"
      ? JSON.stringify({
          repo: "vikadata/videos",
          pr: "https://github.com/vikadata/videos/pull/123",
          commit: "abc123",
          engine: "hyperframes",
          projectPath: "videos/busabase-intro",
          previewUrl: "https://r2.example.com/busabase-intro/index.html",
          exports: {
            ai_master: "HyperFrames/busabase-intro.mp4",
            cover_16x9: "Covers/busabase-intro-cover-en.png",
          },
        })
      : "Busabase intro script",
});

const projectAssets = item.source_assets.filter((asset) => asset.type === "production_project");
assert.equal(projectAssets.length, 2);
assert.deepEqual(
  projectAssets.map((asset) => asset.name).sort(),
  ["IntroComposition.tsx", "scene-manifest.json"]
);
const manifestAssets = item.source_assets.filter((asset) => asset.type === "production_manifest");
assert.equal(manifestAssets.length, 1);
assert.equal(manifestAssets[0].preview_url, "https://r2.example.com/busabase-intro/preview.html");
assert.equal(item.production_manifest.repo, "vikadata/videos");
assert.equal(item.production_manifest.pr, "https://github.com/vikadata/videos/pull/123");
assert.equal(item.production_manifest.commit, "abc123");
assert.equal(item.production_manifest.engine, "hyperframes");
assert.equal(item.production_manifest.project_path, "videos/busabase-intro");
assert.equal(item.production_manifest.preview_url, "https://r2.example.com/busabase-intro/index.html");
assert.equal(item.production_manifest.exports.ai_master, "HyperFrames/busabase-intro.mp4");
assert.equal(item.rule.evidence.production_project, 2);
assert.equal(item.required_checks.find((check) => check.key === "draft_video")?.ready, false);

process.stdout.write("Production project asset detection OK.\n");

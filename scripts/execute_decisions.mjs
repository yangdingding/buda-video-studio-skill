#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  briefsDir,
  currentBatchPath,
  decisionsPath,
  distributionDir,
  executionReportPath,
} from "../lib/paths.mjs";
import { readJson, slugify, withLock, writeJson } from "../lib/common.mjs";

const renderBrief = (item, decision) => `# ${item.title}

Ref: ${item.ref}
ID: ${item.display_id || item.id}
Filename: ${item.filename || ""}
Stage: ${item.stage}
Status: ${item.status}

## User Decision

Action: ${decision.action}

${decision.comment || "No review note provided."}

## Summary

${item.summary || "No summary."}

## Source Assets

${item.source_assets.map((asset) => `- ${asset.type}: ${asset.name} (${asset.path})`).join("\n") || "- None"}

## Edit Brief

- Format: ${item.edit_brief.format}
- Duration target: ${item.edit_brief.duration_target}
- Assets ready: ${item.edit_brief.assets_ready ? "yes" : "no"}
- Transcript ready: ${item.edit_brief.transcript_ready ? "yes" : "no"}

## Key Beats

${item.edit_brief.key_beats.map((beat) => `- ${beat}`).join("\n")}

## Cover Copy

- Chinese title: ${decision.cover_zh_title || decision.cover_title || item.cover_copy.locales?.zh?.title || item.cover_copy.title}
- Chinese subtitle: ${decision.cover_zh_subtitle || decision.cover_subtitle || item.cover_copy.locales?.zh?.subtitle || item.cover_copy.subtitle}
- English title: ${decision.cover_en_title || item.cover_copy.locales?.en?.title || ""}
- English subtitle: ${decision.cover_en_subtitle || item.cover_copy.locales?.en?.subtitle || ""}

Variants:

${item.cover_copy.variants.map((variant) => `- ${variant}`).join("\n")}
`;

const normalizeDistributionCopy = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([channel, copy]) => {
        if (!channel || !copy || typeof copy !== "object" || Array.isArray(copy)) return null;
        return [
          channel,
          {
            title: String(copy.title || ""),
            body: String(copy.body || ""),
          },
        ];
      })
      .filter(Boolean)
  );
};

const renderDistributionCopy = (item, decision) => {
  const copy = {
    ...normalizeDistributionCopy(item.distribution_copy),
    ...normalizeDistributionCopy(decision.distribution_copy),
  };
  const channels = Array.isArray(decision.outputs) && decision.outputs.length ? decision.outputs : item.outputs.map((output) => output.channel);
  return channels
    .map((channel) => {
      const entry = copy[channel] || {};
      return `### ${channel}

Title:
${entry.title || ""}

Body:
${entry.body || ""}`;
    })
    .join("\n\n");
};

const renderDistribution = (item, decision) => `# Distribution Checklist: ${item.title}

Ref: ${item.ref}
ID: ${item.display_id || item.id}
Filename: ${item.filename || ""}
Approved note: ${decision.comment || "No note."}

## Channels

${item.outputs
  .map(
    (output) => `- [ ] ${output.channel}
  - Aspect ratio: ${output.aspect_ratio}
  - Captions: ${output.caption ? "yes" : "no"}
  - Cover required: ${output.cover_required ? "yes" : "no"}
  - Copy required: ${output.copy_required ? "yes" : "no"}`
  )
  .join("\n")}

## Platform Copy

${renderDistributionCopy(item, decision) || "No platform copy provided."}

## CTA

Use the configured Buda CTA unless the reviewer requested another CTA.
`;

const main = async () => {
  await withLock("Executing approved video decisions", async () => {
    const batch = await readJson(currentBatchPath);
    if (!batch) {
      throw new Error(`Missing batch file: ${currentBatchPath}`);
    }

    const decisionsFile = await readJson(decisionsPath, { decisions: {} });
    const decisions = decisionsFile.decisions || {};
    const results = [];

    await mkdir(briefsDir, { recursive: true });
    await mkdir(distributionDir, { recursive: true });

    for (const item of batch.items) {
      const decision = decisions[item.id] || item.decision || {};
      if (decision.action !== "approve") {
        results.push({
          id: item.id,
          ref: item.ref,
          title: item.title,
          status: "blocked",
          reason: "No approve decision found.",
        });
        continue;
      }

      const baseName = `${item.ref.replace(/\s+/g, "-").toLowerCase()}-${slugify(item.title)}`;
      const briefPath = join(briefsDir, `${baseName}.md`);
      const distributionPath = join(distributionDir, `${baseName}.md`);

      await writeFile(briefPath, renderBrief(item, decision), "utf8");
      await writeFile(distributionPath, renderDistribution(item, decision), "utf8");

      results.push({
        id: item.id,
        ref: item.ref,
        title: item.title,
        status: "executed",
        reason: "Generated local post-production brief and distribution checklist.",
        outputs: {
          brief: briefPath,
          distribution: distributionPath,
        },
        executed_at: new Date().toISOString(),
      });
    }

    const report = {
      batch_id: batch.batch_id,
      generated_at: new Date().toISOString(),
      source: "buda-video-studio",
      mode: "dry_run_local_files",
      results,
    };

    await writeJson(executionReportPath, report);
    process.stdout.write(
      `Execution report written: ${executionReportPath}\nExecuted ${results.filter((result) => result.status === "executed").length} approved item(s).\n`
    );
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

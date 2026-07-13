#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  briefsDir,
  currentBatchPath,
  deliveryDir,
  decisionsPath,
  distributionDir,
  executionReportPath,
  productionDir,
} from "../lib/paths.mjs";
import { readJson, withLock, writeJson } from "../lib/common.mjs";
import { loadConfig } from "../lib/config.mjs";
import {
  handoffBaseName,
  handoffKind,
  renderAiVideoProductionHandoff,
  renderPostProductionDeliveryHandoff,
} from "../lib/production-handoff.mjs";

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

## Post-production Brief

- Format: ${item.edit_brief.format}
- Duration target: ${item.edit_brief.duration_target}
- Screen recording ready: ${item.edit_brief.recording_ready || item.edit_brief.assets_ready ? "yes" : "no"}
- AI video ready: ${item.edit_brief.draft_video_ready ? "yes" : "no"}
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

export const executeApprovedDecisions = async ({ itemIds = [] } = {}) =>
  withLock("Executing approved video decisions", async () => {
    const batch = await readJson(currentBatchPath);
    if (!batch) {
      throw new Error(`Missing batch file: ${currentBatchPath}`);
    }

    const requestedIds = new Set(itemIds.filter(Boolean));
    const targetItems = requestedIds.size ? batch.items.filter((item) => requestedIds.has(item.id)) : batch.items;
    if (requestedIds.size && targetItems.length === 0) {
      throw new Error("No matching video item was found for the requested handoff.");
    }

    const decisionsFile = await readJson(decisionsPath, { decisions: {} });
    const decisions = decisionsFile.decisions || {};
    const { config } = await loadConfig();
    const production = config.production || {};
    const results = [];

    await mkdir(briefsDir, { recursive: true });
    await mkdir(distributionDir, { recursive: true });
    await mkdir(productionDir, { recursive: true });
    await mkdir(deliveryDir, { recursive: true });

    for (const item of targetItems) {
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

      const baseName = handoffBaseName(item);
      const briefPath = join(briefsDir, `${baseName}.md`);
      const distributionPath = join(distributionDir, `${baseName}.md`);
      const kind = handoffKind(decision);

      if (kind === "ai_video_production") {
        const productionPath = join(productionDir, `${baseName}.md`);
        await writeFile(productionPath, renderAiVideoProductionHandoff({ item, decision, production }), "utf8");
        results.push({
          id: item.id,
          ref: item.ref,
          title: item.title,
          status: "executed",
          kind,
          reason: "Generated an AI video production handoff for the selected render engine and covers mode.",
          outputs: { production: productionPath },
          executed_at: new Date().toISOString(),
        });
        continue;
      }

      if (kind === "post_production_delivery") {
        const deliveryPath = join(deliveryDir, `${baseName}.md`);
        await writeFile(deliveryPath, renderPostProductionDeliveryHandoff({ item, decision, production }), "utf8");
        await writeFile(distributionPath, renderDistribution(item, decision), "utf8");
        results.push({
          id: item.id,
          ref: item.ref,
          title: item.title,
          status: "executed",
          kind,
          reason: "Generated a post-production delivery handoff and editable distribution checklist.",
          outputs: { delivery: deliveryPath, distribution: distributionPath },
          executed_at: new Date().toISOString(),
        });
        continue;
      }

      await writeFile(briefPath, renderBrief(item, decision), "utf8");
      await writeFile(distributionPath, renderDistribution(item, decision), "utf8");

      results.push({
        id: item.id,
        ref: item.ref,
        title: item.title,
        status: "executed",
        kind: "post_production_brief",
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
    return report;
  });

const main = async () => {
  const report = await executeApprovedDecisions();
  process.stdout.write(
    `Execution report written: ${executionReportPath}\nExecuted ${report.results.filter((result) => result.status === "executed").length} approved item(s).\n`
  );
};

if (basename(process.argv[1] || "") === "execute_decisions.mjs") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

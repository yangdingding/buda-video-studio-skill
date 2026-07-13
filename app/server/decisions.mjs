import { decisionsPath } from "./paths.mjs";
import { readJson, writeJson } from "./json.mjs";
import { ensureUnlocked } from "./lock.mjs";
import {
  decisionToStatusEntry,
  loadDriveStatusContext,
  readDriveStatus,
  writeDriveStatus,
} from "../../lib/google-drive-state.mjs";

const allowedActions = new Set(["approve", "revise", "block", "no_action", ""]);
const allowedWorkflowSteps = new Set([
  "topic_selected",
  "ai_video_production_requested",
  "assigned_recording",
  "material_reviewed",
  "editing",
  "delivery_requested",
  "cover_done",
  "",
]);

const normalizeProductionEngine = (value) => (value === "remotion" ? "remotion" : "hyperframes");

const normalizeBrandProfile = (value) => (value === "buda" ? "buda" : "project");

const payloadValue = (payload, previous, key) =>
  Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] || "" : previous[key] || "";

const normalizeDistributionApprovals = (value) => ({
  kelly: Boolean(value?.kelly),
  kelvin: Boolean(value?.kelvin),
});

const normalizeAssetOverrides = (value) => ({
  raw_video: value?.raw_video === "rejected" ? "rejected" : "",
  voiceover: value?.voiceover === "rejected" ? "rejected" : "",
  cover_source: value?.cover_source === "rejected" ? "rejected" : "",
});

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

const hasDistributionApprovals = (value) =>
  Object.values(normalizeDistributionApprovals(value)).every(Boolean);

const syncDecisionToDrive = async ({ id, decision }) => {
  const { loadedConfig, tokenState } = await loadDriveStatusContext();
  if (!tokenState.ready) {
    return {
      synced: false,
      reason: "Google Drive token is not ready.",
    };
  }

  const current = await readDriveStatus({
    config: loadedConfig.config,
    accessToken: tokenState.accessToken,
  });
  const status = {
    ...current.status,
    videos: {
      ...(current.status.videos || {}),
      [id]: decisionToStatusEntry(decision),
    },
  };
  const saved = await writeDriveStatus({
    config: loadedConfig.config,
    accessToken: tokenState.accessToken,
    status,
  });

  return {
    synced: true,
    file_id: saved.file?.id || "",
    file_name: saved.file?.name || "",
  };
};

export const saveDecision = async (payload) => {
  await ensureUnlocked();

  if (!payload || typeof payload !== "object") {
    throw new Error("Decision payload must be an object.");
  }

  if (!payload.id) {
    throw new Error("Decision payload requires id.");
  }

  if (!allowedActions.has(payload.action || "")) {
    throw new Error(`Unsupported action "${payload.action}".`);
  }

  if (!allowedWorkflowSteps.has(payload.workflow_step || "")) {
    throw new Error(`Unsupported workflow step "${payload.workflow_step}".`);
  }

  const current = await readJson(decisionsPath, { decisions: {} });
  const decisions = current.decisions || {};
  const previous = decisions[payload.id] || {};
  const distributionApprovals = Object.prototype.hasOwnProperty.call(payload, "distribution_approvals")
    ? normalizeDistributionApprovals(payload.distribution_approvals)
    : normalizeDistributionApprovals(previous.distribution_approvals);
  const assetOverrides = Object.prototype.hasOwnProperty.call(payload, "asset_overrides")
    ? normalizeAssetOverrides(payload.asset_overrides)
    : normalizeAssetOverrides(previous.asset_overrides);
  const distributionCopy = Object.prototype.hasOwnProperty.call(payload, "distribution_copy")
    ? normalizeDistributionCopy(payload.distribution_copy)
    : normalizeDistributionCopy(previous.distribution_copy);
  const workflowDone = Boolean((payload.workflow_done || previous.workflow_done) && hasDistributionApprovals(distributionApprovals));
  decisions[payload.id] = {
    action: payload.action || "",
    comment: payload.comment || "",
    topic_decision: payloadValue(payload, previous, "topic_decision"),
    topic_priority: payloadValue(payload, previous, "topic_priority"),
    owner: payloadValue(payload, previous, "owner"),
    due_date: payloadValue(payload, previous, "due_date"),
    recording_status: payloadValue(payload, previous, "recording_status"),
    cover_title: payload.cover_title || "",
    cover_subtitle: payload.cover_subtitle || "",
    cover_zh_title: payload.cover_zh_title || payload.cover_title || "",
    cover_zh_subtitle: payload.cover_zh_subtitle || payload.cover_subtitle || "",
    cover_en_title: payload.cover_en_title || "",
    cover_en_subtitle: payload.cover_en_subtitle || "",
    outputs: Array.isArray(payload.outputs) ? payload.outputs : [],
    asset_overrides: assetOverrides,
    published_links:
      payload.published_links && typeof payload.published_links === "object" && !Array.isArray(payload.published_links)
        ? payload.published_links
        : previous.published_links || {},
    distribution_copy: distributionCopy,
    production_engine: normalizeProductionEngine(payload.production_engine || previous.production_engine),
    brand_profile: normalizeBrandProfile(payload.brand_profile || previous.brand_profile),
    workflow_step: payload.workflow_step || previous.workflow_step || "",
    distribution_approvals: distributionApprovals,
    workflow_done: workflowDone,
    decided_at: new Date().toISOString(),
  };

  await writeJson(decisionsPath, {
    updated_at: new Date().toISOString(),
    decisions,
  });

  const decision = decisions[payload.id];
  try {
    const drive_sync = await syncDecisionToDrive({
      id: payload.id,
      decision,
    });
    return {
      ...decision,
      drive_sync,
    };
  } catch (error) {
    return {
      ...decision,
      drive_sync: {
        synced: false,
        error: error.message || "Google Drive status sync failed.",
      },
    };
  }
};

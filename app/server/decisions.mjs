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
const allowedWorkflowSteps = new Set(["topic_selected", "assigned_recording", ""]);

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
  decisions[payload.id] = {
    action: payload.action || "",
    comment: payload.comment || "",
    cover_title: payload.cover_title || "",
    cover_subtitle: payload.cover_subtitle || "",
    cover_zh_title: payload.cover_zh_title || payload.cover_title || "",
    cover_zh_subtitle: payload.cover_zh_subtitle || payload.cover_subtitle || "",
    cover_en_title: payload.cover_en_title || "",
    cover_en_subtitle: payload.cover_en_subtitle || "",
    outputs: Array.isArray(payload.outputs) ? payload.outputs : [],
    published_links:
      payload.published_links && typeof payload.published_links === "object" && !Array.isArray(payload.published_links)
        ? payload.published_links
        : previous.published_links || {},
    workflow_step: payload.workflow_step || previous.workflow_step || "",
    workflow_done: Boolean(payload.workflow_done || previous.workflow_done),
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

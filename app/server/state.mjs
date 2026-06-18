import { currentBatchPath, decisionsPath, executionReportPath } from "./paths.mjs";
import { readJson } from "./json.mjs";
import { readLock } from "./lock.mjs";

export const getState = async () => {
  const [batch, decisions, executionReport, lock] = await Promise.all([
    readJson(currentBatchPath, null),
    readJson(decisionsPath, { decisions: {} }),
    readJson(executionReportPath, null),
    readLock(),
  ]);

  return {
    app: "buda-video-studio",
    batch,
    decisions: decisions?.decisions || {},
    execution_report: executionReport,
    lock,
  };
};

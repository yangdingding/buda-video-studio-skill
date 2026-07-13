#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const appSource = await readFile(join(root, "app/app.js"), "utf8");
const rulesSource = await readFile(join(root, "references/video-rules.md"), "utf8");
const skillSource = await readFile(join(root, "SKILL.md"), "utf8");

const requiredAppRule = 'if (item.stage === "editing" || decision.workflow_step === "editing") return "editing";';
const requiredHandoffRule = 'if (decision.workflow_step === "delivery_requested") return "editing";';
const forbiddenCoverQueue = "cover_" + "generation";

const checks = [
  {
    ok: appSource.includes(requiredAppRule),
    message: "app workflow keeps manually started post-production in the editing queue.",
  },
  {
    ok: appSource.includes(requiredHandoffRule),
    message: "app workflow keeps a generated delivery handoff in the editing queue.",
  },
  {
    ok: !appSource.includes(forbiddenCoverQueue),
    message: "app workflow does not expose a separate cover queue.",
  },
  {
    ok: rulesSource.includes("The app keeps manually started work in the `editing` queue until channel export evidence appears."),
    message: "canonical rules document manual post-production behavior.",
  },
  {
    ok: skillSource.includes("manually started post-production stays in the `editing` queue until channel export evidence appears"),
    message: "skill summary documents manual post-production behavior.",
  },
];

const failures = checks.filter((check) => !check.ok);

if (failures.length > 0) {
  console.error("Workflow rule check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.message}`);
  }
  process.exit(1);
}

console.log("Workflow rule check OK.");

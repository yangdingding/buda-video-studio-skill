#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const appSource = await readFile(join(root, "app/app.js"), "utf8");
const rulesSource = await readFile(join(root, "references/video-rules.md"), "utf8");
const skillSource = await readFile(join(root, "SKILL.md"), "utf8");

const requiredAppRule = 'if (item.stage === "editing" || decision.workflow_step === "editing") return "editing";';
const forbiddenAppRule =
  'return hasCoverAsset(item) || decision.workflow_step === "cover_done" ? "editing" : "cover_generation";';

const checks = [
  {
    ok: appSource.includes(requiredAppRule),
    message: "app workflow keeps manually started editing in 剪辑中.",
  },
  {
    ok: !appSource.includes(forbiddenAppRule),
    message: "app workflow no longer routes manual editing without cover to 待制作封面.",
  },
  {
    ok: rulesSource.includes("The app keeps manually started work in `剪辑中` until channel export evidence appears."),
    message: "canonical rules document manual editing behavior.",
  },
  {
    ok: skillSource.includes("manually started editing stays in `剪辑中` until channel export evidence appears"),
    message: "skill summary documents manual editing behavior.",
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

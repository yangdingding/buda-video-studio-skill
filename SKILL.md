---
name: buda-video-studio
description: "Orchestrate Buda video production from topic scripts through AI video handoffs, cover and delivery modes, Google Drive review, human recording, post-production, Shorts, and distribution records."
---

# Buda Video Studio

Use this skill when the user wants to manage Buda video production work: topic directions with scripts/storyboards, HyperFrames or Remotion AI video handoffs, final human screen recording, post-production delivery, cover copy, output formats, Shorts, and distribution channels.

This skill follows the App-in-Skill pattern:

- The skill reads the configured online Google Drive video library and prepares a local review batch.
- The local app is a quiet operator surface for review, notes, approvals, cover copy, channel decisions, and published-link records.
- The app reads and writes local handoff files and may sync video decision state to a single Google Drive JSON file.
- External or irreversible actions require the skill to re-read approvals before executing.

## Default Workflow

When the user asks to review video production status, AI video readiness, post-production readiness, cover copy, output formats, or distribution channels:

1. Run `node scripts/generate_batch.mjs` from this skill directory.
2. If onboarding says OAuth client exists but no token is configured, run `node scripts/auth_google_drive.mjs`, have the user approve the browser prompt, then run `node scripts/generate_batch.mjs` again.
3. Start or reuse the local app with `app/start.sh`.
4. Report the local URL printed by the launcher.
5. Tell the user the app stores local cache files and, when Drive write scope is authorized, syncs decisions to `buda-video-status.json`.

When the user asks to execute approved decisions:

1. Run `node scripts/validate_ui_schema.mjs`.
2. Run `node scripts/execute_decisions.mjs`.
3. Read each generated handoff before acting: `production/` handoffs direct AI-video creation and `delivery/` handoffs direct post-production packaging.
4. For AI production, use the selected `hyperframes` or `remotion` engine and invoke `$buda-video-delivery` in `covers` mode; final cover creation is part of this stage. For post-production delivery, invoke `$buda-video-delivery` in `publish` mode to package SRT, hard subtitles, Shorts cover insertion, and platform outputs.
5. Summarize the execution report. Handoffs are local planning artifacts; do not claim media was rendered, uploaded, or published until evidence exists.

If the user says "chat only", "no UI", "纯聊天", or similar, do not launch the app. Summarize the batch in numbered items and collect approvals in chat.

## Web Buda Handoff

After changing this skill, syncing it to the local installed skill, committing, or pushing, always include a short Web Buda prompt in the final response unless the user explicitly says not to. Keep it concise and include the latest required commit when available:

```text
请更新 buda-video-studio skill 到最新版，至少包含 commit <commit>。保留现有配置和缓存，重新生成批次并启动工作台。
```

If there is no commit yet, replace the commit clause with a short description of the local change.

## Local App Maintenance

- Preserve meaningful UI state with the app's hash route or local storage when it helps users return to the same view, including sidebar expansion, dashboard/detail routes, and settings panels.
- Keep sidebar and dashboard changes compatible with the existing `app/.cache/` handoff files and `config.local.yml`; do not migrate private state formats just to match a newer scaffold.

## Data Sources

The primary source is online Google Drive through the Drive API. Do not rely on a user's local Drive sync path for the normal workflow.

```yaml
data_reader: "google_drive_api"

google_drive:
  mode: "api"
  root_folder_id: "Google Drive folder id for Buda Videos"
  auth_mode: "device"
  client_secret_path: "~/.config/buda-video-studio/google-oauth-client.json"
  token_path: "~/.config/buda-video-studio/google-oauth-token.json"
  access_token_env: "BUDA_VIDEO_GOOGLE_ACCESS_TOKEN"
  status_file_name: "buda-video-status.json"
```

`local_drive` may exist as an explicit development fallback only. It is not the default and should not be used for team-facing workflows.

The expected online Drive shape is project-folder based:

```text
Buda Videos/
├── use-case-whisper/
│   ├── Raw/
│   │   └── 成品样片/
│   ├── Covers/
│   ├── Youtube/
│   ├── Shorts/
│   ├── 原视频/
│   └── 视频号/
└── intro-workbench-ui/
    ├── Raw/
    │   └── 成品样片/
    ├── Covers/
    ├── Youtube/
    ├── Shorts/
    └── 视频号/
```

`Raw/成品样片/`, `封面素材/`, or configured cover-source folders are treated as cover source/material for cover production. `Covers/` contains final generated cover outputs for distribution checks.

## Production Orchestration

`buda-video-studio` is the production state machine and the single entry point. `buda-video-delivery` is its mode-based finishing dependency; do not dispatch legacy cover or Shorts skills directly.

1. In `AI 视频制作中`, create an AI production task. It records a `hyperframes` or `remotion` engine, a `project` or `buda` cover profile, and an artifact contract: `Script/`, `Remotion/`, and `Covers/`.
2. The production agent works in the configured video workspace repository, records source commit and relative source paths, creates the AI master with voice and subtitles, and invokes `$buda-video-delivery covers` to produce 16:9 and needed 9:16 final covers during AI production.
3. Verified AI assets later export to the project Drive folders. The project moves to `待确认 AI 视频` only after Drive evidence contains script, AI video, and cover.
4. After AI approval, human screen recording is the last recording step. In `后期剪辑中`, create a delivery task that invokes `$buda-video-delivery publish` for final channel files, SRT extraction/regeneration, single-line SRT normalization, hard subtitles, Shorts cover insertion, and distribution material.
5. Social publication remains human-approved. The app records selected channels, editable platform copy, and public links after publishing.

Configuration lookup order:

1. `BUDA_VIDEO_STUDIO_CONFIG=/absolute/path/to/config.yml`
2. `config.local.yml` in this skill directory
3. `~/.config/buda-video-studio/config.yml`
4. `config.example.yml`

`config.example.yml` is a template only. If no private config exists, if the root folder id is missing, or if OAuth is not ready, show onboarding instead of pretending the video library is available.

## Safety Rules

- Do not publish videos, upload to social platforms, delete Drive files, or move large file sets from the local app.
- The skill may call Google Drive API for listing, reading configured video assets, and creating/updating the configured status JSON file.
- Treat publication, deletion, account access, paid promotion, customer data, and brand/legal claims as approval-required.
- Keep Drive credentials, private folder IDs, and tokens out of batch files, UI state, logs, reports, and screenshots.
- Do not write video assets, move folders, delete files, or publish content from the app; the only Drive mutation allowed by default is the status JSON file.
- The app may show only safe config summaries: source mode, configured root path readiness, folder names, channel names, and style settings.
- Before executing, re-read `app/.cache/decisions.json` and refuse to act on missing approvals.

## File Contract

- `app/.cache/current_batch.json`: latest generated video review batch.
- `app/.cache/decisions.json`: user decisions, notes, publication links, and local item edits.
- `app/.cache/execution_report.json`: latest generated briefs/checklists report.
- `app/.cache/production/`: AI video production handoffs with render engine, script, cover, and Drive artifact requirements.
- `app/.cache/delivery/`: post-production delivery handoffs with channel, Shorts, and distribution requirements.
- `app/.cache/agent.lock`: lock while the skill writes batch/report files.
- `buda-video-status.json`: optional Google Drive root-level state file used to remember decisions, completion state, and publication links across environments.

## Video Stages

- `idea`: topic or concept only. The app shows this first in `选题表`; accepted topics move into `AI 视频制作中`.
- `script_ready`: script/storyboard material or partial AI video evidence exists, but the AI video package is not complete.
- `render_ready`: the AI video package is ready for human review: script/storyboard, rendered preview video with voice/subtitles, and final cover.
- `assets_ready`: a human screen recording exists before the AI video package is complete.
- `ready_for_edit`: the AI video package has been approved and the final human screen recording is ready for post-production.
- `editing`: currently in post-production. The app uses this when editing/export has started but channel export files have not appeared yet.
- `cover_review`: needs cover copy or cover approval.
- `distribution_ready`: exported asset exists and needs distribution work.
- `published`: already published or archived as done.
- `blocked`: missing critical source material or user direction.

## Rule Definition

Use `references/video-rules.md` as the canonical rule explanation. In short:

1. Treat each direct child folder under the configured Drive root as a video project.
2. Identify scripts/storyboards, HyperFrames or Remotion source project files, HyperFrames or Remotion AI video renders, final human screen recordings, cover source/material images, final `Covers` outputs, and channel exports from configured folder names, file keywords, and file extensions.
3. Before recording, automatically check the AI video package: script/storyboard material, rendered AI video with voice/subtitles, and final cover. The human screen recording is checked only after the AI video is approved. HyperFrames/Remotion source files and optional R2 preview manifests are shown in the detail view, but they do not replace the rendered AI video evidence.
4. Show the human workflow as: `选题表` -> `AI 视频制作中` -> `待确认 AI 视频` -> `待录制` -> `待进入后期` -> `后期剪辑中` -> `待确认分发`. Final covers are produced with the AI video package, not in a separate queue; SRT, hard subtitles, and Shorts packaging are produced after human recording in post-production delivery.
5. Apply asset priority: selected YouTube language exports plus 视频号 and final cover -> distribution confirmation. Default projects require YouTube Chinese and English; single-language projects can uncheck the unused YouTube language in `输出渠道`, so one YouTube export can be enough. Shorts is optional and should be shown when present, but missing Shorts must not block `待确认分发`; channel exports without final cover stay in `editing` until the AI production package restores it; manually started post-production stays in the `editing` queue until channel export evidence appears; approved AI video plus screen recording -> post-production handoff.
6. Add human-readable missing-item risks when a required item is absent.
7. Treat recording as the final human production step: do not move an item into `待录制` until the AI video package has been reviewed and approved.
8. Keep the app read/write only over local handoff files; external actions remain skill-side and approval-gated.

## State and Sync

- Use the app's `重新同步` control, or rerun `node scripts/generate_batch.mjs`, whenever Google Drive files change.
- Google Drive remains the source of truth for assets. The app should not require local Drive sync paths.
- Local human decisions are stored in `app/.cache/decisions.json`.
- If Drive write scope is available, decisions are also merged into `buda-video-status.json` so another environment can remember owners, due dates, recording status, workflow overrides, completion, and publication links.
- Re-sync must preserve the current Google Drive OAuth config/token and merge status JSON back into the local cache.

## App Actions

The app stores decisions locally and syncs them to the Drive status file when available. After a video is marked complete, the app can also record the public URL for each selected distribution channel. The skill performs approved follow-up work.

Supported decision actions:

- `approve`: ready for the next skill-side step.
- `revise`: user requested changes or extra direction.
- `block`: cannot proceed.
- `no_action`: intentionally skip.

Approved first-version execution creates local files only:

- post-production brief markdown files under `app/.cache/briefs/`
- distribution checklist markdown files under `app/.cache/distribution/`
- AI production handoffs under `app/.cache/production/`
- post-production delivery handoffs under `app/.cache/delivery/`
- `app/.cache/execution_report.json`

No external publication is performed.

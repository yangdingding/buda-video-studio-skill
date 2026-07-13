# Buda Video Studio Rules

The skill should classify projects with deterministic, explainable rules. The local app may display and edit decisions, but it must not call Google Drive directly or publish anything.

## 1. Required Production Checks

Each project must be checked for three required production items before overlay/export:

1. Script/subtitle material: any `.md`口播稿/脚本, or `.srt`, `.vtt`, `.txt` subtitle/transcript file inside the project folder.
2. Draft video: a HyperFrames draft video with text and voice, usually under configured draft folders such as `Draft`, `Drafts`, `草稿视频`, `HyperFrames`, or `Preview`. No digital-human/avatar video is required.
3. Screen recording: the final human recording made by following the draft video. It is a video file under configured raw/recording folders such as `Raw`, `原始视频`, `原视频`, `录屏`, or `Screen Recording`.

These checks are shown in the UI as `脚本/字幕`, `草稿视频`, and `录屏素材`. Missing checks are surfaced as human-readable risks, never as internal keys.

## 2. Asset Identification

Each direct child folder under the configured Google Drive root is treated as one video project.

- Screen recording: video files under folders named `Raw`, `原始视频`, `原视频`, `录屏`, or `Screen Recording`, excluding draft and channel export files.
- Draft video: video files under folders named `Draft`, `Drafts`, `草稿视频`, `草稿`, `HyperFrames`, `HyperFrame`, `Preview`, or `预览`, or files whose name/path contains configured draft keywords such as `draft`, `草稿`, `hyperframes`, or `preview`.
- Script material: `.md` or `.txt` files anywhere inside the project.
- Transcript material: `.srt`, `.txt`, or `.vtt` files anywhere inside the project.
- Cover source/material: `.png`, `.jpg`, or `.jpeg` image files under folders named `成品样片`, `封面素材`, `Cover Source`, or `Cover Sources`.
- Final cover outputs: `.png`, `.jpg`, or `.jpeg` image files under folders named `Covers` or `封面`.
- Channel exports: video files under folders named `Youtube`, `YouTube`, `Shorts`, or `视频号`.

These names are configurable in `video_library`.

## 3. Stage Priority

Rules are evaluated from highest to lowest priority:

1. `distribution_ready` + `to_approve`: the selected YouTube language exports, one `视频号` export, and final cover output exist. By default the app expects both YouTube Chinese and English, but a single-language project can uncheck the unused YouTube language in `输出渠道`; then one YouTube export is enough. Shorts is optional: show it when present, but do not block distribution confirmation when absent. The next human task is `待确认分发`.
2. `distribution_ready` + `needs_review`: the selected YouTube language exports and `视频号` export exist, but final cover output is missing. Shorts remains optional. The next human task is `待制作封面`.
3. `editing`: overlay/export has been manually started, but the required channel outputs are not complete yet. The app keeps manually started work in the `editing` queue until channel export evidence appears.
4. `ready_for_edit`: script/subtitle material, draft video, and human screen recording all exist. The next human task is to approve the overlay/export handoff.
5. `script_ready`: script/subtitle material and draft video exist, but the human screen recording is missing. The next human task is recording.
6. `assets_ready`: a human screen recording exists, but script/subtitle material or the draft video is missing. The next human task is to recover the missing pre-production asset.
7. `idea`: no source material was found. The next human task is to add direction or create the script/draft.

## 4. Human Workflow Queues

The app displays a production workflow on top of the deterministic file-stage rules:

1. `选题表`: topic folders or ideas that have not yet been accepted into the script/draft workflow.
2. `待分配脚本/草稿`: accepted topics waiting for a script/draft owner or delivery date.
3. `待补脚本/草稿`: accepted or assigned items where script/subtitle material, the HyperFrames draft video, or the human screen recording is still missing.
4. `待录制`: script/subtitle material and the HyperFrames draft video are present; recording is now the final human step.
5. `待覆盖导出`: script/subtitle material, draft video, and screen recording are present and need human quality review or overlay/export handoff.
6. `覆盖导出中`: overlay/export has started, but required channel export video files are not complete yet.
7. `待制作封面`: channel export video files exist, but final cover outputs are still missing from `Covers`/`封面`.
8. `待确认分发`: the selected YouTube language exports, 视频号 export, and final cover outputs exist, and distribution needs confirmation. Shorts is a supplementary output, not a blocker.

The first two queues are advanced by local UI decisions only. They do not mutate Google Drive.

## 5. Automatic vs Manual Progress

Automatic progress comes from Drive evidence:

- `待补脚本/草稿` moves forward when the script/subtitle and draft video appear in Drive.
- `待录制` appears only after script/subtitle material and the HyperFrames draft video are ready and the human screen recording is still missing.
- `待覆盖导出` appears when script/subtitle material, draft video, and screen recording are all present.
- `覆盖导出中` appears when overlay/export has been manually started.
- `待制作封面` appears when channel export evidence exists but no final cover exists in `Covers`.
- `待确认分发` appears after the selected YouTube language exports, 视频号 export, and final cover exist. Default projects require YouTube Chinese and English; single-language exceptions can uncheck the unused YouTube language in the app. Shorts should appear in the review list if it exists, but missing Shorts must not block this state.

Manual progress comes from the local UI and is stored in `buda-video-status.json` when Drive write access is available:

- Accepting a topic moves it from `选题表` to `待分配脚本/草稿`.
- Saving owner, delivery time, and recording status makes the assignment visible in all lists.
- Changing `输出渠道` changes what the app expects for distribution. For example, a Chinese-only project should keep `YouTube 中文` and `视频号`, and uncheck `YouTube English`.
- Recording is the last human production step. Do not move an item into recording just because it has been assigned; wait until the script/subtitle and HyperFrames draft video are present.
- Overlay/export is intentionally light: put the human screen recording over the draft video and export the selected platform versions.
- Marking distribution complete stores publication links and moves the item to `已完成`.

## 6. Workflow Status

- `to_approve`: the skill found enough evidence for the next action.
- `needs_review`: the item needs human direction before the next action.
- `blocked`: a human marked the item blocked.
- `done`: the skill completed an approved local handoff.

## 7. Risks

- `missing_voiceover`: no script markdown or subtitle/transcript file was found.
- `missing_draft_video`: no HyperFrames draft video was found.
- `missing_cover_source`: no PNG/JPG/JPEG cover source/material image or final cover output was found.
- `missing_cover`: final cover output is missing after channel export files exist.
- `missing_raw_video`: no human screen recording was found.

No rule performs remote mutation. Approved work creates local handoff files only.

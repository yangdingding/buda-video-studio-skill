# Buda Video Studio Rules

The skill should classify projects with deterministic, explainable rules. The local app may display and edit decisions, but it must not call Google Drive directly or publish anything.

## 1. Required Production Checks

Each project must be checked for three required production items:

1. Voiceover/script material: any `.md`口播稿/脚本, or `.srt`, `.vtt`, `.txt` subtitle/transcript file inside the project folder.
2. Cover source/material: a `.png`, `.jpg`, or `.jpeg` source image under configured source folders such as `Raw/成品样片`, `封面素材`, or `Cover Source`. If a final cover already exists under `Covers` or `封面`, this check is also satisfied.
3. Raw video: a video file under configured raw folders such as `Raw`, `原始视频`, or `原视频`.

These checks are shown in the UI as `口播稿`, `封面素材`, and `原始视频`. Missing checks are surfaced as human-readable risks, never as internal keys.

## 2. Asset Identification

Each direct child folder under the configured Google Drive root is treated as one video project.

- Raw footage: video files under folders named `Raw`, `原始视频`, or `原视频`.
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
3. `editing`: editing has been manually started, but the required channel outputs are not complete yet. The app keeps manually started work in `剪辑中` until channel export evidence appears.
4. `ready_for_edit`: raw video, voiceover/script markdown or subtitle file, and cover source/material all exist. A final cover in `Covers` also satisfies the cover source/material check. The next human task is to approve post-production handoff.
5. `assets_ready`: raw footage exists, but script/transcript material is missing. The next human task is to clarify the editing direction.
6. `script_ready`: script/transcript material exists, but raw footage is missing. The next human task is to confirm whether footage is needed or still pending.
7. `idea`: no source material was found. The next human task is to add assets or clarify the topic.

## 4. Human Workflow Queues

The app displays a production workflow on top of the deterministic file-stage rules:

1. `选题表`: topic folders or ideas that have not yet been accepted into recording.
2. `待分配录制`: accepted topics waiting for an owner, recorder, or delivery date.
3. `待补齐素材`: assigned recording items where voiceover/subtitle material, cover source/material, or raw video is still missing.
4. `待进入后期`: all three required source items are present and need human quality review or post-production handoff.
5. `剪辑中`: editing has started, but required channel export video files are not complete yet.
6. `待制作封面`: channel export video files exist, but final cover outputs are still missing from `Covers`/`封面`.
7. `待确认分发`: the selected YouTube language exports, 视频号 export, and final cover outputs exist, and distribution needs confirmation. Shorts is a supplementary output, not a blocker.

The first two queues are advanced by local UI decisions only. They do not mutate Google Drive.

## 5. Automatic vs Manual Progress

Automatic progress comes from Drive evidence:

- `待录制` / `待补齐素材` moves forward when uploaded source files appear in Drive.
- `待进入后期` appears when voiceover/subtitle material, cover material/final cover, and raw video are all present.
- `剪辑中` appears when editing has been manually started.
- `待制作封面` appears when channel export evidence exists but no final cover exists in `Covers`.
- `待确认分发` appears after the selected YouTube language exports, 视频号 export, and final cover exist. Default projects require YouTube Chinese and English; single-language exceptions can uncheck the unused YouTube language in the app. Shorts should appear in the review list if it exists, but missing Shorts must not block this state.

Manual progress comes from the local UI and is stored in `buda-video-status.json` when Drive write access is available:

- Accepting a topic moves it from `选题表` to `待分配录制`.
- Saving owner, delivery time, and recording status makes the assignment visible in all lists.
- Changing `输出渠道` changes what the app expects for distribution. For example, a Chinese-only project should keep `YouTube 中文` and `视频号`, and uncheck `YouTube English`.
- A human may start editing early from `待补齐素材` only when voiceover/subtitle material and raw video exist, and the only missing source item is cover material.
- Marking distribution complete stores publication links and moves the item to `已完成`.

## 6. Workflow Status

- `to_approve`: the skill found enough evidence for the next action.
- `needs_review`: the item needs human direction before the next action.
- `blocked`: a human marked the item blocked.
- `done`: the skill completed an approved local handoff.

## 7. Risks

- `missing_voiceover`: no voiceover/script markdown or subtitle/transcript file was found.
- `missing_cover_source`: no PNG/JPG/JPEG cover source/material image or final cover output was found.
- `missing_cover`: final cover output is missing after channel export files exist.
- `missing_raw_video`: no raw video was found.

No rule performs remote mutation. Approved work creates local handoff files only.

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

1. `distribution_ready` + `to_approve`: exported channel video assets exist. In the app queue, items with final cover outputs go to `待确认分发`; exported items without final cover outputs go to `待制作封面`.
2. `distribution_ready` + `needs_review`: exported channel assets exist but one or more required checks are missing. The next human task is to confirm or fix the missing required items.
3. `ready_for_edit`: raw video, voiceover/script markdown, and cover source/material all exist. A final cover in `Covers` also satisfies the cover source/material check. The next human task is to approve post-production handoff.
3. `assets_ready`: raw footage exists, but script/transcript material is missing. The next human task is to clarify the editing direction.
4. `script_ready`: script/transcript material exists, but raw footage is missing. The next human task is to confirm whether footage is needed or still pending.
5. `idea`: no source material was found. The next human task is to add assets or clarify the topic.

## 4. Human Workflow Queues

The app displays a production workflow on top of the deterministic file-stage rules:

1. `选题表`: topic folders or ideas that have not yet been accepted into recording.
2. `待分配录制`: accepted topics waiting for an owner, recorder, or delivery date.
3. `待补齐素材`: assigned recording items where voiceover/subtitle material, cover source/material, or raw video is still missing.
4. `待检查素材`: all three required items are present and need human quality review.
5. `待剪辑输出`: the item is ready to be handed to post-production.
6. `剪辑中`: editing has started, but channel export video files have not appeared yet.
7. `待制作封面`: channel export video files exist, but final cover outputs are still missing from `Covers`/`封面`.
8. `待确认分发`: channel export video files and final cover outputs exist, and distribution needs confirmation.

The first two queues are advanced by local UI decisions only. They do not mutate Google Drive.

## 5. Workflow Status

- `to_approve`: the skill found enough evidence for the next action.
- `needs_review`: the item needs human direction before the next action.
- `blocked`: a human marked the item blocked.
- `done`: the skill completed an approved local handoff.

## 6. Risks

- `missing_voiceover`: no voiceover/script markdown or subtitle/transcript file was found.
- `missing_cover_source`: no PNG/JPG/JPEG cover source/material image or final cover output was found.
- `missing_cover`: final cover output is missing after channel export files exist.
- `missing_raw_video`: no raw video was found.

No rule performs remote mutation. Approved work creates local handoff files only.

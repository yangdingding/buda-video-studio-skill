# Buda Video Studio Rules

The skill should classify projects with deterministic, explainable rules. The local app may display and edit decisions, but it must not call Google Drive directly or publish anything.

## 1. AI Video Package Checks

Before human screen recording, each project must be checked for three AI video package items:

1. Script/storyboard material: any `.md`, `.txt`, `.srt`, or `.vtt` script/transcript file inside the project folder. Topic-table scripts are expected to include storyboard, screen direction, and spoken lines when available.
2. AI video: a HyperFrames or Remotion rendered preview video with picture, voice, and subtitles, usually under configured folders such as `Draft`, `Drafts`, `草稿视频`, `HyperFrames`, `Remotion`, or `Preview`.
3. Final cover: a `.png`, `.jpg`, or `.jpeg` image under `Covers` or `封面`.

These checks are shown in the UI as `剧本/脚本`, `AI 视频`, and `Cover 文件`. Missing checks are surfaced as human-readable risks, never as internal keys.

The final human screen recording is not part of the pre-recording AI package. It is checked after the AI video has been approved.

## 2. Asset Identification

Each direct child folder under the configured Google Drive root is treated as one video project.

- Script material: `.md` or `.txt` files anywhere inside the project.
- Transcript material: `.srt`, `.txt`, or `.vtt` files anywhere inside the project.
- AI video: video files under folders named `Draft`, `Drafts`, `草稿视频`, `草稿`, `HyperFrames`, `HyperFrame`, `Remotion`, `Preview`, or `预览`, or files whose name/path contains configured draft keywords such as `draft`, `草稿`, `hyperframes`, `remotion`, or `preview`.
- Screen recording: video files under folders named `Raw`, `原始视频`, `原视频`, `录屏`, or `Screen Recording`, excluding AI video and channel export files.
- Cover source/material: `.png`, `.jpg`, or `.jpeg` image files under folders named `成品样片`, `封面素材`, `Cover Source`, or `Cover Sources`.
- Final cover outputs: `.png`, `.jpg`, or `.jpeg` image files under folders named `Covers` or `封面`.
- Channel exports: video files under folders named `Youtube`, `YouTube`, `Shorts`, `视频号`, `Twitter`, or `X`.

These names are configurable in `video_library`.

## 3. Stage Priority

Rules are evaluated from highest to lowest priority:

1. `distribution_ready` + `to_approve`: the selected YouTube language exports, one `视频号` or selected social export, and final cover output exist. By default the app expects both YouTube Chinese and English, but a single-language project can uncheck the unused YouTube language in `输出渠道`; then one YouTube export can be enough. Shorts is optional: show it when present, but do not block distribution confirmation when absent. The next human task is `待确认分发`.
2. `distribution_ready` + `needs_review`: the selected channel exports exist, but final cover output is missing. The next human task is `待制作封面`.
3. `editing`: post-production has been manually started, but the required channel outputs are not complete yet. The app keeps manually started work in the `editing` queue until channel export evidence appears.
4. `ready_for_edit`: the approved AI video package and human screen recording both exist. The next human task is to confirm entry into post-production.
5. `render_ready`: the AI video package exists: script/storyboard, AI video, and final cover. The next human task is AI video review.
6. `script_ready`: script/storyboard material or partial AI video evidence exists, but the complete AI video package is missing.
7. `assets_ready`: a human screen recording exists, but the AI video package is still incomplete.
8. `idea`: no source material was found. The next human task is to confirm the topic/script direction.

## 4. Human Workflow Queues

The app displays a production workflow on top of the deterministic file-stage rules:

1. `选题表`: topic folders or ideas whose topic/script direction has not yet been accepted.
2. `AI 视频制作中`: accepted topics waiting for HyperFrames or Remotion to render and export the AI video package.
3. `待确认 AI 视频`: the AI video package is present; review picture, voice, subtitles, and cover before recording.
4. `待录制`: the AI video has been approved; wait for the final human screen recording.
5. `待进入后期`: the screen recording exists; confirm it can enter post-production.
6. `后期剪辑中`: post-production has started, but required channel export video files are not complete yet.
7. `待制作封面`: channel export video files exist, but final cover outputs are still missing from `Covers`/`封面`.
8. `待确认分发`: the selected channel exports and final cover outputs exist, and distribution needs confirmation.

The first queues are advanced by local UI decisions only. They do not mutate Google Drive.

## 5. Automatic vs Manual Progress

Automatic progress comes from Drive evidence:

- `AI 视频制作中` moves forward when script/storyboard, AI video, and final cover appear in Drive.
- `待确认 AI 视频` appears when the AI video package is complete.
- `待录制` appears only after a human approves the AI video package.
- `待进入后期` appears when an approved AI video package and human screen recording are both present.
- `后期剪辑中` appears when post-production has been manually started.
- `待制作封面` appears when channel export evidence exists but no final cover exists in `Covers`.
- `待确认分发` appears after the selected channel exports and final cover exist.

Manual progress comes from the local UI and is stored in `buda-video-status.json` when Drive write access is available:

- Accepting a topic moves it from `选题表` to `AI 视频制作中`.
- Confirming the AI video moves it to `待录制`.
- Saving owner, delivery time, and recording status makes the assignment visible in all lists.
- Changing `输出渠道` changes what the app expects for distribution. For example, a Chinese-only project should keep `YouTube 中文` and `视频号`, and uncheck `YouTube English`.
- Recording is the last human production step. Do not move an item into recording just because it has been assigned; wait until the AI video package has been approved.
- Post-production is intentionally light: put the human screen recording over the AI video and export the selected platform versions.
- Marking distribution complete stores publication links and moves the item to `已完成`.

## 6. Workflow Status

- `to_approve`: the skill found enough evidence for the next action.
- `needs_review`: the item needs human direction before the next action.
- `blocked`: a human marked the item blocked.
- `done`: the skill completed an approved local handoff.

## 7. Risks

- `missing_voiceover`: no script/storyboard markdown or subtitle/transcript file was found.
- `missing_draft_video`: no HyperFrames or Remotion AI video was found.
- `missing_cover_source`: no PNG/JPG/JPEG cover source/material image or final cover output was found.
- `missing_cover`: final cover output is missing after channel export files exist or before AI video approval.
- `missing_raw_video`: no human screen recording was found after AI video approval.

No rule performs remote mutation. Approved work creates local handoff files only.

# Video Batch Schema

`app/.cache/current_batch.json` contains a single generated batch.

Required top-level fields:

- `batch_id`
- `generated_at`
- `source`
- `mode`
- `metrics`
- `config_summary`
- `items`

Each item represents one video project or candidate.

Required item fields:

- `id`
- `ref`
- `title`
- `summary`
- `body`
- `category`
- `risk`
- `status`
- `stage`
- `proposed_action`
- `reason`
- `source_assets`
- `script_documents`
- `topic_direction`
- `target_audience`
- `edit_brief`
- `cover_copy`
- `outputs`
- `decision`
- `execution`

The local app may store user edits and approvals in `app/.cache/decisions.json`.

`script_documents` stores readable source script files discovered for a video project. Each entry preserves the original Markdown/text (`raw_text`), file metadata, parsed Markdown/pipe tables, and sections so the app and handoff scripts can display 分镜、画面、台词/口播稿 without losing the source wording.

Decision fields used by production handoffs:

- `production_engine`: `hyperframes` or `remotion`.
- `brand_profile`: `project` for a product-owned visual system or `buda` for the existing Buda cover system.
- `workflow_step`: `ai_video_production_requested` creates an AI-video handoff; `delivery_requested` creates a post-production delivery handoff.

Execution handoffs are local, reviewable Markdown files:

- `app/.cache/production/<video>.md`: script, source evidence, selected engine, required AI package, and `buda-video-delivery covers` instructions.
- `app/.cache/delivery/<video>.md`: post-production inputs, channel contract, Shorts policy, and `buda-video-delivery publish` instructions.

`source_assets` may include `production_project` items for HyperFrames/Remotion source files and `production_manifest` items for manifest JSON. These assets can include a `preview_url` when a separate R2 or static preview exists; Google Drive remains the default source of truth. Items may also include a parsed `production_manifest` object with `repo`, `pr`, `commit`, `engine`, `project_path`, `preview_url`, and `exports`. If the cover was generated before real screenshots existed, the manifest or handoff should record script-derived provenance such as `screenshot_source: storyboard_only` or `visual_evidence: script_derived`.

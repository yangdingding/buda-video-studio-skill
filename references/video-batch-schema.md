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
- `topic_direction`
- `target_audience`
- `edit_brief`
- `cover_copy`
- `outputs`
- `decision`
- `execution`

The local app may store user edits and approvals in `app/.cache/decisions.json`.

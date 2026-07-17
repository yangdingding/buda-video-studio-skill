# Topic Data Contract

The Buda Video Studio topic board is a separate entity view. It never derives its
membership from Google Drive files or a Drive project stage.

## Source Of Truth

1. `import-thread-kit --apply` reads exactly eight Markdown files from the Busabase
   Thread Kit and writes the canonical `topics.csv`.
2. The previous CSV is archived as `topics.legacy-<timestamp>.csv`; it is not read
   by the live app.
3. The regular batch generator reads only the canonical CSV. Repository scanning is
   opt-in for the explicit importer and cannot add runtime topics.
4. `topic_data_source` records are the only records displayed in `选题表`. Google
   Drive projects remain in their production queues even when they have a script.

## Bilingual Fields

Each canonical row preserves source text and optional translation separately:

| Field | Purpose |
| --- | --- |
| `title_en`, `summary_en`, `script_en` | English source, never overwritten by translation |
| `title_zh`, `summary_zh`, `script_zh` | Reviewed Chinese translation |
| `translation_status` | `source_only`, `draft`, or `complete` |
| `source_ref` | Repository ref used when the content was imported |

The app defaults to Chinese. If a reviewed Chinese script is missing it visibly
falls back to the English source; it must not present a machine-generated or
invented translation as reviewed. Post 8 remains blocked and has no storyboard
until its source is decided.

## Import Acceptance Checks

- The importer refuses to replace the canonical table unless it finds exactly 8
  Thread Kit rows.
- The resulting batch must keep exactly 8 `topic_data_source` records.
- A topic with the same title as a Google Drive project is still kept as a distinct
  topic record.
- Post 1 retains its complete source Markdown and parsed storyboard table.

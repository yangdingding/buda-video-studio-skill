# Buda Video Studio

Local App-in-Skill cockpit for Buda video production.

It scans a configured online Google Drive folder through the Drive API, prepares a video review batch, launches a local browser UI, and records human decisions for post-production handoff, cover copy, output specs, and distribution channels.

The app does not publish, upload, delete, move, or call external systems. It writes local handoff files only. The skill executes approved work after re-reading decisions.

## Quick Start

1. Copy `config.example.yml` to `config.local.yml` or `~/.config/buda-video-studio/config.yml`.
2. Set `google_drive.root_folder_id` to the online Google Drive folder id for `Buda Videos`.
3. Configure OAuth with either `google_drive.token_path` or `google_drive.access_token_env`.
4. Run:

```bash
node scripts/auth_google_drive.mjs
node scripts/generate_batch.mjs
app/start.sh
```

4. Open the printed local URL.

## Primary Source

The primary reader is `google_drive_api`. The local app is only a UI shell; source data comes from online Google Drive.

`local_drive` remains an explicit development fallback, not the team-facing default.

## What This Skill Does

- Scans a Google Drive-backed video library.
- Detects topic ideas, raw videos, voiceover/script files, covers, subtitles, and channel exports.
- Opens a local review UI for production status, cover copy, output channels, review notes, and approvals.
- Stores decisions in local handoff JSON files.
- Generates local post-production briefs and distribution checklists after approval.

It is intentionally local-first. It does not publish videos, upload to social platforms, delete files, or mutate Google Drive.

## Install From A Git Repo

Once this directory is pushed to a GitHub repository, install it into Codex with the normal skill install flow for a repo path such as:

```text
skills/buda-video-studio
```

After installation, each operator still needs their own private Google Drive config and OAuth token. Do not commit credentials.

## Google Drive OAuth

The skill needs Drive read access because it reads file names, file metadata, markdown/script text, and cover image bytes for OCR.

Required scope:

```text
https://www.googleapis.com/auth/drive.readonly
```

Metadata-only scope is not enough:

```text
https://www.googleapis.com/auth/drive.metadata.readonly
```

If the app can list files but cannot read cover text or markdown contents, re-run:

```bash
node scripts/auth_google_drive.mjs
node scripts/generate_batch.mjs
```

## Private Files To Keep Out Of Git

Never commit:

- `config.local.yml`
- `*.local.yml`
- `.env`
- `.env.local`
- `app/.cache/`
- Google OAuth client JSON files
- Google OAuth token JSON files

Recommended private config location:

```text
~/.config/buda-video-studio/config.yml
~/.config/buda-video-studio/google-oauth-client.json
~/.config/buda-video-studio/google-oauth-token.json
```

## Optional OCR Support

Cover text extraction uses macOS Vision through:

```text
scripts/ocr_image.swift
```

This works best on macOS. If unavailable, the Google Drive scan still works; cover title/subtitle may fall back to the project folder name or script text. `tesseract` can be installed as an additional fallback, but it is not required for publishing the skill.

## Release Checklist

Before publishing:

```bash
node --check app/app.js
node --check app/server/index.mjs
node --check lib/google-drive-shared.mjs
node --check lib/data-reader/google-drive-api-reader.mjs
node scripts/validate_ui_schema.mjs
```

Then confirm the release directory does not contain private files:

```bash
find . -maxdepth 4 \( -path "*/app/.cache/*" -o -name "config.local.yml" -o -name "*.local.yml" -o -name ".env" -o -name ".env.local" -o -iname "*token*" -o -iname "*secret*" \) -print
```

The command should print nothing for a clean public release tree.

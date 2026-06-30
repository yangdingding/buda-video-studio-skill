---
title: 2026-06-30 Asset Download
---

# Asset Download

Date: 2026-06-30
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Add a download button next to preview/open for completed video assets, and rename the open action to a clearer short label.

**Refined Instructions:**
- Keep the existing preview and cloud-open behavior.
- Add a browser download action backed by the local app and current Google Drive OAuth token.
- Rename `打开` to `云端打开`.

## What Changed

- Added `/api/download/:fileId` to stream Google Drive files as browser attachments.
- Added a `下载` action next to each Drive-backed asset.
- Renamed the cloud open action to `云端打开`.
- Bumped app asset cache keys.

## Why

Operators need to quickly preview, open in the cloud, or download delivered files from the completed/detail views without leaving the workflow.

## Files Affected

- `app/app.js` - Added asset download links and renamed the open action.
- `app/server/downloads.mjs` - Added Google Drive download streaming.
- `app/server/routes.mjs` - Registered the download API route.
- `app/index.html` - Bumped asset versions.

## Breaking Changes

None.

## Testing

- `node --check app/app.js`
- `node --check app/server/routes.mjs`
- `node --check app/server/downloads.mjs`
- `node scripts/check_workflow_rules.mjs`
- Verified `/api/download/:fileId` returns an attachment response for a Drive MP4.

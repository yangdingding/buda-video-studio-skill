---
title: 2026-06-30 Dashboard Stable Masonry
---

# Dashboard Stable Masonry

Date: 2026-06-30
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> The masonry dashboard still flashes every few seconds. Find the cause.

**Refined Instructions:**
- Stop automatic polling from repainting the dashboard when state content has not changed.
- Remove masonry transform animation so layout refreshes do not visibly flash.

## What Changed

- Added a stable state snapshot check before rendering after `/api/state` polling.
- Removed dashboard section transform transitions.
- Bumped app asset cache keys for the stable masonry update.

## Why

The app polls state every few seconds. Re-rendering an unchanged dashboard rebuilt the DOM and reran masonry, creating a visible flash.

## Files Affected

- `app/app.js` - Skips render when polled state is unchanged.
- `app/styles.css` - Removes masonry transform transition.
- `app/index.html` - Bumps asset versions.

## Breaking Changes

None.

## Testing

- `node --check app/app.js`
- `node scripts/check_workflow_rules.mjs`
- Compared two `/api/state` responses 4.5 seconds apart; they were identical.

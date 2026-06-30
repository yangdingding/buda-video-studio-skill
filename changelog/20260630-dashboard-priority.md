---
title: 2026-06-30 Dashboard Priority
---

# Dashboard Priority

Date: 2026-06-30
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Dashboard card titles should be easier to distinguish from video titles. Reorder the dashboard by what the team cares about most, with distribution confirmation first, and rename "本周要发" to "本期计划要发".

**Refined Instructions:**
- Add visual markers to dashboard section titles.
- Prioritize sections by operational attention.
- Keep the planned publish count scoped to the current production batch rather than the current week.

## What Changed

- Added emoji markers to dashboard section titles.
- Reordered the dashboard to start with `待确认分发`, followed by `本期计划要发`, `正在剪辑`, and published-location tracking.
- Renamed the dashboard KPI and section from `本周要发` to `本期计划要发`.
- Bumped app asset cache keys for the dashboard update.

## Why

The dashboard should behave like a production command center: the video team first sees items needing distribution confirmation, what is planned to publish this cycle, what is actively being edited, and where completed videos were published.

## Files Affected

- `app/app.js` - Updated dashboard ordering, titles, emoji labels, and planned publish logic.
- `app/styles.css` - Added dashboard title emoji styling.
- `app/index.html` - Bumped asset versions.

## Breaking Changes

None.

## Testing

- `node --check app/app.js`
- `node scripts/check_workflow_rules.mjs`

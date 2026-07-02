---
title: 2026-07-02 Sidebar Collapse
---

# Sidebar Collapse

Date: 2026-07-02
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Check recent updates in app-in-skill-creator and add anything useful to this skill. Also make the left sidebar support collapse and expand.

**Refined Instructions:**
- Keep current Google Drive config, local cache, and YAML compatibility intact.
- Add only the relevant App-in-Skill maintenance guidance.
- Add a persistent sidebar collapse/expand control to the local dashboard app.

## What Changed
- Added a sidebar toggle button with persisted collapsed state.
- Replaced the text chevron toggle with an inline semantic sidebar icon.
- Changed the mobile workflow filter layout to wrap chips instead of using horizontal scroll.
- Kept mobile/narrow layouts independent from the persisted desktop collapsed sidebar state.
- Added a mobile sidebar drawer with its own topbar trigger, backdrop, filter close behavior, and Escape close behavior.
- Moved the mobile drawer trigger to the left of the topbar title so it matches the left-side drawer.
- Added compact collapsed sidebar styling for desktop layouts.
- Updated asset cache keys so the browser loads the new app code.
- Added a local app maintenance note to `SKILL.md`.

## Why
- The dashboard needs more usable horizontal space while preserving quick navigation.
- Recent App-in-Skill guidance emphasizes stable, recoverable local app state.

## Files Affected
- `app/index.html` - Added sidebar toggle and bumped asset versions.
- `app/app.js` - Added sidebar state, rendering, and toggle handler.
- `app/styles.css` - Added collapsed sidebar layout.
- `SKILL.md` - Documented local app state preservation guidance.

## Breaking Changes
- None.

## Testing
- Run `node --check app/app.js`.
- Open `http://127.0.0.1:3000/#/dashboard` and toggle the sidebar.

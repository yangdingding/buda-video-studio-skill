---
title: 2026-07-13 Buda Video Production Handoffs
---

# Buda Video Production Handoffs

Date: 2026-07-13
Author: AI Assistant

## What Changed

- Added explicit AI-production and post-production delivery tasks to the Buda Video Studio workflow.
- Captured the render engine and cover brand profile in the decision state.
- Generated reviewable local handoffs that delegate covers and delivery to `buda-video-delivery`.
- Ordered AI review before recording and removed the legacy separate cover-production queue.
- Made `AI 视频制作中` explicit-only so legacy Drive folders with old scripts or recordings are not pulled into AI production automatically.
- Clarified the production gates: covers are created during AI video production, while post-production delivery owns SRT extraction, hard subtitles, Shorts cover insertion, and final platform packaging.
- Kept rendering, Drive export, and social publication as evidence-based controlled steps.

## Testing

- Node syntax checks, workflow-rule checks including legacy Drive classification, and production-handoff contract tests.

## Privacy

- No personal local paths or credentials are stored in the skill files.

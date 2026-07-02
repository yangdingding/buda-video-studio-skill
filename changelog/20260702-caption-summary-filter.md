---
title: 2026-07-02 Caption Summary Filter
---

# Caption Summary Filter

Date: 2026-07-02
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> The video subtitle still shows `Language: zh-cn`; it should read the voiceover script as the subtitle/description.

**Refined Instructions:**
- Fix the batch generation source so subtitle-review metadata is not used as a video summary.
- Keep real caption or voiceover text as the first visible summary line.
- Add a small regression test for the `Language: zh-cn` case.

## What Changed
- Filtered caption-review metadata lines such as `Language: zh-cn`, source/file/encoding, and similar short metadata.
- Filtered SRT review report fields and headings so token samples can be used instead of report metadata.
- Added the same front-end guard so old batches do not display SRT review metadata while waiting for regeneration.
- Prioritized Raw/non-review voiceover text over `.srt.review.md` reports when choosing the video summary source.
- Reused the same filtering when deriving cover copy from voiceover or caption snippets.
- Added a caption summary regression test.

## Why
- The dashboard list should show human-readable voiceover/script content, not caption processing metadata.

## Files Affected
- `lib/google-drive-shared.mjs` - Improved technical caption metadata filtering.
- `app/app.js` - Hid SRT review metadata summaries in the UI as a defensive fallback.
- `app/index.html` - Bumped asset versions for the front-end fallback.
- `scripts/test_caption_summary.mjs` - Added regression coverage for SRT review metadata.

## Breaking Changes
- None.

## Testing
- Run `node scripts/test_caption_summary.mjs`.
- Run `node scripts/generate_batch.mjs` and confirm affected video summaries no longer show `Language: zh-cn`.

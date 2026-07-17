---
title: 2026-07-17 Topic Source, Bilingual, and UI Contract
---

# Topic Source, Bilingual, and UI Contract

Date: 2026-07-17
Author: AI Assistant

## Prompts & Instructions

**Original Request:**
> Review the Buda Video Studio workflow and improve the skill so topic counts,
> bilingual content, script previews, and refresh behavior remain reliable.

**Refined Instructions:**
- Keep Thread Kit as the source for exactly eight canonical topics.
- Keep Google Drive production projects out of the topic board.
- Persist English source and Chinese translation separately.
- Make the workbench default to Chinese with an explicit English fallback.

## What Changed

- Added a canonical topic entity rule and an eight-row Thread Kit import guard.
- Added bilingual topic/script fields and translation status to the CSV contract.
- Added persistent Chinese/English controls for the list, detail title, and script modal.
- Added contract validation and a focused Thread Kit regression test.

## Why

Previous Web Buda hotfixes could mix Drive projects into the topic count or change
the page without preserving a durable source contract.

## Testing

- `node scripts/test_topic_contract.mjs`
- `node scripts/check_workflow_rules.mjs`
- `node scripts/validate_ui_schema.mjs`

---
title: 2026-07-17 Import Thread Kit Topics
---

# Import Thread Kit Topics

Date: 2026-07-17
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Extract the topic source into the existing topic table and archive the prior table content.

## What Changed

- Added `import-thread-kit --apply` to replace the active topic CSV with the eight Busabase Thread Kit topics.
- The import preserves the old CSV as a timestamped legacy file and writes complete scripts into the new CSV.
- Runtime topic loading now reads the normalized CSV by default instead of scanning repository Markdown.

## Why

- Repository-wide scanning created unrelated Topic rows and inflated the production board.
- The topic table is the single active source after the explicit migration.

## Testing

- Imported the Thread Kit into a temporary CSV and verified eight rows, script persistence, and legacy backup creation.

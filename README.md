# Pocket Dictations

Sync your [Pocket AI](https://heypocketai.com) dictations directly into your vault as notes, complete with transcript, AI summary, and action items.

## Features

- 🎙️ Imports all your Pocket AI recordings as individual notes
- 📝 Includes transcript, AI-generated summary, and action items
- 🏷️ Preserves tags from Pocket (including auto-tagging daily highlight recordings)
- 🔄 Auto-syncs on a configurable interval
- ✅ Skips already-imported notes; re-imports if notes are deleted

## Setup

1. Install the plugin from the community plugin browser.
2. Go to **Settings → Pocket Dictations**.
3. Paste your Pocket API key (starts with `pk_`). Find it in the Pocket app under **Settings → Integrations**.
4. Set an import folder (default: `Pocket Dictations`).
5. Click **Sync Now** or wait for auto-sync.

## Note Format

Each imported recording creates a note like:

```
---
id: <recording-id>
date: 2026-04-05
source: pocket
state: completed
tags: ["ideas"]
---

# Recording Title

> Synced from Pocket on 4/5/2026

## Summary

AI-generated summary...

## Action Items

- Action item one

## Transcript

Full transcript text...
```

## License

MIT

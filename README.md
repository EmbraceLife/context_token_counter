# SolveIt Context Token Counter — Chrome Extension

A Chrome extension that shows token usage bars, CRAFT token breakdown, and anchor-based filtering for SolveIt dialogs.

## Features

- **Token Bar** — Progress bar showing dialog token usage against 200K budget (green/yellow/red)
- **CRAFT Bar** — Segmented color bar showing each CRAFT dialog's token contribution
- **Anchor Toggle** — Pin a message to only count tokens above it (matching what AI actually sees)
- **Auto-refresh** — Token counts update automatically after cell execution, AI responses, etc.
- **Persistence** — Anchor selection survives page refresh (stored in localStorage)

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this `context_token_counter/` folder
5. The extension will activate on SolveIt pages automatically

## URL Matching

The extension runs on:
- `https://*.solve.it.com/*`

To add more URLs (e.g. localhost for development), edit `manifest.json` → `content_scripts[0].matches` and `web_accessible_resources[0].matches`.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config — Manifest V3, what to inject and where |
| `content.js` | Loader — injects all modules into MAIN world in order |
| `content.css` | All styles for token bar, CRAFT bar, and anchor toggle |
| `token-bar.js` | Main dialog token counter with debounced refresh |
| `craft-discover.js` | Module 1: Walk folder tree to find CRAFT dialogs |
| `craft-count.js` | Module 2: Count tokens per CRAFT dialog |
| `craft-bar.js` | Module 3: Render segmented CRAFT token bar |
| `anchor-toggle.js` | Module 4: Anchor message selection for filtered counting |

## Module Dependency Chain

```
content.js (loader)
  └→ token-bar.js        ← Base bar, must load first
  └→ craft-discover.js   ← Exports window.discoverCrafts
  └→ craft-count.js      ← Calls discoverCrafts → stores window._craftTokens
  └→ craft-bar.js        ← Reads _craftTokens → renders segmented bar
  └→ anchor-toggle.js    ← Exports window._anchorMsgId, read by token-bar
```

## How It Works

1. **Token Bar** fetches all dialog messages via `/find_msgs_` and sums `input_tokens + output_tokens` for non-skipped messages
2. **CRAFT Discovery** walks up the folder tree from the current dialog, checking each level for a CRAFT dialog
3. **CRAFT Count** fetches each discovered CRAFT and counts its tokens
4. **CRAFT Bar** renders a proportional segmented bar (same scale as token bar: 80ch = 200K)
5. **Anchor Toggle** lets you mark a message — only tokens above it are counted

## Color Coding

**Token Bar:**
- 🟢 Green: < 50% of 200K budget
- 🟡 Yellow: 50-80%
- 🔴 Red: > 80%

**CRAFT Bar segments:**
- 🔵 Blue: root CRAFT
- 🟣 Purple: level 2
- 🩵 Teal: level 3
- 🟠 Orange: level 4

## Compatibility

- Chrome (Manifest V3)
- Edge (Chromium-based, same manifest)
- Designed for SolveIt's HTMX-based UI with self-healing MutationObservers

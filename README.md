# Squiggle ➰

A tiny, friendly, Grammarly‑style checker you can run yourself. Bring your own Google AI key, keep your text yours, and get fast, minimal suggestions for prose and Markdown.

Squiggle mixes deterministic local rules with optional AI (Gemini) to propose small, safe fixes. It deliberately avoids code blocks, tables, raw HTML, and link targets.

## Features

- Minimal UI: editor + suggestions with apply/undo/"apply all".
- Local rules: spacing, punctuation, common misspellings, duplicates, capitalization.
- AI suggestions (optional): sentence-aware, prose-only, with conservative filtering.
- Markdown-aware: protects fenced/inline code, HTML, tables, and URLs.
- Scoped re-analysis after edits for snappy feedback.

## Why

- I didn’t want another subscription just for grammar nits.
- Using my own API key is cheaper and gives me control.
- Minimal UI, minimal edits — keep your voice, fix the bumps.

## Quick Start

Requirements: Node 18+ and pnpm (recommended).

```sh
pnpm install
pnpm dev
```

Open the app, paste a Google AI Studio API key, and start typing. The key is used only for the current request and isn’t stored server‑side. By default it stays in memory; you can optionally “Remember on this device” to save it in your browser.

## Configuration

Environment variables (all optional):

- `SQUIGGLE_MODEL` (default: `gemini-2.0-flash`)
- `SQUIGGLE_SINGLESHOT_MAX` (default: `4500`) – length threshold before chunking
- `SQUIGGLE_MAX_TEXT` (default: `100000`) – hard cap on request text length
- `SQUIGGLE_MAX_CONCURRENCY` (default: `4`) – parallel LLM chunk calls
- `SQUIGGLE_ENABLE_STYLE` (default: on; set `0` to disable style edits)
- `SQUIGGLE_ENABLE_OTHER` (default: on; set `0` to disable category "other")
- `SQUIGGLE_STYLE_QUOTA` (default: `9999`) – emergency cap for style suggestions
- `SQUIGGLE_DEV_LOG` (`1` to enable structured server logs in dev)
- `SQUIGGLE_CACHE_MAX` (default: `200`) – in-memory cache entries

The repo contains Drizzle + Postgres scaffolding, but the core grammar feature does not require a database.

## How It Works

- The client calls a SvelteKit endpoint with your text (and optional scope) and API key.
- The server runs Markdown analysis to target prose and forbid non-prose regions.
- Local rules run first; AI suggestions are added, reconciled, and deduplicated.
- Results are sorted by severity and confidence and presented in the UI.

## What It Fixes

- Spacing and punctuation basics (double spaces, missing spaces, repeated punctuation)
- Common misspellings and duplicated words
- Sentence starts and light case fixes
- Optional style nips and tucks — only when they’re truly minimal and helpful

## Contributing / Maintenance

Maintainer bandwidth is currently limited. If you’re interested in improving Squiggle:

- Please fork, modify, and open a PR.
- Keep PRs small, focused, and well-described.
- If you build something bigger, feel free to maintain a fork and share it back.

I can’t actively maintain every feature, but I’d love to see future improvements and will review PRs as time allows.

## License

MIT. Use the code however you like. This project is unaffiliated with Grammarly.

## Deploying

This is a SvelteKit app with Vercel adapter included. For other targets, install the appropriate adapter. CSP is configured via `kit.csp` in `svelte.config.js`; additional security headers (XFO, XCTO, etc.) are set in `src/hooks.server.ts`.

```sh
pnpm build
pnpm preview
```

## Notes

- Your Google API key is used only to call Gemini on your behalf for the current request and is not persisted by the server.
- Style edits are intentionally conservative and may be disabled entirely via env.

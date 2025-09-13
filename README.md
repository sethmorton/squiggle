# Squiggle ➰

Tiny, friendly grammar help you run yourself. Use your own Google AI key, keep your words yours, get small, high‑signal fixes for prose and Markdown.

Live demo: squiggle.sethmorton.com

## Features

- Minimal UI: editor + suggestions with apply/undo/"apply all".
- Local rules: spacing, punctuation, common misspellings, duplicates, capitalization.
- AI suggestions (optional): sentence-aware, prose-only, with conservative filtering.
- Markdown-aware: protects fenced/inline code, HTML, tables, and URLs.
- Scoped re-analysis after edits for snappy feedback.

## Why

- No subscription, just your key
- Minimal UI, minimal edits, keep your voice

## Quick Start

Requirements: Node 18+ and pnpm (recommended).

```sh
pnpm install
pnpm dev
```

Open the app, paste a Google AI Studio API key, start typing. The key is used only for the current request, not stored on the server. By default it stays in memory, you can choose "Remember on this device" to save it in your browser.

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

- Client hits a SvelteKit API with your text and key
- Server finds prose parts, skips code and links
- Local rules first, then optional AI
- Results are deduped and sorted by confidence

## What It Fixes

- Spacing and punctuation basics (double spaces, missing spaces, repeats)
- Common misspellings and duplicated words
- Sentence starts and light case fixes
- Optional style hints, only when clearly helpful

## Contributing

Maintainer bandwidth is currently limited. If you’re interested in improving Squiggle:

- Please fork, modify, and open a PR.
- Keep PRs small, focused, and well-described.
- If you build something bigger, feel free to maintain a fork and share it back.

I can’t actively maintain every feature, but I’d love to see future improvements and will review PRs as time allows.

## License

MIT. Use the code however you like. This project is unaffiliated with Grammarly.

## Deploying

SvelteKit app with Vercel adapter. CSP is in `svelte.config.js` (`kit.csp`). Other headers live in `src/hooks.server.ts`.

### Vercel Analytics (optional)

- Enable Web Analytics and Speed Insights for the project in Vercel → Project → Settings → Analytics.
- Code is already wired: in production, Squiggle injects `@vercel/analytics` and `@vercel/speed-insights` from `src/routes/+layout.svelte`.
- No config needed for dev; data is collected only in production.

```sh
pnpm build
pnpm preview
```

## Notes

- Your Google API key is used only for the current request, never stored on the server
- Style edits are conservative, you can disable them with env

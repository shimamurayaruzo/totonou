<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project commands

- `npm run dev`: start the local app
- `npm run lint`: run ESLint
- `npm run typecheck`: run the TypeScript compiler
- `npm test`: run Vitest once
- `npm run build`: create the production build
- `npm run check`: run the full verification suite

## Logging

- Record application logs only through `src/lib/logger.ts`; do not call `console` from application code.
- Follow the operation and context conventions in `docs/Totonou-ログ実装ガイド.md`.
- Add start, success, and failure events for new external or multi-step operations.
- Keep personal data, message bodies, names, addresses, tokens, and API keys out of logs.
- Use `human_note` for human-facing context and `ai_todo` for a concrete follow-up request.
- Trace local failures from `logs/totonou/` by `correlation_id`.

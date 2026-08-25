<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Neraca — AI Accounting SaaS (Paper & Ink Matte)

## Stack
Next 16.3 (App Router, Turbopack) • React 19 • Tailwind 4 + shadcn/ui + lucide + motion 13 + next-themes • Drizzle 0.45 + pg 8 + pgvector 0.3 (fallback text) • Better Auth 1.7 • @google/genai 2.18 (`gemini-3.5-flash-lite`, `store:false`) • @aws-sdk/client-s3 (SeaweedFS S3) • Vitest 4 + Playwright 1.62

## Commands
```bash
npm run dev          # http://localhost:3000 (needs DB + SeaweedFS)
npm run build        # must stay green
npx tsc --noEmit     # strict, no any
npm run test         # vitest run — hits ledger_test only
npm run e2e          # playwright (AI_MOCK=1 via webServer env)
npm run test:db:setup # create ledger_test + drizzle migrate + rls/triggers/vector
npm run db:sql       # apply src/server/db/*.sql to dev ledger
npm run db:migrate   # drizzle-kit migrate (dev ledger)
npm run weed:dev     # cmd /c scripts\weed-dev.cmd — S3 gateway :8333, bucket neraca-docs
```

## Env
Copy `.env.example` → `.env`. Key vars: `DATABASE_URL` (postgres:root@127.0.0.1:5432/ledger), `APP_DATABASE_URL` (app_user), `S3_*` (demo/demo), `GEMINI_API_KEY` (empty + `AI_MOCK=1` for dev), `GEMINI_MODEL=gemini-3.5-flash-lite`, `AI_MONTHLY_DRAFT_LIMIT=100`, `ADVISOR_MONTHLY_MESSAGES_LIMIT=200`. Never `2.5-*`/`2.0-*`/`1.5-*` models.

## DB & Infra
- **Native PG 18** at 127.0.0.1:5432, DBs `ledger` (dev) / `ledger_test` (tests). `tests/setup.ts` rewrites `DATABASE_URL`→`ledger_test` + guard in `tests/integration/helpers.ts` refuses non-test DB — tests never truncate dev.
- **SeaweedFS** data dir `D:\Lucky\weed_strorage\data` holds real collections (`bmn-attachments`, `evaluasi-mr`) — never `TRUNCATE`/`rm -rf` it. Raise `-volume.max` if S3 `No writable volumes`.
- **Vector fallback:** `src/server/db/vector.sql` creates `vector` domain as `text` when extension missing; Drizzle column is `text` JSON array, JS cosine fallback. Real `vector(768)` only in Docker `pgvector/pgvector:pg16` image.
- **RLS:** `FORCE RLS` on every `org_id` table (`src/server/db/rls.sql` idempotent DO blocks). Runtime still superuser in dev — app-level `orgId` scoping is source of truth until `withOrg` wiring lands (see final review).

## Conventions
- **Money:** `numeric(18,2)` in DB, `Money` class BigInt minor via `Money.parseIdr`/`formatIdr` — never JS `number` for amounts.
- **Posting:** `validate → post → immutable` — `journal_entries.status` DRAFT→POSTED only, trigger `forbid_posted_mutation`, corrections via `reversal_of_id`, numbers `JE-YYYY-NNNN` per-year, `journal_seq_counters` per period + advisory lock.
- **AI:** `@google/genai` Interactions API, `response_format` JSON Schema + zod `DraftEntrySchema`, `store:false`, retry 2, file whitelists `image/*`+`application/pdf` ≤5MB.
- **UI:** Bahasa Indonesia copy, Paper & Ink tokens `src/app/globals.css` (`--color-canvas` etc.), `motion` primitives `src/components/motion`, `prefers-reduced-motion` respected. Sidebar `w-64 ↔ w-[4.25rem]` persisted `neraca:sidebar-collapsed`, topbar Cmd+K palette (`searchGlobalAction`).

## Testing Quirks
- `vitest.config.mts` sets `fileParallelism: false` (integration files share one Postgres and TRUNCATE). `setupFiles: ["tests/setup.ts"]` rewrites DB URL before any import.
- Storage tests skip when `SKIP_STORAGE_TESTS=1` or S3 unreachable (top-level await probe).
- Playwright webServer is `reuseExistingServer:true`; kill stale `:3000` before `npm run e2e` or tests hit cold compile.
- Shell: plain `bash` is WSL; use `C:\Program Files\Git\bin\bash.exe -c "..."` or PowerShell directly. Never `bash` heredoc for file writes — use `write` tool.

## Routes & Entrypoints
`(app)/dasbor` (KPI cards), `jurnal` (manual table + `?tab=draft`), `jurnal/ai` (chat + function `create_journal_draft`), `jurnal/ai/[id]` (review diff), `buku-besar`, `laporan/*`, `pengaturan` (COA archive, periods), `asisten` (RAG chat), `api/advisor`, `api/nara`. Auth: `better-auth` `src/server/auth/*`, org bootstrap `ensure-workspace.ts` with self-heal.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Neraca — AI Accounting SaaS (Paper & Ink Matte)

## Stack
Next 16.3 (App Router, Turbopack) • React 19 • Tailwind 4 + shadcn/ui + lucide + motion 13 + next-themes • Drizzle 0.45 + pg 8 + pgvector 0.3 (text fallback) • @neondatabase/auth (managed Better Auth) • @google/genai 2.18 (`gemini-3.5-flash-lite`, `store:false`) • @aws-sdk/client-s3 (SeaweedFS) • Vitest 4 + Playwright 1.62

## Commands
```bash
bun run dev          # http://localhost:3000 (needs Neon DB + SeaweedFS)
bun run build        # must stay green
bunx tsc --noEmit    # strict, no any
bun run test         # vitest run — rewrites DATABASE_URL→ledger_test, never touches dev
bun run e2e          # playwright, workers:1 (AI_MOCK=1 + E2E Neon branch via webServer env)
bun run test:db:setup # create ledger_test + drizzle migrate + *.sql (needs local PG up)
bun run db:sql       # apply src/server/db/*.sql sorted to DATABASE_URL (dev Neon)
bun run db:migrate   # drizzle-kit migrate (DATABASE_URL)
bun run weed:dev     # cmd /c scripts\weed-dev.cmd — S3 gateway :8333, bucket neraca-docs
```

## Env & DB branches
Copy `.env.example` → `.env`. Dev `DATABASE_URL`/`APP_DATABASE_URL` point at **Neon main branch**; E2E uses `E2E_DATABASE_URL` + `E2E_NEON_AUTH_BASE_URL` (isolated branch, email verification OFF); Vitest uses local `TEST_DATABASE_URL` (`postgres:root@127.0.0.1:5432/ledger_test`). Key vars: `S3_*` (demo/demo), `GEMINI_API_KEY` (empty + `AI_MOCK=1` = deterministic mock), `GEMINI_MODEL=gemini-3.5-flash-lite` (never `2.5-*`/`2.0-*`/`1.5-*`), `GEMINI_EMBED_MODEL=gemini-embedding-001`, `ASSISTANT_MONTHLY_LIMIT=200` (code falls back to legacy `ADVISOR_*`/`AI_MONTHLY_DRAFT_*` names), `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET` (per-branch, from Neon Console).

## DB & Infra
- **Neon dev, local test:** `tests/setup.ts` forces `DATABASE_URL`→`ledger_test` + `tests/integration/helpers.ts:guardTestDb` throws on non-test DB. `docker-compose.yml` (`db`, pg16+pgvector, host port 54329) is NOT the test DB — tests expect native/local PG on 5432.
- **SeaweedFS** data dir `D:\Lucky\weed_strorage\data` (note `weed_strorage` spelling in `scripts/weed-dev.cmd`) holds real collections — never `TRUNCATE`/`rm -rf` it. Raise `-volume.max` if S3 `No writable volumes`.
- **Vector fallback:** `src/server/db/vector.sql` creates `vector` domain as `text` when extension missing; Drizzle column is `text` JSON array, JS cosine fallback. Real `vector(768)` only with pgvector image.
- **RLS:** `FORCE RLS` on every `org_id` table (`src/server/db/rls.sql`, idempotent DO blocks; `apply-sql.mjs` applies `*.sql` sorted). Runtime connects as superuser in dev — app-level `orgId` scoping is source of truth. New tenant-scoped `db.transaction` calls must use `withOrg` (`src/server/db/repos/with-org.ts`) to set `app.current_org`, else RLS blocks under `app_user`.
- **Onboarding seeds COA:** `ensure-workspace.ts` only creates org + OWNER membership + profile mirror; COA + 12 fiscal periods are provisioned atomically in `src/server/onboarding/engine.ts` on onboarding complete.

## Conventions
- **Money:** `numeric(18,2)` in DB, `Money` class BigInt minor via `Money.parseIdr`/`formatIdr` (`src/core/money/money.ts`) — never JS `number` for amounts.
- **Posting:** `validate → post → immutable` — `journal_entries.status` DRAFT→POSTED only, trigger `forbid_posted_mutation` (`triggers.sql`), corrections via `reversal_of_id`, numbers `JE-YYYY-NNNN` year-scoped per org (`journals.repo.ts`: per-period `journal_seq_counters` + `pg_advisory_xact_lock`).
- **AI:** `@google/genai` Interactions API (`src/server/ai/adapter.ts`, `nara.ts`, `journal-chat.ts`), `store:false`, `response_format` JSON Schema + zod `DraftEntrySchema` (`schema.ts`), retry 2 (`MAX_RETRIES`). Uploads: `image/*`+`application/pdf` ≤5MB (`src/server/storage/config.ts:MAX_DOCUMENT_BYTES`).
- **Auth:** `@neondatabase/auth/next` client/server (`src/server/auth/*`); local `user` table is read-only identity mirror, sessions never live there.
- **UI:** Bahasa Indonesia copy, Paper & Ink tokens `src/app/globals.css` (canvas/paper/ink/terra + elevation), Aceternity set `src/components/aceternity` (token-skinned), motion primitives `src/components/motion`, `prefers-reduced-motion` respected. Sidebar persisted `neraca:sidebar-collapsed`, topbar Cmd+K palette (`searchGlobalAction`). Full-bleed fluid layout — no boxed max-width. **Motion MCP (`opencode.jsonc`): search motion docs before writing any animation, import from `motion`/`motion/react`, never `framer-motion`.**

## Testing Quirks
- `vitest.config.mts`: `fileParallelism:false` (integration files share one PG and TRUNCATE), `setupFiles:["tests/setup.ts"]` rewrites DB URL before any import. Run single file: `bunx vitest run tests/integration/ledger.test.ts`.
- Storage tests skip when `SKIP_STORAGE_TESTS=1` or S3 unreachable (top-level probe).
- Playwright: `workers:1`, `reuseExistingServer:true` — kill stale `:3000` before `bun run e2e`; `tests/e2e/global-setup.ts` warms `/daftar /masuk /verifikasi /onboarding /dasbor` to avoid Turbopack cold-compile hydration race.
- Shell: PowerShell native; `weed:dev` needs `cmd /c`; plain `bash` is WSL — prefer `C:\Program Files\Git\bin\bash.exe -c` or PowerShell. Never `bash` heredoc for file writes.

## Routes & Entrypoints
`(app)/dasbor`, `jurnal` (manual + `?tab=draft`), `jurnal/ai` (chat, fn `create_journal_draft`), `jurnal/ai/[id]` (review diff), `buku-besar`, `laporan/*`, `faktur`, `kontak`, `aset`, `rekonsiliasi`, `tutup-buku`, `temuan` (doctor), `pengaturan` (COA archive, periods), `asisten` (RAG chat), `/onboarding` (+ `/daftar /masuk /verifikasi`), `api/nara`, `api/advisor`. RAG: `src/server/db/repos/rag-search.ts` (vector 768 + `tsvector`).

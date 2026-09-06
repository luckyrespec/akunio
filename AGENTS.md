<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Akunio — AI Accounting SaaS (Paper & Ink Matte)

## Stack
Next 16.3 (App Router, Turbopack) • React 19 • Tailwind 4 + shadcn/ui + lucide + motion 13 + next-themes • Drizzle 0.45 + pg 8 + pgvector 0.3 (text fallback) • @neondatabase/auth (managed Better Auth) • @google/genai 2.21 (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`, `store:true` + `previous_interaction_id` per thread) • @aws-sdk/client-s3 (SeaweedFS) • Vitest 4 + Playwright 1.62

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
Copy `.env.example` → `.env`. Dev `DATABASE_URL`/`APP_DATABASE_URL` point at **Neon main branch**; E2E uses `E2E_DATABASE_URL` + `E2E_NEON_AUTH_BASE_URL` (isolated branch, email verification OFF); Vitest uses local `TEST_DATABASE_URL` (`postgres:root@127.0.0.1:5432/ledger_test`). Key vars: `S3_*` (demo/demo), `GEMINI_API_KEY` (empty + `AI_MOCK=1` = deterministic mock), `GEMINI_MODEL` (default `gemini-3.5-flash-lite`, never `2.5-*`/`2.0-*`/`1.5-*`), `GEMINI_EMBED_MODEL` (code default `gemini-embedding-2`, 768 dims), `ASSISTANT_MONTHLY_LIMIT=200` (code falls back to legacy `ADVISOR_MONTHLY_MESSAGES_LIMIT`/`AI_MONTHLY_DRAFT_LIMIT`), `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET` (per-branch, from Neon Console).

## DB & Infra
- **Neon dev, local test:** `tests/setup.ts` forces `DATABASE_URL`→`ledger_test` + `tests/integration/helpers.ts:guardTestDb` throws on non-test DB. `docker-compose.yml` (`db`, pg16+pgvector, host port 54329) is NOT the test DB — tests expect native/local PG on 5432. When adding tables, extend the TRUNCATE list in `helpers.ts` or every integration suite breaks.
- **SeaweedFS** data dir `D:\Lucky\weed_strorage\data` (note `weed_strorage` spelling in `scripts/weed-dev.cmd`) holds real collections — never `TRUNCATE`/`rm -rf` it. Raise `-volume.max` if S3 `No writable volumes`.
- **Vector fallback:** `src/server/db/vector.sql` creates `vector` domain as `text` when extension missing; Drizzle column is `text` JSON array, JS cosine fallback. Real `vector(768)` only with pgvector image.
- **RLS:** `FORCE RLS` on every `org_id` table (`src/server/db/rls.sql`, idempotent DO blocks; `apply-sql.mjs` applies `*.sql` sorted). App server pool (`src/server/db/index.ts`) uses `DATABASE_URL`; integration tests connect via `APP_DATABASE_URL` as `app_user` so RLS applies. New tenant-scoped `db.transaction` calls must use `withOrg` (`src/server/db/repos/with-org.ts`) to set `app.current_org`, else RLS blocks under `app_user`.
- **Migrations, two lanes:** Drizzle schema (`src/server/db/schema/*.ts` → `drizzle/NNNN_*.sql` + `meta/_journal.json`) for tables; raw `src/server/db/*.sql` (sorted) for CHECKs/policies/triggers. `drizzle-kit generate` crashes repo-wide (BigInt serialization) — hand-write the SQL (`IF NOT EXISTS`, `--> statement-breakpoint` separators, journal entry, no snapshot; precedent `0012_tax_summaries.sql`, `0013_kas_bank.sql`). `journal_entries.source` CHECK `je_source_chk` is owned by `tax.sql` (last alphabetical writer wins) — extend the list there, never in `hardening.sql`.
- **Windows bun gotchas:** `bun.exe` auto-loads `.env` and it beats parent-shell `export DATABASE_URL=...` — to target another DB use a temp drizzle config (`--config`) or temp `.env` swap + restore; verify with a real query, never trust the env. `bunx` can be missing inside `execSync(shell:true)` children — prefer `bun x`. For explicit connection strings use `node.exe` (no dotenv autoload).
- **Onboarding seeds COA:** `ensure-workspace.ts` only creates org + OWNER membership + profile mirror; COA + 12 fiscal periods are provisioned atomically in `src/server/onboarding/engine.ts` on onboarding complete.

## Conventions
- **Money:** `numeric(18,2)` in DB, `Money` class BigInt minor via `Money.parseIdr`/`formatIdr` (`src/core/money/money.ts`) — never JS `number` for amounts.
- **Posting:** `validate → post → immutable` — `journal_entries.status` DRAFT→POSTED only, trigger `forbid_posted_mutation` (`triggers.sql`), corrections via `reversal_of_id`, numbers `JE-YYYY-NNNN` year-scoped per org (`journals.repo.ts`: per-period `journal_seq_counters` + `pg_advisory_xact_lock`).
- **AI:** `@google/genai` Interactions API (`src/server/ai/adapter.ts`, `nara.ts`, `journal-chat.ts`, `interaction-memory.ts`), `store:true` + `previous_interaction_id` per thread (`chat_threads.gemini_interaction_id`, retry without chaining when stale), `response_format` JSON Schema + zod `DraftEntrySchema` (`schema.ts`), retry 2 (`MAX_RETRIES`). Anti-forget prompt rule: short confirmations ("ok catatkan ya") MUST resolve from last 12 messages (`advisor.ts:68`), never re-ask for details. Uploads: ≤5MB (`src/server/storage/config.ts:MAX_DOCUMENT_BYTES`); allowed mimes are images + pdf + csv/txt/xls/xlsx (`ALLOWED_MIMES`), not arbitrary files.
- **Auth:** `@neondatabase/auth/next` client/server (`src/server/auth/*`); local `user` table is read-only identity mirror, sessions never live there.
- **UI:** Sidebar persisted `neraca:sidebar-collapsed`, topbar Cmd+K palette (`searchGlobalAction`). Shared patterns live in Reusable Components below — follow them instead of inventing.

## Reusable Components (don't reinvent)
- **Page chrome:** `PageHeader` (`title/eyebrow/actions`) on every list/create page; back link above it on `/baru` + `/[id]` pages (jurnal/baru pattern). Sidebar parent/children groups live in `src/components/sidebar-nav.tsx` (`NavItem.children`, Kas & Bank pattern).
- **Primary action:** terra split button `h-9 rounded-xl` + chevron half `border-l border-white/20` (`persediaan-client.tsx`, `NewEntryForm`) — never restyle per module. In-table row action: outline `Posting` + terra `Jurnal` link (`invoice-list.tsx`, `CashEntriesTable`).
- **Pickers & display:** `AccountSelect` (searchable combobox, `pinnedIds`, `showCreateLink`) for every account field — never native `<select>` for accounts. `SakRuleSheet` (`components/sak`) + `BookContentRenderer` (`components/aturan`) for SAK citations (data: `getSakChapterForSheetAction`, `getSakCitationDetailAction`); kas-bank insight uses `dailyInsight` (`src/core/kas-bank/insights.ts`, deterministic, no AI). Tables: card `rounded-xl border-rule` + thead `text-[11px] uppercase` + `tnum` + icon status Badge; amounts via `Money.formatIdr`, debit uses `text-debit` token (no kredit token exists — kredit stays ink).
- **Motion:** primitives in `src/components/motion` (`Reveal`, `AnimatedNumber`); Aceternity set in `src/components/aceternity` (token-skinned, marketing surfaces). Motion MCP (`opencode.jsonc`) — search motion docs before any animation, import from `motion`/`motion/react`, never `framer-motion`.
- **UI copy:** Bahasa Indonesia; Paper & Ink tokens `src/app/globals.css`; `prefers-reduced-motion` respected. Full-bleed fluid layout — no boxed max-width.

## Testing Quirks
- `vitest.config.mts`: `fileParallelism:false` (integration files share one PG and TRUNCATE), `setupFiles:["tests/setup.ts"]` rewrites DB URL before any import. Run single file: `bunx vitest run tests/integration/ledger.test.ts`.
- Storage tests skip when `SKIP_STORAGE_TESTS=1` or S3 unreachable (top-level probe).
- Playwright: `workers:1`, `reuseExistingServer:true` — kill stale `:3000` before `bun run e2e`; `tests/e2e/global-setup.ts` warms `/daftar /masuk /verifikasi /onboarding /dasbor` to avoid Turbopack cold-compile hydration race. After `goto`, wait `networkidle` + hydration before clicking or clicks land dead; keep `data-testid` contracts stable (`kas-bank-*`, `onboarding-*`) — specs depend on them.
- Shell: PowerShell native; `weed:dev` needs `cmd /c`; plain `bash` is WSL — prefer `C:\Program Files\Git\bin\bash.exe -c` or PowerShell. Never `bash` heredoc for file writes.

## Routes & Entrypoints
`(app)/dasbor`, `jurnal` (manual entry, `NewEntryForm`), `jurnal/ai` (chat, fn `create_journal_draft`), `jurnal/ai/[id]` (review diff), `jurnal/[id]` (detail + docs), `kas-bank/*` (pembayaran/penerimaan/transfer — each list + `/baru` + `/[id]` detail; histori; rekonsiliasi; `/rekonsiliasi` redirects), `buku-besar`, `laporan/*`, `faktur` (list + `/baru` + `/[id]`), `kontak`, `aset`, `persediaan`, `aturan` (`?bab=N` deep link), `tutup-buku`, `temuan` (doctor), `pengaturan` (COA archive, periods), `asisten` (RAG chat), `/onboarding` (+ `/daftar /masuk /verifikasi`), `api/nara`, `api/advisor`, `api/documents`, `api/onboarding`. RAG: `src/server/db/repos/rag-search.ts` (vector 768 + `tsvector`).

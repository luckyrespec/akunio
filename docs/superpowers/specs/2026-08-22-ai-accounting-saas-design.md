# AI Accounting SaaS — Design Spec

**Date:** 2026-08-22
**Status:** Approved design, pre-implementation
**Codename (working):** Paper & Ink

## 1. Product Overview

A SaaS web application that helps small Indonesian organizations maintain correct financial accounting. It combines a rigorous double-entry ledger engine compliant with **IFRS for SMEs** with AI capabilities that draft journal entries from natural language or documents, answer questions grounded in the company's real books and the IFRS-SME handbook (RAG), detect bookkeeping problems, and propose correcting entries.

**Target user:** small organizations in Indonesia without a dedicated accounting department.

### Locked decisions

| Decision | Choice |
|---|---|
| Accounting standard | IFRS for SMEs |
| First milestone | Ledger-first (solid core before AI) |
| Market / locale | Indonesia: IDR base currency, PPN + PPh fields, Bahasa Indonesia UI |
| Stack | All-TypeScript modular monolith on Next.js |
| LLM provider | Provider-agnostic adapter; default set via env config |
| SaaS infra v1 | Auth + multi-tenant orgs only; billing deferred |
| AI inputs | Natural language + document upload via multimodal LLM (no OCR pipeline) |
| RAG corpus | Global IFRS-SME handbook index + per-tenant private index |
| Problem fixing | Detect + propose fixes with human approval; never silent auto-fix |
| Visual direction | "Paper & Ink" — warm editorial ledger-book aesthetic |

## 2. Architecture

Single Next.js App Router application, layered so the domain core has zero framework dependencies:

```
src/
  core/        # PURE domain layer: no React, no DB, no fetch. Fully unit-testable.
    accounts/  # chart of accounts model, normal balances, validation
    journals/  # posting pipeline, balancing rules, period locks, reversals
    reports/   # trial balance, laba rugi, neraca, arus kas, perubahan ekuitas
    tax/       # PPN input/output handling, PPh withholding fields
    money/     # monetary math via integer minor units over numeric(18,2); no floats
    ifrs/      # IFRS-SME section metadata used for AI citations
  server/
    db/        # Drizzle schema, migrations, tenant-scoped repositories
    ai/        # provider adapter, LlamaIndex.TS RAG, copilot orchestration
    auth/      # Better Auth configuration (users, orgs, roles)
  app/         # routes + UI (Paper & Ink design system)
```

- **Framework:** Next.js (App Router), TypeScript strict mode
- **DB:** Postgres 16 + pgvector, Drizzle ORM
- **Auth:** Better Auth — email/password + Google OAuth, organization = tenant
- **AI:** Vercel AI SDK as the provider-agnostic gateway (`chat`, `vision`, `embed`); LlamaIndex.TS orchestrates retrieval over pgvector
- **Deploy target:** Vercel or Docker (single deployable)

## 3. Data Model

Every business table carries `org_id`. Application queries are always session-org-scoped; Postgres Row-Level Security enforces isolation a second time at the database level. Money is stored as `numeric(18,2)`; floats are forbidden.

| Table | Purpose |
|---|---|
| `organizations` | Tenant root: name, fiscal-year start month, base currency (IDR) |
| `memberships` | User ↔ org with role: `owner \| accountant \| viewer` |
| `accounts` | Chart of accounts: code, name, type (`aset/liabilitas/ekuitas/pendapatan/beban`), subtype, parent, `is_cash`, `is_bank`, tax mapping, archived flag |
| `fiscal_periods` | Monthly periods per org: status `open/closed/locked` |
| `journal_entries` | Header: sequential number `JE-YYYY-NNNN` per org-period, date, memo, source (`manual/ai/document/import`), status (`draft/posted/reversed`), idempotency key |
| `journal_lines` | Entry lines: account, debit, credit, description, tax code |
| `documents` | Uploaded files (storage ref, mime type), AI extraction result JSON, confidence score |
| `audit_log` | Append-only, hash-chained records (each entry seals the previous hash) |
| `ai_findings` | Detected problems: type, severity, evidence links, status (`open/proposed/resolved/dismissed`) |
| `ai_proposals` | Correcting draft entries linked to findings, with IFRS citations |

A default Indonesian SME chart of accounts is seeded at org creation and fully customizable.

## 4. Accounting Core Invariants

The single choke point every journal line passes through, human or AI:

```
draft → validate → post → IMMUTABLE
```

Validation rules:
1. Sum of debits equals sum of credits
2. Entry date falls inside an **open** fiscal period
3. Referenced accounts exist, belong to the org, and are not archived
4. At least two lines

Post-posting rules:
- Posted entries are immutable. No edits, no deletes — ever.
- Corrections happen through **linked reversing entries**, preserving the audit trail end to end.
- Period close sets `closed`; reopening requires the owner role and writes to `audit_log`.
- Posting is transactional with idempotency keys (retries can never duplicate an entry).

IFRS-SME statements are pure functions over ledger state as of a date:
- **Laba Rugi** (income statement)
- **Neraca** (balance sheet, hard assertion that assets = liabilities + equity)
- **Arus Kas** (cash flow, indirect method by default)
- **Perubahan Ekuitas** (statement of changes in equity)

Tax support in v1: PPN Masukan/Keluaran account splitting with e-faktur-style reference fields; PPh 21/23/4(2) withholding reference fields.

## 5. AI Layer

### Provider-agnostic gateway
One thin adapter interface exposing `chat`, `vision`, `embed`. The concrete provider (OpenAI, Anthropic, Gemini, local via OpenAI-compatible endpoint) is chosen by environment config and can be swapped without feature-code changes. All inference happens server-side; API keys never reach the client.

### Journal Copilot
```
NL text ─────────────┐
                     ├─→ extract → draft JE (JSON, zod-validated)
doc image/PDF ───────┘        ↓
                 account mapping: fuzzy match + embedding similarity
                 against THIS tenant's chart of accounts
                              ↓
                 draft + confidence score + IFRS-SME citation
                              ↓
              REVIEW UI (diff-style, never auto-posts)
                              ↓
              accept → SAME validate→post pipeline as manual entry
```

- Documents go directly into a multimodal model — no separate OCR pipeline.
- Extraction output is stored on the `documents` row as evidence.
- Drafts never post automatically. Acceptance is always a human click.

### RAG advisor (LlamaIndex.TS + pgvector)
Two-tier index:
- **Global corpus:** IFRS for SMEs handbook chunked by section, embedded once, shared read-only across all tenants (cost-efficient).
- **Tenant corpus:** org's COA descriptions, journal history patterns, statement snapshots, uploaded documents. Strictly `org_id`-filtered at query time.

The advisor chat never generates free-form SQL against the books. It reads the ledger exclusively through safe read-only domain functions, so it reasons about live company numbers but cannot mutate anything.

### Problem detection & fixing
- **Pass 1 — deterministic rule engine** (free, runs continuously): abnormal balances for account types, duplicate references/documents, missing receipts above a threshold, entries dated oddly relative to period, ratio anomalies versus history.
- **Pass 2 — LLM review** of flagged items plus sampled journals: catches misclassifications rules cannot see.
- Findings land in a severity-ranked inbox with evidence links. One click generates a proposed correcting entry — still a draft, still cited, always requiring approval.

### Guardrails
- zod schema validation on every model output
- Per-org token/cost budgets
- Prompt-injection hardening for untrusted document text
- Provider outages degrade gracefully: copilot marked offline, drafts queue, manual entry unaffected

## 6. UI / Design System ("Paper & Ink")

shadcn/ui re-themed:
- Cream paper canvas `#FAF7F2`, ink navy text, terracotta accent, hairline ruled borders evoking ledger paper
- Serif display face (Fraunces) for headings and hero numbers; tabular numerals everywhere money appears
- Classic accounting typography: double rule under report totals, right-aligned numeric columns; red/green reserved for debit/credit semantics
- Signature pattern: **AI appears as marginalia** — quiet annotations in the page margin, not chatbot popups

Screens (v1):
1. Dasbor — period status, cash position, P&L trend, findings preview
2. Jurnal Umum — journal table + "Tulis dengan AI" composer (NL box + document upload)
3. AI draft review — diff-style preview with confidence, explanation, citations
4. Buku Besar — account drilldown
5. Laporan — four IFRS-SME statements with export
6. Asisten — RAG chat panel with inline citations
7. Temuan — findings inbox with evidence and propose-fix actions
8. Pengaturan — COA editor, periods/close, members, org settings

All validation and system messages in Bahasa Indonesia.

## 7. Error Handling

- Posting failures roll back transactionally; idempotency keys prevent duplicates on retry
- AI subsystem failure never blocks manual operation
- Validation errors surface inline, in Indonesian, next to the offending field

## 8. Testing Strategy

- **Core engine:** exhaustive unit tests + property-based tests (random valid batches must always yield balanced books and balanced statements) + hand-built golden fixtures
- **AI layer:** mocked-provider contract tests; eval set of ~50 Indonesian receipts/phrases scored on extraction accuracy
- **E2E (Playwright):** manual entry → post → statement; AI draft → review → accept → posted

## 9. Roadmap

| Milestone | Delivers |
|---|---|
| **M1 — Ledger-first** | Repo scaffold, auth/orgs, COA seed, manual journals, periods, four IFRS-SME statements, Paper & Ink shell |
| **M2 — Copilot** | NL journal drafting, review flow, document extraction |
| **M3 — Advisor** | Two-tier RAG index, cited chat over live books |
| **M4 — Doctor** | Rule engine, findings inbox, one-click fix proposals |

Subscription billing is intentionally deferred until after M1–M2 prove value.

## 10. Out of Scope (v1)

- Subscription billing and plan limits
- Bank statement import/reconciliation
- Multi-currency transactions (base currency IDR only; schema keeps precision configurable for later)
- Full e-faktur/DJP API integrations
- Inventory modules (perpetual FIFO/average costing)
- Mobile native apps

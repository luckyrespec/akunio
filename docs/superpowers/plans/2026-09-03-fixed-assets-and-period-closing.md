# Fixed Assets & Guided Period Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Fixed Assets register with auto-depreciation (Straight-Line & Declining Balance) and disposal, along with a Guided Period Closing Wizard (pre-closing checklist, year-end closing entries, and period locking) compliant with SAK EMKM.

**Architecture:** Domain logic isolated in `src/core/assets` and `src/core/periods` (100% unit tested and deterministic with BigInt minor units), persistent storage in Drizzle schema with multi-tenant RLS, immutable GL integration via `postJournalEntry`, modern responsive UI with Paper & Ink styling, and Nara AI assistant function calling tools with `<Confirmation>` approval flows.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Drizzle ORM, PostgreSQL (RLS), Tailwind CSS v4, shadcn/ui, Lucide Icons, Vitest, @google/genai Interactions API.

**Spec:** [`docs/superpowers/specs/2026-09-03-fixed-assets-and-period-closing-design.md`](file:///d:/Lucky/NgodingCuy/REAL_PROJECT/ai_accounting/docs/superpowers/specs/2026-09-03-fixed-assets-and-period-closing-design.md)

## Global Constraints
- All currency amounts must be stored as `bigint` minor units (cents) or `numeric(18,2)` in PostgreSQL; never use JavaScript floating-point `number` for monetary calculations.
- Transactions touching the General Ledger must use `postJournalEntry` to ensure double-entry balance, per-year sequence numbering (`JE-YYYY-NNNN`), and immutability.
- All database tables must have `org_id` foreign keys and Row Level Security enabled.
- UI must follow Indonesian terminology ("Aset Tetap", "Penyusutan", "Tutup Buku", "Laba Ditahan") and Paper & Ink design tokens (`canvas`, `paper`, `ink`, `terra`).

---

### Task 1: Database Schema & Migration for Fixed Assets

**Files:**
- Create: `src/server/db/schema/assets.ts`
- Modify: `src/server/db/schema/index.ts`
- Modify: `src/server/db/rls.sql`
- Test: `tests/integration/assets-schema.test.ts`

**Interfaces:**
- Produces: `fixedAssets`, `assetDepreciationLines`, `assetDisposals` Drizzle table definitions.

- [ ] **Step 1: Write integration test for assets schema and multi-tenant isolation**

```typescript
// tests/integration/assets-schema.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "./helpers";
import { organizations, accounts } from "@/server/db/schema/org";
import { fixedAssets, assetDepreciationLines, assetDisposals } from "@/server/db/schema/assets";
import { eq } from "drizzle-orm";

describe("Fixed Assets Schema & RLS", () => {
  const db = getTestDb();
  let orgId: string;
  let assetAccId: string;
  let depAccId: string;
  let expAccId: string;

  beforeEach(async () => {
    const [org] = await db.insert(organizations).values({ name: "Test Org Assets" }).returning();
    orgId = org.id;

    const [acc1] = await db.insert(accounts).values({
      orgId, code: "1510", name: "Peralatan Kantor", type: "ASET", normal: "D"
    }).returning();
    const [acc2] = await db.insert(accounts).values({
      orgId, code: "1610", name: "Akum. Penyusutan Peralatan", type: "ASET", normal: "K", contra: true
    }).returning();
    const [acc3] = await db.insert(accounts).values({
      orgId, code: "6210", name: "Beban Penyusutan Peralatan", type: "BEBAN", normal: "D"
    }).returning();

    assetAccId = acc1.id;
    depAccId = acc2.id;
    expAccId = acc3.id;
  });

  it("can create a fixed asset and depreciation line", async () => {
    const [asset] = await db.insert(fixedAssets).values({
      orgId,
      code: "AST-2026-0001",
      name: "Laptop ThinkPad",
      category: "INVENTARIS_KANTOR",
      acquisitionDate: "2026-01-15",
      inServiceDate: "2026-01-15",
      acquisitionCostMinor: 1200000000n,
      salvageValueMinor: 0n,
      usefulLifeMonths: 48,
      depreciationMethod: "STRAIGHT_LINE",
      assetAccountId: assetAccId,
      accumulatedDepAccountId: depAccId,
      depreciationExpenseAccountId: expAccId,
      status: "ACTIVE",
    }).returning();

    expect(asset.id).toBeDefined();
    expect(asset.code).toBe("AST-2026-0001");

    const [line] = await db.insert(assetDepreciationLines).values({
      orgId,
      assetId: asset.id,
      periodName: "2026-01",
      depreciationDate: "2026-01-31",
      depreciationAmountMinor: 25000000n,
      accumulatedDepreciationMinor: 25000000n,
      bookValueMinor: 1175000000n,
      status: "SCHEDULED",
    }).returning();

    expect(line.id).toBeDefined();
    expect(line.bookValueMinor).toBe(1175000000n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run tests/integration/assets-schema.test.ts`
Expected: FAIL due to missing schema file `@/server/db/schema/assets`.

- [ ] **Step 3: Create `src/server/db/schema/assets.ts` and register in `index.ts` and `rls.sql`**

Define `fixedAssets`, `assetDepreciationLines`, and `assetDisposals` with full types, foreign keys, and indexes. Update `src/server/db/schema/index.ts` and add RLS DO blocks to `src/server/db/rls.sql`. Run `bun run db:sql` or setup DDL.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run tests/integration/assets-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema/assets.ts src/server/db/schema/index.ts src/server/db/rls.sql tests/integration/assets-schema.test.ts
git commit -m "feat(assets): add fixed assets database schema and RLS configuration"
```

---

### Task 2: Core Fixed Assets Depreciation Engine

**Files:**
- Create: `src/core/assets/depreciation.ts`
- Test: `tests/unit/assets/depreciation.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface DepreciationScheduleItem {
    periodName: string;
    depreciationDate: string;
    depreciationAmountMinor: bigint;
    accumulatedDepreciationMinor: bigint;
    bookValueMinor: bigint;
  }
  export function calculateDepreciationSchedule(params: {
    acquisitionCostMinor: bigint;
    salvageValueMinor: bigint;
    usefulLifeMonths: number;
    inServiceDate: string; // YYYY-MM-DD
    method: "STRAIGHT_LINE" | "DECLINING_BALANCE";
    decliningRatePercent?: number;
  }): DepreciationScheduleItem[];
  ```

- [ ] **Step 1: Write comprehensive unit tests for depreciation calculation**

Cover:
- Straight-line with 0 salvage value.
- Straight-line with positive salvage value and penny rounding on final month.
- Declining balance with salvage value clamp (ensuring book value never drops below salvage value).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run tests/unit/assets/depreciation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/core/assets/depreciation.ts`**

Implement deterministic calculation with BigInt integer math, month stepping from `inServiceDate`, and rounding adjustments.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run tests/unit/assets/depreciation.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/core/assets/depreciation.ts tests/unit/assets/depreciation.test.ts
git commit -m "feat(assets): implement core depreciation schedule calculation engine"
```

---

### Task 3: Core Fixed Assets Disposal Engine

**Files:**
- Create: `src/core/assets/disposal.ts`
- Test: `tests/unit/assets/disposal.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface DisposalCalculationResult {
    bookValueAtDisposalMinor: bigint;
    gainLossMinor: bigint; // positive = gain, negative = loss
    isGain: boolean;
    journalLines: Array<{
      accountId: string;
      debitMinor: bigint;
      creditMinor: bigint;
      memo: string;
    }>;
  }
  export function calculateAssetDisposal(params: {
    acquisitionCostMinor: bigint;
    accumulatedDepreciationMinor: bigint;
    proceedsMinor: bigint;
    assetAccountId: string;
    accumulatedDepAccountId: string;
    depositAccountId?: string;
    gainLossAccountId: string;
  }): DisposalCalculationResult;
  ```

- [ ] **Step 1: Write unit tests for asset disposal**

Test:
- Sale with Gain (`proceeds > bookValue`).
- Sale with Loss (`proceeds < bookValue`).
- Scrap / Write-off with Rp 0 proceeds (loss = full book value).
- Verifies journal lines debit sum strictly equals credit sum.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run tests/unit/assets/disposal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/assets/disposal.ts`**

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run tests/unit/assets/disposal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/assets/disposal.ts tests/unit/assets/disposal.test.ts
git commit -m "feat(assets): implement asset disposal and gain/loss calculation engine"
```

---

### Task 4: Fixed Assets Repository & Server Actions

**Files:**
- Create: `src/server/db/repos/assets.repo.ts`
- Create: `src/server/actions/assets.actions.ts`
- Test: `tests/integration/assets-actions.test.ts`

**Interfaces:**
- Produces:
  - `createFixedAssetAction(input)`
  - `listFixedAssetsAction()`
  - `getFixedAssetDetailAction(id)`
  - `postMonthlyDepreciationAction(periodName)`
  - `disposeAssetAction(input)`

- [ ] **Step 1: Write integration tests for asset lifecycle and monthly GL posting**

Test:
- Registering an asset automatically generates `asset_depreciation_lines`.
- Running `postMonthlyDepreciationAction("2026-01")` creates a balanced journal entry in `journal_entries` and updates line status to `POSTED`.
- Running `disposeAssetAction` posts the disposal journal and marks the asset as `DISPOSED`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run tests/integration/assets-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `assets.repo.ts` and `assets.actions.ts`**

Use transactions, verify account ownership in the same org, call `postJournalEntry` for GL postings.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run tests/integration/assets-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/assets.repo.ts src/server/actions/assets.actions.ts tests/integration/assets-actions.test.ts
git commit -m "feat(assets): add repository, server actions, and GL posting for fixed assets"
```

---

### Task 5: Core Guided Period Closing Validator & Year-End Closing Journal

**Files:**
- Create: `src/core/periods/closing-checklist.ts`
- Create: `src/core/periods/closing-journal.ts`
- Test: `tests/unit/periods/closing.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface PreClosingChecklistResult {
    isReady: boolean;
    items: {
      bankReconciliation: { passed: boolean; unreconciledSessionsCount: number };
      pendingDrafts: { passed: boolean; pendingCount: number };
      depreciationPosted: { passed: boolean; unpostedAssetsCount: number };
      unpostedInvoices: { passed: boolean; unpostedCount: number };
      trialBalance: { passed: boolean; diffMinor: bigint };
    };
  }
  export function evaluatePreClosingChecklist(data: { ... }): PreClosingChecklistResult;
  export function generateYearEndClosingLines(params: {
    revenueBalances: Array<{ accountId: string; balanceCreditMinor: bigint }>;
    expenseBalances: Array<{ accountId: string; balanceDebitMinor: bigint }>;
    incomeSummaryAccountId: string;
    retainedEarningsAccountId: string;
  }): Array<{ accountId: string; debitMinor: bigint; creditMinor: bigint; memo: string }>;
  ```

- [ ] **Step 1: Write unit tests for checklist evaluation and year-end closing entries**

Test:
- All 5 checklist items pass when clean.
- Flags unposted depreciation or pending drafts with actionable counts.
- Closing entries zero out revenues and expenses into Income Summary (3999) and transfer net profit/loss to Retained Earnings (3200).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run tests/unit/periods/closing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `closing-checklist.ts` and `closing-journal.ts`**

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run tests/unit/periods/closing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/periods/closing-checklist.ts src/core/periods/closing-journal.ts tests/unit/periods/closing.test.ts
git commit -m "feat(periods): implement pre-closing checklist and year-end closing entries"
```

---

### Task 6: Period Closing Actions & Period Locking Guard

**Files:**
- Modify: `src/server/actions/periods.actions.ts`
- Modify: `src/server/ledger/posting.ts`
- Test: `tests/integration/periods-closing.test.ts`

**Interfaces:**
- Produces:
  - `checkPeriodClosingStatusAction(periodName)`
  - `executePeriodCloseAction(params: { periodName: string; isYearEnd?: boolean })`
  - Enforces period status check in `postJournalEntry` (rejects postings to `CLOSED` or `LOCKED` periods).

- [ ] **Step 1: Write integration tests for period closing and locking guard**

Test:
- Evaluates real DB queries for bank reconciliations, drafts, depreciation, and invoices for the period.
- Closes the period (`CLOSED`).
- Attempts to post a journal dated in the closed period ➔ throws `PERIODE_TERKUNCI` error.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run tests/integration/periods-closing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `periods.actions.ts` and `posting.ts`**

Add period status guard in `postJournalEntry` and implement server actions.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run tests/integration/periods-closing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/periods.actions.ts src/server/ledger/posting.ts tests/integration/periods-closing.test.ts
git commit -m "feat(periods): add closing actions and enforce immutable posting lock on closed periods"
```

---

### Task 7: Fixed Assets User Interface (`/aset` & `/aset/[id]`)

**Files:**
- Create: `src/app/(app)/aset/page.tsx`
- Create: `src/app/(app)/aset/aset-client.tsx`
- Create: `src/app/(app)/aset/create-asset-dialog.tsx`
- Create: `src/app/(app)/aset/run-depreciation-dialog.tsx`
- Create: `src/app/(app)/aset/[id]/page.tsx`
- Create: `src/app/(app)/aset/[id]/asset-detail-client.tsx`
- Create: `src/app/(app)/aset/[id]/disposal-dialog.tsx`
- Modify: `src/components/layout/sidebar.tsx` (add Aset Tetap navigation link)
- Test: `tests/unit/components/assets-ui.test.tsx`

- [ ] **Step 1: Write component smoke tests**

Verify KPI cards, table rendering, and dialog triggers.

- [ ] **Step 2: Implement `/aset` and subcomponents**

Implement:
- KPI cards (Total Perolehan, Total Akumulasi, Nilai Buku Bersih, Jumlah Aset).
- Table with filtering by status and category.
- Create Asset Dialog with Nara recommendation trigger.
- Run Monthly Depreciation Dialog with batch preview.
- Asset Detail page with monthly schedule table and Disposal Dialog.
- Sidebar menu item with `Building2` icon.

- [ ] **Step 3: Verify TypeScript and component tests pass**

Run: `bun vitest run tests/unit/components/assets-ui.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/aset/ src/components/layout/sidebar.tsx tests/unit/components/assets-ui.test.tsx
git commit -m "feat(ui): add fixed assets register, detail, schedule, and disposal views"
```

---

### Task 8: Guided Period Closing Wizard Interface (`/tutup-buku`)

**Files:**
- Create: `src/app/(app)/tutup-buku/page.tsx`
- Create: `src/app/(app)/tutup-buku/tutup-buku-client.tsx`
- Modify: `src/app/(app)/pengaturan/page.tsx` (add link to Tutup Buku Wizard from Periods list)
- Test: `tests/unit/components/period-closing-ui.test.tsx`

- [ ] **Step 1: Write component tests for Stepper Wizard**

Verify checklist item state changes and step progression.

- [ ] **Step 2: Implement `/tutup-buku` Stepper Wizard**

Implement 4-step wizard:
- Step 1: Select Period & Financial Overview.
- Step 2: Interactive Pre-Closing Checklist (with 1-click action buttons).
- Step 3: Year-end closing journal preview (if December) or summary.
- Step 4: Lock Confirmation with audit warning and locked badge.

- [ ] **Step 3: Run component tests**

Run: `bun vitest run tests/unit/components/period-closing-ui.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/tutup-buku/ src/app/(app)/pengaturan/page.tsx tests/unit/components/period-closing-ui.test.tsx
git commit -m "feat(ui): add interactive guided period closing stepper wizard"
```

---

### Task 9: Nara AI Assistant Tools Integration

**Files:**
- Create: `src/server/ai/tools/assets.tools.ts`
- Create: `src/server/ai/tools/periods.tools.ts`
- Modify: `src/app/api/nara/chat/stream/route.ts`
- Modify: `src/app/api/nara/chat/confirm/route.ts`
- Test: `tests/integration/nara-asset-tools.test.ts`

**Interfaces:**
- Produces:
  - `recommend_asset_depreciation` tool.
  - `run_monthly_depreciation` tool (with `<Confirmation>` approval).
  - `check_period_closing_readiness` tool.
  - `close_fiscal_period` tool (with `<Confirmation>` approval).

- [ ] **Step 1: Write integration tests for Nara asset & closing tools**

Test:
- AI correctly invokes `recommend_asset_depreciation` for a given asset prompt.
- `run_monthly_depreciation` requests approval.
- Confirm route executes and updates GL.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run tests/integration/nara-asset-tools.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement tools in `stream/route.ts` and confirmation handling in `confirm/route.ts`**

Register tools with type schemas, execution handlers, and confirmation cards.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run tests/integration/nara-asset-tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/tools/ src/app/api/nara/chat/ tests/integration/nara-asset-tools.test.ts
git commit -m "feat(ai): integrate Nara assistant tools for asset depreciation and period closing"
```

---

### Task 10: Full Suite Verification & Build Sanity

**Files:**
- Verification only

- [ ] **Step 1: Run complete TypeScript check**

Run: `bunx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Run complete Vitest test suite**

Run: `bun run test`
Expected: All test suites pass (target 65+ suites, 140+ tests).

- [ ] **Step 3: Run Next.js production build**

Run: `bun run build`
Expected: Build succeeds with 35+ routes compiled.

- [ ] **Step 4: Commit any final polish and tag phase completion**

```bash
git commit --allow-empty -m "chore: complete phase 2 fixed assets and period closing milestone"
```

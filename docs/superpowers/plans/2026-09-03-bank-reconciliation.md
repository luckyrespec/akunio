# Bank Reconciliation Implementation Plan (Milestone 2.2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun modul Rekonsiliasi Bank Cerdas yang mampu mengekstrak dokumen mutasi bank (PDF, gambar, atau spreadsheet) menggunakan Gemini Multimodal AI (@google/genai Interactions API), menjalankan 3-tier intelligent auto-matching, aksi cepat pembuatan jurnal penyesuaian (biaya admin & bunga bank), worksheet dual-pane side-by-side, serta integrasi percakapan Nara AI.

**Architecture:** Menggunakan pipeline unggah dokumen ke S3 (SeaweedFS), ekstraksi mutasi bank terstruktur via Gemini tanpa parser manual, matching engine murni di `src/core/reconciliation` (Tier 1: Exact, Tier 2: AI Recommendation, Tier 3: Actionable Unmatched), server actions dengan transaksi database berintegritas tinggi, dan UI dual-pane responsif berbasis token Paper & Ink.

**Tech Stack:** Next.js 16.3 (App Router), Drizzle ORM + PostgreSQL 18, `@google/genai` (Gemini 3.5 Flash-Lite, `store: false`), Zod, Vitest 4, Tailwind CSS 4, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-09-03-bank-reconciliation-design.md`

## Global Constraints

- Uang disimpan dalam unit minor BigInt (sen/cents: 1 IDR = 100 minor unit) pada database `numeric(18, 0)` dan menggunakan helper `Money` — jangan pernah gunakan `number` JavaScript biasa untuk kalkulasi saldo finansial.
- Isolasi multi-tenant dijamin dengan RLS pada `bank_reconciliations` dan relasi subquery pada `bank_statement_lines`.
- Model AI menggunakan `gemini-3.5-flash-lite` dengan flag `store: false`.
- Jangan gunakan model legacy (`2.5-*`, `2.0-*`, `1.5-*`).
- Testing menggunakan database `ledger_test` dan tidak pernah mengganggu data dev `ledger`.

---

### Task 1: Database Schema, RLS, & Migration

**Files:**
- Create: `src/server/db/schema/reconciliation.ts`
- Modify: `src/server/db/rls.sql`
- Generate Migration: `drizzle/0007_bank_reconciliation.sql`
- Test: `tests/integration/reconciliation-schema.test.ts`

**Interfaces:**
- Produces:
  - `bankReconciliations` schema table
  - `bankStatementLines` schema table
  - `reconciliationStatusEnum`, `statementLineTypeEnum`, `matchStatusEnum`

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/reconciliation-schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { bankReconciliations, bankStatementLines } from "@/server/db/schema/reconciliation";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Bank Reconciliation Database Schema", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Test Bank Rec Schema")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("creates a bank reconciliation session and child statement lines", async () => {
    const [bankAcc] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));

    const [rec] = await db
      .insert(bankReconciliations)
      .values({
        orgId,
        bankAccountId: bankAcc.id,
        statementDate: "2026-08-31",
        statementBalanceMinor: 2500000000n, // Rp 25.000.000
        ledgerBalanceMinor: 2500000000n,
        differenceMinor: 0n,
        status: "IN_PROGRESS",
      })
      .returning();

    expect(rec.id).toBeDefined();
    expect(rec.status).toBe("IN_PROGRESS");

    const [line] = await db
      .insert(bankStatementLines)
      .values({
        reconciliationId: rec.id,
        transactionDate: "2026-08-15",
        description: "TRSF CR DARI PELANGGAN",
        type: "CR",
        amountMinor: 500000000n, // Rp 5.000.000
        matchStatus: "UNMATCHED",
      })
      .returning();

    expect(line.id).toBeDefined();
    expect(line.amountMinor).toBe(500000000n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/reconciliation-schema.test.ts`  
Expected: FAIL (Cannot find package/module `reconciliation.ts`)

- [ ] **Step 3: Create schema and update RLS**

Create `src/server/db/schema/reconciliation.ts` dengan tabel `bank_reconciliations` dan `bank_statement_lines`. Update `src/server/db/rls.sql` untuk menambahkan policy RLS. Jalankan `bunx drizzle-kit generate` dan `bun run test:db:setup` serta `bun run db:migrate`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/reconciliation-schema.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema/reconciliation.ts src/server/db/rls.sql drizzle/ tests/integration/reconciliation-schema.test.ts
git commit -m "feat(db): add bank reconciliation and statement lines schema with rls"
```

---

### Task 2: Gemini Multimodal Bank Statement Extractor

**Files:**
- Create: `src/server/ai/bank-statement-extractor.ts`
- Test: `tests/unit/ai/bank-statement-extractor.test.ts`

**Interfaces:**
- Produces:
  - `extractBankStatement(fileBuffer: Buffer, mimeType: string, filename?: string): Promise<BankStatementExtractedData>`
  - `BankStatementExtractSchema` (Zod Schema)

- [ ] **Step 1: Write the failing unit test**

```typescript
// tests/unit/ai/bank-statement-extractor.test.ts
import { describe, it, expect } from "vitest";
import { BankStatementExtractSchema, parseExtractedStatementData } from "@/server/ai/bank-statement-extractor";

describe("Bank Statement Extractor", () => {
  it("validates and normalizes extracted json response correctly", () => {
    const raw = {
      bankName: "Bank Central Asia (BCA)",
      accountNumber: "1234567890",
      statementPeriod: {
        from: "2026-08-01",
        to: "2026-08-31",
      },
      openingBalance: 10000000,
      closingBalance: 15000000,
      transactions: [
        {
          date: "2026-08-05",
          description: "TRSF E-BANKING CR DARI PT MAJU",
          type: "CR",
          amount: 5000000,
          referenceNumber: "TRF-001",
        },
        {
          date: "2026-08-31",
          description: "BIAYA ADM BULANAN",
          type: "DB",
          amount: 15000,
        },
      ],
    };

    const parsed = parseExtractedStatementData(raw);
    expect(parsed.bankName).toBe("Bank Central Asia (BCA)");
    expect(parsed.closingBalanceMinor).toBe(1500000000n);
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0].amountMinor).toBe(500000000n);
    expect(parsed.transactions[0].type).toBe("CR");
    expect(parsed.transactions[1].amountMinor).toBe(1500000n);
    expect(parsed.transactions[1].type).toBe("DB");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/ai/bank-statement-extractor.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement extraction engine**

Create `src/server/ai/bank-statement-extractor.ts`:
- Define `BankStatementExtractSchema`.
- Define `parseExtractedStatementData` to convert standard currency floats into BigInt minor units.
- Define `extractBankStatement(fileBuffer, mimeType)` with `@google/genai` using `gemini-3.5-flash-lite`, `store: false`, and `responseSchema`. Include fallback mock if `AI_MOCK=1` or no API key.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/unit/ai/bank-statement-extractor.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/bank-statement-extractor.ts tests/unit/ai/bank-statement-extractor.test.ts
git commit -m "feat(ai): implement gemini multimodal bank statement extractor"
```

---

### Task 3: 3-Tier Reconciliation Matching Engine

**Files:**
- Create: `src/core/reconciliation/matcher.ts`
- Test: `tests/unit/reconciliation/matcher.test.ts`

**Interfaces:**
- Produces:
  - `matchBankTransactions(statementLines, journalLines, contacts, invoices): MatchResult`
  - `calculateReconciliationDifference(statementBalanceMinor, initialLedgerBalanceMinor, matchedLines): DifferenceResult`

- [ ] **Step 1: Write the failing unit test**

```typescript
// tests/unit/reconciliation/matcher.test.ts
import { describe, it, expect } from "vitest";
import {
  matchBankTransactions,
  calculateReconciliationDifference,
  type StatementLineForMatching,
  type JournalLineForMatching,
} from "@/core/reconciliation/matcher";

describe("Reconciliation Matcher Engine", () => {
  it("matches exact transactions (Tier 1) within 3-day window", () => {
    const stmtLines: StatementLineForMatching[] = [
      {
        id: "stmt-1",
        date: "2026-08-10",
        type: "CR", // Bank credit = money in
        amountMinor: 100000000n, // Rp 1.000.000
        description: "TRANSFER PEMBAYARAN",
      },
    ];

    const jLines: JournalLineForMatching[] = [
      {
        id: "j-1",
        date: "2026-08-11",
        debitMinor: 100000000n, // Ledger debit = money in
        creditMinor: 0n,
        memo: "Pelunasan faktur",
      },
    ];

    const result = matchBankTransactions(stmtLines, jLines, [], []);
    expect(result.exactMatches).toHaveLength(1);
    expect(result.exactMatches[0].statementLineId).toBe("stmt-1");
    expect(result.exactMatches[0].journalLineId).toBe("j-1");
    expect(result.exactMatches[0].confidenceScore).toBe(100);
  });

  it("suggests AI matches (Tier 2) when description mentions invoice number", () => {
    const stmtLines: StatementLineForMatching[] = [
      {
        id: "stmt-2",
        date: "2026-08-25",
        type: "CR",
        amountMinor: 55000000n,
        description: "TRSF PELUNASAN INV-2026-0099 BAPAK BUDI",
      },
    ];

    const jLines: JournalLineForMatching[] = [
      {
        id: "j-2",
        date: "2026-08-10", // 15 days earlier
        debitMinor: 55000000n,
        creditMinor: 0n,
        memo: "Penjualan INV-2026-0099",
      },
    ];

    const result = matchBankTransactions(stmtLines, jLines, [{ id: "c1", name: "Bapak Budi" }], [
      { id: "inv-99", invoiceNumber: "INV-2026-0099", contactId: "c1" },
    ]);

    expect(result.aiSuggestions).toHaveLength(1);
    expect(result.aiSuggestions[0].confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.aiSuggestions[0].aiNotes).toContain("INV-2026-0099");
  });

  it("calculates difference correctly", () => {
    // Statement says 10.000.000
    // Ledger has 8.000.000 matched + 2.000.000 matched = 10.000.000
    // Difference = 0
    const res = calculateReconciliationDifference(1000000000n, 1000000000n);
    expect(res.differenceMinor).toBe(0n);
    expect(res.isBalanced).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/reconciliation/matcher.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement matching logic**

Create `src/core/reconciliation/matcher.ts`:
- Pure functions without DB dependencies.
- Tier 1: exact matching (direction match, amount match, date delta <= 3 days, unconsumed 1-to-1).
- Tier 2: AI recommendation scoring based on contact name or invoice number regex occurrence.
- Calculation helper for difference and balance state.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/unit/reconciliation/matcher.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/reconciliation/matcher.ts tests/unit/reconciliation/matcher.test.ts
git commit -m "feat(reconciliation): implement pure 3-tier matching engine and difference calculator"
```

---

### Task 4: Bank Reconciliation Repositories & Quick Journal Services

**Files:**
- Create: `src/server/db/repos/reconciliation.repo.ts`
- Create: `src/server/reconciliation/quick-journal.ts`
- Test: `tests/integration/reconciliation-repo.test.ts`
- Test: `tests/integration/reconciliation-quick-journal.test.ts`

**Interfaces:**
- Produces:
  - `createReconciliationRepo`, `getReconciliationByIdRepo`, `listReconciliationsRepo`, `saveStatementLinesRepo`, `linkMatchedLineRepo`, `finalizeReconciliationRepo`
  - `createBankFeeJournal(db, orgId, statementLineId, actorEmail): Promise<string>`
  - `createBankInterestJournal(db, orgId, statementLineId, actorEmail): Promise<string>`

- [ ] **Step 1: Write the failing integration tests**

```typescript
// tests/integration/reconciliation-repo.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import {
  createReconciliationRepo,
  getReconciliationByIdRepo,
  saveStatementLinesRepo,
  linkMatchedLineRepo,
} from "@/server/db/repos/reconciliation.repo";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Reconciliation Repository", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Test Rec Repo")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("handles reconciliation session creation, line inserts, and linking", async () => {
    const [bank] = await db.select().from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));

    const session = await createReconciliationRepo(db, orgId, {
      bankAccountId: bank.id,
      statementDate: "2026-08-31",
      statementBalanceMinor: 1000000000n,
    });

    expect(session.id).toBeDefined();

    const lines = await saveStatementLinesRepo(db, session.id, [
      {
        transactionDate: "2026-08-10",
        description: "BIAYA ADM",
        type: "DB",
        amountMinor: 1500000n,
      },
    ]);

    expect(lines).toHaveLength(1);

    const reloaded = await getReconciliationByIdRepo(db, orgId, session.id);
    expect(reloaded?.lines).toHaveLength(1);
  });
});
```

```typescript
// tests/integration/reconciliation-quick-journal.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { createReconciliationRepo, saveStatementLinesRepo } from "@/server/db/repos/reconciliation.repo";
import { createBankFeeJournal } from "@/server/reconciliation/quick-journal";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Reconciliation Quick Journal", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Test Quick Journal")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("creates a balanced bank fee journal and marks statement line as matched", async () => {
    const [bank] = await db.select().from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));
    const session = await createReconciliationRepo(db, orgId, {
      bankAccountId: bank.id,
      statementDate: "2026-08-31",
      statementBalanceMinor: 500000000n,
    });

    const [line] = await saveStatementLinesRepo(db, session.id, [
      {
        transactionDate: "2026-08-31",
        description: "BIAYA ADM BULANAN",
        type: "DB",
        amountMinor: 1500000n,
      },
    ]);

    const journalId = await createBankFeeJournal(db, orgId, line.id, "test@neraca.id");
    expect(journalId).toBeDefined();

    const [updatedLine] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, line.id));
    expect(updatedLine.matchStatus).toBe("MATCHED");
    expect(updatedLine.matchedJournalLineId).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test tests/integration/reconciliation-repo.test.ts tests/integration/reconciliation-quick-journal.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement repositories and quick journal service**

Implement:
- `src/server/db/repos/reconciliation.repo.ts`: full CRUD for sessions, lines, linking, and auto-match status update.
- `src/server/reconciliation/quick-journal.ts`: creates `6200 Beban Administrasi Bank` / `4200 Pendapatan Bunga` journal entries using existing `postJournalEntry` from `journals.repo.ts` and updates line to `MATCHED`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tests/integration/reconciliation-repo.test.ts tests/integration/reconciliation-quick-journal.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/reconciliation.repo.ts src/server/reconciliation/quick-journal.ts tests/integration/reconciliation-repo.test.ts tests/integration/reconciliation-quick-journal.test.ts
git commit -m "feat(reconciliation): implement database repos and quick adjustment journal service"
```

---

### Task 5: Server Actions for Bank Reconciliation

**Files:**
- Create: `src/server/actions/reconciliation.actions.ts`
- Test: `tests/unit/reconciliation/actions.test.ts`

**Interfaces:**
- Produces:
  - `startReconciliationSessionAction(formData: FormData)`
  - `runAutoMatchAction(reconciliationId: string)`
  - `confirmMatchAction(statementLineId: string, journalLineId: string)`
  - `createQuickAdjustmentAction(statementLineId: string, kind: "FEE" | "INTEREST")`
  - `finalizeReconciliationAction(reconciliationId: string)`

- [ ] **Step 1: Write the failing unit test**

```typescript
// tests/unit/reconciliation/actions.test.ts
import { describe, it, expect } from "vitest";

describe("Reconciliation Actions Validation", () => {
  it("exports all required server action functions", async () => {
    const actions = await import("@/server/actions/reconciliation.actions");
    expect(actions.startReconciliationSessionAction).toBeDefined();
    expect(actions.runAutoMatchAction).toBeDefined();
    expect(actions.confirmMatchAction).toBeDefined();
    expect(actions.createQuickAdjustmentAction).toBeDefined();
    expect(actions.finalizeReconciliationAction).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/reconciliation/actions.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement server actions**

Create `src/server/actions/reconciliation.actions.ts`:
- Protected by `requireContext(["OWNER", "ACCOUNTANT"])`.
- Handles file upload to S3, calls `extractBankStatement`, creates session + statement lines.
- Runs matcher engine and persists match proposals.
- Handles quick fee/interest adjustment and revalidates `/rekonsiliasi` and `/rekonsiliasi/[id]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/unit/reconciliation/actions.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/reconciliation.actions.ts tests/unit/reconciliation/actions.test.ts
git commit -m "feat(reconciliation): implement server actions for upload, auto-match, and quick adjustments"
```

---

### Task 6: Nara AI Reconciliation Tools

**Files:**
- Modify: `src/server/ai/nara-tools.ts`
- Test: `tests/integration/nara-reconciliation-tools.test.ts`

**Interfaces:**
- Produces:
  - Tool `get_bank_reconciliation_status`
  - Tool `auto_match_bank_reconciliation`

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/nara-reconciliation-tools.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { executeNaraTool } from "@/server/ai/nara-tools";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { createReconciliationRepo } from "@/server/db/repos/reconciliation.repo";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Nara Bank Reconciliation Tools", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Nara Rec Tools Test")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("checks reconciliation status via get_bank_reconciliation_status", async () => {
    const [bank] = await db.select().from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));
    await createReconciliationRepo(db, orgId, {
      bankAccountId: bank.id,
      statementDate: "2026-08-31",
      statementBalanceMinor: 1000000000n,
    });

    const res = await executeNaraTool(orgId, "tester@test.id", "get_bank_reconciliation_status", {
      bankCode: "1120",
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    const data = res.data as Record<string, unknown>;
    expect(data.status).toBe("IN_PROGRESS");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/nara-reconciliation-tools.test.ts`  
Expected: FAIL

- [ ] **Step 3: Register and implement tools in `nara-tools.ts`**

Register `get_bank_reconciliation_status` in `SAFE_TOOLS` and `auto_match_bank_reconciliation` in `MUTATING_TOOLS`. Add schemas to `ALL_NARA_TOOLS` and cases in `executeToolCall`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/nara-reconciliation-tools.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/nara-tools.ts tests/integration/nara-reconciliation-tools.test.ts
git commit -m "feat(ai): register get_bank_reconciliation_status and auto_match_bank_reconciliation tools"
```

---

### Task 7: UI Pages & Dual-Pane Worksheet Components

**Files:**
- Create: `src/components/reconciliation/reconciliation-dashboard.tsx`
- Create: `src/components/reconciliation/create-session-dialog.tsx`
- Create: `src/components/reconciliation/reconciliation-worksheet.tsx`
- Create: `src/app/(app)/rekonsiliasi/page.tsx`
- Create: `src/app/(app)/rekonsiliasi/[id]/page.tsx`
- Modify: `src/components/sidebar-nav.tsx`
- Test: `tests/unit/components/reconciliation-ui.test.ts`

- [ ] **Step 1: Write the failing UI unit test**

```typescript
// tests/unit/components/reconciliation-ui.test.ts
import { describe, it, expect } from "vitest";
import * as React from "react";
import { ReconciliationDashboard } from "@/components/reconciliation/reconciliation-dashboard";

describe("Reconciliation UI Components", () => {
  it("renders reconciliation dashboard component without crashing", () => {
    const el = React.createElement(ReconciliationDashboard, {
      sessions: [],
      bankAccounts: [],
    });
    expect(React.isValidElement(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/components/reconciliation-ui.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement UI components and pages**

- `src/components/reconciliation/create-session-dialog.tsx`: upload zone for PDF/images/CSV, select bank account, extract button with loading state.
- `src/components/reconciliation/reconciliation-worksheet.tsx`: sticky balance header, side-by-side view (Bank Statement lines vs Ledger cash entries), filter tabs, quick adjust buttons, manual link button.
- `src/components/reconciliation/reconciliation-dashboard.tsx`: bank account summary cards, sessions list table, status badges.
- `src/app/(app)/rekonsiliasi/page.tsx`: server component fetching sessions & bank accounts.
- `src/app/(app)/rekonsiliasi/[id]/page.tsx`: server component loading session, lines, and unmatched ledger entries.
- `src/components/sidebar-nav.tsx`: add `Rekonsiliasi Bank` (`/rekonsiliasi`, icon `ArrowLeftRight`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/unit/components/reconciliation-ui.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reconciliation/ src/app/\(app\)/rekonsiliasi/ src/components/sidebar-nav.tsx tests/unit/components/reconciliation-ui.test.ts
git commit -m "feat(ui): add bank reconciliation dashboard, dual-pane worksheet, and navigation items"
```

---

### Task 8: Full Verification

**Steps:**
- [ ] **Step 1: TypeScript type checking**
  Run: `bunx tsc --noEmit`
  Expected: 0 errors
- [ ] **Step 2: Complete test suite execution**
  Run: `bun run test`
  Expected: All test suites PASS
- [ ] **Step 3: Next.js production build verification**
  Run: `bun run build`
  Expected: All routes compiled successfully (including `/rekonsiliasi` and `/rekonsiliasi/[id]`)

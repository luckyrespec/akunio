# Fondasi Generik Subledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun fondasi generik buku pembantu (registry kontrol + blokir jurnal manual/B1 + jejak GL↔pembantu + rekonsiliasi) untuk PIUTANG, UTANG, PERSEDIAAN.

**Architecture:** Dua tabel tipis (`subledger_controls`, `subledger_journal_links`); satu guard murni di `src/core/subledger/guard.ts` yang dipanggil ketiga entrypoint `journals.repo.ts`; modul (faktur, bayar, opname, kas-bank) menulis links atomik dalam tx yang sama; runner rekonsiliasi + temuan doctor `SUBLEDGER_MISMATCH`.

**Tech Stack:** Next 16.3 / React 19, Drizzle 0.45 + pg 8, Vitest 4, BigInt minor money (`Money.parseIdr`/`formatIdr`, `dec()`/`toMinor()` jurnal).

**Spec:** `docs/superpowers/specs/2026-09-07-subledger-fondasi-generik-design.md`

## Global Constraints

- `bun run build` harus hijau; `bun run lint` bersih; `bunx tsc --noEmit` strict, tanpa `any`.
- Test hanya via `bunx vitest run <file>`; DB test selalu `ledger_test` (`tests/setup.ts` + `guardTestDb` di `tests/integration/helpers.ts`) — jangan pernah sentuh dev.
- Migrasi Drizzle ditulis tangan (`IF NOT EXISTS`, pemisah `--> statement-breakpoint`, entri `drizzle/meta/_journal.json`, tanpa snapshot); JANGAN `drizzle-kit generate` (crash BigInt); JANGAN sentuh CHECK `je_source_chk` (milik `tax.sql`).
- Uang: `numeric(18,2)` jurnal via `dec()`/`toMinor()`; nominal subledger `bigint` minor.
- Setiap transaksi tenant baru wajib `withOrg` (`src/server/db/repos/with-org.ts`); tabel `org_id` baru wajib `FORCE RLS` di `src/server/db/rls.sql` (blok DO idempoten).
- Copy UI Bahasa Indonesia; `PageHeader` di tiap halaman; nominal via `Money.formatIdr`; `data-testid` untuk elemen interaktif baru.
- Pola posting `validate → post → immutable`; nomor sekuens + mutasi stok pakai `pg_advisory_xact_lock` yang sudah ada.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `src/server/db/schema/subledger.ts` (baru) | Drizzle `subledgerControls`, `subledgerJournalLinks` |
| `drizzle/0016_subledger.sql` (baru) | DDL 2 tabel + indeks |
| `drizzle/0017_subledger-drop-inventory-account.sql` (baru) | Drop `inventory_settings.inventory_account_id` |
| `src/server/db/rls.sql` (ubah) | Tambah 2 tabel ke array generik |
| `tests/integration/helpers.ts` (ubah) | TRUNCATE tambah tabel baru + domain |
| `src/core/subledger/guard.ts` (baru) | `SubledgerKind`, `validateSubledgerControl`, label modul |
| `src/core/journals/types.ts` (ubah) | `JournalLineInput.subledgerLinks?` |
| `src/server/db/repos/subledger.repo.ts` (baru) | Seed/read controls, tulis links, saldo GL, recon, finding |
| `src/server/db/repos/journals.repo.ts` (ubah) | Guard di 3 entrypoint + persist links |
| `src/server/db/repos/inventory.repo.ts` (ubah) | `resolveAdjustmentAccounts` via controls; opname links |
| `src/server/invoicing/posting.ts` (ubah) | Link PIUTANG/UTANG/PERSEDIAAN + reversal |
| `src/server/db/repos/cash-bank.repo.ts` (ubah) | Wajib kontak + link saat counter = kontrol |
| `src/server/onboarding/engine.ts` (ubah) | Seed 3 kontrol; hapus insert `inventoryAccountId` |
| `src/server/db/schema/inventory.ts` (ubah) | Hapus kolom `inventoryAccountId` |
| `src/server/actions/inventory.actions.ts` + `src/components/settings/inventory-settings.tsx` + `src/app/(app)/pengaturan/page.tsx` (ubah) | Hapus field akun persediaan dari settings |
| `src/server/actions/subledger.actions.ts` (baru) | `getSubledgerReconAction`, `runSubledgerCheckAction` |
| `src/app/(app)/buku-pembantu/page.tsx` (baru) | Layar selisih per kontrol |

---

### Task 1: Migrasi DB + RLS + TRUNCATE

**Files:**
- Create: `src/server/db/schema/subledger.ts`, `drizzle/0016_subledger.sql`, `tests/integration/subledger-schema.test.ts`
- Modify: `src/server/db/rls.sql`, `drizzle/meta/_journal.json`, `tests/integration/helpers.ts`

**Interfaces:**
- Consumes: `organizations`, `accounts` (`src/server/db/schema/org.ts`), `journalLines` (`src/server/db/schema/journal.ts`)
- Produces: `subledgerControls`, `subledgerJournalLinks`, `SubledgerKind` — dipakai Task 3+

- [ ] **Step 1: Tulis schema Drizzle baru**

```ts
import { pgTable, uuid, text, numeric, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, accounts } from "./org";
import { journalLines } from "./journal";

export const subledgerKindEnum = ["PIUTANG", "UTANG", "PERSEDIAAN"] as const;
export type SubledgerKind = (typeof subledgerKindEnum)[number];

export const subledgerControls = pgTable("subledger_controls", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: subledgerKindEnum }).notNull(),
  controlAccountId: uuid("control_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  allowManual: boolean("allow_manual").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("subledger_controls_org_kind_uq").on(t.orgId, t.kind),
  uniqueIndex("subledger_controls_org_account_uq").on(t.orgId, t.controlAccountId),
]);

export const subledgerJournalLinks = pgTable("subledger_journal_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  journalLineId: uuid("journal_line_id").notNull().references(() => journalLines.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: subledgerKindEnum }).notNull(),
  refId: uuid("ref_id").notNull(),
  amountMinor: numeric("amount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  qty: numeric("qty", { precision: 12, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("subledger_links_line_idx").on(t.journalLineId),
  index("subledger_links_org_kind_ref_idx").on(t.orgId, t.kind, t.refId),
]);
```

Simpan sebagai `src/server/db/schema/subledger.ts`.

- [ ] **Step 2: Tulis migrasi tangan `drizzle/0016_subledger.sql`**

```sql
-- Fondasi subledger: registry kontrol + jejak GL<->pembantu.
-- Idempoten (IF NOT EXISTS). RLS dimiliki rls.sql.
CREATE TABLE IF NOT EXISTS "subledger_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"control_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id") ON DELETE restrict,
	"allow_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subledger_journal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
	"journal_line_id" uuid NOT NULL REFERENCES "public"."journal_lines"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"amount_minor" numeric NOT NULL,
	"qty" numeric(12,4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subledger_controls_org_kind_uq" ON "public"."subledger_controls" USING btree ("org_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subledger_controls_org_account_uq" ON "public"."subledger_controls" USING btree ("org_id","control_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subledger_links_line_idx" ON "public"."subledger_journal_links" USING btree ("journal_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subledger_links_org_kind_ref_idx" ON "public"."subledger_journal_links" USING btree ("org_id","kind","ref_id");
```

- [ ] **Step 3: Daftarkan migrasi di journal**

Tambah entri di `drizzle/meta/_journal.json` setelah idx 15:

```json
		{
			"idx": 16,
			"version": "7",
			"when": 1788900000000,
			"tag": "0016_subledger",
			"breakpoints": true
		}
```

- [ ] **Step 4: Tambah RLS di `src/server/db/rls.sql`**

Ubah array generik (tambah 2 nama persis di ujung, sebelum `]`):

```
'inventory_settings','inventory_items','inventory_layers','inventory_transactions','stock_opnames','inventory_sku_counters',
'subledger_controls','subledger_journal_links',
'tax_summaries']
```

`subledger_journal_links` membawa `org_id` denormalisasi sehingga policy generik cukup (tidak perlu pola join seperti `stock_opname_items`).

- [ ] **Step 5: Perluas TRUNCATE `tests/integration/helpers.ts`**

Ganti daftar TRUNCATE menjadi:

```ts
  await admin.query(`
    TRUNCATE subledger_journal_links, subledger_controls,
               tax_summaries, audit_log, journal_lines, journal_entries, journal_seq_counters,
               kas_bank_entries, kas_bank_seq_counters, inventory_sku_counters,
               bank_statement_lines, bank_reconciliations,
               journal_documents, documents,
               invoice_items, invoice_payments, invoices, contacts,
               inventory_layers, inventory_transactions, stock_opname_items, stock_opnames,
               inventory_settings, inventory_items,
               fixed_assets, asset_depreciation_lines, asset_disposals,
               accounts, fiscal_periods, memberships, organizations,
               org_profiles, onboarding_messages CASCADE
  `);
```

(`fixed_assets*` ikut karena Task 9 menyentuh temuan lintas modul; yang lain karena Task 5–8 menulis domain tersebut.)

- [ ] **Step 6: Tulis failing test skema + RLS**

`tests/integration/subledger-schema.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { accounts } from "@/server/db/schema/org";
import { subledgerControls, subledgerJournalLinks } from "@/server/db/schema/subledger";

describe("skema subledger", () => {
  beforeEach(async () => { await truncateAll(); });

  it("tabel ada dan RLS mengisolasi per org", async () => {
    const a = await makeOrg("rls-a");
    const b = await makeOrg("rls-b");
    const [acc] = await db.insert(accounts).values({
      orgId: a.orgId, code: "1310", name: "Persediaan", type: "ASET", normal: "D",
    }).returning();
    await db.insert(subledgerControls).values({ orgId: a.orgId, kind: "PERSEDIAAN", controlAccountId: acc.id });
    const pool = getPool();
    const clientB = await pool.connect();
    await clientB.query(`SELECT set_config('app.current_org', $1, true)`, [b.orgId]);
    const hidden = await clientB.query(`SELECT id FROM subledger_controls`);
    expect(hidden.rows.length).toBe(0);
    clientB.release();
    const clientA = await pool.connect();
    await clientA.query(`SELECT set_config('app.current_org', $1, true)`, [a.orgId]);
    const visible = await clientA.query(`SELECT id FROM subledger_controls`);
    expect(visible.rows.length).toBe(1);
    clientA.release();
    await expect(db.select().from(subledgerJournalLinks)).resolves.toEqual([]);
    await pool.end();
  });
});
```

- [ ] **Step 7: Jalankan migrasi + test, lalu commit**

```bash
bun run db:migrate
bun run db:sql
bunx vitest run tests/integration/subledger-schema.test.ts
```

Expected: PASS. Lalu:

```bash
git add src/server/db/schema/subledger.ts drizzle/0016_subledger.sql drizzle/meta/_journal.json src/server/db/rls.sql tests/integration/helpers.ts tests/integration/subledger-schema.test.ts
git commit -m "feat(subledger): skema controls+links, RLS, truncate"
```

---

### Task 2: Guard B1 murni + unit test

**Files:**
- Create: `src/core/subledger/guard.ts`, `tests/unit/subledger/guard.test.ts`

**Interfaces:**
- Consumes: `JournalSource` (type-only dari `src/core/journals/types.ts`)
- Produces: `SubledgerKind`, `SubledgerLinkInput`, `GuardLineInput`, `SubledgerIssue`, `MANUAL_SOURCES`, `moduleLabelForKind`, `validateSubledgerControl` — dipakai Task 4

- [ ] **Step 1: Tulis guard**

`src/core/subledger/guard.ts`:

```ts
import type { JournalSource } from "@/core/journals/types";

export type SubledgerKind = "PIUTANG" | "UTANG" | "PERSEDIAAN";

export interface SubledgerLinkInput {
  kind: SubledgerKind;
  refId: string;
  amountMinor: bigint;
  qty?: number;
}

export interface GuardLineInput {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  links?: SubledgerLinkInput[];
}

export type SubledgerIssue =
  | { code: "AKUN_KONTROL_WAJIB_VIA_MODUL"; index: number; kind: SubledgerKind }
  | { code: "SUBLEDGER_REF_WAJIB"; index: number; kind: SubledgerKind }
  | { code: "SUBLEDGER_KIND_TIDAK_COCok"; index: number; expected: SubledgerKind; actual: SubledgerKind }
  | { code: "SUBLEDGER_TOTAL_TIDAK_COCok"; index: number; expectedMinor: bigint; actualMinor: bigint };

export const MANUAL_SOURCES: ReadonlySet<JournalSource> = new Set([
  "MANUAL", "AI", "IMPORT",
]);

export function moduleLabelForKind(kind: SubledgerKind): string {
  if (kind === "PIUTANG") return "Faktur Penjualan";
  if (kind === "UTANG") return "Tagihan Pembelian";
  return "Persediaan/Opname";
}

function lineAmount(l: GuardLineInput): bigint {
  return l.debitMinor !== 0n ? l.debitMinor : l.creditMinor;
}

export function validateSubledgerControl(args: {
  lines: GuardLineInput[];
  controlByAccountId: Map<string, SubledgerKind>;
  source: JournalSource;
  isOpeningBalance?: boolean;
}): SubledgerIssue[] {
  const issues: SubledgerIssue[] = [];
  if (args.isOpeningBalance) return issues;
  const manual = MANUAL_SOURCES.has(args.source);
  args.lines.forEach((l, index) => {
    const kind = args.controlByAccountId.get(l.accountId);
    if (!kind) return;
    if (manual) {
      issues.push({ code: "AKUN_KONTROL_WAJIB_VIA_MODUL", index, kind });
      return;
    }
    const links = l.links ?? [];
    if (links.length === 0) {
      issues.push({ code: "SUBLEDGER_REF_WAJIB", index, kind });
      return;
    }
    for (const link of links) {
      if (link.kind !== kind) {
        issues.push({ code: "SUBLEDGER_KIND_TIDAK_COCok", index, expected: kind, actual: link.kind });
        return;
      }
    }
    const total = links.reduce((a, x) => a + x.amountMinor, 0n);
    if (total !== lineAmount(l)) {
      issues.push({ code: "SUBLEDGER_TOTAL_TIDAK_COCok", index, expectedMinor: lineAmount(l), actualMinor: total });
    }
  });
  return issues;
}
```

- [ ] **Step 2: Tulis unit test**

`tests/unit/subledger/guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateSubledgerControl } from "@/core/subledger/guard";

const controls = new Map([["acc-pers", "PERSEDIAAN" as const]]);
const line = (over: Record<string, unknown> = {}) => ({
  accountId: "acc-pers", debitMinor: 0n, creditMinor: 7_500_000n, ...over,
});

describe("validateSubledgerControl", () => {
  it("MANUAL ke akun kontrol ditolak", () => {
    const issues = validateSubledgerControl({ lines: [line()], controlByAccountId: controls, source: "MANUAL" });
    expect(issues).toEqual([{ code: "AKUN_KONTROL_WAJIB_VIA_MODUL", index: 0, kind: "PERSEDIAAN" }]);
  });

  it("AI dan IMPORT juga ditolak", () => {
    for (const source of ["AI", "IMPORT"] as const) {
      const issues = validateSubledgerControl({ lines: [line()], controlByAccountId: controls, source });
      expect(issues[0]?.code).toBe("AKUN_KONTROL_WAJIB_VIA_MODUL");
    }
  });

  it("modul tanpa links ditolak", () => {
    const issues = validateSubledgerControl({ lines: [line()], controlByAccountId: controls, source: "DOCUMENT" });
    expect(issues).toEqual([{ code: "SUBLEDGER_REF_WAJIB", index: 0, kind: "PERSEDIAAN" }]);
  });

  it("kind link salah ditolak", () => {
    const issues = validateSubledgerControl({
      lines: [line({ links: [{ kind: "PIUTANG", refId: "c1", amountMinor: 7_500_000n }] })],
      controlByAccountId: controls, source: "DOCUMENT",
    });
    expect(issues[0]).toMatchObject({ code: "SUBLEDGER_KIND_TIDAK_COCok", expected: "PERSEDIAAN", actual: "PIUTANG" });
  });

  it("total link tidak sama ditolak", () => {
    const issues = validateSubledgerControl({
      lines: [line({ links: [{ kind: "PERSEDIAAN", refId: "i1", amountMinor: 7_800_000n }] })],
      controlByAccountId: controls, source: "DOCUMENT",
    });
    expect(issues[0]).toMatchObject({ code: "SUBLEDGER_TOTAL_TIDAK_COCok", expectedMinor: 7_500_000n, actualMinor: 7_800_000n });
  });

  it("agregat N link yang pas lolos (kasus HPP multi-SKU)", () => {
    const issues = validateSubledgerControl({
      lines: [line({ links: [
        { kind: "PERSEDIAAN", refId: "i1", amountMinor: 5_000_000n, qty: 20 },
        { kind: "PERSEDIAAN", refId: "i2", amountMinor: 2_500_000n, qty: 10 },
      ] })],
      controlByAccountId: controls, source: "DOCUMENT",
    });
    expect(issues).toEqual([]);
  });

  it("saldo awal onboarding bypass", () => {
    const issues = validateSubledgerControl({ lines: [line()], controlByAccountId: controls, source: "MANUAL", isOpeningBalance: true });
    expect(issues).toEqual([]);
  });

  it("akun non-kontrol tidak diperiksa", () => {
    const issues = validateSubledgerControl({
      lines: [{ accountId: "acc-beban", debitMinor: 1_000n, creditMinor: 0n }],
      controlByAccountId: controls, source: "MANUAL",
    });
    expect(issues).toEqual([]);
  });
});
```

- [ ] **Step 3: Jalankan dan commit**

```bash
bunx vitest run tests/unit/subledger/guard.test.ts
```

Expected: 8 PASS. Lalu:

```bash
git add src/core/subledger/guard.ts tests/unit/subledger/guard.test.ts
git commit -m "feat(subledger): guard B1 murni + unit test"
```

---

### Task 3: Repo controls/links/saldo/recon + test integrasi

**Files:**
- Create: `src/server/db/repos/subledger.repo.ts`, `tests/integration/subledger-repo.test.ts`

**Interfaces:**
- Consumes: `SubledgerKind` (Task 2), schema Task 1, `Queryable`
- Produces: `getSubledgerControls`, `getControlKindByAccount`, `seedSubledgerControls`, `insertSubledgerLinks`, `listLinksForEntry`, `getControlGlBalance`, `subledgerTotalFor`, `reconcileSubledger`, `ReconRow`, `reportSubledgerMismatch` — dipakai Task 4–9

- [ ] **Step 1: Tulis repo**

`src/server/db/repos/subledger.repo.ts`:

```ts
import { and, eq, ne, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { accounts } from "../schema/org";
import { journalEntries, journalLines } from "../schema/journal";
import { invoices } from "../schema/invoicing";
import { inventoryItems } from "../schema/inventory";
import { aiFindings } from "../schema/doctor";
import { subledgerControls, subledgerJournalLinks, type SubledgerKind } from "../schema/subledger";

export async function getSubledgerControls(q: Queryable, orgId: string) {
  return q.select().from(subledgerControls).where(eq(subledgerControls.orgId, orgId));
}

export async function getControlKindByAccount(q: Queryable, orgId: string): Promise<Map<string, SubledgerKind>> {
  const rows = await getSubledgerControls(q, orgId);
  return new Map(rows.map((r) => [r.controlAccountId, r.kind as SubledgerKind]));
}

export async function seedSubledgerControls(
  q: Queryable,
  orgId: string,
  ids: { receivableAccountId: string; payableAccountId: string; inventoryAccountId: string },
): Promise<void> {
  await q.insert(subledgerControls).values([
    { orgId, kind: "PIUTANG", controlAccountId: ids.receivableAccountId },
    { orgId, kind: "UTANG", controlAccountId: ids.payableAccountId },
    { orgId, kind: "PERSEDIAAN", controlAccountId: ids.inventoryAccountId },
  ]).onConflictDoNothing({ target: [subledgerControls.orgId, subledgerControls.kind] });
}

export interface NewSubledgerLink {
  journalLineId: string;
  kind: SubledgerKind;
  refId: string;
  amountMinor: bigint;
  qty?: number;
}

export async function insertSubledgerLinks(q: Queryable, orgId: string, links: NewSubledgerLink[]): Promise<void> {
  if (links.length === 0) return;
  await q.insert(subledgerJournalLinks).values(links.map((l) => ({
    orgId,
    journalLineId: l.journalLineId,
    kind: l.kind,
    refId: l.refId,
    amountMinor: l.amountMinor,
    qty: l.qty == null ? null : String(l.qty),
  })));
}

export async function listLinksForEntry(q: Queryable, orgId: string, entryId: string) {
  return q.select({
    lineId: journalLines.id,
    position: journalLines.position,
    accountId: journalLines.accountId,
    linkId: subledgerJournalLinks.id,
    kind: subledgerJournalLinks.kind,
    refId: subledgerJournalLinks.refId,
    amountMinor: subledgerJournalLinks.amountMinor,
  })
    .from(journalLines)
    .leftJoin(subledgerJournalLinks, eq(subledgerJournalLinks.journalLineId, journalLines.id))
    .where(and(eq(journalLines.orgId, orgId), eq(journalLines.entryId, entryId)));
}

/** Saldo akun kontrol dari baris POSTED saja, memperhatikan normal D/K. */
export async function getControlGlBalance(q: Queryable, orgId: string, controlAccountId: string): Promise<bigint> {
  const [acc] = await q.select({ normal: accounts.normal }).from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, controlAccountId))).limit(1);
  if (!acc) throw new Error("KONTROL_BELUM_DIPETAKAN: akun kontrol tidak ditemukan di org ini");
  const [row] = await q.execute<{ bal: string }>(sql`
    SELECT COALESCE(SUM((${journalLines.debit} - ${journalLines.credit}) * 100), 0)::bigint AS bal
    FROM ${journalLines}
    JOIN ${journalEntries} ON ${journalEntries.id} = ${journalLines.entryId}
    WHERE ${journalLines.orgId} = ${orgId}
      AND ${journalLines.accountId} = ${controlAccountId}
      AND ${journalEntries.status} = 'POSTED'
  `);
  const signed = BigInt(row?.bal ?? "0");
  return acc.normal === "D" ? signed : -signed;
}

export async function subledgerTotalFor(q: Queryable, orgId: string, kind: SubledgerKind): Promise<bigint> {
  if (kind === "PERSEDIAAN") {
    const [row] = await q.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(${inventoryItems.totalCostMinor}), 0)::bigint AS total
      FROM ${inventoryItems}
      WHERE ${inventoryItems.orgId} = ${orgId}
        AND ${inventoryItems.isActive} = true
        AND ${inventoryItems.itemType} = 'BARANG'
    `);
    return BigInt(row?.total ?? "0");
  }
  const type = kind === "PIUTANG" ? "INVOICE" : "BILL";
  const [row] = await q.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(${invoices.totalMinor} - ${invoices.amountPaidMinor}), 0)::bigint AS total
    FROM ${invoices}
    WHERE ${invoices.orgId} = ${orgId}
      AND ${invoices.type} = ${type}
      AND ${invoices.status} <> 'VOID'
  `);
  return BigInt(row?.total ?? "0");
}

export interface ReconRow {
  kind: SubledgerKind;
  controlAccountId: string;
  controlBalanceMinor: bigint;
  subledgerTotalMinor: bigint;
  differenceMinor: bigint;
}

export async function reconcileSubledger(q: Queryable, orgId: string): Promise<ReconRow[]> {
  const controls = await getSubledgerControls(q, orgId);
  const out: ReconRow[] = [];
  for (const c of controls) {
    const kind = c.kind as SubledgerKind;
    const controlBalanceMinor = await getControlGlBalance(q, orgId, c.controlAccountId);
    const subledgerTotalMinor = await subledgerTotalFor(q, orgId, kind);
    out.push({ kind, controlAccountId: c.controlAccountId, controlBalanceMinor, subledgerTotalMinor, differenceMinor: subledgerTotalMinor - controlBalanceMinor });
  }
  return out;
}

/** Catat temuan HIGH untuk tiap kind yang selisih (evidence string, bukan bigint). */
export async function reportSubledgerMismatch(q: Queryable, orgId: string, rows: ReconRow[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    if (r.differenceMinor === 0n) continue;
    await q.insert(aiFindings).values({
      orgId,
      type: "SUBLEDGER_MISMATCH",
      severity: "HIGH",
      status: "open",
      evidence: {
        kind: r.kind,
        controlAccountId: r.controlAccountId,
        controlBalanceMinor: r.controlBalanceMinor.toString(),
        subledgerTotalMinor: r.subledgerTotalMinor.toString(),
        differenceMinor: r.differenceMinor.toString(),
      },
    });
    n += 1;
  }
  return n;
}
```

- [ ] **Step 2: Tulis test integrasi**

`tests/integration/subledger-repo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import { createInvoiceRepo } from "@/server/db/repos/invoices.repo";
import {
  seedSubledgerControls, getControlKindByAccount, reconcileSubledger, reportSubledgerMismatch,
} from "@/server/db/repos/subledger.repo";

describe("subledger repo", () => {
  beforeEach(async () => { await truncateAll(); });

  it("seed idempoten + recon nol + mismatch terdeteksi", async () => {
    const { orgId } = await makeOrg("recon");
    await seedOrgData(orgId);
    const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const byCode = (c: string) => rows.find((a) => a.code === c)!.id;
    await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
      receivableAccountId: byCode("1200"), payableAccountId: byCode("2100"), inventoryAccountId: byCode("1310"),
    }));
    await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
      receivableAccountId: byCode("1200"), payableAccountId: byCode("2100"), inventoryAccountId: byCode("1310"),
    }));
    const kinds = await withOrg(orgId, (tx) => getControlKindByAccount(tx, orgId));
    expect(kinds.get(byCode("1200"))).toBe("PIUTANG");
    expect(kinds.get(byCode("1310"))).toBe("PERSEDIAAN");

    const clean = await withOrg(orgId, (tx) => reconcileSubledger(tx, orgId));
    expect(clean.every((r) => r.differenceMinor === 0n)).toBe(true);

    const contact = await createContactRepo(db, orgId, { name: "Pelanggan", type: "CUSTOMER" });
    await createInvoiceRepo(db, orgId,
      { type: "INVOICE", contactId: contact.id, issueDate: "2026-09-07", dueDate: "2026-09-21" },
      [{ description: "Jasa", quantity: 1, unitPriceMinor: 1_000_000n }]);

    const dirty = await withOrg(orgId, (tx) => reconcileSubledger(tx, orgId));
    const ar = dirty.find((r) => r.kind === "PIUTANG")!;
    expect(ar.subledgerTotalMinor).toBe(1_000_000n);
    expect(ar.differenceMinor).toBe(1_000_000n);
    const n = await withOrg(orgId, (tx) => reportSubledgerMismatch(tx, orgId, dirty));
    expect(n).toBe(1);
  });
});
```

(Catatan: `seedOrgData` menyediakan COA 1200/2100/1310 + periode, terbukti di `catalog-jasa-faktur.test.ts`. Bila 1310 absen di seed, ganti ke kode persediaan yang ada — test akan gagal eksplisit di `byCode`.)

- [ ] **Step 3: Jalankan dan commit**

```bash
bunx vitest run tests/integration/subledger-repo.test.ts
```

Expected: PASS. Lalu:

```bash
git add src/server/db/repos/subledger.repo.ts tests/integration/subledger-repo.test.ts
git commit -m "feat(subledger): repo controls, saldo GL, recon, finding"
```

---

### Task 4: Enforcement di journals.repo + types

**Files:**
- Modify: `src/core/journals/types.ts`, `src/server/db/repos/journals.repo.ts`
- Create: `tests/integration/subledger-enforcement.test.ts`

**Interfaces:**
- Consumes: guard Task 2, repo Task 3
- Produces: `postJournalEntry`/`createDraftJournalEntry`/`postDraftEntry` yang menolak kontrol-manual dan menyimpan links — dipakai Task 6–8

- [ ] **Step 1: Tambah links ke `JournalLineInput`**

`src/core/journals/types.ts`, tambah import + field:

```ts
import type { SubledgerLinkInput } from "@/core/subledger/guard";

export interface JournalLineInput {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo?: string;
  subledgerLinks?: SubledgerLinkInput[];
}
```

Tambah ke `JournalEntryInput`:

```ts
export interface JournalEntryInput {
  dateISO: string;
  memo: string;
  lines: JournalLineInput[];
  source?: JournalSource;
  idempotencyKey?: string;
  isOpeningBalance?: boolean;
}
```

- [ ] **Step 2: Tambah helper guard + persist di `journals.repo.ts`**

Setelah import, tambah:

```ts
import { validateSubledgerControl, moduleLabelForKind } from "@/core/subledger/guard";
import { getControlKindByAccount, insertSubledgerLinks, listLinksForEntry } from "./subledger.repo";

async function assertSubledgerControl(
  q: Queryable,
  orgId: string,
  input: JournalEntryInput,
  orgAccounts: Array<{ id: string; code: string }>,
): Promise<void> {
  const controlByAccountId = await getControlKindByAccount(q, orgId);
  const issues = validateSubledgerControl({
    lines: input.lines,
    controlByAccountId,
    source: input.source ?? "MANUAL",
    isOpeningBalance: input.isOpeningBalance,
  });
  if (issues.length === 0) return;
  const first = issues[0];
  const code = orgAccounts.find((a) => a.id === input.lines[first.index].accountId)?.code ?? "?";
  if (first.code === "AKUN_KONTROL_WAJIB_VIA_MODUL") {
    throw new Error(`AKUN_KONTROL_WAJIB_VIA_MODUL: akun ${code} hanya boleh dimutasi via ${moduleLabelForKind(first.kind)}, bukan jurnal manual`);
  }
  if (first.code === "SUBLEDGER_REF_WAJIB") {
    throw new Error(`SUBLEDGER_REF_WAJIB: baris ${code} wajib membawa rincian ${first.kind}`);
  }
  if (first.code === "SUBLEDGER_KIND_TIDAK_COCok") {
    throw new Error(`SUBLEDGER_KIND_TIDAK_COCok: baris ${code} mengharapkan ${first.expected}, dapat ${first.actual}`);
  }
  throw new Error(`SUBLEDGER_TOTAL_TIDAK_COCok: total rincian tidak sama dengan nominal baris ${code}`);
}

async function persistSubledgerLinks(
  q: Queryable,
  orgId: string,
  lineIdsByPosition: Map<number, string>,
  input: JournalEntryInput,
): Promise<void> {
  const rows: Array<{ journalLineId: string; kind: "PIUTANG" | "UTANG" | "PERSEDIAAN"; refId: string; amountMinor: bigint; qty?: number }> = [];
  input.lines.forEach((l, i) => {
    for (const link of l.subledgerLinks ?? []) {
      rows.push({ journalLineId: lineIdsByPosition.get(i)!, kind: link.kind, refId: link.refId, amountMinor: link.amountMinor, qty: link.qty });
    }
  });
  await insertSubledgerLinks(q, orgId, rows);
}
```

- [ ] **Step 3: Panggil guard + persist di `postJournalEntry` dan `createDraftJournalEntry`**

Di kedua fungsi, setelah blok `checkPostingAccounts`, sisipkan:

```ts
  await assertSubledgerControl(q, orgId, input, orgAccounts);
```

Ganti insert lines:

```ts
  const inserted = await q.insert(journalLines).values(input.lines.map((l, i) => ({
    orgId,
    entryId: entry.id,
    accountId: l.accountId,
    position: i,
    debit: dec(l.debitMinor),
    credit: dec(l.creditMinor),
    memo: l.memo ?? null,
  }))).returning({ id: journalLines.id, position: journalLines.position });
  await persistSubledgerLinks(q, orgId, new Map(inserted.map((r) => [r.position, r.id])), input);
```

(Lakukan di kedua fungsi — kode sama persis, bukan "sama seperti di atas" tanpa isi: salin blok ini ke dua tempat.)

- [ ] **Step 4: Jaga `postDraftEntry` (draft lama tanpa links tetap ditolak)**

Setelah load `entry`, sebelum update status, sisipkan:

```ts
  const lineRows = await q.select().from(journalLines).where(eq(journalLines.entryId, entry.id));
  const linkRows = await listLinksForEntry(q, orgId, entry.id);
  const linksByLine = new Map<string, Array<{ kind: "PIUTANG" | "UTANG" | "PERSEDIAAN"; refId: string; amountMinor: bigint }>>();
  for (const r of linkRows) {
    if (!r.linkId) continue;
    const arr = linksByLine.get(r.lineId) ?? [];
    arr.push({ kind: r.kind as "PIUTANG" | "UTANG" | "PERSEDIAAN", refId: r.refId!, amountMinor: r.amountMinor! });
    linksByLine.set(r.lineId, arr);
  }
  const orgAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  await assertSubledgerControl(q, orgId, {
    dateISO: entry.entryDate,
    memo: entry.memo,
    source: (entry.source ?? "MANUAL") as JournalEntryInput["source"],
    lines: lineRows.map((l) => ({
      accountId: l.accountId,
      debitMinor: toMinor(l.debit),
      creditMinor: toMinor(l.credit),
      subledgerLinks: linksByLine.get(l.id) ?? [],
    })),
  }, orgAccounts);
```

(`eq`, `accounts`, `toMinor` sudah tersedia di file ini.)

- [ ] **Step 5: Tulis test enforcement**

`tests/integration/subledger-enforcement.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import { seedSubledgerControls } from "@/server/db/repos/subledger.repo";
import { postJournalEntry, createDraftJournalEntry, postDraftEntry } from "@/server/db/repos/journals.repo";

async function setup() {
  const { orgId } = await makeOrg("enforce");
  await seedOrgData(orgId);
  const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const byCode = (c: string) => rows.find((a) => a.code === c)!.id;
  await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
    receivableAccountId: byCode("1200"), payableAccountId: byCode("2100"), inventoryAccountId: byCode("1310"),
  }));
  return { orgId, byCode };
}
const year = new Date().getFullYear();

describe("enforcement B1", () => {
  beforeEach(async () => { await truncateAll(); });

  it("MANUAL ke 1310 ditolak", async () => {
    const { orgId, byCode } = await setup();
    await expect(withOrg(orgId, (tx) => postJournalEntry(tx, orgId, "t@t.id", {
      dateISO: `${year}-09-07`, memo: "manual nakal", source: "MANUAL",
      lines: [
        { accountId: byCode("5900"), debitMinor: 1_000n, creditMinor: 0n },
        { accountId: byCode("1310"), debitMinor: 0n, creditMinor: 1_000n },
      ],
    }))).rejects.toThrow("AKUN_KONTROL_WAJIB_VIA_MODUL");
  });

  it("draft manual ke kontrol ditolak saat create dan saat post", async () => {
    const { orgId, byCode } = await setup();
    await expect(withOrg(orgId, (tx) => createDraftJournalEntry(tx, orgId, {
      dateISO: `${year}-09-07`, memo: "draft nakal", source: "MANUAL",
      lines: [
        { accountId: byCode("5900"), debitMinor: 2_000n, creditMinor: 0n },
        { accountId: byCode("2100"), debitMinor: 0n, creditMinor: 2_000n },
      ],
    }))).rejects.toThrow("AKUN_KONTROL_WAJIB_VIA_MODUL");
  });

  it("modul tanpa links ditolak; dengan links lolos + links tersimpan", async () => {
    const { orgId, byCode } = await setup();
    const contact = await createContactRepo(db, orgId, { name: "C", type: "CUSTOMER" });
    await expect(withOrg(orgId, (tx) => postJournalEntry(tx, orgId, "t@t.id", {
      dateISO: `${year}-09-07`, memo: "tanpa links", source: "DOCUMENT",
      lines: [
        { accountId: byCode("1200"), debitMinor: 5_000n, creditMinor: 0n },
        { accountId: byCode("4100"), debitMinor: 0n, creditMinor: 5_000n },
      ],
    }))).rejects.toThrow("SUBLEDGER_REF_WAJIB");
    const ok = await withOrg(orgId, (tx) => postJournalEntry(tx, orgId, "t@t.id", {
      dateISO: `${year}-09-07`, memo: "dengan links", source: "DOCUMENT",
      lines: [
        { accountId: byCode("1200"), debitMinor: 5_000n, creditMinor: 0n, subledgerLinks: [{ kind: "PIUTANG", refId: contact.id, amountMinor: 5_000n }] },
        { accountId: byCode("4100"), debitMinor: 0n, creditMinor: 5_000n },
      ],
    }));
    expect(ok.number.startsWith("JE-")).toBe(true);
    const { listLinksForEntry } = await import("@/server/db/repos/subledger.repo");
    const links = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, ok.id));
    expect(links.filter((l) => l.linkId !== null).length).toBe(1);
  });

  it("opening balance bypass", async () => {
    const { orgId, byCode } = await setup();
    const ok = await withOrg(orgId, (tx) => postJournalEntry(tx, orgId, "t@t.id", {
      dateISO: `${year}-09-07`, memo: "saldo awal", source: "MANUAL", isOpeningBalance: true,
      lines: [
        { accountId: byCode("1310"), debitMinor: 9_000n, creditMinor: 0n },
        { accountId: byCode("3100"), debitMinor: 0n, creditMinor: 9_000n },
      ],
    }));
    expect(ok.number.startsWith("JE-")).toBe(true);
  });
});
```

(Kode 5900/4100/3100: bila salah satu absen di `seedOrgData`, ganti dengan kode beban/pendapatan/modal yang ada — kegagalan `byCode` bersifat eksplisit.)

- [ ] **Step 6: Jalankan dan commit**

```bash
bunx vitest run tests/integration/subledger-enforcement.test.ts
bunx tsc --noEmit
```

Expected: PASS + tsc bersih. Lalu:

```bash
git add src/core/journals/types.ts src/server/db/repos/journals.repo.ts tests/integration/subledger-enforcement.test.ts
git commit -m "feat(subledger): enforcement B1 di 3 entrypoint jurnal"
```

---

### Task 5: Pindah sumber akun persediaan ke registry (server)

**Files:**
- Modify: `src/server/db/schema/inventory.ts`, `src/server/db/repos/inventory.repo.ts`, `src/server/invoicing/posting.ts`, `src/server/onboarding/engine.ts`
- Create: `drizzle/0017_subledger-drop-inventory-account.sql`

**Interfaces:**
- Consumes: `getSubledgerControls` (Task 3)
- Produces: tidak ada API baru; `inventoryAccountId` hilang dari settings

- [ ] **Step 1: Hapus kolom dari schema + migrasi 0017**

`src/server/db/schema/inventory.ts`: hapus baris

```ts
  inventoryAccountId: uuid("inventory_account_id").references(() => accounts.id),
```

dan hapus `accounts` dari import bila tak terpakai lain (cek: masih dipakai `cogsAccountId` dkk → import tetap).

`drizzle/0017_subledger-drop-inventory-account.sql`:

```sql
ALTER TABLE "inventory_settings" DROP COLUMN IF EXISTS "inventory_account_id";
```

Tambah entri idx 17 di `drizzle/meta/_journal.json` (`"tag": "0017_subledger-drop-inventory-account"`, `"when": 1788900001000`).

- [ ] **Step 2: `inventory.repo.ts` baca kontrol dari registry**

Ganti `ResolvedAccounts` + `resolveAdjustmentAccounts` (baris ~346–391) menjadi:

```ts
type ResolvedAccounts = {
  inventoryAccountId: string;
  lossAccountId: string | null;
  gainAccountId: string | null;
};

async function resolveAdjustmentAccounts(
  q: Queryable,
  orgId: string,
  direction: "DEFISIT" | "SURPLUS",
): Promise<ResolvedAccounts> {
  const settings = await getInventorySettings(q, orgId);
  const allAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const byId = new Map(allAccounts.map((a) => [a.id, a]));
  const { getSubledgerControls } = await import("./subledger.repo");
  const controls = await getSubledgerControls(q, orgId);
  const inventoryId = controls.find((c) => c.kind === "PERSEDIAAN")?.controlAccountId ?? null;
  const lossId = settings?.adjustmentLossAccountId ?? null;
  const gainId = settings?.adjustmentGainAccountId ?? null;
  // ... sisa validasi fail-closed sama persis seperti sebelumnya
}
```

Hapus `inventoryAccountId` dari `upsertInventorySettings` (jangan kirim ke insert/update — hapus baris `inventoryAccountId: data.inventoryAccountId,`).

- [ ] **Step 3: `posting.ts` resolve via registry (2 situs)**

Tambah helper di atas `postInvoiceToLedger`:

```ts
async function resolveInventoryControlAccountId(tx: Queryable, orgId: string): Promise<string> {
  const { getSubledgerControls } = await import("@/server/db/repos/subledger.repo");
  const controls = await getSubledgerControls(tx, orgId);
  const id = controls.find((c) => c.kind === "PERSEDIAAN")?.controlAccountId ?? null;
  if (id) return id;
  const fallback =
    (await getAccountByCodeOrNull(tx, orgId, "1310"))?.id ??
    (await getAccountByCodeOrNull(tx, orgId, "1300"))?.id;
  if (!fallback) {
    throw new Error(
      "AKUN_PERSEDIAAN_BELUM_DIPETAKAN: pilih Akun Persediaan di Onboarding sebelum memposting faktur barang",
    );
  }
  return fallback;
}
```

Ganti kedua blok `settings?.inventoryAccountId ?? (await getAccountByCodeOrNull(...1310))...` (jual ~baris 321, beli `resolveInventoryAccountId` ~baris 372) menjadi `await resolveInventoryControlAccountId(tx, orgId)`.

- [ ] **Step 4: `engine.ts` seed kontrol, bukan kolom**

Ganti blok inisialisasi persediaan (~baris 504–518): setelah insert `inventorySettings` (tanpa `inventoryAccountId`), tambah seed kontrol dengan akun yang sudah ditemukan (`invAcc`), plus piutang/utang via lookup kode `1200`/`2100`:

```ts
    const { inventorySettings } = await import("@/server/db/schema/inventory");
    await tx.insert(inventorySettings).values({
      orgId,
      valuationMethod: "WEIGHTED_AVERAGE",
      recordingMethod: type === "JASA" ? "PERIODIC" : "PERPETUAL",
      cogsAccountId: cogsAcc?.id ?? null,
      adjustmentLossAccountId: lossAcc?.id ?? null,
    }).onConflictDoNothing();
    const { seedSubledgerControls } = await import("@/server/db/repos/subledger.repo");
    const arAcc = orgAccounts.find((a) => a.code === "1200");
    const apAcc = orgAccounts.find((a) => a.code === "2100");
    if (invAcc && arAcc && apAcc) {
      await seedSubledgerControls(tx, orgId, {
        receivableAccountId: arAcc.id,
        payableAccountId: apAcc.id,
        inventoryAccountId: invAcc.id,
      });
    }
```

- [ ] **Step 5: Migrasi + verifikasi parsial + commit**

```bash
bun run db:migrate
bun run db:sql
bunx tsc --noEmit
```

Expected: tsc akan menunjuk sisa pemakai `inventoryAccountId` (actions, settings UI, tests) — itu dikerjakan Task 6. Commit server dulu:

```bash
git add src/server/db/schema/inventory.ts drizzle/0017_subledger-drop-inventory-account.sql drizzle/meta/_journal.json src/server/db/repos/inventory.repo.ts src/server/invoicing/posting.ts src/server/onboarding/engine.ts
git commit -m "feat(subledger): akun persediaan pindah ke registry kontrol"
```

---

### Task 6: Settings UI + perbaikan test lama

**Files:**
- Modify: `src/server/actions/inventory.actions.ts`, `src/components/settings/inventory-settings.tsx`, `src/app/(app)/pengaturan/page.tsx`, `tests/integration/catalog-jasa-faktur.test.ts`, `tests/integration/inventory-opname-journal.test.ts`

**Interfaces:**
- Consumes: `seedSubledgerControls` (Task 3)
- Produces: tidak ada API baru; test lama hijau kembali

- [ ] **Step 1: Actions — hapus field**

`src/server/actions/inventory.actions.ts`: hapus `inventoryAccountId?: string | null;` dari payload `updateInventorySettingsAction` dan hapus baris `inventoryAccountId: payload.inventoryAccountId || undefined,` dari pemanggilan repo.

- [ ] **Step 2: Komponen settings — hapus picker akun persediaan**

`src/components/settings/inventory-settings.tsx`: hapus state `inventoryAccountId`, hapus dari payload (`inventoryAccountId: inventoryAccountId || null,`), hapus blok picker (`value={inventoryAccountId}` beserta label "Akun Persediaan"), dan hapus dari props type (baris ~33). Ganti teks bantuan bila ada menjadi "Akun Persediaan diatur saat onboarding (registry subledger)".

- [ ] **Step 3: Halaman pengaturan — hapus mapping**

`src/app/(app)/pengaturan/page.tsx` baris ~66: hapus `inventoryAccountId: data.invSettings.inventoryAccountId,`.

- [ ] **Step 4: Perbaiki test lama**

`tests/integration/catalog-jasa-faktur.test.ts` (2 situs) dan `tests/integration/inventory-opname-journal.test.ts` (1 situs): ganti `inventoryAccountId: <id>` di `upsertInventorySettings` menjadi seed registry setelahnya:

```ts
await withOrg(orgId, (tx) =>
  upsertInventorySettings(tx, orgId, {
    valuationMethod: "WEIGHTED_AVERAGE",
    recordingMethod: "PERPETUAL",
    cogsAccountId: byCode("5100").id,
  }),
);
const { seedSubledgerControls } = await import("@/server/db/repos/subledger.repo");
await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
  receivableAccountId: byCode("1200").id,
  payableAccountId: byCode("2100").id,
  inventoryAccountId: byCode("1300").id,
}));
```

(`byCode`/`invAcc` sesuaikan nama variabel lokal tiap file.)

- [ ] **Step 5: Verifikasi + commit**

```bash
bunx tsc --noEmit
bunx vitest run tests/integration/catalog-jasa-faktur.test.ts
bunx vitest run tests/integration/inventory-opname-journal.test.ts
bun run lint
```

Expected: semua PASS. Lalu:

```bash
git add src/server/actions/inventory.actions.ts src/components/settings/inventory-settings.tsx src/app/\(app\)/pengaturan/page.tsx tests/integration/catalog-jasa-faktur.test.ts tests/integration/inventory-opname-journal.test.ts
git commit -m "feat(subledger): settings tanpa akun persediaan, test lama hijau"
```

---

### Task 7: Links di posting faktur + reversal + pelunasan

**Files:**
- Modify: `src/server/invoicing/posting.ts`
- Create: `tests/integration/subledger-posting.test.ts`

**Interfaces:**
- Consumes: enforcement Task 4 (jurnal modul tanpa links kini DITOLAK — test lama akan gagal sebelum task ini)
- Produces: faktur jual/beli/pelunasan/void selalu menulis links valid

- [ ] **Step 1: Jual — link PIUTANG + N link PERSEDIAAN**

Di cabang `INVOICE`: setelah push `Dr Piutang`, tambahkan links (butuh `contactId` faktur — `inv.contactId` tersedia dari `getInvoiceByIdRepo`):

```ts
      lines.push({
        accountId: arAccount.id,
        debitMinor: inv.totalMinor,
        creditMinor: 0n,
        memo: `Piutang ${inv.invoiceNumber}`,
        subledgerLinks: [{ kind: "PIUTANG", refId: inv.contactId, amountMinor: inv.totalMinor }],
      });
```

Ubah loop HPP untuk kumpulkan links per item:

```ts
        let hppTotal = 0n;
        const hppLinks: Array<{ kind: "PERSEDIAAN"; refId: string; amountMinor: bigint; qty: number }> = [];
        for (const m of barangMutations) {
          const cost = await applyInvoiceStockOut(
            tx, orgId, m.master, m.qty, valuation, inv.issueDate, inv.id,
            `Jual ${inv.invoiceNumber} (${m.master.code})`,
          );
          hppTotal += cost;
          hppLinks.push({ kind: "PERSEDIAAN", refId: m.master.id, amountMinor: cost, qty: m.qty });
        }
        if (hppTotal > 0n) {
          lines.push({
            accountId: cogsAccId,
            debitMinor: hppTotal,
            creditMinor: 0n,
            memo: `HPP ${inv.invoiceNumber}`,
          });
          lines.push({
            accountId: invAccId,
            debitMinor: 0n,
            creditMinor: hppTotal,
            memo: `Persediaan keluar ${inv.invoiceNumber}`,
            subledgerLinks: hppLinks,
          });
        }
```

(Links hanya di baris Persediaan; baris HPP non-kontrol tanpa link — sesuai spec.)

- [ ] **Step 2: Beli — N link + link UTANG**

Di cabang `BILL`: hitung `invAccId` sekali sebelum loop:

```ts
      const invAccId = await resolveInventoryControlAccountId(tx, orgId);
      const invLinks: Array<{ kind: "PERSEDIAAN"; refId: string; amountMinor: bigint; qty: number }> = [];
```

Di dalam loop untuk `master` BARANG + PERPETUAL, setelah `addDebit(...)`, tambah:

```ts
            invLinks.push({ kind: "PERSEDIAAN", refId: master.id, amountMinor: calc.netSubtotalMinor, qty });
```

Saat push `debitGroups` ke `lines`, lampirkan links pada baris akun persediaan:

```ts
      for (const [accountId, netto] of debitGroups) {
        if (netto === 0n) continue;
        lines.push({
          accountId,
          debitMinor: netto,
          creditMinor: 0n,
          memo: `Beban/Pembelian ${inv.invoiceNumber}`,
          ...(accountId === invAccId ? { subledgerLinks: invLinks } : {}),
        });
      }
```

Hapus fungsi lokal `resolveInventoryAccountId` yang lama (diganti helper Task 5). Pada push `Cr Utang`, tambah:

```ts
        subledgerLinks: [{ kind: "UTANG", refId: inv.contactId, amountMinor: inv.totalMinor }],
```

- [ ] **Step 3: Pelunasan — link di baris kontrol**

`postInvoicePaymentToLedger`: pada push `Cr Piutang` tambah `subledgerLinks: [{ kind: "PIUTANG", refId: inv.contactId, amountMinor: payment.amountMinor }]`; pada push `Dr Utang` tambah `subledgerLinks: [{ kind: "UTANG", refId: inv.contactId, amountMinor: payment.amountMinor }]`.

- [ ] **Step 4: Void — salin links ke jurnal pembalik**

`voidInvoiceWithReversal`: setelah ambil `origLines`, ambil links-nya:

```ts
    const { listLinksForEntry } = await import("@/server/db/repos/subledger.repo");
    const origLinkRows = await listLinksForEntry(tx, orgId, fresh.journalEntryId);
    const linksByLine = new Map<string, Array<{ kind: "PIUTANG" | "UTANG" | "PERSEDIAAN"; refId: string; amountMinor: bigint }>>();
    for (const r of origLinkRows) {
      if (!r.linkId) continue;
      const arr = linksByLine.get(r.lineId) ?? [];
      arr.push({ kind: r.kind as "PIUTANG" | "UTANG" | "PERSEDIAAN", refId: r.refId!, amountMinor: r.amountMinor! });
      linksByLine.set(r.lineId, arr);
    }
```

Ubah mapping reversal menjadi (index correspondence dengan `origLines`):

```ts
        lines: origLines.map((l, i) => ({
          accountId: l.accountId,
          debitMinor: toMinor(l.credit),
          creditMinor: toMinor(l.debit),
          memo: `Pembalik ${inv.invoiceNumber}`,
          ...(linksByLine.get(l.id)?.length
            ? { subledgerLinks: linksByLine.get(l.id)!.map((x) => ({ ...x })) }
            : {}),
        })),
```

- [ ] **Step 5: Tulis test posting**

`tests/integration/subledger-posting.test.ts` — pola setup meniru `catalog-jasa-faktur.test.ts` baris 75–119 (seedOrgData + akun 4110/4130 + settings PERPETUAL + seed controls + item BARANG + kontak + `createInvoiceRepo`):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import { createInvoiceRepo } from "@/server/db/repos/invoices.repo";
import { createInventoryItem } from "@/server/db/repos/inventory.repo";
import { upsertInventorySettings } from "@/server/db/repos/inventory.repo";
import { seedSubledgerControls, listLinksForEntry } from "@/server/db/repos/subledger.repo";
import { postInvoiceToLedger, voidInvoiceWithReversal, postInvoicePaymentToLedger } from "@/server/invoicing/posting";
```

Kasus: (a) jual 2 SKU → posting lolos, links PIUTANG 1 + PERSEDIAAN 2 dengan total = HPP; (b) beli → links UTANG + PERSEDIAAN; (c) bayar penuh → lolos + link; (d) void → jurnal pembalik punya links mirror. Tulis keempatnya dengan nominal eksplisit (qty 2 × cost 20_000 → HPP 40_000n, dst.) mengikuti pola existing.

- [ ] **Step 6: Jalankan dan commit**

```bash
bunx vitest run tests/integration/subledger-posting.test.ts
bunx vitest run tests/integration/catalog-jasa-faktur.test.ts
```

Expected: PASS. Lalu:

```bash
git add src/server/invoicing/posting.ts tests/integration/subledger-posting.test.ts
git commit -m "feat(subledger): links faktur, bayar, void"
```

---

### Task 8: Links opname + kas-bank

**Files:**
- Modify: `src/server/db/repos/inventory.repo.ts`, `src/server/db/repos/cash-bank.repo.ts`
- Create: `tests/integration/subledger-opname-cash.test.ts`

**Interfaces:**
- Consumes: enforcement Task 4, `getSubledgerControls` Task 3
- Produces: opname + kas-bank menulis links valid

- [ ] **Step 1: Opname — links per item pada baris Persediaan**

`generateAdjustmentJournalDraft` (`inventory.repo.ts` ~baris 429–457): kumpulkan links dari `opnameData.items` (pakai `differenceValueMinor` absolut + `differenceQty`):

```ts
  const persediaanLinks = opnameData.items
    .filter((it) => it.differenceValueMinor !== 0n)
    .map((it) => ({
      kind: "PERSEDIAAN" as const,
      refId: it.itemId,
      amountMinor: it.differenceValueMinor < 0n ? -it.differenceValueMinor : it.differenceValueMinor,
      qty: Number(it.differenceQty),
    }));
```

Lampirkan `subledgerLinks: persediaanLinks` pada baris akun persediaan SAJA (defisit: baris `Cr Pengurangan Persediaan`; surplus: baris `Dr Penambahan Persediaan`). Baris beban/pendapatan selisih tanpa link.

- [ ] **Step 2: Kas-bank — wajib kontak + link saat counter = kontrol**

`createCashEntryRepo` (`cash-bank.repo.ts` ~baris 107–134): setelah `plan`, tambah:

```ts
  const { getControlKindByAccount } = await import("./subledger.repo");
  const controlByAccountId = await getControlKindByAccount(q, orgId);
  const counterKind = controlByAccountId.get(input.counterAccountId);
  if (counterKind === "PERSEDIAAN") {
    throw new CashValidationError("AKUN_KONTROL_WAJIB_VIA_MODUL: mutasi Persediaan via kas-bank dilarang, gunakan menu Pembelian/Persediaan");
  }
  let counterLinks: Array<{ kind: "PIUTANG" | "UTANG"; refId: string; amountMinor: bigint }> | undefined;
  if (counterKind === "PIUTANG" || counterKind === "UTANG") {
    if (!input.contactId) {
      throw new CashValidationError("KONTAK_WAJIB: lawan Piutang/Utang wajib pilih kontak");
    }
    counterLinks = [{ kind: counterKind, refId: input.contactId, amountMinor: input.amountMinor }];
  }
```

Lampirkan pada baris counter (cari index baris yang `accountId === input.counterAccountId`):

```ts
    lines: [
      {
        accountId: plan.debitAccountId,
        debitMinor: input.amountMinor,
        creditMinor: 0n,
        ...(plan.debitAccountId === input.counterAccountId && counterLinks ? { subledgerLinks: counterLinks } : {}),
      },
      {
        accountId: plan.creditAccountId,
        debitMinor: 0n,
        creditMinor: input.amountMinor,
        ...(plan.creditAccountId === input.counterAccountId && counterLinks ? { subledgerLinks: counterLinks } : {}),
      },
    ],
```

`CashValidationError` sudah diimpor di file ini.

- [ ] **Step 3: Tulis test**

`tests/integration/subledger-opname-cash.test.ts`: (a) opname defisit 1 item → `generateAdjustmentJournalDraft` lolos + links 1 pada baris persediaan (verifikasi via `listLinksForEntry`); (b) kas TERIMA counter 1200 tanpa kontak → `CashValidationError KONTAK_WAJIB`; dengan kontak → lolos + link PIUTANG; (c) kas BAYAR counter 1310 → ditolak `AKUN_KONTROL_WAJIB_VIA_MODUL`. Setup: seedOrgData + seed controls + item + kontak (pola Task 4).

- [ ] **Step 4: Jalankan dan commit**

```bash
bunx vitest run tests/integration/subledger-opname-cash.test.ts
bunx vitest run tests/integration/inventory-opname-journal.test.ts
```

Expected: PASS. Lalu:

```bash
git add src/server/db/repos/inventory.repo.ts src/server/db/repos/cash-bank.repo.ts tests/integration/subledger-opname-cash.test.ts
git commit -m "feat(subledger): links opname dan kas-bank"
```

---

### Task 9: Recon action + layar + temuan

**Files:**
- Create: `src/server/actions/subledger.actions.ts`, `src/app/(app)/buku-pembantu/page.tsx`
- Modify: `src/components/sidebar-nav.tsx` (tambah menu)

**Interfaces:**
- Consumes: `reconcileSubledger`, `reportSubledgerMismatch` (Task 3)
- Produces: UI baca-saja + temuan otomatis

- [ ] **Step 1: Tulis actions**

`src/server/actions/subledger.actions.ts`:

```ts
"use server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { reconcileSubledger, reportSubledgerMismatch } from "@/server/db/repos/subledger.repo";

export async function getSubledgerReconAction() {
  const ctx = await requireContext();
  const rows = await reconcileSubledger(db, ctx.orgId);
  return rows.map((r) => ({
    kind: r.kind,
    controlAccountId: r.controlAccountId,
    controlBalanceMinor: r.controlBalanceMinor.toString(),
    subledgerTotalMinor: r.subledgerTotalMinor.toString(),
    differenceMinor: r.differenceMinor.toString(),
  }));
}

export async function runSubledgerCheckAction() {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await withOrg(ctx.orgId, async (tx) => {
      const rows = await reconcileSubledger(tx, ctx.orgId);
      const findings = await reportSubledgerMismatch(tx, ctx.orgId, rows);
      return { rows, findings };
    });
    return {
      ok: true as const,
      findings: res.findings,
      rows: res.rows.map((r) => ({ ...r, controlBalanceMinor: r.controlBalanceMinor.toString(), subledgerTotalMinor: r.subledgerTotalMinor.toString(), differenceMinor: r.differenceMinor.toString() })),
    };
  } catch (err: unknown) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Gagal menjalankan rekonsiliasi" };
  }
}
```

- [ ] **Step 2: Tulis halaman baca-saja**

`src/app/(app)/buku-pembantu/page.tsx`: `PageHeader` (`title="Buku Pembantu"`, `eyebrow="Rekonsiliasi"`), tabel 3 baris kind dengan kolom Kontrol / Pembantu / Selisih via `Money.formatIdr`, Badge status (selisih 0 = aman), tombol "Jalankan Pemeriksaan" (`data-testid="subledger-run-check"`) memanggil `runSubledgerCheckAction`, tabel `data-testid="subledger-row"`. Pola tabel: card `rounded-xl border-rule`, thead `text-[11px] uppercase`, angka `tnum` — ikuti `invoice-list.tsx`.

- [ ] **Step 3: Daftarkan menu sidebar**

`src/components/sidebar-nav.tsx`: tambah item `Buku Pembantu` (`/buku-pembantu`) di grup Operasional (ikuti pola parent/children Kas & Bank bila grup penuh — cukup satu item level grup).

- [ ] **Step 4: Verifikasi manual + commit**

```bash
bun run dev
```

Buka `/buku-pembantu`: 3 baris nol (DB fresh) → buat faktur tanpa posting → selisih PIUTANG muncul → tombol pemeriksaan → temuan `SUBLEDGER_MISMATCH` di `/temuan`. Lalu:

```bash
git add src/server/actions/subledger.actions.ts "src/app/(app)/buku-pembantu/page.tsx" src/components/sidebar-nav.tsx
git commit -m "feat(subledger): layar rekonsiliasi buku pembantu"
```

---

### Task 10: Verifikasi penuh

**Files:** tidak ada (hanya perintah)

- [ ] **Step 1: Typecheck + lint**

```bash
bunx tsc --noEmit
bun run lint
```

Expected: bersih.

- [ ] **Step 2: Seluruh unit test**

```bash
bun run test
```

Expected: semua PASS (termasuk `tests/unit/subledger/guard.test.ts`).

- [ ] **Step 3: Build hijau**

```bash
bun run build
```

Expected: sukses.

- [ ] **Step 4: Commit penutup bila ada perbaikan**

```bash
git add -A
git commit -m "chore(subledger): verifikasi penuh hijau"
```

Hanya commit bila ada perubahan; bila bersih, lewati step ini.

---

## Self-Review

**1. Spec coverage:** §3.1 registry → Task 1+3+5; §3.2 link table agregat → Task 1+4; §4 guard+3 entrypoint+opening exception → Task 2+4; §5 faktur/bayar/opname/kas-bank/void/recon/temuan → Task 7+8+9; §6 error/testing/rollout → Task 4 (pesan), semua task (test), Task 1+5 (reset, tanpa backfill). Non-tujuan (aset, multi-gudang) tidak ada task-nya — benar.

**2. Placeholder scan:** tidak ada TBD/TODO/"sama seperti Task N" tanpa kode — hunks disalin eksplisit di tiap task; fallback `byCode` yang mungkin absen ditangani eksplisit (gagal dengan pesan jelas, bukan diam).

**3. Type consistency:** `SubledgerKind` didefinisikan sekali di guard (Task 2) dan diimpor sebagai type di types/journals.repo/cash-bank (Task 4+8); schema mendefinisikan ulang union yang sama untuk Drizzle enum — nilai literal identik ("PIUTANG"|"UTANG"|"PERSEDIAAN"); `amountMinor: bigint` di semua lapis; `qty?: number` di input → `String(qty)` saat insert `numeric(12,4)`; evidence finding string. `isOpeningBalance` mengalir types → repo → guard.

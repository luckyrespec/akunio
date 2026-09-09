# Buku Pembantu Aset Tetap + Dimuka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daftarkan `ASET_TETAP` dan `DIMUKA` sebagai buku pembantu (kartu + rekonsiliasi + posting amortisasi per bulan) tanpa mengubah 3 kind yang sudah ada.

**Architecture:** Extend registry `subledger_controls` (bukan tabel generik). `DIMUKA` dapat 2 tabel baru meniru pola `asset_depreciation_lines`; `ASET_TETAP` reuse `fixed_assets` + recon agregat famili `15xx`. Posting amortisasi meniru `postMonthlyDepreciation` dengan source jurnal baru `DIMUKA` + `subledgerLinks`.

**Tech Stack:** Next 16.3 / React 19 / Drizzle 0.45 + pg / Vitest 4 / Tailwind 4 + shadcn. Uang selalu `numeric(18,2)` ↔ `Money` BigInt minor, tidak pernah `number`/`float`.

**Spec:** `docs/superpowers/specs/2026-09-09-subledger-aset-dimuka-design.md`

## Global Constraints

- `bunx tsc --noEmit` strict, tidak ada `any` — setiap task yang menyentuh TS wajib diakhiri typecheck file terkait.
- Uang: `numeric(18,2)` di DB, `Money` BigInt minor di kode (`src/core/money/money.ts`) — tidak pernah JS `number` untuk rupiah.
- Posting: `validate → post → immutable`; koreksi via `reversal_of_id`, tidak pernah UPDATE jurnal POSTED.
- Setiap `db.transaction` tenant-scoped wajib lewat `withOrg` (`src/server/db/repos/with-org.ts`) agar RLS `app_user` berlaku.
- Migrasi Drizzle ditulis tangan (`IF NOT EXISTS`, pemisah `--> statement-breakpoint`, entry `_journal.json`, tanpa snapshot) — JANGAN `drizzle-kit generate` (crash serialisasi BigInt).
- CHECK `je_source_chk` dimiliki `tax.sql` (penulis alfabetis terakhir menang) — extend di sana, tidak pernah di `hardening.sql`.
- Tabel baru wajib masuk TRUNCATE list `tests/integration/helpers.ts`.
- Test DB `ledger_test` via `bun run test:db:setup` (butuh PG lokal 5432); `bunx vitest run <file>` per file; Windows: `bun.exe` auto-load `.env`, untuk connection string eksplisit pakai `node.exe`.
- UI copy Bahasa Indonesia; token Paper & Ink; tabel card `rounded-xl border-rule`, thead `text-[11px] uppercase`, angka `tnum` + `Money.formatIdr`; field akun selalu `AccountSelect`, tidak ada `<select>` native.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `src/server/db/schema/subledger.ts` (ubah) | Tambah `"ASET_TETAP"`, `"DIMUKA"` ke `subledgerKindEnum` |
| `src/server/db/schema/prepaid.ts` (baru) | `prepaid_contracts` + `prepaid_schedule_lines` |
| `src/core/subledger/guard.ts` (ubah) | Union kind + label modul baru |
| `src/core/subledger/cards.ts` (ubah) | Route + label kartu baru |
| `src/core/journals/types.ts` (ubah) | `JournalSource` tambah `"DIMUKA"` |
| `src/core/prepaid/amortization.ts` + `.test.ts` (baru) | Jadwal amortisasi murni (tanpa DB) |
| `src/server/db/repos/prepaid.repo.ts` (baru) | Buat kontrak + posting amortisasi |
| `src/server/db/repos/subledger.repo.ts` (ubah) | Seed 2 kind + recon `DIMUKA`/`ASET_TETAP` |
| `src/server/db/repos/journals.repo.ts` (ubah) | Lebarkan union kind di `persistSubledgerLinks` |
| `src/server/db/repos/subsidiary.repo.ts` (ubah) | `listPrepaidCards`, `getPrepaidCard`, `listAssetCards` |
| `src/server/actions/prepaid.actions.ts` (baru) | Action buat + posting (withOrg, OWNER/ACCOUNTANT) |
| `src/server/onboarding/engine.ts` (ubah) | Seed kontrol + backfill note |
| `src/core/reports/sak-emkm.ts` + `.test.ts` (ubah) | `1600–1699` masuk aset lancar |
| `drizzle/0019_prepaid_dimuka.sql` + `meta/_journal.json` (baru/ubah) | Migrasi tabel + backfill kontrol |
| `src/server/db/rls.sql` (ubah) | Tambah 2 tabel ke ARRAY |
| `src/server/db/tax.sql` (ubah) | `je_source_chk` tambah `'DIMUKA'` |
| `tests/integration/helpers.ts` (ubah) | TRUNCATE tambah 2 tabel |
| `tests/integration/prepaid-*.test.ts` (baru) | Schema, posting, recon |
| `src/app/(app)/buku-pembantu/*` (ubah + baru) | Kartu index, list/detail dimuka, list aset |

---

### Task 1: Kind registry + guard + source + label kartu (murni, unit-tested)

**Files:**
- Modify: `src/server/db/schema/subledger.ts:5`
- Modify: `src/core/subledger/guard.ts:3,29-33`
- Modify: `src/core/subledger/cards.ts:18-28`
- Modify: `src/core/journals/types.ts:2`
- Test: `src/core/subledger/kinds.test.ts` (baru, co-located mengikuti `src/core/journals/validate.test.ts`)

**Interfaces:**
- Consumes: tidak ada (fondasi).
- Produces: `SubledgerKind` = `"PIUTANG" | "UTANG" | "PERSEDIAAN" | "ASET_TETAP" | "DIMUKA"`; `moduleLabelForKind("DIMUKA") === "Sewa Dibayar di Muka"`; `moduleLabelForKind("ASET_TETAP") === "Aset Tetap"`; `SUBLEDGER_LIST_ROUTE.DIMUKA === "/buku-pembantu/dimuka"`; `SUBLEDGER_LIST_ROUTE.ASET_TETAP === "/buku-pembantu/aset"`.

- [ ] **Step 1: Tulis failing test**

```ts
// src/core/subledger/kinds.test.ts
import { describe, expect, it } from "vitest";
import { moduleLabelForKind, validateSubledgerControl } from "./guard";
import { SUBLEDGER_LIST_ROUTE, SUBLEDGER_KIND_LABEL } from "./cards";

describe("subledger kinds baru", () => {
  it("label modul dikenali guard", () => {
    expect(moduleLabelForKind("DIMUKA")).toBe("Sewa Dibayar di Muka");
    expect(moduleLabelForKind("ASET_TETAP")).toBe("Aset Tetap");
  });
  it("route dan label kartu terdaftar", () => {
    expect(SUBLEDGER_LIST_ROUTE.DIMUKA).toBe("/buku-pembantu/dimuka");
    expect(SUBLEDGER_LIST_ROUTE.ASET_TETAP).toBe("/buku-pembantu/aset");
    expect(SUBLEDGER_KIND_LABEL.DIMUKA).toBe("Dimuka per Kontrak");
  });
  it("jurnal manual menyentuh 1600 ditolak walau tanpa links", () => {
    const issues = validateSubledgerControl({
      lines: [{ accountId: "acc-1600", debitMinor: 100000n, creditMinor: 0n }],
      controlByAccountId: new Map([["acc-1600", "DIMUKA"]]),
      source: "MANUAL",
    });
    expect(issues).toEqual([{ code: "AKUN_KONTROL_WAJIB_VIA_MODUL", index: 0, kind: "DIMUKA" }]);
  });
  it("source DIMUKA dengan links senilai diterima", () => {
    const issues = validateSubledgerControl({
      lines: [{
        accountId: "acc-1600", debitMinor: 0n, creditMinor: 100000n,
        links: [{ kind: "DIMUKA", refId: "c1", amountMinor: 100000n }],
      }],
      controlByAccountId: new Map([["acc-1600", "DIMUKA"]]),
      source: "DIMUKA",
    });
    expect(issues).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `bunx vitest run src/core/subledger/kinds.test.ts`
Expected: FAIL (`moduleLabelForKind` tidak menangani `"DIMUKA"` — TS error atau return undefined; `validateSubledgerControl` menolak source `"DIMUKA"` di level tipe).

- [ ] **Step 3: Implementasi minimal**

```ts
// src/server/db/schema/subledger.ts:5
export const subledgerKindEnum = ["PIUTANG", "UTANG", "PERSEDIAAN", "ASET_TETAP", "DIMUKA"] as const;
```

```ts
// src/core/subledger/guard.ts
export type SubledgerKind = "PIUTANG" | "UTANG" | "PERSEDIAAN" | "ASET_TETAP" | "DIMUKA";
// moduleLabelForKind tambah:
if (kind === "DIMUKA") return "Sewa Dibayar di Muka";
if (kind === "ASET_TETAP") return "Aset Tetap";
```

```ts
// src/core/subledger/cards.ts
export const SUBLEDGER_LIST_ROUTE: Record<"PERSEDIAAN" | "PIUTANG" | "UTANG" | "ASET_TETAP" | "DIMUKA", string> = {
  PERSEDIAAN: "/buku-pembantu/persediaan",
  PIUTANG: "/buku-pembantu/piutang",
  UTANG: "/buku-pembantu/utang",
  ASET_TETAP: "/buku-pembantu/aset",
  DIMUKA: "/buku-pembantu/dimuka",
};
export const SUBLEDGER_KIND_LABEL: Record<"PERSEDIAAN" | "PIUTANG" | "UTANG" | "ASET_TETAP" | "DIMUKA", string> = {
  PERSEDIAAN: "Persediaan per SKU",
  PIUTANG: "Piutang Usaha per Pelanggan",
  UTANG: "Utang Usaha per Pemasok",
  ASET_TETAP: "Aset Tetap per Unit",
  DIMUKA: "Dimuka per Kontrak",
};
```

```ts
// src/core/journals/types.ts:2
export type JournalSource = "MANUAL" | "AI" | "DOCUMENT" | "IMPORT" | "STOCK_OPNAME" | "TAX" | "KAS_BAYAR" | "KAS_TERIMA" | "KAS_TRANSFER" | "DIMUKA";
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `bunx vitest run src/core/subledger/kinds.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: bersih. Catatan: error di file yang belum diubah dan menyebut kind union baru adalah sinyal Task 5 (`persistSubledgerLinks`) — biarkan, jangan diperbaiki di sini.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema/subledger.ts src/core/subledger/guard.ts src/core/subledger/cards.ts src/core/journals/types.ts src/core/subledger/kinds.test.ts
git commit -m "feat(subledger): tambah kind ASET_TETAP dan DIMUKA + source jurnal DIMUKA"
```

---

### Task 2: Migrasi prepaid + RLS + TRUNCATE + CHECK source (schema test)

**Files:**
- Create: `src/server/db/schema/prepaid.ts`
- Create: `drizzle/0019_prepaid_dimuka.sql`
- Modify: `drizzle/meta/_journal.json` (tambah entry idx 19)
- Modify: `src/server/db/rls.sql:9-17` (tambah 2 nama tabel ke ARRAY)
- Modify: `src/server/db/tax.sql:28-30` (CHECK tambah `'DIMUKA'`)
- Modify: `tests/integration/helpers.ts:23-35` (TRUNCATE tambah 2 tabel)
- Test: `tests/integration/prepaid-schema.test.ts` (baru)

**Interfaces:**
- Consumes: `SubledgerKind` Task 1.
- Produces: tabel `prepaid_contracts`, `prepaid_schedule_lines`; RLS tenant isolation aktif; `je_source_chk` menerima `'DIMUKA'`; `truncateAll()` membersihkan tabel baru.

- [ ] **Step 1: Tulis schema Drizzle**

```ts
// src/server/db/schema/prepaid.ts
import { pgTable, uuid, text, varchar, date, numeric, timestamp, uniqueIndex, index, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, accounts } from "./org";
import { journalEntries } from "./journal";

export const prepaidContracts = pgTable("prepaid_contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 32 }).notNull(),
  name: text("name").notNull(),
  vendor: text("vendor"),
  controlAccountId: uuid("control_account_id").notNull().references(() => accounts.id),
  expenseAccountId: uuid("expense_account_id").notNull().references(() => accounts.id),
  paymentAccountId: uuid("payment_account_id").notNull().references(() => accounts.id),
  totalMinor: numeric("total_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  startDate: date("start_date").notNull(),
  months: integer("months").notNull(),
  monthlyMinor: numeric("monthly_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  accumulatedMinor: numeric("accumulated_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
  remainingMinor: numeric("remaining_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  status: text("status", { enum: ["ACTIVE", "COMPLETED", "CANCELLED"] }).notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("prepaid_contracts_org_code_uq").on(t.orgId, t.code)]);

export const prepaidScheduleLines = pgTable("prepaid_schedule_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").notNull().references(() => prepaidContracts.id, { onDelete: "cascade" }),
  periodName: varchar("period_name", { length: 7 }).notNull(),
  amortDate: date("amort_date").notNull(),
  amountMinor: numeric("amount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  accumulatedMinor: numeric("accumulated_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  remainingMinor: numeric("remaining_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  status: text("status", { enum: ["SCHEDULED", "POSTED"] }).notNull().default("SCHEDULED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("prepaid_sched_contract_period_uq").on(t.contractId, t.periodName),
  index("prepaid_sched_org_period_idx").on(t.orgId, t.periodName),
]);
```

- [ ] **Step 2: Tulis migrasi SQL tangan + journal + RLS + CHECK + TRUNCATE**

```sql
-- drizzle/0019_prepaid_dimuka.sql
-- Kartu beban dibayar di muka per kontrak + jadwal amortisasi. Idempoten.
CREATE TABLE IF NOT EXISTS "prepaid_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "code" varchar(32) NOT NULL,
  "name" text NOT NULL,
  "vendor" text,
  "control_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
  "expense_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
  "payment_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
  "total_minor" numeric NOT NULL,
  "start_date" date NOT NULL,
  "months" integer NOT NULL,
  "monthly_minor" numeric NOT NULL,
  "accumulated_minor" numeric DEFAULT '0' NOT NULL,
  "remaining_minor" numeric NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prepaid_schedule_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "contract_id" uuid NOT NULL REFERENCES "public"."prepaid_contracts"("id") ON DELETE cascade,
  "period_name" varchar(7) NOT NULL,
  "amort_date" date NOT NULL,
  "amount_minor" numeric NOT NULL,
  "accumulated_minor" numeric NOT NULL,
  "remaining_minor" numeric NOT NULL,
  "journal_entry_id" uuid REFERENCES "public"."journal_entries"("id"),
  "status" text DEFAULT 'SCHEDULED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prepaid_contracts_org_code_uq" ON "public"."prepaid_contracts" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prepaid_sched_contract_period_uq" ON "public"."prepaid_schedule_lines" USING btree ("contract_id","period_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prepaid_sched_org_period_idx" ON "public"."prepaid_schedule_lines" USING btree ("org_id","period_name");--> statement-breakpoint
-- Backfill kontrol untuk org yang sudah punya akun 1600 / 1500:
INSERT INTO "public"."subledger_controls" ("org_id","kind","control_account_id")
SELECT a."org_id", 'DIMUKA', a."id" FROM "public"."accounts" a
WHERE a."code" = '1600' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "public"."subledger_controls" ("org_id","kind","control_account_id")
SELECT a."org_id", 'ASET_TETAP', a."id" FROM "public"."accounts" a
WHERE a."code" = '1500' ON CONFLICT DO NOTHING;
```

`drizzle/meta/_journal.json`: tambah entry `{"idx": 19, "version": "7", "when": 1788900003000, "tag": "0019_prepaid_dimuka", "breakpoints": true}`.

`src/server/db/rls.sql`: pada ARRAY baris 14-16 tambah `'prepaid_contracts','prepaid_schedule_lines',` setelah `'asset_disposals',`.

`src/server/db/tax.sql:30`: ubah CHECK menjadi `CHECK (source IN ('MANUAL','AI','DOCUMENT','IMPORT','STOCK_OPNAME','TAX','KAS_BAYAR','KAS_TERIMA','KAS_TRANSFER','DIMUKA'))`.

`tests/integration/helpers.ts`: pada TRUNCATE tambah `prepaid_schedule_lines, prepaid_contracts,` setelah `subledger_controls,`.

- [ ] **Step 3: Tulis failing schema test**

```ts
// tests/integration/prepaid-schema.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { getPool, truncateAll, makeOrg } from "./helpers";

describe("skema prepaid", () => {
  beforeEach(async () => { await truncateAll(); });
  it("tabel tersedia dan RLS mengisolasi antar org", async () => {
    const pool = getPool();
    const a = await makeOrg("org-a");
    const b = await makeOrg("org-b");
    await pool.query(
      `INSERT INTO prepaid_contracts (org_id, code, name, control_account_id, expense_account_id, payment_account_id, total_minor, start_date, months, monthly_minor, remaining_minor)
       VALUES ($1,'DM-2026-0001','Sewa Ruko', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 12000000, '2026-01-01', 12, 1000000, 12000000)`,
      [a.orgId],
    );
    await pool.query(`SELECT set_config('app.current_org', $1, true)`, [b.orgId]);
    const r = await pool.query(`SELECT id FROM prepaid_contracts`);
    expect(r.rows).toHaveLength(0);
    await pool.end();
  });
  it("CHECK je_source_chk menerima DIMUKA", async () => {
    const pool = getPool();
    const { orgId } = await makeOrg("org-src");
    const acc = await pool.query(
      `INSERT INTO accounts (org_id, code, name, type, normal) VALUES ($1,'1110','Kas','ASET','D') RETURNING id`,
      [orgId],
    );
    await pool.query(
      `INSERT INTO journal_entries (org_id, entry_date, memo, source, status) VALUES ($1,'2026-01-05','cek','DIMUKA','DRAFT')`,
      [orgId],
    );
    await pool.end();
    expect(acc.rows[0].id).toBeTruthy();
  });
});
```

Catatan: sebelum menulis test, baca kolom wajib `journal_entries` di `src/server/db/schema/journal.ts` dan samakan INSERT di atas (kolom `number`/`seq` mungkin NOT NULL tanpa default — jika ya, sertakan nilainya di test).

- [ ] **Step 4: Terapkan migrasi ke ledger_test lalu jalankan test (diprediksi gagal dulu bila tabel belum ada)**

Run: `bun run test:db:setup`
Expected: sukses (migrasi 0019 + `*.sql` termasuk CHECK baru teraplikasi).

Run: `bunx vitest run tests/integration/prepaid-schema.test.ts`
Expected: PASS setelah setup; jika FAIL karena nama kolom `journal_entries` salah, betulkan test mengikuti `schema/journal.ts` (bukan sebaliknya).

- [ ] **Step 5: Typecheck + commit**

Run: `bunx tsc --noEmit` — Expected: bersih.

```bash
git add src/server/db/schema/prepaid.ts drizzle/0019_prepaid_dimuka.sql drizzle/meta/_journal.json src/server/db/rls.sql src/server/db/tax.sql tests/integration/helpers.ts tests/integration/prepaid-schema.test.ts
git commit -m "feat(db): tabel prepaid dimuka + RLS + source DIMUKA + backfill kontrol"
```

---

### Task 3: Helper jadwal amortisasi murni (TDD, tanpa DB)

**Files:**
- Create: `src/core/prepaid/amortization.ts`
- Test: `src/core/prepaid/amortization.test.ts` (baru)

**Interfaces:**
- Consumes: tidak ada.
- Produces: `calculateAmortizationSchedule({ totalMinor: bigint; startDate: string; months: number }): AmortizationScheduleItem[]` dengan item `{ periodName: 'YYYY-MM'; amortDate: 'YYYY-MM-DD' (akhir bulan); amountMinor: bigint; accumulatedMinor: bigint; remainingMinor: bigint }`. Meniru `getPeriodAndEndOfMonth` di `src/core/assets/depreciation.ts:18-38` (salin pola UTC, bukan import, agar modul prepaid mandiri).

- [ ] **Step 1: Tulis failing test**

```ts
// src/core/prepaid/amortization.test.ts
import { describe, expect, it } from "vitest";
import { calculateAmortizationSchedule } from "./amortization";

describe("calculateAmortizationSchedule", () => {
  it("12 x 1jt untuk 12jt mulai Jan 2026", () => {
    const s = calculateAmortizationSchedule({ totalMinor: 1200000000n, startDate: "2026-01-15", months: 12 });
    expect(s).toHaveLength(12);
    expect(s[0]).toMatchObject({ periodName: "2026-01", amortDate: "2026-01-31", amountMinor: 100000000n });
    expect(s[11]).toMatchObject({ periodName: "2026-12", amortDate: "2026-12-31" });
    expect(s.reduce((a, x) => a + x.amountMinor, 0n)).toBe(1200000000n);
    expect(s[11].remainingMinor).toBe(0n);
  });
  it("sisa pembulatan jatuh di bulan terakhir", () => {
    const s = calculateAmortizationSchedule({ totalMinor: 10000000n, startDate: "2026-02-01", months: 3 });
    expect(s.map((x) => x.amountMinor)).toEqual([3333333n, 3333333n, 3333334n]);
    expect(s.reduce((a, x) => a + x.amountMinor, 0n)).toBe(10000000n);
  });
  it("months di luar 1-60 ditolak", () => {
    expect(() => calculateAmortizationSchedule({ totalMinor: 100n, startDate: "2026-01-01", months: 0 })).toThrow();
    expect(() => calculateAmortizationSchedule({ totalMinor: 100n, startDate: "2026-01-01", months: 61 })).toThrow();
  });
  it("total nol atau negatif ditolak", () => {
    expect(() => calculateAmortizationSchedule({ totalMinor: 0n, startDate: "2026-01-01", months: 12 })).toThrow();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bunx vitest run src/core/prepaid/amortization.test.ts`
Expected: FAIL (`Cannot find module './amortization'`).

- [ ] **Step 3: Implementasi minimal**

```ts
// src/core/prepaid/amortization.ts
export interface AmortizationScheduleItem {
  periodName: string;
  amortDate: string;
  amountMinor: bigint;
  accumulatedMinor: bigint;
  remainingMinor: bigint;
}

function endOfMonth(startDateISO: string, offset: number): { periodName: string; amortDate: string } {
  const [y, m] = startDateISO.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const last = String(new Date(Date.UTC(yy, d.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, "0");
  return { periodName: `${yy}-${mm}`, amortDate: `${yy}-${mm}-${last}` };
}

export function calculateAmortizationSchedule(args: { totalMinor: bigint; startDate: string; months: number }): AmortizationScheduleItem[] {
  const { totalMinor, startDate, months } = args;
  if (!Number.isInteger(months) || months < 1 || months > 60) throw new Error("JUMLAH_BULAN_TIDAK_VALID: months wajib 1–60.");
  if (totalMinor <= 0n) throw new Error("NOMINAL_TIDAK_VALID: total wajib lebih dari 0.");
  const monthly = totalMinor / BigInt(months);
  const out: AmortizationScheduleItem[] = [];
  let acc = 0n;
  for (let i = 0; i < months; i++) {
    const { periodName, amortDate } = endOfMonth(startDate, i);
    const amount = i === months - 1 ? totalMinor - acc : monthly;
    acc += amount;
    out.push({ periodName, amortDate, amountMinor: amount, accumulatedMinor: acc, remainingMinor: totalMinor - acc });
  }
  return out;
}
```

- [ ] **Step 4: Jalankan, pastikan lolos**

Run: `bunx vitest run src/core/prepaid/amortization.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/core/prepaid/amortization.ts src/core/prepaid/amortization.test.ts
git commit -m "feat(prepaid): helper jadwal amortisasi bulanan murni"
```

---

### Task 4: Repo prepaid — buat kontrak + posting amortisasi + actions (integration TDD)

**Files:**
- Create: `src/server/db/repos/prepaid.repo.ts`
- Create: `src/server/actions/prepaid.actions.ts`
- Test: `tests/integration/prepaid-posting.test.ts` (baru)

**Interfaces:**
- Consumes: `calculateAmortizationSchedule` (Task 3); `postJournalEntry(q, orgId, postedBy, {...})` (`src/server/db/repos/journals.repo.ts:356`); `insertSubledgerLinks` + `NewSubledgerLink` (`subledger.repo.ts:42`).
- Produces: `createPrepaidContract(q, input): Promise<{ contract, openingEntryId }>`; `postMonthlyAmortization(q, { orgId, periodName, postedBy, contractId? }): Promise<{ postedCount: number; journalEntryId: string | null }>`; actions `createPrepaidContractAction`, `postAmortizationAction` (mengembalikan `{ ok, ... }`, pesan Bahasa Indonesia).

Kontrak pembuatan sebelum menulis repo: baca `journals.repo.ts:356-440` (bentuk `JournalEntryInput`: `dateISO`, `memo`, `source`, `idempotencyKey`, `lines[]`) dan `cash-bank.repo.ts:100-160` (cara menempel `subledgerLinks` pada baris yang menyentuh akun kontrol). Bentuk baris yang dipakai:

```ts
lines: [
  { accountId: input.expenseAccountId, debitMinor: total, creditMinor: 0n },
  { accountId: input.controlAccountId, debitMinor: 0n, creditMinor: total,
    subledgerLinks: [{ kind: "DIMUKA", refId: contractId, amountMinor: total }] },
]
```

dengan `source: "DIMUKA"`. Jika `JournalEntryInput` menamai field links secara berbeda, ikuti file tersebut (bukan contoh ini).

- [ ] **Step 1: Tulis failing integration test (buat kontrak)**

```ts
// tests/integration/prepaid-posting.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { createPrepaidContract, postMonthlyAmortization } from "@/server/db/repos/prepaid.repo";
import { reconcileSubledger } from "@/server/db/repos/subledger.repo";

async function seedAccounts(orgId: string) {
  const pool = getPool();
  const q = async (code: string, name: string, type: string, normal: string) => {
    const r = await pool.query(
      `INSERT INTO accounts (org_id, code, name, type, normal) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [orgId, code, name, type, normal],
    );
    return r.rows[0].id as string;
  };
  const kas = await q("1110", "Kas", "ASET", "D");
  const dimuka = await q("1600", "Sewa Dibayar di Muka", "ASET", "D");
  const beban = await q("5300", "Beban Sewa", "BEBAN", "D");
  await pool.query(`INSERT INTO fiscal_periods (org_id, name, starts_on, ends_on, status) VALUES
    ($1,'2026-01','2026-01-01','2026-01-31','OPEN'), ($1,'2026-02','2026-02-01','2026-02-28','OPEN')`, [orgId]);
  await pool.query(`INSERT INTO subledger_controls (org_id, kind, control_account_id) VALUES ($1,'DIMUKA',$2)`, [orgId, dimuka]);
  await pool.end();
  return { kas, dimuka, beban };
}

describe("prepaid dimuka", () => {
  beforeEach(async () => { await truncateAll(); });
  it("buat kontrak → 12 jadwal + JE awal Dr1600/Cr1110 + links", async () => {
    const { orgId } = await makeOrg("org-prepaid");
    const acc = await seedAccounts(orgId);
    const res = await withOrg(orgId, (tx) => createPrepaidContract(tx, {
      orgId, name: "Sewa Ruko 12 bln", startDate: "2026-01-05", months: 12,
      totalMinor: 1200000000n, controlAccountId: acc.dimuka,
      expenseAccountId: acc.beban, paymentAccountId: acc.kas, postedBy: "owner@x.id",
    }));
    expect(res.contract.code).toMatch(/^DM-2026-\d{4}$/);
    const pool = getPool();
    const n = await pool.query(`SELECT COUNT(*)::int c FROM prepaid_schedule_lines WHERE contract_id=$1`, [res.contract.id]);
    expect(n.rows[0].c).toBe(12);
    const links = await pool.query(`SELECT kind, ref_id FROM subledger_journal_links WHERE ref_id=$1`, [res.contract.id]);
    expect(links.rows).toHaveLength(1);
    expect(links.rows[0].kind).toBe("DIMUKA");
    await pool.end();
  });
  it("posting 2x idempotent; recon cocok setelah 1 bulan", async () => {
    const { orgId } = await makeOrg("org-prepaid-2");
    const acc = await seedAccounts(orgId);
    await withOrg(orgId, (tx) => createPrepaidContract(tx, {
      orgId, name: "Sewa", startDate: "2026-01-05", months: 12,
      totalMinor: 1200000000n, controlAccountId: acc.dimuka,
      expenseAccountId: acc.beban, paymentAccountId: acc.kas, postedBy: "owner@x.id",
    }));
    const r1 = await withOrg(orgId, (tx) => postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "owner@x.id" }));
    const r2 = await withOrg(orgId, (tx) => postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "owner@x.id" }));
    expect(r1.postedCount).toBe(1);
    expect(r2.postedCount).toBe(0);
    const rows = await reconcileSubledger(db, orgId);
    expect(rows.find((r) => r.kind === "DIMUKA")?.differenceMinor).toBe(0n);
  });
  it("periode CLOSED ditolak", async () => {
    const { orgId } = await makeOrg("org-prepaid-3");
    const acc = await seedAccounts(orgId);
    await withOrg(orgId, (tx) => createPrepaidContract(tx, {
      orgId, name: "Sewa", startDate: "2026-01-05", months: 12,
      totalMinor: 1200000000n, controlAccountId: acc.dimuka,
      expenseAccountId: acc.beban, paymentAccountId: acc.kas, postedBy: "owner@x.id",
    }));
    const pool = getPool();
    await pool.query(`UPDATE fiscal_periods SET status='CLOSED' WHERE org_id=$1 AND name='2026-01'`, [orgId]);
    await pool.end();
    await expect(withOrg(orgId, (tx) =>
      postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "owner@x.id" }),
    )).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bunx vitest run tests/integration/prepaid-posting.test.ts`
Expected: FAIL (`Cannot find module '@/server/db/repos/prepaid.repo'`).

- [ ] **Step 3: Implementasi `prepaid.repo.ts`**

Fungsi `createPrepaidContract(q, input)` (semua dalam transaksi pemanggil via `withOrg` di actions; test memanggil langsung dengan `withOrg`):
1. Validasi: `months` 1–60 (helper Task 3 melempar bila invalid), `totalMinor > 0`, ketiga akun ada di org + bukan induk (cek `parentCode`: tolak bila ada akun lain ber-`parentCode` = kode akun ini — tiru pesan `GROUP_ACCOUNT`), periode `startDate` OPEN via `findPeriodByDate` (`periods.repo.ts:7`).
2. Nomor `DM-YYYY-NNNN`: `SELECT code ... WHERE org_id AND code LIKE 'DM-2026-%' ORDER BY code DESC LIMIT 1`, increment (pola `createFixedAsset`, `assets.repo.ts:36-51`).
3. Insert kontrak (`remainingMinor = totalMinor`, `monthlyMinor = total/months` floor).
4. Insert jadwal dari `calculateAmortizationSchedule`.
5. Posting JE awal via `postJournalEntry`: `dateISO: startDate`, memo `Sewa dibayar di muka: <name>`, `source: "DIMUKA"`, `idempotencyKey: 'dimuka-open-'+orgId+'-'+code`, lines Dr kontrol / Cr akun bayar + `subledgerLinks` pada baris kontrol (bentuk mengikuti `cash-bank.repo.ts:130-148`).

Fungsi `postMonthlyAmortization(q, { orgId, periodName, postedBy, contractId? })` meniru `postMonthlyDepreciation` (`assets.repo.ts:195-321`):
1. Ambil baris `SCHEDULED` periode tersebut (filter `contractId` bila diisi; join kontrak `ACTIVE` saja).
2. Kosong → `{ postedCount: 0, journalEntryId: null }`.
3. Agregat per `(expenseAccountId, controlAccountId)` → lines Dr beban / Cr kontrol + `subledgerLinks` per baris kredit (`kind: "DIMUKA"`, `refId: contractId`, `amountMinor` = porsi kontrak itu).
4. `postJournalEntry` memo `Amortisasi dimuka periode <periodName>`, `source: "DIMUKA"`, `idempotencyKey: 'amort-'+orgId+'-'+(contractId ?? 'all')+'-'+periodName`.
5. Update baris → POSTED + `journalEntryId`; update `accumulatedMinor/remainingMinor` kontrak; COMPLETED bila sisa 0.
6. Validasi periode CLOSED/LOCKED ditolak oleh `postJournalEntry` (jangan validasi ulang manual).

`prepaid.actions.ts` (pola `subledger.actions.ts:19-35`):

```ts
"use server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { createPrepaidContract, postMonthlyAmortization } from "@/server/db/repos/prepaid.repo";

export async function createPrepaidContractAction(input: {
  name: string; vendor?: string; startDate: string; months: number;
  totalMinor: string; controlAccountId: string; expenseAccountId: string; paymentAccountId: string;
}) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await withOrg(ctx.orgId, (tx) => createPrepaidContract(tx, {
      orgId: ctx.orgId, ...input, months: Number(input.months),
      totalMinor: BigInt(input.totalMinor), postedBy: ctx.userEmail,
    }));
    return { ok: true as const, contractId: res.contract.id, code: res.contract.code };
  } catch (err: unknown) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Gagal menyimpan kontrak" };
  }
}

export async function postAmortizationAction(input: { periodName: string; contractId?: string }) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const res = await withOrg(ctx.orgId, (tx) => postMonthlyAmortization(tx, {
      orgId: ctx.orgId, periodName: input.periodName, postedBy: ctx.userEmail, contractId: input.contractId,
    }));
    return { ok: true as const, postedCount: res.postedCount };
  } catch (err: unknown) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Gagal memposting amortisasi" };
  }
}
```

Field `ctx.userEmail`: sesuai `AppContext` (`src/server/auth/guard.ts:8-19`, `session.ts:45-49`).

Batasan yang disengaja (konsisten dengan `postMonthlyDepreciation` yang sudah ada): reversal atas JE amortisasi TIDAK mengembalikan baris jadwal ke SCHEDULED — selisih yang timbul tertangkap sebagai temuan HIGH `SUBLEDGER_MISMATCH` lewat `reportSubledgerMismatch`. Koreksi yang benar adalah reversal + posting ulang periode tersebut.

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `bunx vitest run tests/integration/prepaid-posting.test.ts`
Expected: PASS (3/3). Jika FAIL `AKUN_KONTROL_WAJIB_VIA_MODUL`, links belum menempel pada baris kontrol — perbaiki mengikuti `cash-bank.repo.ts`.

- [ ] **Step 5: Typecheck + commit**

Run: `bunx tsc --noEmit` — Expected: bersih (sisa error union di `journals.repo.ts:63` diperbaiki di Task 5).

```bash
git add src/server/db/repos/prepaid.repo.ts src/server/actions/prepaid.actions.ts tests/integration/prepaid-posting.test.ts
git commit -m "feat(prepaid): kontrak dimuka + posting amortisasi bulanan idempotent"
```

---

### Task 5: Recon DIMUKA + ASET_TETAP + seed + lebarkan union links

**Files:**
- Modify: `src/server/db/repos/subledger.repo.ts:19-32,86-106`
- Modify: `src/server/db/repos/journals.repo.ts:63` (ganti union literal dengan `SubledgerKind` dari `../schema/subledger`)
- Modify: `src/server/db/schema/journal.ts:22` (tambah `"DIMUKA"` ke enum kolom `source`; kolom tetap `text`, CHECK dikuasai `tax.sql` dari Task 1/2)
- Modify: `src/server/onboarding/engine.ts:657-664`
- Test: `tests/integration/subledger-recon-dimuka-aset.test.ts` (baru)

**Interfaces:**
- Consumes: tabel prepaid (Task 2), `fixed_assets` + `asset_depreciation_lines`.
- Produces: `subledgerTotalFor(q, orgId, "DIMUKA" | "ASET_TETAP")`; `getControlGlBalance` mendukung root famili `ASET_TETAP`; `seedSubledgerControls` menerima `dimukaAccountId?` + `assetAccountId?`.

Keputusan eksplisit (scope cut, sesuai temuan grounding): aset diposting ke daun `15xx` (mis. `1510`), jadi kontrol `ASET_TETAP` menunjuk `1500` sebagai **root famili** dan `getControlGlBalance` untuk kind ini mengagregat seluruh daun `15xx` normal-D dikurangi kontra `159x`. Guard manual-jurnal untuk daun `15xx` TIDAK diubah di plan ini (status quo, bukan regresi) — dicatat sebagai follow-up di review akhir.

- [ ] **Step 1: Tulis failing test**

```ts
// tests/integration/subledger-recon-dimuka-aset.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { reconcileSubledger } from "@/server/db/repos/subledger.repo";
import { createPrepaidContract, postMonthlyAmortization } from "@/server/db/repos/prepaid.repo";
import { createFixedAsset, postMonthlyDepreciation } from "@/server/db/repos/assets.repo";

async function seedMiniCoa(orgId: string) {
  const pool = getPool();
  const q = async (code: string, name: string, type: string, normal: string, parent?: string) => {
    const r = await pool.query(
      `INSERT INTO accounts (org_id, code, name, type, normal, parent_code) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [orgId, code, name, type, normal, parent ?? null],
    );
    return r.rows[0].id as string;
  };
  const acc = {
    kas: await q("1110", "Kas", "ASET", "D", "1100"),
    dimuka: await q("1600", "Sewa Dibayar di Muka", "ASET", "D", "1000"),
    bebanSewa: await q("5300", "Beban Sewa", "BEBAN", "D", "5000"),
    peralatan: await q("1510", "Peralatan Kantor", "ASET", "D", "1500"),
    akum: await q("1590", "Akumulasi Penyusutan", "ASET", "K", "1500"),
    bebanSusut: await q("5600", "Beban Penyusutan", "BEBAN", "D", "5000"),
  };
  await pool.query(`INSERT INTO accounts (org_id, code, name, type, normal) VALUES
    ($1,'1500','Peralatan','ASET','D'), ($1,'1000','ASET','ASET','D') ON CONFLICT DO NOTHING`, [orgId]);
  await pool.query(`INSERT INTO fiscal_periods (org_id, name, starts_on, ends_on, status) VALUES
    ($1,'2026-01','2026-01-01','2026-01-31','OPEN'), ($1,'2026-02','2026-02-01','2026-02-28','OPEN')`, [orgId]);
  await pool.query(
    `INSERT INTO subledger_controls (org_id, kind, control_account_id) VALUES
     ($1,'DIMUKA',$2), ($1,'ASET_TETAP',$3) ON CONFLICT DO NOTHING`,
    [orgId, acc.dimuka, (await pool.query(`SELECT id FROM accounts WHERE org_id=$1 AND code='1500'`, [orgId])).rows[0].id],
  );
  await pool.end();
  return acc;
}

describe("recon dimuka + aset", () => {
  beforeEach(async () => { await truncateAll(); });
  it("DIMUKA cocok setelah bayar + 1x amortisasi", async () => {
    const { orgId } = await makeOrg("org-recon-d");
    const acc = await seedMiniCoa(orgId);
    await withOrg(orgId, (tx) => createPrepaidContract(tx, {
      orgId, name: "Sewa", startDate: "2026-01-05", months: 12, totalMinor: 1200000000n,
      controlAccountId: acc.dimuka, expenseAccountId: acc.bebanSewa, paymentAccountId: acc.kas, postedBy: "o@x.id",
    }));
    await withOrg(orgId, (tx) => postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "o@x.id" }));
    const row = (await reconcileSubledger(db, orgId)).find((r) => r.kind === "DIMUKA")!;
    expect(row.differenceMinor).toBe(0n);
    expect(row.subledgerTotalMinor).toBe(1100000000n);
  });
  it("ASET_TETAP = nilai buku vs neto 15xx", async () => {
    const { orgId } = await makeOrg("org-recon-a");
    const acc = await seedMiniCoa(orgId);
    await withOrg(orgId, (tx) => createFixedAsset(tx, {
      orgId, name: "Laptop", category: "INVENTARIS_KANTOR",
      acquisitionDate: "2026-01-05", inServiceDate: "2026-01-01",
      acquisitionCostMinor: 1200000000n, usefulLifeMonths: 12,
      depreciationMethod: "STRAIGHT_LINE",
      assetAccountId: acc.peralatan, accumulatedDepAccountId: acc.akum,
      depreciationExpenseAccountId: acc.bebanSusut,
    }));
    await withOrg(orgId, (tx) => postMonthlyDepreciation(tx, { orgId, periodName: "2026-01", postedBy: "o@x.id" }));
    const row = (await reconcileSubledger(db, orgId)).find((r) => r.kind === "ASET_TETAP")!;
    expect(row.differenceMinor).toBe(0n);
    expect(row.subledgerTotalMinor).toBe(1100000000n);
  });
});
```

Catatan: `createFixedAsset` di test memposting JE perolehan atau tidak ditent
...[truncated 7375 chars]
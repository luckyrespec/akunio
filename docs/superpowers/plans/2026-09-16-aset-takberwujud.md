# Aset Takberwujud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modul Aset Takberwujud (SAK EMKM Bab 12) yang mencerminkan modul aset tetap: daftar, tambah + jurnal perolehan otomatis, amortisasi garis lurus bulanan, pelepasan, dan rekomendasi AI + RAG Bab 12.

**Architecture:** Tabel + repo + action + halaman terpisah yang meniru file aset tetap satu-per-satu (Pendekatan 1). Tanpa generalisasi tabel lama, tanpa mesin generik, tanpa kolom residu, tanpa saldo menurun.

**Tech Stack:** Next 16.3 App Router, Drizzle 0.45 + pg, BigInt minor untuk uang, TanStack Table v9 via `DataTable`, `FilterDrawer`, Interactions API `@google/genai`, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-16-aset-takberwujud-design.md` — rencana ini berargumen dari spek itu; eksekutor membaca keduanya. Satu deviasi eksplisit dari spek: enum status DB memakai Inggris (`ACTIVE/FULLY_AMORTIZED/DISPOSED`) mengikuti konvensi `fixed_assets`, label UI tetap Indonesia.

## Global Constraints

- Uang `numeric(18,2)` di DB, `bigint` minor di JS — tidak pernah `number` untuk nominal.
- Minor melintasi batas client→action sebagai string digit (`/^\d+$/`); parse rupiah tepat sekali.
- `withOrg` selalu `withOrg(orgId, fn)` — BUKAN `(db, orgId, fn)`.
- Model LLM via `models.ts` (`getGeminiModel()`, default `gemini-3.5-flash-lite`) — tidak hardcode, tidak model thinking, tidak `2.5-*`/`2.0-*`/`1.5-*`.
- Migrasi Drizzle ditulis tangan (IF NOT EXISTS + `--> statement-breakpoint`), journal +1000 dari idx terakhir, tanpa snapshot.
- `journal_entries.source` CHECK milik `tax.sql` — pakai `source: "MANUAL"` yang sudah diizinkan, jangan tambah source baru.
- Bahasa UI Indonesia; token Paper & Ink; `prefers-reduced-motion` dihormati.
- PowerShell 5.1 tanpa `&&` (rangkai dengan `; if ($?) { ... }`); `bun.exe` auto-load `.env` (untuk koneksi eksplisit pakai `node.exe`).

---

### Task 1: Skema + migrasi + RLS + daftar TRUNCATE

**Files:**
- Create: `src/server/db/schema/intangible.ts`
- Create: `drizzle/0025_intangible_assets.sql`
- Modify: `drizzle/meta/_journal.json` (tambah entri idx 25)
- Modify: `src/server/db/rls.sql` (tambah 4 nama tabel ke ARRAY)
- Modify: `tests/integration/helpers.ts` (TRUNCATE, baris 24-37)

**Interfaces:**
- Consumes: pola `src/server/db/schema/assets.ts:18-93` (`fixedAssets`, `assetDepreciationLines`).
- Produces: tabel `intangible_assets`, `intangible_amortization_lines`, `intangible_disposals`, `itb_seq_counters` untuk Task 4.

- [ ] **Step 1: Tulis skema Drizzle**

Buat `src/server/db/schema/intangible.ts` (cermin `assets.ts`, tanpa residu/tanah):

```ts
import {
  pgTable, uuid, text, varchar, date, numeric, integer,
  timestamp, uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, accounts } from "./org";
import { journalEntries } from "./journal";

export const intangibleAssets = pgTable(
  "intangible_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["LISENSI_SOFTWARE", "HAK_CIPTA", "PATEN", "MEREK_DAGANG", "GOODWILL", "LAINNYA"],
    }).notNull(),
    acquisitionDate: date("acquisition_date").notNull(),
    inServiceDate: date("in_service_date").notNull(),
    acquisitionCostMinor: numeric("acquisition_cost_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    amortizationMethod: text("amortization_method", { enum: ["STRAIGHT_LINE"] }).notNull().default("STRAIGHT_LINE"),
    assetAccountId: uuid("asset_account_id").notNull().references(() => accounts.id),
    accumulatedAccountId: uuid("accumulated_account_id").notNull().references(() => accounts.id),
    amortizationExpenseAccountId: uuid("amortization_expense_account_id").notNull().references(() => accounts.id),
    status: text("status", { enum: ["ACTIVE", "FULLY_AMORTIZED", "DISPOSED"] }).notNull().default("ACTIVE"),
    acquisitionPosted: boolean("acquisition_posted").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("intangible_assets_org_code_uq").on(t.orgId, t.code)],
);

export const intangibleAmortizationLines = pgTable(
  "intangible_amortization_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => intangibleAssets.id, { onDelete: "cascade" }),
    periodName: varchar("period_name", { length: 7 }).notNull(),
    amortizationDate: date("amortization_date").notNull(),
    amortizationAmountMinor: numeric("amortization_amount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
    accumulatedMinor: numeric("accumulated_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
    bookValueMinor: numeric("book_value_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    status: text("status", { enum: ["SCHEDULED", "POSTED"] }).notNull().default("SCHEDULED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("intangible_amor_asset_period_uq").on(t.assetId, t.periodName)],
);

export const intangibleDisposals = pgTable("intangible_disposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => intangibleAssets.id, { onDelete: "cascade" }),
  disposalDate: date("disposal_date").notNull(),
  disposalType: text("disposal_type", { enum: ["SALE", "SCRAP", "WRITE_OFF"] }).notNull(),
  proceedsMinor: numeric("proceeds_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
  bookValueAtDisposalMinor: numeric("book_value_at_disposal_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
  gainLossMinor: numeric("gain_loss_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
  depositAccountId: uuid("deposit_account_id").references(() => accounts.id),
  gainLossAccountId: uuid("gain_loss_account_id").notNull().references(() => accounts.id),
  journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itbSeqCounters = pgTable(
  "itb_seq_counters",
  {
    orgId: uuid("org_id").notNull(),
    year: integer("year").notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.year] })],
);
```

Perlu `boolean` juga diimpor dari `drizzle-orm/pg-core` (daftar impor di atas belum memuatnya — tambahkan).

- [ ] **Step 2: Tulis migrasi SQL tangan**

Buat `drizzle/0025_intangible_assets.sql` — `CREATE TABLE IF NOT EXISTS` untuk keempat tabel di atas (tipe: `uuid DEFAULT gen_random_uuid() PRIMARY KEY`, `numeric(18,0)`, FK `REFERENCES ... ON DELETE CASCADE`, UNIQUE `(org_id, code)` dan `(asset_id, period_name)`), pisahkan tiap statement dengan `--> statement-breakpoint` (preseden `drizzle/0024_asset_acquisition_posted.sql`).

- [ ] **Step 3: Daftarkan ke journal**

Tambah ke `drizzle/meta/_journal.json` setelah idx 24:

```json
{
  "idx": 25,
  "version": "7",
  "when": 1788900009000,
  "tag": "0025_intangible_assets",
  "breakpoints": true
}
```

- [ ] **Step 4: RLS + TRUNCATE**

Di `src/server/db/rls.sql`, tambah `'intangible_assets','intangible_amortization_lines','intangible_disposals',` dan `'itb_seq_counters',` ke ARRAY tabel tenant (satu baris dengan `'invoice_seq_counters','ast_seq_counters',`). Di `tests/integration/helpers.ts:35`, tambah `intangible_amortization_lines, intangible_disposals, intangible_assets, itb_seq_counters,` ke TRUNCATE.

- [ ] **Step 5: Verifikasi**

Run: `bunx tsc --noEmit`
Expected: PASS (skema terkompilasi; tabel terpakai di Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema/intangible.ts drizzle/0025_intangible_assets.sql drizzle/meta/_journal.json src/server/db/rls.sql tests/integration/helpers.ts
git commit -m "feat(intangible): skema + migrasi 0025 + RLS + TRUNCATE"
```

---

### Task 2: Jadwal amortisasi garis lurus (TDD murni)

**Files:**
- Create: `src/core/assets/amortization.ts`
- Test: `tests/unit/intangible-amortization.test.ts`

**Interfaces:**
- Consumes: tidak ada (murni; pola `src/core/assets/depreciation.ts:18-87`).
- Produces: `calculateAmortizationSchedule({acquisitionCostMinor, usefulLifeMonths, inServiceDate})` untuk Task 4.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { calculateAmortizationSchedule } from "@/core/assets/amortization";

describe("calculateAmortizationSchedule", () => {
  it("12000000/12 bulan mulai Jan 2026: 1000000/bulan, sisa pembulatan di bulan terakhir", () => {
    const s = calculateAmortizationSchedule({
      acquisitionCostMinor: 12_000_001_00n,
      usefulLifeMonths: 12,
      inServiceDate: "2026-01-15",
    });
    expect(s).toHaveLength(12);
    expect(s[0].periodName).toBe("2026-01");
    expect(s[0].amortizationDate).toBe("2026-01-31");
    expect(s[11].periodName).toBe("2026-12");
    const total = s.reduce((a, l) => a + l.amortizationAmountMinor, 0n);
    expect(total).toBe(12_000_001_00n);
    expect(s[11].bookValueMinor).toBe(0n);
  });

  it("menolak masa manfaat <= 0", () => {
    expect(() =>
      calculateAmortizationSchedule({ acquisitionCostMinor: 100n, usefulLifeMonths: 0, inServiceDate: "2026-01-01" }),
    ).toThrow("Masa manfaat");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/intangible-amortization.test.ts`
Expected: FAIL with "Cannot find module '@/core/assets/amortization'".

- [ ] **Step 3: Write minimal implementation**

Buat `src/core/assets/amortization.ts` — salin struktur `calculateDepreciationSchedule` cabang `STRAIGHT_LINE` (`depreciation.ts:18-87`) dengan pemetaan: `salvageValueMinor` dihapus (basis = penuh `acquisitionCostMinor`), field `depreciationDate`→`amortizationDate`, `depreciationAmountMinor`→`amortizationAmountMinor`, `accumulatedDepreciationMinor`→`accumulatedMinor`. Bulan terakhir menyerap sisa pembulatan. `usefulLifeMonths <= 0` throw `"Masa manfaat aset takberwujud harus lebih besar dari 0 bulan."`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/intangible-amortization.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/assets/amortization.ts tests/unit/intangible-amortization.test.ts
git commit -m "feat(intangible): jadwal amortisasi garis lurus + test"
```

---

### Task 3: Repo `intangible-assets.repo.ts` (TDD integrasi)

**Files:**
- Create: `src/server/db/repos/intangible-assets.repo.ts`
- Test: `tests/integration/intangible-lifecycle.test.ts`

**Interfaces:**
- Consumes: tabel Task 1; `calculateAmortizationSchedule` (Task 2); `postJournalEntry(q, orgId, postedBy, {dateISO, memo, source, idempotencyKey, lines})`, `findEntryByIdempotencyKey(q, orgId, key)` dari `journals.repo`; `withOrg(orgId, fn)`; `Queryable` dari `./queryable`.
- Produces: `nextIntangibleCode`, `createIntangible`, `listIntangibles`, `getIntangibleDetail`, `postMonthlyAmortization`, `disposeIntangible` untuk Task 5.

- [ ] **Step 1: Write the failing test**

Cermin `tests/integration/asset-lifecycle.test.ts:1-110` (setup org + `fiscalPeriods` 2026-01..03 OPEN + akun 1110 bank / 1710 aset takberwujud / 1810 akumulasi amortisasi / 6210 beban amortisasi / 7110 laba-rugi pelepasan; `truncateAll` di before/afterAll; `describe.skipIf(process.env.SKIP_DB_TESTS === "1")`):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import {
  createIntangible,
  postMonthlyAmortization,
  disposeIntangible,
} from "@/server/db/repos/intangible-assets.repo";
import { withOrg } from "@/server/db/repos/with-org";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Intangible lifecycle", () => {
  let orgId: string;
  let bankAccId: string; let assetAccId: string;
  let accumAccId: string; let expAccId: string; let gainLossAccId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Intangible Lifecycle")).orgId;
    await db.insert(fiscalPeriods).values([
      { orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN" },
      { orgId, name: "2026-02", startsOn: "2026-02-01", endsOn: "2026-02-28", status: "OPEN" },
    ]);
    const mk = (code: string, name: string, type: "ASET" | "BEBAN" | "PENDAPATAN", normal: "D" | "K", extra = {}) =>
      db.insert(accounts).values({ orgId, code, name, type, normal, ...extra }).returning();
    const [b] = await mk("1110", "Kas & Bank", "ASET", "D", { isBank: true });
    const [a] = await mk("1710", "Lisensi Software", "ASET", "D");
    const [d] = await mk("1810", "Akum. Amortisasi", "ASET", "K", { contra: true });
    const [e] = await mk("6210", "Beban Amortisasi", "BEBAN", "D");
    const [g] = await mk("7110", "Laba/Rugi Pelepasan", "PENDAPATAN", "K");
    bankAccId = b.id; assetAccId = a.id; accumAccId = d.id; expAccId = e.id; gainLossAccId = g.id;
  });

  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  async function makeIntangible(name = "Lisensi Akuntansi") {
    return withOrg(orgId, (tx) =>
      createIntangible(tx, {
        orgId, name, category: "LISENSI_SOFTWARE",
        acquisitionDate: "2026-01-05", inServiceDate: "2026-01-01",
        acquisitionCostMinor: 12_000_000_00n, usefulLifeMonths: 12,
        assetAccountId: assetAccId, accumulatedAccountId: accumAccId,
        amortizationExpenseAccountId: expAccId,
      }),
    );
  }

  it("kode ITB-YYYY-NNNN + 12 baris jadwal", async () => {
    const asset = await makeIntangible();
    expect(asset.code).toMatch(/^ITB-2026-\d{4}$/);
    const detail = await withOrg(orgId, (tx) =>
      import("@/server/db/repos/intangible-assets.repo").then((m) =>
        m.getIntangibleDetail(tx, orgId, asset.id),
      ),
    );
    expect(detail?.schedule).toHaveLength(12);
    expect(detail?.schedule[0].amortizationAmountMinor).toBe(1_000_000_00n);
  });

  it("posting konkuren ganda satu jurnal", async () => {
    await makeIntangible("Lisensi Konkuren");
    const run = (period: string) =>
      withOrg(orgId, (tx) => postMonthlyAmortization(tx, { orgId, periodName: period, postedBy: "tester" }));
    const [a, b] = await Promise.all([run("2026-01"), run("2026-01")]);
    expect(a.journalEntryId).not.toBeNull();
    expect(a.journalEntryId).toBe(b.journalEntryId);
  });

  it("pelepasan SALE menutup jadwal sisa", async () => {
    const asset = await makeIntangible("Lisensi Dilepas");
    await withOrg(orgId, (tx) => postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "tester" }));
    const res = await withOrg(orgId, (tx) =>
      disposeIntangible(tx, {
        orgId, assetId: asset.id, disposalDate: "2026-02-10", disposalType: "SALE",
        proceedsMinor: 5_000_000_00n, depositAccountId: bankAccId,
        gainLossAccountId: gainLossAccId, postedBy: "tester",
      }),
    );
    expect(res.journalEntryId).not.toBeNull();
    const again = await withOrg(orgId, (tx) =>
      import("@/server/db/repos/intangible-assets.repo").then((m) =>
        m.getIntangibleDetail(tx, orgId, asset.id),
      ),
    );
    expect(again?.asset.status).toBe("DISPOSED");
  });
});
```

Sederhanakan impor dinamis di atas menjadi impor statis `getIntangibleDetail` di kepala file (ditulis dinamis di sini hanya agar contoh tetap pendek — di file nyata, impor statis).

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/integration/intangible-lifecycle.test.ts`
Expected: FAIL with "Cannot find module '@/server/db/repos/intangible-assets.repo'".
Prasyarat DB: `TEST_DATABASE_URL` + role menunjuk database `ledger_test` (lihat AGENTS.md “First-time setup”); bila belum ada, jalankan `bun run test:db:setup` dulu.

- [ ] **Step 3: Write minimal implementation**

Buat `src/server/db/repos/intangible-assets.repo.ts` sebagai cermin `assets.repo.ts:31-112` (counter + create), `:166-310` (detail + posting agregat), dan `disposeAsset` (`assets.repo.ts:311-472`, baca dulu) dengan pemetaan:
- `ast_seq_counters`→`itb_seq_counters`, kunci lock `` `itb:${orgId}:${year}` ``, prefix kode `ITB-`.
- `fixedAssets`→`intangibleAssets`, `assetDepreciationLines`→`intangibleAmortizationLines`, `assetDisposals`→`intangibleDisposals`.
- Jadwal dari `calculateAmortizationSchedule` (Task 2), selalu dibuat (tanpa cabang TANAH).
- Posting agregat per akun: kunci `` `amor:${orgId}:${periodName}` ``, idempotency `amor-${orgId}-${periodName}`, memo `Amortisasi ${periodName}`, `source: "MANUAL"` (jangan source baru — CHECK milik `tax.sql`).
- Jurnal pelepasan: Dr deposit (proceeds bila SALE) + Dr akumulasi (akumulasi terposting) + Dr/Cr selisih laba-rugi (plug) + Cr akun aset (biaya perolehan); `gainLossMinor` boleh negatif (rugi) — simpan apa adanya.
- Semua fungsi menerima `(q: Queryable, ...)` dan TIDAK membuka transaksi sendiri (wajib dalam transaksi pemanggil, pola `withOrg`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/integration/intangible-lifecycle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos/intangible-assets.repo.ts tests/integration/intangible-lifecycle.test.ts
git commit -m "feat(intangible): repo + lifecycle test"
```

---

### Task 4: Server actions (`intangible.actions.ts`)

**Files:**
- Create: `src/server/actions/intangible.actions.ts`
- Test: `tests/integration/intangible-actions.test.ts`

**Interfaces:**
- Consumes: repo Task 3; `requireContext` (seam `TEST_CTX_ORG` sebagai OWNER); `postJournalEntry` + `buildAcquisitionJournal`-untuk-intangible (lihat bawah); `recommendAssetWithSak`-untuk-intangible (Task 5).
- Produces: `createIntangibleWithAcquisitionAction`, `recommendIntangibleSakAction` untuk Task 7.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { recommendIntangibleSakAction } from "@/server/actions/intangible.actions";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Intangible actions", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Intangible Actions")).orgId;
    await db.insert(fiscalPeriods).values([
      { orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN" },
    ]);
    process.env.TEST_CTX_ORG = orgId;
    process.env.AI_MOCK = "1";
  });

  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    delete process.env.AI_MOCK;
    await truncateAll();
  });

  it("rekomendasi luring mengembalikan kategori + analisis", async () => {
    const res = await recommendIntangibleSakAction({ name: "Lisensi Akuntansi", category: "LAINNYA" });
    expect(res.ok).toBe(true);
    expect(res.data?.category).toBe("LISENSI_SOFTWARE");
    expect(res.data?.sakRef).toContain("Bab 12");
    expect(res.data?.heuristic).toBe(true);
  });

  it("nama kosong ditolak tanpa memanggil AI", async () => {
    const res = await recommendIntangibleSakAction({ name: "   ", category: "LAINNYA" });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/integration/intangible-actions.test.ts`
Expected: FAIL with "Cannot find module '@/server/actions/intangible.actions'".

- [ ] **Step 3: Write minimal implementation**

Buat `src/server/actions/intangible.actions.ts` meniru `assets.actions.ts:1-80` (`fail` helper, `AssetActionResult` → ganti nama generik `IntangibleActionResult`):
- `createIntangibleWithAcquisitionAction(payload)` — cermin `createFixedAssetAction` + `createAssetWithAcquisitionAction` (baca `assets.actions.ts:55-140` dulu): parse `acquisitionCostText` via `Money.parseIdr(...).minor` (SATU KALI di action), `withOrg` → `createIntangible` → bila `postAcquisition`, posting jurnal via `buildAcquisitionJournal` (reuse `core/assets/acquisition.ts` apa adanya — memo generik "Perolehan aset …" berlaku) + tandai `acquisitionPosted`. Uang masuk sebagai string digit; validasi `/^\d+$/` di klien.
- `recommendIntangibleSakAction({name, category})` — `requireContext()` (semua peran, read-only), tolak nama kosong, teruskan ke Task 5, bungkus `fail`.
- `postIntangibleAmortizationAction({periodName})` — `requireContext(["OWNER","ACCOUNTANT"])`, `withOrg` → `postMonthlyAmortization` (Task 3) → `revalidatePath("/aset-takberwujud")`.
- `disposeIntangibleAction({assetId, disposalDate, disposalType, proceedsMinorText, depositAccountId, gainLossAccountId, notes?})` — peran OWNER/ACCOUNTANT, `withOrg` → `disposeIntangible` (Task 3) → `revalidatePath`. `proceedsMinorText` string digit (`"0"` bila SCRAP/WRITE_OFF tanpa hasil).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/integration/intangible-actions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/intangible.actions.ts tests/integration/intangible-actions.test.ts
git commit -m "feat(intangible): server actions + test"
```

---

### Task 5: Rekomendasi AI + RAG Bab 12 (TDD unit, hermetik)

**Files:**
- Create: `src/server/ai/intangible-recommend.ts`
- Test: `tests/unit/intangible-recommend-sak.test.ts`

**Interfaces:**
- Consumes: `getSakChapterByBab` (`sak-docs.repo`), `getGeminiModel` (`models.ts`), `GoogleGenAI` interactions (pola `asset-recommend.ts` lengkap — baca file itu dulu, ±150 baris).
- Produces: `recommendIntangibleWithSak(name, userCategory)` untuk Task 4.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, afterEach } from "vitest";
import { recommendIntangibleWithSak } from "@/server/ai/intangible-recommend";

const savedMock = process.env.AI_MOCK;
const savedKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (savedMock === undefined) delete process.env.AI_MOCK;
  else process.env.AI_MOCK = savedMock;
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedKey;
});

describe("recommendIntangibleWithSak (luring)", () => {
  it("AI_MOCK=1 tanpa network, kategori lisensi", async () => {
    process.env.AI_MOCK = "1";
    const r = await recommendIntangibleWithSak("Lisensi Akuntansi Awan", "LAINNYA");
    expect(r.heuristic).toBe(true);
    expect(r.category).toBe("LISENSI_SOFTWARE");
    expect(r.sakRef).toContain("Bab 12");
    expect(r.analysis.length).toBeGreaterThan(0);
  });

  it("tanpa API key jatuh ke heuristik", async () => {
    delete process.env.AI_MOCK;
    delete process.env.GEMINI_API_KEY;
    const r = await recommendIntangibleWithSak("Merek Dagang Kopi", "LAINNYA");
    expect(r.heuristic).toBe(true);
    expect(r.category).toBe("MEREK_DAGANG");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/intangible-recommend-sak.test.ts`
Expected: FAIL with "Cannot find module '@/server/ai/intangible-recommend'".

- [ ] **Step 3: Write minimal implementation**

Buat `src/server/ai/intangible-recommend.ts` sebagai salinan `asset-recommend.ts` dengan penggantian:
- Bab RAG `11`→`12`, `sakRef` `"SAK EMKM Bab 12"`.
- Enum kategori → `["LISENSI_SOFTWARE","HAK_CIPTA","PATEN","MEREK_DAGANG","GOODWILL","LAINNYA"]`; tanpaaua `method` di output (garis lurus implisit — hilangkan dari schema).
- Heuristik luring kata kunci: lisensi/software/aplikasi→LISENSI_SOFTWARE (48 bln); cipta/buku/lagu/film→HAK_CIPTA (60); paten→PATEN (120); merek/brand/logo→MEREK_DAGANG (120); goodwill→GOODWILL (60); default LAINNYA (60). Analisis jujur berlabel luring.
- Prompt: sebutkan umur wajar di atas sebagai jangkar; larang halusinasi nomor paragraf (rujuk "Bab 12" saja); `store:false`; retry 2; gagal RAG → lanjut tanpa konteks; gagal total / tanpa key / `AI_MOCK=1` → heuristik.
- Masa manfaat clamp 1–600.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/intangible-recommend-sak.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/intangible-recommend.ts tests/unit/intangible-recommend-sak.test.ts
git commit -m "feat(intangible): rekomendasi AI + RAG Bab 12"
```

---

### Task 6: Sidebar + ikon

**Files:**
- Modify: `src/components/icons/index.tsx` (tambah `IconIntangible`)
- Modify: `src/components/sidebar-nav.tsx` (tambah item grup Akuntansi)
- Test: `bunx tsc --noEmit` (tidak ada test unit ikon; verifikasi visual di Task 10)

**Interfaces:**
- Consumes: pola `IconAssets` (`icons/index.tsx:81-85`, `createIcon` + path SVG 24px stroke 1.8).
- Produces: nav `/aset-takberwujud` untuk Task 8–10.

- [ ] **Step 1: Tambah ikon (tidak ada test gagal dulu — lewati TDD murni, ganti verifikasi tsc)**

Tambahkan setelah `IconAssets`:

```tsx
export const IconIntangible = createIcon(() => (
  <>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M9 13h6M9 17h4" />
  </>
));
```

(dokumen berlisensi: tiru gaya `IconReports`, tambah garis teks + segel titik — variasikan path terakhir menjadi badge kecil bila ingin beda.)

- [ ] **Step 2: Tambah item nav**

Di `sidebar-nav.tsx` grup `akuntansi`, setelah entri Aset Tetap:

```tsx
{ href: "/aset-takberwujud", label: "Aset Takberwujud", desc: "Lisensi, merek, dan amortisasinya", icon: IconIntangible },
```

tambah `IconIntangible` ke impor ikon. Samakan perilaku `match` dengan entri `/aset` (baca entri itu dulu — bila `/aset` tanpa `match` kustom, tidak perlu).

- [ ] **Step 3: Verifikasi**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/icons/index.tsx src/components/sidebar-nav.tsx
git commit -m "feat(intangible): ikon + menu sidebar"
```

---

### Task 7: Halaman daftar (`/aset-takberwujud`)

**Files:**
- Create: `src/app/(app)/aset-takberwujud/page.tsx`
- Create: `src/app/(app)/aset-takberwujud/list-client.tsx`
- Test: render test? Pola repo: tabel diuji via e2e/testid. Tambahkan `getRowProps` tanpa testid baru (tidak ada kontrak e2e untuk halaman baru) — verifikasi = tsc + cek manual Task 10.

**Interfaces:**
- Consumes: `DataTable` + `FilterDrawer` primitives (`FilterSearchInput`, `FilterTriggerButton`, `FilterChips`, `FilterSection`, `FilterSegGroup`); pola `src/app/(app)/buku-pembantu/aset/list-client.tsx` lengkap (search + drawer status + footer + empty dua varian).
- Produces: daftar untuk navigasi Task 9.

- [ ] **Step 1: Tulis halaman server + client**

`page.tsx`: `requireContext` → `withOrg` → `listIntangibles` (Task 3) → `PageHeader` (title "Aset Takberwujud", eyebrow menyebut Bab 12) + tombol "Tambah Aset Takberwujud" → `/aset-takberwujud/baru` + `<AsetTakberwujudListClient rows={rows} />`. Cermin `buku-pembantu/aset/page.tsx` (baca file itu — ±40 baris setelah migrasi kemarin).

`list-client.tsx` (`"use client"`): kolom Kode (mono terra), Nama (link `/aset-takberwujud/${id}`), Kategori (label map ID: LISENSI_SOFTWARE→"Lisensi Software", HAK_CIPTA→"Hak Cipta", PATEN→"Paten", MEREK_DAGANG→"Merek Dagang", GOODWILL→"Goodwill", LAINNYA→"Lainnya"), Tgl Perolehan, Biaya (`meta.numeric`), Akumulasi (`meta.numeric`), Nilai Buku (`meta.numeric` bold), Status (badge ACTIVE→"Aktif" emerald / FULLY_AMORTIZED→"Tuntas" blue / DISPOSED→"Dilepas" rose) + footer total 3 kolom + empty dua varian. Filter: search kode/nama + drawer Status (SEMUA/Aktif/Tuntas/Dilepas). `sorting={false} pagination={false}`, `getRowId`, `getRowProps` row-enter.

- [ ] **Step 2: Verifikasi**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/aset-takberwujud/page.tsx src/app/\(app\)/aset-takberwujud/list-client.tsx
git commit -m "feat(intangible): halaman daftar + filter"
```

---

### Task 8: Halaman tambah (`/aset-takberwujud/baru`) + tombol AI

**Files:**
- Create: `src/app/(app)/aset-takberwujud/baru/page.tsx`
- Create: `src/app/(app)/aset-takberwujud/baru/intangible-baru-client.tsx`

**Interfaces:**
- Consumes: action Task 4; pola `src/app/(app)/aset/baru/aset-baru-client.tsx` (form + panel analisis SAK EMKM + error banner).
- Produces: entri data untuk Task 9.

- [ ] **Step 1: Tulis halaman + form**

`page.tsx`: server — muat opsi akun daun (salin query pemilih akun dari `aset/baru/page.tsx` — baca dulu; field yang dibutuhkan: id/code/name/type/isCash/isBank/parentCode) → `<IntangibleBaruClient accounts={...} />`.

`intangible-baru-client.tsx` (`"use client"`): salin struktur `aset-baru-client.tsx` dengan pengurangan: TANPA field residu, TANPA select metode (tetap garis lurus, tampilkan sebagai teks statis), TANPA cabang TANAH, kategori select 6 opsi. Tombol "Rekomendasi Cerdas SAK EMKM" di kartu Amortisasi → `recommendIntangibleSakAction({name, category})` → terapkan kategori/bulan + panel analisis (badge `sakRef`, badge "Mode luring" bila `heuristic`) — salin pola panel `aset-baru-client.tsx` (±30 baris). Submit → `createIntangibleWithAcquisitionAction` (uang sebagai string digit; parse sekali di action) → sukses ke `/aset-takberwujud/${id}`. Error ke banner `role="alert"`.

- [ ] **Step 2: Verifikasi**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/aset-takberwujud/baru/
git commit -m "feat(intangible): form tambah + rekomendasi AI"
```

---

### Task 9: Halaman detail (`/aset-takberwujud/[id]`) + posting + lepas

**Files:**
- Create: `src/app/(app)/aset-takberwujud/[id]/page.tsx`
- Create: komponen klien tabel jadwal + tombol aksi (satu file `detail-client.tsx`, atau dua file meniru `asset-detail-client.tsx` + dialog disposal — baca file aset itu dulu, putuskan di tempat; tidak boleh lebih dari 2 file baru).

**Interfaces:**
- Consumes: `getIntangibleDetail` (Task 3); pola `DataTable` + footer; pola tombol posting + dialog dari modul aset.

- [ ] **Step 1: Tulis halaman + client**

`page.tsx`: validasi UUID → `requireContext` → `withOrg` → `getIntangibleDetail` → `notFound()` bila null → kartu ringkasan (Biaya, Akumulasi, Nilai Buku + meter progres, meniru `[id]` aset) + `<DetailClient .../>`.
Client: `DataTable` kolom Periode (mono), Tanggal, Jumlah/Biaya (`meta.numeric`), Akumulasi, Sisa, Status (Terposting emerald/Terjadwal netral), Jurnal (link/`—`) + footer Total kontrak; tombol "Posting bulan ini" → `postIntangibleAmortizationAction` (Task 4); dialog pelepasan (tipe SALE/SCRAP/WRITE_OFF + proceeds + akun) → `disposeIntangibleAction` (Task 4). Semua string uang tetap string digit sampai repo.

- [ ] **Step 2: Verifikasi**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/aset-takberwujud/\[id\]/
git commit -m "feat(intangible): detail + posting + pelepasan"
```

---

### Task 10: Verifikasi akhir + bit RLS

**Files:** (tidak ada file baru; verifikasi + commit kosong bila perlu)

- [ ] **Step 1: Terapkan SQL mentah ke dev**

Run: `bun run db:sql`
Expected: `*.sql` termasuk RLS baru teraplikasi tanpa error (idempoten).

- [ ] **Step 2: RLS isolation suite**

Run: `bun run test:rls`
Expected: PASS (policy tenant baru ikut pola lama).

- [ ] **Step 3: Suite terkait**

Run: `bunx vitest run tests/integration/intangible-lifecycle.test.ts tests/integration/intangible-actions.test.ts tests/unit/intangible-amortization.test.ts tests/unit/intangible-recommend-sak.test.ts tests/integration/asset-lifecycle.test.ts`
Expected: PASS semua (aset tetap tidak regresi).

- [ ] **Step 4: Build + cek manual**

Run: `bun run build`
Expected: hijau. Cek manual: `/aset-takberwujud` → tambah lisensi → tombol AI (dengan dan tanpa `GEMINI_API_KEY`; label "Mode luring" muncul saat luring) → posting 1 bulan → lepas → angka jurnal seimbang.

- [ ] **Step 5: Commit final (bila ada perbaikan)**

```bash
git add -A
git commit -m "feat(intangible): finalisasi modul aset takberwujud"
```

---

## Self-Review

- **Cakupan spek:** skema+RLS (Task 1) ✓; repo/action/AI (Task 3–5) ✓; UI list/baru/detail (Task 7–9) ✓; testing (Task 2–5,10) ✓. Sitasi `SakRuleSheet` Bab 12 sesuai spek ("bila ditambahkan nanti") — di luar rencana, benar.
- **Placeholder:** tidak ada TBD/TODO; setiap langkah berisi kode/perintah ekspektasi konkret.
- **Konsistensi tipe:** `AssetSakRecommendation` didefinisikan sekali di Task 5 dan dipakai Task 4; nama tabel/kolom/fungsi identik di Task 1–4; `buildAcquisitionJournal` dipakai ulang (memo generiknya berlaku untuk takberwujud); `source:"MANUAL"` konsisten agar CHECK `tax.sql` tak tersentuh.

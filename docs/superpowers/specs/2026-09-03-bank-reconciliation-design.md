# Spesifikasi Desain: Rekonsiliasi Bank Otomatis & Manual (Milestone 2.2)

**Tanggal**: 2026-09-03  
**Status**: Draft Disetujui  
**Branch Target**: `feat/bank-reconciliation`  

---

## 1. Latar Belakang & Tujuan

Dalam operasional bisnis harian, mutasi riil pada rekening bank sering kali memiliki selisih waktu pencatatan atau mutasi tak terduga (seperti biaya administrasi bank, potongan transfer, pajak bunga giro, atau pembayaran piutang langsung tanpa konfirmasi) yang belum tercatat pada buku besar akuntansi perusahaan (*General Ledger*).

Tujuan dari **Milestone 2.2** adalah menyediakan sistem **Rekonsiliasi Bank Cerdas** yang:
1. Menerima unggahan dokumen rekening koran (PDF, gambar mutasi, atau file spreadsheet CSV/XLSX) dari berbagai bank lokal di Indonesia (BCA, Mandiri, BNI, BRI, dll.).
2. Menggunakan kemampuan multimodal **Gemini API** (`gemini-3.5-flash-lite`, `store: false`) dengan *Structured Output* untuk membaca dan mengekstrak mutasi rekening koran tanpa membutuhkan parser regex khusus yang kaku dan rentang rusak.
3. Menerapkan **3-Tier Intelligent Matching Engine**:
   - **Tingkat 1**: *Exact Auto-Match* (100% cocok pada nominal, arah mutasi, dan toleransi tanggal ±3 hari).
   - **Tingkat 2**: *AI Recommendation Match* (70%–95% keyakinan berdasarkan pencocokan nama pelanggan/nomor faktur dalam deskripsi mutasi).
   - **Tingkat 3**: *Actionable Unmatched* (pembuatan jurnal cepat 1-klik untuk biaya admin/bunga bank, atau pencocokan manual).
4. Menyediakan antarmuka visual **Side-by-Side Dual-Pane Matcher** (`/rekonsiliasi` dan `/rekonsiliasi/[id]`) dengan indikator selisih saldo *real-time* (harus Rp 0 untuk menyelesaikan sesi).
5. Mengintegrasikan percakapan AI dengan **Nara AI** untuk memeriksa status rekonsiliasi dan menjalankan auto-matching langsung lewat chat.

---

## 2. Arsitektur Data & Skema Database

File: `src/server/db/schema/reconciliation.ts`

### A. Tabel `bank_reconciliations`
Menyimpan sesi kerja rekonsiliasi per akun bank per periode cut-off.

```typescript
export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "IN_PROGRESS",
  "COMPLETED",
]);

export const bankReconciliations = pgTable("bank_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  statementDate: date("statement_date").notNull(),
  statementBalanceMinor: numeric("statement_balance_minor", { mode: "bigint" }).notNull(),
  ledgerBalanceMinor: numeric("ledger_balance_minor", { mode: "bigint" }).notNull(),
  differenceMinor: numeric("difference_minor", { mode: "bigint" }).notNull().default(sql`0`),
  status: text("status").$type<"IN_PROGRESS" | "COMPLETED">().notNull().default("IN_PROGRESS"),
  fileUrl: text("file_url"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: varchar("completed_by", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("bank_rec_org_idx").on(t.orgId),
  index("bank_rec_account_idx").on(t.orgId, t.bankAccountId),
]);
```

### B. Tabel `bank_statement_lines`
Menyimpan setiap baris mutasi rekening koran yang diekstrak dari dokumen bank.

```typescript
export const bankStatementLines = pgTable("bank_statement_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  reconciliationId: uuid("reconciliation_id").notNull().references(() => bankReconciliations.id, { onDelete: "cascade" }),
  transactionDate: date("transaction_date").notNull(),
  description: text("description").notNull(),
  type: text("type").$type<"CR" | "DB">().notNull(), // CR = Uang Masuk, DB = Uang Keluar
  amountMinor: numeric("amount_minor", { mode: "bigint" }).notNull(),
  referenceNumber: varchar("reference_number", { length: 100 }),
  matchStatus: text("match_status").$type<"UNMATCHED" | "MATCHED" | "EXCLUDED">().notNull().default("UNMATCHED"),
  matchedJournalLineId: uuid("matched_journal_line_id").references(() => journalLines.id, { onDelete: "set null" }),
  confidenceScore: integer("confidence_score"), // 0 - 100
  aiNotes: text("ai_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("stmt_lines_rec_idx").on(t.reconciliationId),
  index("stmt_lines_status_idx").on(t.reconciliationId, t.matchStatus),
]);
```

### C. Keamanan & RLS (`src/server/db/rls.sql`)
- Menambahkan tabel `bank_reconciliations` ke dalam `FORCE ROW LEVEL SECURITY`.
- `bank_statement_lines` diproteksi melalui subquery relasi `reconciliation_id` ke `bank_reconciliations.org_id = current_setting('app.current_org')::uuid`.

---

## 3. Pipeline Ekstraksi Gemini Multimodal

File: `src/server/ai/bank-statement-extractor.ts`

- **Model**: `gemini-3.5-flash-lite` (dengan `store: false` sesuai kaidah privasi finansial).
- **Proses**:
  1. File rekening koran diunggah ke storage S3 (SeaweedFS bucket `neraca-docs/bank-statements/...`).
  2. Buffer file dikirim langsung ke Gemini Interactions API dengan multimodal parts (`inlineData` atau URI).
  3. Menggunakan skema output ketat Zod / JSON Schema:
     ```typescript
     export const BankStatementExtractSchema = z.object({
       bankName: z.string(),
       accountNumber: z.string().optional(),
       statementPeriod: z.object({
         from: z.string().describe("YYYY-MM-DD"),
         to: z.string().describe("YYYY-MM-DD"),
       }),
       openingBalanceMinor: z.number().describe("Saldo awal dalam unit minor (sen)"),
       closingBalanceMinor: z.number().describe("Saldo akhir dalam unit minor (sen)"),
       transactions: z.array(
         z.object({
           date: z.string().describe("YYYY-MM-DD"),
           description: z.string(),
           type: z.enum(["CR", "DB"]),
           amountMinor: z.number().describe("Nominal mutasi dalam unit minor"),
           referenceNumber: z.string().optional(),
         })
       ),
     });
     ```
  4. Hasil parsing divalidasi dan disimpan langsung sebagai `bank_statement_lines` di dalam database transaksi.

---

## 4. Engine Pencocokan (Matching Engine) & Aksi Cepat

File: `src/core/reconciliation/matcher.ts` & `src/server/reconciliation/auto-match.ts`

### A. Konvensi Akuntansi Rekonsiliasi Bank
- Mutasi Bank **`CR` (Kredit Bank)** = Uang Masuk ke rekening → Sisi **Debet** pada akun Kas/Bank buku besar perusahaan.
- Mutasi Bank **`DB` (Debet Bank)** = Uang Keluar dari rekening → Sisi **Kredit** pada akun Kas/Bank buku besar perusahaan.

### B. Algoritma 3-Tier Matcher
1. **Tier 1: Exact Match (Keyakinan 100%)**:
   - `line.amountMinor === journalLine.amountMinor`
   - Posisi berlawanan: `line.type === 'CR'` cocok dengan `journalLine.debitMinor > 0n`, `line.type === 'DB'` cocok dengan `journalLine.creditMinor > 0n`.
   - `Math.abs(line.date - journalLine.date) <= 3 hari`.
   - Belum pernah ditautkan (`matched_journal_line_id IS NULL`).
   - Dipasangkan otomatis 1:1, status berubah menjadi `MATCHED`.

2. **Tier 2: AI Recommendation Match (Keyakinan 70% – 95%)**:
   - Jika nominal sama namun selisih tanggal &gt; 3 hari, atau
   - Teks pada `description` mutasi bank menyebut nama kontak pada tabel `contacts` atau nomor invoice (`INV-YYYY-NNNN`).
   - Status tetap `UNMATCHED`, namun `confidenceScore` terisi (misal: 85%) dan `aiNotes` menjelaskan kecocokan.
   - Di UI tampil sebagai kartu dengan badge **"Saran AI"** dan tombol 1-klik **"Setujui Match"**.

3. **Tier 3: Quick Journal Action (Mutasi Belum Ada di Buku Besar)**:
   - **Biaya Admin Bank** (DB mutasi): Memposting jurnal seimbang:
     - Debet: `6200 Beban Administrasi Bank`
     - Kredit: Akun Bank terkait
     - Otomatis menautkan baris mutasi bank menjadi `MATCHED`.
   - **Pendapatan Bunga/Giro Bank** (CR mutasi): Memposting jurnal seimbang:
     - Debet: Akun Bank terkait
     - Kredit: `4200 Pendapatan Bunga`
     - Otomatis menautkan baris mutasi bank menjadi `MATCHED`.
   - **Pencocokan Manual**: Memungkinkan akuntan mencentang 1 baris mutasi bank dan 1 baris jurnal kas, lalu menekan **"Hubungkan Manual"**.

### C. Kalkulasi Selisih Rekonsiliasi
- `statementBalanceMinor`: Saldo akhir rekening koran bank.
- `reconciledLedgerBalanceMinor`: Saldo buku kas/bank yang sudah berstatus `MATCHED`.
- `differenceMinor = statementBalanceMinor - reconciledLedgerBalanceMinor`.
- Tombol **"Kunci & Selesaikan Rekonsiliasi"** hanya aktif jika `differenceMinor === 0n`.

---

## 5. Antarmuka Pengguna (UI/UX)

1. **Sidebar Navigation (`src/components/sidebar-nav.tsx`)**:
   - Menu: **Rekonsiliasi Bank** (`/rekonsiliasi`, Ikon `ArrowLeftRight`).

2. **Dasbor Sesi Rekonsiliasi (`src/app/(app)/rekonsiliasi/page.tsx`)**:
   - Kartu KPI ringkasan akun kas & bank (saldo buku vs status rekonsiliasi terakhir).
   - Tabel riwayat sesi rekonsiliasi dengan filter status (`IN_PROGRESS`, `COMPLETED`).
   - Dialog **"+ Mulai Rekonsiliasi Baru"**:
     - Memilih akun bank (BCA, Mandiri, BRI, dll.).
     - Upload file rekening koran (PDF, JPEG, PNG, CSV, XLSX).
     - Tombol "Unggah & Ekstrak dengan Gemini AI".

3. **Worksheet Rekonsiliasi Side-by-Side (`src/app/(app)/rekonsiliasi/[id]/page.tsx`)**:
   - **Sticky Status Bar**:
     - 3 Indikator saldo: Saldo Rekening Koran vs Saldo Buku Kas vs Selisih.
     - Badge hijau `"Seimbang (Rp 0)"` jika `differenceMinor === 0n`.
     - Tombol aksi utama: **"Auto-Match Semua (AI)"** dan **"Selesaikan Rekonsiliasi"**.
   - **Dual-Pane Layout**:
     - *Pane Kiri (Mutasi Bank)*: Daftar baris rekening koran. Filter (*Semua, Belum Cocok, Saran AI, Cocok*). Tombol cepat *"Setujui Saran AI"*, *"Catat Biaya Admin/Bunga"*.
     - *Pane Kanan (Buku Kas Neraca)*: Daftar transaksi kas/bank buku besar yang belum direkonsiliasi.
     - Memungkinkan centang dan klik *"Hubungkan Manual"*.

---

## 6. Tools Nara AI Chat

File: `src/server/ai/nara-tools.ts`
- **`get_bank_reconciliation_status`**:
  - Mengambil data sesi rekonsiliasi aktif dan status selisih rekening koran bank.
  - Memberikan saran tindakan proaktif jika terdapat selisih.
- **`auto_match_bank_reconciliation`**:
  - Menjalankan proses auto-match Tier 1 & Tier 2 langsung dari instruksi chat pengguna.

---

## 7. Rencana Pengujian (Test-Driven Development)

1. **Unit Test**:
   - `tests/unit/reconciliation/matcher.test.ts`:
     - Pengujian pemetaan debet/kredit bank vs buku besar.
     - Pengujian toleransi tanggal kliring (≤3 hari).
     - Pengujian kalkulasi selisih saldo (*reconciliation difference*).
2. **Integration Test**:
   - `tests/integration/reconciliation-repo.test.ts`:
     - Pembuatan sesi rekonsiliasi dan penyimpanan baris mutasi bank.
     - Penautan baris mutasi dengan baris jurnal.
   - `tests/integration/reconciliation-quick-journal.test.ts`:
     - Pembuatan jurnal cepat biaya admin bank dan bunga bank secara seimbang (*balanced*).
3. **UI & End-to-End Build Verification**:
   - `bunx tsc --noEmit` (strict TypeScript, 0 error).
   - `bun run test` (seluruh suite test Vitest lulus).
   - `bun run build` (semua rute Next.js terkompilasi sukses).

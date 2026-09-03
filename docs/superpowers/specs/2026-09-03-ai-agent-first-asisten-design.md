# Spesifikasi Desain: AI Agent First & Asisten Akuntansi Interaktif (Nara Copilot)

**Tanggal:** 2026-09-03  
**Status:** Approved by Human Partner  
**Target Rute:** `http://localhost:3000/asisten`, `/api/nara/*`, `src/components/ai-elements/*`

---

## 1. Ringkasan Eksekutif & Tujuan

Mengubah Neraca menjadi aplikasi **AI Agent First**, di mana Asisten AI (**Nara**) menjadi antarmuka sentral untuk konsultasi, analisis keuangan, hingga eksekusi mutasi data akuntansi (Full CRUD) di seluruh modul.

Fitur utama yang diimplementasikan:
1. **Manajemen Sesi Obrolan (ChatGPT/Gemini Style)**: Pembuatan sesi percakapan baru, pengubahan nama judul sesi (*rename inline*), dan penghapusan sesi (*cascade delete*).
2. **Multi-Attachment Dokumen Persisten**: Pengguna dapat mengunggah beberapa dokumen (foto struk, kwitansi, nota, faktur PDF ≤ 5MB) per pesan yang disimpan di SeaweedFS S3 (`neraca-docs`) dan ditautkan ke sesi percakapan serta jurnal resmi.
3. **Dual Model Preset & Chain of Thought (Reasoning)**:
   - **Nara Kilat (Fast Execution)**: Menggunakan `gemini-3.5-flash-lite` untuk pencarian dan tugas operasional cepat.
   - **Nara Analis (Deep Thinking)**: Menggunakan `gemini-3.7-flash` dengan `thinking_summaries: "auto"` untuk audit, rekonsiliasi, dan analisis laporan keuangan komprehensif.
   - Menampilkan proses berpikir model secara streaming via komponen `Reasoning` dari `ai-elements` (durasi proses, animasi berkedip lembut, collapsible).
4. **Perombakan Total UI/UX `/asisten` Berbasis `ai-elements`**: Mengadopsi standar komponen `Conversation`, `Message`, `PromptInput`, `Attachments`, `ModelSelector`, dan `Confirmation` yang dibalut palet estetika *Paper & Ink Matte*.
5. **Full Accounting Suite Tool Calling**: Memberikan kapabilitas bagi Nara untuk membaca dan mengubah data di modul Jurnal, Akun COA, Periode Pembukuan, Laporan Keuangan, dan Diagnostik Audit/Temuan.
6. **Smart Human-in-the-Loop (HITL)**: Tool baca dieksekusi otomatis; tool mutasi/transaksi menampilkan kartu konfirmasi interaktif inline (*Allow*, *Allow All untuk Sesi Ini*, *Deny*), yang kebijakannya dapat diatur di menu Pengaturan (*Smart*, *Strict*, *Autonomous*).

---

## 2. Arsitektur Data Layer & Storage

### 2.1 Skema Database (`src/server/db/schema/rag.ts` & `org.ts`)

#### Tabel `chat_threads`
```sql
ALTER TABLE chat_threads 
  ADD COLUMN model_preset text NOT NULL DEFAULT 'fast',
  ADD COLUMN pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();
```
- Menampung informasi sesi percakapan yang terisolasi per tenant (`org_id`).
- Memiliki indeks pada `org_id` dan `updated_at`.

#### Tabel `chat_messages`
```sql
ALTER TABLE chat_messages 
  ADD COLUMN reasoning text,
  ADD COLUMN attachments jsonb,
  ADD COLUMN tool_invocations jsonb;
```
- `reasoning`: Menyimpan ringkasan proses berpikir (*thought summary*) dari model Gemini.
- `attachments`: Array objek `[{ id, storageKey, mime, fileName, sizeBytes }]`.
- `tool_invocations`: Catatan eksekusi tool `[{ callId, toolName, args, status: "approved" | "rejected" | "auto", result }]`.

#### Pengaturan Organisasi (`organizations.settings`)
Menambahkan atribut:
```json
{
  "aiHitlPolicy": "smart" // "smart" | "strict" | "autonomous"
}
```

### 2.2 Penyimpanan Berkas Lampiran (SeaweedFS S3)
- File diunggah ke endpoint `POST /api/nara/upload` dalam bentuk `multipart/form-data`.
- Validasi ketat: MIME tipe gambar (`image/png`, `image/jpeg`, `image/webp`) dan PDF (`application/pdf`) dengan batas ukuran maksimal 5 MB.
- Disimpan di bucket `neraca-docs` dengan prefix path:
  `${orgId}/chat/${threadId}/${fileId}-${fileName}`
- Metadata file dicatat di tabel `documents` sehingga dapat ditautkan ke baris bukti transaksi.

### 2.3 Repositori Data (`src/server/db/repos/chat.repo.ts`)
Fungsi-fungsi CRUD sesi yang disediakan:
- `listThreads(q, orgId)`: Mengambil daftar sesi, diurutkan descending berdasarkan `updatedAt`.
- `createThread(q, orgId, title, modelPreset)`: Membuat sesi baru.
- `updateThread(q, orgId, threadId, { title, modelPreset, pinned })`: Memperbarui atribut sesi.
- `deleteThread(q, orgId, threadId)`: Menghapus sesi beserta seluruh pesan terkait secara kaskade.
- `addMessage(q, threadId, role, content, opts)`: Menyimpan pesan teks, reasoning, attachments, tool invocations, dan citations.

---

## 3. Backend Agent Engine & Streaming Pipeline

### 3.1 Integrasi Google GenAI Interactions API
Menggunakan `@google/genai` (v2.18+) Interactions API dengan opsi `stream: true` dan `store: false`.

```typescript
const interaction = await ai.interactions.create({
  model: modelPreset === "deep" ? "gemini-3.7-flash" : "gemini-3.5-flash-lite",
  input: inputSteps,
  stream: true,
  store: false,
  generation_config: modelPreset === "deep" ? { thinking_summaries: "auto" } : undefined,
  tools: ALL_NARA_TOOLS,
});
```

### 3.2 Matriks Tool Akuntansi (Full Suite)

#### Tool Baca (Safe - Eksekusi Otomatis pada Mode Smart HITL)
1. `list_accounts`: Mengambil daftar akun COA lengkap beserta saldo berjalan.
2. `search_journals`: Pencarian jurnal berdasarkan teks memo, nomor `JE-YYYY-NNNN`, atau akun.
3. `list_journals`: Mengambil 10-20 entri jurnal terbaru beserta rincian baris debit/kredit.
4. `get_report`: Menghasilkan ringkasan Neraca (*balance sheet*), Laba Rugi (*income statement*), Arus Kas (*cash flow*), atau Perubahan Ekuitas.
5. `get_financial_kpis`: Mengambil angka saldo kas/bank live dan laba bersih tahun berjalan.
6. `list_periods`: Mengambil daftar periode pembukuan beserta statusnya (*OPEN* / *CLOSED*).
7. `check_accounting_health`: Menjalankan diagnosa kesehatan pembukuan (fitur Dokter: ketidakseimbangan debit-kredit, akun gantung, jurnal tanpa bukti).

#### Tool Mutasi (Tulis - Wajib Konfirmasi HITL pada Mode Smart HITL)
1. `create_journal_draft`: Menyusun draft jurnal double-entry dari teks atau dokumen nota.
2. `post_journal`: Memposting transaksi resmi langsung ke buku besar (`JE-YYYY-NNNN`).
3. `reverse_journal`: Membuat jurnal pembalik (*reversal*) untuk membatalkan transaksi yang keliru.
4. `create_account`: Menambahkan akun baru ke daftar COA (kode, nama, klasifikasi tipe, saldo normal).
5. `update_account`: Mengubah nama atau klasifikasi akun COA.
6. `archive_account`: Menonaktifkan/mengarsipkan akun COA.
7. `open_period`: Membuka periode akuntansi baru.
8. `close_period`: Mengunci/menutup periode akuntansi agar tidak dapat diubah lagi.

### 3.3 Protokol Streaming SSE (`/api/nara/chat/stream`)
Kanal Server-Sent Events menyalurkan paket data terstruktur:
- `event: reasoning`: `{"delta": "..."}`
- `event: text`: `{"delta": "..."}`
- `event: tool_call`: `{"tool": "...", "status": "executing"}` (untuk tool baca)
- `event: tool_approval_request`: `{"callId": "...", "toolName": "...", "args": {...}, "explanation": "..."}` (untuk tool mutasi)
- `event: error`: `{"message": "..."}`
- `event: done`: `{"messageId": "...", "citations": [...]}`

### 3.4 Siklus Konfirmasi HITL (`/api/nara/chat/confirm`)
Ketika frontend mengirim aksi konfirmasi:
- **Setujui (`approved: true`)**: Backend menjalankan mutasi dalam transaksi database terlindung advisory lock, mencatat audit log, dan mengembalikan hasil mutasi kepada model untuk menghasilkan respon konfirmasi natural.
- **Selalu Izinkan di Sesi Ini (`allowAllForSession: true`)**: Menandai sesi aktif agar pemanggilan tool mutasi berikutnya langsung dieksekusi tanpa jeda persetujuan manual.
- **Tolak (`approved: false`)**: AI menerima sinyal penolakan dari user dan merespon dengan sopan serta meminta arahan perbaikan.

---

## 4. Desain UI/UX & Komponen `ai-elements` (`/asisten`)

### 4.1 Layout Utama
- **Sidebar Sesi (Kiri)**:
  - Tombol "+ Percakapan Baru".
  - Bilah pencarian riwayat obrolan.
  - Daftar sesi terkelompok (*Hari Ini*, *7 Hari Terakhir*, *Bulan Ini*).
  - Aksi inline pada tiap sesi: Edit Nama (inline input) dan Hapus (modal konfirmasi).
  - Tombol Collapse/Expand sidebar.
- **Area Chat Canvas (Tengah & Kanan)**:
  - Menggunakan `Conversation` dari `ai-elements` dengan auto-scroll dan tombol `ConversationScrollButton`.
  - **Empty State**: Menampilkan salam pembuka dari Nara dan kartu aksi cepat (*Suggestions*) untuk memandu pengguna baru.
  - **Message Items**:
    - User message: Bubble rapi dengan pratinjau thumbnail attachment.
    - Assistant message: Avatar Nara, kartu `Reasoning` collapsible yang menampilkan durasi berpikir, teks respon markdown, serta kutipan referensi inline.
  - **Kartu `Confirmation`**:
    - Kartu berbingkai elegan yang menampilkan rincian parameter aksi (misal: rincian baris debit/kredit sebelum posting).
    - Tombol aksi: **Setujui & Posting** (Primary), **Selalu Izinkan Sesi Ini** (Outline), dan **Tolak** (Destructive).
- **Prompt Bar Bawah (Sticky Prompt Input)**:
  - `PromptInput` terintegrasi dengan daftar file chip `Attachments` (pratinjau foto/PDF dengan tombol hapus silang).
  - Textarea multiline fleksibel (Shift+Enter baris baru, Enter kirim).
  - Toolbar bawah:
    - Ikon klip kertas (upload multi-dokumen & drag-and-drop).
    - Komponen `ModelSelector` pill: memilih **⚡ Nara Kilat** atau **🧠 Nara Analis**.
    - Tombol Kirim / Stop animasi halus.

### 4.2 Halaman Pengaturan (`/pengaturan`)
Menambahkan section "Kebijakan AI & Human-in-the-Loop":
- Pilihan:
  - **Smart HITL** (Direkomendasikan): Mutasi data memerlukan persetujuan; pembacaan laporan otomatis.
  - **Strict HITL**: Semua tindakan memerlukan persetujuan manual.
  - **Autonomous**: Semua tindakan dieksekusi langsung tanpa konfirmasi.

---

## 5. Keamanan, Integritas Finansial & Audit Trail

1. **Prinsip Double-Entry & Angka Finansial**:
   - Seluruh nominal dihitung menggunakan tipe `BigInt` minor (kelas `Money`), mencegah ketidakakuratan pembulatan desimal.
   - Tool `post_journal` memvalidasi ketat bahwa $\sum \text{Debit} == \sum \text{Kredit}$ sebelum disimpan ke database.
2. **Proteksi Periode Terkunci**:
   - Mutasi jurnal pada periode akuntansi yang berstatus *CLOSED* ditolak secara absolut di level repository dan engine.
3. **Advisory Lock & Penomoran Jurnal**:
   - Pengambilan nomor urut `JE-YYYY-NNNN` diamankan dengan `pg_advisory_xact_lock` berbasis tahun periode.
4. **Audit Trail Imutabel**:
   - Setiap aksi agentic (baik otomatis maupun hasil konfirmasi HITL) dicatat di tabel `audit_logs` dengan informasi identitas `actor: "nara"`, `userId`, `orgId`, payload parameter, dan referensi entitas.

---

## 6. Rencana Verifikasi & Pengujian

1. **Unit & Integration Tests (Vitest pada `ledger_test`)**:
   - `tests/integration/chat-session.test.ts`: Uji siklus hidup thread (create, rename, delete cascade).
   - `tests/integration/nara-tools.test.ts`: Uji eksekusi safe vs mutating tools, validasi keseimbangan debit-kredit, dan proteksi periode tutup.
   - `tests/integration/hitl-policy.test.ts`: Uji perilaku kebijakan Smart vs Strict vs Autonomous.
2. **Type Safety & Build Check**:
   - `bunx tsc --noEmit` (harus 100% bersih tanpa error tipe dan tanpa penggunaan tipe `any`).
   - `bun run build` (harus berhasil kompilasi Next.js 16 App Router).
3. **End-to-End Verification (Playwright)**:
   - Pengujian alur pembuatan percakapan baru di `/asisten`.
   - Pengunggahan nota dan verifikasi pratinjau attachment.
   - Verifikasi kemunculan kartu konfirmasi HITL dan keberhasilan posting jurnal saat disetujui.

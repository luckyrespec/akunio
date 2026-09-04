# Akunio — SaaS Akuntansi Berbasis AI untuk UKM

> **Pembukuan double-entry yang rapi tanpa drama: foto nota langsung jadi jurnal seimbang, buku besar dikunci anti-utak-atik, dan laporan keuangan standar IFRS / SAK EMKM tersedia real-time.**

Akunio dirancang untuk pemilik usaha kecil-menengah dan akuntan yang ingin hijrah dari spreadsheet: transaksi tercatat lewat input manual, chat AI, atau foto struk — semuanya melewati validasi keseimbangan (Debit = Kredit) sebelum diposting, dan jurnal yang sudah diposting tidak bisa diubah (koreksi hanya lewat jurnal pembalik yang tertaut).

---

## 📑 Daftar Isi

- [1. Gambaran Umum & Nilai Bisnis](#1-gambaran-umum--nilai-bisnis)
- [2. Alur Proses Bisnis Akuntansi](#2-alur-proses-bisnis-akuntansi)
  - [A. Siklus Akuntansi Klasik (Double-Entry Engine)](#a-siklus-akuntansi-klasik-double-entry-engine)
  - [B. Siklus Pencatatan Cerdas Nara AI (Visi & Multimodal)](#b-siklus-pencatatan-cerdas-nara-ai-visi--multimodal)
  - [C. Mekanisme Persetujuan Human-in-The-Loop (HITL)](#c-mekanisme-persetujuan-human-in-the-loop-hitl)
- [3. Fitur Utama Sistem](#3-fitur-utama-sistem)
- [4. Arsitektur Teknis](#4-arsitektur-teknis)
  - [A. Tumpukan Teknologi (Tech Stack)](#a-tumpukan-teknologi-tech-stack)
  - [B. Arsitektur Penyimpanan Berkas & Metadata](#b-arsitektur-penyimpanan-berkas--metadata)
  - [C. Sistem Hybrid RAG (Regulasi IFRS & Konteks Tenant)](#c-sistem-hybrid-rag-regulasi-ifrs--konteks-tenant)
- [5. Panduan Menjalankan Aplikasi (Local Setup)](#5-panduan-menjalankan-aplikasi-local-setup)
- [6. Skrip & Perintah Penting](#6-skrip--perintah-penting)
- [7. Keamanan, Imutabilitas & Integritas Data](#7-keamanan-imutabilitas--integritas-data)

---

## 1. Gambaran Umum & Nilai Bisnis

**Akunio** adalah aplikasi akuntansi modern (*SaaS*) yang dirancang khusus untuk Usaha Kecil dan Menengah (UKM/SME) yang membutuhkan kepatuhan standar akuntansi keuangan (IFRS for SMEs / SAK EMKM) tanpa kerumitan administrasi manual.

Aplikasi ini mengatasi 3 masalah utama bisnis:
1. **Human Error & Jurnal Tidak Seimbang**: Jurnal manual sering mengalami kesalahan pencatatan posisi debit/kredit dan saldo akun.
2. **Keterlambatan Pelaporan Keuangan**: Bukti kuitansi dan nota menumpuk berhari-hari sebelum dicatat oleh akuntan.
3. **Ketiadaan Jejak Audit yang Kredibel**: Manipulasi angka atau penghapusan data sepihak merusak integritas laporan keuangan.

Akunio menyelesaikannya dengan menggabungkan **Core Ledger Imutabel** (tidak bisa diubah sembarangan setelah diposting) dan **Nara AI Copilot** yang mengekstraksi nota belanja, mencocokkan bagan akun (COA), dan menyusun laporan laba rugi secara seketika.

---

## 2. Alur Proses Bisnis Akuntansi

```mermaid
flowchart TD
    subgraph INPUT["1. Input Transaksi"]
        A1["Nota Fisik / PDF Faktur"] --> B["Nara AI Vision / Parser"]
        A2["Prompt Teks / Kasir"] --> B
        A3["Input Jurnal Manual"] --> C["Validasi Validitas & Keseimbangan"]
    end

    subgraph ENGINE["2. Ledger Engine & Verifikasi"]
        B --> D["Draf Jurnal (Debit = Kredit)"]
        D --> E{"Kebijakan Izin Transaksi?"}
        E -- "Persetujuan Manual (Smart)" --> F["Review & ACC Pengguna"]
        E -- "Otomatis (Autonomous)" --> G["Auto-Approve"]
        F --> G
        C --> G
        G --> H["Posting Jurnal (STATUS = POSTED)"]
        H --> I["Database Trigger: Lock Imutabilitas"]
        H --> J["Hash Chaining Audit Trail"]
    end

    subgraph OUTPUT["3. Buku Besar & Laporan Keuangan"]
        H --> K["Posting ke Buku Besar (General Ledger)"]
        K --> L["Neraca (Balance Sheet)"]
        K --> M["Laba Rugi (Profit & Loss)"]
        K --> N["Perubahan Ekuitas"]
        K --> O["Arus Kas (Metode Tidak Langsung)"]
    end
```

### A. Siklus Akuntansi Klasik (Double-Entry Engine)
1. **Bagan Akun (Chart of Accounts / COA)**: Disediakan template standar SAK EMKM/IFRS (Aset, Liabilitas, Ekuitas, Pendapatan, Beban) yang terisolasi per perusahaan (`org_id`).
2. **Validasi Keseimbangan Keras**: Jurnal tidak akan bisa diposting jika total Debit ≠ total Kredit.
3. **Imutabilitas Mutlak**: Jurnal berstatus `POSTED` **terkunci permanen**. Jika ada koreksi, sistem membuat jurnal pembalik (*Reversal Journal*) yang tertaut dengan `reversal_of_id`.
4. **Penomoran Formal**: Format per tahun fiskal `JE-YYYY-NNNN` yang diatur oleh counter transaksional berperingkat aman (*database advisory locks*).
5. **Penutupan Buku Periodik**: Mengunci 12 periode buku dalam setahun kalender sehingga data periode lalu tidak bisa diutak-atik.

### B. Siklus Pencatatan Cerdas Nara AI (Visi & Multimodal)
1. **Unggah Berkas Tanpa Beban (*Deferred Upload*)**: Pengguna menarik (*drag-and-drop*) foto struk atau PDF faktur. Pratinjau tampil instan 0ms secara lokal.
2. **Ekstraksi Multimodal**: Model AI mendeteksi nama vendor, tanggal transaksi, komponen pajak (PPN), dan subtotal.
3. **Pemetaan Akun Cerdas**: AI menganalisis deskripsi transaksi dan mencocokkannya ke akun COA organisasi (misal: "Beli bensin pertalite" otomatis dipetakan ke Debit `5-1010 Beban Kendaraan Operasional` dan Kredit `1-1001 Kas Utama`).
4. **Draft Preparation**: Jurnal disajikan dalam bentuk draf yang rapi dan transparan.

### C. Mekanisme Persetujuan Human-in-The-Loop (HITL)
Untuk menjamin kontrol internal perusahaan, Akunio menerapkan dua mode izin:
- 🛡️ **Izin Transaksi (Smart Mode — Direkomendasikan)**: AI menyusun draf dan kalkulasi, namun mewajibkan otorisasi klik dari pengguna sebelum jurnal diposting ke buku besar.
- ⚡ **Otomatis (Autonomous Mode)**: AI diizinkan mengeksekusi pencatatan rutin secara instan tanpa konfirmasi berulang jika tingkat keyakinan tinggi.

---

## 3. Fitur Utama Sistem

| Modul | Deskripsi Fungsi |
|---|---|
| **Dasbor Finansial** | Ringkasan KPI keuangan real-time: Kas & Bank, Pendapatan Bulan Berjalan, Pengeluaran, Laba Bersih, dan grafik pergerakan kas. |
| **Nara AI Copilot** | Asisten akuntansi percakapan dengan dukungan *drag-and-drop* berkas, visualisasi lampiran grid, riwayat sesi chat, dan pemahaman konteks halaman (*Page-Context Awareness* via `Ctrl+J`). |
| **Pustaka Dokumen** | Manajemen arsip bukti transaksi terpusat (Gambar nota & PDF) dengan filter kategori, pencarian, dan tombol "Tanyakan di Chat". |
| **Jurnal Transaksi** | Pencatatan debit/kredit manual dan draf AI dengan filter tanggal, pencarian nomor bukti, status draf/posted, serta mekanisme pembalikan jurnal. |
| **Buku Besar** | Kartu riwayat mutasi debit/kredit dan pergerakan saldo berjalan untuk setiap kode akun secara terperinci. |
| **Laporan Keuangan IFRS** | Generator 4 laporan standar: Neraca Keuangan, Laba Rugi, Perubahan Ekuitas, dan Arus Kas (Metode Tidak Langsung). |
| **Financial Doctor** | Audit kesehatan pembukuan otomatis untuk mendeteksi anomali akun, saldo negatif tidak lazim, dan draf menggantung. |
| **Audit Trail Kriptografis** | Setiap mutasi penting dicatat dalam rantai blok hash SHA-256 (`appendAudit` & `verifyChain`) untuk mencegah modifikasi tersembunyi. |

---

## 4. Arsitektur Teknis

### A. Tumpukan Teknologi (Tech Stack)
- **Frontend**: Next.js 16 (App Router + Turbopack), React 19, Tailwind CSS v4, Radix UI Primitives, Lucide Icons, Motion (Framer Motion).
- **Backend / API**: Next.js Server Actions, Route Handlers, Server-Sent Events (SSE) Streaming.
- **Basis Data**: PostgreSQL 18 / Serverless Neon PostgreSQL, Drizzle ORM.
- **Keamanan & Auth**: Better Auth 1.7, Multi-tenant Row-Level Security (RLS) dengan Postgres Session Variable.
- **Kecerdasan Buatan (AI)**: Google Gemini (`@google/genai`), model `gemini-3.5-flash-lite` (Interactions API + Function Calling), dan `gemini-embedding-001`.
- **Penyimpanan Berkas**: S3-compatible Object Storage (SeaweedFS Gateway) via `@aws-sdk/client-s3`.
- **Pengujian**: Vitest 4 (Unit & Integrasi Database) + Playwright (E2E Test).

### B. Arsitektur Penyimpanan Berkas & Metadata

Penyimpanan berkas menerapkan pemisahan bersih:

```
[Pengguna Unggah Bukti] 
         │
         ├──► [Memori Browser] ──► URL.createObjectURL (Pratinjau Instan 0ms)
         │
    (Klik Kirim)
         │
         ├──► [S3 Gateway (SeaweedFS)] : http://127.0.0.1:8333
         │    Simpan binary fisik (orgs/{orgId}/{uuid}.pdf) di D:\Lucky\weed_strorage\data
         │
         └──► [Neon Database] : Tabel `documents`
              Simpan metadata (id, orgId, storageKey, mime, sizeBytes)
```

- **Zero-Orphan Architecture**: Berkas fisik hanya dikirim ke S3 ketika pengguna benar-benar mengirimkan pesan. Jika dibatalkan (`X`), tidak ada sisa berkas sampah di S3 maupun baris di database.

### C. Sistem Hybrid RAG (Regulasi IFRS & Konteks Tenant)
- Berada di [`src/server/db/repos/rag-search.ts`](src/server/db/repos/rag-search.ts).
- Menggabungkan **Pencarian Vektor** (Cosine Similarity 768 dimensi) dengan **Pencarian Teks Penuh PostgreSQL** (`tsvector` + `ts_rank`).
- Tabel `ifrs_chunks`: Menyimpan aturan standar akuntansi umum.
- Tabel `tenant_chunks`: Menyimpan riwayat dokumen dan akun spesifik organisasi pengguna.

---

## 5. Panduan Menjalankan Aplikasi (Local Setup)

### Prasyarat
- **Bun 1.3+** (Runtime utama)
- **Node.js 20+** (Untuk kompiler lint & tooling)
- **PostgreSQL 18** (Lokal) atau **Neon Postgres**
- **SeaweedFS** (S3 Storage Server)

### 1. Kloning & Instalasi Dependensi
```powershell
git clone <repo-url>
cd ai_accounting
bun install
```

### 2. Pengaturan Variabel Lingkungan (.env)
Salin berkas konfigurasi:
```powershell
Copy-Item .env.example .env
```
Pastikan variabel utama terisi:
```env
# Database (Neon / Local PG)
DATABASE_URL="postgres://postgres:root@127.0.0.1:5432/ledger"
APP_DATABASE_URL="postgres://app_user:app_pw@127.0.0.1:5432/ledger"

# S3 Object Storage (SeaweedFS)
S3_ENDPOINT="http://127.0.0.1:8333"
S3_BUCKET="neraca-docs"
S3_ACCESS_KEY="demo"
S3_SECRET_KEY="demo"

# AI Engine (Google Gemini)
GEMINI_API_KEY="<api-key-gemini-anda>"
GEMINI_MODEL="gemini-3.5-flash-lite"
GEMINI_EMBED_MODEL="gemini-embedding-001"
```

### 3. Migrasi Skema Database & RLS Trigger
```powershell
# Jalankan migrasi Drizzle
bun run db:migrate

# Pasang trigger imutabilitas dan fungsi RLS
bun run db:sql
```

### 4. Menjalankan Object Storage SeaweedFS
Jalankan service S3 storage lokal:
```powershell
bun run weed:dev
```
*(S3 gateway akan aktif di `http://127.0.0.1:8333` dan bucket `neraca-docs` dibuat otomatis)*.

### 5. Menjalankan Aplikasi Development
```powershell
bun run dev
```
Buka browser di **`http://localhost:3000`**. Saat pertama mendaftar, organisasi baru beserta bagan akun (COA) dan 12 periode akuntansi akan diinisialisasi otomatis.

---

## 6. Skrip & Perintah Penting

| Perintah | Fungsi |
|---|---|
| `bun run dev` | Menjalankan Next.js development server (Turbopack). |
| `bun run build` | Melakukan kompilasi build produksi Next.js. |
| `bunx tsc --noEmit` | Pemeriksaan tipe TypeScript ketat (*strict type-checking*). |
| `bun run test` | Menjalankan seluruh test suite unit & integrasi Vitest. |
| `bun run e2e` | Menjalankan pengujian end-to-end dengan Playwright. |
| `bun run db:sql` | Menerapkan trigger imutabilitas dan kebijakan RLS ke database. |
| `bun run weed:dev` | Menjalankan server SeaweedFS master + volume + S3 gateway. |

---

## 7. Keamanan, Imutabilitas & Integritas Data

1. **Aritmatika Finansial Presisi Tinggi**:
   - Sistem **tidak pernah menggunakan tipe data `number` JavaScript bawaan** untuk nilai uang untuk menghindari galat pembulatan floating-point (*0.1 + 0.2 ≠ 0.3*).
   - Seluruh nominal diolah menggunakan kelas khusus `Money` (BigInt dalam sen/satuan terkecil) dan dipetakan ke kolom PostgreSQL `numeric(18,2)`.
2. **Database Trigger `forbid_posted_mutation`**:
   - Mencegah eksekusi `UPDATE` atau `DELETE` langsung pada baris tabel `journal_entries` yang sudah berstatus `POSTED`.
3. **Multi-Tenant Row-Level Security (RLS)**:
   - Setiap tabel memiliki kolom `org_id` dengan kebijakan `FORCE ROW LEVEL SECURITY`. Data antarperusahaan terpisah secara mutlak di tingkat mesin database.
4. **Verifikasi Hash Berantai (*Audit Log Chain*)**:
   - Setiap log mutasi menyertakan hash dari baris log sebelumnya, menjadikannya rantai data yang tidak dapat disisipi atau dihapus tanpa merusak validasi integritas sistem.

---

*Dikembangkan dengan fokus pada akurasi akuntansi, kecepatan, dan kenyamanan pengguna.*

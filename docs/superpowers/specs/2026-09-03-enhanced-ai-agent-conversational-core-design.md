# Spesifikasi Desain: Enhanced AI Agent Capabilities & Conversational Core (Nara Copilot Phase 1)

**Tanggal:** 2026-09-03  
**Status:** Approved by Human Partner  
**Target Rute:** `http://localhost:3000/asisten`, `AssistantWidget` (`Ctrl+J`), `/api/nara/*`, `src/components/ai-elements/*`

---

## 1. Ringkasan Eksekutif & Tujuan

Membangun antarmuka **AI Agent-First** generasi baru untuk Neraca, di mana 80% interaksi pembukuan dilakukan secara intuitif melalui percakapan alami dengan Asisten AI (**Nara**). 

Fokus Sub-Proyek 1 (Phase 1) mengimplementasikan fondasi interaksi cerdas:
1. **Dynamic Action Chips & Dynamic Forms**: Nara menyajikan pilihan interaktif menggunakan komponen native `<Suggestions>` dan `<Suggestion>` dari `ai-elements` (contoh: opsi split akun struk, konfirmasi faktur, pilihan metode bayar). Mengklik chip langsung mengirimkan pesan tanpa perlu mengetik manual.
2. **Proactive AI: Daily Briefing**: Saat pengguna pertama kali membuka aplikasi di hari berjalan (atau via tombol *"☀️ Briefing Hari Ini"*), Nara menyajikan ringkasan keuangan proaktif: kas/bank live vs kemarin, draft tertunda, piutang tempo, dokumen belum dicatat, dan hitung mundur penutupan periode fiskal.
3. **Batch Document Processing (`<Queue>`)**: Penanganan unggahan massal (2–10+ gambar/PDF struk sekaligus) dengan komponen `<Queue>` dari `ai-elements`. Mengelompokkan hasil ke dalam *Auto-Classified (>90%)* vs *Perlu Review*, dilengkapi aksi batch *Auto-Post* dan peninjauan langsung *in-place*.
4. **Conversational Report & Narrative Drill-Down**: Pembuatan laporan keuangan (Laba Rugi, Neraca) dengan ringkasan eksekutif 4 pilar (Kinerja, Profitabilitas, Rasio Beban, Rekomendasi Aksi) serta analisis drill-down interaktif untuk menelusuri rincian mutasi pemicu kenaikan biaya.
5. **Context-Aware Side-Sheet (`Ctrl+J`)**: Panel asisten global yang sadar rute aktif pengguna, menampilkan badge konteks halaman dan saran kontekstual yang berubah otomatis, dengan opsi *Maximize* ke layar penuh.

---

## 2. Arsitektur Data Layer & Komunikasi Streaming

### 2.1 Protokol Streaming SSE Terstruktur (`/api/nara/chat/stream`)
Kanal Server-Sent Events menyalurkan paket data terstruktur ke antarmuka:
- `event: reasoning`: `{"delta": "..."}` — Token pemikiran model secara live untuk komponen `<Reasoning>`.
- `event: text`: `{"delta": "..."}` — Token teks markdown untuk komponen `<MessageResponse>`.
- `event: suggestions`: `{"suggestions": ["Beban Operasional", "Pisah Detail", "Prive"]}` — Menginstruksikan frontend merender tombol aksi interaktif `<Suggestions>`.
- `event: queue_update`: `{"batchId": "...", "items": [{"id": "...", "fileName": "...", "vendor": "...", "amount": "...", "confidence": 0.94, "status": "ready" | "needs_review", "suggestedAccounts": [...]}]}` — Menyalurkan status pemrosesan dokumen batch ke komponen `<Queue>`.
- `event: tool_approval_request`: Sinyal konfirmasi mutasi HITL untuk kartu `<Confirmation>`.
- `event: done`: `{"messageId": "...", "citations": [...]}` — Penutup stream.

### 2.2 Endpoint Daily Briefing (`/api/nara/briefing`)
- **Metode**: `GET /api/nara/briefing`
- **Output**:
  ```json
  {
    "cashAndBank": { "current": "Rp 18.750.000", "delta": "+Rp 320.000", "trend": "up" },
    "pendingDraftsCount": 2,
    "overdueReceivables": { "count": 1, "totalAmount": "Rp 850.000", "customer": "Ibu Tina" },
    "unrecordedDocumentsCount": 3,
    "currentPeriod": { "name": "2026-08", "daysRemaining": 4, "deadline": "2026-09-07" },
    "suggestions": ["Review Draft", "Catat Dokumen", "Tutup Buku Agustus"]
  }
  ```
- **Pemicu**: Dieksekusi otomatis satu kali sehari saat client memuat aplikasi dengan memvalidasi key `localStorage.getItem("neraca:last_briefing_date")`. Jika berbeda dengan tanggal hari ini, sapaan Nara dirender dan key diperbarui. Tombol manual *"☀️ Briefing Hari Ini"* di dasbor dan asisten memicu endpoint ini kapan saja.

---

## 3. Desain Komponen UI berbasis `ai-elements`

### 3.1 Dynamic Action Chips (`<Suggestions>` & `<Suggestion>`)
- Komponen: `src/components/ai-elements/suggestion.tsx`
- **Tampilan**: Baris horizontal fleksibel berbalut estetika *Paper & Ink Matte*, mendukung scroll horizontal di layar kecil.
- **Aksi Interaksi**:
  ```tsx
  <Suggestions className="pt-2">
    {message.suggestions.map((item) => (
      <Suggestion
        key={item}
        suggestion={item}
        onClick={(choice) => handleSendSuggestion(choice)}
        className="bg-paper border-ink/15 hover:bg-ink/5 text-xs text-ink/80"
      />
    ))}
  </Suggestions>
  ```
- Saat pengguna mengklik salah satu chip, sistem langsung mengirimkannya sebagai giliran pesan pengguna berikutnya (`role: "user"`).

### 3.2 Pemrosesan Batch Dokumen (`<Queue>`)
- Komponen: `src/components/ai-elements/queue.tsx`
- **Struktur Tampilan di Chat**:
  ```tsx
  <Queue className="border border-ink/15 rounded-lg bg-paper p-3 my-3">
    <QueueSection defaultOpen={true}>
      <QueueSectionLabel
        icon={<FileText className="w-4 h-4 text-ink/60" />}
        count={items.length}
        label={`Dokumen Terdeteksi (${readyCount} Siap Posting, ${reviewCount} Perlu Review)`}
      />
      <QueueSectionContent>
        <QueueList>
          {items.map((doc) => (
            <QueueItem key={doc.id} className="hover:bg-ink/5 p-2 rounded">
              <QueueItemIndicator completed={doc.status === "ready"} />
              <QueueItemAttachment>
                <img src={doc.thumbnailUrl} alt={doc.fileName} className="w-10 h-10 object-cover rounded border" />
              </QueueItemAttachment>
              <QueueItemContent>
                <div className="text-xs font-medium">{doc.vendor || "Vendor Tidak Diketahui"}</div>
                <QueueItemDescription>{doc.date} • {doc.amount}</QueueItemDescription>
              </QueueItemContent>
              <QueueItemActions>
                {doc.status === "needs_review" && (
                  <Button size="xs" variant="outline" onClick={() => expandReviewCard(doc.id)}>
                    Review
                  </Button>
                )}
              </QueueItemActions>
            </QueueItem>
          ))}
        </QueueList>
      </QueueSectionContent>
    </QueueSection>
    <div className="flex gap-2 pt-2 border-t border-ink/10 mt-2">
      <Suggestion suggestion={`✓ Auto-Post ${readyCount} Transaksi Siap`} onClick={handleAutoPostReady} />
      <Suggestion suggestion="Review Satu-Satu" onClick={handleReviewSequential} />
    </div>
  </Queue>
  ```

### 3.3 Context-Aware Side-Sheet (`AssistantWidget`) & `/asisten`
- **Pemicu Global**: Shortcut `Ctrl+J` atau `Cmd+J` dari halaman mana pun, serta tombol klik pada *Hero Card* di bilah sisi (*sidebar*).
- **Header Konteks**:
  Menampilkan badge rute aktif secara dinamis:
  `🎤 Nara AI — Konteks: Laporan Laba Rugi`
- **Saran Kontekstual Berdasarkan Halaman (`getActivePageContext`)**:
  - `/dasbor`: `["☀️ Briefing Hari Ini", "Cek kesehatan pembukuan", "Lihat ringkasan kas"]`
  - `/jurnal`: `["Buat jurnal bensin 150rb", "Tampilkan draft belum diposting", "Cari jurnal bulan ini"]`
  - `/laporan/*`: `["Kenapa laba bersih naik?", "Bandingkan dengan tahun lalu", "Drill-down beban operasional", "Export laporan PDF"]`
  - `/buku-besar`: `["Periksa mutasi akun kas", "Cari transaksi > 1 juta", "Cek saldo normal akun"]`
- **Tombol Alih Layar Penuh**: Tombol *Maximize* membawa sesi obrolan aktif langsung ke `/asisten` secara mulus tanpa mengulang percakapan.

---

## 4. Backend Agent Tools (`src/server/ai/nara-tools.ts`)

### 4.1 Tool `get_daily_briefing`
- **Tipe**: Safe Function (Eksekusi Otomatis pada Mode Smart HITL)
- **Implementasi**:
  1. Menghitung saldo kas dan bank hari berjalan vs penutupan hari sebelumnya dari baris jurnal yang terposting.
  2. Menghitung jumlah draft di tabel `journal_entries` dengan `status = 'DRAFT'`.
  3. Menghitung piutang usaha yang telah melewati jatuh tempo atau jatuh tempo $\le 7$ hari.
  4. Menghitung dokumen di tabel `documents` yang memiliki `journal_id IS NULL`.
  5. Menghitung selisih hari menuju penutupan periode fiskal berjalan dari `fiscal_periods`.
  6. Mengembalikan format JSON beserta opsi sugesti tindakan.

### 4.2 Tool `drilldown_account_details`
- **Tipe**: Safe Function (Eksekusi Otomatis)
- **Parameter**:
  - `accountCode`: Kode akun COA (contoh: `"5-9999"`).
  - `period`: Periode target dalam format `"YYYY-MM"` (contoh: `"2026-08"`).
  - `comparePeriod`: Periode komparasi (contoh: `"2026-07"`).
- **Implementasi**:
  1. Mengambil baris transaksi jurnal (`journal_lines`) yang terhubung dengan akun tersebut pada rentang tanggal kedua periode.
  2. Menghitung total mutasi per periode dan selisih absolut serta persentasenya.
  3. Mengelompokkan transaksi berdasarkan memo/vendor.
  4. Mengidentifikasi transaksi-transaksi baru yang tidak muncul pada periode komparasi.
  5. Mengembalikan daftar transaksi terperinci dan ringkasan temuan penyebab anomali.

### 4.3 Tool `batch_analyze_documents`
- **Tipe**: Safe Function (Eksekusi Otomatis)
- **Parameter**:
  - `documentIds`: Array string ID dokumen yang tersimpan di SeaweedFS S3.
- **Implementasi**:
  1. Mengambil berkas dari storage S3 (`neraca-docs`).
  2. Membaca konten multimodal via Gemini API.
  3. Mengekstrak vendor, tanggal transaksi, total nilai, PPN, dan rincian baris barang/jasa.
  4. Menentukan tingkat keyakinan (*confidence score*): $\ge 0.90 \rightarrow \text{ready}$, $< 0.90 \rightarrow \text{needs\_review}$.
  5. Menghasilkan struktur antrean dokumen untuk dirender ke komponen `<Queue>`.

### 4.4 Peningkatan Naratif pada `get_report`
Menginstruksikan LLM menyajikan analisis naratif 4 pilar di samping data angka laporan:
1. *Kinerja Bulan Ini*: Analisis pertumbuhan pendapatan dan laba bersih secara MoM/YoY.
2. *Profitabilitas*: Evaluasi margin kotor dan margin bersih dibandingkan rasio standar industri.
3. *Struktur Beban*: Identifikasi pos beban dengan proporsi terbesar serta pos beban yang mengalami lonjakan abnormal.
4. *Rekomendasi Tindakan*: Saran konkret langkah operasional dan efisiensi kas.

---

## 5. Invarian Akuntansi & Integritas Data

1. **Prinsip Moneter**: Semua angka nominal moneter wajib menggunakan kelas `Money` dengan representasi `BigInt` sen/minor dan tipe database `numeric(18,2)` — dilarang menggunakan `number` floating-point JavaScript.
2. **Keseimbangan Double-Entry**: Setiap jurnal wajib lolos uji $\sum \text{Debit} == \sum \text{Kredit}$.
3. **Perlindungan Periode Terkunci**: Mutasi dilarang dan wajib digagalkan jika tanggal transaksi berada pada periode akuntansi yang `CLOSED` atau `LOCKED`.
4. **Advisory Lock Nomor Jurnal**: Pengambilan nomor bukti urut `JE-YYYY-NNNN` wajib dijalankan di dalam transaksi database yang dilindungi `pg_advisory_xact_lock`.
5. **Jejak Audit Terverifikasi**: Seluruh mutasi yang dieksekusi oleh asisten wajib mencatat baris di tabel `audit_logs` dengan `actor: "nara"` dan hash rantai yang valid.

---

## 6. Rencana Pengujian & Validasi

### 6.1 Pengujian Integrasi Otomatis (Vitest)
- **`tests/integration/nara-briefing.test.ts`**:
  - Validasi kalkulasi saldo kas/bank live vs kemarin.
  - Validasi deteksi draft pending dan dokumen unlinked.
  - Validasi ketersediaan array `suggestions` pada respons.
- **`tests/integration/nara-drilldown.test.ts`**:
  - Membuat transaksi beban pada dua periode berturut-turut.
  - Memverifikasi tool `drilldown_account_details` menghasilkan rincian transaksi pemicu kenaikan secara akurat.
- **`tests/integration/nara-batch.test.ts`**:
  - Menguji parsing batch dokumen dan penentuan status `ready` vs `needs_review`.

### 6.2 Validasi Tipe & Build
- Menjalankan `bunx tsc --noEmit` dengan target 0 error dan tanpa kebocoran tipe `any`.
- Menjalankan `bun run build` untuk memverifikasi kompatibilitas bundler Next.js 16.3 dan Turbopack.

### 6.3 Verifikasi Interaksi UI
- Pengujian visual sapaan Daily Briefing saat membuka aplikasi di sesi hari baru.
- Verifikasi klik pada chip `<Suggestion>` langsung mengirimkan input obrolan secara otomatis.
- Pengujian unggah multi-struk menampilkan komponen `<Queue>` lengkap dengan thumbnail dan tombol aksi.
- Pengujian shortcut `Ctrl+J` menampilkan Side-Sheet dengan badge konteks halaman aktif yang akurat.

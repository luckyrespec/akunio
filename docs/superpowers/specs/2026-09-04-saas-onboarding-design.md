# SaaS Auth Hardening + Chat-Driven Onboarding — Design Spec

Tanggal: 2026-09-04 | Status: disetujui user | Pendekatan: A (deferred provisioning + hard gate)

## 1. Latar & tujuan

Neraca disiapkan sebagai SaaS: auth diperkuat (esensial + Google OAuth), dan setiap user
baru maupun lama tanpa profil lengkap wajib melewati onboarding chat-driven sebelum
menyentuh dashboard. Onboarding mengumpulkan profil usaha, memetakan jenis usaha ke
template COA SAK EMKM (6+ jenis), memberi preview yang bisa dikonfirmasi/diubah via
chat, lalu mem-provision akun + periode dalam satu transaksi atomic.

Keputusan user yang mengunci desain:
- Auth: esensial SaaS + Google OAuth.
- Data onboarding: nama panggilan, nama usaha, jenis usaha, skala usaha
  (omzet/bulan + jumlah karyawan), kota/alamat (opsional), sumber referral.
- COA: 6+ template lengkap, preview + konfirmasi, user boleh edit/tambah/hapus.
- Chat: guided steps + LLM (state machine tetap, LLM hanya bahasa + parsing).
- Gate: wajib tanpa skip, berlaku untuk user baru DAN user lama.

## 2. Auth hardening (Better Auth 1.7)

- `src/server/auth/auth-server.ts`:
  - `emailAndPassword`: `minPasswordLength: 8`, `requireEmailVerification: true`.
  - `emailVerification`: kirim email verifikasi + halaman `/verifikasi` + resend
    (provider SMTP/Resend via env; di dev tanpa provider, link verifikasi
    ditampilkan di log server agar alur tetap bisa dites).
    Akun OAuth (`socialProviders.google` via `GOOGLE_CLIENT_ID/SECRET`) dianggap
    terverifikasi otomatis. User lama dengan `emailVerified=false` diarahkan ke
    `/verifikasi` dulu, baru `/onboarding` (urutan gate: login → verifikasi →
    onboarding).
  - `session`: `expiresIn` 7 hari, `updateAge` 24 jam; cookie `httpOnly`,
    `secure` di prod, `sameSite: lax`.
  - `rateLimit`: aktif untuk `/api/auth/*` (~10 req/menit/IP); error login
    generik Bahasa Indonesia ("Email atau kata sandi salah") anti user-enumeration.
  - Hapus fallback secret `"neraca-auth-secret-key-default"` — fail fast bila
    `BETTER_AUTH_SECRET` kosong di prod (dev boleh default eksplisit via env).
  - `trustedOrigins` dari env, bukan hardcode domain zap-clipper.
- `src/components/auth-form.tsx`:
  - Form daftar meminta **Nama lengkap** (bukan Nama Organisasi).
  - Tambah tombol "Lanjut dengan Google".
  - Redirect sukses ke `/onboarding` (hard navigation seperti sekarang).

## 3. Data model & gate

- Signup hook (`bootstrapNewUser` + `ensureUserWorkspace`) TIDAK lagi seed COA/periode.
  Ia hanya membuat `organizations { name: "Organisasi Baru" }`, membership `OWNER`,
  dan satu row `org_profiles { status: IN_PROGRESS, currentStep: 1 }`.
- Tabel baru `org_profiles` (satu row per org, `FORCE RLS` + policy `org_id`):
  `displayName, businessName, businessType enum
  (DAGANG | JASA | KULINER | MANUFAKTUR | ONLINE_RESALE | KOS_PROPERTI),
  revenueRange, employeeCount, city, address, referralSource,
  status (IN_PROGRESS | COMPLETED), completedAt`.
- Percakapan disimpan persisten (`onboarding_messages`, reuse pola `chat.repo`)
  agar refresh tidak mengulang dari awal.
- Gate: `requireContext()` diperluas menjadi `requireOnboardedContext()` untuk semua
  rute `(app)` — bila `org_profiles.status != COMPLETED` → `redirect("/onboarding")`.
  `/onboarding` hanya butuh login. User lama tanpa profil mendapat row IN_PROGRESS
  via self-heal (pola `getActiveContext` yang sudah ada). Tanpa tombol skip.
- Scope: tetap 1 user = 1 org. Multi-org/invite/role onboarding eksplisit OUT of scope.

## 4. Chat onboarding (guided steps + LLM)

- Rute `/onboarding` full-screen di luar `(app)` shell: bubble Nara + `PromptInput`
  + suggestion chips, Bahasa Indonesia, token Paper & Ink yang ada.
- 7 langkah state machine di server (`currentStep` di `org_profiles`):
  1. Sapa → nama panggilan. 2. Nama usaha. 3. Jenis usaha (chips 6 jenis).
  4. Skala usaha (chips omzet <10jt / 10–50jt / 50–200jt / >200jt + karyawan).
  5. Kota/alamat (opsional, chips "Lewati"). 6. Tahu dari mana (chips:
  Teman/Keluarga, Google, Instagram/TikTok, Lainnya). 7. Ringkasan → konfirmasi.
- Peran LLM (`@google/genai`, `gemini-3.5-flash-lite`, `store:false`, retry 2):
  merangkai kalimat + memetakan jawaban bebas ke enum (mis. "warteg" → KULINER,
  "jualan di shopee" → ONLINE_RESALE, "kos 10 pintu" → KOS_PROPERTI).
  Validasi tetap di server: jawaban tak valid → diminta ulang, langkah tidak maju.
- `AI_MOCK=1` deterministik: skrip sapaan + parsing keyword terkunci sehingga alur
  selesai tanpa API key (dev, vitest, Playwright `webServer env`).

## 5. Template COA SAK EMKM + provisioning

- Enam template di `src/core/accounts/coa-templates/*`, turunan `COA_TEMPLATE`
  dengan struktur 5 tipe SAK EMKM dan kode konsisten:
  - DAGANG: +Persediaan, HPP, Retur Penjualan/Pembelian.
  - JASA: +Pendapatan Jasa, Beban Proyek/Subkontraktor.
  - KULINER: +Bahan Baku, Kemasan, Beban komisi delivery (GoFood/Grab).
  - MANUFAKTUR: +Bahan Baku, Barang Dalam Proses, Overhead Pabrik.
  - ONLINE_RESALE: +Ongkir, Beban marketplace, Retur.
  - KOS_PROPERTI: +Pendapatan Sewa, Uang Deposito, Perawatan & Perbaikan.
- Setelah langkah 7: AI tampilkan preview COA (grup per tipe, highlight akun khas)
  dengan aksi **Gunakan ini** / hapus akun / tambah akun via chat
  ("tambah Beban Iklan" → LLM usul kode + tipe → user OK).
- "Siapkan pembukuan" → satu transaksi atomic (advisory lock + idempotency key):
  insert akun terpilih + 12 `fiscalPeriods` (generalisasi `seedOrgData`) +
  `organizations.name = businessName` + `org_profiles.status = COMPLETED`.
  Layar "Mempersiapkan…" 3 tahap (profil → COA → periode, hormati
  `prefers-reduced-motion`) lalu `redirect("/dasbor")`. Double-klik aman.
- User lama: org yang sudah punya jurnal POSTED → COA dipertahankan, tandai
  COMPLETED (arsip manual tetap di Pengaturan); org tanpa jurnal → COA diganti
  template baru dalam transaksi yang sama.

## 6. Error handling

- Gemini down → degradasi ke teks template + parsing keyword; onboarding tetap
  bisa selesai tanpa LLM.
- Provisioning gagal → tetap IN_PROGRESS + pesan "Coba lagi"; tidak ada COA
  setengah jadi (atomic). Rate-limit ringan pada chat onboarding anti spam.

## 7. Testing & rollout

- Vitest (`ledger_test`): mapping frasa→enum, validasi tiap langkah, provisioning
  atomic + idempoten, upgrade user lama (dengan/tanpa jurnal POSTED).
- Eval 10 frasa Indonesia terkunci → template benar.
- Playwright (`AI_MOCK=1`): daftar → terkunci di `/onboarding` → 7 langkah via
  chips → preview COA → siapkan → `/dasbor`; varian user lama + Google OAuth.
- Gate hijau: `bunx tsc --noEmit`, `bun run build`, `bun run test`, `bun run e2e`.
- Migrasi: buat `org_profiles` + RLS + backfill IN_PROGRESS untuk org lama;
  copy Bahasa Indonesia di semua layar baru.

## 8. Out of scope (eksplisit)

Multi-org, invite anggota, role-based onboarding, 2FA, CAPTCHA, audit login,
kustom nomor akun bebas format, impor COA dari file, dan i18n non-Indonesia.

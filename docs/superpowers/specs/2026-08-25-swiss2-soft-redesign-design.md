# Design: Refactor Total Desain — Paper & Ink × Swiss 2.0 Soft

Tanggal: 2026-08-25
Status: Disetujui (desain), menunggu review spec
Scope: Lapisan presentasi saja — nol perubahan logika bisnis, route, data fetching, atau copy

## Tujuan

Merombak total tampilan aplikasi (17 halaman + shell) dengan pendekatan
**Swiss 2.0 soft**, tanpa kehilangan identitas **Paper & Ink Matte**.
Efek/komponen **Aceternity UI** dipakai merata di semua halaman dengan
intensitas berjenjang, dikolaborasikan dengan shadcn/ui yang sudah ada,
dianimasikan lewat `motion/react` v13. Dark dan light mode dipertahankan
setara.

## Keputusan Pengunci (hasil brainstorming)

1. **Evolusi, bukan pengganti** — jiwa Paper & Ink (canvas cream, ink, terra,
   Fraunces + Jakarta) dipertahankan; eksekusinya direstrukturisasi ala
   Swiss 2.0 soft (grid tegas, radius besar, soft shadow, hierarki tipografi).
2. **Aceternity merata** — semua halaman mendapat efek, dengan aturan:
   intensitas menurun seiring kepadatan data; semua efek dikonsumsi lewat
   token (bukan warna hardcoded Aceternity).
3. **Layout full-bleed fluid 100%** — tanpa `max-w-[1600px]` dan tanpa
   `mx-auto`; tidak ada lagi dua blok warna (panel putih di atas kanvas
   cream). Konten mengikuti lebar viewport penuh.
4. **Token-first (pendekatan A)** — arsitektur CSS variables shadcn
   dipertahankan; Aceternity di-curate ke `src/components/aceternity/*`
   dan di-skin ke token Paper & Ink sehingga dark/light otomatis konsisten.
5. **Eksekusi berfase** — spec satu, plan berfase; tiap fase punya gerbang.
6. **Gerbang fase** — build hijau + `bunx tsc --noEmit` bersih + e2e smoke
   lolos + review visual user sebelum fase berikutnya.

## Bagian 1 — Fondasi Token (globals.css)

- `--radius`: 0.625rem → **1rem**; skala turunan (`--radius-sm..4xl`)
  otomatis mengikuti.
- Elevation baru: `--shadow-xs/sm/md` berlapis (2–3 layer diffuse,
  low-opacity ink, matte); `.matte-card` direfactor memakai token ini.
- Palet dipertahankan: `--color-canvas/paper/ink/ink-soft/terra/rule/
  debit/credit` (nilai light & dark existing). Border memakai `--rule`
  konsisten.
- Tipografi: Fraunces display + Jakarta sans tetap. Aturan Swiss: heading
  `tracking-tight`, angka uang selalu `.tnum`, hierarki lewat skala ukuran.
- Grid: container fluid penuh, token gutter (`--gutter` 24/32px), skala
  spacing section konsisten.
- Motion token existing (`--ease-out-soft`, `--ease-in-soft`,
  `--duration-fast/base/slow`) dipertahankan + spring ringan untuk efek
  Aceternity.
- Semua token baru punya cermin `.dark`; `@media print` laporan tetap
  selalu kertas terang — tidak diubah.

## Bagian 2 — Layout & Shell (Full-Bleed Fluid)

File: `src/components/app-shell.tsx`, `sidebar-nav.tsx`, `topbar.tsx`.

- Wrapper: hapus `max-w-[1600px] mx-auto` → `w-full` murni.
- `main`: hapus `bg-paper` → menyatu `bg-canvas`; permukaan putih hanya
  pada `Card`.
- Sidebar: tetap `w-64 ↔ w-[4.25rem]` collapsible (persist
  `neraca:sidebar-collapsed`); item aktif = pill + moving-border ringan
  (Aceternity, skin token terra).
- Topbar: full-bleed, sticky, backdrop-blur tipis; command palette ⌘K tetap.
- Tabel: kolom min-width + horizontal scroll di layar sempit.
- AssistantWidget (Nara floating) tetap, di-skin token baru.
- `@media print` tidak berubah.

## Bagian 3 — Komponen

### a) Refresh shadcn (`src/components/ui/*`)

button, card, badge, input, select, dialog, table, textarea, label,
separator otomatis mengikuti token baru. `table`: header uppercase kecil
`tracking-wide`, baris hover halus, sel angka `.tnum` rata kanan.

### b) Aceternity teradaptasi (`src/components/aceternity/*`) — merata berjenjang

| Permukaan | Efek (skin token Paper & Ink, dark+light) |
|---|---|
| masuk / daftar | Spotlight pada kartu auth + background-beams halus di kanvas |
| Dasbor | Bento grid KPI, hover border-glow, spotlight ringan kartu utama |
| Jurnal (semua) | Kartu form hover-glow tenang; empty-state spotlight mini; tabel tenang |
| Laporan | Kartu ringkasan hover-glow; statement tetap kertas tenang (print-safe) |
| Buku Besar, Temuan, Pengaturan | Kartu + border-glow halus konsisten |
| Asisten / Nara | Chat card aurora/beam sangat halus; widget floating glow |
| Shell | Moving-border item aktif; shimmer skeleton loading |

Aturan main: intensitas turun seiring kepadatan data; semua efek konsumsi
token; hormati `prefers-reduced-motion` (rule global sudah ada); sediakan
fallback statis.

### c) Motion primitives (`src/components/motion/index.tsx`)

Pertahankan `Reveal`, `Stagger`/`staggerItem`, `PageTransition`,
`Pressable`. Tambah: `AnimatedNumber` (KPI menghitung naik) dan `GlowCard`
(wrapper tunggal untuk efek Aceternity agar API konsisten). Library tetap
`motion/react` v13 — tidak ada dependensi animasi baru.

## Bagian 4 — Fase & Gerbang

| Fase | Isi | Skill |
|---|---|---|
| 1. Fondasi | Token light+dark, elevation, gutter; refresh `ui/*`; shell full-bleed; motion primitives | tailwind-design-system, frontend-design, motion |
| 2. Auth + Dasbor | Spotlight/beams auth; bento KPI; AnimatedNumber | aceternity-ui, ui-ux-pro-max, motion |
| 3. Jurnal | jurnal, jurnal/baru, jurnal/ai, jurnal/ai/[id] | aceternity-ui, motion |
| 4. Laporan + Buku Besar | Kartu ringkasan; statement print-safe | ui-ux-pro-max, frontend-design |
| 5. Asisten + Temuan + Pengaturan + polish | Nara chat, widget, temuan, pengaturan; audit motion menyeluruh | improve-animations, hyperframes-animation (audit), motion |

Gerbang tiap fase: build hijau + `bunx tsc --noEmit` bersih + e2e smoke
lolos + review visual user. Fase berikutnya tidak boleh mulai sebelum
fase sebelumnya lolos gerbang.

`hyperframes-animation` dan `improve-animations` dipakai sebagai audit
koreografi/performa di fase 5, bukan menambah library baru.

## Out of Scope

- Logika bisnis, struktur route, data fetching, autentikasi.
- Copy Bahasa Indonesia (hanya penyesuaian jika wajib oleh layout).
- Perubahan skema database / API.

## Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Efek Aceternity mengganggu keterbacaan angka | Intensitas berjenjang; halaman padat data hanya hover-glow; tabel tetap tenang |
| Performa animasi (beams/spotlight di banyak halaman) | Fallback statis, `prefers-reduced-motion`, audit performa fase 5 (MotionScore) |
| Dark mode Aceternity rusak (komponen hardcoded) | Semua komponen di-skin token sebelum masuk `components/aceternity/` |
| Tabel terlalu lebar di layar ultra-wide (fluid 100%) | Kolom min-width + scroll horizontal; header sticky bila perlu |
| Regresi print laporan | `@media print` tidak disentuh; smoke test e2e statements tetap hijau |

## Definisi Sukses

Kelima fase lolos gerbang; tidak ada dua blok warna pada layout; efek
Aceternity tampil merata dengan intensitas berjenjang; dark/light setara;
print laporan tetap terang; `git diff` migrasi tidak menyentuh logika
bisnis.

---
name: Akunio
description: Pembukuan double-entry yang rapi tanpa drama untuk UKM.
colors:
  terra-bata: "#a8562f"
  kanvas-arsip: "#f5f1e9"
  kertas-matte: "#fbfaf6"
  tinta-arsip: "#232a33"
  tinta-lembut: "#64696f"
  garis-arsip: "#e7e1d4"
  debit-daun: "#3e7c5a"
  kredit-bata: "#9c5a38"
typography:
  display:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
rounded:
  sm: "calc(var(--radius) * 0.6)"
  md: "calc(var(--radius) * 0.8)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) * 1.4)"
  2xl: "calc(var(--radius) * 1.8)"
  3xl: "calc(var(--radius) * 2.2)"
  4xl: "calc(var(--radius) * 2.6)"
spacing:
  gutter: "24px"
  gutter-lg: "32px"
  card: "16px"
  card-sm: "12px"
components:
  button-primary:
    backgroundColor: "{colors.tinta-arsip}"
    textColor: "{colors.kertas-matte}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.tinta-arsip}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-arsip}"
    rounded: "{rounded.lg}"
  input-default:
    backgroundColor: "{colors.kertas-matte}"
    textColor: "{colors.tinta-arsip}"
    rounded: "{rounded.lg}"
    height: "36px"
  card-default:
    backgroundColor: "{colors.kertas-matte}"
    textColor: "{colors.tinta-arsip}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: Akunio

## Overview

**Creative North Star: "Meja Ledger Matte"**

Akunio terlihat seperti meja pembukuan yang tenang: kertas matte hangat, tinta tegas, satu aksen terra bata yang jarang muncul. Kepadatan operasional dijaga agar angka mudah dipindai, bukan dipamerkan. Setiap permukaan terasa seperti alat kerja akuntan, bukan brosur pemasaran.

Filosofi: tenang dan presisi. Tidak ada kilau, tidak ada gradien neon, tidak ada sudut playful. Gerak dibatasi maksimal 240ms untuk UI interaktif dan menghormati `prefers-reduced-motion`. Yang ditolak secara eksplisit: kaca glossy, neon SaaS, dan dekorasi yang mengalihkan perhatian dari angka.

**Key Characteristics:**
- Kertas matte hangat dengan butir ultra-halus, terang tapi tidak mengkilap.
- Tinta tegas di atas kertas; aksen terra hanya untuk momen keputusan.
- Angka tabular di mana pun uang muncul; header tabel kecil uppercase.
- Flat secara default; bayangan hanya menjawab state.

## Colors

Palet karakter arsip kertas: satu aksen terra bata di atas netral kertas-tinta hangat, ditambah sepasang semantik debit-kredit.

### Primary

- **Terra Bata** (#a8562f): satu-satunya aksen. Dipakai hemat untuk glow fokus (`--color-glow`), teks hover penting, dan momen keputusan. Kelangkaannya adalah pesannya.

### Neutral

- **Kanvas Arsip** (#f5f1e9): latar aplikasi (`html`, `body`).
- **Kertas Matte** (#fbfaf6): permukaan kartu, popover, input.
- **Tinta Arsip** (#232a33): teks utama dan tombol primer.
- **Tinta Lembut** (#64696f): teks sekunder, header tabel, placeholder.
- **Garis Arsip** (#e7e1d4): border, divider, dan `--border` normatif.

### Tertiary

- **Debit Daun** (#3e7c5a): sisi debit dan status positif.
- **Kredit Bata** (#9c5a38): sisi kredit. Dekat dengan terra tetapi peran berbeda: kredit adalah data, terra adalah aksi.

### Named Rules

**The One Accent Rule.** Terra bata dipakai pada ≤10% layar mana pun. Data memakai tinta dan semantik debit-kredit; terra hanya untuk aksi dan fokus.

**The Lilin Rule.** Mode gelap bernama Lilin memakai setara hangatnya sendiri (kanvas #1b1713, kertas #241f19, tinta #ede4d7, tinta lembut #a89a88, terra #d06b40, garis #3d3529, debit #4cc38a). Teks di atas permukaan terra memakai kanvas gelap agar kontras AA. Jangan pernah mencampur nilai terang dan Lilin dalam satu permukaan. Laporan cetak selalu gaya kertas terang walau mode gelap aktif.

## Typography

**Display Font:** Fraunces (dengan Georgia, serif)
**Body Font:** Plus Jakarta Sans (dengan system-ui, sans-serif)
**Label/Mono Font:** Plus Jakarta Sans untuk label; ui-monospace stack untuk mono

**Character:** Fraunces memberi wibawa editorial pada momen besar; Jakarta Sans yang geometris-humanis menjaga angka dan label operasional tetap jernih. Keduanya tidak pernah berteriak.

### Hierarchy

- **Display** (Fraunces, serif): momen besar dan eksplanatori saja; bukan untuk tabel operasional.
- **Title** (medium, 16px / 1rem, leading snug): judul kartu (`CardTitle` 16px, versi kecil 14px).
- **Body** (normal, 14px): teks antarmuka default.
- **Label** (medium, 11px, uppercase, tracking 0.1em): header tabel data, header dropdown, caption. Selalu Jakarta, tidak pernah display.
- **Numerals** (`tnum`, tabular-nums): semua kemunculan uang memakai fitur tabular agar desimal sejajar; angka tabel rata kanan (`.data-table .num`).

### Named Rules

**The Tabular Money Rule.** Setiap angka uang memakai `.tnum` dan rata kanan di tabel. Angka proporsional pada uang adalah bug visual.

## Layout

Model spasial full-bleed cair dengan batas baca: kanvas normal dibatasi `max-width 1600px` dengan padding horizontal 16px (mobile), 24px (sm), 32px (lg) dan vertikal 20px / 28px (lg). Mode imersif (asisten, layar penuh) melepas batas menjadi `max-w-none` tanpa padding. Ritme gutter memakai `--gutter 24px` dan `--gutter-lg 32px`; jarak kartu memakai `--card-spacing 16px` (12px untuk varian kecil). Konten baca seperti laporan dibatasi `max-width 3xl` agar baris tetap nyaman.

Tabel data mengikuti resep Swiss 2.0 soft: header kecil uppercase berwarna tinta lembut, sel memakai border bawah `border-border/60`, lebar minimum 640px dengan scroll horizontal di layar kecil. Grid formulir memakai gap kartu; dialog dibatasi 480–560px; drawer asisten 420–460px dari kanan dengan kurva `--ease-drawer`. Gerak spasial mengikuti tata gerak global: masuk/keluar memakai ease-out, gerak di layar memakai ease-in-out, interaksi maksimal 240ms.

## Elevation & Depth

Sistem ini flat secara default dan menyampaikan kedalaman lewat pelapisan tonal kertas-di-atas-kanvas, bukan lewat bayangan. Bayangan hanya muncul sebagai jawaban atas state: kartu matte mendapat `elevation-sm` saat diam dan naik ke `elevation-md` saat hover atau dialog.

### Shadow Vocabulary

- **Matte rest** (`box-shadow: 0 1px 2px rgb(35 42 51 / 0.04), 0 6px 16px rgb(35 42 51 / 0.05)`): permukaan kartu diam (`.matte-card`).
- **Matte lift** (`box-shadow: 0 1px 2px rgb(35 42 51 / 0.05), 0 12px 32px rgb(35 42 51 / 0.07), 0 24px 64px rgb(35 42 51 / 0.05)`): hover kartu dan dialog. Di Lilin memakai padanan hitam pekat yang sama strukturnya.

### Named Rules

**The Flat-By-Default Rule.** Permukaan diam itu datar dengan batas garis arsip. Bayangan di luar kosakata di atas adalah pelanggaran sistem.

## Shapes

Bahasa bentuk lembut-matematis di atas basis `--radius 16px`: sm 9.6px (`--radius * 0.6`), md 12.8px (`* 0.8`), lg 16px, xl 22.4px (`* 1.4`), 2xl 28.8px, 3xl 35.2px, 4xl 41.6px. Tombol dan input memakai sudut lg 16px (varian kecil xs/sm dijepit ke `min(md, 10/12px)`); kartu memakai xl 22.4px; pesan chat memakai 2xl. Border memakai garis arsip 1px; kartu menambah cincin `ring-1 ring-foreground/10` agar tepi terbaca di atas kanvas. Siluet khas akuntansi: garis ganda klasik 4px (`rule-double`) di bawah total.

## Components

Setiap komponen tactile dan percaya diri: respons nyata saat ditekan, fokus yang terlihat, tanpa dekorasi mengilap.

### Buttons

- **Shape:** sudut lg 16px (varian xs/sm dijepit ke 10/12px).
- **Primary:** latar tinta/primer dengan teks kertas; tinggi 36px, padding horizontal 14px; hover menggelap ke 80%.
- **Hover / Focus:** cincin fokus 3px `ring/50`; tombol aktif sedikit turun 1px. Cincin tidak boleh dihilangkan.
- **Secondary / Ghost / Tertiary:** secondary memakai permukaan sekunder; outline memakai border garis dengan latar aplikasi; ghost transparan dengan hover muted; destructive memakai tinta destruktif 10–20% dengan teks destruktif; link memakai teks primer bergaris bawah.

### Chips

- **Style:** badge memakai latar muted dengan teks tinta; varian destruktif memakai tinta destruktif 10–20%.
- **State:** status akuntansi memakai pasangan debit-daun / kredit-bata, bukan terra.

### Cards / Containers

- **Corner Style:** sudut xl 22.4px dengan overflow tersembunyi.
- **Background:** kertas matte di atas kanvas arsip.
- **Shadow Strategy:** lihat Elevation: diam `elevation-sm`, hover `elevation-md`.
- **Border:** cincin 1px `foreground/10`; footer memakai border atas dengan latar muted 50%.
- **Internal Padding:** 16px via `--card-spacing` (12px untuk varian kecil); gambar tepi-atas/bawah menempel tanpa padding.

### Inputs / Fields

- **Style:** tinggi 36px, sudut lg 16px, border 80%, latar kertas, teks 14px.
- **Focus:** border cincin dengan glow 2px `ring/30`; hover menaikkan border ke `ring/60`.
- **Error / Disabled:** error memakai border destruktif dengan cincin 20%; disabled memakai opacity 50% dan non-interaktif.

### Navigation

- **Style:** sidebar 288px (mobile 85vw) berlatar kertas dengan border garis; item memakai tipografi 14px dengan ikon 16px, hover muted, aktif memakai latar muted dengan teks tinta.
- **Topbar:** palet perintah Cmd+K memakai dialog 560px berlatar kertas dengan bayangan `0 8px 40px rgb(35 42 51 / 0.12)`; status collapse sidebar tersimpan di `neraca:sidebar-collapsed`.

### Signature Component

- **Data table Swiss 2.0:** header 11px uppercase tinta lembut, sel bergaris bawah lembut, angka tabular rata kanan. Ini pola paling khas produk selain kartu matte.

## Do's and Don'ts

### Do:

- **Do** pakai `.tnum` dan rata kanan untuk setiap nominal uang.
- **Do** batasi terra bata untuk aksi dan fokus; data memakai tinta dan semantik debit-kredit.
- **Do** pertahankan cincin fokus 3px pada semua kontrol interaktif.
- **Do** cetak laporan selalu dalam gaya kertas terang.
- **Do** hormati `prefers-reduced-motion`: kolapskan gerak ke 0.01ms kecuali `.motion-keep-fade`.

### Don't:

- **Don't** memakai kaca glossy, gradien neon, atau sudut playful — anti-referensi yang dikonfirmasi.
- **Don't** memakai ease-in untuk UI atau melebihi 240ms pada interaksi (400ms/320ms hanya untuk marketing/eksplanatori).
- **Don't** menumpuk dua pesan sistem visual: satu layar, satu aksen, satu hierarki angka.
- **Don't** memakai warna chart grayscale untuk data debit-kredit; chart abu hanya untuk visualisasi netral.
- **Don't** menulis ulang nilai token di prosa dengan angka berbeda — frontmatter adalah normatif.

# Swiss 2.0 Soft Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor total presentasi 17 halaman + shell ke arah Paper & Ink × Swiss 2.0 Soft — full-bleed fluid, efek Aceternity merata berjenjang, dark/light setara, print laporan tetap terang.

**Architecture:** Token-first — semua warna/radius/shadow hidup di CSS variables `globals.css` (pola shadcn existing); komponen Aceternity di-curate ke `src/components/aceternity/*` dalam bentuk ter-adaptasi (konsumsi token, bukan warna hardcoded); motion via `motion/react` v13 memperluas `src/components/motion/index.tsx`; eksekusi 5 fase dengan gerbang per fase.

**Tech Stack:** Tailwind 4, shadcn/ui (10 komponen existing), motion/react 13, lucide-react, next-themes. Spesifikasi: `docs/superpowers/specs/2026-08-25-swiss2-soft-redesign-design.md`.

## Global Constraints

- Nol perubahan logika bisnis, route, data fetching, autentikasi, copy Bahasa Indonesia.
- `@media print` di `globals.css` TIDAK boleh diubah — laporan selalu kertas terang.
- Semua efek Aceternity WAJIB konsumsi token (`var(--color-terra)` dst.) — dilarang hardcode warna bawaan Aceternity.
- Semua animasi hormati `prefers-reduced-motion` (rule global sudah ada di `globals.css`; komponen motion memakai `useReducedMotion`).
- Layout fluid 100% tanpa `max-w-*` pada wrapper shell — tanpa efek dua blok warna.
- Palet dipertahankan: canvas cream, paper, ink, terra, debit/credit (nilai light & dark existing).
- Gerbang tiap fase: `bun run build` hijau + `bunx tsc --noEmit` bersih + `bun run e2e` smoke lolos (3/3; 2 fail ai-copilot adalah pre-existing, abaikan) + review visual user.
- Sebelum menulis kode animasi baru: WAJIB search Motion docs dulu (`motion_search-motion-docs`).
- Shell: plain `bash` adalah WSL — pakai PowerShell/tool write. Jangan heredoc.

---

# FASE 1 — FONDASI

### Task 1: Token Swiss 2.0 Soft di globals.css

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: token `--elevation-xs/sm/md` (light+dark), `--radius: 1rem`, gutter `--gutter`/`--gutter-lg`, utility `.data-table`, `.matte-card` memakai elevation — dikonsumsi semua task berikutnya.

- [ ] **Step 1: Naikkan radius dasar**

Di `:root` (baris 95), ganti:

```css
  --radius: 0.625rem;
```

menjadi:

```css
  --radius: 1rem;
```

- [ ] **Step 2: Tambah elevation + gutter + spring token**

Di blok `@theme` (setelah baris `--duration-slow: 400ms;`), tambahkan:

```css
  --duration-spring: 320ms;
```

Di blok `@theme inline`, tambahkan:

```css
  --shadow-xs: var(--elevation-xs);
  --shadow-sm: var(--elevation-sm);
  --shadow-md: var(--elevation-md);
  --color-glow: color-mix(in oklab, var(--color-terra) 14%, transparent);
```

Di `:root` (setelah `--card: var(--color-paper);`), tambahkan:

```css
  --elevation-xs: 0 1px 2px rgb(35 42 51 / 0.04);
  --elevation-sm: 0 1px 2px rgb(35 42 51 / 0.04), 0 6px 16px rgb(35 42 51 / 0.05);
  --elevation-md: 0 1px 2px rgb(35 42 51 / 0.05), 0 12px 32px rgb(35 42 51 / 0.07), 0 24px 64px rgb(35 42 51 / 0.05);
  --gutter: 1.5rem;
  --gutter-lg: 2rem;
```

Di `.dark` (setelah `--card: var(--color-paper);`), tambahkan:

```css
  --elevation-xs: 0 1px 2px rgb(0 0 0 / 0.4);
  --elevation-sm: 0 1px 2px rgb(0 0 0 / 0.4), 0 6px 16px rgb(0 0 0 / 0.35);
  --elevation-md: 0 1px 2px rgb(0 0 0 / 0.45), 0 12px 32px rgb(0 0 0 / 0.4), 0 24px 64px rgb(0 0 0 / 0.3);
```

- [ ] **Step 3: Refactor .matte-card + utility tabel**

Ganti rule `.matte-card` existing:

```css
.matte-card {
  box-shadow: var(--elevation-sm);
  transition: box-shadow var(--duration-base, 240ms) var(--ease-out-soft, cubic-bezier(0.22, 1, 0.36, 1));
}
```

Tambahkan (setelah `.rule-double`):

```css
/* Swiss 2.0 soft — resep tabel data: header kecil uppercase, angka tabular */
.data-table {
  @apply w-full min-w-[640px];
}
.data-table th {
  @apply text-[11px] font-medium uppercase tracking-widest text-ink-soft;
}
.data-table td {
  @apply border-border/60 border-b;
}
.data-table .num {
  @apply tnum text-right;
}
```

Catatan pemakaian: tabel `.data-table` WAJIB dibungkus `<div className="overflow-x-auto">` agar min-width ter-scroll horizontal di layar sempit (konsistensi fluid 100% tanpa merusak keterbacaan).

- [ ] **Step 4: Verifikasi visual cepat**

Run: `bun run dev` lalu buka http://localhost:3000/dasbor — kartu KPI kini lebih membulat, bayangan lebih lembut, TIDAK ada error kompilasi CSS. Matikan server.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): swiss 2.0 soft tokens — radius, elevation, gutter, data-table"
```

---

### Task 2: Komponen fondasi — PageHeader

**Files:**
- Create: `src/components/page-header.tsx`

**Interfaces:**
- Produces: `PageHeader({ title, eyebrow, actions }: { title: string; eyebrow?: string; actions?: React.ReactNode })` — dipakai ulang semua halaman di Fase 2–5.

- [ ] **Step 1: Buat komponen**

```tsx
import type { ReactNode } from "react";
import { Reveal } from "@/components/motion";

export function PageHeader({
  title,
  eyebrow,
  actions,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <Reveal>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">{title}</h1>
        <div className="flex items-center gap-3">
          {actions}
          {eyebrow && (
            <p className="hidden text-xs uppercase tracking-widest text-ink-soft sm:block">{eyebrow}</p>
          )}
        </div>
      </div>
    </Reveal>
  );
}
```

- [ ] **Step 2: Verifikasi kompilasi**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/page-header.tsx
git commit -m "feat(design): PageHeader primitive"
```

---

### Task 3: Shell full-bleed fluid

**Files:**
- Modify: `src/components/app-shell.tsx:38,42,50,54`
- Modify: `src/components/topbar.tsx:47`

**Interfaces:**
- Consumes: token `--gutter`/`--gutter-lg` (Task 1).

- [ ] **Step 1: Hapus boxed wrapper**

Di `app-shell.tsx`, ganti KEDUA kemunculan (baris 38 dan 50):

```tsx
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
```

menjadi:

```tsx
    <div className="flex min-h-screen w-full">
```

Ganti KEDUA kemunculan (baris 42 dan 54):

```tsx
        <main className="flex-1 bg-paper px-6 py-6 lg:px-8">
```

menjadi:

```tsx
        <main className="flex-1 px-(--gutter) py-(--gutter) lg:px-(--gutter-lg)">
```

- [ ] **Step 2: Satukan permukaan topbar dengan kanvas**

Di `topbar.tsx` baris 47, ganti:

```tsx
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-paper/80 px-4 backdrop-blur-sm lg:px-6">
```

menjadi:

```tsx
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-canvas/80 px-(--gutter) backdrop-blur-sm lg:px-(--gutter-lg)">
```

- [ ] **Step 3: Verifikasi visual**

Run: `bun run dev` → buka /dasbor di lebar jendela penuh: TIDAK ada lagi panel putih di tengah + gutter cream; konten fluid penuh; topbar menyatu. Cek juga halaman /jurnal (tabel melebar). Matikan server.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-shell.tsx src/components/topbar.tsx
git commit -m "feat(design): full-bleed fluid shell — remove boxed paper panel"
```

---

### Task 4: Aceternity teradaptasi — MovingBorder + GlowCard + Spotlight + BackgroundBeams

**Files:**
- Create: `src/components/aceternity/moving-border.tsx`
- Create: `src/components/aceternity/glow-card.tsx`
- Create: `src/components/aceternity/spotlight.tsx`
- Create: `src/components/aceternity/background-beams.tsx`

**Interfaces:**
- Produces:
  - `MovingBorder({ children, duration?, className?, borderRadius? })` — bingkai gradien terra beranimasi (dipakai sidebar Task 5)
  - `GlowCard({ children, className?, intensity?: "soft"|"medium" })` — wrapper kartu hover-glow (dipakai semua fase)
  - `Spotlight({ className? })` — elips cahaya atas halaman (dipakai auth Task 7)
  - `BackgroundBeams({ className? })` — sinar latar halus (dipakai auth Task 7)
- Semua konsumsi `var(--color-terra)`/`var(--color-canvas)`; semua fallback statis saat `useReducedMotion()`.

- [ ] **Step 0: Cari pola Motion dulu (wajib)**

Panggil `motion_search-motion-docs` platform `react` searchTerm `useAnimationFrame path following` dan `useMotionTemplate`. Bangun dari pola yang dikembalikan.

- [ ] **Step 1: moving-border.tsx**

```tsx
"use client";

import { useRef } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";

export function MovingBorder({
  children,
  duration = 3000,
  className,
  borderRadius = "0.75rem",
}: {
  children: React.ReactNode;
  duration?: number;
  className?: string;
  borderRadius?: string;
}) {
  const reduce = useReducedMotion();
  const pathRef = useRef<SVGRectElement>(null);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    if (reduce) return;
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMs = length / duration;
      progress.set((time * pxPerMs) % length);
    }
  });

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).x ?? 0);
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).y ?? 0);
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px)`;

  return (
    <div className={cn("relative", className)} style={{ borderRadius }}>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        style={{ borderRadius }}
      >
        <rect
          ref={pathRef}
          fill="none"
          stroke="var(--color-terra)"
          strokeOpacity={reduce ? 0.35 : 0.5}
          strokeWidth={1.5}
          width="100%"
          height="100%"
          rx={borderRadius}
        />
      </svg>
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute size-[88px] rounded-full opacity-60"
          style={{
            transform,
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-terra) 45%, transparent), transparent 65%)",
          }}
        />
      )}
      <div className="relative" style={{ borderRadius }}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: glow-card.tsx**

```tsx
"use client";

import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function GlowCard({
  children,
  className,
  intensity = "soft",
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: "soft" | "medium";
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("group/glow relative rounded-2xl", className)}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover/glow:opacity-100",
          reduce && "hidden",
          intensity === "soft"
            ? "[background:radial-gradient(360px_circle_at_50%_0%,color-mix(in_oklab,var(--color-terra)_14%,transparent),transparent_70%)]"
            : "[background:radial-gradient(480px_circle_at_50%_0%,color-mix(in_oklab,var(--color-terra)_22%,transparent),transparent_70%)]",
        )}
      />
      <div className="relative h-full rounded-2xl border border-rule bg-paper shadow-xs transition-shadow duration-500 group-hover/glow:shadow-md">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: spotlight.tsx**

```tsx
import { cn } from "@/lib/utils";

export function Spotlight({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-40 left-0 z-0 h-[560px] w-full opacity-[0.07] dark:opacity-[0.12]",
        className,
      )}
      viewBox="0 0 1200 560"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <ellipse cx="600" cy="120" rx="420" ry="220" fill="var(--color-terra)" />
      <ellipse cx="600" cy="120" rx="260" ry="140" fill="var(--color-terra)" opacity="0.6" />
    </svg>
  );
}
```

- [ ] **Step 4: background-beams.tsx**

```tsx
"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const BEAM_COUNT = 14;

export function BackgroundBeams({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const paths = useMemo(
    () =>
      Array.from({ length: BEAM_COUNT }, (_, i) => {
        const x = (i + 1) * 90;
        return `M${-x} -40 C ${-x + 160} 220, ${x + 240} 420, ${x + 420} 900`;
      }),
    [],
  );

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <svg className="absolute inset-0 size-full" viewBox="0 0 900 900" preserveAspectRatio="xMidYMid slice">
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--color-rule)" strokeOpacity={0.5} strokeWidth={1} />
        ))}
      </svg>
      {!reduce && (
        <svg className="absolute inset-0 size-full" viewBox="0 0 900 900" preserveAspectRatio="xMidYMid slice">
          {paths.map((d, i) => (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke="var(--color-terra)"
              strokeOpacity={0.28}
              strokeWidth={1.5}
              initial={{ pathLength: 0, pathOffset: 0 }}
              animate={{ pathLength: [0, 0.18, 0], pathOffset: [0, 0.9, 1] }}
              transition={{
                duration: 9 + (i % 5),
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.7,
              }}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verifikasi kompilasi**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/aceternity
git commit -m "feat(design): token-skinned aceternity set — moving-border, glow-card, spotlight, background-beams"
```

---

### Task 5: Sidebar — item aktif MovingBorder

**Files:**
- Modify: `src/components/sidebar-nav.tsx`

**Interfaces:**
- Consumes: `MovingBorder` (Task 4).

- [ ] **Step 1: Bungkus item aktif**

Di `sidebar-nav.tsx`, tambahkan import:

```tsx
import { MovingBorder } from "@/components/aceternity/moving-border";
```

Ganti isi `ITEMS.map(...)` pada blok `<Link>` item nav (baris 76–91) menjadi:

```tsx
            return (
              <MovingBorder
                key={item.href}
                duration={3200}
                className={cn(collapsed && "w-full")}
                borderRadius="0.75rem"
              >
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                    collapsed && "justify-center px-2",
                    active ? "bg-canvas font-medium text-terra" : "text-ink hover:bg-canvas",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-terra" : "text-ink-soft group-hover:text-ink")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </MovingBorder>
            );
```

Lakukan hal yang sama untuk Link `/temuan` (baris 94–106) dengan `active={isActive("/temuan")}` — ekstrak menjadi pola yang sama persis (MovingBorder selalu membungkus; indikator bar `ml-auto h-5 w-0.5` dihapus karena digantikan border animasi).

- [ ] **Step 2: Verifikasi visual**

Run: `bun run dev` → sidebar: item aktif punya bingkai terra beranimasi halus; hover tetap bekerja; toggle collapse tetap berfungsi; `prefers-reduced-motion` → border statis. Matikan server.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar-nav.tsx
git commit -m "feat(design): sidebar active item with moving border"
```

---

### Task 6: Motion primitives — AnimatedNumber

**Files:**
- Modify: `src/components/motion/index.tsx`

**Interfaces:**
- Consumes: `animate`, `useInView` dari `motion/react`.
- Produces: `AnimatedNumber({ value, format, className? })` — `value: number`, `format: (v: number) => string`; dipakai dasbor Task 9.

- [ ] **Step 0: Search Motion docs (wajib)**

Panggil `motion_search-motion-docs` platform `react` searchTerm `animate function useInView`. Ikuti pola yang dikembalikan.

- [ ] **Step 1: Tambah import + komponen**

Di `src/components/motion/index.tsx`, ganti import baris 3:

```tsx
import { animate, motion, useInView, useReducedMotion } from "motion/react";
```

Tambahkan `useEffect, useRef, useState` ke import React (`import { useEffect, useRef, useState } from "react";` — gabung dengan import `PropsWithChildren` existing menjadi satu baris `import { useEffect, useRef, useState, type PropsWithChildren } from "react";`).

Tambahkan di akhir file:

```tsx
// AnimatedNumber — KPI counting up on first view
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: EASE_OUT_SOFT,
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [inView, value, reduce]);

  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  );
}
```

- [ ] **Step 2: Verifikasi kompilasi**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/motion/index.tsx
git commit -m "feat(design): AnimatedNumber motion primitive"
```

---

### Task 7: GERBANG FASE 1

- [ ] **Step 1: Gerbang teknis**

```powershell
bun run build; bunx tsc --noEmit; bun run e2e
```

Expected: build hijau; tsc exit 0; e2e 3/3 smoke lolos (2 fail ai-copilot = pre-existing, abaikan).

- [ ] **Step 2: Review visual user**

Sajikan ringkasan perubahan (radius lebih besar, shadow lembut, sidebar border animasi, layout full-bleed) dan MINTA user membuka `bun run dev` untuk cek light + dark + /dasbor + /jurnal. TUNGGU persetujuan eksplisit sebelum Fase 2.

---

# FASE 2 — AUTH + DASBOR

### Task 8: Auth — Spotlight + BackgroundBeams

**Files:**
- Modify: `src/components/auth-form.tsx` (hanya bagian return, logika onSubmit TIDAK diubah)

**Interfaces:**
- Consumes: `Spotlight`, `BackgroundBeams`, `GlowCard` (Task 4).

- [ ] **Step 1: Bungkus form dengan panggung auth**

Di `auth-form.tsx`, tambahkan import:

```tsx
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { GlowCard } from "@/components/aceternity/glow-card";
import { Spotlight } from "@/components/aceternity/spotlight";
```

Ganti seluruh blok `return (...)` menjadi (isi `<form onSubmit={onSubmit}>` DI DALAMNYA persis sama seperti sebelumnya — jangan ubah field/label/error):

```tsx
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-(--gutter)">
      <BackgroundBeams />
      <Spotlight className="-top-32" />
      <GlowCard intensity="medium" className="relative z-10 w-full max-w-md">
        <Card className="rounded-2xl border-0 bg-transparent shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              {mode === "daftar" ? "Mulai Pembukuan Anda" : "Masuk"}
            </CardTitle>
            <CardDescription>
              {mode === "daftar"
                ? "Organisasi, bagan akun, dan periode dibuat otomatis."
                : "Lanjutkan mengelola pembukuan Anda."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {mode === "daftar" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Organisasi</Label>
                  <Input id="name" name="name" required placeholder="Koperasi Maju" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Kata Sandi</Label>
                <Input id="password" name="password" type="password" minLength={8} required />
              </div>
              {error && <p className="text-sm text-credit">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full bg-terra hover:bg-terra/90">
                {busy ? "Memproses..." : mode === "daftar" ? "Daftar" : "Masuk"}
              </Button>
              <p className="text-center text-sm text-ink-soft">
                {mode === "daftar" ? (
                  <>Sudah punya akun? <Link className="text-terra underline" href="/masuk">Masuk</Link></>
                ) : (
                  <>Belum punya akun? <Link className="text-terra underline" href="/daftar">Daftar</Link></>
                )}
              </p>
            </form>
          </CardContent>
        </Card>
      </GlowCard>
    </div>
  );
```

- [ ] **Step 2: Verifikasi visual**

Run: `bun run dev` → buka /masuk dan /daftar: beams halus + spotlight di belakang kartu; coba login (AI_MOCK tidak relevan di sini) — alur tidak boleh berubah; cek dark mode. Matikan server.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth-form.tsx
git commit -m "feat(design): auth stage with beams + spotlight + glow card"
```

---

### Task 9: Dasbor — Bento KPI + AnimatedNumber

**Files:**
- Modify: `src/app/(app)/dasbor/page.tsx`

**Interfaces:**
- Consumes: `GlowCard` (Task 4), `AnimatedNumber` (Task 6), `PageHeader` (Task 2), `Stagger`/`staggerItem` (existing).

- [ ] **Step 1: Ganti header + grid KPI**

Tambahkan import:

```tsx
import { AnimatedNumber, Stagger, staggerItem } from "@/components/motion";
import { GlowCard } from "@/components/aceternity/glow-card";
import { PageHeader } from "@/components/page-header";
```

Ganti blok `<Reveal>` header (baris 49–54) dengan:

```tsx
      <PageHeader title="Dasbor" eyebrow="Ringkasan keuangan" />
```

Ganti grid 3 kartu KPI (baris 56–96) dengan bento + stagger (struktur tiap kartu: `GlowCard` membungkus, konten Card dipertahankan, angka memakai `AnimatedNumber` dengan `Money.fromMinor(BigInt(Math.round(minor))).formatIdr()`):

```tsx
      <Stagger className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-6">
        <motion.div variants={staggerItem} className="md:col-span-2">
          <GlowCard>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Periode Berjalan</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight">{data.period?.name ?? "—"}</p>
                <Badge variant="outline" className="mt-2 border-rule bg-canvas text-ink-soft">{data.period?.status ?? "-"}</Badge>
              </CardContent>
            </Card>
          </GlowCard>
        </motion.div>
        <motion.div variants={staggerItem} className="md:col-span-2">
          <GlowCard>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Saldo Kas &amp; Bank</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight tnum">
                  <AnimatedNumber
                    value={Number(cashMinor)}
                    format={(v) => Money.fromMinor(BigInt(Math.round(v))).formatIdr()}
                  />
                </p>
                <p className="mt-1 text-xs text-ink-soft">Kumulatif sampai hari ini</p>
              </CardContent>
            </Card>
          </GlowCard>
        </motion.div>
        <motion.div variants={staggerItem} className="md:col-span-2">
          <GlowCard>
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Laba Tahun Ini</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl tracking-tight tnum">
                  <AnimatedNumber
                    value={Number(ytd.netIncomeMinor)}
                    format={(v) => Money.fromMinor(BigInt(Math.round(v))).formatIdr()}
                  />
                </p>
                <p className="mt-1 text-xs text-ink-soft">Januari sampai {year}</p>
              </CardContent>
            </Card>
          </GlowCard>
        </motion.div>
      </Stagger>
```

Tambahkan `motion` ke import motion existing:

```tsx
import { motion } from "motion/react";
```

Kartu temuan (baris 98–120) tetap, hanya bungkus terluarnya tetap `Reveal` (tidak berubah).

- [ ] **Step 2: Verifikasi visual**

Run: `bun run dev` → /dasbor: angka menghitung naik saat masuk view, kartu glow saat hover, stagger halus; dark mode setara. Matikan server.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dasbor/page.tsx"
git commit -m "feat(design): dasbor bento KPI with animated numbers"
```

---

### Task 10: GERBANG FASE 2

- [ ] **Step 1: Gerbang teknis** — sama seperti Task 7 Step 1.
- [ ] **Step 2: Review visual user** — /masuk, /daftar, /dasbor (light+dark). TUNGGU persetujuan.

---

# FASE 3 — JURNAL

### Task 11: Halaman Jurnal Umum + Tulis Jurnal

**Files:**
- Modify: `src/app/(app)/jurnal/page.tsx`
- Modify: `src/app/(app)/jurnal/baru/page.tsx`
- Modify: `src/components/journal/new-entry-form.tsx` (jika form punya Card sendiri)

**Interfaces:**
- Consumes: `PageHeader`, `GlowCard`, `.data-table` (Task 1–4).

- [ ] **Step 1: Terapkan resep di jurnal/page.tsx**

Buka file, lalu terapkan PERSIS resep ini:
- Ganti header `<h1>` + `Reveal` pembuka dengan `<PageHeader title="Jurnal Umum" eyebrow="Buku catatan" actions={/* tombol/existing action dipindah ke sini */} />`.
- Tabel utama: bungkus `<div className="overflow-x-auto">`, tambahkan className `data-table` pada `<Table>`; sel angka debit/kredit dapat className `num`; wrapper tabel diberi `GlowCard` (intensity default) menggantikan `matte-card` div yang membungkusnya (pindahkan padding ke GlowCard inner via Card).
- Baris aksi/empty state: biarkan, ganti `matte-card` → `shadow-xs` jika ada.

- [ ] **Step 2: Terapkan resep di jurnal/baru + new-entry-form**

- Header → `PageHeader title="Tulis Jurnal" eyebrow="Entri baru"`.
- Kartu form → dibungkus `GlowCard intensity="medium"` (form adalah momen input utama).
- Field dan validasi TIDAK diubah.

- [ ] **Step 3: Verifikasi visual + fungsional**

Run: `bun run dev` → buat 1 entri jurnal manual sampai tersimpan (alur tidak boleh berubah); tabel terbaca; hover glow halus. Matikan server.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/jurnal" src/components/journal/new-entry-form.tsx
git commit -m "feat(design): jurnal pages — data-table recipe + glow form"
```

---

### Task 12: Halaman Jurnal AI (list + review)

**Files:**
- Modify: `src/app/(app)/jurnal/ai/page.tsx`
- Modify: `src/app/(app)/jurnal/ai/[id]/page.tsx`
- Modify: `src/components/ai/status-card.tsx` (jika memakai kartu)

**Interfaces:**
- Consumes: `PageHeader`, `GlowCard` (Task 2/4).

- [ ] **Step 1: Terapkan resep**

- Kedua halaman: header → `PageHeader` (title "Jurnal AI" / "Review Draft"; eyebrow sesuai konteks existing).
- Kartu draft/review → `GlowCard`; area diff tetap polos (keterbacaan).
- Badge status dipertahankan.

- [ ] **Step 2: Verifikasi visual + fungsional**

Run: `bun run dev` → buka /jurnal/ai (list draft), buka satu review — diff tampil benar, tombol accept/reject bekerja. Matikan server.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/jurnal/ai" src/components/ai/status-card.tsx
git commit -m "feat(design): jurnal ai list + review glow cards"
```

---

### Task 13: GERBANG FASE 3

- [ ] **Step 1: Gerbang teknis** — sama seperti Task 7 Step 1.
- [ ] **Step 2: Review visual user** — /jurnal, /jurnal/baru, /jurnal/ai, satu review draft. TUNGGU persetujuan.

---

# FASE 4 — LAPORAN + BUKU BESAR

### Task 14: Laporan (index + 4 statement)

**Files:**
- Modify: `src/app/(app)/laporan/page.tsx`
- Modify: `src/app/(app)/laporan/neraca/page.tsx`
- Modify: `src/app/(app)/laporan/laba-rugi/page.tsx`
- Modify: `src/app/(app)/laporan/arus-kas/page.tsx`
- Modify: `src/app/(app)/laporan/perubahan-ekuitas/page.tsx`
- Modify: `src/components/statement-parts.tsx` (jika ada kartu ringkasan)

**Interfaces:**
- Consumes: `PageHeader`, `GlowCard`, `.data-table` (Task 1–4).

- [ ] **Step 1: Terapkan resep**

- Semua header → `PageHeader` (title sesuai existing).
- Kartu/kotak ringkasan atas halaman (bukan statement) → `GlowCard`.
- Statement (tabel neraca/laba rugi/arus kas/ekuitas): bungkus `overflow-x-auto`, tambahkan `data-table` + `.num` pada kolom angka; `.rule-double` untuk total TETAP.
- JANGAN sentuh `@media print`; pastikan tidak menambah efek animasi di dalam area statement (print-safe).

- [ ] **Step 2: Verifikasi visual + print**

Run: `bun run dev` → buka /laporan/neraca; Ctrl+P preview: tetap kertas terang rapi. Cek 4 statement lain + index. Matikan server.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/laporan" src/components/statement-parts.tsx
git commit -m "feat(design): laporan pages — summary glow, print-safe statements"
```

---

### Task 15: Buku Besar

**Files:**
- Modify: `src/app/(app)/buku-besar/page.tsx`

- [ ] **Step 1: Terapkan resep** — header → `PageHeader title="Buku Besar" eyebrow="Riwayat akun"`; tabel dibungkus `overflow-x-auto` + `data-table` + `.num`; kartu ringkasan akun (jika ada) → `GlowCard`.

- [ ] **Step 2: Verifikasi visual** — buka /buku-besar, pilih akun, tabel terbaca. Matikan server.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/buku-besar/page.tsx"
git commit -m "feat(design): buku besar data-table + glow"
```

---

### Task 16: GERBANG FASE 4

- [ ] **Step 1: Gerbang teknis** — sama seperti Task 7 Step 1.
- [ ] **Step 2: Review visual user** — /laporan + 1 statement + print preview + /buku-besar. TUNGGU persetujuan.

---

# FASE 5 — ASISTEN + TEMUAN + PENGATURAN + AUDIT

### Task 17: Asisten Nara + widget

**Files:**
- Modify: `src/app/(app)/asisten/page.tsx`
- Modify: `src/components/assistant-widget.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `GlowCard` (Task 2/4); pola aurora halus = `GlowCard intensity="medium"` pada header chat.

- [ ] **Step 1: Terapkan resep**

- /asisten: header → `PageHeader title="Nara" eyebrow="Asisten keuangan"`; panel chat → `GlowCard intensity="medium"`; bubble chat tetap polos.
- `assistant-widget.tsx`: tombol floating dapat `shadow-md` + ring `ring-terra/30`; panel yang terbuka dibungkus `GlowCard`.

- [ ] **Step 2: Verifikasi visual + fungsional** — kirim 1 pesan ke Nara (AI_MOCK=1 di .env dev), balasan tampil; widget buka/tutup mulus. Matikan server.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/asisten/page.tsx" src/components/assistant-widget.tsx
git commit -m "feat(design): nara chat stage + floating widget glow"
```

---

### Task 18: Temuan + Pengaturan

**Files:**
- Modify: `src/app/(app)/temuan/page.tsx`
- Modify: `src/app/(app)/pengaturan/page.tsx`
- Modify: `src/components/settings/archive-toggle.tsx`, `src/components/settings/period-actions.tsx` (hanya wrapper kartu bila perlu)

- [ ] **Step 1: Terapkan resep** — header → `PageHeader`; kartu list/drawer temuan → `GlowCard`; severity pill TETAP (sudah konsisten); kartu pengaturan → `GlowCard`; tabel → `data-table` bila ada.

- [ ] **Step 2: Verifikasi visual + fungsional** — buka /temuan (drawer buka-tutup), /pengaturan (toggle arsip, aksi periode). Matikan server.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/temuan" "src/app/(app)/pengaturan" src/components/settings
git commit -m "feat(design): temuan + pengaturan glow cards"
```

---

### Task 19: Audit motion & koreografi (skill improve-animations + hyperframes)

**Files:**
- Modify: hanya file yang ditandai hasil audit

- [ ] **Step 1: Jalankan audit**

Load skill `improve-animations` dan `hyperframes-animation` (bagian audit). Survei semua animasi baru (beams, spotlight, moving-border, glow, stagger, animated-number) + existing. Kriteria: durasi/easing konsisten dengan token (`--duration-*`, `--ease-out-soft`), tidak ada layout thrash, tidak ada animasi pada properti selain transform/opacity/filter, reduced-motion benar di SEMUA komponen baru.

- [ ] **Step 2: Terapkan perbaikan hasil audit** (maksimal yang bersifat polish; bukan redesign ulang)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "polish(design): motion audit fixes — timing, reduced-motion, perf"
```

---

### Task 20: Docs + GERBANG AKHIR

**Files:**
- Modify: `AGENTS.md` (baris Conventions → UI)

- [ ] **Step 1: Update konvensi UI di AGENTS.md**

Ganti baris `- **UI:** Bahasa Indonesia copy, Paper & Ink tokens ...` menjadi:

```markdown
- **UI:** Bahasa Indonesia copy, Paper & Ink × Swiss 2.0 soft tokens `src/app/globals.css` (canvas/paper/ink/terra + elevation + gutter), Aceternity set `src/components/aceternity/*` (token-skinned), motion primitives `src/components/motion`, `prefers-reduced-motion` respected. Sidebar `w-64 ↔ w-[4.25rem]` persisted `neraca:sidebar-collapsed`, topbar Cmd+K palette (`searchGlobalAction`). Layout full-bleed fluid — no boxed max-width.
```

- [ ] **Step 2: Commit docs**

```bash
git add AGENTS.md
git commit -m "docs: UI conventions — swiss 2.0 soft"
```

- [ ] **Step 3: Gerbang akhir**

```powershell
bun run build; bunx tsc --noEmit; bun run e2e
```

Expected: hijau (e2e 3/3 smoke; 2 fail ai-copilot pre-existing).

- [ ] **Step 4: Review visual akhir user** — kelilingi semua halaman light+dark. Setelah disetujui, migrasi desain selesai.

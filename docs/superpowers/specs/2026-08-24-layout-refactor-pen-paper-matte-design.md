# Layout Refactor — Pen Paper Matte — Design Spec

**Date:** 2026-08-24
**Status:** Approved — ready for implementation (build mode)
**Scope:** UI/UX + motion only. **No logic changes** (`src/server/*`, `src/core/*`, `src/server/actions/*` untouched except read-only helper for Cmd+K search if needed). Props and server-action signatures stay identical.
**Style:** Pen Paper Matte — the existing Paper & Ink warmed, desaturated, and given a matte paper finish. Industry-standard layout quality.

---

## 1. Goals & Non-Goals

**Goals**
- Best-industry layout: collapsible sidebar, topbar with breadcrumb + global search (Cmd+K), theme toggle, profile menu.
- Matte finishing: muted palette, ultra-soft shadows, matte paper texture, zero gloss/glow.
- Motion that serves the subject: page-load reveal, stagger for card/list grids, micro-interactions on press/hover, orchestrated page transitions — all `prefers-reduced-motion` aware.
- Content-first polish: every page (Dasbor, Jurnal Umum, Asisten AI, Buku Besar, Laporan, Pengaturan, masuk/daftar) gets density, hover, empty-state, and filter consistency.

**Non-Goals**
- No accounting logic, posting pipeline, RAG, or API changes.
- No new backend tables or auth flows.
- No dark-mode removal — dark stays, retuned to matte charcoal (warm).

**Success criteria**
- `npm run build`, `npx tsc --noEmit`, `npx vitest run` (72/72), `npm run e2e` (5/5) stay green.
- Full responsive down to 375px, keyboard focus visible, reduced-motion respected.
- Light + dark both read as the same "Paper & Ink" family (just paper tone, not hue shift).

---

## 2. Decisions Locked (from brainstorming)

| Decision | Choice |
|---|---|
| Matte meaning | Lembut & redup (desaturated, subtle shadows, fine paper noise) |
| Refactor scale | Total: shell + dasbor + every page (auth, tables, filters) |
| Motion library | Framer Motion (`motion`) + CSS easing tokens (`--ease-*`, `--duration-*`) |
| Shell pattern | Collapsible sidebar (`w-64` ↔ `w-16`) + topbar (breadcrumb, Cmd+K, theme 3-state, profile) |

---

## 3. Foundation — Tokens & Motion

**Palette matte** (override existing `@theme` Paper & Ink; dark values live in `.dark`):

| Token | Light (current) | Light Matte | Dark Matte |
|---|---|---|---|
| `--color-canvas` | `#FAF7F2` | `#F5F1E9` | `#1B1713` |
| `--color-paper` | `#FFFDF9` | `#FBFAF6` | `#241F19` |
| `--color-ink` | `#1C2430` | `#232A33` | `#EDE4D7` |
| `--color-ink-soft` | `#5B6470` | `#6B6F76` | `#A89A88` |
| `--color-terra` | `#B4552D` | `#A8562F` | `#D06B40` |
| `--color-rule` | `#E4DDD0` | `#E7E1D4` | `#3D3529` |
| `--color-debit` | `#1F7A4D` | `#3E7C5A` | `#4CC38A` |
| `--color-credit` | `#B4552D` | `#9C5A38` | `#D06B40` |

**Finishing matte**
- Shadows: `0 1px 2px rgb(35 42 51 / 0.04)` + `0 8px 24px rgb(35 42 51 / 0.05)` only; no colored glows.
- Radii: 8–12px on cards/inputs; 0 gloss.
- Texture (optional, opacity 0.02): `background-image: url("data:image/svg+xml,…noise…")` on `html` — fine grain, print-excluded via `@media not print`.
- Surfaces: `bg-paper` on cards, `bg-canvas` on page, hairline `border-rule`.

**Motion tokens** (new CSS vars in `globals.css`):
```css
--ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);      /* enter  */
--ease-in-soft: cubic-bezier(0.55, 0.06, 0.68, 0.19);  /* exit — faster */
--duration-fast: 150ms;
--duration-base: 240ms;
--duration-slow: 400ms;
@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
```

---

## 4. Shared Motion Primitives (`src/components/motion/`)

Pure presentational, zero domain imports. Wrap existing children.

- **`Reveal`**: `motion.div` — `opacity 0→1, y 12→0, 400ms, ease-out-soft`. Stops on reduced-motion (render final state immediately).
- **`Stagger`**: parent `motion.div` with `staggerChildren: 0.06` (max 6), children are `Reveal`. Used for KPI grid, table-body rows, report list.
- **`PageTransition`**: wraps `<main>` content — `opacity 0→1, y 8→0, 240ms`. Keyed by `pathname` for route transitions.
- **`Pressable`**: button/card micro-interaction — `whileHover: y -1`, `whileTap: scale 0.98, transition 150ms`. Around shadcn `Button`/`Card`.

All primitives check `useReducedMotion()` (from `motion`) and bail to static rendering when true.

---

## 5. Shell — Collapsible Sidebar + Topbar + Cmd+K

**Sidebar (`src/components/sidebar-nav.tsx` refactor)**
- Width `w-64` (expanded) ↔ `w-16` (collapsed), animated `width 240ms ease-out-soft`. Controlled by `useState` in layout; persisted to `localStorage` (`neraca:sidebar-collapsed`).
- Expanded: brand "Neraca" + subtitle + nav list. Collapsed: icon-only, tooltip on hover (radix-like via title/shadcn Tooltip if available; fallback `title` attr).
- Nav items (constant):
  ```ts
  const ITEMS = [
    { href: "/dasbor",        label: "Dasbor",        icon: LayoutDashboard },
    { href: "/jurnal",        label: "Jurnal Umum",   icon: BookOpen },
    { href: "/jurnal/ai",     label: "Asisten AI",    icon: Sparkles },
    { href: "/buku-besar",    label: "Buku Besar",    icon: Library },
    { href: "/laporan",       label: "Laporan",       icon: FileBarChart },
    { href: "/pengaturan",    label: "Pengaturan",    icon: Settings2 },
    { href: "/jurnal?tab=draft", label: "Draft AI",   icon: Inbox, badge: pendingCount }, // shows inside Jurnal when collapsed? tab is separate — show as nav item that highlights when tab=draft
    // Temuan → still "Segera" (disabled, muted) until M4
  ];
  ```
  Each row: `px-3 py-2 rounded-md text-sm`. Active = `bg-canvas text-terra` + `3px` left bar (`before:`). Collapsed hides label + badge.
- Footer (inside sidebar, above Keluar): `ThemeToggle` (3-state Monitor/Sun/Moon, already exists) + `Keluar` button. Both icon-only when collapsed.
- Motion: nav items stagger on mount; collapse animates width + fades labels.

**Topbar (`src/components/topbar.tsx` new)**
- Sticky `top-0` on page, `h-14`, `border-b border-rule bg-paper/80 backdrop-blur-sm`.
- Left: **breadcrumb** derived from `usePathname()` + `useSearchParams()` (e.g. `Jurnal Umum / Review Draft`). Small, uppercase eyebrow.
- Center: search trigger (Cmd+K hint). Visual: input-like button `⌘K Cari jurnal, akun…`.
- Right: theme toggle duplicate? Keep single source — sidebar toggle stays; topbar shows compact icon toggle too (hidden on `lg` to avoid duplication) + profile (email + avatar initial + dropdown with Keluar).

**Cmd+K palette (`src/components/command-palette.tsx` new)**
- Trigger: click on topbar search, or `Cmd/Ctrl+K`. Listens globally when not in an input.
- Modal: shadcn `Dialog`-like, `AnimatePresence` fade+scale. Results grouped: **Halaman** (6 nav targets), **Jurnal** (recent `journal_entries` by `number`, search via substring on `number` + `memo`), **Akun** (COA by `code | name`).
- Data: new read-only helper `src/server/db/repos/search.repo.ts` → `searchJournals(q, orgId, term, limit 5)` and `searchAccounts(q, orgId, term, limit 5)` (uses `ILIKE` on org-scoped rows). Called via server action `src/server/actions/search.actions.ts` `searchGlobalAction(term): Promise<GlobalSearchResult[]>`.
- Keys: `ArrowUp/Down`, `Enter` navigates, `Esc` closes. `prefers-reduced-motion` disables scale.

**Responsive**
- `≥1024px`: collapsible sidebar + topbar.
- `<1024px`: sidebar collapses to rail `w-16` permanently (no overlay drawer — avoids z-index battles). Topbar compacts: breadcrumb shortened, search icon-only.
- Mobile auth pages centered (already correct).

**Route layout (`src/app/(app)/layout.tsx` refactor)**
- New structure: `<div class="flex min-h-screen"> <Sidebar /> <div class="flex flex-1 flex-col min-w-0"> <Topbar /> <main class="flex-1"><PageTransition><children/></PageTransition></main> </div></div>`
- `<html suppressHydrationWarning>` and `ThemeProvider` stay exactly as they are.

---

## 6. Page-Level Polish (content-first)

Applies to every page, logic untouched, same data props and server-action signatures.

**Global table language**
- Header: `text-xs uppercase tracking-wide text-ink-soft`, `border-b border-rule`.
- Body rows: `py-3`, `hover:bg-canvas`, `tnum` on numeric cells, right-aligned, `border-b border-rule/60`.
- Empty state: centered card — `BookOpen` icon + "Belum ada …" + CTA button (same action as header CTA). Not a bare `<td colspan>`.
- Filters/selects: one row, `h-9 rounded-md border-rule bg-paper`, consistent spacing `gap-3`.

**Dasbor (`dasbor/page.tsx`)**
- Welcome header `Reveal` + 3 KPI `Card`s wrapped in `Stagger` (Periode Berjalan / Saldo Kas & Bank / Laba Tahun Ini).
- Cards: matte surface `bg-paper border-rule`, value `font-display text-2xl`, badge status, micro Pressable on hover.
- Bottom callout ("Asisten AI … M2–M4") becomes a quiet `bg-canvas border-rule` panel, not a loud border.

**Jurnal Umum + Draft AI (`jurnal/page.tsx`)**
- Tabs `Manual | Draft AI` get pill active state (existing, keep) + `motion.div layoutId="tab-active"` sliding indicator.
- Manual table: as above. Draft table: badge colours (PENDING outline, ACCEPTED `bg-canvas text-debit`, REJECTED neutral).

**Jurnal Baru & Asisten Composer (`jurnal/baru`, `jurnal/ai`)**
- Form `Card` with matte border, textarea `rows=4` outline focus `border-terra`. Submit `bg-terra`.

**Review (`jurnal/ai/[id]`)**
- Keep two-column `md:grid-cols-2` (today `gap-8` → polish to `gap-6`, cards uniform). Left card "Apa yang dibaca asisten" + confidence/extracted badge. Right editable table: terracotta left-border on `confidence<0.7` (`border-l-4 border-l-terra`), diff summary `bg-canvas`.

**Buku Besar, Laporan, Pengaturan**
- Buku Besar: filter row + table + `Saldo Akhir .rule-double`.
- Laporan: index list keeps `divide-y`; report `StatementShell` already paper — raise card padding to `p-6` consistently, print-excluded texture.
- Pengaturan: three `Card`s stacked (`Bagan Akun`, `Periode`, `Anggota`), each `Stagger`'d; archive buttons keep `ghost` variant.

**Auth (masuk/daftar)**
- Centered `Card w-[380px] border-rule bg-paper`, brand mark above card, heading `font-display`. Keep labels/placeholders/errors exactly (e2e depends on "Nama Organisasi", "Kata Sandi"). Add subtle `Reveal` on card mount; button `bg-terra` unchanged.

**Copy**
- Audit per `frontend-design` “More on writing”: labels label, actions say what happens ("Buat Draft" → result "Draft terbuat"), empties invite action. No copy changes beyond consistency (already Indonesian, good).

---

## 7. Animation Plan (improve-animations lens — read-only audit outcome, implementation lives in primitives + shell)

- **Entrance:** `Reveal`/`Stagger` on dashboard cards, report index, draft list, jurnal table body (first 12 rows only — beyond, no stagger to avoid scroll jank).
- **Transitions:** `PageTransition` on `<main>` only — not on sidebar/topbar (avoids layout thrash).
- **Micro:** `Pressable` on primary buttons + KPI cards.
- **Palette search:** `AnimatePresence` fade 150ms + list stagger 60ms.
- **Easings:** `ease-out-soft` for enters, `ease-in-soft` for exits (exits visibly faster). Never `ease-in` for entrances.
- **Performance:** animate only `opacity` + `transform`; no `width/height` animation except sidebar width (composited via `transform` fallback if needed — width animates `transform: translate` illusion on rail, actual width via CSS transition on flex-basis, 240ms, acceptable as one element).
- **Accessibility:** every `motion.*` checks `useReducedMotion()`; `@media (prefers-reduced-motion: reduce)` kills CSS transitions globally.

---

## 8. Constraints & Verification

**Hard constraints**
- No edits to `src/server/db/*` (except optional `search.repo.ts` read-only helper), `src/server/ai/*`, `src/server/actions/*` signatures, `src/core/*` (except `src/core/ai/diff.ts` already shipped), or `drizzle.config.ts`.
- No new backend tables or auth flows. No model/prompt changes.
- Keep tests green without touching test files (except where plan explicitly adds storage tests). Before adding the new search helper, confirm e2e selectors still resolve (labels "Nama Organisasi", "Kata Sandi", button "Daftar").
- Keep dark mode intact; both themes must feel like the same "Paper & Ink" family (handled by `.dark` token override set added in M2 dark work + matte retune).

**Verification**
- `npx tsc --noEmit` — 0 errors, 0 relevant warnings (pre-existing `window.location` in sidebar allowed).
- `npm run build` — succeeds.
- `npx vitest run` — 72/72 (14 → grows only if eval/draft tests added already accounted).
- `npm run e2e` — 5/5 (`smoke.spec.ts` + `ai-copilot.spec.ts`).
- Manual visual: light + dark on dasbor/jurnal/report; responsive at 375/768/1024/1440.

---

## 9. Open Risk

- **SeaweedFS data dir** (`D:\Lucky\weed_strorage`) holds real collections (`evaluasi-mr`, `bmn-attachments`). Never truncate it; raise `volume.max` if needed (already 256).


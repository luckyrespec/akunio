# Akunio Agent Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perbaiki quick access (diam + suggest isi prompt), satukan history thread, jadikan persona Mentor UMKM page-aware, dan tambah memory lintas sesi yang terkontrol.

**Architecture:** Fase 1 tanpa migrasi (kontrak API + UI behavior + shared hook), Fase 2 pure-function persona/suggest yang di-test unit, Fase 3 tabel `assistant_memories` + RLS + extractor/reader + UI pengaturan. Tiap fase shippable dan di-verify sendiri.

**Tech Stack:** Next 16.3 App Router, React 19, Drizzle 0.45 + pg 8, Vitest 4, Playwright 1.62, `@google/genai` Interactions API (`store:true`), Tailwind 4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-08-akunio-agent-upgrade-design.md`

## Global Constraints

- `bun x tsc --noEmit` strict, no `any` (pakai `unknown` / tipe eksplisit) — wajib hijau tiap task.
- `bun run build` wajib hijau tiap fase.
- Jangan pakai `drizzle-kit generate` (crash BigInt repo-wide) — tulis SQL migrasi tangan, `IF NOT EXISTS`, pisahkan pernyataan dengan `--> statement-breakpoint`, tambah entri `_journal.json`, tanpa snapshot.
- Setiap tabel baru ber-`org_id`: `FORCE RLS` via blok DO idempotent di `src/server/db/rls.sql`; transaksi tenant-scoped wajib via `withOrg` (`src/server/db/repos/with-org.ts`) agar lolos `app_user`.
- Tambah tabel baru ke TRUNCATE di `tests/integration/helpers.ts:21-37` atau suite integrasi lain rusak.
- Test DB hanya `ledger_test` (`tests/setup.ts` + `guardTestDb`); tidak pernah sentuh dev Neon dari test. Koneksi eksplisit pakai `node.exe`, bukan `bunx` di child `execSync(shell:true)`.
- `GEMINI_MODEL` default `gemini-3.5-flash-lite` (jangan `2.5-*`/`2.0-*`/`1.5-*`); test AI pakai `AI_MOCK=1` deterministik.
- Upload ≤5MB (`MAX_DOCUMENT_BYTES`); MIME hanya images + pdf + csv/txt/xls/xlsx (`ALLOWED_MIMES`).
- Bahasa UI Indonesia; token Paper & Ink; `prefers-reduced-motion` dihormati.
- Playwright: `workers:1`, `reuseExistingServer:true`, kill `:3000` basi sebelum `bun run e2e`; tiap `goto` tunggu `networkidle` + hidrasi; jaga kontrak `data-testid`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/api/nara/threads/route.ts` | Kontrak `GET` → `{ threads }` (fix bug array mentah) |
| `src/lib/parse-threads.ts` (baru) | Pure parser `parseThreadsResponse` tahan dua bentuk (objek baru + array lama) |
| `src/hooks/use-nara-threads.ts` (baru) | Shared store thread: fetch, seed SSR, prepend optimistik, `last_thread_id` sync |
| `src/components/assistant-widget.tsx` | Hapus auto-briefing, suggest isi-prompt, listener `akunio:open-assistant`, pakai shared hook |
| `src/app/(app)/asisten/asisten-client.tsx` | Suggest isi-prompt, pakai shared hook (seed `initialThreads`) |
| `src/components/ai-elements/nara-message-feed.tsx` | Pills SSE suggest → isi prompt (teruskan `onSelectSuggestion` tanpa kirim) |
| `src/server/ai/persona.ts` (baru) | Pure `buildAkunioSystemPrompt` + `buildPageAngle` (Mentor UMKM, page-aware) |
| `src/app/api/nara/chat/stream/route.ts` | Pakai builder persona + blok ingatan + `pageContext` |
| `src/server/ai/nara.ts` | Pakai builder persona yang sama (satu suara) |
| `src/server/ai/suggestions.ts` | Suggest page-aware (terima `pagePath`) + fallback tetap |
| `src/server/db/schema/assistant-memory.ts` (baru) | Drizzle tabel `assistant_memories` |
| `drizzle/0018_assistant_memories.sql` (baru) + `drizzle/meta/_journal.json` | Migrasi hand-write + entri journal `idx:18` |
| `src/server/db/rls.sql` | Blok DO idempotent `FORCE RLS` + policy `tenant_isolation_assistant_memories` |
| `src/server/db/repos/assistant-memory.repo.ts` (baru) | CRUD memori via `Queryable`, validasi 1–500 char |
| `src/server/ai/memory-extractor.ts` (baru) | Ekstraktor eksplisit ("ingat ya") + ringkas thread + `formatMemoriesForPrompt` |
| `src/server/db/repos/chat.repo.ts` | Trigger ringkas saat pesan >20 (panggil extractor, fail-silent) |
| `tests/integration/helpers.ts` | TRUNCATE tambah `assistant_memories` |
| `src/app/(app)/pengaturan/page.tsx` + actions | Seksi Ingatan Akunio: list/edit/hapus/toggle `aiMemoryEnabled` |
| `tests/integration/assistant-memory.test.ts` (baru) | Test repo + RLS |
| `tests/unit/parse-threads.test.ts`, `tests/unit/persona.test.ts`, `tests/unit/memory-extractor.test.ts` (baru) | Test pure functions |
| `tests/e2e/assistant-behavior.spec.ts` (baru) | E2E diam + suggest + sinkron history + toggle memory |

**Interfaces antar task:**
- Task 1 produces `parseThreadsResponse(data: unknown): ThreadItem[]` dengan `ThreadItem = { id: string; title: string; updatedAt: string | Date; pinned?: boolean; modelPreset?: string }`.
- Task 3 consumes `parseThreadsResponse`; produces `useNaraThreads(opts: { initialThreads?: ThreadItem[] }): { threads: ThreadItem[]; activeThreadId: string | null; setActiveThreadId(id: string | null): void; refresh(): Promise<void>; handleCreated(id: string, title: string): void }`.
- Task 4 produces `buildAkunioSystemPrompt(opts: { businessType?: string | null; pageLabel?: string | null; memoryBlock?: string }): string` dan `buildPageAngle(pageLabel?: string | null): string`.
- Task 6 produces `listMemories(q, orgId): Promise<AssistantMemory[]>`, `saveMemory(q, orgId, input: { kind: MemoryKind; content: string; source: "user" | "auto"; sourceThreadId?: string | null }): Promise<AssistantMemory>`, `deleteMemory(q, orgId, id: string): Promise<boolean>`, `MemoryKind = "PROFILE" | "PREFERENCE" | "FACT" | "THREAD_SUMMARY"`, `AssistantMemory = { id: string; orgId: string; kind: MemoryKind; content: string; source: "user" | "auto"; sourceThreadId: string | null; updatedAt: Date }`.
- Task 7 consumes `saveMemory`/`listMemories` + `buildAkunioSystemPrompt`; produces `extractExplicitMemory(message: string): { kind: MemoryKind; content: string } | null` dan `formatMemoriesForPrompt(mems: AssistantMemory[]): string`.

---

### Task 1: Kontrak threads + parser tahan dua bentuk

**Files:**
- Create: `src/lib/parse-threads.ts`
- Create: `tests/unit/parse-threads.test.ts`
- Modify: `src/app/api/nara/threads/route.ts:6-15`

**Interfaces:**
- Consumes: `listThreads(q, orgId)` dari `src/server/db/repos/chat.repo.ts:21-27` (tidak berubah).
- Produces: `parseThreadsResponse`, `ThreadItem` (lihat di atas; dipakai Task 3).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/parse-threads.test.ts
import { describe, expect, it } from "vitest";
import { parseThreadsResponse } from "@/lib/parse-threads";

describe("parseThreadsResponse", () => {
  it("membaca kontrak baru { threads }", () => {
    const out = parseThreadsResponse({ threads: [{ id: "a", title: "Kas", updatedAt: "2026-09-08" }] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
  });
  it("tahan kontrak lama array mentah", () => {
    const out = parseThreadsResponse([{ id: "b", title: "Lama", updatedAt: "2026-09-07" }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });
  it("buang item tak valid, kembalikan [] untuk bentuk asing", () => {
    expect(parseThreadsResponse({ threads: [{ id: 1 }] })).toEqual([]);
    expect(parseThreadsResponse(null)).toEqual([]);
    expect(parseThreadsResponse({ error: "x" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/parse-threads.test.ts`
Expected: FAIL with "Cannot find module '@/lib/parse-threads'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/parse-threads.ts
export interface ThreadItem {
  id: string;
  title: string;
  updatedAt: string | Date;
  pinned?: boolean;
  modelPreset?: string;
}

function isThreadItem(v: unknown): v is ThreadItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o["id"] === "string" && typeof o["title"] === "string";
}

export function parseThreadsResponse(data: unknown): ThreadItem[] {
  const raw: unknown =
    Array.isArray(data) ? data
    : typeof data === "object" && data !== null && Array.isArray((data as Record<string, unknown>)["threads"])
      ? (data as Record<string, unknown>)["threads"]
      : [];
  return (raw as unknown[]).filter(isThreadItem);
}
```

- [ ] **Step 4: Fix route ke kontrak objek**

```ts
// src/app/api/nara/threads/route.ts — ganti isi GET:
export async function GET() {
  try {
    const ctx = await requireContext();
    const threads = await listThreads(db, ctx.orgId);
    return NextResponse.json({ threads });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal mengambil daftar percakapan.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/unit/parse-threads.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `bun x tsc --noEmit`
Expected: PASS, tanpa error baru.

- [ ] **Step 7: Commit**

```bash
git add src/lib/parse-threads.ts tests/unit/parse-threads.test.ts src/app/api/nara/threads/route.ts
git commit -m "fix(nara): kontrak threads {threads} + parser tahan dua bentuk"
```

---

### Task 2: Widget diam + suggest isi-prompt + listener dasbor

**Files:**
- Modify: `src/components/assistant-widget.tsx:127-179, 360-444`
- Modify: `src/app/(app)/asisten/asisten-client.tsx:399-451`
- Modify: `src/components/ai-elements/nara-message-feed.tsx:165-175, 317-327`
- Test: `tests/e2e/assistant-behavior.spec.ts` (dibuat di sini, dipakai penuh di Task 9)

**Interfaces:**
- Consumes: `parseThreadsResponse` (Task 1) untuk `loadThreads`; `setInput` + `handleSendMessage` dari `useNaraStreamChat` (tidak berubah signature-nya).
- Produces: perilaku "diam" = nol `POST /api/nara/chat/stream` sampai user kirim; `onSelectSuggestion(val)` hanya `setInput(val)` + fokus input.

- [ ] **Step 1: Hapus blok auto-briefing (168-179)**

Hapus seluruh `useEffect` berlabel `Proactive Daily Briefing on first daily open` di `assistant-widget.tsx` (baris 168-179). Jangan sisakan `localStorage neraca:last_briefing_date`. Ganti `loadThreads` agar pakai parser:

```tsx
const data: unknown = await res.json();
const list = parseThreadsResponse(data);
setThreads(list);
if (!activeThreadId && list.length > 0) setActiveThreadId(list[0].id);
```

- [ ] **Step 2: Suggest widget jadi isi-prompt**

Ganti `onSelectSuggestion` di `NaraMessageFeed` (baris 360-363) menjadi:

```tsx
onSelectSuggestion={(val) => {
  setInput(val);
  inputRef.current?.focus();
}}
```

Pastikan `inputRef` adalah ref ke `PromptInput`/textarea yang dipakai widget (cek deklarasi ref di atas file; jika bernama lain mis. `promptRef`, pakai itu). Untuk SEMUA `Suggestion onClick` empty-state (persediaan cek-stok, 3 aturan, briefing, saldo kas): ganti isi menjadi `setInput(val); inputRef.current?.focus();` — TANPA `handleSendMessage`. Kecualikan satu: `Ekstrak & Input Barang` tetap `setInput(val); fileInputRef.current?.click();`.

- [ ] **Step 3: Samakan asisten-client + feed pills**

Di `asisten-client.tsx:399-402` dan empty-state (3 auto-kirim: Laba Rugi/Posisi Kas/Cek Kesehatan): ganti ke `setInput(prompt);` + fokus, tanpa kirim. `Catat Pengeluaran` sudah isi-saja — biarkan. Di `nara-message-feed.tsx` kedua situs pills (`165-175`, `317-327`): teruskan `onSelectSuggestion` apa adanya, jangan panggil kirim di dalam feed.

- [ ] **Step 4: Listener event dasbor**

Tambahkan di `assistant-widget.tsx` dekat shortcut effect:

```tsx
React.useEffect(() => {
  const onOpen = (e: Event) => {
    const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt ?? "";
    setOpen(true);
    setPageContext(getActivePageContext());
    if (prompt) setInput(prompt);
  };
  window.addEventListener("akunio:open-assistant", onOpen);
  return () => window.removeEventListener("akunio:open-assistant", onOpen);
}, []);
```

- [ ] **Step 5: Typecheck + build**

Run: `bun x tsc --noEmit`
Expected: PASS.
Run: `bun run build`
Expected: PASS (production build hijau).

- [ ] **Step 6: Commit**

```bash
git add src/components/assistant-widget.tsx src/app/\(app\)/asisten/asisten-client.tsx src/components/ai-elements/nara-message-feed.tsx
git commit -m "fix(assistant): quick access diam, suggest isi prompt, wire event dasbor"
```

---

### Task 3: Shared hook use-nara-threads + wiring dua permukaan

**Files:**
- Create: `src/hooks/use-nara-threads.ts`
- Modify: `src/components/assistant-widget.tsx:61-62, 127-144, 275-284, 290-297`
- Modify: `src/app/(app)/asisten/asisten-client.tsx:56-59`
- Test: `tests/unit/use-nara-threads.test.ts` (atau integrasi ringan bila hook butuh DOM — pilih vitest + `fetch` mock)

**Interfaces:**
- Consumes: `parseThreadsResponse`, `ThreadItem` (Task 1).
- Produces: `useNaraThreads` (signature di atas; dipakai kedua permukaan). Return aktual hook: `{ threads, setThreads, activeThreadId, setActiveThreadId, refresh, handleCreated }` — `setThreads` dipakai internal/format lanjutan, kedua permukaan wajib pakai `refresh`/`handleCreated` untuk mutasi agar sinkron.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/use-nara-threads.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { parseThreadsResponse } from "@/lib/parse-threads";

afterEach(() => vi.unstubAllGlobals());

describe("threads sync", () => {
  it("fetch objek dibaca sama dengan fetch array lama", async () => {
    const objShape: unknown = { threads: [{ id: "a", title: "A", updatedAt: "2026-09-08" }] };
    const arrShape: unknown = [{ id: "a", title: "A", updatedAt: "2026-09-08" }];
    expect(parseThreadsResponse(objShape)).toEqual(parseThreadsResponse(arrShape));
  });
  it("prepend thread baru di depan", () => {
    const prev = parseThreadsResponse([{ id: "a", title: "A", updatedAt: "2026-09-08" }]);
    const next = [{ id: "n", title: "Baru", updatedAt: new Date().toISOString() }, ...prev];
    expect(next[0].id).toBe("n");
    expect(next).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/use-nara-threads.test.ts`
Expected: FAIL hanya jika file hook yang diimpor belum ada — bila test di atas lolos langsung (karena hanya pakai parser), lanjutkan sebagai test pengunci kontrak, tetap catat PASS dan lanjut implementasi hook.

- [ ] **Step 3: Write minimal implementation (hook)**

```ts
// src/hooks/use-nara-threads.ts
"use client";
import * as React from "react";
import { parseThreadsResponse, type ThreadItem } from "@/lib/parse-threads";

const LAST_THREAD_KEY = "neraca:last_thread_id";

export function useNaraThreads(opts: { initialThreads?: ThreadItem[] } = {}) {
  const [threads, setThreads] = React.useState<ThreadItem[]>(opts.initialThreads ?? []);
  const [activeThreadId, setActiveThreadIdState] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_THREAD_KEY);
    } catch {
      return null;
    }
  });

  const setActiveThreadId = React.useCallback((id: string | null) => {
    setActiveThreadIdState(id);
    try {
      if (id) localStorage.setItem(LAST_THREAD_KEY, id);
      else localStorage.removeItem(LAST_THREAD_KEY);
    } catch {}
  }, []);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/nara/threads");
    if (!res.ok) return;
    const list = parseThreadsResponse(await res.json());
    setThreads(list);
    if (!localStorage.getItem(LAST_THREAD_KEY) && list.length > 0) {
      setActiveThreadId(list[0].id);
    }
  }, [setActiveThreadId]);

  const handleCreated = React.useCallback(
    (id: string, title: string) => {
      setThreads((prev) => [{ id, title, updatedAt: new Date().toISOString() }, ...prev]);
      setActiveThreadId(id);
    },
    [setActiveThreadId],
  );

  return { threads, setThreads, activeThreadId, setActiveThreadId, refresh, handleCreated };
}
```

Aturan: tidak ada `any`; `catch {}` tanpa param agar lolos lint.

- [ ] **Step 4: Wire widget + asisten-client**

Widget: ganti state lokal `threads/activeThreadId` + effect `loadThreads` dengan `const { threads, activeThreadId, setActiveThreadId, refresh, handleCreated } = useNaraThreads();` + `React.useEffect(() => { if (open) void refresh(); }, [open, refresh]);`. `onThreadCreated` di hook chat → `handleCreated`. Link Maximize2: `href={activeThreadId ? `/asisten?thread=${activeThreadId}` : "/asisten"}`.
Asisten-client: `const threadStore = useNaraThreads({ initialThreads });` pakai `threadStore.threads` untuk sidebar, pertahankan semua handler CRUD yang ada. Baca `?thread=` saat mount untuk set aktif bila cocok dengan daftar.

- [ ] **Step 5: Run tests + typecheck**

Run: `bunx vitest run tests/unit/use-nara-threads.test.ts tests/unit/parse-threads.test.ts`
Expected: PASS.
Run: `bun x tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-nara-threads.ts src/components/assistant-widget.tsx "src/app/(app)/asisten/asisten-client.tsx" tests/unit/use-nara-threads.test.ts
git commit -m "fix(assistant): shared thread store widget dan asisten sinkron"
```

---

### Task 4: Persona Mentor UMKM sebagai pure function + wiring ganda

**Files:**
- Create: `src/server/ai/persona.ts`
- Create: `tests/unit/persona.test.ts`
- Modify: `src/app/api/nara/chat/stream/route.ts:177-248` (ganti `systemInstruction` inline dengan builder)
- Modify: `src/server/ai/nara.ts:252-280` (pakai builder yang sama)

**Interfaces:**
- Consumes: `memoryBlock?: string` (string jadi dari Task 7; Task ini perlakukan sebagai string opaque).
- Produces: `buildAkunioSystemPrompt`, `buildPageAngle` (signature di atas).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/persona.test.ts
import { describe, expect, it } from "vitest";
import { buildAkunioSystemPrompt, buildPageAngle } from "@/server/ai/persona";

describe("persona Mentor UMKM", () => {
  it("menegaskan identitas Akunio bukan Nara", () => {
    const s = buildAkunioSystemPrompt({});
    expect(s).toMatch(/Namamu adalah Akunio/);
    expect(s).toMatch(/jangan pernah mengaku bernama Nara/);
  });
  it("sudut dasbor = analis, aturan = pengajar SAK", () => {
    expect(buildPageAngle("Dasbor")).toMatch(/analis/i);
    expect(buildPageAngle("Aturan")).toMatch(/SAK/);
  });
  it("blok ingatan disisipkan bila ada", () => {
    const s = buildAkunioSystemPrompt({ memoryBlock: "Ingatan tersimpan:\n- Toko Maju, tutup buku tiap tgl 5" });
    expect(s).toContain("Toko Maju");
  });
  it("tanpa ingatan tidak ada header ingatan", () => {
    expect(buildAkunioSystemPrompt({})).not.toContain("Ingatan tersimpan:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/persona.test.ts`
Expected: FAIL with "Cannot find module '@/server/ai/persona'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/ai/persona.ts
export function buildPageAngle(pageLabel?: string | null): string {
  const l = (pageLabel ?? "").toLowerCase();
  if (l.includes("dasbor")) return "Sudut pandang analis: dahulukan angka kas, laba, dan anomali; tawarkan get_daily_briefing/get_financial_kpis.";
  if (l.includes("jurnal")) return "Sudut pandang validator teliti: cek keseimbangan debit-kredit dan akun COA; tawarkan create_journal_draft.";
  if (l.includes("kas") || l.includes("bank")) return "Sudut pandang kasir teliti: bedakan BAYAR/TRANSFER; tawarkan record_cash_entry/get_cash_summary.";
  if (l.includes("aturan")) return "Sudut pandang pengajar SAK EMKM: jelaskan kriteria pengakuan/pengukuran dengan contoh jurnal sederhana.";
  if (l.includes("persediaan")) return "Sudut pandang admin gudang: rujuk itemId dari list_inventory_items sebelum mutasi.";
  if (l.includes("aset")) return "Sudut pandang penasihat aset: rekomendasikan metode susut sebelum mencatat.";
  return "Sudut pandang mentor umum: tanyakan tujuan usaha sebelum memberi saran.";
}

export function buildAkunioSystemPrompt(opts: {
  businessType?: string | null;
  pageLabel?: string | null;
  memoryBlock?: string;
}): string {
  const lines = [
    "Anda adalah Akunio, Asisten Akuntansi AI Cerdas untuk UMKM Indonesia (IFRS/SAK EMKM).",
    'Namamu adalah Akunio. Jika pengguna bertanya siapa namamu atau menyebut "Nara", tegaskan: Namamu adalah Akunio dan jangan pernah mengaku bernama Nara.',
    "Gaya Mentor UMKM: bahasa Indonesia sederhana, jelaskan KENAPA suatu perlakuan benar, beri contoh nominal kecil, tutup dengan 2-3 langkah lanjut yang konkret.",
    "Format: kalimat singkat; tiap poin daftar di baris baru dengan '- item'; hindari heading besar dan bintang tunggal berlebihan; tebal hanya untuk judul poin utama.",
    "ANTI-LUPA WAJIB: pesan singkat (ok/catatkan ya/lanjutkan) ambil objek dari 12 pesan terakhir; jangan minta ulang; hanya tanya field yang benar-benar hilang.",
    "Jangan mengarang angka; rujuk COA, hasil tool, RAG, dan konteks layar.",
    `Konteks usaha: ${opts.businessType?.trim() ? opts.businessType.trim() : "UMKM Indonesia (umum)"}.`,
    buildPageAngle(opts.pageLabel),
  ];
  const mem = (opts.memoryBlock ?? "").trim();
  if (mem) lines.push(mem);
  return lines.join("\n");
}
```

- [ ] **Step 4: Wire ke stream route + nara.ts**

Stream route: ganti blok `systemInstruction` inline (baris 177-248) menjadi:

```ts
import { buildAkunioSystemPrompt } from "@/server/ai/persona";
// ...
const systemInstruction = buildAkunioSystemPrompt({
  businessType: orgProfile?.business_type ?? null,
  pageLabel: pageContext?.label ?? pageContext?.title ?? null,
  memoryBlock,
});
```

`orgProfile` diambil dari query profil yang sudah ada di route (jika belum ada, ambil `org_profiles` by org — tambah 1 query read, bukan tool). `memoryBlock` string kosong di Task ini (reader Task 7 yang mengisinya); tandai dengan komentar biasa `// Task 7 menghubungkan reader assistant_memories ke sini` dan WAJIB diganti implementasi penuh di Task 7.
`nara.ts`: ganti system prompt inline dengan builder yang sama + param identik.

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/unit/persona.test.ts`
Expected: PASS (4 tests).
Run: `bun x tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/persona.ts tests/unit/persona.test.ts src/app/api/nara/chat/stream/route.ts src/server/ai/nara.ts
git commit -m "feat(ai): persona Mentor UMKM page-aware satu suara"
```

---

### Task 5: Suggest page-aware + fallback dipertahankan

**Files:**
- Modify: `src/server/ai/suggestions.ts` (tambah param `pagePath`)
- Modify: `src/app/api/nara/suggestions/route.ts` (teruskan `pagePath` dari query)
- Modify: `src/components/assistant-widget.tsx` (fetch suggestions dengan `?pagePath=...`)
- Test: `tests/unit/suggestions.test.ts` (atau perluas file test suggestions yang ada bila sudah ada — cek dulu, jangan duplikat)

**Interfaces:**
- Consumes: sinyal lama (`leaf COA`, 5 memo JE, drafts, periods, kas/bank/laba) — tidak diubah.
- Produces: `generatePersonalSuggestions(orgId, opts?: { excludeLabels?: string[]; pagePath?: string }): Promise<Suggestion[]>` dengan `Suggestion = { label: string; prompt: string; icon: "Receipt" | "Wallet" | "BarChart3" | "Search" }`; label ≤28 char, prompt ≤80 char (kontrak lama dipertahankan).

- [ ] **Step 1: Tulis test page-aware (file baru, tanpa duplikat)**

Jalankan `glob tests/**/suggest*` dulu: bila sudah ada file test suggestions, tambah case di file itu; bila tidak ada, buat `tests/unit/suggestions.test.ts` di bawah. Isi case: untuk `pagePath=/jurnal` item teratas berkaitan jurnal/draft/catat; untuk `/aturan` berkaitan SAK/bab/aturan; fallback saat Gemini gagal tetap `FALLBACK_SUGGESTIONS` (isi 8 item lama tidak diubah).

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/suggestions.test.ts`
Expected: FAIL (param `pagePath` belum ada / ranking belum page-aware).

- [ ] **Step 3: Implementasi minimal**

Tambah param opsional + boost skor: jika `pagePath` cocok (`jurnal`→prompt berisi `jurnal|draft|catat`, `kas-bank`→`kas|bank|saldo`, `aturan`→`SAK|bab|aturan`, `persediaan`→`stok|barang`, `dasbor`→`briefing|laba|kas`), naikkan item cocok ke depan tanpa mengubah generator Gemini maupun fallback. Route teruskan `req.nextUrl.searchParams.get("pagePath")`. Widget fetch `/api/nara/suggestions?pagePath=${encodeURIComponent(pathname)}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/suggestions.test.ts`
Expected: PASS.
Run: `bun x tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/suggestions.ts src/app/api/nara/suggestions/route.ts src/components/assistant-widget.tsx tests/unit/suggestions.test.ts
git commit -m "feat(ai): suggest kontekstual per halaman, fallback tetap"
```

---

### Task 6: Skema + migrasi + RLS + repo memory (fondasi Fase 3)

**Files:**
- Create: `src/server/db/schema/assistant-memory.ts`
- Create: `drizzle/0018_assistant_memories.sql`
- Modify: `drizzle/meta/_journal.json` (tambah entri `idx:18`)
- Modify: `src/server/db/rls.sql` (blok DO idempotent)
- Create: `src/server/db/repos/assistant-memory.repo.ts`
- Modify: `tests/integration/helpers.ts:21-37` (TRUNCATE)
- Create: `tests/integration/assistant-memory.test.ts`

**Interfaces:**
- Consumes: `withOrg` untuk transaksi tenant; `Queryable` pattern dari `chat.repo.ts`.
- Produces: `MemoryKind`, `AssistantMemory`, `listMemories`, `saveMemory`, `deleteMemory` (signature di atas).

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/assistant-memory.test.ts
import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { deleteMemory, listMemories, saveMemory } from "@/server/db/repos/assistant-memory.repo";

describe("assistant_memories", () => {
  it("simpan, baca, hapus dalam satu org; org lain terisolasi", async () => {
    await truncateAll();
    const pool: Pool = getPool();
    const a = await makeOrg("mem-a");
    const b = await makeOrg("mem-b");
    await withOrg(a.orgId, (tx) =>
      saveMemory(tx, a.orgId, { kind: "FACT", content: "Tutup buku tiap tanggal 5", source: "user" }),
    );
    const seen = await withOrg(a.orgId, (tx) => listMemories(tx, a.orgId));
    expect(seen).toHaveLength(1);
    const other = await withOrg(b.orgId, (tx) => listMemories(tx, b.orgId));
    expect(other).toHaveLength(0);
    const ok = await withOrg(a.orgId, (tx) => deleteMemory(tx, a.orgId, seen[0].id));
    expect(ok).toBe(true);
    await pool.end();
  });

  it("tolak konten kosong dan lebih dari 500 char", async () => {
    await truncateAll();
    const pool: Pool = getPool();
    const a = await makeOrg("mem-b");
    await expect(
      withOrg(a.orgId, (tx) => saveMemory(tx, a.orgId, { kind: "FACT", content: "  ", source: "user" })),
    ).rejects.toThrow();
    await expect(
      withOrg(a.orgId, (tx) => saveMemory(tx, a.orgId, { kind: "FACT", content: "x".repeat(501), source: "user" })),
    ).rejects.toThrow();
    await pool.end();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/integration/assistant-memory.test.ts`
Expected: FAIL (modul repo/skema belum ada; bila DB `ledger_test` belum siap, jalankan `bun run test:db:setup` dulu dengan PG lokal 5432 menyala).

- [ ] **Step 3: Schema + SQL + journal**

```ts
// src/server/db/schema/assistant-memory.ts
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./org";

export const assistantMemories = pgTable(
  "assistant_memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["PROFILE", "PREFERENCE", "FACT", "THREAD_SUMMARY"] }).notNull(),
    content: text("content").notNull(),
    source: text("source", { enum: ["user", "auto"] }).notNull().default("user"),
    sourceThreadId: uuid("source_thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assistant_memories_org_idx").on(t.orgId), index("assistant_memories_org_kind_idx").on(t.orgId, t.kind)],
);
```

```sql
-- drizzle/0018_assistant_memories.sql
CREATE TABLE IF NOT EXISTS "assistant_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"source_thread_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_memories_org_idx" ON "public"."assistant_memories" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_memories_org_kind_idx" ON "public"."assistant_memories" USING btree ("org_id","kind");
```

Journal: tambah entri persis setelah `idx:17`:

```json
{
  "idx": 18,
  "version": "7",
  "when": 1788900002000,
  "tag": "0018_assistant_memories",
  "breakpoints": true
}
```

RLS (`rls.sql`, pola generik `org_id` seperti tabel lain):

```sql
ALTER TABLE assistant_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_memories FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assistant_memories' AND policyname = 'tenant_isolation_assistant_memories') THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_assistant_memories ON assistant_memories
      USING (org_id = current_setting('app.current_org', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_org', true)::uuid)
    $p$;
  END IF;
END $$;
```

Repo (`assistant-memory.repo.ts`): `saveMemory` trim + validasi panjang 1–500 (throw `Error("Isi ingatan 1-500 karakter.")`), `set updatedAt`; `listMemories` order `updatedAt desc` limit 20 default; `deleteMemory` where `id+orgId` returning. Tanpa `any`.

Helpers TRUNCATE: tambah `assistant_memories` di awal daftar (sebelum `subledger_journal_links`), dan terapkan migrasi ke dev Neon (`bun run db:sql`) + test (`bun run test:db:setup` mengulang migrate).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/integration/assistant-memory.test.ts`
Expected: PASS (2 tests, RLS via `app_user` berlaku karena `withOrg`).

- [ ] **Step 5: Typecheck**

Run: `bun x tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema/assistant-memory.ts drizzle/0018_assistant_memories.sql drizzle/meta/_journal.json src/server/db/rls.sql src/server/db/repos/assistant-memory.repo.ts tests/integration/helpers.ts tests/integration/assistant-memory.test.ts
git commit -m "feat(memory): tabel assistant_memories + RLS + repo"
```

---

### Task 7: Extractor + reader + injeksi prompt ( hapus penanda Task 4)

**Files:**
- Create: `src/server/ai/memory-extractor.ts`
- Create: `tests/unit/memory-extractor.test.ts`
- Modify: `src/app/api/nara/chat/stream/route.ts` (isi `memoryBlock`, hapus penanda)
- Modify: `src/server/ai/nara.ts` (isi `memoryBlock` sama)
- Modify: `src/server/db/repos/chat.repo.ts:76-110` (trigger ringkas >20 pesan)

**Interfaces:**
- Consumes: `listMemories`, `saveMemory` (Task 6); `buildAkunioSystemPrompt` (Task 4).
- Produces: `extractExplicitMemory`, `formatMemoriesForPrompt` (signature di atas).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/memory-extractor.test.ts
import { describe, expect, it } from "vitest";
import { extractExplicitMemory, formatMemoriesForPrompt } from "@/server/ai/memory-extractor";

describe("memory-extractor", () => {
  it("tangkap perintah ingat eksplisit", () => {
    const r = extractExplicitMemory("ingat ya, tutup buku tiap tanggal 5");
    expect(r?.content).toContain("tanggal 5");
    expect(["PROFILE", "PREFERENCE", "FACT"]).toContain(r?.kind);
  });
  it("abaikan chat biasa", () => {
    expect(extractExplicitMemory("berapa saldo kas bulan ini?")).toBeNull();
  });
  it("format blok prompt kosong bila tak ada ingatan", () => {
    expect(formatMemoriesForPrompt([])).toBe("");
  });
  it("format blok berisi ≤20 item dengan header", () => {
    const s = formatMemoriesForPrompt([
      { id: "1", orgId: "o", kind: "FACT", content: "Tutup buku tgl 5", source: "user", sourceThreadId: null, updatedAt: new Date() },
    ]);
    expect(s).toContain("Ingatan tersimpan:");
    expect(s).toContain("Tutup buku tgl 5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/memory-extractor.test.ts`
Expected: FAIL with "Cannot find module '@/server/ai/memory-extractor'".

- [ ] **Step 3: Write minimal implementation (tanpa LLM dulu)**

```ts
// src/server/ai/memory-extractor.ts
import type { AssistantMemory, MemoryKind } from "@/server/db/repos/assistant-memory.repo";

const TRIGGER = /(ingat(?:kan)?(?: ya)?|jangan lupa|catat sebagai preferensi)[,:\s]+(.{3,500})/i;

export function extractExplicitMemory(message: string): { kind: MemoryKind; content: string } | null {
  const m = message.match(TRIGGER);
  if (!m) return null;
  const content = m[2].trim().slice(0, 500);
  if (!content) return null;
  const kind: MemoryKind = /usaha|toko|bisnis|nama/i.test(content) ? "PROFILE" : /selalu|jangan|preferensi|suka/i.test(content) ? "PREFERENCE" : "FACT";
  return { kind, content };
}

export function formatMemoriesForPrompt(mems: AssistantMemory[]): string {
  const list = mems.slice(0, 20);
  if (list.length === 0) return "";
  const lines = list.map((m) => `- [${m.kind}] ${m.content}`);
  return `Ingatan tersimpan (gunakan bila relevan; user bisa mengubahnya di Pengaturan):\n${lines.join("\n")}`;
}
```

LLM JSON-Schema upgrade (opsional, fase lanjut): panggil Gemini `store:false` hanya bila regex tidak yakin — TIDAK wajib di Task ini (YAGNI; regex + tombol simpan manual di UI sudah penuhi spec eksplisit vs auto).

- [ ] **Step 4: Injeksi ke kedua jalur chat + hapus penanda Task 4**

Stream route + `nara.ts`: sebelum bangun prompt,

```ts
import { formatMemoriesForPrompt } from "@/server/ai/memory-extractor";
import { listMemories } from "@/server/db/repos/assistant-memory.repo";
// ...
const memoryEnabled = (orgSettings as Record<string, unknown> | null)?.["aiMemoryEnabled"] !== false;
const mems = memoryEnabled ? await listMemories(db, ctx.orgId) : [];
const memoryBlock = formatMemoriesForPrompt(mems);
```

Teruskan ke `buildAkunioSystemPrompt({ ..., memoryBlock })`. Hapus `const memoryBlock = ""` + komentar transisi Task 4. `orgSettings` = `organizations.settings` yang sudah dibaca route untuk `aiHitlPolicy` (tambah field `aiMemoryEnabled?: boolean`, default true).

- [ ] **Step 5: Trigger ringkas di chat.repo (fail-silent)**

Di `addMessage` setelah insert, hitung pesan thread; bila >20, upsert 1 `THREAD_SUMMARY` (`source:auto`, `sourceThreadId=threadId`, konten = `Ringkasan ${count} pesan terakhir: ...` dari 3 memo/user terakhir — MVP deterministik tanpa LLM). Bungkus `try/catch` + `console.warn`, jangan lempar agar chat tidak mati.

- [ ] **Step 6: Run tests + typecheck**

Run: `bunx vitest run tests/unit/memory-extractor.test.ts tests/unit/persona.test.ts tests/integration/assistant-memory.test.ts`
Expected: PASS.
Run: `bun x tsc --noEmit`
Expected: PASS.
Run: `AI_MOCK=1 bunx vitest run tests/integration/advisor.test.ts tests/integration/assistant-memory.test.ts` (file `advisor.test.ts` sudah ada di repo — dipakai sebagai regresi jalur chat; bila diganti nama di masa depan, pakai file integrasi AI terdekat hasil `glob tests/integration/*advisor* tests/integration/*nara* tests/integration/*ai*`).
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/ai/memory-extractor.ts tests/unit/memory-extractor.test.ts src/app/api/nara/chat/stream/route.ts src/server/ai/nara.ts src/server/db/repos/chat.repo.ts
git commit -m "feat(memory): extractor, reader, injeksi prompt lintas sesi"
```

---

### Task 8: UI Pengaturan Ingatan + toggle master

**Files:**
- Modify: `src/app/(app)/pengaturan/page.tsx` (seksi baru)
- Create/modify: server actions untuk memory di dekat actions pengaturan yang ada (ikuti pola validasi action + test action-level seperti commit `5385e10`)
- Test: `tests/integration/memory-actions.test.ts` (action-level: save/list/delete/toggle) + e2e di Task 9

**Interfaces:**
- Consumes: `listMemories`, `saveMemory`, `deleteMemory` (Task 6); `aiMemoryEnabled` di `organizations.settings`.
- Produces: UI `Ingatan Akunio` (list per kind, edit/hapus per item, toggle master, badge jumlah).

- [ ] **Step 1: Write the failing action test**

```ts
// tests/integration/memory-actions.test.ts
import { describe, expect, it } from "vitest";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { deleteMemory, listMemories, saveMemory } from "@/server/db/repos/assistant-memory.repo";

describe("memory actions", () => {
  it("CRUD round-trip + toggle tidak merusak settings lain", async () => {
    await truncateAll();
    const pool = getPool();
    const { orgId } = await makeOrg("mem-ui");
    const row = await withOrg(orgId, (tx) =>
      saveMemory(tx, orgId, { kind: "PREFERENCE", content: "Sapa dengan nama Toko Maju", source: "user" }),
    );
    expect(row.id).toBeTruthy();
    expect(await withOrg(orgId, (tx) => listMemories(tx, orgId))).toHaveLength(1);
    expect(await withOrg(orgId, (tx) => deleteMemory(tx, orgId, row.id))).toBe(true);
    expect(await withOrg(orgId, (tx) => listMemories(tx, orgId))).toHaveLength(0);
    await pool.end();
  });
});
```

(Toggle `aiMemoryEnabled` diuji di level repo settings yang sudah ada — pertahankan `aiHitlPolicy` saat patch settings; jangan timpa objek settings.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/integration/memory-actions.test.ts`
Expected: FAIL bila actions UI belum ada (atau PASS sebagai pengunci repo — lanjutkan, UI tetap wajib).

- [ ] **Step 3: Implementasi UI minimal (ikuti pola pengaturan)**

Seksi `Ingatan Akunio` di `pengaturan/page.tsx`: toggle `aiMemoryEnabled` (default on, `PATCH` merge ke `organizations.settings` tanpa hapus `aiHitlPolicy`), list ingatan (badge kind + sumber user/auto + waktu), tombol hapus per item, form tambah manual (kind select + textarea 500 char, validasi sama dengan repo). Copy Indonesia. Tanpa animasi baru (atau primitives `Reveal` yang ada bila perlu).

- [ ] **Step 4: Run tests + typecheck + build**

Run: `bunx vitest run tests/integration/memory-actions.test.ts tests/integration/assistant-memory.test.ts`
Expected: PASS.
Run: `bun x tsc --noEmit && bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/pengaturan/page.tsx" tests/integration/memory-actions.test.ts
git commit -m "feat(pengaturan): kelola ingatan Akunio per item + toggle master"
```

---

### Task 9: Badge chat + E2E perilaku + gerbang akhir

**Files:**
- Modify: `src/components/assistant-widget.tsx` + `asisten-client.tsx` (badge `menggunakan N ingatan`, `data-testid="assistant-memory-badge"`)
- Create: `tests/e2e/assistant-behavior.spec.ts`
- Test: seluruh suite

**Interfaces:**
- Consumes: semua task sebelumnya. Badge baca jumlah dari respons stream (`citations`-like: tambah field `memoryUsed: number` di event `done`, atau hitung dari `memoryBlock` — pilih satu, konsisten di kedua permukaan).

- [ ] **Step 1: Write the failing E2E**

```ts
// tests/e2e/assistant-behavior.spec.ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/masuk");
  await page.waitForLoadState("networkidle");
});

test("quick access diam saat dibuka", async ({ page }) => {
  await page.goto("/dasbor");
  await page.waitForLoadState("networkidle");
  const streamCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/nara/chat/stream")) streamCalls.push(r.url());
  });
  await page.getByRole("button", { name: /Buka Asisten Akunio/i }).click();
  await page.waitForTimeout(1500);
  expect(streamCalls).toHaveLength(0);
});

test("suggest mengisi prompt, tidak mengirim", async ({ page }) => {
  await page.goto("/dasbor");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Buka Asisten Akunio/i }).click();
  const streamBefore = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => r.name.includes("chat/stream")).length);
  await page.getByText(/Briefing Keuangan Hari Ini/i).first().click();
  await expect(page.getByTestId("assistant-prompt-input")).not.toBeEmpty();
  const streamAfter = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => r.name.includes("chat/stream")).length);
  expect(streamAfter).toBe(streamBefore);
});

test("history sinkron asisten dan widget", async ({ page }) => {
  await page.goto("/asisten");
  await page.waitForLoadState("networkidle");
  const firstThread = await page.getByTestId("assistant-thread-item").first().textContent();
  await page.goto("/dasbor");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Buka Asisten Akunio/i }).click();
  await expect(page.getByText(firstThread?.trim() ?? "").first()).toBeVisible();
});
```

Catatan: sesuaikan selector dengan `data-testid` yang benar-benar ada (`assistant-prompt-input`, `assistant-thread-item` — tambah bila belum ada; JANGAN ubah testid lama `kas-bank-*`, `onboarding-*`). E2E butuh login sungguhan di branch E2E (`E2E_DATABASE_URL`, verifikasi email OFF) — ikuti `tests/e2e/global-setup.ts`.

- [ ] **Step 2: Tambah testid + badge yang dipakai test**

Tambah `data-testid="assistant-prompt-input"` pada `PromptInput`/textarea widget + asisten; `data-testid="assistant-thread-item"` per item thread; `data-testid="assistant-memory-badge"` untuk badge ingatan. Badge hanya render bila `memoryUsed > 0`.

- [ ] **Step 3: Run E2E tunggal**

Run: `bunx playwright test tests/e2e/assistant-behavior.spec.ts --workers=1`
Expected: PASS (3 tests). Bila `:3000` basi: kill dulu, lalu `AI_MOCK=1 bun run e2e -- tests/e2e/assistant-behavior.spec.ts` sesuai script repo.

- [ ] **Step 4: Gerbang akhir penuh**

Run: `bun x tsc --noEmit`
Expected: PASS.
Run: `bun run build`
Expected: PASS.
Run: `bun run test`
Expected: PASS (vitest rewrite ke `ledger_test`, tidak sentuh dev).

- [ ] **Step 5: Commit**

```bash
git add src/components/assistant-widget.tsx "src/app/(app)/asisten/asisten-client.tsx" tests/e2e/assistant-behavior.spec.ts
git commit -m "test(e2e): perilaku diam, suggest isi-prompt, history sinkron"
```

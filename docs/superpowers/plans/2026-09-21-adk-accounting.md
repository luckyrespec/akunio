# ADK Multi-Agent Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Nara dari single-agent Interactions API ke multi-agent ADK TS (hybrid router + control layer + evaluasi trajectory) tanpa mengubah guardrail HITL/RLS/Money.

**Architecture:** Lapisan bawah dulu (ADK dep → control layer → deterministic tools), lalu agen+router, lalu session bridge, terakhir migrasi `stream`/`confirm` route; tiap lapis punya test sendiri sebelum lapis di atasnya dibangun.

**Tech Stack:** Next 16.3, `@google/adk` (TS), `@google/genai` (existing), Drizzle + pg, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-adk-accounting-design.md`

## Global Constraints

- `bunx tsc --noEmit` strict, no `any` — setiap task harus lolos typecheck.
- Uang selalu `Money` BigInt minor via `Money.parseIdr`/`formatIdr` (`src/core/money/money.ts`) — never `Number(x)*100` di jalur nominal.
- Setiap query tenant-scoped wajib `withOrg(orgId, …)` (`src/server/db/repos/with-org.ts`), signature `withOrg(orgId, fn)`.
- Tidak ada tabel baru di fase-1 — TRUNCATE list `tests/integration/helpers.ts` tidak berubah.
- Unit/eval test tidak boleh butuh `GEMINI_API_KEY`; konstruksi ADK agent tidak boleh memanggil network.
- Bahasa UI/copy Bahasa Indonesia; tidak ada tabel `vector(768)` baru.

## Review Focus

- Nominal format Indonesia (`"Rp11.100.000"`, `"11.100.000"`, `"11100000"`) di kalkulasi threshold — ekspektasi: semua terparse ke minor yang sama (test di Task 2).
- `previous_interaction_id` basi/kedaluwarsa — ekspektasi: retry sekali tanpa chaining, chat tidak mati (test di Task 7).
- BigInt di hasil tool melewati SSE/jsonb — ekspektasi: selalu string, tidak throw (test di Task 3).
- Posting ke akun GROUP (mis. `4100`/`5100`) — ekspektasi: ditolak dengan pesan jelas (test di Task 2).
- Tanggal transaksi di periode LOCKED/CLOSED — ekspektasi: ditolak + sebut nama periode (test di Task 2).

---

## File Structure

- `src/server/ai/controls/approval.ts` — NEW: `maxMinorFromArgs`, `shouldRequireApproval` (ekstrak dari `stream/route.ts:52-86,530-540`).
- `src/server/ai/controls/validation.ts` — NEW: `validateJournalLines` (seimbang, akun ada+postable, periode OPEN).
- `src/server/ai/controls/audit.ts` — NEW: `appendControlAudit` (wrapper `appendAudit`).
- `src/server/ai/tools/accounting-validate.tools.ts` — NEW: `calculate_tax`, `validate_journal_entry`, `check_period`, `detect_duplicate_invoice`, `calculate_variance` (defs+handlers, masuk `TOOL_REGISTRY`).
- `src/server/ai/agents/split.ts` — NEW: `BOOKKEEPING_TOOL_NAMES`, `ANALYST_TOOL_NAMES`, `COORDINATOR_INSTRUCTION`.
- `src/server/ai/agents/router.ts` — NEW: `routeIntent` (pure) + `buildAccountantRouter` (ADK `RoutedAgent`).
- `src/server/ai/agents/definitions.ts` — NEW: `bookkeepingAgent`, `analystAgent`, `accountantCoordinator` (ADK `LlmAgent`).
- `src/server/ai/session-bridge.ts` — NEW: `getOrCreateAdkSession`, `syncTurnToThread`.
- `src/server/ai/eval/trajectory.ts` — NEW: `matchTrajectory(actual, expected, mode)`.
- Modify: `src/server/ai/nara-tools.ts` (registrasi modul baru), `src/app/api/nara/chat/stream/route.ts` (Runner ADK), `src/app/api/nara/chat/confirm/route.ts` (FunctionResponse resume).
- Test: `tests/unit/ai/controls-approval.test.ts`, `tests/unit/ai/controls-validation.test.ts`, `tests/unit/ai/agent-split.test.ts`, `tests/unit/ai/router.test.ts`, `tests/eval/agent-trajectory.test.ts`, `tests/integration/session-bridge.test.ts`.

---

### Task 1: Instal `@google/adk` + smoke test konstruksi

**Files:**
- Modify: `package.json`
- Test: `tests/unit/ai/adk-smoke.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `LlmAgent`, `RoutedAgent`, `FunctionTool`, `InMemoryRunner` importable dari `@google/adk` untuk Task 4–5.

- [ ] **Step 1: Instal dependency**

Run: `bun add @google/adk`
Expected: `package.json` berisi `@google/adk` (versi TS ≥0.2.0 yang memuat `RoutedAgent` + `FunctionTool`).

- [ ] **Step 2: Tulis smoke test**

```ts
import { describe, it, expect } from "vitest";
import { LlmAgent, FunctionTool } from "@google/adk";
import { z } from "zod";

describe("adk smoke", () => {
  it("LlmAgent + FunctionTool terkontruksi tanpa network", () => {
    const tool = new FunctionTool({
      name: "ping",
      description: "ping",
      parameters: z.object({}),
      execute: async () => ({ status: "ok" }),
    });
    const agent = new LlmAgent({
      name: "smoke",
      model: "gemini-flash-latest",
      instruction: "Balas singkat.",
      tools: [tool],
    });
    expect(agent.name).toBe("smoke");
  });
});
```

- [ ] **Step 3: Jalankan test**

Run: `bunx vitest run tests/unit/ai/adk-smoke.test.ts`
Expected: PASS (konstruksi tidak memanggil network, tanpa `GEMINI_API_KEY`).

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock tests/unit/ai/adk-smoke.test.ts
git commit -m "chore: add @google/adk + construction smoke test"
```

---

### Task 2: Control layer — approval + validation + audit

**Files:**
- Create: `src/server/ai/controls/approval.ts`, `src/server/ai/controls/validation.ts`, `src/server/ai/controls/audit.ts`
- Test: `tests/unit/ai/controls-approval.test.ts`, `tests/unit/ai/controls-validation.test.ts`

**Interfaces:**
- Consumes: `Money` dari `@/core/money/money`; `AiPrefs` dari `@/lib/ai-prefs`.
- Produces:
  - `maxMinorFromArgs(toolName: string, args: Record<string, unknown>): bigint | null`
  - `shouldRequireApproval(toolName: string, args: Record<string, unknown>, prefs: AiPrefs, opts: { hitlPolicy: "smart" | "strict" | "autonomous"; allowAllForSession: boolean }): boolean`
  - `validateJournalLines(lines: Array<{ accountCode: string; debitText: string; creditText: string }>, ctx: { accounts: Array<{ code: string; parentCode: string | null; archivedAt: Date | null }>; periodStatus: string | null; periodName: string | null }): { ok: boolean; errors: string[] }`
  - `appendControlAudit(q: Queryable, input: { orgId: string; action: string; subjectType: string; subjectId: string; data: unknown }): Promise<void>`

- [ ] **Step 1: Tulis failing test approval (termasuk Review Focus nominal-ID)**

```ts
import { describe, it, expect } from "vitest";
import { maxMinorFromArgs, shouldRequireApproval } from "@/server/ai/controls/approval";
import { DEFAULT_AI_PREFS } from "@/lib/ai-prefs";

const LINES = (d: string) => ({ lines: [{ accountCode: "6210", debitText: d, creditText: "" }, { accountCode: "1110", debitText: "", creditText: d }] });

describe("approval threshold", () => {
  it("tiga format nominal Indonesia terparse ke minor yang sama", () => {
    const a = maxMinorFromArgs("post_journal", LINES("Rp11.100.000"));
    const b = maxMinorFromArgs("post_journal", LINES("11.100.000"));
    const c = maxMinorFromArgs("post_journal", LINES("11100000"));
    expect(a).toBe(1110000000n);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("mutating tanpa allowAll selalu minta approval (smart)", () => {
    expect(shouldRequireApproval("post_journal", LINES("1000"), DEFAULT_AI_PREFS, { hitlPolicy: "smart", allowAllForSession: false })).toBe(true);
  });

  it("over-threshold menang atas allowAllForSession", () => {
    const prefs = { ...DEFAULT_AI_PREFS, approvalThresholdMinor: "100000" };
    expect(shouldRequireApproval("post_journal", LINES("1000000"), prefs, { hitlPolicy: "autonomous", allowAllForSession: true })).toBe(true);
  });

  it("safe tool tidak minta approval", () => {
    expect(shouldRequireApproval("get_report", { type: "neraca" }, DEFAULT_AI_PREFS, { hitlPolicy: "smart", allowAllForSession: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan — harus FAIL (`function not defined`/module hilang)**

Run: `bunx vitest run tests/unit/ai/controls-approval.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi minimal (pindahkan logika `stream/route.ts:52-86,530-540`)**

```ts
import { Money } from "@/core/money/money";
import type { AiPrefs } from "@/lib/ai-prefs";
import { MUTATING_TOOLS, SAFE_TOOLS } from "@/server/ai/nara-tools";

export function maxMinorFromArgs(toolName: string, args: Record<string, unknown>): bigint | null {
  try {
    if (toolName === "post_journal" || toolName === "create_journal_draft") {
      const lines = Array.isArray(args.lines) ? (args.lines as Array<Record<string, unknown>>) : [];
      let total = 0n;
      for (const l of lines) {
        const raw = l.debit ?? l.debitText;
        if (typeof raw === "string" && raw.trim() !== "" && raw.trim() !== "0") {
          total += Money.parseIdr(raw).minor;
        }
      }
      return total;
    }
    return null;
  } catch {
    return null;
  }
}

export function shouldRequireApproval(
  toolName: string,
  args: Record<string, unknown>,
  prefs: AiPrefs,
  opts: { hitlPolicy: "smart" | "strict" | "autonomous"; allowAllForSession: boolean },
): boolean {
  if (prefs.approvalThresholdMinor) {
    try {
      const limit = BigInt(prefs.approvalThresholdMinor);
      const amount = maxMinorFromArgs(toolName, args);
      if (amount === null || amount > limit) return true;
    } catch { return true; }
  }
  if (SAFE_TOOLS.has(toolName)) return false;
  if (!MUTATING_TOOLS.has(toolName)) return true;
  if (opts.hitlPolicy === "autonomous") return false;
  return !opts.allowAllForSession;
}
```

`validation.ts`: cek seimbang (debit==kredit via `Money.parseIdr`), akun ada + bukan GROUP (punya anak di daftar) + tidak diarsip, periode OPEN bila `periodStatus` diisi. `audit.ts`: wrapper `appendAudit` dengan `actor: "adk-control"`.

- [ ] **Step 4: Jalankan test + typecheck**

Run: `bunx vitest run tests/unit/ai/controls-approval.test.ts tests/unit/ai/controls-validation.test.ts`
Expected: PASS. Lalu `bunx tsc --noEmit` hijau.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/controls tests/unit/ai/controls-approval.test.ts tests/unit/ai/controls-validation.test.ts
git commit -m "feat: accounting control layer approval+validation+audit"
```

---

### Task 3: Deterministic tools baru + registrasi

**Files:**
- Create: `src/server/ai/tools/accounting-validate.tools.ts`
- Modify: `src/server/ai/nara-tools.ts` (registrasi defs+handlers)
- Test: `tests/unit/ai/validate-tools.test.ts`

**Interfaces:**
- Consumes: `validateJournalLines` (Task 2), `withOrg`, `findPeriodByDate` dari `@/server/db/repos/periods.repo`, `ToolDefinition`/`ToolHandler` dari `./types`.
- Produces: tools `calculate_tax`, `validate_journal_entry`, `check_period`, `detect_duplicate_invoice`, `calculate_variance` — `calculate_tax`/`check_period`/`calculate_variance` SAFE, `validate_journal_entry`/`detect_duplicate_invoice` SAFE (read-only predikat).

- [ ] **Step 1: Tulis failing test (termasuk BigInt Review Focus)**

```ts
import { describe, it, expect } from "vitest";
import { executeNaraTool, SAFE_TOOLS } from "@/server/ai/nara-tools";

describe("validate tools", () => {
  it("calculate_tax 11% dari 10jt = 1100000 (string, bukan BigInt mentah)", async () => {
    const r = await executeNaraTool("org-x", "a@b.c", "calculate_tax", { baseText: "10000000", ratePercent: 11 });
    expect(r.success).toBe(true);
    expect(JSON.stringify(r.data)).not.toContain("n\"");
    expect((r.data as { taxMinor: string }).taxMinor).toBe("110000000");
  });

  it("validate_journal_entry menolak debit!=kredit", async () => {
    const r = await executeNaraTool("org-x", "a@b.c", "validate_journal_entry", {
      lines: [
        { accountCode: "6210", debitText: "10000", creditText: "" },
        { accountCode: "1110", debitText: "", creditText: "9000" },
      ],
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan — FAIL (tool tidak dikenali)**

Run: `bunx vitest run tests/unit/ai/validate-tools.test.ts`
Expected: FAIL `Tool calculate_tax tidak dikenali.`

- [ ] **Step 3: Implementasi modul + registrasi**

Defs mengikuti pola `journal.tools.ts` (name/description/parameters object). Handler:
  - `calculate_tax`: `Money.parseIdr(baseText) * ratePercent / 100` dalam BigInt, kembalikan string minor.
  - `validate_journal_entry`: panggil `validateJournalLines` Task 2 (tanpa DB; cek akun via `list_accounts`-equivalent read bila perlu — versi minimal: seimbang + format, akun+periode dicek control layer saat approval).
  - `check_period` / `detect_duplicate_invoice` / `calculate_variance`: bungkus `withOrg` + repo existing; hasil lewat `deBigInt` existing di `executeNaraTool`.
  - Daftarkan di `SAFE_TOOLS`, gabung di `TOOL_REGISTRY` via `toEntries`.

- [ ] **Step 4: Jalankan test + registry test existing + typecheck**

Run: `bunx vitest run tests/unit/ai/validate-tools.test.ts tests/unit/ai/nara-tools-registry.test.ts`
Expected: PASS. Lalu `bunx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/tools/accounting-validate.tools.ts src/server/ai/nara-tools.ts tests/unit/ai/validate-tools.test.ts
git commit -m "feat: deterministic accounting validate tools"
```

---

### Task 4: Split tool per-agent + instruksi coordinator

**Files:**
- Create: `src/server/ai/agents/split.ts`
- Test: `tests/unit/ai/agent-split.test.ts`

**Interfaces:**
- Consumes: `TOOL_REGISTRY`, `SAFE_TOOLS`, `MUTATING_TOOLS` dari `@/server/ai/nara-tools`.
- Produces:
  - `BOOKKEEPING_TOOL_NAMES: string[]`
  - `ANALYST_TOOL_NAMES: string[]`
  - `COORDINATOR_INSTRUCTION: string`

- [ ] **Step 1: Tulis failing test**

```ts
import { describe, it, expect } from "vitest";
import { BOOKKEEPING_TOOL_NAMES, ANALYST_TOOL_NAMES } from "@/server/ai/agents/split";
import { MUTATING_TOOLS, TOOL_REGISTRY } from "@/server/ai/nara-tools";

describe("agent split", () => {
  it("analyst read-only: tidak ada mutating tool", () => {
    const leak = ANALYST_TOOL_NAMES.filter((n) => MUTATING_TOOLS.has(n));
    expect(leak).toEqual([]);
  });

  it("bookkeeping memuat journal+invoice+cash inti", () => {
    for (const n of ["post_journal", "create_journal_draft", "reverse_journal", "create_invoice", "record_cash_entry"]) {
      expect(BOOKKEEPING_TOOL_NAMES).toContain(n);
    }
  });

  it("semua nama ada di registry", () => {
    for (const n of [...BOOKKEEPING_TOOL_NAMES, ...ANALYST_TOOL_NAMES]) {
      expect(TOOL_REGISTRY[n], n).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: FAIL, Step 3: implementasi daftar sesuai spec §5** (bookkeeping = journal.* + invoicing + cash-bank + `list_accounts`/`list+find_contact`/`get_server_time` + `calculate_tax`/`validate_journal_entry`/`check_period`/`detect_duplicate_invoice`; analyst = reports read + aging + ledgers + stock_card + bank_rec_status + `calculate_variance`), **Step 4: PASS + tsc, Step 5: commit** `feat: per-agent tool split`.

---

### Task 5: Definisi ADK agent + hybrid router

**Files:**
- Create: `src/server/ai/agents/definitions.ts`, `src/server/ai/agents/router.ts`
- Test: `tests/unit/ai/router.test.ts`

**Interfaces:**
- Consumes: `BOOKKEEPING_TOOL_NAMES`/`ANALYST_TOOL_NAMES` (Task 4), `TOOL_REGISTRY` handler → bungkus `FunctionTool` (execute: `withOrg` + `shouldRequireApproval` Task 2 → `toolContext.requestConfirmation` bila perlu).
- Produces:
  - `routeIntent(text: string): "bookkeeping" | "analyst" | "coordinator"`
  - `bookkeepingAgent`, `analystAgent`, `accountantCoordinator`, `buildAccountantRouter(): RoutedAgent`

- [ ] **Step 1: Tulis failing test router murni**

```ts
import { describe, it, expect } from "vitest";
import { routeIntent } from "@/server/ai/agents/router";

describe("routeIntent", () => {
  it("catat/posting/draft/faktur/kas → bookkeeping", () => {
    expect(routeIntent("catat bayar sewa 5jt")).toBe("bookkeeping");
    expect(routeIntent("buatkan faktur untuk PT ABC")).toBe("bookkeeping");
  });
  it("laba/rugi/laporan/kenapa turun → analyst", () => {
    expect(routeIntent("kenapa laba bulan ini turun?")).toBe("analyst");
  });
  it("ambigu → coordinator", () => {
    expect(routeIntent("halo")).toBe("coordinator");
  });
});
```

- [ ] **Step 2: FAIL, Step 3: implementasi** keyword-deterministik + fallback coordinator; `FunctionTool` wrapper per tool (parameter zod dari `def.parameters` — bangun via `z.object({}).catchall(z.unknown())` agar skema JSON existing lolos tanpa rewrite; catat di komentar bahwa ini jembatan sementara menuju skema zod eksplisit).
- [ ] **Step 4: PASS + tsc, Step 5: commit** `feat: ADK agents + hybrid router`.

---

### Task 6: Session bridge (ADK session ↔ chat_threads)

**Files:**
- Create: `src/server/ai/session-bridge.ts`
- Test: `tests/integration/session-bridge.test.ts`

**Interfaces:**
- Consumes: `createThread`/`getThread`/`addMessage` dari `@/server/db/repos/chat.repo`; `withOrg`.
- Produces:
  - `getOrCreateAdkSession(orgId: string, threadId: string): Promise<{ sessionKey: string }>`
  - `syncTurnToThread(orgId: string, threadId: string, turn: { role: "user" | "assistant"; content: string; toolInvocations?: unknown }): Promise<void>`

- [ ] **Step 1: Tulis failing integration test** (pakai `makeOrg`+`truncateAll` dari `tests/integration/helpers.ts`; DB `ledger_test` otomatis via `tests/setup.ts`).
- [ ] **Step 2: FAIL, Step 3: implementasi** InMemory map `(orgId, threadId)` + tulis pesan via `addMessage` dalam `withOrg`.
- [ ] **Step 4: `bunx vitest run tests/integration/session-bridge.test.ts` PASS, Step 5: commit** `feat: adk session bridge`.

---

### Task 7: Migrasi `stream` + `confirm` route ke Runner ADK

**Files:**
- Modify: `src/app/api/nara/chat/stream/route.ts`, `src/app/api/nara/chat/confirm/route.ts`
- Test: `tests/integration/adk-chat-flow.test.ts` (mock runner? tidak — uji `shouldRequireApproval` wiring + SSE `tool_approval_request` tetap terkirim untuk MUTATING), e2e existing `tests/e2e/*nara*` bila ada.

**Interfaces:**
- Consumes: Task 2, 5, 6.

- [ ] **Step 1: Tulis failing test** — POST simulasi `post_journal` tanpa approval harus menghasilkan event `tool_approval_request`, bukan eksekusi.
- [ ] **Step 2: FAIL, Step 3: implementasi** — ganti `ai.interactions.create` dengan `runner.runAsync`; event `adk_request_confirmation` dipetakan ke SSE `tool_approval_request` existing (kartu `NaraHitlApprovalCard` reuse + `invocation_id`); `confirm` kirim `FunctionResponse(adk_request_confirmation)` + resume; stale invocation → retry sekali tanpa chaining.
- [ ] **Step 4: PASS + `bun run e2e` subset chat, Step 5: commit** `feat: ADK runner chat flow`.

---

### Task 8: Evaluasi trajectory (golden + negative)

**Files:**
- Create: `src/server/ai/eval/trajectory.ts`, `tests/eval/agent-trajectory.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `matchTrajectory(actual: string[], expected: string[], mode: "EXACT" | "IN_ORDER" | "ANY_ORDER"): boolean`

- [ ] **Step 1: Tulis failing test**

```ts
import { describe, it, expect } from "vitest";
import { matchTrajectory } from "@/server/ai/eval/trajectory";

const GOLDEN = ["extract_invoice", "detect_duplicate_invoice", "get_tax_rule", "search_account", "create_journal_draft", "validate_journal_entry", "request_approval"];

describe("trajectory", () => {
  it("IN_ORDER toleran tool baca tambahan", () => {
    expect(matchTrajectory(["extract_invoice", "list_accounts", "detect_duplicate_invoice", "get_tax_rule", "search_account", "create_journal_draft", "validate_journal_entry", "request_approval"], GOLDEN, "IN_ORDER")).toBe(true);
  });
  it("post tanpa approval = FAIL", () => {
    expect(matchTrajectory(["extract_invoice", "post_journal"], GOLDEN, "IN_ORDER")).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL, Step 3: implementasi matcher murni, Step 4: PASS + tsc, Step 5: commit** `feat: trajectory eval matcher`.

---

### Task 9: Verifikasi penuh

- [ ] **Step 1: `bunx tsc --noEmit`** — Expected: hijau.
- [ ] **Step 2: `bun run build`** — Expected: hijau.
- [ ] **Step 3: `bunx vitest run tests/unit/ai tests/eval`** — Expected: hijau.
- [ ] **Step 4: Commit akhir bila ada sisa** `chore: adk phase-1 verification`.

---

## Self-Review

1. **Spec coverage:** §2 arsitektur → Task 1,5,6,7; §3 disiplin tool → Task 3; §4 hybrid → Task 5; §5 split → Task 4; §6 control layer → Task 2 (+wiring Task 5,7); §7 data-flow/error → Task 6,7; §8 eval → Task 8; §9 roadmap → `doc/next-agent.md` sudah ada (tidak perlu task).
2. **Placeholder scan:** tidak ada TBD/TODO; semua step punya perintah + ekspektasi konkret.
3. **Type consistency:** `Queryable` untuk `appendControlAudit` mengikuti `chat.repo.ts`; `AiPrefs` dari `@/lib/ai-prefs`; nama tool baru konsisten Task 3→4→8.
4. **Review Focus:** lima baris di atas masing-masing terikat ke test Task 2 (nominal, GROUP, periode), Task 3 (BigInt), Task 7 (stale interaction).

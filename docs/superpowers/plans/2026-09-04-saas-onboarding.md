# SaaS Auth Hardening + Chat-Driven Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden auth (email verification + Google OAuth + rate limit + session policy) and ship a mandatory chat-driven onboarding that collects the business profile, previews a SAK EMKM COA template per business type, and provisions the workspace atomically before first dashboard access.

**Architecture:** Deferred provisioning — signup creates an empty org + `org_profiles` row (no COA); a deterministic server state machine drives 7 chat steps (LLM only polishes reply phrasing, never field values); one idempotent transaction seeds the chosen COA + fiscal periods and flips status to COMPLETED; `(app)` routes hard-gate on that status.

**Tech Stack:** Next 16.3 App Router, React 19, Better Auth 1.7.1, Drizzle 0.45 + pg, @google/genai 2.18 (`gemini-3.5-flash-lite`, `store:false`), Tailwind 4 + shadcn/ui + ai-elements PromptInput, Vitest 4, Playwright 1.62.

## Global Constraints

- Strict TS: `bunx tsc --noEmit` must stay green; never use `any`; never use `npx` (bun shims break it) — use `bunx`.
- Money: `numeric(18,2)` in DB, `Money` BigInt-minor helpers — never JS `number` for amounts (no amounts in this plan, but the rule stands).
- AI: `@google/genai` Interactions API only, model `gemini-3.5-flash-lite` (never `2.5-*`/`2.0-*`/`1.5-*`), `store:false`, retry 2, `AI_MOCK=1` deterministic path for dev/tests/e2e.
- DB: `FORCE RLS` on every new `org_id` table; advisory lock (`pg_advisory_xact_lock(hashtext(...))`) for provisioning/bootstrap races; tests touch `ledger_test` ONLY (`tests/setup.ts` + `helpers.ts` guard).
- UI copy in Bahasa Indonesia; Paper & Ink tokens (`bg-paper`, `text-ink`, `border-rule`, `bg-terra`); honor `prefers-reduced-motion`.
- Shell is Windows PowerShell 5.1; never `bash` heredocs for file writes — use the file tools.
- YAGNI: 1 user = 1 org; no multi-org/invite, no 2FA/CAPTCHA, no non-Indonesian i18n in this plan.

---

## File Map (what gets created / modified and why)

**Task 1 — DB foundation**
- Create `src/server/db/schema/onboarding.ts` — `org_profiles` + `onboarding_messages` tables, `BusinessType`/`RevenueRange`/`ReferralSource` consts + types (single source of truth; COA templates import the type from here is FORBIDDEN — see Task 2 for direction).
- Create `src/server/db/repos/onboarding.repo.ts` — CRUD for profiles + messages on a `Queryable` (same pattern as `chat.repo.ts`).
- Modify `src/server/db/rls.sql` — append the two tables to the tenant-isolation array.
- Modify `tests/integration/helpers.ts` — add new tables to `truncateAll`.
- Create `tests/integration/onboarding-schema.test.ts`.

**Task 2 — COA templates (pure core, no DB)**
- Create `src/core/accounts/business-types.ts` — `BUSINESS_TYPES` const + `BusinessType` type (core owns it; `schema/onboarding.ts` imports the const from here — core never imports from `server/`).
- Create `src/core/accounts/coa-templates.ts` — `COA_EXTRAS: Record<BusinessType, AccountDef[]>`, `coaForBusinessType()`, `validateCoaDefs()`, `suggestAccountCode()`, `inferAccountType()`.
- Create `tests/unit/accounts/coa-templates.test.ts`.

**Task 3 — Deferred bootstrap rewire**
- Modify `src/server/bootstrap/seed-org.ts` — split into `seedOrgAccounts(orgId, defs, exec)` + `seedFiscalPeriods(orgId, startMonth, exec)`; `seedOrgData` delegates (backwards compatible).
- Modify `src/server/bootstrap/ensure-workspace.ts` — create org + OWNER + `org_profiles` row; NO account/period seeding; self-heal also backfills missing `org_profiles` rows.
- Modify `tests/integration/bootstrap.test.ts`, `bootstrap-atomic.test.ts` — update assertions (read them first; exact edits depend on current assertions).

**Task 4 — Auth hardening**
- Create `src/server/auth/email.ts` — Resend-or-log verification/reset sender.
- Modify `src/server/auth/auth-server.ts` — verification, password policy, session, rate limit, Google provider, secret/origins hardening.
- Modify `src/server/auth/session.ts` + `guard.ts` — `emailVerified` in context; `requireVerifiedSession()`; `requireOnboardedContext()`; TEST seam extended.
- Modify `src/components/auth-form.tsx` — "Nama lengkap" field, Google button, verification-aware redirects.
- Create `src/app/verifikasi/page.tsx` — check-email + resend UI.
- Modify `.env.example` — new vars.
- Create `tests/unit/auth/email.test.ts`.

**Task 5 — Onboarding engine + provisioning (server, AI_MOCK-safe)**
- Create `src/server/onboarding/parse.ts` — deterministic keyword parsers (business type, revenue, referral, confirmations, "ubah X", add/remove account intents).
- Create `src/server/onboarding/engine.ts` — `submitOnboardingMessage()`, `getOnboardingView()`, `finalizeOnboarding()` incl. atomic provisioning + legacy-org branches.
- Create `src/app/onboarding/actions.ts` — thin server actions over the engine.
- Create `tests/integration/onboarding-engine.test.ts` (+ 10-phrase mapping eval inside `tests/eval/onboarding-mapping.test.ts` following `tests/eval/draft-accuracy.test.ts`).

**Task 6 — Onboarding UI + gate wiring + e2e**
- Create `src/app/onboarding/page.tsx`, `src/app/onboarding/onboarding-chat-client.tsx`, `src/app/onboarding/coa-preview.tsx`, `src/app/onboarding/preparing-overlay.tsx`.
- Modify `src/app/(app)/layout.tsx` — `requireOnboardedContext()`.
- Modify `src/components/auth-form.tsx` — flip post-auth redirect to `/onboarding`.
- Create `tests/e2e/onboarding.spec.ts`; update `tests/e2e/smoke.spec.ts` if it asserts post-signup `/dasbor` (read first).

---

### Task 1: DB foundation — `org_profiles` + `onboarding_messages`

**Files:**
- Create: `src/server/db/schema/onboarding.ts`
- Create: `src/server/db/repos/onboarding.repo.ts`
- Modify: `src/server/db/rls.sql:9-14` (table array)
- Modify: `tests/integration/helpers.ts:21-28` (truncateAll)
- Test: `tests/integration/onboarding-schema.test.ts`

**Interfaces:**
- Consumes: `organizations` table (`src/server/db/schema/org.ts`), `Queryable` (`src/server/db/repos/queryable.ts`), `BUSINESS_TYPES` from Task 2's `src/core/accounts/business-types.ts` — so implement that tiny file FIRST inside this task (2 lines + type) to avoid a forward reference.
- Produces: `orgProfiles`, `onboardingMessages`, `getProfile(q, orgId)`, `upsertProfile(q, orgId, patch)`, `addOnboardingMessage(q, orgId, role, content, step?)`, `listOnboardingMessages(q, orgId)`.

- [ ] **Step 1: Create `src/core/accounts/business-types.ts`**

```ts
export const BUSINESS_TYPES = [
  "DAGANG",
  "JASA",
  "KULINER",
  "MANUFAKTUR",
  "ONLINE_RESALE",
  "KOS_PROPERTI",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  DAGANG: "Dagang / Toko",
  JASA: "Jasa",
  KULINER: "Kuliner / F&B",
  MANUFAKTUR: "Manufaktur",
  ONLINE_RESALE: "Online / Reseller",
  KOS_PROPERTI: "Kos & Properti",
};
```

- [ ] **Step 2: Write the failing schema test `tests/integration/onboarding-schema.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { makeOrg, truncateAll } from "./helpers";
import {
  getProfile,
  upsertProfile,
  addOnboardingMessage,
  listOnboardingMessages,
} from "@/server/db/repos/onboarding.repo";

describe("onboarding schema", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates an IN_PROGRESS profile and advances it", async () => {
    const { orgId } = await makeOrg("Warung Tes");
    const created = await upsertProfile(db, orgId, { displayName: "Budi" });
    expect(created.status).toBe("IN_PROGRESS");
    expect(created.currentStep).toBe("NAMA");

    const updated = await upsertProfile(db, orgId, {
      businessName: "Warung Budi",
      status: "COMPLETED",
    });
    expect(updated.businessName).toBe("Warung Budi");

    const fetched = await getProfile(db, orgId);
    expect(fetched?.displayName).toBe("Budi");
    expect(fetched?.status).toBe("COMPLETED");
  });

  it("stores messages in chronological order", async () => {
    const { orgId } = await makeOrg("Warung Tes 2");
    await addOnboardingMessage(db, orgId, "assistant", "Halo! Siapa nama kamu?", "NAMA");
    await addOnboardingMessage(db, orgId, "user", "Budi", "NAMA");
    const msgs = await listOnboardingMessages(db, orgId);
    expect(msgs.map((m) => m.content)).toEqual([
      "Halo! Siapa nama kamu?",
      "Budi",
    ]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run test tests/integration/onboarding-schema.test.ts`
Expected: FAIL with "Cannot find module '@/server/db/repos/onboarding.repo'" (and schema file missing).

- [ ] **Step 4: Create `src/server/db/schema/onboarding.ts`**

```ts
import {
  pgTable, uuid, text, integer, timestamp, jsonb,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { organizations } from "./org";
import { BUSINESS_TYPES } from "@/core/accounts/business-types";

export const ONBOARDING_STEPS = [
  "NAMA",
  "USAHA",
  "JENIS",
  "SKALA",
  "LOKASI",
  "REFERRAL",
  "RINGKASAN",
  "COA",
  "SELESAI",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const REVENUE_RANGES = ["LT_10JT", "R_10_50JT", "R_50_200JT", "GT_200JT"] as const;
export type RevenueRange = (typeof REVENUE_RANGES)[number];

export const REFERRAL_SOURCES = ["TEMAN", "GOOGLE", "SOSMED", "LAINNYA"] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

export const orgProfiles = pgTable(
  "org_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name"),
    businessName: text("business_name"),
    businessType: text("business_type", { enum: BUSINESS_TYPES }),
    revenueRange: text("revenue_range", { enum: REVENUE_RANGES }),
    employeeCount: integer("employee_count"),
    city: text("city"),
    address: text("address"),
    referralSource: text("referral_source", { enum: REFERRAL_SOURCES }),
    coaDraft: jsonb("coa_draft"),
    idempotencyKey: text("idempotency_key"),
    status: text("status", { enum: ["IN_PROGRESS", "COMPLETED"] })
      .notNull()
      .default("IN_PROGRESS"),
    currentStep: text("current_step", { enum: ONBOARDING_STEPS })
      .notNull()
      .default("NAMA"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_profiles_org_uq").on(t.orgId)],
);

export const onboardingMessages = pgTable(
  "onboarding_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    step: text("step", { enum: ONBOARDING_STEPS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("onboarding_messages_org_idx").on(t.orgId)],
);

export type OrgProfile = typeof orgProfiles.$inferSelect;
export type OnboardingMessage = typeof onboardingMessages.$inferSelect;
```

- [ ] **Step 5: Create `src/server/db/repos/onboarding.repo.ts`** (mirror `chat.repo.ts:75-121` conventions)

```ts
import { eq } from "drizzle-orm";
import {
  orgProfiles,
  onboardingMessages,
  type OnboardingStep,
} from "../schema/onboarding";
import type { Queryable } from "./queryable";

export type { OrgProfile, OnboardingMessage } from "../schema/onboarding";

export async function getProfile(q: Queryable, orgId: string) {
  const [row] = await q
    .select()
    .from(orgProfiles)
    .where(eq(orgProfiles.orgId, orgId))
    .limit(1);
  return row ?? null;
}

export async function upsertProfile(
  q: Queryable,
  orgId: string,
  patch: Partial<typeof orgProfiles.$inferInsert>,
) {
  const [row] = await q
    .insert(orgProfiles)
    .values({ orgId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: orgProfiles.orgId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function addOnboardingMessage(
  q: Queryable,
  orgId: string,
  role: "user" | "assistant",
  content: string,
  step?: OnboardingStep | null,
) {
  const [row] = await q
    .insert(onboardingMessages)
    .values({ orgId, role, content, step: step ?? null })
    .returning();
  return row;
}

export async function listOnboardingMessages(q: Queryable, orgId: string) {
  return q
    .select()
    .from(onboardingMessages)
    .where(eq(onboardingMessages.orgId, orgId))
    .orderBy(onboardingMessages.createdAt);
}
```

- [ ] **Step 6: Register RLS + generate + apply migration (dev DB)**

Edit `src/server/db/rls.sql` line 9-14 array: add `'org_profiles','onboarding_messages'` after `'chat_threads',` (exact edit: `'tenant_chunks','chat_threads','onboarding_messages','org_profiles','ai_findings',...`).

Run:
```powershell
bunx drizzle-kit generate --name onboarding
bun run db:migrate
bun run db:sql
```
Expected: new `drizzle/NNNN_onboarding.sql` created; migrate applies it; `db:sql` re-applies RLS idempotently ("ok").

- [ ] **Step 7: Prepare the test DB and extend `truncateAll`**

Edit `tests/integration/helpers.ts` TRUNCATE list to include `org_profiles, onboarding_messages` (add before `CASCADE`).

Run: `bun run test:db:setup`
Expected: "test db ready" (migrations + RLS applied to `ledger_test`).

- [ ] **Step 8: Run the new test + typecheck**

Run: `bun run test tests/integration/onboarding-schema.test.ts` — Expected: PASS (2 tests).
Run: `bunx tsc --noEmit` — Expected: clean.

- [ ] **Step 9: Commit**

```powershell
git add src/core/accounts/business-types.ts src/server/db/schema/onboarding.ts src/server/db/repos/onboarding.repo.ts src/server/db/rls.sql drizzle tests/integration/onboarding-schema.test.ts tests/integration/helpers.ts
git commit -m "feat(onboarding): add org_profiles + onboarding_messages schema, repo, RLS"
```

---

### Task 2: COA templates per business type (pure core)

**Files:**
- Create: `src/core/accounts/coa-templates.ts`
- Test: `tests/unit/accounts/coa-templates.test.ts`

**Interfaces:**
- Consumes: `COA_TEMPLATE` (`src/core/accounts/coa-template.ts`), `AccountDef` + `DEFAULT_NORMAL` (`src/core/accounts/types.ts`), `BusinessType` (Task 1 file).
- Produces: `COA_EXTRAS`, `coaForBusinessType(t)`, `validateCoaDefs(defs)`, `inferAccountType(name)`, `suggestAccountCode(defs, type)`.

- [ ] **Step 1: Write the failing unit test `tests/unit/accounts/coa-templates.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  coaForBusinessType,
  validateCoaDefs,
  inferAccountType,
  suggestAccountCode,
} from "@/core/accounts/coa-templates";
import { COA_TEMPLATE } from "@/core/accounts/coa-template";
import { BUSINESS_TYPES } from "@/core/accounts/business-types";

describe("coa templates", () => {
  it("every business type validates and preserves the base template", () => {
    for (const t of BUSINESS_TYPES) {
      const defs = coaForBusinessType(t);
      expect(defs.length).toBeGreaterThan(COA_TEMPLATE.length);
      expect(validateCoaDefs(defs)).toEqual([]);
      const codes = new Set(defs.map((d) => d.code));
      for (const base of COA_TEMPLATE) expect(codes.has(base.code)).toBe(true);
    }
  });

  it("kuliner template has bahan baku and delivery commission accounts", () => {
    const names = coaForBusinessType("KULINER").map((d) => d.name);
    expect(names).toContain("Persediaan Bahan Baku");
    expect(names).toContain("Beban Komisi Delivery");
  });

  it("infers account type from Indonesian names", () => {
    expect(inferAccountType("Beban Iklan")).toBe("BEBAN");
    expect(inferAccountType("Pendapatan Sewa")).toBe("PENDAPATAN");
    expect(inferAccountType("Kas Kecil")).toBe("ASET");
    expect(inferAccountType("Utang Supplier")).toBe("LIABILITAS");
    expect(inferAccountType("Modal Awal")).toBe("EKUITAS");
    expect(inferAccountType("Xyz Tak Jelas")).toBeNull();
  });

  it("suggests the smallest free code in the type range", () => {
    const defs = coaForBusinessType("JASA");
    const code = suggestAccountCode(defs, "BEBAN");
    expect(code).toMatch(/^5\d{3}$/);
    expect(defs.some((d) => d.code === code)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/accounts/coa-templates.test.ts`
Expected: FAIL with "Cannot find module '@/core/accounts/coa-templates'".

- [ ] **Step 3: Create `src/core/accounts/coa-templates.ts`** (full implementation — base + 6 extras)

```ts
import { COA_TEMPLATE } from "./coa-template";
import { DEFAULT_NORMAL, type AccountDef, type AccountType } from "./types";
import type { BusinessType } from "./business-types";

export const COA_EXTRAS: Record<BusinessType, AccountDef[]> = {
  DAGANG: [
    { code: "1310", name: "Persediaan Barang Dagang", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "4110", name: "Penjualan Barang", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "4120", name: "Retur & Potongan Penjualan", type: "PENDAPATAN", normal: "D", parentCode: "4100", contra: true },
    { code: "5120", name: "Ongkos Angkut Pembelian", type: "BEBAN", normal: "D", parentCode: "5100" },
  ],
  JASA: [
    { code: "4130", name: "Pendapatan Jasa", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "5210", name: "Beban Subkontraktor", type: "BEBAN", normal: "D", parentCode: "5200" },
    { code: "5410", name: "Beban Internet & Komunikasi", type: "BEBAN", normal: "D", parentCode: "5400" },
    { code: "5510", name: "Beban Perjalanan Dinas", type: "BEBAN", normal: "D", parentCode: "5500" },
  ],
  KULINER: [
    { code: "1340", name: "Persediaan Bahan Baku", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "1350", name: "Persediaan Kemasan", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "4150", name: "Pendapatan Makanan & Minuman", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "5140", name: "Beban Bahan Baku", type: "BEBAN", normal: "D", parentCode: "5100" },
    { code: "5150", name: "Beban Komisi Delivery", type: "BEBAN", normal: "D", parentCode: "5100" },
  ],
  MANUFAKTUR: [
    { code: "1360", name: "Persediaan Bahan Baku", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "1370", name: "Barang Dalam Proses", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "1380", name: "Persediaan Barang Jadi", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "5160", name: "Beban Overhead Pabrik", type: "BEBAN", normal: "D", parentCode: "5100" },
    { code: "5170", name: "Beban Tenaga Kerja Langsung", type: "BEBAN", normal: "D", parentCode: "5100" },
  ],
  ONLINE_RESALE: [
    { code: "1390", name: "Persediaan Toko Online", type: "ASET", normal: "D", parentCode: "1300" },
    { code: "4160", name: "Penjualan Online", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "4170", name: "Retur Penjualan Online", type: "PENDAPATAN", normal: "D", parentCode: "4100", contra: true },
    { code: "5180", name: "Beban Komisi Marketplace", type: "BEBAN", normal: "D", parentCode: "5100" },
    { code: "5520", name: "Beban Ongkir & Packing", type: "BEBAN", normal: "D", parentCode: "5500" },
  ],
  KOS_PROPERTI: [
    { code: "1700", name: "Bangunan & Properti Sewa", type: "ASET", normal: "D", parentCode: "1000" },
    { code: "1710", name: "Akumulasi Penyusutan Bangunan", type: "ASET", normal: "K", parentCode: "1700", contra: true },
    { code: "2500", name: "Uang Deposito Penyewa", type: "LIABILITAS", normal: "K", parentCode: "2000" },
    { code: "4180", name: "Pendapatan Sewa", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
    { code: "5310", name: "Beban Perawatan & Perbaikan", type: "BEBAN", normal: "D", parentCode: "5300" },
  ],
};

export function coaForBusinessType(t: BusinessType): AccountDef[] {
  return [...COA_TEMPLATE, ...COA_EXTRAS[t]];
}

export function validateCoaDefs(defs: AccountDef[]): string[] {
  const errors: string[] = [];
  const codes = new Set(defs.map((d) => d.code));
  for (const d of defs) {
    if (!/^\d{4}$/.test(d.code)) errors.push(`Kode tidak valid: ${d.code}`);
    if (!d.name.trim()) errors.push(`Nama kosong untuk kode ${d.code}`);
    if (d.normal !== DEFAULT_NORMAL[d.type] && !d.contra)
      errors.push(`Saldo normal salah: ${d.code} ${d.name}`);
    if (d.parentCode && !codes.has(d.parentCode))
      errors.push(`Induk hilang ${d.parentCode} untuk ${d.code}`);
    if (d.code.length > 8) errors.push(`Kode terlalu panjang: ${d.code}`);
  }
  const dupes = defs.map((d) => d.code).filter((c, i, a) => a.indexOf(c) !== i);
  for (const c of new Set(dupes)) errors.push(`Kode ganda: ${c}`);
  return errors;
}

const TYPE_PREFIXES: Array<{ re: RegExp; type: AccountType }> = [
  { re: /^(beban|biaya|ongkos|gaji|sewa\b.*(beban)?|iklan|listrik|air|telepon|internet|transport|komisi|pajak\b)/i, type: "BEBAN" },
  { re: /^(pendapatan|penjualan|omzet|jasa\b.*(pendapatan)?|sewa diterima)/i, type: "PENDAPATAN" },
  { re: /^(kas|bank|tabungan|deposito\b.*(bank)?)/i, type: "ASET" },
  { re: /^(utang|hutang|pinjaman|kewajiban)/i, type: "LIABILITAS" },
  { re: /^(modal|ekuitas|prive|laba)/i, type: "EKUITAS" },
  { re: /^(persediaan|peralatan|aset|aktiva|gedung|bangunan|tanah|kendaraan|inventaris)/i, type: "ASET" },
];

export function inferAccountType(name: string): AccountType | null {
  const n = name.trim();
  for (const { re, type } of TYPE_PREFIXES) {
    if (re.test(n)) return type;
  }
  return null;
}

const TYPE_RANGES: Record<AccountType, { from: number; to: number }> = {
  ASET: { from: 1000, to: 1999 },
  LIABILITAS: { from: 2000, to: 2999 },
  EKUITAS: { from: 3000, to: 3999 },
  PENDAPATAN: { from: 4000, to: 4999 },
  BEBAN: { from: 5000, to: 5999 },
};

export function suggestAccountCode(defs: AccountDef[], type: AccountType): string {
  const used = new Set(defs.map((d) => d.code));
  const { from, to } = TYPE_RANGES[type];
  for (let n = from; n <= to; n++) {
    const code = String(n);
    if (!used.has(code)) return code;
  }
  throw new Error(`Tidak ada kode kosong untuk tipe ${type}.`);
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `bun run test tests/unit/accounts/coa-templates.test.ts` — Expected: PASS (4 tests).
Run: `bunx tsc --noEmit` — Expected: clean.

- [ ] **Step 5: Commit**

```powershell
git add src/core/accounts/coa-templates.ts tests/unit/accounts/coa-templates.test.ts
git commit -m "feat(coa): add SAK EMKM templates per business type + validation helpers"
```

---

### Task 3: Deferred bootstrap rewire (stop auto-seeding at signup)

**Files:**
- Modify: `src/server/bootstrap/seed-org.ts`
- Modify: `src/server/bootstrap/ensure-workspace.ts`
- Modify: `tests/integration/bootstrap.test.ts`, `tests/integration/bootstrap-atomic.test.ts` (after reading)
- Test: existing bootstrap tests (updated) + new assertion of empty-COA org

**Interfaces:**
- Consumes: `seedOrgAccounts`, `seedFiscalPeriods` (new splits), `upsertProfile` (Task 1), `coaForBusinessType` NOT used here (provisioning lives in Task 5).
- Produces: `ensureUserWorkspace(userId, displayName)` creating org + OWNER + IN_PROGRESS profile and nothing else; `seedOrgAccounts(orgId, defs, exec?)`, `seedFiscalPeriods(orgId, startMonth, exec?)` for Task 5.

- [ ] **Step 1: Read the tests that pin current bootstrap behavior**

Read `tests/integration/bootstrap.test.ts` and `tests/integration/bootstrap-atomic.test.ts` in full. Note every assertion mentioning `accounts`, `fiscal_periods`, `seedOrgData`, or `COA_TEMPLATE` — those assertions will change in Step 4.

- [ ] **Step 2: Split `src/server/bootstrap/seed-org.ts`** — replace whole file content with:

```ts
import { eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import type { AccountDef } from "@/core/accounts/types";
import { COA_TEMPLATE } from "@/core/accounts/coa-template";

type Executor = PgDatabase<
  NodePgQueryResultHKT,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

const pad2 = (n: number): string => String(n).padStart(2, "0");

export async function seedOrgAccounts(
  orgId: string,
  defs: readonly AccountDef[],
  exec: Executor = db,
): Promise<void> {
  await exec.insert(accounts).values(
    defs.map((d) => ({
      orgId,
      code: d.code,
      name: d.name,
      type: d.type,
      normal: d.normal,
      parentCode: d.parentCode ?? null,
      isCash: d.isCash ?? false,
      isBank: d.isBank ?? false,
      contra: d.contra ?? false,
    })),
  );
}

export async function seedFiscalPeriods(
  orgId: string,
  fiscalYearStartMonth = 1,
  exec: Executor = db,
): Promise<void> {
  const startOffset = fiscalYearStartMonth - 1;
  const baseYear = new Date().getFullYear();
  const rows = Array.from({ length: 12 }, (_, i) => {
    const total = startOffset + i;
    const y = baseYear + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const name = `${y}-${pad2(m)}`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      orgId,
      name,
      startsOn: `${name}-01`,
      endsOn: `${name}-${pad2(lastDay)}`,
      status: "OPEN" as const,
    };
  });
  await exec.insert(fiscalPeriods).values(rows);
}

export async function seedOrgData(
  orgId: string,
  fiscalYearStartMonth = 1,
  exec: Executor = db,
): Promise<void> {
  const existing = await exec
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.orgId, orgId))
    .limit(1);
  if (existing.length > 0) return;

  await seedOrgAccounts(orgId, COA_TEMPLATE, exec);
  await seedFiscalPeriods(orgId, fiscalYearStartMonth, exec);
}
```

`seedOrgData` keeps its exact signature and skip-if-seeded guard, so existing callers/tests that seed explicitly keep working.

- [ ] **Step 3: Rewire `src/server/bootstrap/ensure-workspace.ts`** — replace the transaction body:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, organizations } from "@/server/db/schema/org";
import { upsertProfile } from "@/server/db/repos/onboarding.repo";

/**
 * Ensures the user owns exactly one workspace: organization + OWNER membership
 * + an IN_PROGRESS onboarding profile.
 *
 * COA and fiscal periods are NOT seeded here anymore — they are provisioned
 * atomically when onboarding completes (see src/server/onboarding/engine.ts).
 */
export async function ensureUserWorkspace(
  userId: string,
  displayName: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);
  if (existing) {
    // Self-heal for pre-onboarding workspaces (also backfills the profile).
    const [m2] = await db
      .select({ orgId: memberships.orgId })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    if (m2) await upsertProfile(db, m2.orgId, {});
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const [again] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    if (again) return;

    const [org] = await tx
      .insert(organizations)
      .values({ name: displayName || "Organisasi Baru" })
      .returning();
    await tx.insert(memberships).values({
      orgId: org.id,
      userId,
      role: "OWNER",
    });
    await upsertProfile(tx, org.id, {});
  });
}
```

Note: `upsertProfile` takes a `Queryable` — verify `Queryable` accepts a drizzle transaction object by reading `src/server/db/repos/queryable.ts` before this step; if it only accepts `db`, wrap: run profile insert with `db` after the transaction commits (still guarded by the early-return check). Adjust the code to whatever `queryable.ts` allows — do not guess.

- [ ] **Step 4: Update the two bootstrap tests** — for each assertion found in Step 1 that expects seeded accounts/periods after `ensureUserWorkspace`, change it to expect ZERO accounts and ZERO periods plus an IN_PROGRESS profile (via `getProfile`). Keep any test that calls `seedOrgData` directly unchanged (it still seeds). Add one new assertion: calling `ensureUserWorkspace` twice for the same user still yields exactly one org + one profile.

- [ ] **Step 5: Run affected tests**

Run: `bun run test tests/integration/bootstrap.test.ts tests/integration/bootstrap-atomic.test.ts`
Expected: PASS. If unrelated suites fail because they relied on auto-seed (search for `ensureUserWorkspace` across `tests/` and `src/` first with the grep tool), fix each caller by inserting an explicit `seedOrgData(orgId)` in test setup — never by re-adding auto-seed.

- [ ] **Step 6: Typecheck + commit**

Run: `bunx tsc --noEmit` — Expected: clean.
```powershell
git add src/server/bootstrap tests/integration/bootstrap.test.ts tests/integration/bootstrap-atomic.test.ts
git commit -m "feat(bootstrap): defer COA seeding to onboarding completion"
```

---

### Task 4: Auth hardening (verification + Google + rate limit + session)

**Files:**
- Create: `src/server/auth/email.ts`
- Modify: `src/server/auth/auth-server.ts`
- Modify: `src/server/auth/session.ts`, `src/server/auth/guard.ts`
- Modify: `src/components/auth-form.tsx`
- Create: `src/app/verifikasi/page.tsx`
- Modify: `.env.example`
- Test: `tests/unit/auth/email.test.ts`

**Interfaces:**
- Consumes: `user` table emailVerified flag (exists in `schema/auth.ts`), `getActiveContext` (extended with `emailVerified`), Better Auth 1.7.1 options (verified against `node_modules/@better-auth/core/dist/types/init-options.d.mts:587-709` for `emailVerification`/`emailAndPassword`, `:168-209` for `rateLimit`, `:799` for `socialProviders`, `:898` for `session`).
- Produces: hardened `auth` object; `sendAuthEmail(kind, user, url)`; `requireVerifiedSession()`; `requireOnboardedContext()` (gate logic completed in Task 6 — here it only checks verification + returns profile status helper `getOnboardingStatus`).

- [ ] **Step 1: Verify client SDK response shapes in the installed version**

Read `node_modules/better-auth/dist/client/*.d.mts` (list the directory first) and note: (a) `signUp.email` return type — how to detect "verification email sent, no session yet"; (b) `signIn.social({ provider: "google" })` signature; (c) `sendVerificationEmail` client method name/signature. Write the findings as a 5-line comment at the top of the new `email.ts` — no guessing in later steps.

- [ ] **Step 2: Write failing email-sender unit test `tests/unit/auth/email.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

describe("sendAuthEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs the verification URL in dev when no provider is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendAuthEmail } = await import("@/server/auth/email");
    await sendAuthEmail("verification", { email: "a@b.id", name: "A" }, "http://x/verify?t=1");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("http://x/verify?t=1"));
  });

  it("throws in production without a provider so misconfig ships loudly", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendAuthEmail } = await import("@/server/auth/email");
    await expect(
      sendAuthEmail("verification", { email: "a@b.id" }, "http://x/verify?t=1"),
    ).rejects.toThrow("RESEND_API_KEY");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run test tests/unit/auth/email.test.ts`
Expected: FAIL with "Cannot find module '@/server/auth/email'".

- [ ] **Step 4: Create `src/server/auth/email.ts`**

```ts
// better-auth 1.7.1 client findings (verified against node_modules/better-auth/dist/client):
// (a) signUp.email resolves { data: { user, token? }, error } — with
//     requireEmailVerification the user is created but NO session/token is
//     issued until the email is verified.
// (b) signIn.social({ provider: "google", callbackURL }) initiates OAuth.
// (c) client exposes sendVerificationEmail({ email, callbackURL }) for resends.

interface EmailUser {
  email: string;
  name?: string | null;
}

export async function sendAuthEmail(
  kind: "verification" | "reset-password",
  user: EmailUser,
  url: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY belum dikonfigurasi untuk pengiriman email.");
    }
    console.log(`[auth:${kind}] kirim ke ${user.email}: ${url}`);
    return;
  }
  const subject =
    kind === "verification" ? "Verifikasi email Neraca Anda" : "Reset kata sandi Neraca";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Neraca <noreply@neraca.id>",
      to: user.email,
      subject,
      html: `<p>Halo${user.name ? ` ${user.name}` : ""},</p><p>Klik tautan berikut:</p><p><a href="${url}">${url}</a></p><p>Tautan kedaluwarsa dalam 1 jam.</p>`,
    }),
  });
  if (!res.ok) throw new Error("Gagal mengirim email — coba lagi sebentar.");
}
```

- [ ] **Step 5: Harden `src/server/auth/auth-server.ts`** — replace the `betterAuth({...})` config (keep imports + `bootstrapNewUser` + drizzleAdapter block as-is):

```ts
function requiredSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET wajib diisi di production.");
  }
  return s || "neraca-dev-secret-only";
}

function trustedOrigins(): string[] {
  const extra = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...extra,
  ];
}

export const auth = betterAuth({
  secret: requiredSecret(),
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: trustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const { sendAuthEmail } = await import("./email");
      await sendAuthEmail("reset-password", user, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => {
      const { sendAuthEmail } = await import("./email");
      await sendAuthEmail("verification", user, url);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
    },
  },
  databaseHooks: { /* unchanged */ },
});
```

Then verify the OAuth issuer risk: read `node_modules/better-auth/dist/adapters/drizzle-adapter/index.d.mts` and its `.mjs` implementation for the account-insert mapping — confirm `issuer` is populated for OAuth logins against the NOT NULL `account.issuer` column (`schema/auth.ts:39`). If it can be null, add a DB-default migration (`ALTER TABLE "account" ALTER COLUMN "issuer" SET DEFAULT ''`) via `bunx drizzle-kit generate` + `bun run db:migrate` instead of guessing.

- [ ] **Step 6: Extend session context + guards** — in `session.ts`, add `emailVerified: boolean` to `AppContext` (from `s.user.emailVerified`) and to the TEST seam object in `guard.ts` (`emailVerified: true, onboardingCompleted: true`). In `guard.ts` add:

```ts
export async function requireVerifiedSession(): Promise<
  AppContext & { emailVerified: boolean }
> {
  const testCtx = testContext();
  const ctx = testCtx ?? (await getActiveContext());
  if (!ctx) redirect("/masuk");
  const verified = testCtx ? true : await isEmailVerified(ctx.userId);
  if (!verified) redirect("/verifikasi");
  return { ...ctx, emailVerified: true };
}
```

with `isEmailVerified` reading the `user` table by id in `session.ts`. Also export `getOnboardingStatus(orgId): Promise<"IN_PROGRESS" | "COMPLETED" | null>` from a tiny `src/server/auth/onboarding-status.ts` using `getProfile` (null = no row → treat as IN_PROGRESS via self-heal in Task 5).

- [ ] **Step 7: Update `AuthForm`** — (a) signup field label/placeholder becomes "Nama lengkap" (input name stays `name`); (b) add Google button calling `authClient.signIn.social({ provider: "google", callbackURL: "/onboarding" })` with busy/error handling matching the existing form; (c) after email signup: if the Step-1 finding says no session is issued, `window.location.href = "/verifikasi?email=" + encodeURIComponent(email)`; after signin with "email not verified" error, same redirect; otherwise `/dasbor` (the `/onboarding` flip happens in Task 6). Keep the generic error message for wrong passwords.

- [ ] **Step 8: Create `src/app/verifikasi/page.tsx`** — public card (same GlowCard/BackgroundBeams pattern as `auth-form.tsx`): "Periksa email Anda", shows the `?email=` address, resend button (`authClient.sendVerificationEmail({ email, callbackURL: "/onboarding" })` — adjust to the exact signature found in Step 1), link back to `/masuk`. Resend errors shown inline in Bahasa Indonesia.

- [ ] **Step 9: Update `.env.example`** — append:

```
BETTER_AUTH_URL="http://localhost:3000"
TRUSTED_ORIGINS=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
RESEND_API_KEY=""
EMAIL_FROM="Neraca <noreply@neraca.id>"
AI_MOCK="1"
```

- [ ] **Step 10: Run tests + typecheck + manual auth checklist**

Run: `bun run test tests/unit/auth/email.test.ts` — Expected: PASS.
Run: `bunx tsc --noEmit` — Expected: clean.
Manual (dev, no key): daftar → lands `/verifikasi`; server log shows verification URL; signup with 7-char password rejected ("kata sandi" message from better-auth); wrong-password login shows generic error. Google button renders (click-through only tested in Task 6 e2e if test credentials exist — otherwise visual check only; note the outcome in the commit message).

- [ ] **Step 11: Commit**

```powershell
git add src/server/auth src/app/verifikasi src/components/auth-form.tsx .env.example tests/unit/auth/email.test.ts
git commit -m "feat(auth): email verification, Google OAuth, rate limit, session policy"
```

---

### Task 5: Onboarding engine + provisioning (deterministic core, LLM only polishes)

**Files:**
- Create: `src/server/onboarding/parse.ts`
- Create: `src/server/onboarding/engine.ts`
- Create: `src/app/onboarding/actions.ts`
- Create: `tests/eval/onboarding-mapping.test.ts`
- Create: `tests/integration/onboarding-engine.test.ts`

**Interfaces:**
- Consumes: `getProfile/upsertProfile/addOnboardingMessage/listOnboardingMessages` (Task 1), `coaForBusinessType/validateCoaDefs/inferAccountType/suggestAccountCode` (Task 2), `seedOrgAccounts/seedFiscalPeriods` (Task 3), `organizations` rename, Gemini Interactions (optional polish only).
- Produces: `submitOnboardingMessage(orgId, text): Promise<EngineReply>`, `getOnboardingView(orgId)`, `finalizeOnboarding(orgId, key): Promise<{ ok: true; replaced: boolean }>`, server actions `sendOnboardingMessage`, `confirmCoa`, `customizeCoa`, `finishOnboarding`.

```ts
export interface EngineReply {
  reply: string;          // assistant message (template or LLM-polished)
  chips: string[];        // suggestion chips, max 6
  step: OnboardingStep;   // step AFTER processing
  coaPreview?: AccountDef[]; // set on COA step
  finished?: boolean;     // true right after finalize succeeds
}
```

Rules (implement exactly):
- Steps advance NAMA → USAHA → JENIS → SKALA → LOKASI → REFERRAL → RINGKASAN → COA → SELESAI. Empty input (>500 chars truncated with notice) never advances; re-ask kindly.
- NAMA: any 2–60 char text → `displayName`. USAHA: 2–80 chars → `businessName`.
- JENIS: chip match (6 labels) OR `parseBusinessType(free text)`; null → re-ask with chips. Keyword priority order: KOS_PROPERTI → KULINER → ONLINE_RESALE → MANUFAKTUR → JASA → DAGANG → null. Case-insensitive substring:
  - KOS_PROPERTI: kos, kost, kontrakan, petak, apartemen, indekos
  - KULINER: warteg, warung makan, kopi, coffee, kafe, cafe, resto, restoran, rumah makan, kuliner, makanan, minuman, katering, catering, bakso, mie, soto, sate, geprek, warung kopi, depot, kantin
  - ONLINE_RESALE: shopee, tokopedia, tiktok, online, reseller, dropship, dropshipper, marketplace, lazada, blibli, afiliasi
  - MANUFAKTUR: pabrik, manufaktur, produksi, konveksi, garmen, mebel, furniture, percetakan
  - JASA: jasa, bengkel, salon, laundry, cucian, servis, service, konsultan, desain, design, fotografi, foto, barber, pangkas, bimbel, kursus, les, travel, tour, notaris, arsitek, cleaning, reparasi
  - DAGANG: toko, dagang, warung, kelontong, ritel, retail, grosir, grosir, distributor, minimarket, kios, konter, agen pulsa
- SKALA: parse revenue chip (`<10jt`→LT_10JT, `10–50jt`→R_10_50JT, `50–200jt`→R_50_200JT, `>200jt`→GT_200JT; free text numbers like "20 juta"/"20jt"/"rp 20.000.000" → same buckets) + employee count (first integer 1–10000 in message, or chip "Sendiri/1", "2–5", "6–20", ">20" → store midpoint 1/3/10/30; missing → ask once, then allow "Lewati" → null).
- LOKASI: city = trimmed text (chip "Lewati" → null, still advances). REFERRAL: chips Teman/Keluarga→TEMAN, Google→GOOGLE, Instagram/TikTok→SOSMED, Lainnya→LAINNYA; free text: teman|keluarga|saudara|rekomendasi→TEMAN, google|search|iklan ads→GOOGLE, instagram|tiktok|tiktok|facebook|youtube|sosmed→SOSMED, else→LAINNYA.
- RINGKASAN: reply = summary + "Sudah benar?" chips ["Ya, lanjut", "Ubah jawaban"]. Confirm regex: /^(ya|betul|benar|sudah|lanjut|oke|ok|setuju|yup)/i → COA step (build `coaDraft` = `coaForBusinessType` + persist). "ubah X": /ubah/ + (nama(?!\s*usaha)|panggilan → NAMA | nama usaha|usaha → USAHA | jenis|usaha.*jenis|bidang → JENIS | omzet|omset|skala|karyawan → SKALA | alamat|kota|lokasi → LOKASI | referral|tahu|info → REFERRAL). Else re-ask.
- COA step: intents — /^(ya|gunakan|pakai|lanjut|setuju|oke|ok|bagus|lanjutkan)/ → finalize path; /tambah(kan)?\s+(.+)/ → `inferAccountType(captured)`; null → ask type via chips ["ASET","LIABILITAS","EKUITAS","PENDAPATAN","BEBAN"]; code = `suggestAccountCode(draft, type)`; append to `coaDraft`; confirm back with code+name. /hapus\s+(\d{4}|.+)/ → match by code or case-insensitive name-includes (must match exactly 1; 0 → "tidak ketemu"; >1 → list candidates + ask). "lihat"/"tampilkan" → resend preview. Persist `coaDraft` every change.
- `finalizeOnboarding(orgId, key)`: `pg_advisory_xact_lock(hashtext(orgId))`; reload; if COMPLETED → `{ ok: true, replaced: false, already: true }`; if `idempotencyKey === key` and accounts exist → same early return; else tx: count accounts + check POSTED journals (`journal_entries.status = 'POSTED'` limit 1): hasPosted → skip COA touch, `replaced: false`; else delete accounts, `seedOrgAccounts(orgId, coaDraft ?? coaForBusinessType, tx)`, `replaced: true`; ensure periods exist (insert only missing by name); rename org to `businessName`; set COMPLETED + completedAt + idempotencyKey. `validateCoaDefs` must return [] or throw `COA_TIDAK_VALID`.
- LLM polish: ONLY if `GEMINI_API_KEY` set AND `AI_MOCK !== "1"`: call Interactions with a ≤80-word Bahasa Indonesia rephrase prompt of the template reply, `store:false`, 1 attempt, 8s timeout; ANY failure → template reply. Field values NEVER come from the LLM. Import `@google/genai` lazily so unit tests don't load it.

- [ ] **Step 1: Write the mapping eval `tests/eval/onboarding-mapping.test.ts`** (mirror `tests/eval/draft-accuracy.test.ts` structure — read it first for the harness pattern)

10 locked cases: "warteg di Tebet"→KULINER, "jualan baju di shopee"→ONLINE_RESALE, "kos 10 pintu di Jogja"→KOS_PROPERTI, "bengkel motor"→JASA, "toko kelontong"→DAGANG, "konveksi seragam sekolah"→MANUFAKTUR, "coffee shop specialty"→KULINER, "jasa desain logo"→JASA, "reseller skincare tiktok"→ONLINE_RESALE, "kontrakan 5 petak"→KOS_PROPERTI. Each asserts `parseBusinessType(input) === expected`.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test tests/eval/onboarding-mapping.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `src/server/onboarding/parse.ts`** — implement `parseBusinessType`, `parseRevenue`, `parseEmployees`, `parseReferral`, `parseConfirm`, `parseUbahTarget`, `parseCoaIntent` exactly per the rules above. No LLM, no DB — pure functions.

- [ ] **Step 4: Run the eval**

Run: `bun run test tests/eval/onboarding-mapping.test.ts` — Expected: PASS (10/10). If any phrase misfires, fix keyword lists/order in `parse.ts` (never loosen to fuzzy matching — determinism is the point).

- [ ] **Step 5: Write the failing engine integration test `tests/integration/onboarding-engine.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { makeOrg, truncateAll } from "./helpers";
import { accounts } from "@/server/db/schema/org";
import { submitOnboardingMessage, finalizeOnboarding } from "@/server/onboarding/engine";

process.env.AI_MOCK = "1";

describe("onboarding engine", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("walks 7 steps from chips and free text, then finalizes with KULINER COA", async () => {
    const { orgId } = await makeOrg("Org Tes");
    let r = await submitOnboardingMessage(db, orgId, "Budi");
    expect(r.step).toBe("USAHA");
    r = await submitOnboardingMessage(db, orgId, "Warung Budi");
    expect(r.step).toBe("JENIS");
    r = await submitOnboardingMessage(db, orgId, "warteg di Tebet");
    expect(r.step).toBe("SKALA");
    r = await submitOnboardingMessage(db, orgId, "omzet 20 juta, karyawan 3");
    expect(r.step).toBe("LOKASI");
    r = await submitOnboardingMessage(db, orgId, "Lewati");
    expect(r.step).toBe("REFERRAL");
    r = await submitOnboardingMessage(db, orgId, "Teman");
    expect(r.step).toBe("RINGKASAN");
    expect(r.reply).toContain("Warung Budi");
    r = await submitOnboardingMessage(db, orgId, "Ya, lanjut");
    expect(r.step).toBe("COA");
    expect(r.coaPreview?.some((a) => a.name === "Beban Komisi Delivery")).toBe(true);
    r = await submitOnboardingMessage(db, orgId, "tambah Beban Iklan");
    expect(r.coaPreview?.some((a) => a.name === "Beban Iklan")).toBe(true);
    r = await submitOnboardingMessage(db, orgId, "gunakan ini");
    expect(r.finished).toBe(true);
    const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    expect(rows.some((a) => a.name === "Beban Iklan")).toBe(true);
    expect(rows.some((a) => a.name === "Beban Komisi Delivery")).toBe(true);
  });

  it("finalize is idempotent under double submit", async () => {
    const { orgId } = await makeOrg("Org Idem");
    // fast-path: seed minimal profile state directly
    const { upsertProfile } = await import("@/server/db/repos/onboarding.repo");
    await upsertProfile(db, orgId, {
      displayName: "A", businessName: "B", businessType: "JASA",
      currentStep: "COA",
      coaDraft: (await import("@/core/accounts/coa-templates")).coaForBusinessType("JASA"),
    });
    const key = "idem-key-1";
    await finalizeOnboarding(db, orgId, key);
    await finalizeOnboarding(db, orgId, key);
    const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const jasa = (await import("@/core/accounts/coa-templates")).coaForBusinessType("JASA");
    expect(rows.length).toBe(jasa.length);
  });

  it("legacy org WITH posted journals keeps its COA and still completes", async () => {
    const { orgId } = await makeOrg("Org Lama");
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await seedOrgData(orgId);
    // post one journal through the real pipeline
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    await postJournalEntry(db, {
      orgId,
      memo: "modal awal",
      dateISO: new Date().toISOString().slice(0, 10),
      lines: [
        { accountCode: "1110", debitText: "1000000", creditText: "" },
        { accountCode: "3100", debitText: "", creditText: "1000000" },
      ],
    } as never);
    const { upsertProfile } = await import("@/server/db/repos/onboarding.repo");
    await upsertProfile(db, orgId, {
      displayName: "L", businessName: "Usaha Lama", businessType: "DAGANG", currentStep: "COA",
    });
    const res = await finalizeOnboarding(db, orgId, "legacy-key");
    expect(res.replaced).toBe(false);
    const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    expect(rows.some((a) => a.name === "Pendapatan Usaha")).toBe(true);
  });
});
```

Note: verify `postJournalEntry`'s exact signature in `src/server/db/repos/journals.repo.ts` before running — adjust the call (and the `as never` cast) to match; the test's INTENT (one real POSTED entry) is what matters.

- [ ] **Step 6: Run it to verify it fails**

Run: `bun run test tests/integration/onboarding-engine.test.ts`
Expected: FAIL (engine module missing).

- [ ] **Step 7: Create `src/server/onboarding/engine.ts`** implementing `EngineReply`, `getOnboardingView`, `submitOnboardingMessage`, `finalizeOnboarding` exactly per the rules block above. Reply templates in Bahasa Indonesia, e.g. NAMA greeting: `"Halo! Saya Nara, asisten pembukuan Anda. Siapa nama panggilan Anda?"`; chips per step: JENIS → 6 `BUSINESS_TYPE_LABELS` values; SKALA → `["<10jt / bulan","10–50jt / bulan","50–200jt / bulan",">200jt / bulan"]`; LOKASI → `["Lewati"]`; REFERRAL → `["Teman / Keluarga","Google","Instagram / TikTok","Lainnya"]`; RINGKASAN → `["Ya, lanjut","Ubah jawaban"]`; COA → `["Gunakan COA ini","Tambah akun","Hapus akun"]`. Persist BOTH user and assistant messages via `addOnboardingMessage` with the CURRENT step label.

- [ ] **Step 8: Run engine tests + eval + typecheck**

Run: `bun run test tests/integration/onboarding-engine.test.ts tests/eval/onboarding-mapping.test.ts` — Expected: PASS.
Run: `bunx tsc --noEmit` — Expected: clean.

- [ ] **Step 9: Create thin server actions `src/app/onboarding/actions.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { requireVerifiedSession } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  getOnboardingView,
  submitOnboardingMessage,
  finalizeOnboarding,
} from "@/server/onboarding/engine";

async function orgId(): Promise<string> {
  const ctx = await requireVerifiedSession();
  return ctx.orgId;
}

export async function sendOnboardingMessage(text: string) {
  const id = await orgId();
  return submitOnboardingMessage(db, id, text);
}

export async function loadOnboardingView() {
  const id = await orgId();
  return getOnboardingView(db, id);
}

export async function finishOnboarding(key?: string) {
  const id = await orgId();
  return finalizeOnboarding(db, id, key ?? randomUUID());
}
```

Return values must be JSON-serializable (plain objects/arrays only — no BigInt/Date instances; convert dates to ISO strings inside the engine).

- [ ] **Step 10: Commit**

```powershell
git add src/server/onboarding src/app/onboarding/actions.ts tests/eval/onboarding-mapping.test.ts tests/integration/onboarding-engine.test.ts
git commit -m "feat(onboarding): deterministic chat engine + atomic provisioning"
```

---

### Task 6: Onboarding UI + gate wiring + e2e (ship it)

**Files:**
- Create: `src/app/onboarding/page.tsx`, `onboarding-chat-client.tsx`, `coa-preview.tsx`, `preparing-overlay.tsx`
- Modify: `src/app/(app)/layout.tsx` (gate), `src/components/auth-form.tsx` (redirect flip)
- Create: `tests/e2e/onboarding.spec.ts`; update `tests/e2e/smoke.spec.ts` if needed (read first)
- Test: full gates

**Interfaces:**
- Consumes: actions from Task 5, `requireOnboardedContext` (Task 4 + status helper), PromptInput primitives (read `src/app/(app)/jurnal/ai/composer-client.tsx` + rest of `prompt-input.tsx` for exact export names first), motion primitives (`src/components/motion`), shadcn `Button/Badge/Card`.

- [ ] **Step 1: Read UI precedents** — read `src/app/(app)/jurnal/ai/composer-client.tsx` (chat submit pattern), `src/components/ai-elements/prompt-input.tsx` from line 81 (export names: `PromptInputTextarea`, `PromptInputSubmit`?), and `tests/e2e/smoke.spec.ts` + `playwright.config.ts` (confirm `AI_MOCK=1` in webServer env). List the exact export names; use them verbatim below.

- [ ] **Step 2: Wire the gate** — in `src/app/(app)/layout.tsx` replace `requireContext()` with `requireOnboardedContext()` (redirects to `/onboarding` when profile isn't COMPLETED; implement it in `guard.ts` via `getOnboardingStatus` + self-heal `upsertProfile` for row-less legacy orgs). In `src/components/auth-form.tsx` change both success redirects from `/dasbor` to `/onboarding` (the gate forwards completed users to `/dasbor` anyway — no flash, single rule).

- [ ] **Step 3: Create `src/app/onboarding/page.tsx`** (server component, OUTSIDE `(app)` shell):

```tsx
import { redirect } from "next/navigation";
import { requireVerifiedSession } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getOnboardingView } from "@/server/onboarding/engine";
import { OnboardingChatClient } from "./onboarding-chat-client";

export default async function OnboardingPage() {
  const ctx = await requireVerifiedSession().catch(() => null);
  if (!ctx) redirect("/masuk");
  const view = await getOnboardingView(db, ctx.orgId);
  if (view.profile?.status === "COMPLETED") redirect("/dasbor");
  return (
    <OnboardingChatClient
      initialMessages={view.messages}
      initialStep={view.profile?.currentStep ?? "NAMA"}
      initialPreview={view.coaPreview}
    />
  );
}
```

`getOnboardingView` returns `{ profile, messages: Array<{ role; content }>, coaPreview: AccountDef[] | null }` (COA preview included when step is COA) and sends the greeting message on first view (persisted, so refresh never duplicates it).

- [ ] **Step 4: Create `onboarding-chat-client.tsx`** — `"use client"`; state: messages, chips, step, coaPreview, busy, preparing. Layout: centered column `max-w-2xl`, header "Kenalan dengan Nara", message bubbles (assistant `bg-paper border-rule`, user `bg-terra text-white`), chips row (clickable → send), `PromptInput` + textarea + submit (`data-testid="onboarding-input"`, `"onboarding-send"`, chips `data-testid="onboarding-chip"`). `useTransition` for sends; auto-scroll to bottom on new message; `prefers-reduced-motion` respected (no entrance animation when reduced). When `step === "COA"` render `<CoaPreview>`; on `finished` → `<PreparingOverlay onDone={() => (window.location.href = "/dasbor")} />` which calls `finishOnboarding` with a client-generated `randomUUID()` key.

- [ ] **Step 5: Create `coa-preview.tsx`** — groups accounts by type (ASET/LIABILITAS/EKUITAS/PENDAPATAN/BEBAN) with counts, highlights template-specific accounts (those NOT in base `COA_TEMPLATE`), shows custom added/removed diff lines, buttons: "Gunakan COA ini" (`data-testid="coa-confirm"` → sends "gunakan ini" through the normal message action), plus hint text "atau ketik: tambah <nama akun> / hapus <kode>".

- [ ] **Step 6: Create `preparing-overlay.tsx`** — full-screen overlay, 3 stages ("Menyimpan profil", "Menyiapkan bagan akun", "Membuka periode") advancing on a 900ms interval (skip animation + show static "Menyiapkan…" when `matchMedia("(prefers-reduced-motion: reduce)")` matches), calls `finishOnboarding(key)` once (guard double-invoke with a ref), on success calls `onDone`, on error shows "Gagal menyiapkan — Coba lagi" with retry button. All strings Bahasa Indonesia.

- [ ] **Step 7: Write e2e `tests/e2e/onboarding.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

const email = `onboard-${Date.now()}@tes.id`;

test("daftar → onboarding chat → COA → dasbor", async ({ page }) => {
  await page.goto("/daftar");
  await page.getByLabel("Nama lengkap").fill("Budi E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata Sandi").fill("rahasia123");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  const send = async (text: string) => {
    await page.getByTestId("onboarding-input").fill(text);
    await page.getByTestId("onboarding-send").click();
  };

  await send("Budi");
  await send("Warung Budi E2E");
  await page.getByTestId("onboarding-chip").filter({ hasText: "Kuliner" }).click();
  await page.getByTestId("onboarding-chip").filter({ hasText: "10–50jt" }).click();
  await page.getByTestId("onboarding-chip").filter({ hasText: "Lewati" }).click();
  await page.getByTestId("onboarding-chip").filter({ hasText: "Teman" }).click();
  await page.getByTestId("onboarding-chip").filter({ hasText: "Ya, lanjut" }).click();
  await expect(page.getByTestId("coa-confirm")).toBeVisible();
  await page.getByTestId("coa-confirm").click();
  await expect(page).toHaveURL(/\/dasbor/, { timeout: 20000 });
});

test("rute app terkunci sebelum onboarding selesai", async ({ page }) => {
  await page.goto("/dasbor");
  await expect(page).toHaveURL(/\/(masuk|onboarding)/);
});
```

Adjust label/button selectors in Step 1 to the EXACT strings in `auth-form.tsx` after Task 4 (e.g. label "Nama lengkap" exists only in daftar mode). If email verification blocks session creation in the test env (no SMTP), the flow lands on `/verifikasi` instead — handle it: in `AI_MOCK=1` dev the email sender only logs; better-auth still withholds the session. Fix: the spec's dev fallback says the verification LINK is logged — e2e cannot click it. So add a test-only escape hatch: when `AI_MOCK=1`, `sendVerificationEmail` ALSO writes the token to a dev-only endpoint? NO — instead: e2e test reads the verification URL from... it can't. Cleanest: gate `/onboarding` on `requireVerifiedSession` BUT in the e2e, verify email via the API directly: after signup, query `ledger_test.verification` table for the token and `page.goto(callbackURL with token)`. better-auth verification uses `/api/auth/verify-email?token=...&callbackURL=...`. Implement exactly that in the spec: after signup submit, connect via `pg` to ledger_test, `SELECT value FROM verification WHERE identifier LIKE 'verify-email%' ORDER BY created_at DESC LIMIT 1`, then `page.goto('/api/auth/verify-email?token=' + value + '&callbackURL=/onboarding')`. Verify this URL shape against installed better-auth 1.7.1 (search `verify-email` in `node_modules/better-auth/dist/api`) during implementation; adjust if different. The second test (locked route, logged out) needs no email.

- [ ] **Step 8: Run typecheck + build + unit/integration + e2e**

Run in order, each must pass before the next:
```powershell
bunx tsc --noEmit
bun run build
bun run test
```
Then ensure nothing listens on :3000 (Playwright's webServer boots its own; stale servers cause false passes on cold compile — kill them first), then:
```powershell
bun run e2e -- tests/e2e/onboarding.spec.ts
bun run e2e
```
Expected: all green. (`bun run test` = `vitest run`, hits `ledger_test` only; `bun run e2e` runs with `AI_MOCK=1` webServer env.)

- [ ] **Step 9: Commit**

```powershell
git add src/app/onboarding src/app/\(app\)/layout.tsx src/server/auth/guard.ts src/components/auth-form.tsx tests/e2e/onboarding.spec.ts tests/e2e/smoke.spec.ts
git commit -m "feat(onboarding): chat-driven onboarding UI, hard gate, e2e"
```

---

## Self-Review

**1. Spec coverage** (spec: `docs/superpowers/specs/2026-09-04-saas-onboarding-design.md`):
- §2 auth (verification page+resend §2, password min 8, session 7d/24h, rate limit, Google OAuth, secret fail-fast, origins from env, AuthForm name+redirect) → Task 4 (all bullets) + Task 6 Step 2 (redirect flip). ✅
- §3 data model (`org_profiles` all 11 fields + status/completedAt, messages persisted, hard gate, legacy self-heal, no skip, 1 user = 1 org) → Task 1 (schema+repo) + Task 3 (self-heal backfill) + Task 5 (status flip) + Task 6 Step 2 (gate). ✅
- §4 chat (7 steps, chips, PromptInput, LLM language-only + parsing, AI_MOCK deterministic, refresh-safe) → Task 5 (engine+rules+polish) + Task 6 (UI). ✅
- §5 COA (6 templates, preview + add/remove via chat, 1-tx provisioning + advisory lock + idempotency, preparing screen, legacy with/without journals) → Tasks 2, 5, 6. ✅
- §6 errors (AI-down degradation, atomic retry, double-submit, chat rate limit*) → Task 5 (fallbacks, atomic, idempotency). *Chat rate limit: folded into Task 6 Step 4 as a 10-msg/min per-org guard inside `sendOnboardingMessage` action (in-memory bucket is enough; note it in code). Add it during Task 6 — do not skip.
- §7 testing (vitest mapping/validation/atomicity/idempotency, 10-phrase eval, Playwright AI_MOCK incl. legacy + OAuth, 4 green gates) → Tasks 2/5/6. OAuth e2e: visual/manual only without test credentials (stated in Task 4 Step 10). ✅
- §8 out of scope: no task touches multi-org/2FA/CAPTCHA/import/i18n. ✅

**2. Placeholder scan:** every step has concrete file paths, code, commands, and expected outputs. Known-unknown branches (client SDK shapes, `Queryable` tx-compat, journal post signature, verify-email URL, PromptInput exports) are explicit READ-FIRST steps with exact files — not placeholders.

**3. Type consistency:** `BusinessType` flows core → schema → templates → engine → UI labels; `EngineReply` is the single action/UI contract (JSON-safe enforced in Task 5 Step 9); `Queryable`-based repos take `db` or `tx` uniformly; `truncateAll` covers both new tables so `beforeEach` isolation holds.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-04-saas-onboarding.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

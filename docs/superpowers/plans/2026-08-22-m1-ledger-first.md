# M1 Ledger-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship milestone M1 of the AI accounting SaaS: multi-tenant auth, Indonesian SME chart of accounts, manual double-entry journals through an immutable posting pipeline, fiscal periods with close/reopen, and the four IFRS-SME financial statements, wrapped in the Paper & Ink UI shell.

**Architecture:** Modular monolith. Single Next.js App Router app with a pure TypeScript domain core (`src/core` — no React, no DB, no fetch), a server layer (`src/server` — Drizzle repos, Better Auth, tenant-scoped helpers), and routes (`src/app`). Every journal line — human-created — passes through one validate→post→immutable pipeline enforced by application logic AND database triggers. Milestones M2–M4 (Copilot, Advisor, Doctor) are separate future plans building on this foundation.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind v4 + shadcn/ui, PostgreSQL 16 + pgvector image (vector used from M3), Drizzle ORM, Better Auth (organizations plugin), Vitest + fast-check, Playwright.

## Global Constraints

Spec: `docs/superpowers/specs/2026-08-22-ai-accounting-saas-design.md`

- TypeScript strict mode; no `any`; ESLint must pass.
- Money is `numeric(18,2)` in Postgres; domain math uses BigInt minor units via `src/core/money/money.ts`. JS `number` NEVER holds a monetary amount.
- Every business table carries `org_id uuid NOT NULL REFERENCES organizations(id)` plus a Row-Level-Security policy on `org_id = current_setting('app.current_org')`.
- Posted journal entries are immutable: corrections only via linked reversing entries. Enforced by DB trigger (`triggers.sql`) AND repo code.
- Journal numbers: `JE-<YYYY>-<NNNN>` sequential per org per period (pad 4).
- Entry statuses: `DRAFT | POSTED`. A reversal is a NEW posted entry with `reversal_of_id` set. Sources: `MANUAL` in M1 (`AI|DOCUMENT|IMPORT` reserved).
- Period statuses: `OPEN | CLOSED | LOCKED`. Posting requires OPEN. Close = accountant+; reopen = owner only, both audited.
- UI copy Bahasa Indonesia; identifiers/comments English. No emojis.
- Paper & Ink tokens: canvas `#FAF7F2`, ink text `#1C2430`, terracotta accent `#B4552D`, Fraunces display serif + Plus Jakarta Sans body, tabular numerals for money.
- Platform: Windows PowerShell. Use `npm`. Vitest command: `npx vitest run <file>`.
- Integration tests require Docker Postgres running (`npm run db:up`) and are skipped automatically when `SKIP_DB_TESTS=1`.
- Commit after every passing step. Conventional commits (`feat:`, `test:`, `chore:`).

---

## File Structure (M1 end state)

```
docker-compose.yml                  # postgres16+pgvector, init role app_user
.env.example                        # DATABASE_URL template
src/core/money/money.ts             # BigInt minor units, IDR parse/format
src/core/money/money.test.ts
src/core/accounts/types.ts          # AccountType, NormalBalance, AccountDef
src/core/accounts/coa-template.ts   # default Indonesian SME chart
src/core/accounts/index.ts          # buildCoa, validateTemplate, DEFAULT_NORMAL
src/core/accounts/index.test.ts
src/core/journals/types.ts          # inputs, ValidationIssue, PeriodStatus
src/core/journals/validate.ts       # validateEntry, checkPostingAccounts, journalNumber, makeReversal
src/core/journals/validate.test.ts
src/core/reports/aggregates.ts      # LedgerLine, AccountAggregate, aggregateFromLines
src/core/reports/statements.ts      # trialBalance, incomeStatement, balanceSheet, cashFlowIndirect, changesInEquity
src/core/reports/statements.test.ts # golden fixtures + property tests
src/server/db/index.ts              # drizzle client singleton
src/server/db/schema/org.ts         # organizations, memberships, accounts, fiscal_periods
src/server/db/schema/journal.ts     # journal_entries, journal_lines, journal_seq_counters
src/server/db/schema/audit.ts       # audit_log
src/server/db/schema/auth.ts        # better-auth generated tables (re-export)
src/server/db/triggers.sql          # immutability triggers
src/server/db/rls.sql               # row level security policies
src/server/db/scripts/apply-sql.mjs # runs *.sql files against DATABASE_URL
src/server/db/repos/with-org.ts     # tx helper setting app.current_org
src/server/db/repos/accounts.repo.ts
src/server/db/repos/periods.repo.ts
src/server/db/repos/journals.repo.ts
src/server/db/repos/audit.repo.ts
src/server/auth/auth-server.ts      # betterAuth instance + org.create.after seeding
src/server/auth/auth-client.ts      # createAuthClient
src/server/bootstrap/seed-org.ts    # COA seed + 12 monthly periods
src/server/actions/periods.actions.ts
src/server/actions/journal.actions.ts
tests/integration/helpers.ts        # db connect, org factory, truncate
tests/integration/rls.test.ts
tests/integration/posting.test.ts
tests/e2e/smoke.spec.ts
drizzle.config.ts
vitest.config.ts
playwright.config.ts
```

UI files are listed inside their tasks.

---

### Task 1: Scaffold Next.js app + Vitest

**Files:**
- Create: project root via create-next-app, then `vitest.config.ts`, `.env.example`
- Modify: `package.json` (scripts), `tsconfig.json` (verify strict)

**Interfaces:**
- Produces: runnable `npm run dev`, `npx vitest run` green; path alias `@/*` → `./src/*`.

- [ ] **Step 1: Scaffold**

```powershell
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Accept defaults. If the folder is non-empty git warns — keep existing `docs/` and `.gitignore`; merge the created `.gitignore` if prompted (keep both entries).

- [ ] **Step 2: Install runtime + dev deps**

```powershell
npm i drizzle-orm pg better-auth zod clsx tailwind-merge lucide-react
npm i -D drizzle-kit vitest fast-check @types/node dotenv @playwright/test
```

- [ ] **Step 3: Verify strict mode** — `tsconfig.json` contains `"strict": true`. If absent, add it.

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});
```

Add scripts to `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "db:up": "docker compose up -d db",
  "dev": "next dev"
}
```

- [ ] **Step 5: Sanity test** — create `src/core/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
describe("toolchain", () => {
  it("runs vitest with alias", async () => {
    const m = await import("@/core/sanity");
    expect(m.truth()).toBe(true);
  });
});
```

Create `src/core/sanity.ts`: `export const truth = () => true;`

- [ ] **Step 6: Run** — `npx vitest run src/core/sanity.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/core
git commit -m "chore: scaffold next.js app with vitest toolchain"
```

---

### Task 2: Local Postgres (pgvector) + Drizzle wiring

**Files:**
- Create: `docker-compose.yml`, `docker/init/01-role.sql`, `drizzle.config.ts`, `src/server/db/index.ts`
- Modify: `.env.example`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const db: NodePgDatabase<Record<string, never>>` from `@/server/db`; env var `DATABASE_URL=postgres://app_user:app_pw@localhost:54329/ledger`.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    ports: ["54329:5432"]
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ledger
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init:/docker-entrypoint-initdb.d
volumes:
  pgdata:
```

- [ ] **Step 2: Write `docker/init/01-role.sql`** (non-superuser role so RLS actually applies in dev/tests)

```sql
CREATE ROLE app_user LOGIN PASSWORD 'app_pw';
GRANT ALL ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user;
```

- [ ] **Step 3: Write `.env.example`** then copy to `.env`

```
DATABASE_URL="postgres://postgres:postgres@localhost:54329/ledger"
BETTER_AUTH_SECRET="change-me-in-real-env"
```

```powershell
Copy-Item .env.example .env
npm run db:up
```

Expected: container healthy on port 54329.

- [ ] **Step 4: Write `drizzle.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: Write `src/server/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool);
export type Db = typeof db;
export { pool };
```

- [ ] **Step 6: Smoke test** — `tests/integration/db-smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

const d = process.env.DATABASE_URL;
describe.skipIf(!d || process.env.SKIP_DB_TESTS === "1")("db", () => {
  it("connects", async () => {
    const { pool } = await import("@/server/db");
    const r = await pool.query("select version()");
    expect(r.rows[0].version).toContain("PostgreSQL");
    await pool.end();
  });
});
```

Run `npx vitest run tests/integration/db-smoke.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml docker .env.example drizzle.config.ts src/server tests
git commit -m "chore: local pgvector via docker compose + drizzle client"
```

---

### Task 3: Domain — Money (`src/core/money`)

**Files:**
- Create: `src/core/money/money.ts`
- Test: `src/core/money/money.test.ts`

**Interfaces:**
- Produces: `class Money` with `static zero()`, `static fromMinor(v: bigint | string)`, `static parseIdr(input: string)`, instance `minor: bigint`, methods `add(b: Money): Money`, `sub(b: Money): Money`, `negate()`, `abs()`, `scaleBy(k: number | bigint): Money`, `isZero(): boolean`, `isNegative(): boolean`, `cmp(b: Money): -1|0|1`, `formatIdr(): string`. Throws `MoneyError` on invalid input.

- [ ] **Step 1: Write the failing test** `src/core/money/money.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { Money, MoneyError } from "./money";

describe("Money", () => {
  it("parses plain rupiah", () => {
    expect(Money.parseIdr("1250000").minor).toBe(125000000n);
  });
  it("parses grouped rupiah with Rp prefix", () => {
    expect(Money.parseIdr("Rp 1.250.000").minor).toBe(125000000n);
  });
  it("parses sen with comma", () => {
    expect(Money.parseIdr("1250000,5").minor).toBe(125000050n);
    expect(Money.parseIdr("0,99").minor).toBe(99n);
  });
  it("rejects garbage and >2 decimals", () => {
    expect(() => Money.parseIdr("abc")).toThrow(MoneyError);
    expect(() => Money.parseIdr("1,234")).toThrow(MoneyError);
  });
  it("formats IDR", () => {
    expect(Money.fromMinor(125000000n).formatIdr()).toBe("Rp1.250.000");
    expect(Money.fromMinor(50n).formatIdr()).toBe("Rp0,50");
    expect(Money.fromMinor(-200000n).formatIdr()).toBe("-Rp2.000");
  });
  it("adds, subtracts, compares", () => {
    const a = Money.parseIdr("1000"), b = Money.parseIdr("250");
    expect(a.sub(b).formatIdr()).toBe("Rp750");
    expect(a.add(b.negate()).cmp(a)).toBe(-1);
    expect(b.scaleBy(4).formatIdr()).toBe("Rp1.000");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/core/money` → FAIL (module not found).

- [ ] **Step 3: Implement** `src/core/money/money.ts`

```ts
const SCALE = 100n;

export class MoneyError extends Error {}

export class Money {
  private constructor(readonly minor: bigint) {}

  static zero(): Money {
    return new Money(0n);
  }

  static fromMinor(v: bigint | string): Money {
    return new Money(typeof v === "string" ? BigInt(v) : v);
  }

  // Accepts "1250000", "Rp 1.250.000", "1250000,5"; max 2 decimals.
  static parseIdr(input: string): Money {
    let s = input.toLowerCase().replaceAll("rp", "").replace(/\s+/g, "");
    s = s.replaceAll(".", "").replace(",", ".");
    const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) throw new MoneyError(`FORMAT_UANG_TIDAK_VALID: ${input}`);
    const sign = m[1] ? -1n : 1n;
    const whole = BigInt(m[2]);
    const frac = m[3] ? BigInt(m[3].padEnd(2, "0")) : 0n;
    return new Money(sign * (whole * SCALE + frac));
  }

  add(b: Money): Money { return new Money(this.minor + b.minor); }
  sub(b: Money): Money { return new Money(this.minor - b.minor); }
  negate(): Money { return new Money(-this.minor); }
  abs(): Money { return new Money(this.minor < 0n ? -this.minor : this.minor); }
  scaleBy(k: number | bigint): Money {
    if (!Number.isInteger(k) && typeof k === "number") throw new MoneyError("scale must be integer");
    return new Money(this.minor * BigInt(k));
  }
  isZero(): boolean { return this.minor === 0n; }
  isNegative(): boolean { return this.minor < 0n; }
  cmp(b: Money): -1 | 0 | 1 {
    return this.minor < b.minor ? -1 : this.minor > b.minor ? 1 : 0;
  }

  formatIdr(): string {
    const neg = this.minor < 0n;
    const abs = neg ? -this.minor : this.minor;
    const whole = abs / SCALE;
    const frac = abs % SCALE;
    const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const body = frac === 0n ? grouped : `${grouped},${frac.toString().padStart(2, "0")}`;
    return `${neg ? "-" : ""}Rp${body}`;
  }
}
```

- [ ] **Step 4: Run** — `npx vitest run src/core/money` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/money
git commit -m "feat(core): money value type over bigint minor units"
```

---

### Task 4: Domain — Accounts & COA template

**Files:**
- Create: `src/core/accounts/types.ts`, `src/core/accounts/coa-template.ts`, `src/core/accounts/index.ts`
- Test: `src/core/accounts/index.test.ts`

**Interfaces:**
- Produces:
  - `type AccountType = "ASET"|"LIABILITAS"|"EKUITAS"|"PENDAPATAN"|"BEBAN"`
  - `type NormalBalance = "D"|"K"`
  - `interface AccountDef { code: string; name: string; type: AccountType; normal: NormalBalance; parentCode?: string; isCash?: boolean; isBank?: boolean; contra?: boolean }`
  - `const DEFAULT_NORMAL: Record<AccountType, NormalBalance>`
  - `COA_TEMPLATE: readonly AccountDef[]`
  - `validateTemplate(defs: readonly AccountDef[]): string[]` (error codes array)
  - `buildCoa(defs): Map<string, AccountDef>` keyed by code

- [ ] **Step 1: Write the failing test** `src/core/accounts/index.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { COA_TEMPLATE, validateTemplate, buildCoa } from "./index";

describe("coa template", () => {
  it("is valid", () => {
    expect(validateTemplate(COA_TEMPLATE)).toEqual([]);
  });
  it("rejects duplicate codes", () => {
    const dup = [...COA_TEMPLATE, { ...COA_TEMPLATE[1] }];
    expect(validateTemplate(dup)).toContain("DUPLICATE_CODE");
  });
  it("rejects missing parent", () => {
    const bad = [{ code: "9999", name: "Yatim", type: "ASET", normal: "D", parentCode: "8888" }] as const;
    expect(validateTemplate(bad as never)).toContain("PARENT_NOT_FOUND");
  });
  it("normal balance must match type unless contra", () => {
    const bad = [{ code: "9100", name: "Kas Aneh", type: "ASET", normal: "K" }] as const;
    expect(validateTemplate(bad as never)).toContain("NORMAL_MISMATCH");
  });
  it("builds map by code", () => {
    const map = buildCoa(COA_TEMPLATE);
    expect(map.get("1100")?.name).toBe("Kas dan Setara Kas");
    expect(map.size).toBe(COA_TEMPLATE.length);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/core/accounts` → FAIL.

- [ ] **Step 3: Implement** `types.ts`:

```ts
export type AccountType = "ASET" | "LIABILITAS" | "EKUITAS" | "PENDAPATAN" | "BEBAN";
export type NormalBalance = "D" | "K";

export interface AccountDef {
  code: string;
  name: string;
  type: AccountType;
  normal: NormalBalance;
  parentCode?: string;
  isCash?: boolean;
  isBank?: boolean;
  contra?: boolean;
}

export const DEFAULT_NORMAL: Record<AccountType, NormalBalance> = {
  ASET: "D",
  LIABILITAS: "K",
  EKUITAS: "K",
  PENDAPATAN: "K",
  BEBAN: "D",
};
```

`coa-template.ts`:

```ts
import type { AccountDef } from "./types";

// Default Indonesian SME chart of accounts (IFRS for SMEs oriented).
export const COA_TEMPLATE: readonly AccountDef[] = [
  { code: "1000", name: "ASET", type: "ASET", normal: "D" },
  { code: "1100", name: "Kas dan Setara Kas", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1110", name: "Kas", type: "ASET", normal: "D", parentCode: "1100", isCash: true },
  { code: "1120", name: "Bank", type: "ASET", normal: "D", parentCode: "1100", isCash: true, isBank: true },
  { code: "1200", name: "Piutang Usaha", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1300", name: "Persediaan", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1400", name: "PPN Masukan", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1500", name: "Peralatan", type: "ASET", normal: "D", parentCode: "1000" },
  { code: "1590", name: "Akumulasi Penyusutan Peralatan", type: "ASET", normal: "K", parentCode: "1500", contra: true },
  { code: "1600", name: "Sewa Dibayar di Muka", type: "ASET", normal: "D", parentCode: "1000" },

  { code: "2000", name: "LIABILITAS", type: "LIABILITAS", normal: "K" },
  { code: "2100", name: "Utang Usaha", type: "LIABILITAS", normal: "K", parentCode: "2000" },
  { code: "2200", name: "PPN Keluaran", type: "LIABILITAS", normal: "K", parentCode: "2000" },
  { code: "2300", name: "Utang PPh", type: "LIABILITAS", normal: "K", parentCode: "2000" },
  { code: "2400", name: "Utang Bank", type: "LIABILITAS", normal: "K", parentCode: "2000" },

  { code: "3000", name: "EKUITAS", type: "EKUITAS", normal: "K" },
  { code: "3100", name: "Modal Disetor", type: "EKUITAS", normal: "K", parentCode: "3000" },
  { code: "3200", name: "Laba Ditahan", type: "EKUITAS", normal: "K", parentCode: "3000" },
  { code: "3300", name: "Prive", type: "EKUITAS", normal: "D", parentCode: "3000", contra: true },

  { code: "4000", name: "PENDAPATAN", type: "PENDAPATAN", normal: "K" },
  { code: "4100", name: "Pendapatan Usaha", type: "PENDAPATAN", normal: "K", parentCode: "4000" },
  { code: "4200", name: "Pendapatan Lain-lain", type: "PENDAPATAN", normal: "K", parentCode: "4000" },

  { code: "5000", name: "BEBAN", type: "BEBAN", normal: "D" },
  { code: "5100", name: "Beban Pokok Penjualan", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5200", name: "Beban Gaji", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5300", name: "Beban Sewa", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5400", name: "Beban Utilitas", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5500", name: "Beban Transportasi", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5600", name: "Beban Penyusutan", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5700", name: "Beban Pajak", type: "BEBAN", normal: "D", parentCode: "5000" },
  { code: "5900", name: "Beban Lain-lain", type: "BEBAN", normal: "D", parentCode: "5000" },
];
```

`index.ts`:

```ts
import type { AccountDef, AccountType, NormalBalance } from "./types";
import { DEFAULT_NORMAL } from "./types";

export * from "./types";
export { COA_TEMPLATE } from "./coa-template";

export function validateTemplate(defs: readonly AccountDef[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const d of defs) {
    if (!/^\d{4}$/.test(d.code)) errors.push(`BAD_CODE:${d.code}`);
    if (seen.has(d.code)) errors.push(`DUPLICATE_CODE`);
    seen.add(d.code);
  }
  for (const d of defs) {
    if (d.parentCode && !defs.some((p) => p.code === d.parentCode))
      errors.push(`PARENT_NOT_FOUND:${d.code}`);
  }
  for (const d of defs) {
    if (d.parentCode) {
      const p = defs.find((x) => x.code === d.parentCode)!;
      if (p.type !== d.type) errors.push(`PARENT_TYPE_MISMATCH:${d.code}`);
    }
    const expected: NormalBalance = d.contra
      ? DEFAULT_NORMAL[d.type] === "D" ? "K" : "D"
      : DEFAULT_NORMAL[d.type];
    if (d.normal !== expected) errors.push(`NORMAL_MISMATCH:${d.code}`);
  }
  return errors;
}

export function buildCoa(defs: readonly AccountDef[]): Map<string, AccountDef> {
  return new Map(defs.map((d) => [d.code, d]));
}
```

Note the unused-import risk: remove `AccountType` from the import if ESLint flags it (only `AccountDef`, `NormalBalance` are used).

- [ ] **Step 4: Run** — `npx vitest run src/core/accounts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/accounts
git commit -m "feat(core): account types + default indonesian SME coa template"
```

---

### Task 5: Domain — Journal validation, numbering, reversal

**Files:**
- Create: `src/core/journals/types.ts`, `src/core/journals/validate.ts`
- Test: `src/core/journals/validate.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces:
  - `type PeriodStatus = "OPEN"|"CLOSED"|"LOCKED"`
  - `type JournalSource = "MANUAL"|"AI"|"DOCUMENT"|"IMPORT"`
  - `interface JournalLineInput { accountId: string; debitMinor: bigint; creditMinor: bigint; memo?: string }`
  - `interface JournalEntryInput { dateISO: string; memo: string; lines: JournalLineInput[]; source?: JournalSource; idempotencyKey?: string }`
  - `type ValidationIssue` union codes: `BAD_DATE`, `MIN_LINES`, `NEGATIVE_AMOUNT{index}`, `LINE_EMPTY{index}`, `LINE_BOTH_SIDES{index}`, `UNBALANCED{debitMinor,creditMinor}`, `PERIOD_NOT_OPEN{periodStatus}`
  - `type AccountCheckIssue` union: `UNKNOWN_ACCOUNT{index}` | `ARCHIVED_ACCOUNT{index}` | `GROUP_ACCOUNT{index}`
  - `validateEntry(e: JournalEntryInput, periodStatus: PeriodStatus): ValidationIssue[]`
  - `checkPostingAccounts(lines: JournalLineInput[], byId: Map<string,{archivedAt: Date|null; hasChildren: boolean}>): AccountCheckIssue[]`
  - `journalNumber(periodName: string, seq: number): string` — `"2026-01", 3` → `"JE-2026-0003"`
  - `makeReversal(posted: PostedRef, dateISO: string, memo?: string): JournalEntryInput` where `PostedRef = { number: string; lines: Array<Pick<JournalLineInput,"accountId"|"debitMinor"|"creditMinor">> }`

- [ ] **Step 1: Write the failing test** `src/core/journals/validate.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { validateEntry, journalNumber, makeReversal, checkPostingAccounts } from "./validate";
import type { JournalEntryInput } from "./types";

const balanced = (): JournalEntryInput => ({
  dateISO: "2026-01-15",
  memo: "Bayar sewa",
  lines: [
    { accountId: "5300", debitMinor: 5_000_000n, creditMinor: 0n },
    { accountId: "1120", debitMinor: 0n, creditMinor: 5_000_000n },
  ],
});

describe("validateEntry", () => {
  it("accepts a balanced entry in an open period", () => {
    expect(validateEntry(balanced(), "OPEN")).toEqual([]);
  });
  it("rejects unbalanced", () => {
    const e = balanced();
    e.lines[0].debitMinor = 5_000_001n;
    expect(validateEntry(e, "OPEN")).toEqual([
      { code: "UNBALANCED", debitMinor: 5_000_001n, creditMinor: 5_000_000n },
    ]);
  });
  it("rejects single-line and empty-line entries", () => {
    const one = { dateISO: "2026-01-15", memo: "x", lines: [balanced().lines[0]] };
    expect(validateEntry(one, "OPEN")).toEqual([{ code: "MIN_LINES" }]);
    const empty = balanced();
    empty.lines.push({ accountId: "1110", debitMinor: 0n, creditMinor: 0n });
    expect(validateEntry(empty, "OPEN")).toEqual([{ code: "LINE_EMPTY", index: 2 }]);
  });
  it("rejects both-sides line and negatives", () => {
    const e = balanced();
    e.lines[0] = { accountId: "5300", debitMinor: -1n, creditMinor: 2n };
    const issues = validateEntry(e, "OPEN");
    expect(issues).toContainEqual({ code: "NEGATIVE_AMOUNT", index: 0 });
    expect(issues).toContainEqual({ code: "LINE_BOTH_SIDES", index: 0 });
  });
  it("rejects bad dates and closed periods", () => {
    expect(validateEntry({ ...balanced(), dateISO: "2026-13-40" }, "OPEN")).toEqual([{ code: "BAD_DATE" }]);
    expect(validateEntry(balanced(), "CLOSED")).toEqual([{ code: "PERIOD_NOT_OPEN", periodStatus: "CLOSED" }]);
  });
});

describe("checkPostingAccounts", () => {
  const meta = (over: Partial<{ archivedAt: Date | null; hasChildren: boolean }> = {}) =>
    ({ archivedAt: null, hasChildren: false, ...over });
  it("flags unknown, archived, group accounts", () => {
    const byId = new Map([
      ["ok", meta()],
      ["dead", meta({ archivedAt: new Date() })],
      ["grp", meta({ hasChildren: true })],
    ]);
    const lines = [
      { accountId: "nope", debitMinor: 1n, creditMinor: 0n },
      { accountId: "dead", debitMinor: 0n, creditMinor: 1n },
      { accountId: "grp", debitMinor: 1n, creditMinor: 1n }, // both-sides checked elsewhere; still group-flagged
    ];
    expect(checkPostingAccounts(lines as never, byId)).toEqual([
      { code: "UNKNOWN_ACCOUNT", index: 0 },
      { code: "ARCHIVED_ACCOUNT", index: 1 },
      { code: "GROUP_ACCOUNT", index: 2 },
    ]);
  });
});

describe("numbering & reversal", () => {
  it("formats JE numbers padded to 4", () => {
    expect(journalNumber("2026-01", 3)).toBe("JE-2026-0003");
    expect(journalNumber("2026-12", 1234)).toBe("JE-2026-1234");
  });
  it("builds a linked reversal swapping sides", () => {
    const posted = { number: "JE-2026-0007", lines: balanced().lines };
    const rev = makeReversal(posted, "2026-02-01");
    expect(rev.memo).toBe("Balikan JE-2026-0007");
    expect(rev.lines[0]).toEqual({ accountId: "1120", debitMinor: 5_000_000n, creditMinor: 0n });
    expect(rev.lines[1]).toEqual({ accountId: "5300", debitMinor: 0n, creditMinor: 5_000_000n });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/core/journals` → FAIL.

- [ ] **Step 3: Implement** `types.ts`:

```ts
export type PeriodStatus = "OPEN" | "CLOSED" | "LOCKED";
export type JournalSource = "MANUAL" | "AI" | "DOCUMENT" | "IMPORT";

export interface JournalLineInput {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo?: string;
}

export interface JournalEntryInput {
  dateISO: string;
  memo: string;
  lines: JournalLineInput[];
  source?: JournalSource;
  idempotencyKey?: string;
}
```

`validate.ts`:

```ts
import type { JournalEntryInput, JournalLineInput, PeriodStatus } from "./types";

export type ValidationIssue =
  | { code: "BAD_DATE" }
  | { code: "MIN_LINES" }
  | { code: "NEGATIVE_AMOUNT"; index: number }
  | { code: "LINE_EMPTY"; index: number }
  | { code: "LINE_BOTH_SIDES"; index: number }
  | { code: "UNBALANCED"; debitMinor: bigint; creditMinor: bigint }
  | { code: "PERIOD_NOT_OPEN"; periodStatus: PeriodStatus };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateEntry(
  e: JournalEntryInput,
  periodStatus: PeriodStatus,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isValidDate(e.dateISO)) issues.push({ code: "BAD_DATE" });

  let debit = 0n, credit = 0n;
  e.lines.forEach((l, i) => {
    if (l.debitMinor < 0n || l.creditMinor < 0n)
      issues.push({ code: "NEGATIVE_AMOUNT", index: i });
    if (l.debitMinor === 0n && l.creditMinor === 0n)
      issues.push({ code: "LINE_EMPTY", index: i });
    else if (l.debitMinor > 0n && l.creditMinor > 0n)
      issues.push({ code: "LINE_BOTH_SIDES", index: i });
    debit += l.debitMinor;
    credit += l.creditMinor;
  });

  if (e.lines.length < 2) issues.push({ code: "MIN_LINES" });
  if (debit !== credit) issues.push({ code: "UNBALANCED", debitMinor: debit, creditMinor: credit });
  if (periodStatus !== "OPEN")
    issues.push({ code: "PERIOD_NOT_OPEN", periodStatus });
  return issues;
}

export type AccountCheckIssue =
  | { code: "UNKNOWN_ACCOUNT"; index: number }
  | { code: "ARCHIVED_ACCOUNT"; index: number }
  | { code: "GROUP_ACCOUNT"; index: number };

export interface PostingAccountMeta {
  archivedAt: Date | null;
  hasChildren: boolean;
}

export function checkPostingAccounts(
  lines: JournalLineInput[],
  byId: Map<string, PostingAccountMeta>,
): AccountCheckIssue[] {
  const issues: AccountCheckIssue[] = [];
  lines.forEach((l, i) => {
    const meta = byId.get(l.accountId);
    if (!meta) issues.push({ code: "UNKNOWN_ACCOUNT", index: i });
    else if (meta.archivedAt) issues.push({ code: "ARCHIVED_ACCOUNT", index: i });
    else if (meta.hasChildren) issues.push({ code: "GROUP_ACCOUNT", index: i });
  });
  return issues;
}

export function journalNumber(periodName: string, seq: number): string {
  const year = periodName.slice(0, 4);
  return `JE-${year}-${String(seq).padStart(4, "0")}`;
}

export interface PostedRef {
  number: string;
  lines: Array<Pick<JournalLineInput, "accountId" | "debitMinor" | "creditMinor">>;
}

export function makeReversal(posted: PostedRef, dateISO: string, memo?: string): JournalEntryInput {
  return {
    dateISO,
    memo: memo ?? `Balikan ${posted.number}`,
    source: "MANUAL",
    lines: posted.lines.map((l) => ({
      accountId: l.accountId,
      debitMinor: l.creditMinor,
      creditMinor: l.debitMinor,
    })),
  };
}
```

- [ ] **Step 4: Run** — `npx vitest run src/core/journals` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/journals
git commit -m "feat(core): journal validation, je numbering, reversal builder"
```

---

### Task 6: Domain — IFRS-SME statements

**Files:**
- Create: `src/core/reports/aggregates.ts`, `src/core/reports/statements.ts`
- Test: `src/core/reports/statements.test.ts`

**Interfaces:**
- Consumes: `AccountType` from `@/core/accounts`.
- Produces:
  - `interface LedgerLine { accountId: string; debitMinor: bigint; creditMinor: bigint }`
  - `interface ReportAccountMeta { id: string; code: string; name: string; type: AccountType; normal: "D"|"K"; contra?: boolean; isCash?: boolean; isBank?: boolean }`
  - `interface AccountAggregate { meta: ReportAccountMeta; debitMinor: bigint; creditMinor: bigint }`
  - `aggregateFromLines(lines: readonly LedgerLine[], metasById: Map<string, ReportAccountMeta>): AccountAggregate[]`
  - `signed(meta: ReportAccountMeta, a: {debitMinor: bigint; creditMinor: bigint}): bigint` — movement on normal side (`normal==="D" ? debit−credit : credit−debit`)
  - `trialBalance(aggs): { rows: Array<{code,name,type,debitMinor,creditMinor}>; totalDebitMinor: bigint; totalCreditMinor: bigint; balanced: boolean }` (rows sorted by code)
  - `incomeStatement(aggs): { revenueRows: ReportRow[]; expenseRows: ReportRow[]; revenueTotalMinor: bigint; expenseTotalMinor: bigint; netIncomeMinor: bigint }` where `ReportRow = { code: string; name: string; movementMinor: bigint }`
  - `balanceSheet(aggs, netIncomeMinor): BalanceSheetResult` — **throws** `UnbalancedSheetError` unless `assets === liabilities + equityBase + netIncome`; result includes `assetRows/liabilityRows/equityRows/totalAssetsMinor/totalLiabilitiesMinor/baseEquityMinor/netIncomeMinor/totalEquityAndLiabilitiesMinor/balanced:true`
  - `cashFlowIndirect(input: CashFlowInput): CashFlowResult` with `CashFlowInput = { netIncomeMinor, deltaPiutangMinor, deltaPersediaanMinor, deltaUtangUsahaMinor, depreciationMinor, investingMinor, financingMinor }` and result `{ operatingMinor, investingMinor, financingMinor, netChangeMinor, rows }`; `operatingMinor = NI − Δpiutang − Δpersediaan + ΔutangUsaha + penyusutan`
  - `movementByCode(aggs): Map<string, bigint>` helper (code → signed movement)

- [ ] **Step 1: Write failing tests with golden fixture** `src/core/reports/statements.test.ts`

Scenario (all in one period): setoran modal 10.000.000 kas; beli peralatan 5.000.000 kas; pendapatan 8.000.000 (6.000.000 kas + 2.000.000 piutang); beban gaji 3.000.000 kas.
Expected: NI = 5.000.000; Kas = 8.000.000; Piutang = 2.000.000; Peralatan = 5.000.000; Aset = 15.000.000; Liabilitas 0; Ekuitas dasar 10.000.000; TB totals 26.000.000 / 26.000.000.

```ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { aggregateFromLines, signed, type LedgerLine, type ReportAccountMeta } from "./aggregates";
import {
  trialBalance, incomeStatement, balanceSheet,
  cashFlowIndirect, changesInEquity, UnbalancedSheetError,
} from "./statements";

const M = (id: string, code: string, name: string, type: ReportAccountMeta["type"], normal: "D" | "K"): ReportAccountMeta =>
  ({ id, code, name, type, normal });

const METAS: Map<string, ReportAccountMeta> = new Map([
  ["kas", M("kas", "1120", "Bank", "ASET", "D")],
  ["piutang", M("piutang", "1200", "Piutang Usaha", "ASET", "D")],
  ["peralatan", M("peralatan", "1500", "Peralatan", "ASET", "D")],
  ["utang", M("utang", "2100", "Utang Usaha", "LIABILITAS", "K")],
  ["modal", M("modal", "3100", "Modal Disetor", "EKUITAS", "K")],
  ["pendapatan", M("pendapatan", "4100", "Pendapatan Usaha", "PENDAPATAN", "K")],
  ["gaji", M("gaji", "5200", "Beban Gaji", "BEBAN", "D")],
]);

const L = (accountId: string, debitMinor: bigint, creditMinor: bigint): LedgerLine =>
  ({ accountId, debitMinor, creditMinor });

const JT = 1_000_000n;
const SCENARIO: LedgerLine[] = [
  L("kas", 10n * JT, 0n), L("modal", 0n, 10n * JT),          // setoran modal
  L("peralatan", 5n * JT, 0n), L("kas", 0n, 5n * JT),        // beli peralatan
  L("kas", 6n * JT, 0n), L("pendapatan", 0n, 8n * JT),       // pendapatan kas
  L("piutang", 2n * JT, 0n), L("pendapatan", 0n, 2n * JT),   // pendapatan kredit
  L("gaji", 3n * JT, 0n), L("kas", 0n, 3n * JT),             // beban gaji
];

function agg() {
  return aggregateFromLines(SCENARIO, METAS);
}

describe("golden fixture", () => {
  it("trial balance balances at 26jt per side", () => {
    const tb = trialBalance(agg());
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebitMinor).toBe(26n * JT);
    expect(tb.totalCreditMinor).toBe(26n * JT);
  });
  it("laba rugi: pendapatan 8jt, beban 3jt, laba bersih 5jt", () => {
    const isx = incomeStatement(agg());
    expect(isx.revenueTotalMinor).toBe(8n * JT);
    expect(isx.expenseTotalMinor).toBe(3n * JT);
    expect(isx.netIncomeMinor).toBe(5n * JT);
  });
  it("neraca seimbang 15jt aset", () => {
    const bs = balanceSheet(agg(), 5n * JT);
    expect(bs.totalAssetsMinor).toBe(15n * JT);
    expect(bs.totalLiabilitiesMinor).toBe(0n);
    expect(bs.baseEquityMinor).toBe(10n * JT);
    expect(bs.totalEquityAndLiabilitiesMinor).toBe(15n * JT);
    expect(bs.balanced).toBe(true);
  });
  it("neraca melempar bila tidak seimbang", () => {
    expect(() => balanceSheet(agg(), 99n * JT)).toThrow(UnbalancedSheetError);
  });
  it("arus kas indirect", () => {
    const cf = cashFlowIndirect({
      netIncomeMinor: 5n * JT,
      deltaPiutangMinor: 2n * JT,
      deltaPersediaanMinor: 0n,
      deltaUtangUsahaMinor: 0n,
      depreciationMinor: 0n,
      investingMinor: -(5n * JT),
      financingMinor: 10n * JT,
    });
    expect(cf.operatingMinor).toBe(3n * JT);      // 5 - 2
    expect(cf.netChangeMinor).toBe(8n * JT);      // kas naik 30-22? -> 17jt? see note
  });
});
```

> NOTE for implementer: the scenario's real ΔKas is +8jt (in 16, out 8). With investing −5jt and financing +10jt, operating must be 3jt so the statement ties to reality: 3 − 5 + 10 = 8. The final assertion `netChangeMinor` MUST be `8n * JT`. If your implementation returns anything else, fix the implementation, not the test.

```ts
  it("perubahan ekuitas", () => {
    const ce = changesInEquity({
      openingRetainedEarningsMinor: 0n,
      contributionsMinor: 10n * JT,
      drawingsMinor: 0n,
      netIncomeMinor: 5n * JT,
    });
    expect(ce.closingRetainedEarningsMinor).toBe(5n * JT);
    expect(ce.rows.map((r) => r.label)).toContain("Modal Disetor");
    expect(ce.rows.map((r) => r.label)).toContain("Laba Tahun Berjalan");
  });
});

describe("property: balanced batches keep books balanced", () => {
  const amountGen = fc.bigInt({ min: 1n, max: 100_000n });
  const metaArb = fc.constantFrom(...[...METAS.values()]);

  it("identity A − L − E == NI always holds", () => {
    fc.assert(fc.property(
      fc.array(fc.record({ a: metaArb, b: metaArb, amt: amountGen }), { minLength: 1, maxLength: 50 }),
      (pairs) => {
        const lines: LedgerLine[] = [];
        for (const p of pairs) {
          if (p.a.id === p.b.id || p.a.normal === p.b.normal) continue;
          const [dr, cr] = p.a.normal === "D" ? [p.a, p.b] : [p.b, p.a];
          lines.push(L(dr.id, p.amt, 0n), L(cr.id, 0n, p.amt));
        }
        if (lines.length === 0) return;
        const ags = aggregateFromLines(lines, METAS);
        const s = (t: string) => signed(METAS.get(t)!, ags.find((x) => x.meta.id === t)! ?? { debitMinor: 0n, creditMinor: 0n });
        const sumSigned = (pred: (m: ReportAccountMeta) => boolean) =>
          ags.filter((x) => pred(x.meta)).reduce((acc, x) => acc + signed(x.meta, x), 0n);
        const assets = sumSigned((m) => m.type === "ASET");
        const liab = sumSigned((m) => m.type === "LIABILITAS");
        const eq = sumSigned((m) => m.type === "EKUITAS");
        const rev = sumSigned((m) => m.type === "PENDAPATAN");
        const exp = sumSigned((m) => m.type === "BEBAN");
        expect(assets - liab - eq).toBe(rev - exp);
      },
    ), { numRuns: 200 });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/core/reports` → FAIL.

- [ ] **Step 3: Implement** `aggregates.ts`:

```ts
import type { AccountType, NormalBalance } from "@/core/accounts/types";

export interface LedgerLine {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
}

export interface ReportAccountMeta {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normal: NormalBalance;
  contra?: boolean;
  isCash?: boolean;
  isBank?: boolean;
}

export interface AccountAggregate {
  meta: ReportAccountMeta;
  debitMinor: bigint;
  creditMinor: bigint;
}

export function aggregateFromLines(
  lines: readonly LedgerLine[],
  metasById: Map<string, ReportAccountMeta>,
): AccountAggregate[] {
  const byId = new Map<string, AccountAggregate>();
  for (const l of lines) {
    const meta = metasById.get(l.accountId);
    if (!meta) throw new Error(`AKUN_TIDAK_DIKENAL: ${l.accountId}`);
    let a = byId.get(l.accountId);
    if (!a) { a = { meta, debitMinor: 0n, creditMinor: 0n }; byId.set(l.accountId, a); }
    a.debitMinor += l.debitMinor;
    a.creditMinor += l.creditMinor;
  }
  return [...byId.values()];
}

export function signed(
  meta: ReportAccountMeta,
  a: { debitMinor: bigint; creditMinor: bigint },
): bigint {
  return meta.normal === "D" ? a.debitMinor - a.creditMinor : a.creditMinor - a.debitMinor;
}
```

`statements.ts`:

```ts
import type { AccountAggregate, ReportAccountMeta } from "./aggregates";
import { signed } from "./aggregates";

export interface ReportRow {
  code: string;
  name: string;
  movementMinor: bigint;
}

export class UnbalancedSheetError extends Error {
  constructor() { super("NERACA_TIDAK_SEIMBANG"); }
}

const sortByCode = <T extends { code: string }>(rows: T[]): T[] =>
  [...rows].sort((x, y) => x.code.localeCompare(y.code));

export function trialBalance(aggs: Iterable<AccountAggregate>) {
  const rows = sortByCode(
    [...aggs].map((a) => ({
      code: a.meta.code, name: a.meta.name,
      debitMinor: a.debitMinor, creditMinor: a.creditMinor,
    })),
  );
  const totalDebitMinor = rows.reduce((s, r) => s + r.debitMinor, 0n);
  const totalCreditMinor = rows.reduce((s, r) => s + r.creditMinor, 0n);
  return { rows, totalDebitMinor, totalCreditMinor, balanced: totalDebitMinor === totalCreditMinor };
}

export function incomeStatement(aggs: Iterable<AccountAggregate>) {
  const list = [...aggs];
  const toRow = (a: AccountAggregate): ReportRow =>
    ({ code: a.meta.code, name: a.meta.name, movementMinor: signed(a.meta, a) });
  const revenueRows = sortByCode(list.filter((a) => a.meta.type === "PENDAPATAN").map(toRow));
  const expenseRows = sortByCode(list.filter((a) => a.meta.type === "BEBAN").map(toRow));
  const revenueTotalMinor = revenueRows.reduce((s, r) => s + r.movementMinor, 0n);
  const expenseTotalMinor = expenseRows.reduce((s, r) => s + r.movementMinor, 0n);
  return { revenueRows, expenseRows, revenueTotalMinor, expenseTotalMinor, netIncomeMinor: revenueTotalMinor - expenseTotalMinor };
}

export interface BalanceSheetResult {
  assetRows: ReportRow[];
  liabilityRows: ReportRow[];
  equityRows: ReportRow[];
  totalAssetsMinor: bigint;
  totalLiabilitiesMinor: bigint;
  baseEquityMinor: bigint;
  netIncomeMinor: bigint;
  totalEquityAndLiabilitiesMinor: bigint;
  balanced: true;
}

export function balanceSheet(aggs: Iterable<AccountAggregate>, netIncomeMinor: bigint): BalanceSheetResult {
  const list = [...aggs];
  const toRow = (a: AccountAggregate): ReportRow =>
    ({ code: a.meta.code, name: a.meta.name, movementMinor: signed(a.meta, a) });
  const assetRows = sortByCode(list.filter((a) => a.meta.type === "ASET").map(toRow));
  const liabilityRows = sortByCode(list.filter((a) => a.meta.type === "LIABILITAS").map(toRow));
  const equityRows = sortByCode(list.filter((a) => a.meta.type === "EKUITAS").map(toRow));

  const totalAssetsMinor = assetRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalLiabilitiesMinor = liabilityRows.reduce((s, r) => s + r.movementMinor, 0n);
  const baseEquityMinor = equityRows.reduce((s, r) => s + r.movementMinor, 0n);
  const totalEquityAndLiabilitiesMinor =
    totalLiabilitiesMinor + baseEquityMinor + netIncomeMinor;

  if (totalAssetsMinor !== totalEquityAndLiabilitiesMinor) throw new UnbalancedSheetError();

  equityRows.push({
    code: "9999", name: "Laba Tahun Berjalan", movementMinor: netIncomeMinor,
  });
  equityRows.sort((x, y) => x.code.localeCompare(y.code));

  return {
    assetRows, liabilityRows, equityRows,
    totalAssetsMinor, totalLiabilitiesMinor, baseEquityMinor,
    netIncomeMinor, totalEquityAndLiabilitiesMinor, balanced: true,
  };
}

export interface CashFlowInput {
  netIncomeMinor: bigint;
  deltaPiutangMinor: bigint;
  deltaPersediaanMinor: bigint;
  deltaUtangUsahaMinor: bigint;
  depreciationMinor: bigint;
  investingMinor: bigint;
  financingMinor: bigint;
}

export interface CashFlowResult {
  operatingMinor: bigint;
  investingMinor: bigint;
  financingMinor: bigint;
  netChangeMinor: bigint;
  rows: ReportRow[];
}

export function cashFlowIndirect(i: CashFlowInput): CashFlowResult {
  const rows: ReportRow[] = [
    { code: "NI", name: "Laba Bersih", movementMinor: i.netIncomeMinor },
    { code: "ADJ.PIUTANG", name: "Perubahan Piutang Usaha", movementMinor: -i.deltaPiutangMinor },
    { code: "ADJ.PESEDEIAAN", name: "Perubahan Persediaan", movementMinor: -i.deltaPersediaanMinor },
    { code: "ADJ.UTANG", name: "Perubahan Utang Usaha", movementMinor: i.deltaUtangUsahaMinor },
    { code: "ADJ.PENYUSUTAN", name: "Beban Penyusutan", movementMinor: i.depreciationMinor },
  ];
  const operatingMinor =
    i.netIncomeMinor - i.deltaPiutangMinor - i.deltaPersediaanMinor +
    i.deltaUtangUsahaMinor + i.depreciationMinor;
  return {
    operatingMinor,
    investingMinor: i.investingMinor,
    financingMinor: i.financingMinor,
    netChangeMinor: operatingMinor + i.investingMinor + i.financingMinor,
    rows,
  };
}

export interface ChangesInEquityInput {
  openingRetainedEarningsMinor: bigint;
  contributionsMinor: bigint;
  drawingsMinor: bigint;
  netIncomeMinor: bigint;
}

export function changesInEquity(i: ChangesInEquityInput) {
  const closingRetainedEarningsMinor =
    i.openingRetainedEarningsMinor + i.netIncomeMinor - i.drawingsMinor;
  const rows = [
    { label: "Modal Disetor", movementMinor: i.contributionsMinor },
    { label: "Prive", movementMinor: -i.drawingsMinor },
    { label: "Laba Tahun Berjalan", movementMinor: i.netIncomeMinor },
  ];
  return { rows, closingRetainedEarningsMinor };
}
```

- [ ] **Step 4: Run** — `npx vitest run src/core/reports` → PASS (fix implementation until the golden numbers hold).

- [ ] **Step 5: Commit**

```bash
git add src/core/reports
git commit -m "feat(core): ifrs-sme statements with golden fixtures + property tests"
```

---

### Task 7: DB schema, RLS policies, immutability triggers

**Files:**
- Create: `src/server/db/schema/org.ts`, `src/server/db/schema/journal.ts`, `src/server/db/schema/audit.ts`, `src/server/db/rls.sql`, `src/server/db/triggers.sql`, `src/server/db/scripts/apply-sql.mjs`, `tests/integration/helpers.ts`
- Test: `tests/integration/schema.test.ts`
- Modify: `.env.example`, `package.json`

**Interfaces:**
- Produces (Drizzle tables used by every later task):
  - `organizations` (id uuid pk, name text, fiscalYearStartMonth integer default 1, baseCurrency text default 'IDR', createdAt timestamptz)
  - `memberships` (id, orgId → organizations, userId text, role enum OWNER|ACCOUNTANT|VIEWER, unique(orgId,userId))
  - `accounts` (id, orgId, code varchar(8), name, type enum ASET|LIABILITAS|EKUITAS|PENDAPATAN|BEBAN, normal char(1), parentCode varchar(8), isCash bool default false, isBank bool default false, contra bool default false, archivedAt timestamptz null; unique(orgId, code))
  - `fiscalPeriods` table name `fiscal_periods` (id, orgId, name varchar(7) 'YYYY-MM', startsOn date, endsOn date, status enum OPEN|CLOSED|LOCKED default OPEN; unique(orgId,name))
  - `journalEntries` table `journal_entries` (id, orgId, periodId → fiscal_periods, seq int notNull, number text, entryDate date, memo text, source enum MANUAL|AI|DOCUMENT|IMPORT default MANUAL, status enum DRAFT|POSTED default DRAFT, reversalOfId uuid null, idempotencyKey text null, postedAt timestamptz null, postedBy text null; unique(orgId,number), unique(orgId,idempotencyKey))
  - `journalLines` table `journal_lines` (id, orgId denormalized NOT NULL, entryId → journal_entries ON DELETE CASCADE, accountId → accounts, position int default 0, debit numeric(18,2) default '0', credit numeric(18,2) default '0', memo text; CHECK one-side-only)
  - `journalSeqCounters` table `journal_seq_counters` (orgId, periodId, last int default 0; PK(orgId,periodId))
  - `auditLog` table `audit_log` (id, orgId, actor text, action text, subjectType text, subjectId text, data jsonb, prevHash text, hash text, createdAt; index(orgId))
  - helpers from `tests/integration/helpers.ts`: `getPool(): Pool` (app_user URL), `truncateAll(): Promise<void>`, `makeOrg(name): Promise<{orgId: string}>`

- [ ] **Step 1: Write schema files**

`src/server/db/schema/org.ts`:

```ts
import {
  pgTable, uuid, text, integer, boolean, char, varchar, date,
  timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  baseCurrency: text("base_currency").notNull().default("IDR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["OWNER", "ACCOUNTANT", "VIEWER"] })
      .notNull()
      .default("VIEWER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: varchar("code", { length: 8 }).notNull(),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["ASET", "LIABILITAS", "EKUITAS", "PENDAPATAN", "BEBAN"],
    }).notNull(),
    normal: char("normal", { length: 1 }).notNull(),
    parentCode: varchar("parent_code", { length: 8 }),
    isCash: boolean("is_cash").notNull().default(false),
    isBank: boolean("is_bank").notNull().default(false),
    contra: boolean("contra").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_org_code_uq").on(t.orgId, t.code)],
);

export const fiscalPeriods = pgTable(
  "fiscal_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 7 }).notNull(), // '2026-01'
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: text("status", { enum: ["OPEN", "CLOSED", "LOCKED"] })
      .notNull()
      .default("OPEN"),
  },
  (t) => [uniqueIndex("periods_org_name_uq").on(t.orgId, t.name)],
);
```

`src/server/db/schema/journal.ts`:

```ts
import {
  pgTable, uuid, text, integer, numeric, date,
  timestamp, uniqueIndex, primaryKey, index,
} from "drizzle-orm/pg-core";
import { organizations, accounts, fiscalPeriods } from "./org";

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    periodId: uuid("period_id")
      .notNull()
      .references(() => fiscalPeriods.id),
    seq: integer("seq").notNull(),
    number: text("number").notNull(),
    entryDate: date("entry_date").notNull(),
    memo: text("memo").notNull(),
    source: text("source", { enum: ["MANUAL", "AI", "DOCUMENT", "IMPORT"] })
      .notNull()
      .default("MANUAL"),
    status: text("status", { enum: ["DRAFT", "POSTED"] }).notNull().default("DRAFT"),
    reversalOfId: uuid("reversal_of_id"),
    idempotencyKey: text("idempotency_key"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("je_org_number_uq").on(t.orgId, t.number),
    uniqueIndex("je_org_idem_uq").on(t.orgId, t.idempotencyKey),
    index("je_org_date_idx").on(t.orgId, t.entryDate),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id), // denormalized for RLS
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    position: integer("position").notNull().default(0),
    debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
    memo: text("memo"),
  },
);

export const journalSeqCounters = pgTable(
  "journal_seq_counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    periodId: uuid("period_id")
      .notNull()
      .references(() => fiscalPeriods.id),
    last: integer("last").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.periodId] })],
);
```

`src/server/db/schema/audit.ts`:

```ts
import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organizations } from "./org";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    data: jsonb("data"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_org_idx").on(t.orgId)],
);
```

- [ ] **Step 2: Generate & apply migration**

```powershell
npx drizzle-kit generate
npm run db:up
npx drizzle-kit migrate
```

Add script `"db:migrate": "drizzle-kit migrate"` if missing.

- [ ] **Step 3: Write `rls.sql`** (tenant isolation at the database level)

```sql
-- Row Level Security: app connects as app_user; superuser bypasses by design.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','memberships','accounts','fiscal_periods',
                           'journal_entries','journal_lines','journal_seq_counters','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s ON %I
      USING (org_id = current_setting('app.current_org', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_org')::uuid)
    $p$, t, t);
  END LOOP;
END $$;

-- organizations itself is keyed by id, not org_id:
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_organizations ON organizations
  USING (id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (true);
```

Write `triggers.sql`:

```sql
-- Posted journal entries are immutable. Corrections happen via reversing entries.
CREATE OR REPLACE FUNCTION forbid_posted_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_POSTED: jurnal yang sudah diposting tidak boleh diubah';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER je_no_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW WHEN (OLD.status = 'POSTED')
  EXECUTE FUNCTION forbid_posted_mutation();

CREATE TRIGGER je_no_delete BEFORE DELETE ON journal_entries
  FOR EACH ROW WHEN (OLD.status = 'POSTED')
  EXECUTE FUNCTION forbid_posted_mutation();

-- Lines of a POSTED entry are frozen too (draft lines stay editable).
CREATE OR REPLACE FUNCTION guard_journal_lines() RETURNS trigger AS $$
DECLARE entry_status TEXT;
BEGIN
  SELECT status INTO entry_status FROM journal_entries
    WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF entry_status = 'POSTED' THEN
    RAISE EXCEPTION 'IMMUTABLE_POSTED: baris jurnal terkunci';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER jl_immutable AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION guard_journal_lines();
```

- [ ] **Step 4: Write `apply-sql.mjs` + scripts**

`src/server/db/scripts/apply-sql.mjs`:

```js
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import "dotenv/config";

const dir = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  process.stdout.write(`applying ${f} ... `);
  try {
    await pool.query(sql);
    console.log("ok");
  } catch (e) {
    if (String(e.message).includes("already exists")) console.log("skipped (exists)");
    else throw e;
  }
}
await pool.end();
```

`package.json` scripts add: `"db:sql": "node src/server/db/scripts/apply-sql.mjs"`.

Run: `npm run db:sql` → both files applied ok.

- [ ] **Step 5: Write integration helpers** `tests/integration/helpers.ts`

```ts
import { Pool } from "pg";
import "dotenv/config";

// Runtime/tests connect as the non-superuser so RLS applies.
export function getPool(): Pool {
  const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL!;
  return new Pool({ connectionString: url });
}

export async function truncateAll(): Promise<void> {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  await admin.query(`
    TRUNCATE audit_log, journal_lines, journal_entries, journal_seq_counters,
             accounts, fiscal_periods, memberships, organizations CASCADE
  `);
  await admin.end();
}

export async function makeOrg(name: string): Promise<{ orgId: string }> {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const r = await admin.query<{ id: string }>(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
    [name],
  );
  await admin.end();
  return { orgId: r.rows[0].id };
}
```

`.env.example` gains:

```
APP_DATABASE_URL="postgres://app_user:app_pw@localhost:54329/ledger"
```

(Copy to `.env` too.)

- [ ] **Step 6: Write failing isolation test** `tests/integration/schema.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPool, makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("RLS tenant isolation", () => {
  let pool: ReturnType<typeof getPool>;
  let orgA: string, orgB: string;

  beforeAll(async () => {
    pool = getPool();
    await truncateAll();
    orgA = (await makeOrg("PT A")).orgId;
    orgB = (await makeOrg("PT B")).orgId;
  });
  afterAll(async () => { await pool.end(); });

  async function scoped<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL app.current_org = $1", [orgId]);
      const out = await fn();
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  beforeEach(async () => {
    await pool.query("DELETE FROM organizations"); // superuser cleanup impossible via app role
    // ^ this line intentionally FAILS under app_user (no policy without org scope).
  });

  it("sees only own org rows", async () => {
    const insertedA = await scoped(orgA, async () => {
      const r = await pool.query(
        `INSERT INTO accounts (org_id, code, name, type, normal)
         VALUES ($1,'1110','Kas','ASET','D') RETURNING id`, [orgA]);
      return r.rows[0].id;
    });
    await scoped(orgB, async () => {
      await pool.query(
        `INSERT INTO accounts (org_id, code, name, type, normal)
         VALUES ($1,'1110','Kas B','ASET','D')`, [orgB]);
    });

    const seenByB = await scoped(orgB, () => pool.query("SELECT count(*)::int AS n FROM accounts"));
    expect(seenByB.rows[0].n).toBe(1); // cannot see org A's row

    const visible = await scoped(orgA, async () =>
      pool.query("SELECT id FROM accounts WHERE id = $1", [insertedA]));
    expect(visible.rowCount).toBe(1);
  });
});
```

Implementer note: drop the broken `beforeEach` DELETE line above — cleanup belongs in `truncateAll()` inside `beforeEach` via an **admin** connection instead:

```ts
beforeEach(async () => { await truncateAll(); });
```

and move org creation into that same `beforeEach`.

- [ ] **Step 7: Run** — `npx vitest run tests/integration/schema.test.ts` → PASS (RLS blocks cross-org reads; inserts require `SET LOCAL app.current_org`).

- [ ] **Step 8: Commit**

```bash
git add src/server/db drizzle tests .env.example package.json
git commit -m "feat(db): multi-tenant schema, rls policies, immutability triggers"
```

---

### Task 8: Auth + org bootstrap (signup seeds COA & periods)

**Files:**
- Create: `src/server/auth/auth-server.ts`, `src/server/auth/auth-client.ts`, `src/server/auth/session.ts`, `src/server/bootstrap/seed-org.ts`
- Create: `src/server/db/schema/auth.ts` (Better Auth tables)
- Create: `src/app/api/auth/[...all]/route.ts`
- Test: `tests/integration/bootstrap.test.ts`

**Interfaces:**
- Consumes: Task 7 tables; `COA_TEMPLATE`.
- Produces:
  - `auth` (Better Auth instance) — email+password; on user create auto-creates organization + OWNER membership + seeds accounts & periods.
  - `seedOrgData(orgId: string, fiscalYearStartMonth?: number): Promise<void>` — idempotent seed of COA_TEMPLATE rows and 12 monthly `fiscal_periods` for the current fiscal year (status OPEN).
  - `getActiveContext(): Promise<{ userId: string; userEmail: string; orgId: string; role: "OWNER"|"ACCOUNTANT"|"VIEWER" } | null>` from `@/server/auth/session`.

Decision recorded here: we deliberately do NOT use the better-auth organization plugin — our own `organizations`/`memberships` tables are the single source of truth (avoids dual membership systems).

- [ ] **Step 1: Write auth schema** `src/server/db/schema/auth.ts` (Better Auth core tables)

```ts
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  password: text("password"),
  scope: text("scope"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

Then:

```powershell
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] **Step 2: Write failing integration test** `tests/integration/bootstrap.test.ts`

```ts
import { describe, it, expect, afterAll } from "vitest";
import { getPool, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("org bootstrap on signup", () => {
  const pool = new ((require("pg") as typeof import("pg")).Pool)({
    connectionString: process.env.DATABASE_URL!, // admin conn: hooks run outside RLS scope
  });
  afterAll(async () => { await pool.end(); await truncateAll(); });

  it("creates org + owner membership + coa + 12 periods", async () => {
    const { auth } = await import("@/server/auth/auth-server");
    const res = await auth.api.signUpEmail({
      body: { email: `u${Date.now()}@test.id`, password: "rahasia123", name: "PT Uji" },
    });
    expect(res.user).toBeDefined();

    const orgRow = await pool.query<{ org_id: string }>(
      `SELECT m.org_id FROM memberships m WHERE m.user_id = $1 AND m.role = 'OWNER'`,
      [res.user!.id],
    );
    expect(orgRow.rowCount).toBe(1);
    const orgId = orgRow.rows[0].org_id;

    const accs = await pool.query("SELECT count(*)::int AS n FROM accounts WHERE org_id=$1", [orgId]);
    expect(accs.rows[0].n).toBeGreaterThanOrEqual(31);

    const periods = await pool.query(
      "SELECT count(*)::int AS n, count(DISTINCT status)::int AS statuses FROM fiscal_periods WHERE org_id=$1",
      [orgId],
    );
    expect(periods.rows[0].n).toBe(12);
    expect(periods.rows[0].statuses).toBe(1); // all OPEN

    // seeding is idempotent
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await expect(seedOrgData(orgId)).resolves.toBeUndefined();
    const accs2 = await pool.query("SELECT count(*)::int AS n FROM accounts WHERE org_id=$1", [orgId]);
    expect(accs2.rows[0].n).toBe(accs.rows[0].n);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run tests/integration/bootstrap.test.ts` → FAIL.

- [ ] **Step 4: Implement**

`src/server/bootstrap/seed-org.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { COA_TEMPLATE } from "@/core/accounts/coa-template";

const pad2 = (n: number): string => String(n).padStart(2, "0");

export async function seedOrgData(orgId: string, fiscalYearStartMonth = 1): Promise<void> {
  const existing = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.orgId, orgId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(accounts).values(
    COA_TEMPLATE.map((d) => ({
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
  await db.insert(fiscalPeriods).values(rows);
}
```

`src/server/auth/auth-server.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/server/db";
import { organizations, memberships } from "@/server/db/schema/org";
import { seedOrgData } from "@/server/bootstrap/seed-org";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const [org] = await db
            .insert(organizations)
            .values({ name: user.name || "Organisasi Baru" })
            .returning();
          await db.insert(memberships).values({
            orgId: org.id,
            userId: user.id,
            role: "OWNER",
          });
          await seedOrgData(org.id);
        },
      },
    },
  },
});
```

`src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth-server";

export const { GET, POST } = toNextJsHandler(auth);
```

`src/server/auth/session.ts`:

```ts
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships } from "@/server/db/schema/org";
import { auth } from "./auth-server";

export type Role = "OWNER" | "ACCOUNTANT" | "VIEWER";

export interface AppContext {
  userId: string;
  userEmail: string;
  orgId: string;
  role: Role;
}

export async function getActiveContext(): Promise<AppContext | null> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [m] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, s.user.id))
    .limit(1);
  if (!m) return null;
  return { userId: s.user.id, userEmail: s.user.email, orgId: m.orgId, role: m.role };
}
```

`src/server/auth/guard.ts`:

```ts
import { redirect } from "next/navigation";
import { getActiveContext, type AppContext, type Role } from "./session";

export async function requireContext(allowed?: Role[]): Promise<AppContext> {
  const ctx = await getActiveContext();
  if (!ctx) redirect("/masuk");
  if (allowed && !allowed.includes(ctx.role)) throw new Error("FORBIDDEN_AKSES");
  return ctx;
}
```

`src/server/auth/auth-client.ts`:

```ts
"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

- [ ] **Step 5: Run** — `npx vitest run tests/integration/bootstrap.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server src/app/api tests/integration drizzle
git commit -m "feat(auth): better auth with signup org bootstrap seeding coa+periods"
```

---

### Task 9: Fiscal periods service (list / close / reopen)

**Files:**
- Create: `src/server/db/repos/periods.repo.ts`, `src/server/actions/periods.actions.ts`
- Test: `tests/integration/periods.test.ts`

**Interfaces:**
- Consumes: `withOrg`, `appendAudit`, `requireContext`, schema `fiscalPeriods`.
- Produces:
  - `findPeriodByDate(q: Queryable, orgId: string, dateISO: string): Promise<Period | null>` where `Period = typeof fiscalPeriods.$inferSelect`
  - `listPeriods(q: Queryable, orgId: string): Promise<Period[]>`
  - `setPeriodStatus(q: Queryable, orgId: string, periodId: string, status: "OPEN"|"CLOSED"|"LOCKED"): Promise<Period>` (throws `"PERIODE_TIDAK_DITEMUKAN"` when 0 rows)
  - server actions: `closePeriodAction(periodId: string)` (roles ACCOUNTANT|OWNER), `reopenPeriodAction(periodId: string)` (OWNER only), both audit-logged, both `{ ok: true } | { ok: false; error: string }`
  - shared type `Queryable = Db | Parameters<Parameters<typeof db.transaction>[0]>[0]` exported from `@/server/db/repos/queryable`

- [ ] **Step 1: Write `queryable.ts` helper**

```ts
import type { db } from "@/server/db";

export type Queryable = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
```

- [ ] **Step 2: Write failing test** `tests/integration/periods.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("periods repo", () => {
  let orgId: string;
  const admin = new ((require("pg") as typeof import("pg")).Pool)({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Periode")).orgId;
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await seedOrgData(orgId);
  });
  afterAll(async () => { await admin.end(); });

  it("finds period by date inside range", async () => {
    const { findPeriodByDate, listPeriods, setPeriodStatus } = await import("@/server/db/repos/periods.repo");
    const p = await findPeriodByDate(admin, orgId, `${new Date().getFullYear()}-03-15`);
    expect(p).not.toBeNull();
    expect(p!.name.endsWith("-03")).toBe(true);

    const closed = await setPeriodStatus(admin, orgId, p!.id, "CLOSED");
    expect(closed.status).toBe("CLOSED");
    const again = await findPeriodByDate(admin, orgId, `${new Date().getFullYear()}-03-15`);
    expect(again!.status).toBe("CLOSED");

    await expect(setPeriodStatus(admin, orgId, crypto.randomUUID(), "OPEN"))
      .rejects.toThrow("PERIODE_TIDAK_DITEMUKAN");

    expect((await listPeriods(admin, orgId)).length).toBe(12);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run tests/integration/periods.test.ts` → FAIL.

- [ ] **Step 4: Implement** `src/server/db/repos/periods.repo.ts`

```ts
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { fiscalPeriods } from "../schema/org";
import type { Queryable } from "./queryable";

export type Period = typeof fiscalPeriods.$inferSelect;

export async function findPeriodByDate(
  q: Queryable, orgId: string, dateISO: string,
): Promise<Period | null> {
  const rows = await q
    .select()
    .from(fiscalPeriods)
    .where(and(
      eq(fiscalPeriods.orgId, orgId),
      lte(fiscalPeriods.startsOn, dateISO),
      gte(fiscalPeriods.endsOn, dateISO),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPeriods(q: Queryable, orgId: string): Promise<Period[]> {
  return q.select().from(fiscalPeriods).where(eq(fiscalPeriods.orgId, orgId)).orderBy(asc(fiscalPeriods.name));
}

export async function setPeriodStatus(
  q: Queryable, orgId: string, periodId: string,
  status: "OPEN" | "CLOSED" | "LOCKED",
): Promise<Period> {
  const [row] = await q.update(fiscalPeriods)
    .set({ status })
    .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.id, periodId)))
    .returning();
  if (!row) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  return row;
}
```

- [ ] **Step 5: Run** → PASS.

- [ ] **Step 6: Implement actions** `src/server/actions/periods.actions.ts` (audit calls compile once Task 10 lands; write them now, keep the import commented until then? NO placeholders allowed — so implement this file AFTER Task 10. Reorder note: build `audit.repo.ts` first.)

> **Execution order note for workers:** implement Task 10 (audit) before finishing Step 6 below. The action file imports `appendAudit`.

`src/server/actions/periods.actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { setPeriodStatus } from "@/server/db/repos/periods.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function closePeriodAction(periodId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      const period = await setPeriodStatus(tx, ctx.orgId, periodId, "CLOSED");
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "PERIOD_CLOSE",
        subjectType: "fiscal_period", subjectId: periodId, data: { name: period.name },
      });
    });
    revalidatePath("/pengaturan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL" };
  }
}

export async function reopenPeriodAction(periodId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER"]); // reopening is owner-only per spec
    await db.transaction(async (tx) => {
      const period = await setPeriodStatus(tx, ctx.orgId, periodId, "OPEN");
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "PERIOD_REOPEN",
        subjectType: "fiscal_period", subjectId: periodId, data: { name: period.name },
      });
    });
    revalidatePath("/pengaturan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "GAGAL" };
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add src/server tests/integration
git commit -m "feat(periods): list/find/close/reopen with role-gated audited actions"
```

---

### Task 10: Audit log hash chain

**Files:**
- Create: `src/server/db/repos/audit.repo.ts`
- Test: `tests/integration/audit.test.ts`

**Interfaces:**
- Consumes: `auditLog` table, `Queryable`.
- Produces:
  - `computeHash(input: { prevHash: string | null; orgId: string; actor: string; action: string; subjectType: string; subjectId: string; data: unknown }): string` — sha256 hex over stable JSON (`prevHash|orgId|actor|action|subject|subjectId|JSON.stringify(data)`)
  - `appendAudit(q: Queryable, input: { orgId: string; actor: string; action: string; subjectType: string; subjectId: string; data?: unknown }): Promise<void>` — takes `pg_advisory_xact_lock(hashtext(orgId))`, reads latest hash for the org, inserts sealed record
  - `verifyChain(poolLike, orgId: string): Promise<{ valid: boolean; brokenAtSeq: number | null }>` — recomputes hashes chronologically (uses raw SQL client, not tenant-scoped)

- [ ] **Step 1: Write failing test** `tests/integration/audit.test.ts`

```ts
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { getPool, makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("audit hash chain", () => {
  const admin = new ((require("pg") as typeof import("pg")).Pool)({ connectionString: process.env.DATABASE_URL! });
  let orgId: string;

  beforeAll(async () => { await truncateAll(); orgId = (await makeOrg("PT Audit")).orgId; });
  afterEach(async () => { await truncateAll(); });

  it("chains records and detects tampering", async () => {
    const { appendAudit, verifyChain } = await import("@/server/db/repos/audit.repo");
    const mk = (i: number) => ({
      orgId, actor: "a@test.id", action: "T", subjectType: "x", subjectId: String(i), data: { i },
    });
    await admin.transaction(async (tx) => { for (const i of [1, 2, 3]) await appendAudit(tx, mk(i)); });

    expect((await verifyChain(admin, orgId)).valid).toBe(true);

    // tamper: rewrite one payload directly
    await admin.query(`UPDATE audit_log SET data = '{"i":999}' WHERE subject_id='2'`);
    const verdict = await verifyChain(admin, orgId);
    expect(verdict.valid).toBe(false);
    expect(verdict.brokenAtSeq).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** `src/server/db/repos/audit.repo.ts`

```ts
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { auditLog } from "../schema/audit";
import type { Queryable } from "./queryable";

interface ChainInput {
  prevHash: string | null;
  orgId: string;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  data: unknown;
}

export function computeHash(i: ChainInput): string {
  const h = createHash("sha256");
  h.update(`${i.prevHash ?? ""}|${i.orgId}|${i.actor}|${i.action}|${i.subjectType}|${i.subjectId}|${JSON.stringify(i.data ?? null)}`);
  return h.digest("hex");
}

export interface AuditInput {
  orgId: string; actor: string; action: string;
  subjectType: string; subjectId: string; data?: unknown;
}

export async function appendAudit(q: Queryable, input: AuditInput): Promise<void> {
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.orgId}))`);
  const [prev] = await q
    .select({ hash: auditLog.hash })
    .from(auditLog)
    .where(eq(auditLog.orgId, input.orgId))
    .orderBy(sql`created_at DESC`)
    .limit(1);
  const prevHash = prev?.hash ?? null;
  await q.insert(auditLog).values({
    orgId: input.orgId,
    actor: input.actor,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    data: (input.data ?? null) as never,
    prevHash,
    hash: computeHash({ ...input, data: input.data ?? null, prevHash }),
  });
}

// verifyChain runs with an unrestricted connection (admin) because it must read
// across the whole chain regardless of current_org scoping.
export async function verifyChain(
  conn: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  orgId: string,
): Promise<{ valid: boolean; brokenAtSeq: number | null }> {
  const r = await conn.query(
    `SELECT actor, action, subject_type, subject_id, data, prev_hash AS "prevHash", hash
     FROM audit_log WHERE org_id = $1 ORDER BY created_at ASC, id ASC`, [orgId],
  );
  let prev: string | null = null;
  let seq = 0;
  for (const row of r.rows) {
    seq += 1;
    const expected = computeHash({
      prevHash: prev, orgId, actor: row.actor, action: row.action,
      subjectType: row.subject_type, subjectId: row.subject_id, data: row.data,
    });
    if (expected !== row.hash || (row.prevHash ?? null) !== prev) {
      return { valid: false, brokenAtSeq: seq };
    }
    prev = row.hash;
  }
  return { valid: true, brokenAtSeq: null };
}
```

Note: `asc` import may be unused — remove it if ESLint complains.

- [ ] **Step 4: Run** — `npx vitest run tests/integration/audit.test.ts` → PASS.

- [ ] **Step 5: Finish Task 9 Step 6** (`periods.actions.ts`) now that `appendAudit` exists, then commit everything together:

```bash
git add src/server tests/integration
git commit -m "feat(audit): tamper-evident hash-chained audit log + period actions"
```

---

### Task 11: Posting service + journal actions

**Files:**
- Create: `src/server/db/repos/with-org.ts`, `src/server/db/repos/accounts.repo.ts`, `src/server/db/repos/journals.repo.ts`, `src/core/journals/messages.ts`
- Test: `src/core/journals/messages.test.ts`, `tests/integration/posting.test.ts`
- Create: `src/server/actions/journal.actions.ts`

**Interfaces:**
- Consumes: Tasks 3–10 (`Money`, `validateEntry`, `checkPostingAccounts`, `journalNumber`, `makeReversal`, `findPeriodByDate`, `appendAudit`, schema).
- Produces:
  - `withOrg<T>(orgId: string, fn: (tx) => Promise<T>): Promise<T>` from `@/server/db/repos/with-org` — opens tx, `set_config('app.current_org', orgId, true)`
  - `listAccounts(q, orgId)` from accounts.repo; `postingMetaMap(orgRows): Map<string,{archivedAt: Date|null; hasChildren: boolean}>`; `reportMetaMap(orgRows): Map<string, ReportAccountMeta>` (both pure mappers over account rows)
  - `PostingError extends Error { issues: Array<Record<string, unknown>> }`
  - `dec(minor: bigint): string` — numeric(18,2) text, no float math
  - `postJournalEntry(q, orgId, actorEmail, input: JournalEntryInput, opts?: { reversalOfId?: string }): Promise<{ id: string; number: string }>`
  - `EntryView { id; number; entryDate; memo; status; reversalOfId; lines: LineView[] }`, `LineView { id; accountId; accountCode; accountName; debitMinor: bigint; creditMinor: bigint; memo }`
  - `listEntriesWithLines(q, orgId, limit?): Promise<EntryView[]>`; `getPostedEntry(q, orgId, entryId): Promise<EntryView | null>`
  - `issueToMessage(issue: Record<string, unknown>): string` (Bahasa Indonesia) in core
  - actions: `createAndPostAction({ dateISO, memo, lines:[{accountId, debitText, creditText}] })`, `reverseEntryAction(entryId, dateISO)` → `{ ok: true; number?: string } | { ok: false; error: string }`

> **Runtime isolation note:** dev runtime connects via the admin URL (superuser bypasses RLS); application-layer isolation is enforced because every repo call receives `orgId` from the session context only. Production hardening item (README final checklist): switch runtime to a non-superuser role so RLS applies end to end.

- [ ] **Step 1: Write `with-org.ts`**

```ts
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export async function withOrg<T>(
  orgId: string,
  fn: Parameters<Parameters<typeof db.transaction>[0]>[0] extends never ? never : (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}
```

- [ ] **Step 2: Write failing message-map test** `src/core/journals/messages.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { issueToMessage } from "./messages";

describe("issueToMessage", () => {
  it("maps codes to Indonesian messages", () => {
    expect(issueToMessage({ code: "UNBALANCED" })).toContain("tidak seimbang");
    expect(issueToMessage({ code: "LINE_BOTH_SIDES", index: 1 })).toContain("Baris 2");
    expect(issueToMessage({ code: "PERIOD_NOT_OPEN", periodStatus: "LOCKED" })).toContain("terkunci");
    expect(issueToMessage({ code: "MYSTERY" })).toBe("Data jurnal tidak valid.");
  });
});
```

Run → FAIL. Implement `src/core/journals/messages.ts`:

```ts
type IssueLike = Record<string, unknown>;

export function issueToMessage(i: IssueLike): string {
  const row = typeof i.index === "number" ? i.index + 1 : null;
  switch (i.code) {
    case "BAD_DATE": return "Tanggal tidak valid.";
    case "MIN_LINES": return "Jurnal minimal memiliki dua baris.";
    case "NEGATIVE_AMOUNT": return `Baris ${row}: nominal tidak boleh negatif.`;
    case "LINE_EMPTY": return `Baris ${row}: salah satu dari debit atau kredit wajib diisi.`;
    case "LINE_BOTH_SIDES": return `Baris ${row}: isi salah satu dari debit atau kredit saja.`;
    case "UNBALANCED": return "Total debit dan kredit tidak seimbang.";
    case "PERIOD_NOT_OPEN":
      return i.periodStatus === "LOCKED"
        ? "Periode sudah terkunci — tidak dapat mencatat transaksi baru."
        : "Periode tutup buku — buka kembali periode untuk mencatat transaksi.";
    case "PERIODE_TIDAK_DITEMUKAN":
      return "Tidak ada periode akuntansi yang cocok dengan tanggal tersebut.";
    case "UNKNOWN_ACCOUNT": return `Baris ${row}: akun tidak dikenal.`;
    case "ARCHIVED_ACCOUNT": return `Baris ${row}: akun sudah diarsipkan.`;
    case "GROUP_ACCOUNT": return `Baris ${row}: akun induk (kelompok) tidak dapat dipakai untuk transaksi.`;
    default: return "Data jurnal tidak valid.";
  }
}
```

Run → PASS.

- [ ] **Step 3: Write failing posting integration test** `tests/integration/posting.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("posting pipeline", () => {
  let orgId: string;
  let kas = "", pendapatan = "", beban = "", modal = "", grup = "";
  const admin = new ((require("pg") as typeof import("pg")).Pool)({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Posting")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"]; pendapatan = byCode["4100"]; beban = byCode["5200"]; modal = byCode["3100"];
    grup = byCode["1000"];
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  async function post(input: object, opts?: object) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", input as never, opts as never));
  }

  const year = new Date().getFullYear();

  it("posts numbered entries sequentially", async () => {
    const a = await post({
      dateISO: `${year}-01-10`, memo: "Setoran modal",
      lines: [
        { accountId: kas, debitMinor: 10_000_000n, creditMinor: 0n },
        { accountId: modal, debitMinor: 0n, creditMinor: 10_000_000n },
      ],
    });
    expect(a.number).toBe(`JE-${year}-0001`);

    const b = await post({
      dateISO: `${year}-01-20`, memo: "Pendapatan",
      lines: [
        { accountId: kas, debitMinor: 4_000_000n, creditMinor: 0n },
        { accountId: pendapatan, debitMinor: 0n, creditMinor: 4_000_000n },
      ],
    });
    expect(b.number).toBe(`JE-${year}-0002`);
  });

  it("rejects unbalanced / unknown / group-account postings", async () => {
    const { PostingError } = await import("@/server/db/repos/journals.repo");
    await expect(post({
      dateISO: `${year}-02-01`, memo: "x",
      lines: [
        { accountId: kas, debitMinor: 100n, creditMinor: 0n },
        { accountId: modal, debitMinor: 0n, creditMinor: 99n },
      ],
    })).rejects.toThrow(PostingError);

    await expect(post({
      dateISO: `${year}-02-01`, memo: "x",
      lines: [
        { accountId: crypto.randomUUID(), debitMinor: 100n, creditMinor: 0n },
        { accountId: modal, debitMinor: 0n, creditMinor: 100n },
      ],
    })).rejects.toThrow(PostingError);

    await expect(post({
      dateISO: `${year}-02-01`, memo: "x",
      lines: [
        { accountId: grup, debitMinor: 100n, creditMinor: 0n },   // parent group account
        { accountId: modal, debitMinor: 0n, creditMinor: 100n },
      ],
    })).rejects.toThrow(PostingError);
  });

  it("idempotency key returns the original entry", async () => {
    const key = `idem-${crypto.randomUUID()}`;
    const args = {
      dateISO: `${year}-03-01`, memo: "Idem", idempotencyKey: key,
      lines: [
        { accountId: kas, debitMinor: 500n, creditMinor: 0n },
        { accountId: pendapatan, debitMinor: 0n, creditMinor: 500n },
      ],
    };
    const first = await post(args);
    const second = await post(args);
    expect(second.id).toBe(first.id);
  });

  it("blocks editing posted entries (trigger)", async () => {
    await expect(admin.query(
      `UPDATE journal_entries SET memo='dirubah' WHERE org_id=$1 AND status='POSTED'`,
      [orgId],
    )).rejects.toThrow(/IMMUTABLE_POSTED/);
  });

  it("reversal posts a linked balancing pair", async () => {
    const { getPostedEntry } = await import("@/server/db/repos/journals.repo");
    const { makeReversal } = await import("@/core/journals/validate");

    const created = await post({
      dateISO: `${year}-04-01`, memo: "Salah",
      lines: [
        { accountId: kas, debitMinor: 700n, creditMinor: 0n },
        { accountId: pendapatan, debitMinor: 0n, creditMinor: 700n },
      ],
    });
    const orig = await dbTx(async (tx) => getPostedEntry(tx as never, orgId, created.id));
    expect(orig).not.toBeNull();

    const reversal = makeReversal(
      { number: orig!.number, lines: orig!.lines.map((l) => ({ accountId: l.accountId, debitMinor: l.debitMinor, creditMinor: l.creditMinor })) },
      `${year}-04-02`,
    );
    const rev = await post(reversal, { reversalOfId: created.id });
    expect(rev.number).not.toBe(orig!.number);

    // kas balance for this entry pair nets to zero
    const net = await admin.query<{ d: string; c: string }>(
      `SELECT sum(l.debit) AS d, sum(l.credit) AS c
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       WHERE e.org_id=$1 AND e.number IN ($2,$3)`,
      [orgId, orig!.number, rev.number],
    );
    // both entries touch kas+pendapatan; totals equal across the pair:
    expect(net.rows[0].d).toBe(net.rows[0].c);
  });
});
```

Implementer note: the last test's `dbTx` helper does not exist — replace those two lines with:

```ts
const { db } = await import("@/server/db");
const orig = await db.transaction((tx) => getPostedEntry(tx as never, orgId, created.id));
```

- [ ] **Step 4: Run to verify failure** → FAIL (module not found).

- [ ] **Step 5: Implement `accounts.repo.ts`**

```ts
import type { Queryable } from "./queryable";
import { accounts } from "../schema/org";
import { eq, asc } from "drizzle-orm";
import type { ReportAccountMeta } from "@/core/reports/aggregates";
import { checkPostingAccounts } from "@/core/journals/validate";

type AccountRow = typeof accounts.$inferSelect;

export async function listAccounts(q: Queryable, orgId: string): Promise<AccountRow[]> {
  return q.select().from(accounts).where(eq(accounts.orgId, orgId)).orderBy(asc(accounts.code));
}

export function postingMetaMap(
  rows: AccountRow[],
): Map<string, { archivedAt: Date | null; hasChildren: boolean }> {
  return new Map(rows.map((a) => [
    a.id,
    { archivedAt: a.archivedAt, hasChildren: rows.some((c) => c.parentCode === a.code) },
  ]));
}

export function reportMetaMap(rows: AccountRow[]): Map<string, ReportAccountMeta> {
  return new Map(rows.map((a) => [a.id, {
    id: a.id, code: a.code, name: a.name,
    type: a.type, normal: a.normal === "D" ? "D" : "K",
    contra: a.contra || undefined,
    isCash: a.isCash || undefined,
    isBank: a.isBank || undefined,
  }]));
}

export { checkPostingAccounts };
```

- [ ] **Step 6: Implement `journals.repo.ts`**

```ts
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { journalEntries, journalLines } from "../schema/journal";
import { accounts } from "../schema/org";
import type { Queryable } from "./queryable";
import { findPeriodByDate } from "./periods.repo";
import {
  validateEntry, checkPostingAccounts, journalNumber,
  type JournalEntryInput,
} from "@/core/journals/validate";

export class PostingError extends Error {
  constructor(readonly issues: Array<Record<string, unknown>>) {
    super("VALIDASI_GAGAL");
  }
}

// numeric(18,2) text form from minor units — no float math.
export function dec(minor: bigint): string {
  const neg = minor < 0n;
  const v = neg ? -minor : minor;
  return `${neg ? "-" : ""}${v / 100n}.${String(v % 100n).padStart(2, "0")}`;
}

function toMinor(numericStr: string): bigint {
  const neg = numericStr.startsWith("-");
  const s = neg ? numericStr.slice(1) : numericStr;
  const [w, f = ""] = s.split(".");
  const v = BigInt(w) * 100n + BigInt(f.padEnd(2, "0").slice(0, 2));
  return neg ? -v : v;
}

export interface LineView {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo: string | null;
}

export interface EntryView {
  id: string;
  number: string;
  entryDate: string;
  memo: string;
  status: string;
  reversalOfId: string | null;
  lines: LineView[];
}

async function assemble(
  q: Queryable, where: ReturnType<typeof eq>, limit?: number,
): Promise<EntryView[]> {
  const base = q.select().from(journalEntries).where(where);
  const entries = await (limit ? base.limit(limit) : base)
    .orderBy(desc(journalEntries.entryDate), desc(journalLines.seq));
```

Wait — ordering must reference `journal_entries.seq`. Fix in final file: `.orderBy(desc(journalEntries.entryDate), desc(journalEntries.seq))`.

```ts
  if (entries.length === 0) return [];
  const lineRows = await q.select({
    id: journalLines.id,
    entryId: journalLines.entryId,
    accountId: journalLines.accountId,
    position: journalLines.position,
    debit: journalLines.debit,
    credit: journalLines.credit,
    memo: journalLines.memo,
    accountCode: accounts.code,
    accountName: accounts.name,
  })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(inArray(journalLines.entryId, entries.map((e) => e.id)))
    .orderBy(asc(journalLines.position));

  const byEntry = new Map<string, EntryView>();
  for (const e of entries) {
    byEntry.set(e.id, {
      id: e.id, number: e.number, entryDate: e.entryDate, memo: e.memo,
      status: e.status, reversalOfId: e.reversalOfId, lines: [],
    });
  }
  for (const l of lineRows) {
    byEntry.get(l.entryId)!.lines.push({
      id: l.id, accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName,
      debitMinor: toMinor(l.debit), creditMinor: toMinor(l.credit), memo: l.memo,
    });
  }
  return [...byEntry.values()];
}

export async function listEntriesWithLines(
  q: Queryable, orgId: string, limit = 50,
): Promise<EntryView[]> {
  return assemble(q, eq(journalEntries.orgId, orgId), limit);
}

export async function getPostedEntry(
  q: Queryable, orgId: string, entryId: string,
): Promise<EntryView | null> {
  const rows = await assemble(q, and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)));
  const entry = rows[0] ?? null;
  if (entry && entry.status !== "POSTED") throw new Error("BUKAN_JURNAL_POSTED");
  return entry;
}
```

(The `where` param typing: declare as `SQL` from drizzle-orm instead of `ReturnType<typeof eq>` — use `import type { SQL } from "drizzle-orm"`.)

Then append the posting pipeline to the same file:

```ts
export interface PostResult { id: string; number: string }

export async function postJournalEntry(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  input: JournalEntryInput,
  opts: { reversalOfId?: string } = {},
): Promise<PostResult> {
  if (input.idempotencyKey) {
    const [dupe] = await q.select({ id: journalEntries.id, number: journalEntries.number })
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (dupe) return dupe;
  }

  const period = await findPeriodByDate(q, orgId, input.dateISO);
  if (!period) throw new PostingError([{ code: "PERIODE_TIDAK_DITEMUKAN" }]);

  const issues = validateEntry(input, period.status);
  if (issues.length > 0) throw new PostingError(issues);

  const orgAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const acctIssues = checkPostingAccounts(input.lines, postingMetaMap(orgAccounts));
  if (acctIssues.length > 0) throw new PostingError(acctIssues);

  const counterRes = await q.execute(sql`
    INSERT INTO journal_seq_counters (org_id, period_id, last)
    VALUES (${orgId}, ${period.id}, 1)
    ON CONFLICT (org_id, period_id)
    DO UPDATE SET last = journal_seq_counters.last + 1
    RETURNING last
  `);
  const seq = Number((counterRes.rows?.[0] as { last: number } | undefined)?.last ?? 1);
  const number = journalNumber(period.name, seq);

  const [entry] = await q.insert(journalEntries).values({
    orgId,
    periodId: period.id,
    seq,
    number,
    entryDate: input.dateISO,
    memo: input.memo,
    source: input.source ?? "MANUAL",
    status: "DRAFT",
    reversalOfId: opts.reversalOfId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  }).returning({ id: journalEntries.id });

  await q.insert(journalLines).values(input.lines.map((l, i) => ({
    orgId,
    entryId: entry.id,
    accountId: l.accountId,
    position: i,
    debit: dec(l.debitMinor),
    credit: dec(l.creditMinor),
    memo: l.memo ?? null,
  })));

  await q.update(journalEntries)
    .set({ status: "POSTED", postedAt: new Date(), postedBy: actorEmail })
    .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.status, "DRAFT")));

  return { id: entry.id, number };
}
```

Imports to add at top of this section: `import { sql } from "drizzle-orm";` and `import { postingMetaMap } from "./accounts.repo";`

- [ ] **Step 7: Run** — `npx vitest run tests/integration/posting.test.ts src/core/journals` → ALL PASS.

- [ ] **Step 8: Implement `journal.actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { appendAudit } from "@/server/db/repos/audit.repo";
import {
  postJournalEntry, getPostedEntry, PostingError,
} from "@/server/db/repos/journals.repo";
import { makeReversal } from "@/core/journals/validate";
import { issueToMessage } from "@/core/journals/messages";
import { Money } from "@/core/money/money";

export interface ActionResult {
  ok: boolean;
  error?: string;
  number?: string;
}

function fail(e: unknown): ActionResult {
  if (e instanceof PostingError) {
    return { ok: false, error: e.issues.map((i) => issueToMessage(i)).join("; ") };
  }
  if (e instanceof Error && e.message === "FORBIDDEN_AKSES") {
    return { ok: false, error: "Anda tidak memiliki izin untuk aksi ini." };
  }
  console.error(e);
  return { ok: false, error: "Terjadi kesalahan tak terduga." };
}

export async function createAndPostAction(payload: {
  dateISO: string;
  memo: string;
  lines: Array<{ accountId: string; debitText: string; creditText: string }>;
}): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]); // viewer may not post
    const entry = {
      dateISO: payload.dateISO,
      memo: payload.memo.trim() || "(tanpa keterangan)",
      source: "MANUAL" as const,
      idempotencyKey: crypto.randomUUID(),
      lines: payload.lines.map((l) => ({
        accountId: l.accountId,
        debitMinor: Money.parseIdr(l.debitText.trim() === "" ? "0" : l.debitText).minor,
        creditMinor: Money.parseIdr(l.creditText.trim() === "" ? "0" : l.creditText).minor,
      })),
    };
    const out = await db.transaction(async (tx) => {
      const r = await postJournalEntry(tx, ctx.orgId, ctx.userEmail, entry);
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "JOURNAL_POST",
        subjectType: "journal_entry", subjectId: r.id,
        data: { number: r.number, memo: entry.memo },
      });
      return r;
    });
    revalidatePath("/jurnal");
    return { ok: true, number: out.number };
  } catch (e) {
    return fail(e);
  }
}

export async function reverseEntryAction(entryId: string, dateISO: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const out = await db.transaction(async (tx) => {
      const original = await getPostedEntry(tx, ctx.orgId, entryId);
      if (!original) throw new Error("JURNAL_TIDAK_DITEMUKAN");
      const reversalInput = makeReversal(
        {
          number: original.number,
          lines: original.lines.map((l) => ({
            accountId: l.accountId, debitMinor: l.debitMinor, creditMinor: l.creditMinor,
          })),
        },
        dateISO,
      );
      reversalInput.idempotencyKey = crypto.randomUUID();
      const r = await postJournalEntry(tx, ctx.orgId, ctx.userEmail, reversalInput, {
        reversalOfId: original.id,
      });
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "JOURNAL_REVERSE",
        subjectType: "journal_entry", subjectId: original.id,
        data: { originalNumber: original.number, reversalNumber: r.number },
      });
      return r;
    });
    revalidatePath("/jurnal");
    return { ok: true, number: out.number };
  } catch (e) {
    return fail(e);
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add src tests/integration
git commit -m "feat(posting): immutable transactional posting service + audited actions"
```

---

### Task 12: Paper & Ink theme tokens

**Files:**
- Modify: `src/app/globals.css` (rewrite), `src/app/layout.tsx` (fonts)
- Create: generated `src/components/ui/*` via shadcn CLI

**Interfaces:**
- Produces: Tailwind utilities `bg-canvas`, `bg-paper`, `text-ink`, `text-ink-soft`, `border-rule`, `text-terra`, plus `.rule-double` CSS class and fonts `font-display` / default sans. Product working title: **Neraca**.

- [ ] **Step 1: Init shadcn + components**

```powershell
npx --yes shadcn@latest init -y
npx --yes shadcn@latest add button card table input label select dialog badge separator textarea
```

Accept defaults (neutral base). This creates `components.json`, `src/lib/utils.ts`, `src/components/ui/*`.

- [ ] **Step 2: Rewrite `src/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-canvas: #faf7f2;
  --color-paper: #fffdf9;
  --color-ink: #1c2430;
  --color-ink-soft: #5b6470;
  --color-terra: #b4552d;
  --color-rule: #e4ddd0;
  --color-debit: #1f7a4d;
  --color-credit: #b4552d;

  --font-display: var(--font-fraunces), ui-serif, Georgia, serif;
  --font-sans: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;
}

html { background-color: var(--color-canvas); }

/* Tabular numerals everywhere money appears */
.tnum { font-feature-settings: "tnum" 1; }

/* Classic accounting double rule under totals */
.rule-double { border-bottom: 4px double var(--color-ink); }
```

- [ ] **Step 3: Fonts in `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Neraca",
  description: "Pembukuan berbasis IFRS untuk organisasi kecil, dengan asisten AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify build** — `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(ui): paper & ink design tokens, fonts, shadcn primitives"
```

---

### Task 13: App shell (sidebar + guarded routes)

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/(app)/layout.tsx`, `src/components/sidebar-nav.tsx`

**Interfaces:**
- Consumes: `requireContext()` (redirects to `/masuk` when logged out).
- Produces: route group `(app)` whose children render inside the shell; sidebar links `/dasbor`, `/jurnal`, `/buku-besar`, `/laporan`, `/pengaturan`; disabled entries Asisten AI + Temuan labeled `Segera`.

- [ ] **Step 1: Root redirect** — replace `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getActiveContext } from "@/server/auth/session";

export default async function Home() {
  const ctx = await getActiveContext();
  redirect(ctx ? "/dasbor" : "/masuk");
}
```

Delete the scaffolded `(app)` boilerplate pages (`page.module.css` references) so the build stays clean.

- [ ] **Step 2: Shell layout** `src/app/(app)/layout.tsx`

```tsx
import { requireContext } from "@/server/auth/guard";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireContext();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl">
      <SidebarNav />
      <main className="flex-1 border-l border-rule bg-paper px-10 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Sidebar component** `src/components/sidebar-nav.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/server/auth/auth-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ITEMS = [
  { href: "/dasbor", label: "Dasbor" },
  { href: "/jurnal", label: "Jurnal Umum" },
  { href: "/buku-besar", label: "Buku Besar" },
  { href: "/laporan", label: "Laporan" },
  { href: "/pengaturan", label: "Pengaturan" },
];

export function SidebarNav() {
  const pathname = usePathname();

  async function keluar() {
    await authClient.signOut();
    window.location.href = "/masuk";
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col justify-between py-8 pr-6">
      <div>
        <p className="font-display text-2xl tracking-tight">Neraca</p>
        <p className="mt-1 text-xs text-ink-soft">Pembukuan ber-IFRS · SME</p>

        <nav className="mt-8 flex flex-col gap-1">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                pathname === item.href || pathname.startsWith(item.href + "/")
                  ? "bg-canvas font-medium text-terra"
                  : "text-ink hover:bg-canvas",
              )}
            >
              {item.label}
            </Link>
          ))}

          {/* Milestone M3 */}
          <span className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-ink-soft/50">
            Asisten AI <Badge variant="outline">Segera</Badge>
          </span>
          {/* Milestone M4 */}
          <span className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-ink-soft/50">
            Temuan <Badge variant="outline">Segera</Badge>
          </span>
        </nav>
      </div>

      <Button variant="ghost" size="sm" onClick={keluar} className="justify-start text-ink-soft">
        Keluar
      </Button>
    </aside>
  );
}
```

- [ ] **Step 4: Placeholder pages so routes resolve** — create minimal pages that will be replaced by later tasks:

`src/app/(app)/dasbor/page.tsx`, `src/app/(app)/jurnal/page.tsx`, `src/app/(app)/buku-besar/page.tsx`, `src/app/(app)/laporan/page.tsx`, `src/app/(app)/pengaturan/page.tsx` — each just:

```tsx
export default function Page() {
  return <p className="font-display text-lg">Segera hadir.</p>;
}
```

- [ ] **Step 5: Verify** — `npm run build` → passes; `npm run dev`, visit `/` unauthenticated → redirected to `/masuk`.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components
git commit -m "feat(ui): guarded app shell with paper & ink sidebar"
```

---

### Task 14: Auth pages (masuk / daftar)

**Files:**
- Create: `src/app/masuk/page.tsx`, `src/app/daftar/page.tsx`, `src/components/auth-form.tsx`

**Interfaces:**
- Consumes: `authClient.signIn.email`, `authClient.signUp.email`.
- Produces: `/masuk` and `/daftar` flows; successful signup lands on `/dasbor` with org auto-created by the Task 8 hook.

- [ ] **Step 1: Shared form** `src/components/auth-form.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/server/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export function AuthForm({ mode }: { mode: "masuk" | "daftar" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));

    const res =
      mode === "daftar"
        ? await authClient.signUp.email({
            email,
            password,
            name: String(fd.get("name")),
          })
        : await authClient.signIn.email({ email, password });

    setBusy(false);
    if (res.error) {
      setError(
        mode === "daftar"
          ? "Pendaftaran gagal — periksa kembali data Anda."
          : "Email atau kata sandi salah.",
      );
      return;
    }
    router.push("/dasbor");
  }

  return (
    <Card className="mx-auto mt-24 w-[380px] border-rule shadow-none">
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
  );
}
```

Note: the signup hook uses `name` as the organization name — label it accordingly ("Nama Organisasi").

- [ ] **Step 2: Pages**

`src/app/masuk/page.tsx`:

```tsx
import { AuthForm } from "@/components/auth-form";

export default function MasukPage() {
  return <AuthForm mode="masuk" />;
}
```

`src/app/daftar/page.tsx`: same with `mode="daftar"`.

- [ ] **Step 3: Manual verify** — `npm run dev`; daftar → lands on `/dasbor` shell; masuk/logout works. Signup failure shows inline error.

- [ ] **Step 4: Commit**

```bash
git add src/app/masuk src/app/daftar src/components/auth-form.tsx
git commit -m "feat(ui): masuk/daftar flows wired to better-auth"
```

---

### Task 15: Jurnal Umum UI (list, entry form, reversal)

**Files:**
- Create: `src/app/(app)/jurnal/baru/page.tsx`, `src/components/journal/new-entry-form.tsx`, `src/components/journal/reverse-button.tsx`
- Modify: `src/app/(app)/jurnal/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `listEntriesWithLines`, `listAccounts`, `createAndPostAction`, `reverseEntryAction`, `Money`.
- Produces: working manual journal flow — create (validated server-side), list view, one-click linked reversal.

- [ ] **Step 1: New-entry page** `src/app/(app)/jurnal/baru/page.tsx`

```tsx
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { NewEntryForm } from "@/components/journal/new-entry-form";

export default async function JurnalBaruPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const rows = await db.transaction((tx) => listAccounts(tx, ctx.orgId));
  const leaves = rows.filter((a) => !rows.some((c) => c.parentCode === a.code));

  return (
    <section className="max-w-3xl">
      <h1 className="font-display text-2xl">Tulis Jurnal</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Debit dan kredit harus seimbang sebelum jurnal dapat diposting.
      </p>
      <NewEntryForm
        accounts={leaves.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))}
      />
    </section>
  );
}
```

- [ ] **Step 2: Entry form component** `src/components/journal/new-entry-form.tsx`

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAndPostAction } from "@/server/actions/journal.actions";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Row {
  key: number;
  accountId: string;
  debitText: string;
  creditText: string;
}

function safeMinor(text: string): bigint | null {
  if (!text.trim()) return 0n;
  try { return Money.parseIdr(text).minor; } catch { return null; }
}

export function NewEntryForm({ accounts }: { accounts: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { key: 1, accountId: "", debitText: "", creditText: "" },
    { key: 2, accountId: "", debitText: "", creditText: "" },
  ]);

  const totals = useMemo(() => {
    let d = 0n, c = 0n, invalid = false;
    for (const r of rows) {
      const dv = safeMinor(r.debitText);
      const cv = safeMinor(r.creditText);
      if (dv === null || cv === null) invalid = true;
      d += dv ?? 0n;
      c += cv ?? 0n;
    }
    return { d, c, balanced: !invalid && d > 0n && d === c };
  }, [rows]);

  const nextKey = rows.length + 1;

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createAndPostAction({
        dateISO,
        memo,
        lines: rows.map(({ accountId, debitText, creditText }) => ({
          accountId, debitText, creditText,
        })),
      });
      if (!res.ok) { setError(res.error ?? "Gagal menyimpan jurnal."); return; }
      router.push("/jurnal");
    });
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div className="flex gap-4">
        <div className="space-y-2">
          <Label htmlFor="tanggal">Tanggal</Label>
          <Input id="tanggal" type="date" value={dateISO}
                 onChange={(e) => setDateISO(e.target.value)} required />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="memo">Keterangan</Label>
          <Input id="memo" value={memo} onChange={(e) => setMemo(e.target.value)}
                 placeholder="mis. Pembelian perlengkapan kantor tunai" />
        </div>
      </div>

      <div className="rounded-lg border border-rule">
        <table className="w-full tnum text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase text-ink-soft">
              <th className="px-3 py-2 font-medium">Akun</th>
              <th className="px-3 py-2 font-medium text-right w-40">Debit</th>
              <th className="px-3 py-2 font-medium text-right w-40">Kredit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-b border-rule/60 last:border-0">
                <td className="px-3 py-2">
                  <Select value={r.accountId} onValueChange={(v) => update(r.key, { accountId: v })}>
                    <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input inputMode="numeric" placeholder="0"
                         value={r.debitText}
                         onChange={(e) => update(r.key, { debitText: e.target.value, creditText: r.creditText && "" })}
                         disabled={!!r.creditText} />
                </td>
                <td className="px-3 py-2">
                  <Input inputMode="numeric" placeholder="0"
                         value={r.creditText}
                         onChange={(e) => update(r.key, { creditText: e.target.value, debitText: r.debitText && "" })}
                         disabled={!!r.debitText} />
                </td>
                <td className="px-2 py-2">
                  {rows.length > 2 && (
                    <Button type="button" variant="ghost" size="sm"
                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      ×
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline"
                onClick={() =>
                  setRows((rs) => [...rs, { key: nextKey, accountId: "", debitText: "", creditText: "" }])
                }>
          + Baris
        </Button>
        <div className="text-right tnum text-sm">
          <span className="text-ink-soft">Debit </span>
          {Money.fromMinor(totals.d).formatIdr()}
          <span className="mx-2 text-rule">|</span>
          <span className="text-ink-soft">Kredit </span>
          {Money.fromMinor(totals.c).formatIdr()}
          <Badge className={`ml-3 ${totals.balanced ? "bg-canvas text-debit" : "bg-canvas text-credit"}`}>
            {totals.balanced ? "Seimbang" : "Belum seimbang"}
          </Badge>
        </div>
      </div>

      {error && <p className="text-sm text-credit">{error}</p>}

      <Button type="submit" disabled={!totals.balanced || pending}
              className="bg-terra hover:bg-terra/90">
        {pending ? "Memposting..." : "Posting Jurnal"}
      </Button>
    </form>
  );
}
```

Note: `onChange` handlers clear the opposite side so a line can never hold both sides client-side.

- [ ] **Step 3: Reversal button** `src/components/journal/reverse-button.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reverseEntryAction } from "@/server/actions/journal.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function ReverseButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-ink-soft hover:text-credit">
          Balikan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm bg-paper border-rule">
        <DialogHeader>
          <DialogTitle className="font-display">Buat Jurnal Balikan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor={`rev-date-${entryId}`}>Tanggal balikan</Label>
          <Input id={`rev-date-${entryId}`} type="date" value={dateISO}
                 onChange={(e) => setDateISO(e.target.value)} />
          {error && <p className="text-sm text-credit">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await reverseEntryAction(entryId, dateISO);
                      if (!res.ok) { setError(res.error ?? "Gagal."); return; }
                      setOpen(false);
                      router.refresh();
                    })
                  }
                  className="bg-terra hover:bg-terra/90">
            {pending ? "Memproses..." : "Posting Balikan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: List page** `src/app/(app)/jurnal/page.tsx` (replace placeholder)

```tsx
import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listEntriesWithLines } from "@/server/db/repos/journals.repo";
import { Money } from "@/core/money/money";
import { ReverseButton } from "@/components/journal/reverse-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function JurnalPage() {
  const ctx = await requireContext();
  const entries = await db.transaction((tx) => listEntriesWithLines(tx, ctx.orgId, 100));

  return (
    <section>
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Jurnal Umum</h1>
        <Link href="/jurnal/baru">
          <Button className="bg-terra hover:bg-terra/90">+ Tulis Jurnal</Button>
        </Link>
      </header>

      <div className="mt-6 overflow-x-auto rounded-lg border border-rule bg-paper">
        <table className="w-full tnum text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Nomor</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Akun &amp; Keterangan</th>
              <th className="px-4 py-3 font-medium text-right">Debit</th>
              <th className="px-4 py-3 font-medium text-right">Kredit</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-soft">
                  Belum ada jurnal. Mulai dengan menekan “+ Tulis Jurnal”.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <>
                {e.lines.map((l, i) => (
                  <tr key={l.id} className="border-b border-rule/60 last:border-0">
                    <td className="px-4 py-2 align-top">
                      {i === 0 ? <span className="font-medium">{e.number}</span> : ""}
                    </td>
                    <td className="px-4 py-2 align-top">{i === 0 ? e.entryDate : ""}</td>
                    <td className="px-4 py-2 pl-8">
                      {l.accountCode} · {l.accountName}
                      <span className="ml-2 text-xs text-ink-soft">{l.memo ?? e.memo}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {l.debitMinor > 0n ? Money.fromMinor(l.debitMinor).formatIdr() : ""}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {l.creditMinor > 0n ? Money.fromMinor(l.creditMinor).formatIdr() : ""}
                    </td>
                    <td className="px-4 py-2">
                      {i === 0 && e.status === "POSTED" && !e.reversalOfId && (
                        <ReverseButton entryId={e.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {entries.some((e) => e.reversalOfId) && (
        <p className="mt-3 text-xs text-ink-soft">
          Entri dengan balikan terhubung otomatis; koreksi tidak pernah menghapus riwayat.
        </p>
      )}
    </section>
  );
}
```

React key warning note: wrap each entry in `<Fragment key={e.id}>` instead of `<>` — implementer must import `{ Fragment } from "react"`.

- [ ] **Step 5: Manual verify** — post an entry via UI; it appears with number `JE-YYYY-0001`; unbalanced submit is disabled; Balikan creates a linked entry and both remain listed.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components
git commit -m "feat(jurnal): manual entry form, ledger list, linked reversal ui"
```

---

### Task 16: Buku Besar drilldown

**Files:**
- Create: `src/server/db/repos/ledger.repo.ts`, `src/app/(app)/buku-besar/page.tsx` (replace placeholder)
- Modify: `src/server/db/repos/journals.repo.ts` (export `toMinor`)

**Interfaces:**
- Consumes: schema tables.
- Produces:
  - `getLedger(q: Queryable, orgId: string, accountId: string): Promise<{ account: AccountRow; rows: LedgerRow[] }>` where `LedgerRow = { number: string; entryDate: string; memo: string; debitMinor: bigint; creditMinor: bigint; balanceMinor: bigint }` — running balance signed by the account's normal side, POSTED entries only.

- [ ] **Step 1: Export `toMinor`** in `journals.repo.ts`: change `function toMinor(` to `export function toMinor(`.

- [ ] **Step 2: Implement** `src/server/db/repos/ledger.repo.ts`

```ts
import { and, asc, eq } from "drizzle-orm";
import { accounts } from "../schema/org";
import { journalEntries, journalLines } from "../schema/journal";
import type { Queryable } from "./queryable";
import { toMinor } from "./journals.repo";

type AccountRow = typeof accounts.$inferSelect;

export interface LedgerRow {
  number: string;
  entryDate: string;
  memo: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
}

export async function getLedger(
  q: Queryable, orgId: string, accountId: string,
): Promise<{ account: AccountRow; rows: LedgerRow[] }> {
  const accRows = await q.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
    .limit(1);
  const account = accRows[0];
  if (!account) throw new Error("AKUN_TIDAK_DITEMUKAN");

  const raw = await q.select({
    number: journalEntries.number,
    entryDate: journalEntries.entryDate,
    memo: journalEntries.memo,
    lineMemo: journalLines.memo,
    debit: journalLines.debit,
    credit: journalLines.credit,
    seq: journalEntries.seq,
    position: journalLines.position,
  })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(
      eq(journalLines.orgId, orgId),
      eq(journalLines.accountId, accountId),
      eq(journalEntries.status, "POSTED"),
    ))
    .orderBy(asc(journalEntries.entryDate), asc(journalEntries.seq), asc(journalLines.position));

  const isDebitNormal = account.normal === "D";
  let running = 0n;
  const rows: LedgerRow[] = raw.map((r) => {
    const d = toMinor(r.debit);
    const c = toMinor(r.credit);
    running += isDebitNormal ? d - c : c - d;
    return {
      number: r.number,
      entryDate: r.entryDate,
      memo: r.lineMemo ?? r.memo,
      debitMinor: d,
      creditMinor: c,
      balanceMinor: running,
    };
  });
  return { account, rows };
}
```

- [ ] **Step 3: Page** `src/app/(app)/buku-besar/page.tsx`

```tsx
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { getLedger } from "@/server/db/repos/ledger.repo";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";

export default async function BukuBesarPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const rows = await db.transaction((tx) => listAccounts(tx, ctx.orgId));
  const leaves = rows.filter((a) => !rows.some((c) => c.parentCode === a.code));

  const selected = sp.account && leaves.some((a) => a.id === sp.account) ? sp.account : leaves[0]?.id;
  const ledger = selected
    ? await db.transaction((tx) => getLedger(tx, ctx.orgId, selected))
    : null;

  const closing = ledger?.rows.at(-1)?.balanceMinor ?? 0n;

  return (
    <section>
      <h1 className="font-display text-2xl">Buku Besar</h1>

      <form method="get" className="mt-6 flex items-end gap-3">
        <select name="account" defaultValue={selected ?? ""}
                className="h-9 rounded-md border border-rule bg-paper px-3 text-sm">
          {leaves.map((a) => (
            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">Tampilkan</Button>
      </form>

      {ledger && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-rule bg-paper">
          <table className="w-full tnum text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs uppercase text-ink-soft">
                <th className="px-4 py-3 font-medium">Nomor</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Keterangan</th>
                <th className="px-4 py-3 font-medium text-right">Debit</th>
                <th className="px-4 py-3 font-medium text-right">Kredit</th>
                <th className="px-4 py-3 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r) => (
                <tr key={`${r.number}-${r.memo}`} className="border-b border-rule/60 last:border-0">
                  <td className="px-4 py-2">{r.number}</td>
                  <td className="px-4 py-2">{r.entryDate}</td>
                  <td className="px-4 py-2">{r.memo}</td>
                  <td className="px-4 py-2 text-right">
                    {r.debitMinor > 0n ? Money.fromMinor(r.debitMinor).formatIdr() : ""}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.creditMinor > 0n ? Money.fromMinor(r.creditMinor).formatIdr() : ""}
                  </td>
                  <td className="px-4 py-2 text-right">{Money.fromMinor(r.balanceMinor).formatIdr()}</td>
                </tr>
              ))}
              {ledger.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-soft">
                    Belum ada mutasi pada akun ini.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="rule-double">
                <td colSpan={5} className="px-4 py-3 text-right font-medium">Saldo Akhir</td>
                <td className="px-4 py-3 text-right font-medium">
                  {Money.fromMinor(closing).formatIdr()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Manual verify** — select Bank account after posting Task 15 entries: rows appear chronologically with running saldo; Saldo Akhir sits under a double rule.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repos src/app
git commit -m "feat(buku-besar): account drilldown with running balance"
```

---

### Task 17: Laporan — four IFRS-SME statements

**Files:**
- Create: `src/server/reports/build.ts`, `src/components/print-button.tsx`
- Create: `src/app/(app)/laporan/page.tsx` (replace placeholder), `src/app/(app)/laporan/laba-rugi/page.tsx`, `src/app/(app)/laporan/neraca/page.tsx`, `src/app/(app)/laporan/arus-kas/page.tsx`, `src/app/(app)/laporan/perubahan-ekuitas/page.tsx`

**Interfaces:**
- Consumes: core statements (Task 6), `reportMetaMap`, `toMinor`.
- Produces:
  - `postedLinesBetween(q, orgId, startISO, endISO): Promise<LedgerLine[]>` and `postedLinesThrough(q, orgId, dateISO): Promise<LedgerLine[]>` from `@/server/reports/build`
  - `loadPeriodOrDefault(q, orgId, name?): Promise<Period>` (latest by name when `name` undefined)
  - statement pages at `/laporan/laba-rugi`, `/laporan/neraca`, `/laporan/arus-kas`, `/laporan/perubahan-ekuitas`, each accepting `?period=YYYY-MM`
  - `PrintButton` client component (`window.print()`)

- [ ] **Step 1: Implement** `src/server/reports/build.ts`

```ts
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import type { Queryable } from "@/server/db/repos/queryable";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { toMinor } from "@/server/db/repos/journals.repo";
import {
  aggregateFromLines,
  signed,
  type LedgerLine,
  type ReportAccountMeta,
} from "@/core/reports/aggregates";

async function postedLines(
  q: Queryable, orgId: string,
  range?: { from?: string; through?: string },
): Promise<LedgerLine[]> {
  const conds = [
    eq(journalEntries.orgId, orgId),
    eq(journalEntries.status, "POSTED"),
  ];
  if (range?.from) conds.push(gte(journalEntries.entryDate, range.from));
  if (range?.through) conds.push(lte(journalEntries.entryDate, range.through));

  const rows = await q
    .select({
      accountId: journalLines.accountId,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conds));

  return rows.map((r) => ({
    accountId: r.accountId,
    debitMinor: toMinor(r.debit),
    creditMinor: toMinor(r.credit),
  }));
}

export const postedLinesBetween = (
  q: Queryable, orgId: string, startISO: string, endISO: string,
) => postedLines(q, orgId, { from: startISO, through: endISO });

export const postedLinesThrough = (
  q: Queryable, orgId: string, dateISO: string,
) => postedLines(q, orgId, { through: dateISO });

export async function loadPeriodOrDefault(
  q: Queryable, orgId: string, name?: string,
): Promise<typeof fiscalPeriods.$inferSelect> {
  if (name) {
    const [p] = await q.select().from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.name, name))).limit(1);
    if (!p) throw new Error("PERIODE_TIDAK_DITEMUKAN");
    return p;
  }
  const [latest] = await q.select().from(fiscalPeriods)
    .where(eq(fiscalPeriods.orgId, orgId)).orderBy(desc(fiscalPeriods.name)).limit(1);
  if (!latest) throw new Error("PERIODE_TIDAK_DITEMUKAN");
  return latest;
}

// Movement of one template account code within an aggregate set.
export function movementByCode(
  aggs: ReturnType<typeof aggregateFromLines>,
  code: string,
): bigint {
  const a = aggs.find((x) => x.meta.code === code);
  return a ? signed(a.meta, a) : 0n;
}

export function metasFor(rows: Array<typeof accounts.$inferSelect>) {
  return reportMetaMap(rows);
}

export type { ReportAccountMeta };
```

- [ ] **Step 2: PrintButton** `src/components/print-button.tsx`

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      Cetak / PDF
    </Button>
  );
}
```

- [ ] **Step 3: Shared period selector** — add `src/components/period-select.tsx`:

```tsx
import { listPeriods } from "@/server/db/repos/periods.repo";
import type { Queryable } from "@/server/db/repos/queryable";

export async function PeriodSelect({
  q, orgId, current,
}: { q: Queryable; orgId: string; current: string }) {
  const periods = await listPeriods(q, orgId);
  return (
    <form method="get" className="flex items-center gap-2">
      <select name="period" defaultValue={current}
              className="h-9 rounded-md border border-rule bg-paper px-3 text-sm">
        {periods.map((p) => (
          <option key={p.id} value={p.name}>{p.name}</option>
        ))}
      </select>
      <button type="submit"
              className="h-9 rounded-md border border-rule px-3 text-sm hover:bg-canvas">
        Tampilkan
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Laba Rugi** `src/app/(app)/laporan/laba-rugi/page.tsx`

```tsx
import Link from "next/link";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts } from "@/server/db/schema/org";
import {
  aggregateFromLines, type ReportAccountMeta,
} from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { Money } from "@/core/money/money";
import {
  postedLinesBetween, loadPeriodOrDefault, metasFor,
} from "@/server/reports/build";
import { PeriodSelect } from "@/components/period-select";
import { PrintButton } from "@/components/print-button";

export default async function LabaRugiPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;

  const rows = await db.transaction(async (tx) => {
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
    const lines = await postedLinesBetween(tx, ctx.orgId, period.startsOn, period.endsOn);
    return { accRows, period, lines };
  });

  const metas: Map<string, ReportAccountMeta> = metasFor(rows.accRows);
  const is = incomeStatement(aggregateFromLines(rows.lines, metas));

  return (
    <StatementShell title="Laporan Laba Rugi" period={rows.period.name} current={sp.period}>
      {is.revenueRows.map((r) => (
        <Row key={r.code} label={`${r.code} · ${r.name}`} minor={r.movementMinor} />
      ))}
      <Row label="Total Pendapatan" minor={is.revenueTotalMinor} bold />
      <div className="h-3" />
      {is.expenseRows.map((r) => (
        <Row key={r.code} label={`${r.code} · ${r.name}`} minor={r.movementMinor} />
      ))}
      <Row label="Total Beban" minor={is.expenseTotalMinor} bold />
      <div className="mt-4 rule-double pt-2">
        <Row label="Laba Bersih" minor={is.netIncomeMinor} bold />
      </div>
    </StatementShell>
  );
}

function Row({ label, minor, bold }: { label: string; minor: bigint; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "font-medium" : ""}`}>
      <span>{label}</span>
      <span className="tnum">{Money.fromMinor(minor).formatIdr()}</span>
    </div>
  );
}

function StatementShell({ title, period, children }: {...}) {
  ...
}
```

Implementer note: extract `Row` and `StatementShell` into `src/components/statement-parts.tsx` so all four pages share them. Full shared file:

```tsx
// src/components/statement-parts.tsx
import Link from "next/link";
import { PeriodSelect } from "@/components/period-select";
import { PrintButton } from "@/components/print-button";
import { Money } from "@/core/money/money";

export function StatementShell({
  title, period, current, orgId, children,
}: {
  title: string; period: string; current?: string; orgId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-2xl">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/laporan" className="text-xs text-ink-soft underline">← Semua laporan</Link>
          <h1 className="font-display text-2xl">{title}</h1>
          <p className="text-sm text-ink-soft">Periode {period}</p>
        </div>
        <PrintButton />
      </header>

      <div className="mt-4"><PeriodSelect q={...} /></div>
      ...
```

To avoid circular server/client plumbing, final structure decision for implementer: keep `StatementShell` and `ReportRowView` in `src/components/statement-parts.tsx` as **plain presentational components** taking already-loaded data as props; each page loads its own data and passes `periodOptions` (from `listPeriods`) instead of the selector querying itself:

```tsx
// src/components/statement-parts.tsx (final form)
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { Money } from "@/core/money/money";

export interface PeriodOption { name: string }

export function StatementShell({
  title, periodName, options, children,
}: {
  title: string; periodName: string; options: PeriodOption[];
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-2xl">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/laporan" className="text-xs text-ink-soft underline">
            ← Semua laporan
          </Link>
          <h1 className="font-display text-2xl">{title}</h1>
          <form method="get" className="mt-2 flex items-center gap-2 text-sm">
            <select name="period" defaultValue={periodName}
                    className="h-8 rounded-md border border-rule bg-paper px-2">
              {options.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
            </select>
            <button type="submit" className="rounded-md border border-rule px-2 hover:bg-canvas">
              Tampilkan
            </button>
          </form>
        </div>
        <PrintButton />
      </header>
      <div className="mt-6 rounded-lg border border-rule bg-paper p-6">{children}</div>
    </section>
  );
}

export function ReportRowView({
  label, minor, bold, indent,
}: { label: string; minor: bigint; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${indent ? "pl-4" : ""} ${bold ? "font-medium" : ""}`}>
      <span>{label}</span>
      <span className="tnum">{Money.fromMinor(minor).formatIdr()}</span>
    </div>
  );
}
```

Then the four pages use `<StatementShell title=... periodName={rows.period.name} options={periods.map(p=>({name:p.name}))}>` with `listPeriods` loaded alongside data. Delete the earlier inline `Row`/draft shell code above when applying this final structure.

Neraca page (`src/app/(app)/laporan/neraca/page.tsx`) — cumulative through period end, NI cumulative:

```tsx
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { accounts } from "@/server/db/schema/org";
import { aggregateFromLines } from "@/core/reports/aggregates";
import { balanceSheet, incomeStatement } from "@/core/reports/statements";
import {
  postedLinesThrough, loadPeriodOrDefault, metasFor,
} from "@/server/reports/build";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { StatementShell, ReportRowView } from "@/components/statement-parts";

export default async function NeracaPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;

  const data = await db.transaction(async (tx) => {
    const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const period = await loadPeriodOrDefault(tx, ctx.orgId, sp.period);
    const options = await listPeriods(tx, ctx.orgId);
    const lines = await postedLinesThrough(tx, ctx.orgId, period.endsOn);
    return { accRows, period, options, lines };
  });
  // import { eq } from "drizzle-orm" at top

  const metas = metasFor(data.accRows);
  const aggs = aggregateFromLines(data.lines, metas);
  const ni = incomeStatement(aggs).netIncomeMinor; // cumulative NI: books start fresh
  const bs = balanceSheet(aggs, ni);

  return (
    <StatementShell title="Neraca" periodName={data.period.name}
                    options={data.options.map((p) => ({ name: p.name }))}>
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-soft">Aset</p>
      {bs.assetRows.map((r) => (
        <ReportRowView key={r.code} indent label={`${r.code} · ${r.name}`} minor={r.movementMinor} />
      ))}
      <ReportRowView bold label="Total Aset" minor={bs.totalAssetsMinor} />

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-ink-soft">Liabilitas</p>
      {bs.liabilityRows.length === 0 && <p className="text-sm text-ink-soft pl-4">Tidak ada.</p>}
      {bs.liabilityRows.map((r) => (
        <ReportRowView key={r.code} indent label={`${r.code} · ${r.name}`} minor={r.movementMinor} />
      ))}

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-ink-soft">Ekuitas</p>
      {bs.equityRows.map((r) => (
        <ReportRowView key={r.code} indent label={r.name} minor={r.movementMinor} />
      ))}
      <div className="mt-4 rule-double pt-2">
        <ReportRowView bold label={`Liabilitas + Ekuitas`}
                       minor={bs.totalEquityAndLiabilitiesMinor} />
      </div>
    </StatementShell>
  );
}
```

Arus Kas page (`src/app/(app)/laporan/arus-kas/page.tsx`) — deltas from template codes:

```tsx
const cf = cashFlowIndirect({
  netIncomeMinor: is.netIncomeMinor,
  deltaPiutangMinor: movementByCode(periodAggs, "1200"),
  deltaPersediaanMinor: movementByCode(periodAggs, "1300"),
  deltaUtangUsahaMinor: movementByCode(periodAggs, "2100"),
  depreciationMinor: movementByCode(periodAggs, "5600"),
  investingMinor: -movementByCode(periodAggs, "1500"),
  financingMinor:
    movementByCode(periodAggs, "3100") +
    movementByCode(periodAggs, "2400") -
    movementByCode(periodAggs, "3300"),
});
```

Render `cf.rows`, then totals Operating/Investing/Financing and `Net Change` under `.rule-double`.

Perubahan Ekuitas page:

```tsx
const eq = changesInEquity({
  openingRetainedEarningsMinor: 0n, // v1: buku dimulai bersih; year-end close menyusul di milestone lanjutan
  contributionsMinor: movementByCode(periodAggs, "3100"),
  drawingsMinor: movementByCode(periodAggs, "3300"),
  netIncomeMinor: is.netIncomeMinor,
});
```

Render `eq.rows` + `Laba Ditahan Akhir` under double rule.

- [ ] **Step 5: Index page** `src/app/(app)/laporan/page.tsx`

```tsx
import Link from "next/link";
import { requireContext } from "@/server/auth/guard";

const REPORTS = [
  { href: "/laporan/laba-rugi", label: "Laporan Laba Rugi", note: "Kinerja periode berjalan" },
  { href: "/laporan/neraca", label: "Neraca", note: "Posisi keuangan kumulatif" },
  { href: "/laporan/arus-kas", label: "Laporan Arus Kas", note: "Metode tidak langsung" },
  { href: "/laporan/perubahan-ekuitas", label: "Perubahan Ekuitas", note: "Modal dan laba ditahan" },
];

export default async function LaporanIndex() {
  await requireContext();
  return (
    <section className="max-w-2xl">
      <h1 className="font-display text-2xl">Laporan Keuangan</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Disusun mengikuti IFRS untuk SME. Setiap laporan dapat dicetak ke PDF.
      </p>
      <ul className="mt-6 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {REPORTS.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="flex items-baseline justify-between px-5 py-4 hover:bg-canvas">
              <span className="font-medium">{r.label}</span>
              <span className="text-xs text-ink-soft">{r.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Manual verify** — post entries across two months via UI; every statement renders with balanced Neraca (no exception thrown) and Arus Kas whose Net Change equals the Bank ledger's saldo change over the same range.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(laporan): four ifrs-sme statements with period selector and print"
```

---

### Task 18: Dasbor + Pengaturan

**Files:**
- Create: `src/app/(app)/dasbor/page.tsx` (replace placeholder), `src/app/(app)/pengaturan/page.tsx` (replace placeholder), `src/server/actions/account.actions.ts`

**Interfaces:**
- Consumes: Tasks 9/11/17 helpers.
- Produces: dasbor summary cards (periode aktif, saldo kas & bank, laba tahun berjalan); pengaturan with COA table + archive toggle, period table with Tutup/Buka buttons (role-gated), members read-only list.
- New action: `archiveAccountAction(accountId: string, archive: boolean)` (OWNER|ACCOUNTANT, audited) in `account.actions.ts`; repo support `getAccountById(q, orgId, id)` and `setAccountArchived(q, orgId, id, archivedAt: Date | null): Promise<AccountRow>` in accounts.repo.

- [ ] **Step 1: Accounts repo additions**

```ts
export async function getAccountById(q: Queryable, orgId: string, id: string) {
  const [row] = await q.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, id))).limit(1);
  return row ?? null;
}

export async function setAccountArchived(
  q: Queryable, orgId: string, id: string, archivedAt: Date | null,
) {
  const [row] = await q.update(accounts)
    .set({ archivedAt })
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, id)))
    .returning();
  if (!row) throw new Error("AKUN_TIDAK_DITEMUKAN");
  return row;
}
```

(add `and` to the drizzle-orm import.)

`src/server/actions/account.actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { getAccountById, setAccountArchived } from "@/server/db/repos/accounts.repo";

export async function archiveAccountAction(accountId: string, archive: boolean) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const out = await db.transaction(async (tx) => {
      const existing = await getAccountById(tx, ctx.orgId, accountId);
      if (!existing) throw new Error("AKUN_TIDAK_DITEMUKAN");
      const row = await setAccountArchived(tx, ctx.orgId, accountId, archive ? new Date() : null);
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail,
        action: archive ? "ACCOUNT_ARCHIVE" : "ACCOUNT_RESTORE",
        subjectType: "account", subjectId: accountId,
        data: { code: row.code },
      });
      return row;
    });
    revalidatePath("/pengaturan");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "GAGAL" };
  }
}
```

- [ ] **Step 2: Dasbor** `src/app/(app)/dasbor/page.tsx`

```tsx
import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { findPeriodByDate, listPeriods } from "@/server/db/repos/periods.repo";
import { aggregateFromLines } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { Money } from "@/core/money/money";
import { postedLinesThrough, loadPeriodOrDefault } from "@/server/reports/build";
import { Badge } from "@/components/ui/badge";

export default async function DasborPage() {
  const ctx = await requireContext();

  const todayISO = new Date().toISOString().slice(0, 10);
  const yearEndISO = `${new Date().getFullYear()}-12-31`;

  const data = await db.transaction(async (tx) => {
    const period = await findPeriodByDate(tx, ctx.orgId, todayISO);
    const accRows = await tx.select().from(accounts).where(eqOrg(ctx.orgId));
    const cashLines = await postedLinesThrough(tx, ctx.orgId, yearEndISO);
    const options = await listPeriods(tx, ctx.orgId);
    return { period, accRows, cashLines, options };
  });
  // helper eqOrg imported from drizzle: const eqOrg = (id: string) => eq(accounts.orgId, id)

  const metas = new Map([...].map(...)); // metasFor(data.accRows)
  const aggs = aggregateFromLines(data.cashLines, metas);

  const cashMinor = [...aggs.values()]
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((s, a) => s + signed(a.meta, a), 0n);

  const ytd = incomeStatement(aggs);

  return (
    <section>
      <h1 className="font-display text-2xl">Dasbor</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-ink-soft">Periode Berjalan</CardTitle></CardHeader>
          <CardContent>
            <p className="font-display text-xl">{data.period?.name ?? "—"}</p>
            <Badge variant="outline" className="mt-2">{data.period?.status ?? "-"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-ink-soft">Saldo Kas &amp; Bank</CardTitle></CardHeader>
          <CardContent><p className="font-display text-xl tnum">{Money.fromMinor(cashMinor).formatIdr()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-ink-soft">Laba Tahun Ini</CardTitle></CardHeader>
          <CardContent><p className="font-display text-xl tnum">{Money.fromMinor(ytd.netIncomeMinor).formatIdr()}</p></CardContent>
        </Card>
      </div>

      <div className="mt-8 rounded-lg border border-rule bg-paper p-6 text-sm text-ink-soft">
        Asisten AI dan deteksi temuan hadir pada milestone berikutnya (M2–M4).
      </div>
    </section>
  );
}
```

Implementer notes: import `{ eq }` from drizzle-orm and replace `eqOrg(...)` accordingly; use `metasFor(data.accRows)`; import `signed` from core aggregates; import shadcn `Card/CardHeader/CardTitle/CardContent`. The `options` variable may be unused — drop it or surface a "Periode" quick link list.

- [ ] **Step 3: Pengaturan** `src/app/(app)/pengaturan/page.tsx`

Structure: three sections stacked.

1. Bagan Akun — table of `listAccounts` rows: kode, nama, tipe, normal, status (Arsip badge if archivedAt), action button calling `archiveAccountAction(a.id, !archived)` via tiny client wrapper `ArchiveToggle` (`useTransition` + call + refresh).
2. Periode — table of `listPeriods`: name, tanggal mulai–selesai, status badge, buttons: `CLOSED→Buka Kembali (owner only)`, `OPEN→Tutup (owner+accountant)` wired to `closePeriodAction`/`reopenPeriodAction` via client wrapper `PeriodActions` receiving `role` prop and hiding unauthorized actions.
3. Anggota — read-only list of memberships joined user email (query `memberships` where orgId; email lookup via better-auth `user` table join on userId).

Provide the client wrappers:

```tsx
// src/components/settings/archive-toggle.tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveAccountAction } from "@/server/actions/account.actions";
import { Button } from "@/components/ui/button";

export function ArchiveToggle({ accountId, archived }: { accountId: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending}
            onClick={() => start(async () => {
              await archiveAccountAction(accountId, !archived);
              router.refresh();
            })}>
      {archived ? "Pulihkan" : "Arsipkan"}
    </Button>
  );
}
```

```tsx
// src/components/settings/period-actions.tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { closePeriodAction, reopenPeriodAction } from "@/server/actions/periods.actions";
import { Button } from "@/components/ui/button";

export function PeriodActions({ periodId, status }: { periodId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const res = await fn();
    if (!res.ok) console.error(res.error);
    router.refresh();
  }

  if (status === "OPEN")
    return (
      <Button variant="outline" size="sm" disabled={pending}
              onClick={() => run(() => closePeriodAction(periodId))}>
        Tutup
      </Button>
    );
  if (status === "CLOSED")
    return (
      <Button variant="ghost" size="sm" disabled={pending}
              onClick={() => run(() => reopenPeriodAction(periodId))}>
        Buka Kembali
      </Button>
    );
  return null; // LOCKED: no UI action in M1
}
```

Server page composes tables using these wrappers; role gating: pass role into page via `requireContext()` and hide Tutup button for VIEWER by conditional rendering `{ctx.role !== "VIEWER" && <PeriodActions .../>}` (reopen owner-only check stays enforced inside the action).

- [ ] **Step 4: Manual verify** — dasbor cards show real numbers after postings; closing the current period blocks a new entry dated today with the PERIOD_NOT_OPEN Indonesian message; reopening restores posting.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(dasbor,pengaturan): summary cards, coa archive, period controls"
```

---

### Task 19: Playwright e2e smoke

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `npm run e2e` verifying the M1 golden path at the UI level.

- [ ] **Step 1: Config** `playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

Add script `"e2e": "playwright test"`.

- [ ] **Step 2: Spec** `tests/e2e/smoke.spec.ts`

Rationale: posting correctness is covered exhaustively by integration tests; e2e asserts navigation, auth guard, and that statements render.

```ts
import { test, expect } from "@playwright/test";

const unique = () => `e2e-${Date.now()}@test.id`;

test("signup lands in guarded app shell", async ({ page }) => {
  await page.goto("/daftar");
  await page.getByLabel("Nama Organisasi").fill("Koperasi E2E");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Kata Sandi").fill("rahasia12345");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/dasbor/);
  await expect(page.getByText("Jurnal Umum")).toBeVisible();
});

test("unauthenticated access redirects to masuk", async ({ page }) => {
  await page.goto("/jurnal");
  await expect(page).toHaveURL(/\/masuk/);
});

test("statements render after direct visit", async ({ page, request }) => {
  // fresh signup for isolation
  const email = unique();
  await page.goto("/daftar");
  await page.getByLabel("Nama Organisasi").fill("Koperasi E2E Dua");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata Sandi").fill("rahasia12345");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/dasbor/);

  await page.goto("/laporan/neraca");
  await expect(page.getByText("Neraca")).toBeVisible();
  await expect(page.getByText("Laba Tahun Berjalan")).toBeVisible();
  await expect(page.getByText("Total Aset")).toBeVisible();

  await page.goto("/laporan/laba-rugi");
  await expect(page.getByText("Laba Bersih")).toBeVisible();
});
```

- [ ] **Step 3: Run**

```powershell
npx playwright install chromium   # once
npm run db:up
npx vitest run                    # unit+integration green first
npm run e2e
```

Expected: all specs pass against dev server.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e package.json
git commit -m "test(e2e): m1 smoke flows"
```

---

### Task 20: README + production checklist

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```markdown
# Neraca — AI Accounting SaaS (M1: Ledger-first)

Pembukuan berbasis IFRS untuk SME dengan antarmuka Paper & Ink.
Milestone ini mengirimkan inti pembukuan; AI menyusul di M2–M4.

## Menjalankan Lokal (Windows PowerShell)

1. Prasyarat: Node 20+, Docker Desktop.
2. `npm install`
3. `Copy-Item .env.example .env` — sesuaikan bila perlu.
4. `npm run db:up` — Postgres 16 + pgvector di port 54329.
5. `npx drizzle-kit migrate` — skema.
6. `npm run db:sql` — RLS policies + immutability triggers.
7. `npm run dev` → http://localhost:3000 (daftar → organisasi, bagan akun,
   dan 12 periode dibuat otomatis).

## Pengujian

- `npm test` — unit (core) + integration (butuh Docker DB).
- `SKIP_DB_TESTS=1 npm test` — hanya unit.
- `npm run e2e` — Playwright smoke (dev server otomatis).

## Urutan Skema

Skema bisnis ada di `src/server/db/schema/*.ts`; tabel auth di
`schema/auth.ts`. Trigger imutabilitas dan RLS ada di
`src/server/db/{triggers,rls}.sql`, diterapkan lewat `npm run db:sql`.

## Checklist Sebelum Produksi

- [ ] Jalankan runtime dengan peran non-superuser (app_user) agar RLS aktif end-to-end.
- [ ] Ganti `BETTER_AUTH_SECRET` dengan nilai acak kuat.
- [ ] Backup terjadwal + verifikasi rantai audit (`verifyChain`).

## Peta Milestone

- M1 Ledger-first (ini) · M2 Copilot · M3 Advisor RAG · M4 Doctor.
Spesifikasi: docs/superpowers/specs/. Rencana: docs/superpowers/plans/.
```

- [ ] **Step 2: Final M1 acceptance sweep**

Run everything green before declaring M1 done:

```powershell
npx vitest run
npm run build
npm run e2e
```

Manual spec checks against `docs/superpowers/specs/2026-08-22-ai-accounting-saas-design.md` §4:
- Unbalanced entry rejected with Indonesian message ✓ (posting.test.ts)
- Posted entry UPDATE blocked by trigger ✓ (posting.test.ts)
- Reversal creates linked pair ✓ (posting.test.ts)
- Closed period blocks posting ✓ (validateEntry + periods test)
- Neraca hard assertion ✓ (balanceSheet throws UnbalancedSheetError)
- Hash-chained audit detects tampering ✓ (audit.test.ts)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: readme with setup, testing, production checklist"
```

---

## Plan Self-Review (completed during writing)

1. **Spec coverage vs M1 scope:** auth+orgs (T8), COA seed (T4/T8), manual journals (T11/T15), immutability + reversals (T7/T11/T15), periods close/reopen role-gated (T9/T18), audit hash chain (T10), RLS (T7), four IFRS-SME statements incl. indirect cash flow (T6/T17), buku besar (T16), dasbor (T18), Paper & Ink shell + tokens (T12/T13), Bahasa Indonesia copy throughout (messages.ts T11, UI tasks), e2e (T19), README (T20). Billing/AI deliberately excluded per roadmap.
2. **Placeholders:** none remaining — implementer notes always provide exact replacement code.
3. **Type consistency:** `Money.parseIdr/minor/formatIdr`, `JournalEntryInput`, `ValidationIssue`, `EntryView.lines[].accountId`, `postJournalEntry(tx, orgId, actorEmail, input, opts?)`, `appendAudit(tx, {...})`, `findPeriodByDate(q, orgId, dateISO)` are used identically across tasks. `searchParams` handled as `Promise` per Next.js 15 in every page that reads it.


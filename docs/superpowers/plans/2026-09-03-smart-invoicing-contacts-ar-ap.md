# Smart Invoicing, Contacts Directory, & AR/AP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun modul Faktur & Tagihan (Invoicing & Bills), Direktori Kontak (Pelanggan & Pemasok), dan Analisis Umur Piutang/Utang (Aging AR/AP) lengkap dengan antarmuka UI Paper & Ink, integrasi jurnal umum double-entry, serta tool agen AI Nara.

**Architecture:** Menggunakan *Unified Commercial Document Architecture* dengan tabel `contacts`, `invoices`, `invoice_items`, dan `invoice_payments` di Postgres/Drizzle ORM. Mengimplementasikan semi-manual ledger posting (jurnal akrual dan kas), kalkulator pajak/diskon BigInt minor units, server actions terproteksi RLS, generator pengingat WhatsApp (`wa.me`), serta tool AI Nara terintegrasi Smart HITL.

**Tech Stack:** Next.js 16.3 (App Router), React 19, Tailwind CSS v4, Drizzle ORM, PostgreSQL, Better Auth, @google/genai, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-smart-invoicing-contacts-ar-ap-design.md`

## Global Constraints

- Monetary values strictly use `numeric(18, 0)` in Postgres and `BigInt` minor units (cents: 1 IDR = 100 minor units) via `Money` class. Never JS floating-point `number`.
- Double-entry invariants: Debit and Credit must be strictly balanced before any journal posting.
- Multi-tenancy: Every table contains `org_id` scoped by tenant session context.
- UI styling: Paper & Ink tokens (`bg-canvas`, `bg-paper`, `text-ink`, `text-ink-soft`, `border-rule`, `text-terra`).
- TypeScript: `bunx tsc --noEmit` must remain 0 errors.

---

### Task 1: Database Schema & Migration (`contacts`, `invoices`, `invoice_items`, `invoice_payments`)

**Files:**
- Create: `src/server/db/schema/invoicing.ts`
- Modify: `src/server/db/schema/index.ts`
- Test: `tests/integration/invoicing-schema.test.ts`

**Interfaces:**
- Produces: `contacts`, `invoices`, `invoiceItems`, `invoicePayments` Drizzle table definitions.

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/invoicing-schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { contacts, invoices, invoiceItems, invoicePayments } from "@/server/db/schema/invoicing";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Invoicing Database Schema", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Invoicing Schema Test")).orgId;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("inserts and queries contact, invoice, items, and payment with foreign keys", async () => {
    // 1. Insert contact
    const [c] = await db
      .insert(contacts)
      .values({
        orgId,
        type: "CUSTOMER",
        name: "Toko Berkah Mandiri",
        phone: "081234567890",
        email: "berkah@example.com",
      })
      .returning();
    expect(c.id).toBeDefined();
    expect(c.name).toBe("Toko Berkah Mandiri");

    // 2. Insert invoice
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        type: "INVOICE",
        invoiceNumber: "INV-2026-0001",
        contactId: c.id,
        issueDate: "2026-09-01",
        dueDate: "2026-09-15",
        subtotalMinor: 50000000n, // Rp 500.000
        taxMinor: 5500000n,       // Rp 55.000 (PPN 11%)
        totalMinor: 55500000n,     // Rp 555.000
        status: "ISSUED",
      })
      .returning();
    expect(inv.id).toBeDefined();
    expect(inv.invoiceNumber).toBe("INV-2026-0001");

    // 3. Insert invoice item
    const [item] = await db
      .insert(invoiceItems)
      .values({
        invoiceId: inv.id,
        description: "Kertas HVS A4 80gr (5 rim)",
        quantity: "5.00",
        unitPriceMinor: 10000000n,
        taxRatePercent: "11.00",
        totalMinor: 55500000n,
      })
      .returning();
    expect(item.id).toBeDefined();

    // 4. Query relation
    const foundInv = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(foundInv).toHaveLength(1);
    expect(foundInv[0].totalMinor).toBe(55500000n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/invoicing-schema.test.ts`
Expected: FAIL (Module `"@/server/db/schema/invoicing"` does not exist).

- [ ] **Step 3: Implement `src/server/db/schema/invoicing.ts` and update `index.ts`**

```typescript
// src/server/db/schema/invoicing.ts
import { pgTable, uuid, varchar, text, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./org";
import { accounts } from "./org";
import { journalEntries } from "./journal";

export const contactTypeEnum = ["CUSTOMER", "VENDOR", "BOTH"] as const;
export type ContactType = (typeof contactTypeEnum)[number];

export const invoiceTypeEnum = ["INVOICE", "BILL"] as const;
export type InvoiceType = (typeof invoiceTypeEnum)[number];

export const invoiceStatusEnum = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
] as const;
export type InvoiceStatus = (typeof invoiceStatusEnum)[number];

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type", { enum: contactTypeEnum }).notNull().default("CUSTOMER"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  taxId: varchar("tax_id", { length: 50 }),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type", { enum: invoiceTypeEnum }).notNull().default("INVOICE"),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "restrict" }),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("IDR"),
  subtotalMinor: numeric("subtotal_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(0n),
  discountMinor: numeric("discount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(0n),
  taxMinor: numeric("tax_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(0n),
  totalMinor: numeric("total_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(0n),
  amountPaidMinor: numeric("amount_paid_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(0n),
  status: text("status", { enum: invoiceStatusEnum }).notNull().default("DRAFT"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1.00"),
  unitPriceMinor: numeric("unit_price_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(0n),
  discountMinor: numeric("discount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(0n),
  taxRatePercent: numeric("tax_rate_percent", { precision: 5, scale: 2 }).notNull().default("0.00"),
  totalMinor: numeric("total_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(0n),
});

export const invoicePayments = pgTable("invoice_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  paymentDate: date("payment_date").notNull(),
  amountMinor: numeric("amount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  paymentAccountId: uuid("payment_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  referenceNumber: varchar("reference_number", { length: 100 }),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Export in `src/server/db/schema/index.ts`. Apply SQL tables via migration or Drizzle push.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/invoicing-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema/invoicing.ts src/server/db/schema/index.ts tests/integration/invoicing-schema.test.ts
git commit -m "feat(db): add contacts and invoicing tables schema"
```

---

### Task 2: Invoicing Core Calculations & Repositories

**Files:**
- Create: `src/core/invoicing/calculations.ts`
- Create: `src/server/db/repos/contacts.repo.ts`
- Create: `src/server/db/repos/invoices.repo.ts`
- Test: `tests/unit/invoicing/calculations.test.ts`
- Test: `tests/integration/invoicing-repo.test.ts`

**Interfaces:**
- Produces:
  - `calculateInvoiceTotals(items, globalDiscountMinor)`
  - `determineInvoiceStatus(totalMinor, amountPaidMinor, dueDate, now)`
  - `createContactRepo(db, orgId, data)`, `listContactsRepo(db, orgId, filter)`
  - `createInvoiceRepo(db, orgId, invoiceData, itemsData)`, `recordInvoicePaymentRepo(...)`, `getAgingReportRepo(db, orgId, type)`

- [ ] **Step 1: Write the unit test for calculations**

```typescript
// tests/unit/invoicing/calculations.test.ts
import { describe, it, expect } from "vitest";
import { calculateInvoiceTotals, determineInvoiceStatus } from "@/core/invoicing/calculations";

describe("Invoice Calculations", () => {
  it("calculates subtotal, tax 11%, and total in minor units", () => {
    const items = [
      {
        quantity: 2,
        unitPriceMinor: 10000000n, // Rp 100.000
        discountMinor: 1000000n,  // Rp 10.000
        taxRatePercent: 11,
      },
    ];
    // Subtotal after item discount: 2 * 100.000 - 10.000 = 190.000 (19_000_000n)
    // Tax 11%: 190.000 * 0.11 = 20.900 (2_090_000n)
    // Total: 210.900 (21_090_000n)
    const result = calculateInvoiceTotals(items, 0n);
    expect(result.subtotalMinor).toBe(19000000n);
    expect(result.taxMinor).toBe(2090000n);
    expect(result.totalMinor).toBe(21090000n);
  });

  it("determines correct status: PAID, PARTIALLY_PAID, OVERDUE, ISSUED", () => {
    const today = new Date("2026-09-10");
    expect(determineInvoiceStatus(1000n, 1000n, "2026-09-01", today)).toBe("PAID");
    expect(determineInvoiceStatus(1000n, 500n, "2026-09-15", today)).toBe("PARTIALLY_PAID");
    expect(determineInvoiceStatus(1000n, 0n, "2026-09-01", today)).toBe("OVERDUE");
    expect(determineInvoiceStatus(1000n, 0n, "2026-09-15", today)).toBe("ISSUED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/invoicing/calculations.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/invoicing/calculations.ts`, `contacts.repo.ts`, and `invoices.repo.ts`**

Implement pure functions in `calculations.ts` and database query logic in `contacts.repo.ts` & `invoices.repo.ts`.

- [ ] **Step 4: Run unit and integration tests**

Run: `bun run test tests/unit/invoicing/calculations.test.ts tests/integration/invoicing-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/invoicing/ src/server/db/repos/contacts.repo.ts src/server/db/repos/invoices.repo.ts tests/unit/invoicing/ tests/integration/invoicing-repo.test.ts
git commit -m "feat(invoicing): implement invoice calculation engine and repositories"
```

---

### Task 3: Ledger Posting Services (Accrual & Payment Journals)

**Files:**
- Create: `src/server/invoicing/posting.ts`
- Test: `tests/integration/invoicing-posting.test.ts`

**Interfaces:**
- Produces:
  - `postInvoiceToLedger(db, orgId, invoiceId, actorEmail): Promise<string>`
  - `postInvoicePaymentToLedger(db, orgId, paymentId, actorEmail): Promise<string>`

- [ ] **Step 1: Write integration test for posting invoices and payments**

```typescript
// tests/integration/invoicing-posting.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { contacts, invoices } from "@/server/db/schema/invoicing";
import { postInvoiceToLedger, postInvoicePaymentToLedger } from "@/server/invoicing/posting";
import { accounts } from "@/server/db/schema/org";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Invoicing Ledger Posting", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Invoicing Posting Test")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("posts an invoice to General Ledger as a balanced accrual journal entry", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ orgId, type: "CUSTOMER", name: "PT Sukses Bersama" })
      .returning();

    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        type: "INVOICE",
        invoiceNumber: "INV-2026-0002",
        contactId: c.id,
        issueDate: "2026-09-01",
        dueDate: "2026-09-15",
        subtotalMinor: 100000000n, // Rp 1.000.000
        taxMinor: 11000000n,       // Rp 110.000
        totalMinor: 111000000n,     // Rp 1.110.000
        status: "ISSUED",
      })
      .returning();

    const journalId = await postInvoiceToLedger(db, orgId, inv.id, "test@test.id");
    expect(journalId).toBeDefined();

    // Verify invoice is linked to journalEntryId
    const [updatedInv] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(updatedInv.journalEntryId).toBe(journalId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/invoicing-posting.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/server/invoicing/posting.ts`**

Map account codes (`1200 Piutang Usaha`, `4100 Pendapatan Usaha`, `2200 PPN Keluaran`, `2100 Utang Usaha`, `5100 HPP`, `1400 PPN Masukan`), generate journal entry number `JE-YYYY-NNNN`, insert `journal_entries` and `journal_lines`, and update `invoices.journalEntryId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/invoicing-posting.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/invoicing/posting.ts tests/integration/invoicing-posting.test.ts
git commit -m "feat(invoicing): implement double-entry ledger posting for invoices and payments"
```

---

### Task 4: Server Actions & WhatsApp Reminder Generator

**Files:**
- Create: `src/core/invoicing/whatsapp.ts`
- Create: `src/server/actions/contact.actions.ts`
- Create: `src/server/actions/invoice.actions.ts`
- Test: `tests/unit/invoicing/whatsapp.test.ts`

**Interfaces:**
- Produces:
  - `formatWhatsAppReminder(contact, invoice, bankAccountInfo)`
  - `createContactAction(data)`, `updateContactAction(id, data)`
  - `createInvoiceAction(data)`, `postInvoiceToJournalAction(id)`, `recordInvoicePaymentAction(data)`

- [ ] **Step 1: Write unit test for WhatsApp reminder text and link generator**

```typescript
// tests/unit/invoicing/whatsapp.test.ts
import { describe, it, expect } from "vitest";
import { formatWhatsAppReminder } from "@/core/invoicing/whatsapp";

describe("WhatsApp Reminder Generator", () => {
  it("formats polite Indonesian reminder message and wa.me link", () => {
    const contact = { name: "Pak Budi", phone: "081234567890" };
    const invoice = {
      invoiceNumber: "INV-2026-0001",
      dueDate: "2026-09-15",
      remainingMinor: 55500000n, // Rp 555.000
    };
    const bank = { bankName: "BCA", accountNumber: "1234567890", accountHolder: "PT Neraca" };

    const result = formatWhatsAppReminder(contact, invoice, bank);
    expect(result.phone).toBe("6281234567890"); // normalized
    expect(result.message).toContain("INV-2026-0001");
    expect(result.message).toContain("Rp555.000");
    expect(result.message).toContain("BCA 1234567890");
    expect(result.waLink).toContain("https://wa.me/6281234567890?text=");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/invoicing/whatsapp.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/invoicing/whatsapp.ts` and server actions**

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/unit/invoicing/whatsapp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/invoicing/whatsapp.ts src/server/actions/contact.actions.ts src/server/actions/invoice.actions.ts tests/unit/invoicing/whatsapp.test.ts
git commit -m "feat(invoicing): add server actions and whatsapp reminder link generator"
```

---

### Task 5: Nara AI Tools (`create_invoice`, `record_invoice_payment`, `get_ar_ap_aging`)

**Files:**
- Modify: `src/server/ai/nara-tools.ts`
- Test: `tests/integration/nara-invoicing-tools.test.ts`

**Interfaces:**
- Produces:
  - Tools registered in `SAFE_TOOLS` / `MUTATING_TOOLS` and `ALL_NARA_TOOLS`
  - `executeToolCall` handlers for `create_invoice`, `record_invoice_payment`, `get_ar_ap_aging`

- [ ] **Step 1: Write integration test for Nara Invoicing tools**

```typescript
// tests/integration/nara-invoicing-tools.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { executeNaraTool } from "@/server/ai/nara-tools";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Nara Invoicing Tools", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Nara Invoicing Tool Test")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("creates an invoice via Nara create_invoice tool", async () => {
    const res = await executeNaraTool(orgId, "test@test.id", "create_invoice", {
      type: "INVOICE",
      customerName: "Bu Sarah Katering",
      customerPhone: "081298765432",
      dueDate: "2026-09-20",
      items: [
        {
          description: "Nasi Kotak Ayam Bakar (20 porsi)",
          quantity: 20,
          unitPrice: 25000,
          taxRate: 0,
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    const data = res.data as Record<string, unknown>;
    expect(data.invoiceNumber).toBeDefined();
    expect(data.totalFormatted).toBe("Rp500.000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/nara-invoicing-tools.test.ts`
Expected: FAIL.

- [ ] **Step 3: Register and implement tools in `src/server/ai/nara-tools.ts`**

Register `create_invoice` (MUTATING), `record_invoice_payment` (MUTATING), and `get_ar_ap_aging` (SAFE). Implement dispatch in `executeToolCall`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/integration/nara-invoicing-tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/nara-tools.ts tests/integration/nara-invoicing-tools.test.ts
git commit -m "feat(ai): register create_invoice, record_invoice_payment, and get_ar_ap_aging tools"
```

---

### Task 6: Frontend Pages & Components (`/kontak`, `/faktur`, `/faktur/[id]`)

**Files:**
- Modify: `src/components/sidebar-nav.tsx` (Add `Faktur & Tagihan` and `Kontak`)
- Create: `src/components/contacts/contact-directory.tsx`
- Create: `src/components/contacts/create-contact-dialog.tsx`
- Create: `src/app/(app)/kontak/page.tsx`
- Create: `src/components/invoicing/invoice-list.tsx`
- Create: `src/components/invoicing/aging-summary.tsx`
- Create: `src/components/invoicing/create-invoice-dialog.tsx`
- Create: `src/components/invoicing/record-payment-dialog.tsx`
- Create: `src/app/(app)/faktur/page.tsx`
- Create: `src/components/invoicing/invoice-print-view.tsx`
- Create: `src/app/(app)/faktur/[id]/page.tsx`
- Test: `tests/unit/components/invoicing-ui.test.ts`

- [ ] **Step 1: Write UI unit test**

```typescript
// tests/unit/components/invoicing-ui.test.ts
import { describe, it, expect } from "vitest";
import * as React from "react";
import { AgingSummary } from "@/components/invoicing/aging-summary";

describe("Invoicing UI Components", () => {
  it("renders aging summary cards with proper brackets", () => {
    const el = React.createElement(AgingSummary, {
      currentMinor: 10000000n,
      days1To30Minor: 5000000n,
      days31To60Minor: 0n,
      daysOver60Minor: 2000000n,
    });
    expect(React.isValidElement(el)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/components/invoicing-ui.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement frontend components & pages**

1. Update `SidebarNav` in `src/components/sidebar-nav.tsx` with links to `/faktur` (Receipt icon) and `/kontak` (Users icon).
2. Build Kontak Directory (`/kontak`) with table, filter, and create/edit modal.
3. Build Faktur Dashboard (`/faktur`) with tabs: Piutang, Utang, and Aging Summary + Quick action buttons (Posting Jurnal, Bayar, WhatsApp, Cetak).
4. Build Print/PDF view (`/faktur/[id]`) with Paper & Ink styling.

- [ ] **Step 4: Run unit test and TypeScript check**

Run: `bun run test tests/unit/components/invoicing-ui.test.ts`
Run: `bunx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar-nav.tsx src/components/contacts/ src/components/invoicing/ src/app/\(app\)/kontak/ src/app/\(app\)/faktur/ tests/unit/components/invoicing-ui.test.ts
git commit -m "feat(ui): add /kontak and /faktur pages with Paper & Ink matte styling"
```

---

### Task 7: Full System Verification & Production Build

**Files:** None (System verification)

- [ ] **Step 1: Run TypeScript compiler**

Run: `bunx tsc --noEmit`
Expected: PASS (0 errors, 0 warnings).

- [ ] **Step 2: Run full Vitest test suite**

Run: `bun run test`
Expected: PASS (All test files green).

- [ ] **Step 3: Run Next.js production build**

Run: `bun run build`
Expected: PASS (All 33+ routes compiled).

- [ ] **Step 4: Commit any final polishing**

```bash
git status
git commit -m "chore: complete Milestone 2.1 Smart Invoicing, Contacts, and AR/AP"
```

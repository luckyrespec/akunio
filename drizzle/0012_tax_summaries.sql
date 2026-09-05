-- Modul Pajak UMKM (PP 55/2022): tabel tax_summaries.
-- Ditulis tangan karena `drizzle-kit generate` crash repo-wide
-- (TypeError BigInt serialization pada kolom numeric mode bigint) —
-- sinkronkan meta snapshot saat bug generate upstream teratasi.
-- Idempoten (IF NOT EXISTS) agar aman dijalankan setelah `db:sql`
-- (tax.sql membuat objek yang sama). Kepemilikan objek:
--   migrasi ini  -> tabel + indeks
--   tax.sql      -> CHECK source TAX di journal_entries + RLS policy
CREATE TABLE IF NOT EXISTS "tax_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
	"period_month" varchar(7) NOT NULL,
	"tax_year" integer NOT NULL,
	"gross_revenue_minor" numeric(18, 0) DEFAULT '0' NOT NULL,
	"cumulative_year_revenue_minor" numeric(18, 0) DEFAULT '0' NOT NULL,
	"taxable_revenue_minor" numeric(18, 0) DEFAULT '0' NOT NULL,
	"tax_due_minor" numeric(18, 0) DEFAULT '0' NOT NULL,
	"accrual_draft_id" uuid REFERENCES "public"."ai_drafts"("id") ON DELETE set null,
	"accrual_journal_entry_id" uuid REFERENCES "public"."journal_entries"("id") ON DELETE set null,
	"payment_journal_entry_id" uuid REFERENCES "public"."journal_entries"("id") ON DELETE set null,
	"ntpn" varchar(30),
	"paid_at" timestamp with time zone,
	"status" text DEFAULT 'UNPROCESSED' NOT NULL CHECK (status IN ('UNPROCESSED', 'DRAFTED', 'ACCRUED', 'PAID')),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tax_summaries_org_month_uq" ON "public"."tax_summaries" USING btree ("org_id","period_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_summaries_org_year_idx" ON "public"."tax_summaries" USING btree ("org_id","tax_year");

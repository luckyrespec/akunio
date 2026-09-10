-- Modul POS Lite (kasir dagang & F&B): pos_shifts + pos_sales + pos_sale_items + pos_sale_seq_counters.
-- Ditulis tangan karena `drizzle-kit generate` crash repo-wide
-- (TypeError BigInt serialization pada kolom numeric mode bigint) —
-- sinkronkan meta snapshot saat bug generate upstream teratasi.
-- Idempoten (IF NOT EXISTS). Kepemilikan objek:
--   migrasi ini  -> tabel + indeks
--   rls.sql      -> RLS policy (array generik org_id)
--   tax.sql      -> CHECK je_source_chk ('POS','POS_SELISIH')
CREATE TABLE IF NOT EXISTS "pos_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	"cash_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
	"opened_by" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"opening_cash_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'BUKA' NOT NULL,
	"variance_journal_entry_id" uuid REFERENCES "public"."journal_entries"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	"shift_id" uuid REFERENCES "public"."pos_shifts"("id"),
	"number" varchar(32) NOT NULL,
	"sold_date" date NOT NULL,
	"payment_method" text NOT NULL,
	"cash_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
	"subtotal_minor" numeric(18, 0) NOT NULL,
	"discount_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"total_minor" numeric(18, 0) NOT NULL,
	"cash_received_minor" numeric(18, 0) NOT NULL,
	"change_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"buyer_name" text,
	"journal_entry_id" uuid REFERENCES "public"."journal_entries"("id"),
	"kas_entry_id" uuid REFERENCES "public"."kas_bank_entries"("id"),
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	"sale_id" uuid NOT NULL REFERENCES "public"."pos_sales"("id") ON DELETE CASCADE,
	"item_id" uuid NOT NULL REFERENCES "public"."inventory_items"("id"),
	"qty" numeric(12, 4) NOT NULL,
	"unit_price_minor" numeric(18, 0) NOT NULL,
	"discount_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"line_total_minor" numeric(18, 0) NOT NULL,
	"unit_cost_minor" numeric(18, 0) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_sale_seq_counters" (
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	"year" text NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pos_sale_seq_org_year_uq" PRIMARY KEY("org_id","year")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sales_org_number_uq" ON "public"."pos_sales" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sales_org_idem_uq" ON "public"."pos_sales" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_sales_org_date_idx" ON "public"."pos_sales" USING btree ("org_id","sold_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_sales_org_shift_idx" ON "public"."pos_sales" USING btree ("org_id","shift_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_sale_items_sale_idx" ON "public"."pos_sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_shifts_org_status_idx" ON "public"."pos_shifts" USING btree ("org_id","status");

-- Modul Kas & Bank: tabel kas_bank_entries + kas_bank_seq_counters.
-- Ditulis tangan karena `drizzle-kit generate` crash repo-wide
-- (TypeError BigInt serialization pada kolom numeric mode bigint) —
-- sinkronkan meta snapshot saat bug generate upstream teratasi.
-- Idempoten (IF NOT EXISTS). Kepemilikan objek:
--   migrasi ini  -> tabel + indeks
--   rls.sql      -> RLS policy (array generik org_id)
CREATE TABLE IF NOT EXISTS "kas_bank_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id"),
	"kind" text NOT NULL,
	"entry_date" date NOT NULL,
	"cash_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
	"counter_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
	"contact_id" uuid REFERENCES "public"."contacts"("id"),
	"amount_minor" numeric NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"number" text NOT NULL,
	"journal_entry_id" uuid REFERENCES "public"."journal_entries"("id"),
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kas_bank_seq_counters" (
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id"),
	"year" text NOT NULL,
	"kind" text NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "kas_bank_seq_counters_org_id_year_kind_pk" PRIMARY KEY("org_id","year","kind")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kas_bank_org_number_uq" ON "public"."kas_bank_entries" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kas_bank_org_date_idx" ON "public"."kas_bank_entries" USING btree ("org_id","entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kas_bank_org_kind_idx" ON "public"."kas_bank_entries" USING btree ("org_id","kind");

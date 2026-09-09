-- Kartu beban dibayar di muka per kontrak + jadwal amortisasi. Idempoten.
CREATE TABLE IF NOT EXISTS "prepaid_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"vendor" text,
	"control_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
	"expense_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
	"payment_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id"),
	"total_minor" numeric NOT NULL,
	"start_date" date NOT NULL,
	"months" integer NOT NULL,
	"monthly_minor" numeric NOT NULL,
	"accumulated_minor" numeric DEFAULT '0' NOT NULL,
	"remaining_minor" numeric NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prepaid_schedule_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
	"contract_id" uuid NOT NULL REFERENCES "public"."prepaid_contracts"("id") ON DELETE cascade,
	"period_name" varchar(7) NOT NULL,
	"amort_date" date NOT NULL,
	"amount_minor" numeric NOT NULL,
	"accumulated_minor" numeric NOT NULL,
	"remaining_minor" numeric NOT NULL,
	"journal_entry_id" uuid REFERENCES "public"."journal_entries"("id"),
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prepaid_contracts_org_code_uq" ON "public"."prepaid_contracts" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prepaid_sched_contract_period_uq" ON "public"."prepaid_schedule_lines" USING btree ("contract_id","period_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prepaid_sched_org_period_idx" ON "public"."prepaid_schedule_lines" USING btree ("org_id","period_name");--> statement-breakpoint
-- Backfill kontrol untuk org yang sudah punya akun 1600 / 1500:
INSERT INTO "public"."subledger_controls" ("org_id","kind","control_account_id")
SELECT a."org_id", 'DIMUKA', a."id" FROM "public"."accounts" a
WHERE a."code" = '1600' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "public"."subledger_controls" ("org_id","kind","control_account_id")
SELECT a."org_id", 'ASET_TETAP', a."id" FROM "public"."accounts" a
WHERE a."code" = '1500' ON CONFLICT DO NOTHING;

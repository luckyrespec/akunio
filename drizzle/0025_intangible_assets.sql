-- Aset takberwujud SAK EMKM Bab 12 (cermin fixed_assets, tanpa residu/tanah).
-- Ditulis tangan (drizzle-kit generate crash repo-wide, BigInt serialization).
CREATE TABLE IF NOT EXISTS "intangible_assets" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "code" varchar(32) NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "acquisition_date" date NOT NULL,
  "in_service_date" date NOT NULL,
  "acquisition_cost_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
  "useful_life_months" integer NOT NULL,
  "amortization_method" text DEFAULT 'STRAIGHT_LINE' NOT NULL,
  "asset_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "accumulated_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "amortization_expense_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "acquisition_posted" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intangible_assets_org_code_uq" ON "intangible_assets" ("org_id", "code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intangible_amortization_lines" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "intangible_assets"("id") ON DELETE CASCADE,
  "period_name" varchar(7) NOT NULL,
  "amortization_date" date NOT NULL,
  "amortization_amount_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
  "accumulated_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
  "book_value_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
  "journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "status" text DEFAULT 'SCHEDULED' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intangible_amor_asset_period_uq" ON "intangible_amortization_lines" ("asset_id", "period_name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intangible_disposals" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "intangible_assets"("id") ON DELETE CASCADE,
  "disposal_date" date NOT NULL,
  "disposal_type" text NOT NULL,
  "proceeds_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
  "book_value_at_disposal_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
  "gain_loss_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
  "deposit_account_id" uuid REFERENCES "accounts"("id"),
  "gain_loss_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "journal_entry_id" uuid NOT NULL REFERENCES "journal_entries"("id"),
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "itb_seq_counters" (
  "org_id" uuid NOT NULL,
  "year" integer NOT NULL,
  PRIMARY KEY ("org_id", "year"),
  "last_seq" integer DEFAULT 0 NOT NULL
);

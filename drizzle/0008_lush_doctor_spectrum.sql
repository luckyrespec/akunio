CREATE TABLE "asset_depreciation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"period_name" varchar(7) NOT NULL,
	"depreciation_date" date NOT NULL,
	"depreciation_amount_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"accumulated_depreciation_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"book_value_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_disposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"disposal_date" date NOT NULL,
	"disposal_type" text NOT NULL,
	"proceeds_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"book_value_at_disposal_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"gain_loss_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"deposit_account_id" uuid,
	"gain_loss_account_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"acquisition_date" date NOT NULL,
	"in_service_date" date NOT NULL,
	"acquisition_cost_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"salvage_value_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"useful_life_months" integer NOT NULL,
	"depreciation_method" text NOT NULL,
	"depreciation_rate_percent" numeric(5, 2),
	"asset_account_id" uuid NOT NULL,
	"accumulated_dep_account_id" uuid NOT NULL,
	"depreciation_expense_account_id" uuid NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_depreciation_lines" ADD CONSTRAINT "asset_depreciation_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_depreciation_lines" ADD CONSTRAINT "asset_depreciation_lines_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_depreciation_lines" ADD CONSTRAINT "asset_depreciation_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_deposit_account_id_accounts_id_fk" FOREIGN KEY ("deposit_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_gain_loss_account_id_accounts_id_fk" FOREIGN KEY ("gain_loss_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_asset_account_id_accounts_id_fk" FOREIGN KEY ("asset_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_accumulated_dep_account_id_accounts_id_fk" FOREIGN KEY ("accumulated_dep_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_depreciation_expense_account_id_accounts_id_fk" FOREIGN KEY ("depreciation_expense_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_dep_asset_period_uq" ON "asset_depreciation_lines" USING btree ("asset_id","period_name");--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_assets_org_code_uq" ON "fixed_assets" USING btree ("org_id","code");
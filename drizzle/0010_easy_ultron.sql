CREATE TABLE "journal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"file_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"barcode" varchar(64),
	"unit" varchar(32) DEFAULT 'Pcs' NOT NULL,
	"category" varchar(64),
	"min_stock_alert" numeric(12, 4) DEFAULT '0',
	"current_qty" numeric(12, 4) DEFAULT '0' NOT NULL,
	"total_cost_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"average_cost_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"standard_selling_price_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"date" date NOT NULL,
	"initial_qty" numeric(12, 4) NOT NULL,
	"remaining_qty" numeric(12, 4) NOT NULL,
	"unit_cost_minor" numeric(18, 0) NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"valuation_method" text DEFAULT 'WEIGHTED_AVERAGE' NOT NULL,
	"recording_method" text DEFAULT 'PERPETUAL' NOT NULL,
	"inventory_account_id" uuid,
	"cogs_account_id" uuid,
	"adjustment_loss_account_id" uuid,
	"adjustment_gain_account_id" uuid,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"qty" numeric(12, 4) NOT NULL,
	"unit_cost_minor" numeric(18, 0) NOT NULL,
	"total_cost_minor" numeric(18, 0) NOT NULL,
	"resulting_qty" numeric(12, 4) NOT NULL,
	"resulting_total_cost_minor" numeric(18, 0) NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_opname_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opname_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"system_qty" numeric(12, 4) NOT NULL,
	"physical_qty" numeric(12, 4) NOT NULL,
	"difference_qty" numeric(12, 4) NOT NULL,
	"unit_cost_minor" numeric(18, 0) NOT NULL,
	"difference_value_minor" numeric(18, 0) NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "stock_opnames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" varchar(32) NOT NULL,
	"opname_date" date NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"total_difference_value_minor" numeric(18, 0) DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "gemini_interaction_id" text;--> statement-breakpoint
ALTER TABLE "journal_documents" ADD CONSTRAINT "journal_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_documents" ADD CONSTRAINT "journal_documents_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_documents" ADD CONSTRAINT "journal_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_inventory_account_id_accounts_id_fk" FOREIGN KEY ("inventory_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_cogs_account_id_accounts_id_fk" FOREIGN KEY ("cogs_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_adjustment_loss_account_id_accounts_id_fk" FOREIGN KEY ("adjustment_loss_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_adjustment_gain_account_id_accounts_id_fk" FOREIGN KEY ("adjustment_gain_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_opname_id_stock_opnames_id_fk" FOREIGN KEY ("opname_id") REFERENCES "public"."stock_opnames"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jd_entry_doc_uq" ON "journal_documents" USING btree ("entry_id","document_id");--> statement-breakpoint
CREATE INDEX "jd_entry_idx" ON "journal_documents" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_org_code_uq" ON "inventory_items" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_settings_org_uq" ON "inventory_settings" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_opnames_org_number_uq" ON "stock_opnames" USING btree ("org_id","number");
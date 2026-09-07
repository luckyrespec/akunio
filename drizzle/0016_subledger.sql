-- Fondasi subledger: registry kontrol + jejak GL<->pembantu.
-- Idempoten (IF NOT EXISTS). RLS dimiliki rls.sql.
CREATE TABLE IF NOT EXISTS "subledger_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"control_account_id" uuid NOT NULL REFERENCES "public"."accounts"("id") ON DELETE restrict,
	"allow_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subledger_journal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
	"journal_line_id" uuid NOT NULL REFERENCES "public"."journal_lines"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"amount_minor" numeric NOT NULL,
	"qty" numeric(12,4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subledger_controls_org_kind_uq" ON "public"."subledger_controls" USING btree ("org_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subledger_controls_org_account_uq" ON "public"."subledger_controls" USING btree ("org_id","control_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subledger_links_line_idx" ON "public"."subledger_journal_links" USING btree ("journal_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subledger_links_org_kind_ref_idx" ON "public"."subledger_journal_links" USING btree ("org_id","kind","ref_id");

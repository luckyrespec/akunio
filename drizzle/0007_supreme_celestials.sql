CREATE TABLE "bank_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"statement_date" date NOT NULL,
	"statement_balance_minor" numeric NOT NULL,
	"ledger_balance_minor" numeric NOT NULL,
	"difference_minor" numeric DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"file_url" text,
	"completed_at" timestamp with time zone,
	"completed_by" varchar(255),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reconciliation_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"amount_minor" numeric NOT NULL,
	"reference_number" varchar(100),
	"match_status" text DEFAULT 'UNMATCHED' NOT NULL,
	"matched_journal_line_id" uuid,
	"confidence_score" integer,
	"ai_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matched_journal_line_id_journal_lines_id_fk" FOREIGN KEY ("matched_journal_line_id") REFERENCES "public"."journal_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_rec_org_idx" ON "bank_reconciliations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bank_rec_account_idx" ON "bank_reconciliations" USING btree ("org_id","bank_account_id");--> statement-breakpoint
CREATE INDEX "stmt_lines_rec_idx" ON "bank_statement_lines" USING btree ("reconciliation_id");--> statement-breakpoint
CREATE INDEX "stmt_lines_status_idx" ON "bank_statement_lines" USING btree ("reconciliation_id","match_status");
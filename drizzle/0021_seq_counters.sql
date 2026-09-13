CREATE TABLE IF NOT EXISTS "invoice_seq_counters" (
  "org_id" uuid NOT NULL,
  "year" integer NOT NULL,
  "type" text NOT NULL CHECK ("type" IN ('INVOICE','BILL')),
  "last_seq" integer NOT NULL DEFAULT 0,
  CONSTRAINT "invoice_seq_counters_pk" PRIMARY KEY ("org_id","year","type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ast_seq_counters" (
  "org_id" uuid NOT NULL,
  "year" integer NOT NULL,
  "last_seq" integer NOT NULL DEFAULT 0,
  CONSTRAINT "ast_seq_counters_pk" PRIMARY KEY ("org_id","year")
);

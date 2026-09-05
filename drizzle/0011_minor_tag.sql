CREATE TABLE "sak_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" text NOT NULL,
	"version" text NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

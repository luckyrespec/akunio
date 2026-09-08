-- Ingatan Akunio lintas sesi: fakta/preferensi/profil + ringkasan thread.
-- Ditulis tangan (drizzle-kit generate crash BigInt). Idempoten (IF NOT EXISTS).
-- Kepemilikan objek:
--   migrasi ini -> tabel + indeks
--   rls.sql      -> RLS policy (tenant org_id)
CREATE TABLE IF NOT EXISTS "assistant_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"source_thread_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_memories_org_idx" ON "public"."assistant_memories" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_memories_org_kind_idx" ON "public"."assistant_memories" USING btree ("org_id","kind");

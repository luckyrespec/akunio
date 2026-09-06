-- Persediaan: counter SKU per-org + app_barcode unik + thumbnail barang.
-- Ditulis tangan karena `drizzle-kit generate` crash repo-wide
-- (TypeError BigInt serialization pada kolom numeric mode bigint).
-- Idempoten (IF NOT EXISTS). Kepemilikan objek:
--   migrasi ini  -> tabel + kolom + indeks
--   rls.sql      -> RLS policy (array generik org_id)
CREATE TABLE IF NOT EXISTS "inventory_sku_counters" (
	"org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	"last_seq" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_sku_counters_org_id_pk" PRIMARY KEY("org_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "app_barcode" varchar(16);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "image_storage_key" text;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "image_mime" varchar(32);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_org_app_barcode_uq" ON "public"."inventory_items" USING btree ("org_id","app_barcode");

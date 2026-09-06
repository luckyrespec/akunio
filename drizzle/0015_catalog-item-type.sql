-- Katalog Barang+Jasa: kolom tipe + akun per item + FK faktur.
-- Ditulis tangan (drizzle-kit generate crash BigInt). Idempoten (IF NOT EXISTS).
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "item_type" text DEFAULT 'BARANG' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "revenue_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "expense_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "catalog_item_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_items_catalog_idx" ON "public"."invoice_items" USING btree ("catalog_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_org_type_idx" ON "public"."inventory_items" USING btree ("org_id","item_type");

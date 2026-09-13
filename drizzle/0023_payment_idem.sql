-- Dedup baris pelunasan (Ruling R8): kunci idempotency per invoice.
-- Tanpa kolom org_id (isolasi via join ke invoices); unik per (invoice_id, key)
-- sehingga key yang sama di invoice berbeda tetap record berbeda.
-- Ditulis tangan (drizzle-kit generate crash repo-wide, BigInt serialization).
ALTER TABLE "invoice_payments" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_payments_inv_idem_uq" ON "invoice_payments" ("invoice_id", "idempotency_key");
--> statement-breakpoint

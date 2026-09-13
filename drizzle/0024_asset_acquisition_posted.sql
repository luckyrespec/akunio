-- Penanda jurnal perolehan aset (Task C4): false = kartu BELUM_DIJURNAL.
-- Ditulis tangan (drizzle-kit generate crash repo-wide, BigInt serialization).
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "acquisition_posted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- FK self-reference reversal_of_id -> journal_entries.id (tutup orphan reversal).
-- Ditulis tangan (drizzle-kit generate crash repo-wide, BigInt serialization).
-- Idempoten via DO block agar aman dijalankan ulang.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'je_reversal_of_fk') THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "je_reversal_of_fk"
      FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id");
  END IF;
END $$;
--> statement-breakpoint

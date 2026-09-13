-- Modul Pajak UMKM (PP 55/2022) & SAK EMKM Bab 15
CREATE TABLE IF NOT EXISTS tax_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_month VARCHAR(7) NOT NULL,
  tax_year INTEGER NOT NULL,
  gross_revenue_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  cumulative_year_revenue_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  taxable_revenue_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  tax_due_minor NUMERIC(18, 0) NOT NULL DEFAULT 0,
  accrual_draft_id UUID REFERENCES ai_drafts(id) ON DELETE SET NULL,
  accrual_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  payment_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  ntpn VARCHAR(30),
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'UNPROCESSED' CHECK (status IN ('UNPROCESSED', 'DRAFTED', 'ACCRUED', 'PAID')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tax_summaries_org_month_uq
  ON tax_summaries (org_id, period_month);

CREATE INDEX IF NOT EXISTS tax_summaries_org_year_idx
  ON tax_summaries (org_id, tax_year);

-- Perbarui constraint source di journal_entries agar mencakup 'TAX' + kas-bank
-- KANONIS: satu-satunya definisi je_source_chk. Source baru ditambah di sini + src/server/db/schema/journal.ts + src/core/journals/types.ts.
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS je_source_chk;
ALTER TABLE journal_entries ADD CONSTRAINT je_source_chk
  CHECK (source IN ('MANUAL','AI','DOCUMENT','IMPORT','STOCK_OPNAME','TAX','KAS_BAYAR','KAS_TERIMA','KAS_TRANSFER','DIMUKA','POS','POS_SELISIH'));

ALTER TABLE tax_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_summaries FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tax_summaries' AND policyname = 'tenant_isolation_tax_summaries') THEN
    CREATE POLICY tenant_isolation_tax_summaries ON tax_summaries
      USING (org_id = current_setting('app.current_org', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_org')::uuid);
  END IF;
END $$;

-- M2 hardening (from M1 final review): indexes + status CHECK constraints.
CREATE INDEX IF NOT EXISTS journal_lines_entry_id_idx ON journal_lines (entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS je_reversal_once_uq
  ON journal_entries (reversal_of_id) WHERE reversal_of_id IS NOT NULL;

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS je_status_chk;
ALTER TABLE journal_entries ADD CONSTRAINT je_status_chk
  CHECK (status IN ('DRAFT','POSTED'));
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS je_source_chk;
ALTER TABLE journal_entries ADD CONSTRAINT je_source_chk
  CHECK (source IN ('MANUAL','AI','DOCUMENT','IMPORT','STOCK_OPNAME'));
ALTER TABLE fiscal_periods DROP CONSTRAINT IF EXISTS period_status_chk;
ALTER TABLE fiscal_periods ADD CONSTRAINT period_status_chk
  CHECK (status IN ('OPEN','CLOSED','LOCKED'));
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS member_role_chk;
ALTER TABLE memberships ADD CONSTRAINT member_role_chk
  CHECK (role IN ('OWNER','ACCOUNTANT','VIEWER'));

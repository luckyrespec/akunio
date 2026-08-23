-- Posted journal entries are immutable. Corrections happen via reversing entries.
CREATE OR REPLACE FUNCTION forbid_posted_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_POSTED: jurnal yang sudah diposting tidak boleh diubah';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER je_no_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW WHEN (OLD.status = 'POSTED')
  EXECUTE FUNCTION forbid_posted_mutation();

CREATE TRIGGER je_no_delete BEFORE DELETE ON journal_entries
  FOR EACH ROW WHEN (OLD.status = 'POSTED')
  EXECUTE FUNCTION forbid_posted_mutation();

-- Lines of a POSTED entry are frozen too (draft lines stay editable).
CREATE OR REPLACE FUNCTION guard_journal_lines() RETURNS trigger AS $$
DECLARE entry_status TEXT;
BEGIN
  SELECT status INTO entry_status FROM journal_entries
    WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF entry_status = 'POSTED' THEN
    RAISE EXCEPTION 'IMMUTABLE_POSTED: baris jurnal terkunci';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER jl_immutable AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION guard_journal_lines();

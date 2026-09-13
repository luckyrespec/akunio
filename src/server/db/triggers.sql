-- Posted journal entries are immutable. Corrections happen via reversing entries.
CREATE OR REPLACE FUNCTION forbid_posted_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_POSTED: jurnal yang sudah diposting tidak boleh diubah';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS je_no_update ON journal_entries;
CREATE TRIGGER je_no_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW WHEN (OLD.status = 'POSTED')
  EXECUTE FUNCTION forbid_posted_mutation();

DROP TRIGGER IF EXISTS je_no_delete ON journal_entries;
CREATE TRIGGER je_no_delete BEFORE DELETE ON journal_entries
  FOR EACH ROW WHEN (OLD.status = 'POSTED')
  EXECUTE FUNCTION forbid_posted_mutation();

-- Lines of a POSTED entry are frozen too (draft lines stay editable).
-- UPDATE checks BOTH sides: moving a line OUT of a POSTED entry
-- (OLD.entry_id) or INTO one (NEW.entry_id) is rejected. No domain code
-- touches journal_lines.entry_id after creation, but the DB must not
-- rely on that.
CREATE OR REPLACE FUNCTION guard_journal_lines() RETURNS trigger AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO new_status FROM journal_entries
      WHERE id = NEW.entry_id;
    IF new_status = 'POSTED' THEN
      RAISE EXCEPTION 'IMMUTABLE_POSTED: baris jurnal terkunci';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT status INTO old_status FROM journal_entries
      WHERE id = OLD.entry_id;
    IF old_status = 'POSTED' THEN
      RAISE EXCEPTION 'IMMUTABLE_POSTED: baris jurnal terkunci';
    END IF;
  ELSE
    SELECT status INTO old_status FROM journal_entries
      WHERE id = OLD.entry_id;
    SELECT status INTO new_status FROM journal_entries
      WHERE id = NEW.entry_id;
    IF old_status = 'POSTED' OR new_status = 'POSTED' THEN
      RAISE EXCEPTION 'IMMUTABLE_POSTED: baris jurnal terkunci';
    END IF;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jl_immutable ON journal_lines;
CREATE TRIGGER jl_immutable AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION guard_journal_lines();

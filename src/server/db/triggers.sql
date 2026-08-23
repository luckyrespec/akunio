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

-- NOTE: jl_immutable does NOT guard re-parenting a line OUT of a posted
-- entry: UPDATE journal_lines SET entry_id = <draft> passes because
-- guard_journal_lines coalesces to NEW.entry_id (the draft). Unreachable via
-- domain code today — no code path touches journal_lines.entry_id after
-- creation.
CREATE TRIGGER jl_immutable AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION guard_journal_lines();

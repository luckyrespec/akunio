-- Lampiran data dukung per entri jurnal (idempotent).
CREATE TABLE IF NOT EXISTS journal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id),
  entry_id uuid NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  file_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT jd_entry_doc_uq UNIQUE (entry_id, document_id)
);
CREATE INDEX IF NOT EXISTS jd_entry_idx ON journal_documents (entry_id);

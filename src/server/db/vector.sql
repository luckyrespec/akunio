DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback for dev Postgres without pgvector binaries: create a
    -- lightweight domain so `vector` columns still resolve (stored as text
    -- JSON arrays, searched in JS). Production uses the real extension.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
      CREATE DOMAIN vector AS text;
    END IF;
    RAISE NOTICE 'pgvector extension not available — using text fallback for vector columns';
END $$;

-- Row Level Security: app connects as app_user; superuser bypasses by design.
-- NOTE: 'organizations' is handled separately below — it is keyed by id, not org_id,
-- so it must be excluded from the org_id-policy loop.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['memberships','accounts','fiscal_periods',
                           'journal_entries','journal_lines','journal_seq_counters','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s ON %I
      USING (org_id = current_setting('app.current_org', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_org')::uuid)
    $p$, t, t);
  END LOOP;
END $$;

-- organizations itself is keyed by id, not org_id:
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_organizations ON organizations
  USING (id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (true);

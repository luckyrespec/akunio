-- Row Level Security: app connects as app_user; superuser bypasses by design.
-- Idempotent: every policy is created inside a DO block that checks pg_policies,
-- so re-running this file is always safe (apply-sql.mjs tolerates only per-file
-- skips, so files must be error-free on rerun).
-- NOTE: 'organizations' is keyed by id, not org_id — handled separately below.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['memberships','accounts','fiscal_periods',
                           'journal_entries','journal_lines','journal_seq_counters','audit_log',
                           'documents','ai_drafts',
                            'tenant_chunks','chat_threads','onboarding_messages','org_profiles','ai_findings','ai_proposals',
                           'contacts','invoices','bank_reconciliations',
                           'fixed_assets','asset_depreciation_lines','asset_disposals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = format('tenant_isolation_%s', t)) THEN
      EXECUTE format($p$
        CREATE POLICY tenant_isolation_%s ON %I
        USING (org_id = current_setting('app.current_org', true)::uuid)
        WITH CHECK (org_id = current_setting('app.current_org')::uuid)
      $p$, t, t);
    END IF;
  END LOOP;
END $$;

-- invoice_items and invoice_payments are isolated via invoices.org_id:
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoice_items' AND policyname = 'tenant_isolation_invoice_items') THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_invoice_items ON invoice_items
      USING (EXISTS (
        SELECT 1 FROM invoices inv
        WHERE inv.id = invoice_items.invoice_id
          AND inv.org_id = current_setting('app.current_org', true)::uuid
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM invoices inv
        WHERE inv.id = invoice_items.invoice_id
          AND inv.org_id = current_setting('app.current_org')::uuid
      ))
    $p$;
  END IF;
END $$;

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoice_payments' AND policyname = 'tenant_isolation_invoice_payments') THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_invoice_payments ON invoice_payments
      USING (EXISTS (
        SELECT 1 FROM invoices inv
        WHERE inv.id = invoice_payments.invoice_id
          AND inv.org_id = current_setting('app.current_org', true)::uuid
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM invoices inv
        WHERE inv.id = invoice_payments.invoice_id
          AND inv.org_id = current_setting('app.current_org')::uuid
      ))
    $p$;
  END IF;
END $$;

-- bank_statement_lines are isolated via bank_reconciliations.org_id:
ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_statement_lines' AND policyname = 'tenant_isolation_bank_statement_lines') THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_bank_statement_lines ON bank_statement_lines
      USING (EXISTS (
        SELECT 1 FROM bank_reconciliations rec
        WHERE rec.id = bank_statement_lines.reconciliation_id
          AND rec.org_id = current_setting('app.current_org', true)::uuid
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM bank_reconciliations rec
        WHERE rec.id = bank_statement_lines.reconciliation_id
          AND rec.org_id = current_setting('app.current_org')::uuid
      ))
    $p$;
  END IF;
END $$;

-- organizations itself is keyed by id, not org_id:
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'tenant_isolation_organizations') THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_organizations ON organizations
      USING (id = current_setting('app.current_org', true)::uuid)
      WITH CHECK (true)
    $p$;
  END IF;
END $$;

-- chat_messages is isolated via its thread's org_id:
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'tenant_isolation_chat_messages') THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_chat_messages ON chat_messages
      USING (EXISTS (
        SELECT 1 FROM chat_threads ct
        WHERE ct.id = chat_messages.thread_id
          AND ct.org_id = current_setting('app.current_org', true)::uuid
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM chat_threads ct
        WHERE ct.id = chat_messages.thread_id
          AND ct.org_id = current_setting('app.current_org', true)::uuid
      ))
    $p$;
  END IF;
END $$;

-- Katalog Barang+Jasa: CHECK tipe + FK katalog/akun (idempoten, DO blocks).
-- Kolom + indeks dimiliki drizzle/0015_catalog-item-type.sql; file ini hanya constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_type_chk') THEN
    ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_type_chk CHECK (item_type IN ('BARANG','JASA'));
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_catalog_fk') THEN
    ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_catalog_fk FOREIGN KEY (catalog_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_revenue_fk') THEN
    ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_revenue_fk FOREIGN KEY (revenue_account_id) REFERENCES accounts(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_expense_fk') THEN
    ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_expense_fk FOREIGN KEY (expense_account_id) REFERENCES accounts(id);
  END IF;
END $$;

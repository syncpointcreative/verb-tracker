-- ─────────────────────────────────────────────────────────────────────────────
-- Add Junkless products so the Slack → Drive → Monday pipeline can route
-- JUNK-PBVP-... filenames to a valid product row. Without this, assets are
-- silently skipped at ingest (no product fallback for new clients).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  jk UUID;
BEGIN
  SELECT id INTO jk FROM clients WHERE slug = 'junkless';
  IF jk IS NULL THEN
    RAISE EXCEPTION 'Junkless client not found — run add_junkless_client_epat_delivery_init.sql first';
  END IF;

  INSERT INTO products (client_id, name, sort_order) VALUES
    (jk, 'Protein Bar Variety Pack', 1),
    (jk, 'Granola Bar Variety Pack',  2)
  ON CONFLICT DO NOTHING;
END $$;

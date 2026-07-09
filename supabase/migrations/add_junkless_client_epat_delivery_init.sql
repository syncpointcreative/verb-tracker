-- ─────────────────────────────────────────────────────────────────────────────
-- Add Junkless client and initialise monthly_deliveries rows for
-- Junkless and E-Patrol so the asset counter bar appears on the dashboard.
-- ─────────────────────────────────────────────────────────────────────────────

-- Insert Junkless client (idempotent)
INSERT INTO clients (name, slug, color_hex, tracks_deliveries)
VALUES ('Junkless', 'junkless', '#374151', true)
ON CONFLICT (slug) DO NOTHING;

-- Ensure E-Patrol tracks deliveries (should already be true, but make it explicit)
UPDATE clients SET tracks_deliveries = true WHERE slug = 'e-patrol';

-- Seed a current-month delivery row for Junkless (0/30 — engine will sync from there)
INSERT INTO monthly_deliveries (client_id, month, delivered, quota)
SELECT id, date_trunc('month', now())::date, 0, 30
FROM clients WHERE slug = 'junkless'
ON CONFLICT (client_id, month) DO NOTHING;

-- Seed a current-month delivery row for E-Patrol if missing
INSERT INTO monthly_deliveries (client_id, month, delivered, quota)
SELECT id, date_trunc('month', now())::date, 0, 30
FROM clients WHERE slug = 'e-patrol'
ON CONFLICT (client_id, month) DO NOTHING;

-- ─────────────────────────────────────────
-- Add clients.tracks_deliveries flag
-- Hides the monthly delivery counter for clients we don't run social
-- assets for (Biom, Momofuku). Default true so all other clients keep
-- their counter. The delivery engine (refreshDeliveredCount) also skips
-- clients where this is false, so no rows are regenerated for them.
-- ─────────────────────────────────────────

ALTER TABLE clients ADD COLUMN IF NOT EXISTS tracks_deliveries boolean NOT NULL DEFAULT true;

UPDATE clients SET tracks_deliveries = false WHERE slug IN ('biom','momofuku');

-- Remove their delivery rows so nothing lingers behind the hidden bar
DELETE FROM monthly_deliveries
WHERE client_id IN (SELECT id FROM clients WHERE slug IN ('biom','momofuku'));

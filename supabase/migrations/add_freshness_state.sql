-- Performance-based freshness scoring (Ishmael analyzer writes these).
-- Additive, non-destructive. Applied to production 2026-06-23.
--   freshness_state     : still_performing | underperforming | needs_replacing | under_delivered
--   freshness_detail    : human-readable "why" (e.g. "ROAS 0.26 (attributed)")
--   freshness_scored_at : when the analyzer last scored this asset
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS freshness_state text,
  ADD COLUMN IF NOT EXISTS freshness_detail text,
  ADD COLUMN IF NOT EXISTS freshness_scored_at timestamptz;

-- Replacement-reason scorecard (Ishmael analyzer writes this).
-- Additive, non-destructive. Set only when freshness_state = 'needs_replacing'.
--   freshness_reason : faded          — performed early, then declined (remix the concept)
--                      never_performed — underperformed from the start (don't repeat it)
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS freshness_reason text;

-- Track when each Spark Ad was first observed in the TikTok API.
-- Used by sync_spark_ads.py to compute accurate days_live (avoids the synced_at drift problem
-- where a sync started weeks after the ad launched would show 0 days live).
-- Set on INSERT only — never overwritten by subsequent syncs.

ALTER TABLE spark_ads
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ;

-- Backfill: for existing rows we don't have the real first-seen date,
-- so leave NULL. sync_spark_ads.py will fall back to assets.date_live for those rows.
-- New rows inserted by sync_spark_ads.py will have first_seen_at = now() on INSERT.

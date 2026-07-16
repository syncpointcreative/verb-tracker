-- asset_score_history: append-only log of every freshness score run for
-- regular (non-Spark) assets matched to TikTok campaigns.
-- Written by freshness_score.py. Enables "Past Performers" backlog alongside
-- spark_ad_score_history (which covers Spark Ads).
-- Additive, non-destructive. Applied 2026-07-16.

CREATE TABLE IF NOT EXISTS asset_score_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  asset_name       TEXT,
  stage            TEXT,
  scored_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  freshness_state  TEXT,
  freshness_reason TEXT,
  freshness_detail TEXT,
  spend            NUMERIC,
  impressions      INT,
  roas             NUMERIC,
  ctr              NUMERIC,
  cpc              NUMERIC,
  cpm              NUMERIC,
  watch_rate       NUMERIC,
  follows          INT,
  likes            INT
);

CREATE INDEX IF NOT EXISTS asset_score_history_asset_idx
  ON asset_score_history(asset_id);
CREATE INDEX IF NOT EXISTS asset_score_history_client_idx
  ON asset_score_history(client_id);
CREATE INDEX IF NOT EXISTS asset_score_history_scored_at_idx
  ON asset_score_history(scored_at DESC);
CREATE INDEX IF NOT EXISTS asset_score_history_state_idx
  ON asset_score_history(freshness_state);

-- Peak columns on assets: tracks the best score this asset ever achieved.
-- Mirrors the same columns added to spark_ads in add_spark_ad_score_history.sql.
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS peak_state        TEXT,
  ADD COLUMN IF NOT EXISTS peak_metric_name  TEXT,
  ADD COLUMN IF NOT EXISTS peak_metric_value NUMERIC,
  ADD COLUMN IF NOT EXISTS peak_at           TIMESTAMPTZ;

-- RLS: match existing policy pattern
ALTER TABLE asset_score_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_all" ON asset_score_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

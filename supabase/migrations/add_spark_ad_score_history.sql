-- Append-only log of every freshness score run for Spark Ads.
-- Written by sync_spark_ads.py each time a paused Spark Ad is scored.
-- Enables: reuse backlog, style/substance analysis, performance timelines.
-- Additive, non-destructive. Applied 2026-07-16.

CREATE TABLE IF NOT EXISTS spark_ad_score_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tiktok_item_id   TEXT NOT NULL,
  ad_name          TEXT,
  stage            TEXT,
  scored_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  freshness_state  TEXT,
  freshness_reason TEXT,
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

CREATE INDEX IF NOT EXISTS spark_ad_score_history_client_item_idx
  ON spark_ad_score_history(client_id, tiktok_item_id);
CREATE INDEX IF NOT EXISTS spark_ad_score_history_scored_at_idx
  ON spark_ad_score_history(scored_at DESC);
CREATE INDEX IF NOT EXISTS spark_ad_score_history_state_idx
  ON spark_ad_score_history(freshness_state);

-- Peak columns on spark_ads: tracks the best score this ad ever achieved.
-- peak_state       : best freshness_state ever recorded ('still_performing' is the ceiling)
-- peak_metric_name : which metric was key at peak (roas | ctr | watch_rate | eng_per_1k)
-- peak_metric_value: value of that metric at peak
-- peak_at          : when the peak score was first recorded
ALTER TABLE spark_ads
  ADD COLUMN IF NOT EXISTS peak_state        TEXT,
  ADD COLUMN IF NOT EXISTS peak_metric_name  TEXT,
  ADD COLUMN IF NOT EXISTS peak_metric_value NUMERIC,
  ADD COLUMN IF NOT EXISTS peak_at           TIMESTAMPTZ;

-- RLS: match existing policy pattern (authenticated users read/write all rows)
ALTER TABLE spark_ad_score_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_all" ON spark_ad_score_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

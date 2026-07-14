CREATE TABLE IF NOT EXISTS spark_ads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tiktok_item_id TEXT NOT NULL,
  ad_name       TEXT,
  campaign_name TEXT,
  adgroup_name  TEXT,
  ad_status     TEXT,
  synced_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, tiktok_item_id)
);
CREATE INDEX IF NOT EXISTS spark_ads_client_id_idx ON spark_ads(client_id);

-- Add ad_id column to spark_ads so score_pulled_spark_assets can build the
-- ad_id → tiktok_item_id lookup needed for TikTok's reporting API.
ALTER TABLE spark_ads ADD COLUMN IF NOT EXISTS ad_id TEXT;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS spark_item_id TEXT;
CREATE INDEX IF NOT EXISTS assets_spark_item_id_idx ON assets (spark_item_id) WHERE spark_item_id IS NOT NULL;

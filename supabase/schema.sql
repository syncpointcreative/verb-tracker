-- ─────────────────────────────────────────
-- VERB App — Supabase Schema
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────

-- Clients
CREATE TABLE clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,  -- url-safe: "flavcity", "home-laundry"
  color_hex   TEXT NOT NULL DEFAULT '#374151',
  drive_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Products per client
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, name)
);

-- Assets
CREATE TABLE assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stage            TEXT NOT NULL CHECK (stage IN ('Awareness','Consideration','Conversion')),
  asset_name       TEXT NOT NULL,
  content_type     TEXT,
  file_name        TEXT,
  status           TEXT NOT NULL DEFAULT 'Needs Refresh / Missing'
                   CHECK (status IN ('Ready to Upload','Live / Running','Expired','Needs Refresh / Missing')),
  date_added       DATE,
  posted_by        TEXT,
  notes            TEXT,
  slack_message_ts TEXT,
  slack_channel_id TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_assets_client   ON assets(client_id);
CREATE INDEX idx_assets_product  ON assets(product_id);
CREATE INDEX idx_assets_stage    ON assets(stage);
CREATE INDEX idx_assets_status   ON assets(status);
CREATE INDEX idx_products_client ON products(client_id);

-- Slack pull log (track what's been ingested)
CREATE TABLE slack_pulls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pulled_at    TIMESTAMPTZ DEFAULT now(),
  assets_found INT DEFAULT 0,
  assets_added INT DEFAULT 0,
  notes        TEXT
);

-- RLS: enable row level security (team members see everything)
ALTER TABLE clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_pulls ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read/write all rows
CREATE POLICY "team_all" ON clients     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON products    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON assets      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON slack_pulls FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role (used by API routes) bypasses RLS automatically

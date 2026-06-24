-- TikTok placement back-match (Ishmael analyzer writes these).
-- Additive, non-destructive. Lets the team see where a live asset actually runs
-- on TikTok so they can inspect / pull it down (still manual today).
--   tiktok_campaign  : distinct campaign name(s) the asset's ads run in (· joined, top-spend first)
--   tiktok_adgroup   : distinct ad-group name(s) the asset's ads run in
--   tiktok_synced_at : when the analyzer last matched this asset to TikTok
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS tiktok_campaign text,
  ADD COLUMN IF NOT EXISTS tiktok_adgroup text,
  ADD COLUMN IF NOT EXISTS tiktok_synced_at timestamptz;

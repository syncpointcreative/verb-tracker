-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add drive_url + monday_item_id to assets
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE assets ADD COLUMN IF NOT EXISTS drive_url       TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS monday_item_id  TEXT;

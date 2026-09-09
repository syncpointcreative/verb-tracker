-- ─────────────────────────────────────────
-- Quota rollover: once a client's monthly delivery quota is met, subsequent
-- assets get moved to next period's Drive folder AND counted as next period's
-- deliverable (date_added shifted forward). This adds:
--   1. drive_queue.override_month_folder — pre-computed "Month YYYY" folder name
--      that the drive-sync cron must use instead of deriving one from the
--      filename's date suffix.
--   2. quota_rollovers — audit log of every rollover event, so Seth can be
--      notified (notify-after, not a hard approval gate) and can manually pull
--      an asset from Drive if it turns out to be a reject.
-- Safe to re-run.
-- ─────────────────────────────────────────

ALTER TABLE drive_queue ADD COLUMN IF NOT EXISTS override_month_folder text;

CREATE TABLE IF NOT EXISTS quota_rollovers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            uuid REFERENCES assets(id),
  client_id           uuid REFERENCES clients(id),
  client_name         text NOT NULL,
  asset_name          text NOT NULL,
  original_date_added date NOT NULL,
  new_date_added      date NOT NULL,
  folder_name         text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  notified_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_quota_rollovers_unnotified
  ON quota_rollovers (notified_at) WHERE notified_at IS NULL;

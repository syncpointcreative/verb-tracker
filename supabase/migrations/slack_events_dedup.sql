-- ─────────────────────────────────────────
-- Slack event de-duplication
-- Slack re-delivers an event (same event_id) when the webhook doesn't ack
-- within 3 seconds. The approval handler (Monday + Drive) routinely exceeds
-- that, so re-deliveries created duplicate Monday cards and Drive-queue rows.
-- /api/slack records each event_id here first; a conflicting insert means the
-- event is a re-delivery and is skipped.
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS slack_events (
  event_id    TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE slack_events ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role webhook touches this table (bypasses RLS).

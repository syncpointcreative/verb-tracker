-- ─────────────────────────────────────────
-- FaceTub monthly quota: 30 → 10 (effective current period, May 19 2026)
-- Adds a per-client default_quota so the new quota persists for every
-- future period automatically (the delivery engine reads it for periods
-- without an explicit row). Past FaceTub periods keep their original 30.
-- Safe to re-run.
-- ─────────────────────────────────────────

ALTER TABLE clients ADD COLUMN IF NOT EXISTS default_quota int NOT NULL DEFAULT 30;

UPDATE clients SET default_quota = 10 WHERE slug = 'facetub';

-- Apply the new quota to the current period (May 19) and any existing later rows.
UPDATE monthly_deliveries md SET quota = 10
FROM clients c
WHERE md.client_id = c.id AND c.slug = 'facetub' AND md.month >= DATE '2026-05-19';

-- Recompute FaceTub rollover with the new quota.
DO $$
DECLARE
  c RECORD; bday INT; cur_start DATE; anchor DATE; p_start DATE; p_end DATE;
  q INT; produced INT; carry INT; raw INT; deliv INT; min_da DATE; mbase DATE; mcand DATE; guard DATE;
  prog_start DATE := DATE '2026-03-01';
  def_q INT;
BEGIN
  FOR c IN SELECT id, billing_day, default_quota FROM clients WHERE slug = 'facetub' LOOP
    bday  := COALESCE(c.billing_day, 1);
    def_q := COALESCE(c.default_quota, 30);

    mbase := date_trunc('month', CURRENT_DATE)::date;
    mcand := mbase + (bday - 1);
    cur_start := CASE WHEN CURRENT_DATE >= mcand THEN mcand ELSE (mbase - INTERVAL '1 month')::date + (bday - 1) END;

    SELECT MIN(date_added) INTO min_da FROM assets WHERE client_id = c.id AND ad_only = false AND date_added IS NOT NULL;
    IF min_da IS NULL THEN anchor := cur_start;
    ELSE
      mbase := date_trunc('month', min_da)::date; mcand := mbase + (bday - 1);
      anchor := CASE WHEN min_da >= mcand THEN mcand ELSE (mbase - INTERVAL '1 month')::date + (bday - 1) END;
      IF anchor > cur_start THEN anchor := cur_start; END IF;
    END IF;
    IF anchor < prog_start THEN anchor := prog_start; END IF;

    carry := 0; p_start := anchor; guard := (cur_start + INTERVAL '12 months')::date;
    LOOP
      EXIT WHEN p_start > guard;
      p_end := (p_start + INTERVAL '1 month')::date;
      SELECT quota INTO q FROM monthly_deliveries WHERE client_id = c.id AND month = p_start;
      IF q IS NULL THEN q := def_q; END IF;
      SELECT COUNT(*) INTO produced FROM assets WHERE client_id = c.id AND ad_only = false AND date_added >= p_start AND date_added < p_end;
      IF p_start > cur_start AND carry = 0 AND produced = 0
         AND NOT EXISTS (SELECT 1 FROM monthly_deliveries WHERE client_id = c.id AND month = p_start) THEN EXIT; END IF;
      raw := produced + carry; deliv := LEAST(raw, q); carry := GREATEST(0, raw - q);
      INSERT INTO monthly_deliveries (client_id, month, quota, baseline_delivered, delivered)
      VALUES (c.id, p_start, q, 0, deliv)
      ON CONFLICT (client_id, month) DO UPDATE SET quota = EXCLUDED.quota, baseline_delivered = 0, delivered = EXCLUDED.delivered;
      p_start := p_end;
    END LOOP;
  END LOOP;
END $$;

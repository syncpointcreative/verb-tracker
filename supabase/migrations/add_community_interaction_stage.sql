-- Add 'Community Interaction' (INT) as a fourth funnel stage.
-- The original inline CHECK constraint only allowed Awareness/Consideration/Conversion.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_stage_check;
ALTER TABLE assets ADD CONSTRAINT assets_stage_check
  CHECK (stage IN ('Awareness','Consideration','Conversion','Community Interaction'));

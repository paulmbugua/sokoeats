-- Add AI course entitlements
CREATE TABLE IF NOT EXISTS ai_course_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NULL,
  course_id text NOT NULL,
  course_source text NOT NULL DEFAULT 'catalog',
  purchase_type text NOT NULL DEFAULT 'certificate',
  max_lessons integer NOT NULL DEFAULT 60,
  lessons_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_course_entitlements_user_course_type
  ON ai_course_entitlements (user_id, course_id, purchase_type);
CREATE INDEX IF NOT EXISTS idx_ai_course_entitlements_user
  ON ai_course_entitlements (user_id);

-- Ensure updates bump updated_at
CREATE OR REPLACE FUNCTION trg_touch_ai_course_entitlements()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_ai_course_entitlements ON ai_course_entitlements;
CREATE TRIGGER trg_touch_ai_course_entitlements
BEFORE UPDATE ON ai_course_entitlements
FOR EACH ROW
EXECUTE PROCEDURE trg_touch_ai_course_entitlements();

-- Fee access flag on instructors
ALTER TABLE IF EXISTS org_instructor_profiles
  ADD COLUMN IF NOT EXISTS can_access_fees boolean NOT NULL DEFAULT false;

-- Only one fee-enabled instructor per org
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_org_instructor_fee_access'
  ) THEN
    CREATE UNIQUE INDEX ux_org_instructor_fee_access
      ON org_instructor_profiles(org_id)
      WHERE can_access_fees = true;
  END IF;
END$$;

-- Org branding for finance/principal signatures
ALTER TABLE IF EXISTS organizations
  ADD COLUMN IF NOT EXISTS finance_signature_url text,
  ADD COLUMN IF NOT EXISTS principal_signature_url text;

-- apps/backend/migrations/20260103_org_fee_access.sql
-- Enforce single designated instructor fee access

DO $$
DECLARE
  t regclass;
BEGIN
  SELECT to_regclass('public.org_instructors') INTO t;
  IF t IS NOT NULL THEN
    ALTER TABLE public.org_instructors
      ADD COLUMN IF NOT EXISTS can_access_fees boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS fee_access_granted_by_user_id bigint NULL,
      ADD COLUMN IF NOT EXISTS fee_access_updated_at timestamptz NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS org_instructors_fee_access_unique
      ON public.org_instructors (org_id)
      WHERE can_access_fees IS TRUE;
  END IF;
END $$;

DO $$
DECLARE
  t regclass;
BEGIN
  SELECT to_regclass('public.org_instructor_profiles') INTO t;
  IF t IS NOT NULL THEN
    ALTER TABLE public.org_instructor_profiles
      ADD COLUMN IF NOT EXISTS can_access_fees boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS fee_access_granted_by_user_id bigint NULL,
      ADD COLUMN IF NOT EXISTS fee_access_updated_at timestamptz NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS org_instructor_profiles_fee_access_unique
      ON public.org_instructor_profiles (org_id)
      WHERE can_access_fees IS TRUE;
  END IF;
END $$;

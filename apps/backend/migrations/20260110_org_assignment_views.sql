-- apps/backend/migrations/20260110_org_assignment_views.sql
-- Track instructor assignment openings

DO $$
DECLARE
  t regclass;
BEGIN
  SELECT to_regclass('public.org_assignment_views') INTO t;
  IF t IS NULL THEN
    CREATE TABLE public.org_assignment_views (
      id bigserial PRIMARY KEY,
      org_id bigint NOT NULL,
      assignment_id bigint NOT NULL,
      instructor_user_id bigint NOT NULL,
      opened_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, assignment_id, instructor_user_id)
    );

    CREATE INDEX IF NOT EXISTS org_assignment_views_org_idx
      ON public.org_assignment_views (org_id, assignment_id);
  END IF;
END $$;

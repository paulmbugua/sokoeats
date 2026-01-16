-- apps/backend/migrations/20260115_language_learning.sql
-- Language learning: courses metadata + messages + entitlements

DO $$
DECLARE
  t regclass;
BEGIN
  SELECT to_regclass('public.courses') INTO t;
  IF t IS NOT NULL THEN
    ALTER TABLE public.courses
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS source_kind TEXT;
  END IF;
END $$;

DO $$
DECLARE
  t regclass;
BEGIN
  SELECT to_regclass('public.ai_language_messages') INTO t;
  IF t IS NULL THEN
    CREATE TABLE public.ai_language_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
      profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
      user_id bigint NULL REFERENCES public.users(id) ON DELETE SET NULL,
      role text NOT NULL CHECK (role IN ('user','assistant')),
      content_text text NOT NULL,
      segments_json jsonb NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS ai_language_messages_course_id_idx
      ON public.ai_language_messages(course_id);
    CREATE INDEX IF NOT EXISTS ai_language_messages_profile_id_idx
      ON public.ai_language_messages(profile_id);
  END IF;
END $$;

DO $$
DECLARE
  t regclass;
BEGIN
  SELECT to_regclass('public.ai_language_entitlements') INTO t;
  IF t IS NULL THEN
    CREATE TABLE public.ai_language_entitlements (
      course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
      profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
      user_id bigint NULL REFERENCES public.users(id) ON DELETE SET NULL,
      target_language text NOT NULL,
      prompt_bundles int NOT NULL DEFAULT 1,
      prompts_used int NOT NULL DEFAULT 0,
      prompts_per_bundle int NOT NULL DEFAULT 300,
      unlocked_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz NULL,
      quiz_passed boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS ai_language_entitlements_profile_id_idx
      ON public.ai_language_entitlements(profile_id);
    CREATE INDEX IF NOT EXISTS ai_language_entitlements_user_id_idx
      ON public.ai_language_entitlements(user_id);
  END IF;
END $$;

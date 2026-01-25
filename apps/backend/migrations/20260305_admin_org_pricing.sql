-- apps/backend/migrations/20260305_admin_org_pricing.sql

DO $$
BEGIN
  IF to_regclass('public.org_plan_prices') IS NULL THEN
    CREATE TABLE public.org_plan_prices (
      id bigserial PRIMARY KEY,
      currency text NOT NULL CHECK (currency IN ('USD','KES')),
      tier text NOT NULL CHECK (tier IN ('pro','enterprise')),
      cycle text NOT NULL CHECK (cycle IN ('monthly','yearly')),
      amount_cents integer NOT NULL CHECK (amount_cents >= 0),
      active boolean NOT NULL DEFAULT true,
      note text NULL,
      updated_by_user_id bigint NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (currency, tier, cycle)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.org_subscriptions') IS NOT NULL THEN
    ALTER TABLE public.org_subscriptions
      ADD COLUMN IF NOT EXISTS cycle text,
      ADD COLUMN IF NOT EXISTS currency text,
      ADD COLUMN IF NOT EXISTS amount_cents integer,
      ADD COLUMN IF NOT EXISTS status text,
      ADD COLUMN IF NOT EXISTS cancel_at timestamptz,
      ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_by_user_id bigint;

    UPDATE public.org_subscriptions
       SET cycle = COALESCE(cycle, 'monthly')
     WHERE cycle IS NULL;

    UPDATE public.org_subscriptions
       SET currency = COALESCE(currency, 'USD')
     WHERE currency IS NULL;

    UPDATE public.org_subscriptions
       SET amount_cents = COALESCE(amount_cents, 0)
     WHERE amount_cents IS NULL;

    UPDATE public.org_subscriptions
       SET status = COALESCE(status, CASE WHEN active THEN 'active' ELSE 'canceled' END)
     WHERE status IS NULL;

    ALTER TABLE public.org_subscriptions
      ALTER COLUMN cycle SET DEFAULT 'monthly',
      ALTER COLUMN currency SET DEFAULT 'USD',
      ALTER COLUMN amount_cents SET DEFAULT 0,
      ALTER COLUMN status SET DEFAULT 'active';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org ON public.org_subscriptions (org_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON public.org_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_org_plan_prices_currency ON public.org_plan_prices (currency);

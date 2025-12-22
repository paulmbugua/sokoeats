-- 1) Map provider account (shortcode/bank) -> org
create table if not exists org_payment_accounts (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,

  provider text not null,          -- 'mpesa' | 'bank'
  account_ref text not null,       -- mpesa shortcode OR bank account identifier
  display_name text,
  webhook_secret text,             -- optional extra security
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists org_payment_accounts_uniq
  on org_payment_accounts(provider, account_ref);

create index if not exists org_payment_accounts_org_idx
  on org_payment_accounts(org_id);


-- 2) Store inbound payments (idempotent + auditable)
create table if not exists org_fee_inbound_transactions (
  id bigserial primary key,

  org_id uuid not null references organizations(id) on delete cascade,

  provider text not null,          -- 'mpesa' | 'bank'
  provider_ref text not null,      -- mpesa receipt / bank reference
  amount_cents bigint not null,
  currency text not null default 'KES',

  registration_ref text,           -- admission/registration number (BillRefNumber)
  matched_learner_id text,
  posted_payment_id bigint references org_fee_payments(id),

  raw jsonb not null default '{}'::jsonb,
  status text not null default 'received', -- received|unmatched|posted|ignored

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists org_fee_inbound_uniq
  on org_fee_inbound_transactions(org_id, provider, provider_ref);

create index if not exists org_fee_inbound_reg_idx
  on org_fee_inbound_transactions(org_id, registration_ref);

create index if not exists org_fee_inbound_status_idx
  on org_fee_inbound_transactions(org_id, status);

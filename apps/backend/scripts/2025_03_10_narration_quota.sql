-- apps/backend/scripts/2025_03_10_narration_quota.sql
-- Unique constraints for payment idempotency + subscription payments

-- payments(transaction_id) where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_unique
  ON public.payments (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- payments(mpesa_reference) where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_mpesa_reference_unique
  ON public.payments (mpesa_reference)
  WHERE mpesa_reference IS NOT NULL;

-- payments(provider, provider_order_id) where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_order_unique
  ON public.payments (provider, provider_order_id)
  WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL;

-- org_subscription_payments(provider_txn_id) where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_sub_payments_provider_txn_unique
  ON public.org_subscription_payments (provider_txn_id)
  WHERE provider_txn_id IS NOT NULL;

-- org_subscription_payments(provider, provider_order_id) where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_sub_payments_provider_order_unique
  ON public.org_subscription_payments (provider, provider_order_id)
  WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL;

-- org_subscription_payments(mpesa_reference) where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_sub_payments_mpesa_ref_unique
  ON public.org_subscription_payments (mpesa_reference)
  WHERE mpesa_reference IS NOT NULL;

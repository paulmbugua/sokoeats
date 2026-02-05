import type { Ga4Item } from './ga4';

export const safeNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const majorFromMinor = (minor: unknown, decimals = 2) => {
  const n = safeNumber(minor, NaN);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return n / factor;
};

type TokensPackageLike = {
  credits?: number | string | null;
  price?: number | string | null;
};

export const buildTokensItem = (selectedPackage?: TokensPackageLike | null): Ga4Item => {
  const credits = safeNumber(selectedPackage?.credits, 0);
  const price = safeNumber(selectedPackage?.price, NaN);

  return {
    item_id: `tokens_${credits}`,
    item_name: `${credits} Tokens`,
    item_category: 'tokens',
    price: Number.isFinite(price) && price > 0 ? price : undefined,
    quantity: 1,
  };
};

type OrgPlanItemArgs = {
  tier: string;
  cycle: string;
  seats?: number;
  amountMajor?: number;
  currency?: string;
};

export const buildOrgPlanItem = ({ tier, cycle, amountMajor }: OrgPlanItemArgs): Ga4Item => {
  const price = safeNumber(amountMajor, NaN);
  return {
    item_id: `org_${tier}_${cycle}`,
    item_name: `Org ${String(tier).toUpperCase()} (${cycle})`,
    item_category: 'subscription',
    item_variant: cycle,
    price: Number.isFinite(price) && price > 0 ? price : undefined,
    quantity: 1,
  };
};

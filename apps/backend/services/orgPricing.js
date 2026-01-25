// apps/backend/services/orgPricing.js
import pool from '../config/db.js';

export const ORG_SEATS = {
  starter: 50,
  pro: 500,
  enterprise: 5000,
};

// 👉 Set your real pricing here (sample values)
export const ORG_PRICING = {
  USD: {
    pro: { monthly: 99_00, yearly: 990_00 }, // $99 / $990
    enterprise: { monthly: 1_00, yearly: 3990_00 }, // $399 / $3990
  },
  KES: {
    pro: { monthly: 13500_00, yearly: 135000_00 }, // 13,500 / 135,000
    enterprise: { monthly: 55000_00, yearly: 550000_00 }, // 55,000 / 550,000
  },
};

export function resolvePrice(tier, cycle, currency) {
  const cu = (currency || '').toUpperCase();
  if (!['pro', 'enterprise'].includes(tier)) throw new Error('Invalid tier');
  if (!['monthly', 'yearly'].includes(cycle)) throw new Error('Invalid cycle');
  if (!['USD', 'KES'].includes(cu)) throw new Error('Invalid currency');
  const cents = ORG_PRICING[cu][tier][cycle];
  const seats = ORG_SEATS[tier];
  return { amount_cents: cents, seats, currency: cu };
}

export async function resolvePriceAsync(
  tier,
  cycle,
  currency,
  { client } = {},
) {
  const cu = (currency || '').toUpperCase();
  if (!['pro', 'enterprise'].includes(tier)) throw new Error('Invalid tier');
  if (!['monthly', 'yearly'].includes(cycle)) throw new Error('Invalid cycle');
  if (!['USD', 'KES'].includes(cu)) throw new Error('Invalid currency');

  const db = client || pool;
  const { rows } = await db.query(
    `SELECT amount_cents
       FROM org_plan_prices
      WHERE active = TRUE
        AND currency = $1
        AND tier = $2
        AND cycle = $3
      LIMIT 1`,
    [cu, tier, cycle],
  );
  const cents = Number.isFinite(rows[0]?.amount_cents)
    ? Number(rows[0].amount_cents)
    : ORG_PRICING[cu][tier][cycle];
  const seats = ORG_SEATS[tier];
  return { amount_cents: cents, seats, currency: cu };
}

// ✅ NEW: pricing table for portal display
export function getOrgPricingTable(currency) {
  const cu = (currency || 'USD').toUpperCase();
  if (!['USD', 'KES'].includes(cu)) throw new Error('Invalid currency');

  return {
    currency: cu,
    tiers: {
      starter: {
        seats: ORG_SEATS.starter,
        // starter is not sold via checkout in this pricing table
        monthly: null,
        yearly: null,
      },
      pro: {
        seats: ORG_SEATS.pro,
        monthly: ORG_PRICING[cu].pro.monthly,
        yearly: ORG_PRICING[cu].pro.yearly,
      },
      enterprise: {
        seats: ORG_SEATS.enterprise,
        monthly: ORG_PRICING[cu].enterprise.monthly,
        yearly: ORG_PRICING[cu].enterprise.yearly,
      },
    },
  };
}

export async function getOrgPricingTableAsync(currency, { client } = {}) {
  const table = getOrgPricingTable(currency);
  const cu = table.currency;
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT tier, cycle, amount_cents, active
       FROM org_plan_prices
      WHERE currency = $1`,
    [cu],
  );

  for (const row of rows) {
    if (!row?.active) continue;
    const tier = String(row.tier || '').toLowerCase();
    const cycle = String(row.cycle || '').toLowerCase();
    if (!['pro', 'enterprise'].includes(tier)) continue;
    if (!['monthly', 'yearly'].includes(cycle)) continue;
    table.tiers[tier][cycle] = Number(row.amount_cents);
  }

  return table;
}

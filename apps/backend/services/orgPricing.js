// apps/backend/services/orgPricing.js
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
    enterprise: { monthly: 55000_00, yearly: 5_00 }, // 55,000 / 550,000
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

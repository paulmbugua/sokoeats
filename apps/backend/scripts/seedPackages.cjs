// apps/backend/scripts/seedPackages.cjs
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,   // ⬅️ accept Railway's cert
  },
});

// ---- FX + helpers ----
// TOKEN_TO_USD is only used for non-starter tiers.
// e.g. TOKEN_TO_USD=1 means 1 token = $1 for tiers >= 10 credits (after discounts).
const TOKEN_TO_USD = Number(process.env.TOKEN_TO_USD ?? 1);     // default: 1 token = $1
const USD_TO_KES   = Number(process.env.USD_TO_KES ?? 133.75);  // default: $1 = KES 133.75

// Nice rounding for KES price tags (to nearest 10)
const roundKES = (n) => Math.round(n / 10) * 10;

// Discount ladder (no discount < 10 credits)
function discountPctForCredits(credits) {
  if (credits < 10) return 0.00;   // keep Starter (5) and 10- credits at full price
  if (credits >= 200) return 0.12; // 12%
  if (credits >= 100) return 0.10; // 10%
  if (credits >= 50)  return 0.08; // 8%
  if (credits >= 25)  return 0.06; // 6%
  if (credits >= 10)  return 0.04; // 4%
  return 0.00;
}

// ---- Package blueprint ----
const BLUEPRINT = [
 { credits: 5,    offer: 'Starter Pack'   }, // ⭐ special: 5 credits = $5.00
  { credits: 20,   offer: 'Basic Pack'     },
  { credits: 50,   offer: 'Standard Pack'  },
  { credits: 100,  offer: 'Premium Pack'   },
  { credits: 250,  offer: 'Pro Pack'       },
];

// Compute USD packages with discounts applied
function buildUSDPackages(blueprint) {
  return blueprint.map(({ credits, offer }) => {
    // ⭐ Special case: Starter Pack — 5 credits for $5.00 (net, before fee gross-up)
    if (credits === 5) {
      return { credits, price: 5.00, currency: 'USD', offer: offer ?? 'Starter Pack' };
    }

    // Normal tiers use TOKEN_TO_USD and discount ladder
    const baseUSD = credits * TOKEN_TO_USD;
    const disc = discountPctForCredits(credits);
    const priceUSD = +(baseUSD * (1 - disc)).toFixed(2);
    return { credits, price: priceUSD, currency: 'USD', offer };
  });
}

// Derive KES from discounted USD price
function buildKESPackages(usdPackages) {
  return usdPackages.map(({ credits, price, offer }) => {
    const kes = roundKES(price * USD_TO_KES);
    return { credits, price: kes, currency: 'KES', offer };
  });
}

const packagesUSD = buildUSDPackages(BLUEPRINT);
const packagesKES = buildKESPackages(packagesUSD);

// Final seed set
const packagesToSeed = [...packagesUSD, ...packagesKES];

(async () => {
  const client = await pool.connect();
  try {
    console.log('Ensuring packages table has required columns…');
    await client.query(`
      DO $$
      BEGIN
        -- currency column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='packages' AND column_name='currency'
        ) THEN
          ALTER TABLE packages ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';
        END IF;

        -- offer column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='packages' AND column_name='offer'
        ) THEN
          ALTER TABLE packages ADD COLUMN offer VARCHAR(100);
        END IF;
      END$$;
    `);

    console.log('Deleting existing packages…');
    await client.query('DELETE FROM packages');

    console.log('Inserting USD & KES packages (Starter 5→$1, tiered discounts 10+ credits)…');
    for (const { credits, price, currency, offer } of packagesToSeed) {
      await client.query(
        'INSERT INTO packages (credits, price, currency, offer) VALUES ($1, $2, $3, $4)',
        [credits, price, currency, offer]
      );
    }

    const { rows } = await client.query(
      'SELECT id, credits, price, currency, offer FROM packages ORDER BY currency, credits'
    );
    console.table(rows);
    console.log(
      `✅ Done seeding packages. Starter: 5 credits = $1.00. Peg (other tiers): 1 token = $${TOKEN_TO_USD}. FX: $1 = KES ${USD_TO_KES}.`
    );
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();

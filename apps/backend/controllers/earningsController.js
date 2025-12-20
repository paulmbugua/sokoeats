// apps/backend/controllers/earningsController.js
import pool from '../config/db.js';

/* ───────────────────────── helpers ───────────────────────── */

const upper = (s, fb = '') => String(s ?? fb).toUpperCase();
const LOG = (...a) => console.log('[earnings]', ...a);
const ERR = (...a) => console.error('[earnings]', ...a);

/**
 * Choose which currency to show:
 * 1) explicit ?currency
 * 2) profile payout_currency
 * 3) first currency from balances
 * 4) first currency from lifetime rows
 * 5) fallback 'USD'
 */
function chooseCurrency(asked, profile, balRows, lifeRows) {
  const picked =
    upper(asked) ||
    upper(profile?.payout_currency) ||
    upper(balRows?.[0]?.currency) ||
    upper(lifeRows?.[0]?.currency) ||
    'USD';

  LOG('chooseCurrency', {
    asked: upper(asked),
    profilePayout: upper(profile?.payout_currency),
    fromBalance: upper(balRows?.[0]?.currency),
    fromLifetime: upper(lifeRows?.[0]?.currency),
    picked,
  });

  return picked;
}

/**
 * Ensure user has a tutor profile and return it.
 */
async function getTutorProfile(userId) {
  if (!userId) return null;
  LOG('getTutorProfile: querying profiles for tutor', { userId });
  const { rows } = await pool.query(
    `SELECT payout_currency
       FROM profiles
      WHERE user_id = $1
        AND role = 'tutor'
      LIMIT 1`,
    [userId],
  );
  LOG('getTutorProfile: result', { rows });
  return rows[0] || null;
}

/* ───────────────────────── controllers ───────────────────────── */

/**
 * GET /api/earnings/summary?currency=USD|KES
 * → { currency, available, pending, total }
 */
export const getEarningsSummary = async (req, res) => {
  try {
    LOG('getEarningsSummary: incoming', {
      user: req.user,
      query: req.query,
    });

    const userId = req.user?.id;
    if (!userId) {
      LOG('getEarningsSummary: no userId → 401');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Must have a tutor profile
    const profile = await getTutorProfile(userId);
    if (!profile) {
      LOG('getEarningsSummary: no tutor profile → 403', { userId });
      return res.status(403).json({ message: 'Tutor profile required.' });
    }

    const asked = req.query?.currency;

    // 1) Balances by currency (from earnings_balances)
    const { rows: balRows } = await pool.query(
      `SELECT currency::text AS currency,
              available_amount::numeric AS available_amount,
              pending_amount::numeric   AS pending_amount
         FROM earnings_balances
        WHERE user_id = $1`,
      [userId],
    );
    LOG('getEarningsSummary: balances rows', balRows);

    // 2) Lifetime completed earnings by currency (from transactions)
    const { rows: lifeRows } = await pool.query(
      `SELECT currency::text AS currency,
              COALESCE(SUM(amount), 0)::numeric AS total
         FROM transactions
        WHERE user_id = $1
          AND type = 'Completed Earnings'
        GROUP BY currency`,
      [userId],
    );
    LOG('getEarningsSummary: lifetime rows', lifeRows);

    // Index rows by upper-cased currency
    const balBy = Object.fromEntries(
      balRows.map((r) => [upper(r.currency), r]),
    );
    const lifeBy = Object.fromEntries(
      lifeRows.map((r) => [upper(r.currency), r]),
    );

    const currency = chooseCurrency(asked, profile, balRows, lifeRows);

    const bal = balBy[currency] || {
      available_amount: 0,
      pending_amount: 0,
      currency,
    };

    const life = lifeBy[currency] || {
      total: 0,
      currency,
    };

    const payload = {
      currency,
      available: Number(bal.available_amount || 0),
      pending: Number(bal.pending_amount || 0),
      total: Number(life.total || 0),
    };

    LOG('getEarningsSummary: response payload', payload);

    return res.json(payload);
  } catch (err) {
    ERR('getEarningsSummary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/earnings/transactions?limit=20&offset=0
 * → { data: Transaction[] }
 * Ensures a unified `date` field.
 */
export const getEarningsTransactions = async (req, res) => {
  try {
    LOG('getEarningsTransactions: incoming', {
      user: req.user,
      query: req.query,
    });

    const userId = req.user?.id;
    if (!userId) {
      LOG('getEarningsTransactions: no userId → 401');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Only tutors can view this
    const profile = await getTutorProfile(userId);
    if (!profile) {
      LOG('getEarningsTransactions: no tutor profile → 403', { userId });
      return res.status(403).json({ message: 'Tutor profile required.' });
    }

    const limit = Number.parseInt(req.query.limit ?? '20', 10);
    const offset = Number.parseInt(req.query.offset ?? '0', 10);

    LOG('getEarningsTransactions: paging', { limit, offset });

    const { rows } = await pool.query(
      `SELECT id,
              type,
              amount::numeric AS amount,
              currency::text  AS currency,
              description,
              status,
              -- prefer explicit date; else fallback to created_at; else now
              COALESCE(date, created_at, NOW()) AS date
         FROM transactions
        WHERE user_id = $1
        ORDER BY COALESCE(date, created_at, NOW()) DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    LOG('getEarningsTransactions: returning rows', rows);

    res.json({ data: rows });
  } catch (err) {
    ERR('getEarningsTransactions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/earnings/payouts
 * → { data: Payout[] }
 */
export const getEarningsPayouts = async (req, res) => {
  try {
    LOG('getEarningsPayouts: incoming', { user: req.user });

    const userId = req.user?.id;
    if (!userId) {
      LOG('getEarningsPayouts: no userId → 401');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const profile = await getTutorProfile(userId);
    if (!profile) {
      LOG('getEarningsPayouts: no tutor profile → 403', { userId });
      return res.status(403).json({ message: 'Tutor profile required.' });
    }

    const { rows } = await pool.query(
      `SELECT id,
              amount::numeric AS amount,
              currency::text  AS currency,
              method,
              destination,
              status,
              created_at,
              paid_at
         FROM payouts
        WHERE tutor_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );

    LOG('getEarningsPayouts: rows', rows);

    res.json({ data: rows });
  } catch (err) {
    ERR('getEarningsPayouts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

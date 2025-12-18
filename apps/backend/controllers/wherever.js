// apps/backend/controllers/wherever.js  (ESM)
const normalize = (s) => String(s || '').trim().toLowerCase();

/**
 * True when a payment should be treated as fully settled/paid.
 * Keep this list generous because different providers/callbacks use different words/casing.
 */
export function isSettledPaymentStatus(status) {
  const s = normalize(status);

  return [
    'succeeded',
    'success',
    'successful',
    'completed',
    'complete',
    'paid',
    'settled',
    'confirmed',
    'approved',
  ].includes(s);
}

/** Optional: if you ever need it */
export function isPendingPaymentStatus(status) {
  const s = normalize(status);
  return ['pending', 'processing', 'queued', 'initiated'].includes(s);
}

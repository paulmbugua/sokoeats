import fetch from 'node-fetch';
import pool from '../config/db.js';

const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();
const PAYSTACK_BASE = 'https://api.paystack.co';

export async function verifyAndFinalizeOrg(req, res) {
  const reference = req.params?.reference || req.body?.reference || req.query?.reference;
  if (!reference) {
    return res.status(400).json({ message: 'reference is required' });
  }

  try {
    let providerData = null;
    if (PAYSTACK_SECRET_KEY) {
      const response = await fetch(
        `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
      );
      providerData = await response.json().catch(() => null);
      if (!response.ok || providerData?.data?.status !== 'success') {
        return res.status(200).json({ ok: false, status: 'pending', reference });
      }
    }

    await pool.query(
      `UPDATE org_fee_payments
          SET status = 'completed',
              provider_reference = COALESCE(provider_reference, $1),
              provider_payload = COALESCE(provider_payload, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE provider_reference = $1 OR reference = $1`,
      [reference, JSON.stringify(providerData || {})],
    );

    return res.status(200).json({ ok: true, reference });
  } catch (error) {
    if (['42P01', '42703'].includes(error?.code)) {
      return res.status(200).json({ ok: true, reference, persisted: false });
    }
    console.error('[paystack:org] verify failed', error?.message || error);
    return res.status(500).json({ message: 'Org Paystack verification failed' });
  }
}

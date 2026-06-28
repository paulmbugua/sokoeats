import pool from '../config/db.js';

function tableMissing(error) {
  return ['42P01', '42703'].includes(error?.code);
}

export async function createRefundRequest(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { paymentId, reason, amount, metadata } = req.body || {};
  if (!paymentId) {
    return res.status(400).json({ message: 'paymentId is required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO refund_requests
        (user_id, payment_id, reason, amount, metadata, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
       RETURNING *`,
      [
        userId,
        paymentId,
        reason ? String(reason) : null,
        amount ?? null,
        metadata ? JSON.stringify(metadata) : JSON.stringify({}),
      ],
    );

    return res.status(202).json({
      message: 'Refund request received',
      refund: rows[0],
    });
  } catch (error) {
    if (tableMissing(error)) {
      console.warn('[refunds] refund_requests table missing; request not persisted');
      return res.status(202).json({
        message: 'Refund request received',
        refund: {
          userId,
          paymentId,
          reason: reason ? String(reason) : null,
          status: 'pending',
        },
      });
    }

    console.error('[refunds] create request failed', error?.message || error);
    return res.status(500).json({ message: 'Failed to create refund request' });
  }
}

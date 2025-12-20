// apps/backend/controllers/refundsController.js
import pool from '../config/db.js';
import { sendNotification } from '../utils/sendNotification.js';

// Minimal validation helpers (optional)
const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export const createRefundRequest = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const {
      transactionId,
      amount, // optional number
      reason, // 'accidental_purchase' | 'duplicate_charge' | ...
      details, // free text
      resolution, // 'original' | 'tokens'
      attachmentUrl, // optional
      ccMe = true, // optional
    } = req.body || {};

    if (!isNonEmpty(transactionId) || !isNonEmpty(reason)) {
      return res
        .status(400)
        .json({ message: 'transactionId and reason are required.' });
    }

    // Load user identity (for email + display)
    const { rows } = await pool.query(
      'SELECT email, name FROM users WHERE id = $1',
      [userId],
    );
    const userEmail = rows[0]?.email || '';
    const userName = rows[0]?.name || 'User';

    // Optional: persist request (best-effort)
    let saved = null;
    try {
      const ins = await pool.query(
        `INSERT INTO refund_requests
           (user_id, transaction_id, amount, reason, details, resolution, attachment_url, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending')
         RETURNING id, created_at`,
        [
          userId,
          transactionId.trim(),
          typeof amount === 'number' ? amount : null,
          reason.trim(),
          details?.toString().trim() || null,
          resolution === 'tokens' ? 'tokens' : 'original',
          attachmentUrl || null,
        ],
      );
      saved = ins.rows[0];
    } catch {
      // Table may not exist — continue with email only
    }

    // Compose emails
    const prettyReason = String(reason)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const subject = `[Refund] ${prettyReason} — ${transactionId}`;

    const body = `Refund/Cancellation Request

User: ${userName} (${userEmail})
User ID: ${userId}

Transaction/Order ID: ${transactionId}
Amount (optional): ${amount != null ? amount : '(full/unspecified)'}
Preferred Resolution: ${resolution === 'tokens' ? 'Tokens credit' : 'Refund to original method'}
Attachment: ${attachmentUrl || '(none)'}
Reason: ${prettyReason}

Details:
${details || '(no additional details)'}

Internal:
Request ID: ${saved?.id ?? '(not stored)'}
Created At: ${saved?.created_at ?? '(n/a)'}

— DayBreak Learner`;

    await sendNotification({
      to: 'support@daybreaklearner.com',
      subject,
      body,
    });

    if (ccMe && userEmail.includes('@')) {
      await sendNotification({
        to: userEmail,
        subject: `Copy of your refund request: ${prettyReason} — ${transactionId}`,
        body: `Hi ${userName},

We received your refund/cancellation request. Here’s a copy:

Transaction/Order ID: ${transactionId}
Amount: ${amount != null ? amount : '(full/unspecified)'}
Preferred Resolution: ${resolution === 'tokens' ? 'Tokens credit' : 'Refund to original method'}
Attachment: ${attachmentUrl || '(none)'}
Reason: ${prettyReason}

Details:
${details || '(no additional details)'}

Our team will review and reply shortly.
— DayBreak Support`,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Refund request submitted. Our support team has been notified.',
      id: saved?.id,
    });
  } catch (e) {
    console.error('[createRefundRequest] error:', e?.stack || e?.message || e);
    return res
      .status(500)
      .json({ message: 'Failed to submit refund request.' });
  }
};

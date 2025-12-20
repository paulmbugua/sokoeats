import crypto from 'crypto';
import { logZoomEvent } from '../utils/eventLogger.js';
import pool from '../config/db.js';
import { enqueueWebhook } from '../helpers/webhooks.js';
import { v4 as uuidv4 } from 'uuid';

export const handlePaystackWebhook = async (req, res) => {
  console.log('Webhook Event:', JSON.stringify(req.body, null, 2));

  const paystackSignature = req.headers['x-paystack-signature'];
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  // Verify the webhook signature
  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(JSON.stringify(req.body))
    .digest('hex');
  if (hash !== paystackSignature) {
    return res.status(400).json({ message: 'Invalid signature' });
  }

  const event = req.body;

  try {
    if (event.event === 'charge.success') {
      const { reference, status } = event.data;

      // Find the payment record in PostgreSQL
      const paymentQuery = 'SELECT * FROM payments WHERE transaction_id = $1';
      const paymentResult = await pool.query(paymentQuery, [reference]);

      if (paymentResult.rowCount === 0) {
        console.error('Payment record not found for reference:', reference);
        return res.status(404).json({ message: 'Payment record not found' });
      }

      const payment = paymentResult.rows[0];

      // If the payment is already completed, avoid processing it again
      if (payment.status === 'Completed') {
        console.log(`Payment for reference ${reference} is already processed.`);
        return res.status(200).json({ message: 'Payment already processed.' });
      }

      // Update payment status in PostgreSQL
      const updatePaymentQuery =
        'UPDATE payments SET status = $1 WHERE transaction_id = $2';
      await pool.query(updatePaymentQuery, [
        status === 'success' ? 'Completed' : 'Failed',
        reference,
      ]);

      console.log(
        `Payment status updated for reference ${reference}: ${status}`,
      );

      // If payment is completed, update the user's token balance
      if (status === 'success') {
        const userQuery = 'SELECT * FROM users WHERE id = $1';
        const userResult = await pool.query(userQuery, [payment.user_id]);

        if (userResult.rowCount === 0) {
          console.error('User not found for payment:', payment.user_id);
          return res.status(404).json({ message: 'User not found.' });
        }

        const user = userResult.rows[0];

        // Get package credits
        const packageQuery = 'SELECT * FROM packages WHERE id = $1';
        const packageResult = await pool.query(packageQuery, [
          payment.package_id,
        ]);

        if (packageResult.rowCount === 0) {
          console.error('Package not found for payment:', payment.package_id);
          return res.status(404).json({ message: 'Package not found.' });
        }

        const purchasedPackage = packageResult.rows[0];

        // Update user's tokens
        const updateUserQuery =
          'UPDATE users SET tokens = tokens + $1 WHERE id = $2';
        await pool.query(updateUserQuery, [purchasedPackage.credits, user.id]);

        console.log(
          `Tokens updated for user ${user.email}: ${
            user.tokens + purchasedPackage.credits
          }`,
        );
      }
    }

    res.status(200).json({ message: 'Webhook received successfully' });
  } catch (error) {
    console.error('Error processing webhook:', error.message || error);
    res.status(500).json({ message: 'Failed to process webhook', error });
  }
};

export const handleZoomWebhook = async (req, res) => {
  const { event, payload } = req.body;

  try {
    console.log('🔹 Received Zoom Webhook:', {
      event,
      payloadKeys: Object.keys(payload || {}),
      headers: req.headers,
    });

    // Handle URL validation event
    if (event === 'endpoint.url_validation') {
      console.log('Handling URL validation...');

      const { plainToken } = payload;

      if (!process.env.ZOOM_SECRET_TOKEN) {
        console.error('❌ ZOOM_SECRET_TOKEN is not set.');
        return res.status(500).send('Server misconfiguration');
      }

      try {
        const encryptedToken = crypto
          .createHmac('sha256', process.env.ZOOM_SECRET_TOKEN)
          .update(plainToken)
          .digest('hex');

        return res.status(200).json({ plainToken, encryptedToken });
      } catch (error) {
        console.error('❌ Error generating encrypted token:', error);
        return res.status(500).send('Error generating encrypted token');
      }
    }

    // Extract meeting ID from payload
    let meetingId = payload?.object?.id || payload?.meetingId;
    if (!meetingId) {
      console.error('❌ Missing meetingId in webhook payload:', payload);
      return res.status(400).send('Missing meetingId in payload');
    }
    meetingId = String(meetingId);

    // Insert Zoom webhook event into PostgreSQL
    // Updated table name to "zoomwebhooks"
    const insertWebhookQuery = `
      INSERT INTO zoomwebhooks (event, meeting_ids, timestamp, raw_payload)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    await pool.query(insertWebhookQuery, [
      event,
      [meetingId],
      new Date(),
      JSON.stringify(payload),
    ]);

    console.log('✅ Webhook event saved successfully.');

    // Handle participant events
    if (
      event === 'meeting.participant_joined' ||
      event === 'meeting.participant_left'
    ) {
      const participant = payload?.object?.participant;
      if (!participant) {
        console.error('❌ Invalid participant data in payload:', payload);
        return res.status(400).send('Invalid participant data');
      }

      // Fetch session from PostgreSQL using the meeting ID
      const sessionQuery =
        'SELECT * FROM tutor_sessions WHERE $1 = ANY(zoom_meeting_ids)';
      const sessionResult = await pool.query(sessionQuery, [meetingId]);

      if (sessionResult.rowCount === 0) {
        console.error(`❌ No session found for meeting ID: ${meetingId}`);
        return;
      }

      const session = sessionResult.rows[0];

      const participantDetails = {
        user_id: participant.id || `Unknown-${Date.now()}`,
        user_name: participant.user_name || 'Unknown',
        join_time: event === 'meeting.participant_joined' ? new Date() : null,
        leave_time: event === 'meeting.participant_left' ? new Date() : null,
      };

      // Update participant records based on event type
      if (event === 'meeting.participant_joined') {
        const insertParticipantQuery = `
          INSERT INTO session_participants (session_id, user_id, user_name, join_time)
          VALUES ($1, $2, $3, $4)`;
        await pool.query(insertParticipantQuery, [
          session.id,
          participantDetails.user_id,
          participantDetails.user_name,
          participantDetails.join_time,
        ]);
      } else if (event === 'meeting.participant_left') {
        const updateParticipantQuery = `
          UPDATE session_participants
          SET leave_time = $1
          WHERE session_id = $2 AND user_id = $3`;
        await pool.query(updateParticipantQuery, [
          participantDetails.leave_time,
          session.id,
          participantDetails.user_id,
        ]);
      }

      console.log(`✅ Participant event updated for meeting: ${meetingId}`);
    }

    // Handle meeting ended event
    if (event === 'meeting.ended') {
      const { end_time } = payload?.object;

      // Log the event without updating session status
      console.log(
        `🔹 Meeting Ended Event Received for Meeting ID: ${meetingId} at ${end_time}`,
      );

      // Optionally, you can store the end time in a log table or for reference
      const logMeetingEndQuery = `
    INSERT INTO zoom_meeting_logs (meeting_id, end_time, event)
    VALUES ($1, $2, $3) 
    ON CONFLICT (meeting_id) DO UPDATE 
    SET end_time = EXCLUDED.end_time`;

      await pool.query(logMeetingEndQuery, [
        meetingId,
        new Date(end_time),
        event,
      ]);

      console.log(`✅ Meeting End Logged: ${meetingId} at ${end_time}`);
    }

    res.status(200).send('Webhook processed successfully');
  } catch (error) {
    console.error('❌ Error processing Zoom webhook:', error);
    res.status(500).send('Internal Server Error');
  }
};

export async function testOrgWebhook(req, res) {
  try {
    const orgId = req.params.orgId;
    const userId = req.user?.id;
    const { overrideUrl } = req.body || {};

    // Use the same source of truth as your worker: organizations.webhook_secret
    const { rows } = await pool.query(
      `SELECT id, webhook_enabled, webhook_url, webhook_secret
         FROM organizations
        WHERE id = $1 AND owner_user_id = $2`,
      [orgId, userId],
    );
    const o = rows[0];
    if (!o)
      return res.status(404).json({ ok: false, message: 'Org not found' });
    if (!o.webhook_enabled)
      return res.status(400).json({ ok: false, message: 'Webhooks disabled' });

    const url = String(overrideUrl || o.webhook_url || '').trim();
    if (!/^https:\/\/.+/i.test(url)) {
      return res.status(400).json({ ok: false, message: 'Invalid HTTPS URL' });
    }

    // Build a canonical payload
    const payload = {
      id: uuidv4(),
      type: 'org.webhook.test',
      orgId,
      ping: true,
      sentAt: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);

    // Same signature scheme as your worker:
    // sign(secret, ts, raw) => 't=<ts>,v1=<hmac_sha256(ts.raw)>'
    const ts = Math.floor(Date.now() / 1000);
    const sig = (() => {
      const h = crypto
        .createHmac('sha256', o.webhook_secret || '')
        .update(`${ts}.${body}`)
        .digest('hex');
      return `t=${ts},v1=${h}`;
    })();

    // Optional: immediate fire so you see it on webhook.site now
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DayBreak-Hook/1.0',
          'X-DayBreak-Event': 'test',
          'X-DayBreak-Signature': sig,
          'X-DayBreak-Timestamp': String(ts),
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      console.log('[webhooks:test] immediate POST =>', { status: resp.status });
    } catch (err) {
      console.error('[webhooks:test] immediate POST failed', err);
      // continue; we still enqueue below
    }

    // Enqueue (include override so worker uses the exact URL you typed)
    await enqueueWebhook(o.id, 'test', { ...payload, __override_url: url });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[webhooks:test] error', err);
    return res
      .status(500)
      .json({ ok: false, message: 'Failed to enqueue test webhook' });
  }
}

// POST /api/orgs/:orgId/webhooks/secret  (owner only)
// Generates a new secret and returns it ONCE (plaintext).
export async function createOrRotateWebhookSecret(req, res) {
  const orgId = req.params.orgId;
  const userId = req.user?.id;
  if (!orgId || !userId)
    return res.status(401).json({ message: 'Unauthorized' });

  // Ensure this user owns the org
  const { rows } = await pool.query(
    `SELECT id FROM organizations WHERE id=$1 AND owner_user_id=$2`,
    [orgId, userId],
  );
  if (!rows.length) return res.status(403).json({ message: 'Forbidden' });

  const secret = crypto.randomBytes(32).toString('hex'); // 64-char hex
  await pool.query(
    `UPDATE organizations
        SET webhook_secret=$1, webhook_secret_rotated_at=NOW()
      WHERE id=$2`,
    [secret, orgId],
  );

  // Return plaintext ONCE so they can copy it.
  res.json({ ok: true, secret, last4: secret.slice(-4) });
}

// GET /api/orgs/:orgId/webhooks/secret (owner only)
// Returns masked info ONLY (so you never leak plaintext later).
export async function getWebhookSecretMeta(req, res) {
  const orgId = req.params.orgId;
  const userId = req.user?.id;
  if (!orgId || !userId)
    return res.status(401).json({ message: 'Unauthorized' });

  const { rows } = await pool.query(
    `SELECT webhook_secret, webhook_secret_rotated_at
       FROM organizations
      WHERE id=$1 AND owner_user_id=$2`,
    [orgId, userId],
  );
  if (!rows.length) return res.status(404).json({ message: 'Org not found' });

  const rec = rows[0];
  const last4 = rec.webhook_secret
    ? String(rec.webhook_secret).slice(-4)
    : null;
  res.json({
    ok: true,
    present: !!rec.webhook_secret,
    last4,
    rotatedAt: rec.webhook_secret_rotated_at || null,
  });
}

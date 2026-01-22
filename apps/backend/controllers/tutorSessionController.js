import pool from '../config/db.js';
import { createZoomMeeting } from '../utils/zoomUtils.js';
import { sendNotification } from '../utils/sendNotification.js';
import {
  sessionValidationSchema,
  reviewValidationSchema,
} from '../validators/sessionValidationSchema.js';
import {
  registerPaystackRecipient,
  sendPaystackTransfer,
} from '../utils/paystack.js';
import { initiateB2CPayment } from '../services/mpesaService.js';
import { getProfileIdForUserId } from '../services/chatGatingService.js';
import { emitToProfile } from '../services/socketService.js';

const PLATFORM_FEE = 0.15; // 15%
const USD_TO_KES_DEFAULT = 133.75; // fallback; replace with your FX source

async function getFxRate(base, quote) {
  if (base === 'USD' && quote === 'KES') return USD_TO_KES_DEFAULT;
  return 1; // USD->USD or KES->KES placeholder
}

// Create a New Session
export const createSession = async (req, res) => {
  console.log('Received Payload:', req.body);
  try {
    // ← include tutorName here
    const { tutorId, tutorName, subject, date, sessionType, note } =
      await sessionValidationSchema.validateAsync(req.body);
    const studentUserId = req.user.id; // Authenticated user's ID

    // Fetch student details
    const studentUser = await pool.query('SELECT * FROM users WHERE id = $1', [
      studentUserId,
    ]);
    if (studentUser.rows.length === 0)
      return res.status(404).json({ message: 'Student user not found.' });

    // Fetch tutor's profile by matching profiles.user_id = tutorId
    const tutorProfileRes = await pool.query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [tutorId],
    );
    if (tutorProfileRes.rows.length === 0)
      return res.status(404).json({ message: 'Tutor not found.' });
    const tutorProfile = tutorProfileRes.rows[0];

    // Validate session pricing
    const pricingData = tutorProfile.pricing;
    const pricing =
      typeof pricingData === 'string'
        ? JSON.parse(pricingData)
        : pricingData || {};
    const sessionCost = pricing[sessionType];
    if (!sessionCost) {
      return res
        .status(400)
        .json({ message: 'Invalid session type or pricing not available.' });
    }

    // Check student token balance
    if (studentUser.rows[0].tokens < sessionCost) {
      const tokenDifference = sessionCost - studentUser.rows[0].tokens;
      return res.status(400).json({
        message: `Insufficient tokens. You need ${tokenDifference} more tokens to book this session.`,
      });
    }

    // Deduct tokens from the student
    await pool.query('UPDATE users SET tokens = tokens - $1 WHERE id = $2', [
      sessionCost,
      studentUserId,
    ]);

    // ← include tutor_name in the INSERT
    const newSession = await pool.query(
      `INSERT INTO tutor_sessions
         (tutor_id, tutor_name, student_id, session_type, subject, date, status, amount, type, description, created_at) 
       VALUES ($1,      $2,         $3,         $4,           $5,      $6,   'upcoming', $7,     'session', $8,        NOW()) 
       RETURNING *`,
      [
        tutorId, // users.id
        tutorName, // newly captured tutor name
        studentUserId, // users.id
        sessionType,
        subject,
        date,
        sessionCost,
        note || null,
      ],
    );

    const studentProfileId = await getProfileIdForUserId(studentUserId);
    const tutorProfileId = await getProfileIdForUserId(tutorId);
    if (studentProfileId && tutorProfileId) {
      const conversationResult = await pool.query(
        `SELECT id FROM conversations
         WHERE (sender_id = $1 AND recipient_id = $2)
            OR (sender_id = $2 AND recipient_id = $1)
         LIMIT 1`,
        [studentProfileId, tutorProfileId],
      );
      let conversationId = conversationResult.rows[0]?.id;
      if (!conversationId) {
        const newConversation = await pool.query(
          `INSERT INTO conversations (sender_id, recipient_id, unread_count, chat_status)
           VALUES ($1, $2, 0, 'unlocked')
           RETURNING id`,
          [studentProfileId, tutorProfileId],
        );
        conversationId = newConversation.rows[0].id;
      } else {
        await pool.query(
          `UPDATE conversations SET chat_status='unlocked', updated_at=NOW()
           WHERE id=$1 AND chat_status <> 'unlocked'`,
          [conversationId],
        );
      }

      emitToProfile(studentProfileId, 'chatUnlocked', { conversationId });
      emitToProfile(tutorProfileId, 'chatUnlocked', { conversationId });
    }

    // Send email notifications
    const tutorUser = await pool.query('SELECT * FROM users WHERE id = $1', [
      tutorId,
    ]);
    if (tutorUser.rows.length === 0)
      return res.status(404).json({ message: 'Tutor user not found.' });

    await sendNotification({
      to: tutorUser.rows[0].email,
      subject: 'New Tutoring Session Scheduled',
      body: `Dear ${tutorUser.rows[0].name},\n\nA new session has been scheduled with you by ${studentUser.rows[0].name}.\n\nSession Details:\nSubject: ${subject}\nDate: ${new Date(
        date,
      ).toLocaleString()}\nSession Type: ${sessionType}\n\nBest regards,\nTutoring Platform`,
    });

    res.status(201).json({
      message: 'Session created successfully.',
      session: newSession.rows[0],
    });
  } catch (error) {
    console.error('Error creating session:', error.message || error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const acceptSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log('\n[acceptSession] ========= BEGIN =========');
    console.log('[acceptSession] sessionId:', sessionId);

    // 1) Update session status
    const session = await pool.query(
      `UPDATE tutor_sessions 
       SET status = 'accepted' 
       WHERE id = $1 
       RETURNING *`,
      [sessionId],
    );

    console.log('[acceptSession] session rowCount:', session.rowCount);

    if (session.rows.length === 0) {
      console.warn('[acceptSession] No session found for id:', sessionId);
      return res.status(404).json({ message: 'Session not found.' });
    }

    const sessionData = session.rows[0];
    console.log('[acceptSession] sessionData:', {
      id: sessionData.id,
      tutor_id: sessionData.tutor_id,
      student_id: sessionData.student_id,
      amount: sessionData.amount,
      session_type: sessionData.session_type,
      subject: sessionData.subject,
    });

    // 2) Fetch student and tutor details directly from users table
    const studentUser = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [sessionData.student_id],
    );
    const tutorUser = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [sessionData.tutor_id],
    );

    console.log('[acceptSession] studentUser.rowCount:', studentUser.rowCount);
    console.log('[acceptSession] tutorUser.rowCount:', tutorUser.rowCount);

    if (studentUser.rows.length === 0 || tutorUser.rows.length === 0) {
      console.warn('[acceptSession] Student or tutor user not found.', {
        studentId: sessionData.student_id,
        tutorId: sessionData.tutor_id,
      });
      return res
        .status(404)
        .json({ message: 'Student or tutor user not found.' });
    }

    const studentRow = studentUser.rows[0];
    const tutorRow = tutorUser.rows[0];

    // 3) Ensure a conversation exists: fetch profile IDs first
    const studentProfileRes = await pool.query(
      'SELECT id FROM profiles WHERE user_id = $1',
      [sessionData.student_id],
    );
    const tutorProfileRes = await pool.query(
      'SELECT id FROM profiles WHERE user_id = $1',
      [sessionData.tutor_id],
    );

    console.log(
      '[acceptSession] studentProfileRes.rowCount:',
      studentProfileRes.rowCount,
    );
    console.log(
      '[acceptSession] tutorProfileRes.rowCount:',
      tutorProfileRes.rowCount,
    );

    if (
      studentProfileRes.rows.length === 0 ||
      tutorProfileRes.rows.length === 0
    ) {
      console.warn('[acceptSession] Student or tutor profile not found.', {
        studentId: sessionData.student_id,
        tutorId: sessionData.tutor_id,
      });
      return res
        .status(404)
        .json({ message: 'Student or tutor profile not found.' });
    }
    const studentProfileId = studentProfileRes.rows[0].id;
    const tutorProfileId = tutorProfileRes.rows[0].id;

    // Insert (or update) conversation
    await pool.query(
      `INSERT INTO conversations (sender_id, recipient_id, unread_count) 
       VALUES ($1, $2, 1) 
       ON CONFLICT (sender_id, recipient_id) 
       DO UPDATE SET unread_count = conversations.unread_count + 1`,
      [tutorProfileId, studentProfileId],
    );

    // Insert message into the messages table using the conversation ID
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, created_at) 
       VALUES (
         (SELECT id FROM conversations WHERE sender_id = $1 AND recipient_id = $2 LIMIT 1), 
         $1, 
         $3, 
         NOW()
       )`,
      [
        tutorProfileId,
        studentProfileId,
        `Your session request for "${sessionData.subject}" has been accepted by the tutor.`,
      ],
    );

    const conversationUnlock = await pool.query(
      `SELECT id FROM conversations
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)
       LIMIT 1`,
      [tutorProfileId, studentProfileId],
    );
    const conversationId = conversationUnlock.rows[0]?.id;
    if (conversationId) {
      await pool.query(
        `UPDATE conversations SET chat_status='unlocked', updated_at=NOW()
         WHERE id=$1 AND chat_status <> 'unlocked'`,
        [conversationId],
      );
      emitToProfile(studentProfileId, 'chatUnlocked', { conversationId });
      emitToProfile(tutorProfileId, 'chatUnlocked', { conversationId });
    }

    // ─────────────────────────────────────────────────────────────
    // 4) Determine tutor payout currency (LOGGED)
    // ─────────────────────────────────────────────────────────────
    const tutorProfilePayout = await pool.query(
      `SELECT user_id, role, payout_currency
       FROM profiles
       WHERE user_id = $1 AND role = 'tutor'
       LIMIT 1`,
      [sessionData.tutor_id],
    );

    console.log(
      '[acceptSession] tutorProfilePayout.rows:',
      tutorProfilePayout.rows,
    );

    const payoutCurrency = String(
      tutorProfilePayout.rows[0]?.payout_currency || 'USD',
    ).toUpperCase();

    console.log('[acceptSession] RESOLVED payoutCurrency:', payoutCurrency);

    // ─────────────────────────────────────────────────────────────
    // 5) Compute net earnings in payout currency (LOGGED)
    // ─────────────────────────────────────────────────────────────
    const grossTokens = Math.round(Number(sessionData.amount ?? 0)); // e.g. 5
    const grossUsd = +grossTokens.toFixed(2); // 5.00
    const feeUsd = +(grossUsd * PLATFORM_FEE).toFixed(2); // 0.75
    const netUsd = +(grossUsd - feeUsd).toFixed(2); // 4.25

    console.log('[acceptSession] Earnings base (USD):', {
      grossTokens,
      grossUsd,
      feeUsd,
      netUsd,
    });

    let creditedAmount = netUsd;
    let fxRateUsed = 1;

    if (payoutCurrency === 'KES') {
      fxRateUsed = await getFxRate('USD', 'KES');
      creditedAmount = +(netUsd * fxRateUsed).toFixed(2);
      console.log('[acceptSession] Applying FX for KES:', {
        fxRateUsed,
        creditedAmount,
      });
    } else {
      console.log(
        '[acceptSession] No FX applied (payoutCurrency is not KES):',
        {
          payoutCurrency,
          creditedAmount,
        },
      );
    }

    // ─────────────────────────────────────────────────────────────
    // 6) Fetch Payment record for the student (optional, LOGGED)
    // ─────────────────────────────────────────────────────────────
    const paymentRecord = await pool.query(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sessionData.student_id],
    );

    console.log(
      '[acceptSession] paymentRecord.rowCount:',
      paymentRecord.rowCount,
    );

    let paystackRef = null;
    let mpesaRef = null;
    // default to a valid enumerated value
    let paymentMethod = 'PlatformBalance';

    if (paymentRecord.rows.length === 0) {
      console.warn(
        '[acceptSession] Payment record not found; using PlatformBalance as payment_method for Expected Earnings',
        { sessionId, studentId: sessionData.student_id },
      );
    } else {
      const pr = paymentRecord.rows[0];
      console.log('[acceptSession] paymentRecord row:', {
        id: pr.id,
        payment_method: pr.payment_method,
        transaction_id: pr.transaction_id,
        mpesa_reference: pr.mpesa_reference,
      });

      if (pr.payment_method === 'Paystack') {
        paymentMethod = 'Paystack';
        paystackRef = pr.transaction_id;
      } else if (pr.payment_method === 'M-Pesa') {
        paymentMethod = 'M-Pesa';
        mpesaRef = pr.mpesa_reference;
      } else if (pr.payment_method) {
        paymentMethod = pr.payment_method;
      }
    }

    const desc =
      `Expected net earning from session "${sessionData.subject}" with student ${studentRow.name}. ` +
      `Gross ${grossUsd.toFixed(2)} USD (tokens ${grossTokens}), ` +
      `fee ${feeUsd.toFixed(2)} USD, expected ${creditedAmount} ${payoutCurrency}` +
      (payoutCurrency === 'KES' ? ` @ ${fxRateUsed} FX` : '');

    console.log('[acceptSession] Final transaction payload:', {
      tutorId: sessionData.tutor_id,
      type: 'Expected Earnings',
      amount: creditedAmount,
      currency: payoutCurrency,
      paymentMethod,
      paystackRef,
      mpesaRef,
      desc,
    });

    // ─────────────────────────────────────────────────────────────
    // 7) Create transaction for tutor's expected earnings (UPDATED)
    // ─────────────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO transactions 
         (user_id, type, amount, description, date, status, currency, paystack_reference, mpesa_reference, payment_method) 
       VALUES ($1, 'Expected Earnings', $2, $3, NOW(), 'Pending', $4, $5, $6, $7)`,
      [
        sessionData.tutor_id,
        creditedAmount,
        desc,
        payoutCurrency,
        paystackRef,
        mpesaRef,
        paymentMethod,
      ],
    );

    console.log('[acceptSession] INSERT into transactions completed.');

    // ─────────────────────────────────────────────────────────────
    // 8) Send email notifications (unchanged)
    // ─────────────────────────────────────────────────────────────
    await Promise.all([
      sendNotification({
        to: studentRow.email,
        subject: 'Your Session Request Has Been Accepted',
        body: `Dear ${studentRow.name},\n\nYour session request for "${sessionData.subject}" has been accepted by the tutor ${tutorRow.name}.\n\nBest regards,\nTutoring Platform`,
      }),
      sendNotification({
        to: tutorRow.email,
        subject: 'You Have Accepted a Session Request',
        body: `Dear ${tutorRow.name},\n\nYou have accepted a session request for "${sessionData.subject}" from ${studentRow.name}.\n\nBest regards,\nTutoring Platform`,
      }),
    ]);

    console.log('[acceptSession] Email notifications sent.');
    console.log('[acceptSession] ========= END (OK) =========\n');

    res.status(200).json({
      message: 'Session accepted, student notified, and transaction recorded.',
      session: sessionData,
    });
  } catch (error) {
    console.error('[acceptSession] ERROR:', error.message || error);
    console.log('[acceptSession] ========= END (ERROR) =========\n');
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const cancelSession = async (req, res) => {
  const { sessionId } = req.params;
  const { reason } = req.body;

  try {
    // Fetch session details, joining on profiles.user_id instead of profiles.id
    const session = await pool.query(
      `SELECT ts.*, p1.user_id AS student_user_id, p2.user_id AS tutor_user_id
       FROM tutor_sessions ts
       JOIN profiles p1 ON ts.student_id = p1.user_id
       JOIN profiles p2 ON ts.tutor_id = p2.user_id
       WHERE ts.id = $1`,
      [sessionId],
    );

    if (session.rows.length === 0)
      return res.status(404).json({ message: 'Session not found.' });

    const sessionData = session.rows[0];

    if (sessionData.status === 'cancelled') {
      return res.status(400).json({ message: 'Session is already cancelled.' });
    }

    // Identify whether the requester is the tutor or student
    const isTutor = req.user.id === sessionData.tutor_user_id;
    const isStudent = req.user.id === sessionData.student_user_id;

    if (!isTutor && !isStudent) {
      return res
        .status(403)
        .json({ message: 'You are not authorized to cancel this session.' });
    }

    // Validate status for cancellation based on user role
    if (isTutor && sessionData.status !== 'upcoming') {
      return res
        .status(400)
        .json({ message: 'Tutors can only cancel "upcoming" sessions.' });
    }

    if (isStudent && sessionData.status !== 'accepted') {
      return res
        .status(400)
        .json({ message: 'Students can only cancel "accepted" sessions.' });
    }

    if (!reason || reason.trim() === '') {
      return res
        .status(400)
        .json({ message: 'A reason must be provided for cancellation.' });
    }

    // Update session status in PostgreSQL
    await pool.query(
      `UPDATE tutor_sessions 
       SET status = 'cancelled', description = $1 
       WHERE id = $2`,
      [reason, sessionId],
    );

    // Send email notifications
    const studentUser = await pool.query(
      'SELECT email, name FROM users WHERE id = $1',
      [sessionData.student_user_id],
    );
    const tutorUser = await pool.query(
      'SELECT email, name FROM users WHERE id = $1',
      [sessionData.tutor_user_id],
    );

    await Promise.all([
      sendNotification({
        to: tutorUser.rows[0].email,
        subject: 'Session Cancellation Notification',
        body: `Dear ${tutorUser.rows[0].name},\n\nThe session "${sessionData.subject}" has been cancelled.\n\nReason: ${reason}\n\nBest regards,\nTutoring Platform`,
      }),
      sendNotification({
        to: studentUser.rows[0].email,
        subject: 'Session Cancellation Notification',
        body: `Dear ${studentUser.rows[0].name},\n\nThe session "${sessionData.subject}" has been cancelled.\n\nReason: ${reason}\n\nBest regards,\nTutoring Platform`,
      }),
    ]);

    res.status(200).json({
      message:
        'Session cancelled successfully. Notifications sent to both tutor and student.',
    });
  } catch (error) {
    console.error('Error cancelling session:', error.message || error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// Mark Session as Completed and Record Earnings
export const completeSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    // Use the authenticated user's ID from the auth middleware
    const tutorUserId = req.user.id;

    console.log('Complete-Pending Request initiated', {
      sessionId,
      tutorUserId,
      user: req.user,
      profile: req.profile,
    });

    if (!tutorUserId) {
      return res
        .status(403)
        .json({ message: 'Unauthorized: Tutor not found.' });
    }

    // Fetch the session with only the needed fields.
    // Now tutor_id and student_id are users.id, so we compare directly:
    const sessionResult = await pool.query(
      `SELECT id, tutor_id, student_id, session_type, zoom_meeting_ids
       FROM tutor_sessions
       WHERE id = $1 AND tutor_id = $2 AND status = 'accepted'`,
      [sessionId, tutorUserId],
    );

    console.log('Session query rowCount:', sessionResult.rowCount);
    if (sessionResult.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Session not found or already processed.' });
    }

    const session = sessionResult.rows[0];
    console.log('Session found:', session);

    // Check that the session has Zoom meeting IDs
    const meetingIds = session.zoom_meeting_ids;
    if (!meetingIds || meetingIds.length === 0) {
      return res
        .status(400)
        .json({ message: 'No Zoom meeting IDs found for this session.' });
    }
    console.log('Meeting IDs:', meetingIds);

    // Fetch attendance records from zoomwebhooks.
    const attendanceResult = await pool.query(
      `SELECT event, timestamp
       FROM zoomwebhooks
       WHERE meeting_ids && $1::text[]`,
      [meetingIds],
    );

    if (attendanceResult.rowCount === 0) {
      return res
        .status(400)
        .json({ message: 'No attendance records found for these meetings.' });
    }

    // Determine expected duration based on session_type and set the threshold at 75%
    const sessionDurationMap = {
      privateSession: 60,
      groupSession: 90,
      lecture: 120,
      workshop: 180,
    };
    const expectedDuration = sessionDurationMap[session.session_type] || 60;
    const requiredAttendance = expectedDuration * 0.75;
    console.log(
      `Expected Duration: ${expectedDuration} mins, Required Attendance (75%): ${requiredAttendance} mins`,
    );

    // Calculate total meeting duration:
    let firstJoinTime = null;
    let lastLeaveTime = null;

    attendanceResult.rows.forEach((record) => {
      if (record.event === 'meeting.participant_joined') {
        const joinTime = new Date(record.timestamp);
        if (!firstJoinTime || joinTime < firstJoinTime) {
          firstJoinTime = joinTime;
        }
      }
      if (record.event === 'meeting.participant_left') {
        const leaveTime = new Date(record.timestamp);
        if (!lastLeaveTime || leaveTime > lastLeaveTime) {
          lastLeaveTime = leaveTime;
        }
      }
    });

    if (!firstJoinTime || !lastLeaveTime) {
      return res
        .status(400)
        .json({ message: 'Meeting join or leave time missing from records.' });
    }
    if (lastLeaveTime <= firstJoinTime) {
      return res.status(400).json({
        message: 'Invalid meeting times: leave time is not after join time.',
      });
    }

    const totalMeetingDuration = Math.round(
      (lastLeaveTime - firstJoinTime) / (1000 * 60),
    );
    console.log(`Total Meeting Duration: ${totalMeetingDuration} mins`);

    // Check if the actual meeting duration meets the 75% threshold
    if (totalMeetingDuration < requiredAttendance) {
      return res.status(400).json({
        message: `Completion failed. Total meeting duration of ${totalMeetingDuration} minutes is less than the required ${requiredAttendance} minutes.`,
      });
    }

    // Mark session as 'completed_pending' and update duration and end_time
    await pool.query(
      `UPDATE tutor_sessions 
       SET status = 'completed_pending', 
           duration = $1,
           end_time = $2,
           completion_request_time = NOW(), 
           completion_deadline = NOW() + INTERVAL '24 hours'
       WHERE id = $3`,
      [totalMeetingDuration, lastLeaveTime, sessionId],
    );
    console.log('Session marked as complete-pending.');

    // Notify the student: Fetch student's email using student_id (which is users.id)
    const studentEmailResult = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [session.student_id],
    );
    if (studentEmailResult.rowCount > 0) {
      await sendNotification({
        to: studentEmailResult.rows[0].email,
        subject: 'Session Completion Pending Confirmation',
        body: `Dear Student,\n\nYour session has been marked as complete-pending by your tutor. Please confirm it within 24 hours to complete the process.\n\nBest regards,\nTutoring Platform`,
      });
      console.log(
        'Notification sent to student:',
        studentEmailResult.rows[0].email,
      );
    }

    res.status(200).json({
      message: 'Session marked as complete, pending student confirmation.',
    });
  } catch (error) {
    console.error('Error completing session:', error.message || error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const confirmCompletion = async (req, res) => {
  const client = await pool.connect();
  const LOG = (...a) => console.log('[confirmCompletion]', ...a);
  const WARN = (...a) => console.warn('[confirmCompletion]', ...a);
  const ERR = (...a) => console.error('[confirmCompletion]', ...a);

  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    // Parse sessionId (accept number or numeric string)
    const raw = req.body?.sessionId;
    const sessionId =
      typeof raw === 'number' && Number.isInteger(raw)
        ? raw
        : typeof raw === 'string' && /^\d+$/.test(raw)
          ? Number(raw)
          : null;
    if (!sessionId)
      return res.status(400).json({ message: 'Invalid session id' });

    const studentId =
      typeof req.user.id === 'number'
        ? req.user.id
        : typeof req.user.id === 'string' && /^\d+$/.test(req.user.id)
          ? Number(req.user.id)
          : null;
    if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

    LOG('BEGIN', { sessionId, studentId });
    await client.query('BEGIN');

    // 1) Fetch session + tutor payout prefs (lock row). Must be in 'completed_pending'
    const { rows: sessions } = await client.query(
      `
      SELECT ts.*,
             p.user_id  AS tutor_user_id,
             u.email    AS tutor_email,
             COALESCE(p.payout_currency, 'USD') AS payout_currency
      FROM tutor_sessions ts
      JOIN profiles p ON p.user_id = ts.tutor_id AND p.role = 'tutor'
      JOIN users    u ON u.id = p.user_id
      WHERE ts.id = $1
        AND ts.student_id = $2
        AND ts.status = 'completed_pending'
      FOR UPDATE
      `,
      [sessionId, studentId],
    );
    if (!sessions.length) {
      await client.query('ROLLBACK');
      return res
        .status(404)
        .json({ message: 'Session not found or already processed.' });
    }
    const s = sessions[0];

    // 2) Compute accrual (1 token = $1)
    const grossTokens = Math.round(Number(s.amount ?? 0));
    const grossUsd = +grossTokens.toFixed(2);
    const feeUsd = +(grossUsd * PLATFORM_FEE).toFixed(2);
    const netUsd = +(grossUsd - feeUsd).toFixed(2);

    const payoutCurrency = String(s.payout_currency || 'USD').toUpperCase();
    let fxRateUsed = 1;
    let creditedAmount = netUsd;

    if (payoutCurrency === 'KES') {
      fxRateUsed = await getFxRate('USD', 'KES'); // function defined at top of file
      creditedAmount = +(netUsd * fxRateUsed).toFixed(2);
    }

    LOG('Earnings', {
      grossUsd,
      feeUsd,
      netUsd,
      payoutCurrency,
      creditedAmount,
      fxRateUsed,
    });

    // 3) Accrue to tutor earnings balance
    await client.query(
      `INSERT INTO earnings_balances (user_id, currency, available_amount, pending_amount, updated_at)
       VALUES ($1,$2,$3,0,NOW())
       ON CONFLICT (user_id, currency)
       DO UPDATE SET
         available_amount = earnings_balances.available_amount + EXCLUDED.available_amount,
         updated_at = NOW()`,
      [s.tutor_user_id, payoutCurrency, creditedAmount],
    );

    // 4) Mark session completed (supports schemas without completed_at)
    const { rows: colCheck } = await client.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'tutor_sessions'
          AND column_name  = 'completed_at'`,
    );
    const hasCompletedAt = colCheck.length > 0;

    const updateSql = hasCompletedAt
      ? `UPDATE tutor_sessions
           SET status = 'completed', completed_at = NOW()
         WHERE id = $1
         RETURNING *`
      : `UPDATE tutor_sessions
           SET status = 'completed'
         WHERE id = $1
         RETURNING *`;

    const { rows: updatedRows } = await client.query(updateSql, [sessionId]);
    const updatedSession = updatedRows[0];

    // 5) Transaction log (internal accrual from platform balance)
    const desc =
      `Session "${s.subject}" · gross ${grossUsd.toFixed(2)} USD (tokens ${grossTokens}), ` +
      `fee ${feeUsd.toFixed(2)} USD, accrued ${creditedAmount} ${payoutCurrency}` +
      (payoutCurrency === 'KES' ? ` @ ${fxRateUsed} FX` : '');

    LOG('Insert txn', {
      userId: s.tutor_user_id,
      amount: creditedAmount,
      currency: payoutCurrency,
      paymentMethod: 'PlatformBalance',
    });

    await client.query(
      `INSERT INTO transactions
         (user_id, type, amount, description, date, status, currency, payment_method, created_at, updated_at)
       VALUES ($1, 'Completed Earnings', $2, $3, NOW(), 'Completed', $4, $5, NOW(), NOW())`,
      [
        s.tutor_user_id,
        creditedAmount,
        desc,
        payoutCurrency,
        'PlatformBalance',
      ],
    );

    await client.query('COMMIT');
    LOG('COMMIT complete');

    // 6) Notifications (best-effort, post-commit)
    (async () => {
      try {
        const [{ email: studentEmail } = {}] = (
          await pool.query('SELECT email FROM users WHERE id = $1', [
            s.student_id,
          ])
        ).rows;

        const tasks = [];
        if (studentEmail) {
          tasks.push(
            sendNotification({
              to: studentEmail,
              subject: 'Your session is complete',
              body: `Your session "${s.subject}" has been marked complete.`,
            }),
          );
        }
        if (s.tutor_email) {
          tasks.push(
            sendNotification({
              to: s.tutor_email,
              subject: 'Earnings accrued for your session',
              body:
                `We’ve added ${creditedAmount} ${payoutCurrency} to your available balance ` +
                `(after ${Math.round(PLATFORM_FEE * 100)}% fee).`,
            }),
          );
        }
        await Promise.all(tasks);
        LOG('Notifications sent');
      } catch (e) {
        WARN('Notifications failed', { err: e?.message });
      }
    })().catch(() => {});

    return res.status(200).json({
      message: 'Session completed; earnings accrued.',
      session: updatedSession,
      accrual: {
        currency: payoutCurrency,
        creditedAmount,
        grossUSD: grossUsd,
        netUSD: netUsd,
        fxRateUsed,
        feePercent: PLATFORM_FEE,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    ERR('confirmCompletion error:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error?.message });
  } finally {
    client.release();
  }
};

// Fetch Sessions, Earnings, and Reviews
export const fetchDataByType = async (req, res) => {
  const { type } = req.params; // Get the type from URL parameters
  try {
    console.log(`Fetching data for type: ${type}`);

    // Instead of fetching profileId, use the logged-in user’s ID directly
    const userId = req.user.id;

    // Query sessions/reviews based on userId (which is users.id)
    const dataResult = await pool.query(
      `SELECT 
         ts.*,
         ts.session_type AS "sessionType",
         ts.subject            AS "subject",
         p1.name AS "tutorName",
         
         p1.role AS "tutorRole",
         p1.user_id AS "tutorUser",
         p2.name AS "studentName",
         p2.role AS "studentRole",
         p2.user_id AS "studentUser"
       FROM tutor_sessions ts
       JOIN profiles p1 ON ts.tutor_id = p1.user_id
       JOIN profiles p2 ON ts.student_id = p2.user_id
       WHERE ts.type = $1 AND (ts.tutor_id = $2 OR ts.student_id = $2)`,
      [type, userId],
    );

    console.log(`Fetched ${type} data:`, dataResult.rows);

    res.status(200).json({ success: true, data: dataResult.rows });
  } catch (error) {
    console.error(`Error fetching ${type} data:`, error.message || error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const createZoomLink = async (req, res) => {
  try {
    const { sessionId, topic, startTime, duration, tutorName } = req.body;

    if (!sessionId || !topic || !startTime || !duration || !tutorName) {
      return res.status(400).json({ message: 'Missing required parameters.' });
    }

    console.log('🔹 Received Payload:', {
      sessionId,
      topic,
      startTime,
      duration,
      tutorName,
    });

    // Fetch session details, joining on profiles.user_id
    const sessionResult = await pool.query(
      `SELECT ts.*, u.email AS tutor_email, u2.email AS student_email
       FROM tutor_sessions ts
       JOIN profiles p  ON ts.tutor_id = p.user_id
       JOIN users    u  ON p.user_id = u.id
       JOIN profiles p2 ON ts.student_id = p2.user_id
       JOIN users    u2 ON p2.user_id = u2.id
       WHERE ts.id = $1`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const session = sessionResult.rows[0];

    console.log(
      `✅ Session found for tutor ${session.tutor_id} and student ${session.student_id}`,
    );

    // Calculate required Zoom meetings
    const maxDuration = 40;
    const meetingCount = Math.ceil(duration / maxDuration);
    const meetings = [];

    for (let i = 0; i < meetingCount; i++) {
      const meetingStartTime = new Date(startTime);
      meetingStartTime.setMinutes(
        meetingStartTime.getMinutes() + i * maxDuration,
      );

      const zoomMeeting = await createZoomMeeting(
        `${topic} (Part ${i + 1})`,
        meetingStartTime.toISOString(),
        Math.min(maxDuration, duration - i * maxDuration),
        tutorName,
      );

      if (!zoomMeeting || !zoomMeeting.join_url || !zoomMeeting.id) {
        throw new Error('❌ Failed to create Zoom meeting.');
      }

      console.log(`✅ Zoom Meeting Created: ${zoomMeeting.join_url}`);
      meetings.push(zoomMeeting);
    }

    // Update database with Zoom arrays
    await pool.query(
      `UPDATE tutor_sessions 
       SET zoom_links = $1, zoom_meeting_ids = $2 
       WHERE id = $3`,
      [meetings.map((m) => m.join_url), meetings.map((m) => m.id), sessionId],
    );

    console.log('✅ Zoom Links and Meeting IDs saved to the database.');

    // Send Email Notifications
    await Promise.all([
      sendNotification({
        to: session.tutor_email,
        subject: 'Zoom Links for Your Tutoring Session',
        body: `Dear Tutor,\n\nYour tutoring session has been scheduled.\n\nJoin using these links:\n${meetings
          .map((m, i) => `Part ${i + 1}: ${m.join_url}`)
          .join('\n')}\n\nBest regards,\nTutoring Platform`,
      }),
      sendNotification({
        to: session.student_email,
        subject: 'Zoom Links for Your Tutoring Session',
        body: `Dear Student,\n\nYour tutoring session has been scheduled.\n\nJoin using these links:\n${meetings
          .map((m, i) => `Part ${i + 1}: ${m.join_url}`)
          .join('\n')}\n\nBest regards,\nTutoring Platform`,
      }),
    ]);

    console.log('✅ Email notifications sent.');

    // Return Success Response
    res.status(200).json({
      message: 'Zoom links created successfully.',
      zoomLinks: meetings.map((m) => m.join_url),
    });
  } catch (error) {
    console.error('❌ Error creating Zoom links:', error.message || error);
    res.status(500).json({ message: 'Failed to create Zoom links.' });
  }
};

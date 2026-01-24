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

function normalizeTxnPaymentMethod(input) {
  const s = String(input ?? '').trim();
  const upper = s.toUpperCase();

  if (!s) return 'PlatformBalance';

  // MPESA variants -> DB canonical
  if (
    upper === 'MPESA' ||
    upper === 'M-PESA' ||
    upper === 'M_PESA' ||
    upper === 'M PESA' ||
    s === 'M-Pesa'
  ) {
    return 'M-Pesa';
  }

  // Wise variants
  if (upper === 'WISE') return 'Wise';

  // Platform balance variants
  if (upper === 'PLATFORMBALANCE' || upper === 'PLATFORM_BALANCE') {
    return 'PlatformBalance';
  }

  // Safe fallback (must match DB CHECK)
  return 'PlatformBalance';
}

function httpError(res, status, code, message, extra = {}) {
  // message is what the app should show to the user
  return res.status(status).json({ ok: false, code, message, ...extra });
}


async function getFxRate(base, quote) {
  if (base === 'USD' && quote === 'KES') return USD_TO_KES_DEFAULT;
  return 1; // USD->USD or KES->KES placeholder
}



// Create a New Session
export const createSession = async (req, res) => {
  console.log('Received Payload:', req.body);

  try {
    // ✅ Only validate keys your API actually accepts
    const cleanBody = {
      tutorId: req.body?.tutorId,
      tutorName: req.body?.tutorName,
      subject: req.body?.subject,
      pricing: req.body?.pricing,
      date: req.body?.date,
      sessionType: req.body?.sessionType,
      note: req.body?.note,
    };

    const { tutorId, tutorName, subject, date, sessionType, note } =
      await sessionValidationSchema.validateAsync(cleanBody, {
        abortEarly: false,
        allowUnknown: false,
        convert: true,
      });

    // ✅ Authenticated student user id (users.id)
    const studentUserId = req.user.id;

    // 1) Fetch student details (users.id)
    const studentUserRes = await pool.query('SELECT * FROM users WHERE id = $1', [
      studentUserId,
    ]);

    if (studentUserRes.rows.length === 0) {
      console.warn('[createSession] student user NOT FOUND', { studentUserId });
      return res.status(404).json({ message: 'Student user not found.' });
    }

    const studentUser = studentUserRes.rows[0];

    // 2) Fetch tutor profile (accept profiles.id OR profiles.user_id)
    const tutorProfileRes = await pool.query(
      `
      SELECT *
      FROM profiles
      WHERE user_id::text = $1
         OR id::text      = $1
      LIMIT 1
      `,
      [String(tutorId)],
    );

    if (tutorProfileRes.rows.length === 0) {
      console.warn('[createSession] tutor profile NOT FOUND (user_id or id)', { tutorId });
      return res.status(404).json({ message: 'Tutor not found.' });
    }

    const tutorProfile = tutorProfileRes.rows[0];

    // ✅ canonical tutor users.id (THIS is what tutor_sessions.tutor_id expects)
    const tutorUserId = tutorProfile.user_id;

    // 3) Validate session pricing (from tutorProfile)
    const pricingData = tutorProfile.pricing;
    const pricing =
      typeof pricingData === 'string' ? JSON.parse(pricingData) : pricingData || {};

    const sessionCost = pricing?.[sessionType];

    if (!sessionCost) {
      return res
        .status(400)
        .json({ message: 'Invalid session type or pricing not available.' });
    }

    // 4) Check student token balance
    if (Number(studentUser.tokens) < Number(sessionCost)) {
      const tokenDifference = Number(sessionCost) - Number(studentUser.tokens);
      return res.status(400).json({
        message: `Insufficient tokens. You need ${tokenDifference} more tokens to book this session.`,
      });
    }

    // 5) Deduct tokens from the student
    await pool.query('UPDATE users SET tokens = tokens - $1 WHERE id = $2', [
      sessionCost,
      studentUserId,
    ]);

    // 6) Create session (✅ use tutorUserId in tutor_sessions.tutor_id)
    const newSession = await pool.query(
      `INSERT INTO tutor_sessions
         (tutor_id, tutor_name, student_id, session_type, subject, date, status, amount, type, description, created_at)
       VALUES
         ($1,       $2,         $3,         $4,           $5,      $6,   'upcoming', $7,     'session', $8,        NOW())
       RETURNING *`,
      [
        tutorUserId,          // ✅ users.id (canonical)
        tutorName || tutorProfile.name || null,
        studentUserId,        // users.id
        sessionType,
        subject,
        date,
        sessionCost,
        note || null,
      ],
    );

    // 7) Unlock chat (✅ use tutorUserId everywhere downstream)
    const studentProfileId = await getProfileIdForUserId(studentUserId);
    const tutorProfileId = await getProfileIdForUserId(tutorUserId);

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
          `UPDATE conversations
             SET chat_status='unlocked', updated_at=NOW()
           WHERE id=$1 AND chat_status <> 'unlocked'`,
          [conversationId],
        );
      }

      emitToProfile(studentProfileId, 'chatUnlocked', { conversationId });
      emitToProfile(tutorProfileId, 'chatUnlocked', { conversationId });
    }

    // 8) Email tutor (✅ fetch tutor user using tutorUserId)
    const tutorUserRes = await pool.query('SELECT * FROM users WHERE id = $1', [
      tutorUserId,
    ]);

    if (tutorUserRes.rows.length === 0) {
      console.warn('[createSession] tutor user NOT FOUND', { tutorUserId, tutorId });
      return res.status(404).json({ message: 'Tutor user not found.' });
    }

    const tutorUser = tutorUserRes.rows[0];

    await sendNotification({
      to: tutorUser.email,
      subject: 'New Tutoring Session Scheduled',
      body: `Dear ${tutorUser.name},\n\nA new session has been scheduled with you by ${studentUser.name}.\n\nSession Details:\nSubject: ${subject}\nDate: ${new Date(
        date,
      ).toLocaleString()}\nSession Type: ${sessionType}\n\nBest regards,\nTutoring Platform`,
    });

    return res.status(201).json({
      message: 'Session created successfully.',
      session: newSession.rows[0],
      tutorUserId, // optional for debugging
    });
  } catch (error) {
    console.error('Error creating session:', error.message || error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
;

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

    console.log('[acceptSession] tutorProfilePayout.rows:', tutorProfilePayout.rows);

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
      console.log('[acceptSession] No FX applied (payoutCurrency is not KES):', {
        payoutCurrency,
        creditedAmount,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 6) Fetch Payment record for the student (optional, LOGGED)
    // ─────────────────────────────────────────────────────────────
    const paymentRecord = await pool.query(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sessionData.student_id],
    );

    console.log('[acceptSession] paymentRecord.rowCount:', paymentRecord.rowCount);

    // ✅ UPDATED: normalize payment method to match DB CHECK
    let paystackRef = null;
    let mpesaRef = null;
    let paymentMethod = 'PlatformBalance'; // must match CHECK

    if (paymentRecord.rows.length === 0) {
      console.warn('[acceptSession] Payment record not found; using PlatformBalance', {
        sessionId,
        studentId: sessionData.student_id,
      });
    } else {
      const pr = paymentRecord.rows[0];

      console.log('[acceptSession] paymentRecord row:', {
        id: pr.id,
        payment_method: pr.payment_method,
        transaction_id: pr.transaction_id,
        mpesa_reference: pr.mpesa_reference,
      });

      // Normalize to DB allowed values
      paymentMethod = normalizeTxnPaymentMethod(pr.payment_method);

      // Keep refs (optional)
      if (paymentMethod === 'M-Pesa') {
        mpesaRef = pr.mpesa_reference || pr.transaction_id || null;
      }

      // If upstream mentions paystack, keep ref for analytics, but DO NOT set paymentMethod='Paystack'
      if (String(pr.payment_method || '').toLowerCase().includes('paystack')) {
        paystackRef = pr.transaction_id || null;
      }

      console.log('[acceptSession] transaction.payment_method normalize', {
        raw: pr.payment_method,
        normalized: paymentMethod,
        allowed: ['M-Pesa', 'Wise', 'PlatformBalance'],
      });
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
        paymentMethod, // ✅ always one of: M-Pesa | Wise | PlatformBalance
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

    return res.status(200).json({
      message: 'Session accepted, student notified, and transaction recorded.',
      session: sessionData,
    });
  } catch (error) {
    console.error('[acceptSession] ERROR:', error.message || error);
    console.log('[acceptSession] ========= END (ERROR) =========\n');
    return res.status(500).json({ message: 'Internal server error.' });
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
  const LOG = (...a) => console.log('[completeSession]', ...a);
  const WARN = (...a) => console.warn('[completeSession]', ...a);
  const ERR = (...a) => console.error('[completeSession]', ...a);

  try {
    const { sessionId } = req.body;
    const tutorUserId = req.user?.id;

    LOG('BEGIN', { sessionId, tutorUserId });

    // ---- Guards / Friendly errors ----
    if (!tutorUserId) {
      return httpError(
        res,
        401,
        'UNAUTHORIZED',
        'You must be logged in as a tutor to mark a session complete.',
      );
    }

    const sid =
      typeof sessionId === 'number'
        ? sessionId
        : typeof sessionId === 'string' && /^\d+$/.test(sessionId)
          ? Number(sessionId)
          : null;

    if (!sid) {
      return httpError(
        res,
        400,
        'INVALID_SESSION_ID',
        'Invalid session id. Please refresh and try again.',
      );
    }

    // ---- Fetch session (must be accepted + owned by tutor) ----
    const sessionResult = await pool.query(
      `SELECT id, tutor_id, student_id, session_type, zoom_meeting_ids, status
       FROM tutor_sessions
       WHERE id = $1 AND tutor_id = $2`,
      [sid, tutorUserId],
    );

    LOG('session query', { rowCount: sessionResult.rowCount });

    if (sessionResult.rowCount === 0) {
      return httpError(
        res,
        404,
        'SESSION_NOT_FOUND',
        'Session not found, or it does not belong to you.',
        { sessionId: sid },
      );
    }

    const session = sessionResult.rows[0];
    LOG('session found', session);

    if (session.status !== 'accepted') {
      return httpError(
        res,
        400,
        'SESSION_NOT_ACCEPTED',
        `You can only mark an accepted session as complete-pending. Current status: "${session.status}".`,
        { status: session.status },
      );
    }

    // ---- Validate Zoom IDs ----
    const meetingIds = session.zoom_meeting_ids;
    if (!Array.isArray(meetingIds) || meetingIds.length === 0) {
      return httpError(
        res,
        400,
        'NO_ZOOM_MEETING_IDS',
        'This session has no Zoom meeting IDs yet. Create Zoom links first, then try again.',
      );
    }

    LOG('meetingIds', meetingIds);

    // ---- Fetch attendance ----
    const attendanceResult = await pool.query(
      `SELECT event, timestamp
       FROM zoomwebhooks
       WHERE meeting_ids && $1::text[]`,
      [meetingIds],
    );

    LOG('attendance rows', { rowCount: attendanceResult.rowCount });

    if (attendanceResult.rowCount === 0) {
      return httpError(
        res,
        400,
        'NO_ATTENDANCE_FOUND',
        'No Zoom attendance records were found yet. If you just finished the session, wait a moment and try again.',
        { meetingIds },
      );
    }

    // ---- Duration rules ----
    const sessionDurationMap = {
      privateSession: 60,
      groupSession: 90,
      lecture: 120,
      workshop: 180,
    };

    const expectedDuration = sessionDurationMap[session.session_type] || 60;
    const requiredAttendance = Math.round(expectedDuration * 0.75);

    LOG('duration policy', { expectedDuration, requiredAttendance });

    // ---- Compute attendance window ----
    let firstJoinTime = null;
    let lastLeaveTime = null;

    for (const record of attendanceResult.rows) {
      const t = record?.timestamp ? new Date(record.timestamp) : null;
      if (!t || Number.isNaN(t.getTime())) continue;

      if (record.event === 'meeting.participant_joined') {
        if (!firstJoinTime || t < firstJoinTime) firstJoinTime = t;
      }
      if (record.event === 'meeting.participant_left') {
        if (!lastLeaveTime || t > lastLeaveTime) lastLeaveTime = t;
      }
    }

    LOG('attendance window', { firstJoinTime, lastLeaveTime });

    if (!firstJoinTime || !lastLeaveTime) {
      return httpError(
        res,
        400,
        'INCOMPLETE_ATTENDANCE_EVENTS',
        'Zoom records are incomplete (missing join/leave events). Please ensure the meeting was started and ended properly, then try again.',
      );
    }

    if (lastLeaveTime <= firstJoinTime) {
      return httpError(
        res,
        400,
        'INVALID_ATTENDANCE_TIMES',
        'Zoom attendance times look invalid (leave time is not after join time). Please try again later.',
      );
    }

    const totalMeetingDuration = Math.round(
      (lastLeaveTime - firstJoinTime) / (1000 * 60),
    );

    LOG('computed duration', { totalMeetingDuration });

    if (totalMeetingDuration < requiredAttendance) {
      return httpError(
        res,
        400,
        'INSUFFICIENT_ATTENDANCE',
        `Completion failed. The session lasted ${totalMeetingDuration} minutes, but at least ${requiredAttendance} minutes are required (75% of expected duration).`,
        { totalMeetingDuration, requiredAttendance, expectedDuration },
      );
    }

    // ---- Mark session complete-pending ----
    const upd = await pool.query(
      `UPDATE tutor_sessions 
       SET status = 'completed_pending', 
           duration = $1,
           end_time = $2,
           completion_request_time = NOW(), 
           completion_deadline = NOW() + INTERVAL '24 hours'
       WHERE id = $3
       RETURNING id, status, duration, end_time, completion_deadline`,
      [totalMeetingDuration, lastLeaveTime, sid],
    );

    LOG('update complete-pending', { rowCount: upd.rowCount, row: upd.rows?.[0] });

    // ---- Notify student (best-effort) ----
    const studentEmailResult = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [session.student_id],
    );

    if (studentEmailResult.rowCount > 0) {
      const email = studentEmailResult.rows[0].email;
      try {
        await sendNotification({
          to: email,
          subject: 'Session Completion Pending Confirmation',
          body:
            `Dear Student,\n\nYour tutor marked your session as complete-pending. ` +
            `Please confirm it within 24 hours to complete the process.\n\nBest regards,\nTutoring Platform`,
        });
        LOG('student notified', { email });
      } catch (e) {
        WARN('failed to notify student', { err: e?.message });
        // do not fail the request for email issues
      }
    } else {
      WARN('student email not found', { studentId: session.student_id });
    }

    return res.status(200).json({
      ok: true,
      message: 'Session marked as complete-pending. Waiting for student confirmation.',
      data: upd.rows[0],
    });
  } catch (error) {
    ERR('ERROR', error);

    // ✅ Return a nicer message even on unexpected failures
    return httpError(
      res,
      500,
      'SERVER_ERROR',
      'Something went wrong while marking the session complete. Please try again, or contact support if it persists.',
      { detail: error?.message },
    );
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

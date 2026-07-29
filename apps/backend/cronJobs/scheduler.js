import cron from 'node-cron';
import pool from '../config/db.js'; // PostgreSQL database connection
import { sendNotification } from '../utils/sendNotification.js'; // Email notification service


// Schedule job to process expired sessions every hour
cron.schedule('0 * * * *', async () => {
  try {
    console.log(
      "🔹 Running cron job: Checking expired 'completed_pending' sessions...",
    );

    const legacySessionsTable = await pool.query("SELECT to_regclass('public.tutor_sessions') AS table_name");
    if (!legacySessionsTable.rows[0]?.table_name) {
      console.log('[scheduler] tutor_sessions table not present; skipping legacy session completion cron.');
      return;
    }

    // Query to fetch expired sessions
    const expiredSessionsQuery = `
      SELECT ts.id, ts.subject, ts.student_id, ts.tutor_id, u1.email AS student_email, u2.email AS tutor_email
      FROM tutor_sessions ts
      JOIN users u1 ON ts.student_id = u1.id
      JOIN users u2 ON ts.tutor_id = u2.id
      WHERE ts.status = 'completed_pending' AND ts.completion_deadline < NOW()
    `;

    const { rows: expiredSessions } = await pool.query(expiredSessionsQuery);

    if (expiredSessions.length === 0) {
      console.log('✅ No expired sessions found.');
      return;
    }

    console.log(
      `🔹 Found ${expiredSessions.length} expired sessions. Processing...`,
    );

    for (const session of expiredSessions) {
      // Update session status to 'completed'
      await pool.query(
        `UPDATE tutor_sessions SET status = 'completed' WHERE id = $1`,
        [session.id],
      );

      // Notify both student and tutor
      await Promise.all([
        sendNotification({
          to: session.student_email,
          subject: 'Session Completed Automatically',
          body: `Dear Student, the session "${session.subject}" has been automatically marked as completed after the 24-hour confirmation period.`,
        }),
        sendNotification({
          to: session.tutor_email,
          subject: 'Session Completed Automatically',
          body: `Dear Tutor, the session "${session.subject}" has been automatically confirmed as completed. Your earnings will reflect shortly.`,
        }),
      ]);

      console.log(
        `✅ Session ID ${session.id} marked as completed and notifications sent.`,
      );
    }

    console.log(
      '✅ Automatic session completion cron job executed successfully.',
    );
  } catch (error) {
    console.error('❌ Error processing automatic session completion:', error);
  }
});

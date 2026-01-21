// apps/backend/middleware/requireTutorProfile.js
import pool from '../config/db.js';

export default async function requireTutorProfile(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { rows } = await pool.query(
      `SELECT 1
         FROM profiles
        WHERE user_id = $1
          AND LOWER(role) = 'tutor'
        LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(403).json({ message: 'Only tutors may upload ClassVault content.' });
    }

    return next();
  } catch (e) {
    console.error('[requireTutorProfile] error', e);
    return res.status(500).json({ message: 'Failed to verify tutor permissions.' });
  }
}

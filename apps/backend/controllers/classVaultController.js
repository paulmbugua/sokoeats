// apps/backend/controllers/classVaultController.js

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { v4 as uuid } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import pool from '../config/db.js';
import {
  classVaultValidationSchema,
  classVaultUpdateValidationSchema, // ✅ needed by updateVideoJson
} from '../validators/classVaultValidator.js';
import { sendNotification } from '../utils/sendNotification.js';
import { v2 as cloudinary } from 'cloudinary';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PLATFORM_FEE = 0.15; // 15%
const USD_TO_KES_DEFAULT = 133; // replace with your live rate source

async function getFxRate(base, quote) {
  if (base === 'USD' && quote === 'KES') return USD_TO_KES_DEFAULT;
  return 1; // USD->USD or KES->KES placeholder (adjust if you’ll price differently)
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function parsePagination(req, fallbackLimit = 12) {
  const limit = clampInt(req.query?.limit, 1, 50, fallbackLimit);
  const offset = clampInt(req.query?.offset, 0, Number.MAX_SAFE_INTEGER, 0);
  const q = String(req.query?.q ?? '').trim();
  return { limit, offset, q };
}
/** Upload one or more local files to Cloudinary */
async function uploadToCloudinary(files, resourceType = 'image') {
  try {
    const uploads = files.map((file) =>
      cloudinary.uploader
        .upload(file.path, {
          resource_type: resourceType,
          folder: 'class_vault',
          public_id: `${resourceType}/${path.basename(file.path, path.extname(file.path))}_${uuid()}`,
        })
        .then((res) => ({ url: res.secure_url, public_id: res.public_id })),
    );
    return Promise.all(uploads);
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    throw new Error('File upload failed');
  }
}

/** Delete one or more Cloudinary public_ids */
async function deleteFromCloudinary(publicIds, resourceType = 'image') {
  try {
    await cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType,
    });
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
}

/** Extract the public_id (folder/path/name) from a Cloudinary URL */
function getPublicIdFromUrl(url) {
  const parts = url.split('/upload/');
  if (parts.length < 2) return null;
  return parts[1].split('.')[0];
}

// ─── FFmpeg Utilities ────────────────────────────────────────────────────────

function normalizePath(p) {
  // Normalize for Windows and *nix; avoids weird mixed separators
  return path.normalize(p);
}

// More defensive, with file checks + detailed logs
async function generateThumbnail(inputPath, outputPath) {
  const src = normalizePath(inputPath);
  const destFolder = path.dirname(outputPath);
  const destFile = path.basename(outputPath);

  try {
    // Ensure source exists and has nonzero size
    const stats = await fs.stat(src);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error(
        `Input video invalid or empty at ${src} (size=${stats.size})`,
      );
    }

    // Ensure output folder exists
    await fs.mkdir(destFolder, { recursive: true });

    console.log('[ffmpeg:thumb] start', {
      src,
      outputPath,
      sizeBytes: stats.size,
    });

    return await new Promise((resolve, reject) => {
      let stderr = '';

      ffmpeg(src)
        .on('start', (cmd) => {
          console.log('[ffmpeg:thumb:start]', cmd);
        })
        .on('stderr', (line) => {
          stderr += line + '\n';
          console.log('[ffmpeg:thumb:stderr]', line);
        })
        .on('end', () => {
          console.log('[ffmpeg:thumb:end]', { outputPath });
          resolve();
        })
        .on('error', (err) => {
          console.error('[ffmpeg:thumb:error]', {
            message: err.message,
            stderr,
          });
          reject(new Error(`Thumbnail generation failed: ${err.message}`));
        })
        .screenshots({
          timestamps: ['10%'], // pick a relative position; less likely to hit a weird first frame
          filename: destFile,
          folder: destFolder,
          size: '320x240',
        });
    });
  } catch (err) {
    console.error('[ffmpeg:thumb] pre-check / runtime error', {
      src,
      outputPath,
      err: err?.message,
    });
    throw err;
  }
}

async function generatePreview(inputPath, outputPath, duration = 30) {
  const src = normalizePath(inputPath);
  const dest = normalizePath(outputPath);

  try {
    const stats = await fs.stat(src);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error(
        `Input video invalid or empty at ${src} (size=${stats.size})`,
      );
    }

    // Ensure output folder exists
    await fs.mkdir(path.dirname(dest), { recursive: true });

    console.log('[ffmpeg:preview] start', {
      src,
      dest,
      sizeBytes: stats.size,
      duration,
    });

    return await new Promise((resolve, reject) => {
      let stderr = '';

      ffmpeg(src)
        .seekInput(0)
        .outputOptions([`-t ${duration}`, '-c copy'])
        .output(dest)
        .on('start', (cmd) => {
          console.log('[ffmpeg:preview:start]', cmd);
        })
        .on('stderr', (line) => {
          stderr += line + '\n';
          console.log('[ffmpeg:preview:stderr]', line);
        })
        .on('end', () => {
          console.log('[ffmpeg:preview:end]', { dest });
          resolve();
        })
        .on('error', (err) => {
          console.error('[ffmpeg:preview:error]', {
            message: err.message,
            stderr,
          });
          reject(new Error(`Preview generation failed: ${err.message}`));
        })
        .run();
    });
  } catch (err) {
    console.error('[ffmpeg:preview] pre-check / runtime error', {
      src,
      outputPath,
      err: err?.message,
    });
    throw err;
  }
}

// ─── 1. Create Video (JSON) – with thumbnail & preview uploads ────────────────
export const createVideoJson = async (req, res) => {
  try {
    const { error, value } = classVaultValidationSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const {
      title,
      description,
      subject,
      grade_level,
      price,
      duration,
      tags,
      video_url = '',
      pdf_url = '',
    } = value;
    const tutor_id = req.user.id;

    let thumbnail_url = null;
    let preview_url = null;

    if (video_url) {
      // 1) Download video to temp file
      const makeAbsolute = (url) =>
        /^https?:\/\//.test(url)
          ? url
          : `${req.protocol}://${req.get('host')}${url}`;

      const tmpVideo = path.join(os.tmpdir(), `${uuid()}.mp4`);
      const resp = await fetch(makeAbsolute(video_url));
      if (!resp.ok) throw new Error('Failed to download video');
      await new Promise((r, rej) => {
        const ws = createWriteStream(tmpVideo);
        resp.body.pipe(ws);
        resp.body.on('error', rej);
        ws.on('finish', r);
      });

      // 2) Generate derivatives
      // 2) Log downloaded file details
      const { size } = await fs.stat(tmpVideo);
      console.log('[classVault] tmpVideo downloaded', {
        tmpVideo,
        sizeBytes: size,
        video_url,
      });

      // 3) Generate derivatives (best-effort — do NOT kill the whole request)
      const thumbLocal = path.join(os.tmpdir(), `${uuid()}.jpg`);
      const previewLocal = path.join(os.tmpdir(), `${uuid()}.mp4`);

      try {
        await generateThumbnail(tmpVideo, thumbLocal);
      } catch (thumbErr) {
        console.warn(
          '[classVault] Thumbnail generation failed, continuing without thumbnail',
          {
            err: thumbErr?.message,
          },
        );
      }

      try {
        await generatePreview(tmpVideo, previewLocal, 30);
      } catch (prevErr) {
        console.warn(
          '[classVault] Preview generation failed, continuing without preview',
          {
            err: prevErr?.message,
          },
        );
      }

      // 4) Upload whatever we managed to generate
      const uploads = [];

      try {
        // thumbnail (optional)
        try {
          const thumbStats = await fs.stat(thumbLocal);
          if (thumbStats.size > 0) {
            const [thumbUpload] = await uploadToCloudinary(
              [{ path: thumbLocal }],
              'image',
            );
            thumbnail_url = thumbUpload.url;
          }
        } catch (e) {
          console.warn('[classVault] No valid thumbnail to upload', e?.message);
        }

        // preview (optional)
        try {
          const prevStats = await fs.stat(previewLocal);
          if (prevStats.size > 0) {
            const [previewUpload] = await uploadToCloudinary(
              [{ path: previewLocal }],
              'video',
            );
            preview_url = previewUpload.url;
          }
        } catch (e) {
          console.warn('[classVault] No valid preview to upload', e?.message);
        }
      } finally {
        // 5) Cleanup temp files (ignore errors)
        Promise.allSettled([
          fs.unlink(tmpVideo),
          fs.unlink(thumbLocal).catch(() => {}),
          fs.unlink(previewLocal).catch(() => {}),
        ]).catch(() => {});
      }
    }

    // 5) Persist metadata
    const insertSQL = `
      INSERT INTO recorded_videos
        (tutor_id, title, description, subject, grade_level,
         price, duration, tags, video_url, pdf_url, preview_url, thumbnail_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *;
    `;
    const result = await pool.query(insertSQL, [
      tutor_id,
      title,
      description,
      subject,
      grade_level,
      price,
      duration,
      tags,
      video_url || null,
      pdf_url || null,
      preview_url,
      thumbnail_url,
    ]);

    return res.status(201).json({ success: true, video: result.rows[0] });
  } catch (err) {
    console.error('createVideoJson error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create video metadata',
      error: err.message,
    });
  }
};

/**
 * Secure download endpoint: only students who purchased may fetch URLs.
 */
export const downloadPdfOrVideo = async (req, res) => {
  try {
    const studentId = req.user.id;
    const videoId = Number(req.params.videoId);

    // ✅ Query the correct table name and column names:
    const access = await pool.query(
      `SELECT 1
         FROM classvault_purchases
        WHERE student_id = $1
          AND class_id   = $2`,
      [studentId, videoId],
    );

    if (access.rows.length === 0) {
      return res
        .status(403)
        .json({ message: 'Access denied. Please purchase the class.' });
    }

    const result = await pool.query(
      `SELECT pdf_url, video_url
         FROM recorded_videos
        WHERE id = $1`,
      [videoId],
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('downloadPdfOrVideo error:', err);
    return res
      .status(500)
      .json({ message: 'Server error fetching resources.' });
  }
};

/** Fetch all videos (for listing) */
export const getAllVideos = async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM recorded_videos ORDER BY created_at DESC',
  );
  res.json(result.rows);
};

/** Explore marketplace (public) with pagination */
export const listMarketplaceVideos = async (req, res) => {
  try {
    const { limit, offset, q } = parsePagination(req, 12);
    const like = q ? `%${q.toLowerCase()}%` : '';
    const params = [limit, offset];
    let where = '';
    if (like) {
      params.push(like);
      const pLike = `$${params.length}`;
      where = `
        WHERE LOWER(COALESCE(title, '')) LIKE ${pLike}
           OR LOWER(COALESCE(description, '')) LIKE ${pLike}
           OR LOWER(COALESCE(subject, '')) LIKE ${pLike}
           OR LOWER(COALESCE(grade_level, '')) LIKE ${pLike}
      `;
    }

    const sql = `
      SELECT
        id, tutor_id, title, description, subject, grade_level,
        price, duration, tags, video_url, pdf_url, preview_url,
        thumbnail_url, created_at,
        COUNT(*) OVER()::int AS total_rows
      FROM recorded_videos
      ${where}
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(sql, params);
    const total = rows[0]?.total_rows ?? 0;
    const items = rows.map(({ total_rows, ...rest }) => rest);
    return res.json({ items, total, limit, offset });
  } catch (err) {
    console.error('[classVault] listMarketplaceVideos error', err);
    return res.status(500).json({ message: 'Failed to load classvault marketplace.' });
  }
};

/** Tutor-owned ClassVault items */
export const listMyVideos = async (req, res) => {
  try {
    const tutorId = req.user?.id;
    if (!tutorId) return res.status(401).json({ message: 'Unauthorized' });

    const { limit, offset, q } = parsePagination(req, 12);
    const like = q ? `%${q.toLowerCase()}%` : '';
    const params = [tutorId, limit, offset];
    let where = '';
    if (like) {
      params.push(like);
      const pLike = `$${params.length}`;
      where = `
        AND (
          LOWER(COALESCE(rv.title, '')) LIKE ${pLike}
          OR LOWER(COALESCE(rv.description, '')) LIKE ${pLike}
          OR LOWER(COALESCE(rv.subject, '')) LIKE ${pLike}
          OR LOWER(COALESCE(rv.grade_level, '')) LIKE ${pLike}
        )
      `;
    }

    const sql = `
      SELECT
        rv.id, rv.tutor_id, rv.title, rv.description, rv.subject, rv.grade_level,
        rv.price, rv.duration, rv.tags, rv.video_url, rv.pdf_url, rv.preview_url,
        rv.thumbnail_url, rv.created_at,
        COUNT(*) OVER()::int AS total_rows
      FROM recorded_videos rv
      WHERE rv.tutor_id = $1
      ${where}
      ORDER BY rv.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(sql, params);
    const total = rows[0]?.total_rows ?? 0;
    const items = rows.map(({ total_rows, ...rest }) => rest);
    return res.json({ items, total, limit, offset });
  } catch (err) {
    console.error('[classVault] listMyVideos error', err);
    return res.status(500).json({ message: 'Failed to load your ClassVault items.' });
  }
};

/** Fetch a single video’s metadata by ID */
export const getVideoById = async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'SELECT * FROM recorded_videos WHERE id = $1',
    [id],
  );
  res.json(result.rows[0]);
};

// ─── Delete Video & All Cloudinary Assets ───────────────────────────────────
export const deleteVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    const tutorId = req.user.id;

    // 1) Verify ownership
    const dbRes = await pool.query(
      'SELECT * FROM recorded_videos WHERE id = $1 AND tutor_id = $2',
      [id, tutorId],
    );
    if (dbRes.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Not found or unauthorized' });
    }
    const video = dbRes.rows[0];

    // 2) Collect Cloudinary public_ids
    const toDelete = [];
    for (let field of ['video_url', 'preview_url', 'thumbnail_url']) {
      if (video[field]) {
        const pid = getPublicIdFromUrl(video[field]);
        if (pid) toDelete.push(pid);
      }
    }
    // pdf_url left as-is (not managed by Cloudinary)

    // 3) Delete from Cloudinary
    await deleteFromCloudinary(toDelete, 'auto'); // 'auto' covers image/video

    // 4) Remove DB row
    await pool.query('DELETE FROM recorded_videos WHERE id = $1', [id]);

    res.status(200).json({
      success: true,
      message: 'Video and associated Cloudinary assets deleted.',
    });
  } catch (err) {
    console.error('deleteVideoById error:', err);
    res
      .status(500)
      .json({ success: false, message: 'Server error deleting video' });
  }
};

/**
 * JSON-based update endpoint: patch any subset of fields.
 */
export const updateVideoJson = async (req, res) => {
  const { id } = req.params;
  const tutorId = req.user.id;

  try {
    // 1) validate update payload
    const { error, value } = classVaultUpdateValidationSchema.validate(
      req.body,
    );
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    // 2) ensure record exists & tutor owns it
    const sel = await pool.query(
      'SELECT 1 FROM recorded_videos WHERE id = $1 AND tutor_id = $2',
      [id, tutorId],
    );
    if (sel.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Video not found or unauthorized' });
    }

    // 3) build dynamic SET clause
    const fields = Object.keys(value);
    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided to update.',
      });
    }
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const vals = fields.map((f) => value[f]);
    vals.push(id, tutorId);

    // 4) execute update
    const updateQuery = `
      UPDATE recorded_videos
      SET ${setClause}
      WHERE id = $${fields.length + 1} AND tutor_id = $${fields.length + 2}
      RETURNING *;
    `;
    const updated = await pool.query(updateQuery, vals);

    res.json({ success: true, video: updated.rows[0] });
  } catch (err) {
    console.error('Error updating video:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update video',
      error: err.message,
    });
  }
};

// apps/backend/controllers/classVaultController.js
export const purchaseClass = async (req, res) => {
  const client = await pool.connect();

  const LOG = (...a) => console.log('[purchaseClass]', ...a);
  const WARN = (...a) => console.warn('[purchaseClass]', ...a);
  const ERR = (...a) => console.error('[purchaseClass]', ...a);

  const PLATFORM_FEE =
    typeof globalThis.PLATFORM_FEE === 'number' &&
    !Number.isNaN(globalThis.PLATFORM_FEE)
      ? globalThis.PLATFORM_FEE
      : Number(process.env.PLATFORM_FEE ?? 0.15);

  async function safeGetFxRate(base = 'USD', quote = 'KES') {
    try {
      const v = await getFxRate(base, quote);
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error('bad fx');
      return n;
    } catch (e) {
      WARN('FX lookup failed, using fallback', {
        base,
        quote,
        err: e?.message,
      });
      return 130; // fallback for dev
    }
  }

  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });
    const studentId = req.user.id;

    const rawId = req.params.id;
    const videoId = Number(rawId);
    if (!Number.isInteger(videoId) || videoId <= 0) {
      return res.status(400).json({ message: 'Invalid class id' });
    }

    LOG('BEGIN purchase', { studentId, videoId });
    await client.query('BEGIN');

    // 1) load class
    const { rows: classRows } = await client.query(
      `SELECT id, tutor_id, price, title, subject, grade_level, video_url, pdf_url
         FROM recorded_videos
        WHERE id = $1`,
      [videoId],
    );
    if (!classRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Class not found.' });
    }
    const {
      tutor_id: tutorId,
      price: grossTokensRaw,
      title,
      subject,
      grade_level: gradeLevel,
      video_url: videoUrl,
      pdf_url: pdfUrl,
    } = classRows[0];
    const grossTokens = Math.round(Number(grossTokensRaw ?? 0));
    LOG('Loaded class', { tutorId, title, subject, gradeLevel, grossTokens });

    // 2) already purchased?
    const { rows: existing } = await client.query(
      `SELECT 1 FROM classvault_purchases WHERE student_id = $1 AND class_id = $2`,
      [studentId, videoId],
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      LOG('Already purchased - short circuit');
      const { rows: balRows } = await client.query(
        `SELECT tokens FROM users WHERE id = $1`,
        [studentId],
      );
      return res.status(200).json({
        message: 'Already purchased.',
        resources: { video_url: videoUrl, pdf_url: pdfUrl },
        tokens: Number(balRows[0]?.tokens ?? 0),
      });
    }

    // 3) student balance
    const { rows: userRows } = await client.query(
      `SELECT tokens, name, email FROM users WHERE id = $1`,
      [studentId],
    );
    if (!userRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Student not found.' });
    }
    const studentTokens = Number(userRows[0].tokens ?? 0);
    const studentName = userRows[0].name || 'Student';
    const studentEmail = userRows[0].email || null;

    if (studentTokens < grossTokens) {
      await client.query('ROLLBACK');
      LOG('Insufficient tokens', { have: studentTokens, need: grossTokens });
      return res.status(400).json({
        message: `Insufficient tokens. You need ${grossTokens - studentTokens} more.`,
      });
    }
    LOG('Sufficient balance', {
      currentTokens: studentTokens,
      charge: grossTokens,
    });

    // 4) deduct tokens (1 token = $1 internal parity)
    await client.query(`UPDATE users SET tokens = tokens - $1 WHERE id = $2`, [
      grossTokens,
      studentId,
    ]);

    // 5) tutor payout currency
    const { rows: profRows } = await client.query(
      `SELECT COALESCE(payout_currency,'USD') AS payout_currency
         FROM profiles
        WHERE user_id = $1 AND role='tutor'`,
      [tutorId],
    );
    const payoutCurrency = String(
      profRows[0]?.payout_currency || 'USD',
    ).toUpperCase();
    LOG('Tutor payout currency', { tutorId, payoutCurrency });

    // 6) fees + FX (15% fee default)
    const grossUsd = +grossTokens.toFixed(2);
    const feeUsd = +(grossUsd * PLATFORM_FEE).toFixed(2);
    const netUsd = +(grossUsd - feeUsd).toFixed(2);

    let fxRateUsed = 1;
    let creditedAmount = netUsd; // default USD
    if (payoutCurrency === 'KES') {
      fxRateUsed = await safeGetFxRate('USD', 'KES');
      creditedAmount = +(netUsd * fxRateUsed).toFixed(2);
    }
    LOG('Earnings calc', {
      grossUsd,
      feeUsd,
      netUsd,
      payoutCurrency,
      creditedAmount,
      fxRateUsed,
      feePercent: PLATFORM_FEE,
    });

    // 7) upsert tutor earnings balance (available)
    await client.query(
      `INSERT INTO earnings_balances (user_id, currency, available_amount, pending_amount, updated_at)
       VALUES ($1,$2,$3,0,NOW())
       ON CONFLICT (user_id, currency)
       DO UPDATE SET
         available_amount = earnings_balances.available_amount + EXCLUDED.available_amount,
         updated_at = NOW()`,
      [tutorId, payoutCurrency, creditedAmount],
    );

    // 8) record purchase audit
    const { rows: purchaseRows } = await client.query(
      `INSERT INTO classvault_purchases
         (class_id, student_id, tutor_id, amount, fee_tokens, gross_tokens, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING *`,
      [
        videoId,
        studentId,
        tutorId,
        Math.round(netUsd), // store as "net tokens" for audit (USD parity)
        Math.round(feeUsd), // fee in tokens/USD
        Math.round(grossUsd), // gross in tokens/USD
      ],
    );
    const purchase = purchaseRows[0];
    LOG('Recorded purchase', { purchaseId: purchase?.id });

    // 9) tutor transaction row (internal accrual from platform balance)
    const txDescription =
      `Class purchase "${title}" · gross ${grossUsd.toFixed(2)} USD (tokens ${grossTokens}), ` +
      `fee ${feeUsd.toFixed(2)} USD, accrued ${creditedAmount} ${payoutCurrency}` +
      (payoutCurrency === 'KES' ? ` @ ${fxRateUsed} FX` : '');

    LOG('Inserting tutor transaction', {
      userId: tutorId,
      amount: creditedAmount,
      currency: payoutCurrency,
      paymentMethod: 'PlatformBalance',
    });

    await client.query(
      `INSERT INTO transactions
         (user_id, type, amount, description, date, status, currency, payment_method, created_at, updated_at)
       VALUES ($1, 'Completed Earnings', $2, $3, NOW(), 'Completed', $4, $5, NOW(), NOW())`,
      [
        tutorId,
        creditedAmount,
        txDescription,
        payoutCurrency,
        'PlatformBalance',
      ],
    );

    // 10) student new balance
    const { rows: balRows } = await client.query(
      `SELECT tokens FROM users WHERE id = $1`,
      [studentId],
    );
    const tokens = Number(balRows[0]?.tokens ?? 0);

    await client.query('COMMIT');
    LOG('COMMIT complete');

    // 11) notifications (best-effort, post-commit)
    (async () => {
      try {
        const { rows: tutorRows } = await pool.query(
          `SELECT email, name FROM users WHERE id = $1`,
          [tutorId],
        );
        if (tutorRows.length) {
          const tutorEmail = tutorRows[0].email;
          const tutorName = tutorRows[0].name || 'Tutor';
          await sendNotification({
            to: tutorEmail,
            subject: `Earnings accrued for "${title}"`,
            body:
              `Hi ${tutorName},\n\n` +
              `Your class "${title}" was purchased.\n` +
              `Gross: ${grossUsd.toFixed(2)} USD (tokens ${grossTokens})\n` +
              `Fee: ${feeUsd.toFixed(2)} USD (15%)\n` +
              `Accrued: ${creditedAmount} ${payoutCurrency}` +
              (payoutCurrency === 'KES' ? ` @ FX ${fxRateUsed}` : '') +
              `\n\n— DayBreak`,
          });
          LOG('Tutor notification sent', { tutorId });
        } else {
          WARN('Tutor email not found', { tutorId });
        }
      } catch (e) {
        WARN('Tutor notification failed', { err: e?.message });
      }

      try {
        if (studentEmail) {
          await sendNotification({
            to: studentEmail,
            subject: `Purchase confirmed: "${title}"`,
            body:
              `Hi ${studentName},\n\n` +
              `Your purchase of "${title}" is confirmed.\n` +
              `Charged: ${grossUsd.toFixed(2)} USD (tokens ${grossTokens}).\n` +
              `Your updated balance is ${tokens} tokens.\n\n` +
              `Enjoy your class!\n— DayBreak`,
          });
          LOG('Student notification sent', { studentId });
        } else {
          WARN('Student email missing, skipped notification', { studentId });
        }
      } catch (e) {
        WARN('Student notification failed', { err: e?.message });
      }
    })().catch(() => {});

    // 12) response
    return res.status(201).json({
      message: 'Purchase successful! Earnings accrued.',
      purchase,
      resources: { video_url: videoUrl, pdf_url: pdfUrl },
      tokens,
      accrual: {
        currency: payoutCurrency,
        creditedAmount,
        grossUSD: grossUsd,
        netUSD: netUsd,
        fxRateUsed,
        feePercent: PLATFORM_FEE,
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    ERR('fatal error', { err: err?.message, stack: err?.stack });
    return res.status(500).json({ message: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// add this export near the bottom of the file
export const getPurchases = async (req, res) => {
  try {
    const studentId = req.user.id;

    const { limit, offset, q } = parsePagination(req, 12);
    const like = q ? `%${q.toLowerCase()}%` : '';
    const params = [studentId, limit, offset];
    let where = '';
    if (like) {
      params.push(like);
      const pLike = `$${params.length}`;
      where = `
        AND (
          LOWER(COALESCE(rv.title, '')) LIKE ${pLike}
          OR LOWER(COALESCE(rv.subject, '')) LIKE ${pLike}
          OR LOWER(COALESCE(rv.grade_level, '')) LIKE ${pLike}
        )
      `;
    }

    const query = `
      SELECT
        cp.id            AS purchase_id,
        cp.class_id,
        cp.tutor_id,
        cp.amount        AS net_tokens,
        cp.created_at    AS purchased_at,
        rv.title,
        rv.subject,
        rv.grade_level,
        rv.video_url,
        rv.pdf_url,
        rv.thumbnail_url,
        rv.preview_url,
        COUNT(*) OVER()::int AS total_rows
      FROM classvault_purchases cp
      JOIN recorded_videos rv
        ON cp.class_id = rv.id
      WHERE cp.student_id = $1
      ${where}
      ORDER BY cp.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(query, params);
    const total = rows[0]?.total_rows ?? 0;
    const purchases = rows.map(({ total_rows, ...rest }) => rest);
    return res.json({ purchases, total, limit, offset });
  } catch (err) {
    console.error('getPurchases error:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch purchases.' });
  }
};

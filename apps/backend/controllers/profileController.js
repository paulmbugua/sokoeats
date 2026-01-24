// controllers/profileController.js

import { v2 as cloudinary } from 'cloudinary';
import pool from '../config/db.js';
import path from 'path';
import {
  profileValidationSchema,
  profileUpdateValidationSchema,
} from '../validators/profileValidators.js';
import { normalizePayoutFromBody } from '../utils/payout.js';
import { aiParseTutorSearch } from '../services/aiTutorSearchService.js';
import { resolveCountryIso2FromText } from '../utils/countries.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upload local files to Cloudinary.
 * @param {Array} files – each with a `.path` and `.originalname`
 * @param {string} resourceType – 'image' or 'video'
 * @returns {Promise<Array<{ url: string; public_id: string }>>}
 */
async function uploadToCloudinary(files, resourceType = 'image') {
  return Promise.all(
    files.map(async (file) => {
      // 1) If Multer gave us a buffer (memoryStorage), use upload_stream:
      if (file.buffer) {
        return new Promise((resolve, reject) => {
          const opts = {
            resource_type: resourceType,
            folder: 'class_vault',
            public_id: `auto/${Date.now()}_${file.originalname.replace(/\..+$/, '')}`,
          };
          const stream = cloudinary.uploader.upload_stream(
            opts,
            (err, result) => {
              if (err) return reject(err);
              resolve({ url: result.secure_url, public_id: result.public_id });
            },
          );
          stream.end(file.buffer);
        });
      }

      // 2) Otherwise fall back to the on‐disk path:
      if (file.path) {
        const result = await cloudinary.uploader.upload(file.path, {
          resource_type: resourceType,
          folder: 'class_vault',
          public_id: `auto/${Date.now()}_${path.basename(file.path, path.extname(file.path))}`,
        });
        return { url: result.secure_url, public_id: result.public_id };
      }

      throw new Error('No file.buffer or file.path provided');
    }),
  );
}

/**
 * Delete one or more public_ids from Cloudinary.
 * @param {string[]} publicIds
 */
const deleteFromCloudinary = async (publicIds, resourceType = 'image') => {
  try {
    await cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType,
    });
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
};

/**
 * Given a Cloudinary URL, extract the public_id with path (no extension).
 * E.g. 'https://res.cloudinary.com/…/upload/v123/profiles/abc.jpg'
 * → 'profiles/abc'
 */
const getPublicIdFromUrl = (url) => {
  const [, afterUpload] = url.split('/upload/');
  return afterUpload.replace(/\.[^/.]+$/, '');
};
// Normalize country input to ISO2 (e.g. "ke" -> "KE", "Kenya" -> "KE")
function normIso2(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (s.length === 2) return s.toUpperCase();

  // If user typed a country name, reuse your resolver
  const iso = resolveCountryIso2FromText(s);
  return iso ? String(iso).toUpperCase() : '';
}

// ─── 1. Create Profile (multipart/form-data) ─────────────────────────────────
//

export const createProfile = async (req, res) => {
  try {
    const {
      role,
      name,
      age,
      paymentMethod,
      bankAccount,
      bankCode,
      mpesaPhoneNumber,
    } = req.body;

    const isTutor = String(role || '').toLowerCase() === 'tutor';
    const category = req.body.category?.trim() || null;
    let languages = [];
    try {
      languages = Array.isArray(req.body.languages)
        ? req.body.languages
        : JSON.parse(req.body.languages || '[]');
    } catch {
      languages = [];
    }

    // NEW: optional geography/school
    const rawCountry = (req.body.country || '').toString();
    const schoolGrade = req.body.schoolGrade || null;

    // files…
    const imageFiles = ['image1', 'image2', 'image3', 'image4']
      .map((k) => req.files?.[k]?.[0])
      .filter(Boolean);
    const videoFile = req.files?.video?.[0] || null;

    const galleryUploads =
      isTutor && imageFiles.length
        ? await uploadToCloudinary(imageFiles, 'image')
        : [];
    const gallery = galleryUploads.map((u) => u.url);

    const videoUrl =
      isTutor && videoFile
        ? (await uploadToCloudinary([videoFile], 'video'))[0].url
        : null;

    // 🔹 payout prefs
    const payout = normalizePayoutFromBody(
      { ...req.body, mpesaPhoneNumber },
      role,
    );
    if (payout.error) return res.status(400).json({ message: payout.error });

    // Build payload for Joi; student fields are optional now
    let description = undefined;
    let pricing = undefined;
    try {
      description = {
        bio: req.body['description.bio'],
        expertise: JSON.parse(req.body['description.expertise'] || '[]'),
        teachingStyle: JSON.parse(
          req.body['description.teachingStyle'] || '[]',
        ),
      };
    } catch {
      description = undefined;
    }
    try {
      pricing = JSON.parse(req.body.pricing || '{}');
    } catch {
      pricing = undefined;
    }

    let parsedAge;
    if (age !== undefined && age !== null && String(age).trim() !== '') {
      const n = Number(age);
      if (Number.isFinite(n)) {
        parsedAge = n;
      }
    }
    const basePayload = {
      role,
      name,
      languages, // optional for students
      country: rawCountry, // optional
      schoolGrade, // optional
    }; // optional
    const payload = {
      ...basePayload,
      ...(typeof parsedAge === 'number' ? { age: parsedAge } : {}),
      ...(isTutor && {
        category,
        gallery,
        video: videoUrl,
        description,
        pricing,
        paymentMethod,
        bankAccount,
        bankCode,
        // normalized payout fields
        payoutCurrency: payout.payout_currency,
        payoutMethod: payout.payout_method,
        mpesaPhoneNumber: payout.mpesa_phone_number,
        stripeConnectId: payout.stripe_connect_id,
        paypalEmail: payout.paypal_email,
      }),
    };

    const { error, value } = profileValidationSchema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    const insertSQL = `
  INSERT INTO profiles
    (user_id, role, name, age, languages,
     country, school_grade,
     category, description, pricing,
     gallery, video, payment_method,
     bank_account, bank_code, mpesa_phone_number,
     payout_currency, payout_method, stripe_connect_id, paypal_email
    )
  VALUES
    ($1,$2,$3,$4,$5,
     $6,$7,
     $8,$9,$10,
     $11,$12,$13,
     $14,$15,$16,
     $17,$18,$19,$20)
  RETURNING *;
`;

    const country = normIso2(value.country) || null;
    const params = [
      req.user.id, // 1
      value.role, // 2
      value.name, // 3
      typeof value.age === 'number' ? value.age : null, // 4 (student may be null)
      value.languages || [], // 5
      country, // 6
      value.schoolGrade ?? null, // 7
      isTutor ? (value.category ?? null) : null, // 8
      isTutor ? JSON.stringify(value.description || {}) : null, // 9
      isTutor ? JSON.stringify(value.pricing || {}) : null, // 10
      isTutor ? gallery || [] : null, // 11
      isTutor ? videoUrl || null : null, // 12
      isTutor ? (value.paymentMethod ?? null) : null, // 13
      isTutor ? (value.bankAccount ?? null) : null, // 14
      isTutor ? (value.bankCode ?? null) : null, // 15
      isTutor ? (payout.mpesa_phone_number ?? null) : null, // 16
      isTutor ? payout.payout_currency || 'USD' : null, // 17
      isTutor ? payout.payout_method || 'wise' : null, // 18
      isTutor ? (payout.stripe_connect_id ?? null) : null, // 19
      isTutor ? (payout.paypal_email ?? null) : null, // 20
    ];

    const { rows } = await pool.query(insertSQL, params);
    res.status(201).json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error('createProfile error:', err);
    res.status(500).json({ message: 'Failed to create profile.' });
  }
};

// ─── 2. Create Profile (JSON body with array fields only) ────────────────────
//
export const createProfileJson = async (req, res) => {
  try {
    // 1) Raw payload + light coercion (be defensive)
    const payload = req.body || {};

    // 🔓 Optional age: normalize to a number or drop it
    let ageNormalized;
    if (payload.age !== undefined && payload.age !== null && String(payload.age).trim() !== '') {
      const n = Number(payload.age);
      if (Number.isFinite(n)) ageNormalized = n;
    }

    let languagesIn = [];
    try {
      languagesIn = Array.isArray(payload.languages)
        ? payload.languages
        : JSON.parse(payload.languages || '[]');
      if (!Array.isArray(languagesIn)) languagesIn = [];
    } catch {
      languagesIn = [];
    }

    const galleryIn = Array.isArray(payload.gallery) ? payload.gallery : [];
    const videoIn = typeof payload.video === 'string' ? payload.video : null;

    // 2) Normalize payout (tutor only)
    const isTutor = String(payload.role || '').toLowerCase() === 'tutor';
    const payout = normalizePayoutFromBody(payload, payload.role);

    if (payout.error) {
      console.error('normalizePayoutFromBody → error:', payout.error, 'payload:', payload);
      return res.status(400).json({ message: payout.error });
    }

    // 3) Build object for Joi (omit forbidden keys).
    //    country & schoolGrade are optional; student fields can be absent.
    const payoutFields = isTutor
      ? {
          payoutCurrency: payout.payout_currency,
          payoutMethod: payout.payout_method,

          ...(payout.payout_currency === 'KES' && payout.mpesa_phone_number
            ? { mpesaPhoneNumber: payout.mpesa_phone_number }
            : {}),

          ...(payout.payout_currency === 'USD' &&
          payout.payout_method === 'wise' &&
          payout.wise_email
            ? { wiseEmail: payout.wise_email }
            : {}),
        }
      : {};

    const toValidate = {
      ...payload,
      ...(typeof ageNormalized === 'number' ? { age: ageNormalized } : {}),
      languages: languagesIn,
      ...(isTutor ? { gallery: galleryIn, video: videoIn, ...payoutFields } : {}),
    };

    // 4) Validate
    const { error, value } = profileValidationSchema.validate(toValidate, {
      abortEarly: false,
      stripUnknown: true,
    });

    console.log('createProfileJson → incoming payload:', JSON.stringify(payload, null, 2));
    console.log(
      'createProfileJson → normalized/validated candidate (toValidate):',
      JSON.stringify(toValidate, null, 2),
    );

    if (error) {
      console.error('createProfileJson → Joi error details:', error.details);
      return res.status(400).json({ message: error.details[0].message });
    }

    // 5) Use sanitized values (and normalize country code)
    const {
      role,
      name,
      age,
      languages,
      country: rawCountry,
      schoolGrade,
      category,
      description,
      pricing,
      paymentMethod,
      bankAccount,
      bankCode,
      payoutCurrency,
      payoutMethod,
      mpesaPhoneNumber,
      wiseEmail,
      gallery,
      video,
    } = value;

    const country = normIso2(rawCountry) || null;

    // Tutor-only JSON fields
    const jsonDescription = isTutor ? JSON.stringify(description || {}) : null;
    const jsonPricing = isTutor ? JSON.stringify(pricing || {}) : null;

    // Age may be missing for students → store NULL
    const ageParam =
      typeof age === 'number' && Number.isFinite(age)
        ? age
        : typeof age === 'string' && Number.isFinite(parseInt(age, 10))
          ? parseInt(age, 10)
          : null;

    // ✅ Keep these aligned with your business rules
    const finalPayoutCurrency = isTutor ? (payoutCurrency || payout.payout_currency || 'USD') : null;
    const finalPayoutMethod = isTutor ? (payoutMethod || payout.payout_method || 'wise') : null;

    const finalMpesa =
      isTutor && finalPayoutCurrency === 'KES'
        ? (mpesaPhoneNumber ?? payout.mpesa_phone_number ?? null)
        : null;

    const finalWise =
      isTutor && finalPayoutCurrency === 'USD'
        ? (wiseEmail ?? payout.wise_email ?? null)
        : null;

    // 6) SQL (✅ includes wise_email)
    const insertSQL = `
      INSERT INTO profiles
        (user_id, role, name, age, languages,
         country, school_grade,
         category, description, pricing,
         gallery, video, payment_method,
         bank_account, bank_code, mpesa_phone_number,
         payout_currency, payout_method, wise_email
        )
      VALUES
        ($1,$2,$3,$4,$5,
         $6,$7,
         $8,$9,$10,
         $11,$12,$13,
         $14,$15,$16,
         $17,$18,$19)
      RETURNING *;
    `;

    const params = [
      req.user.id, // $1
      role, // $2
      name, // $3
      ageParam, // $4
      Array.isArray(languages) ? languages : [], // $5
      country, // $6
      schoolGrade ?? null, // $7
      isTutor ? (category ?? null) : null, // $8
      isTutor ? jsonDescription : null, // $9
      isTutor ? jsonPricing : null, // $10
      isTutor ? (gallery ?? []) : null, // $11
      isTutor ? (video ?? null) : null, // $12
      isTutor ? (paymentMethod ?? null) : null, // $13
      isTutor ? (bankAccount ?? null) : null, // $14
      isTutor ? (bankCode ?? null) : null, // $15
      isTutor ? finalMpesa : null, // $16
      isTutor ? finalPayoutCurrency : null, // $17
      isTutor ? finalPayoutMethod : null, // $18
      isTutor ? finalWise : null, // $19 ✅ NEW
    ];

    // ✅ Sanity check (NOW 19)
    if (params.length !== 19) {
      console.error('createProfileJson → params length mismatch:', params.length);
      return res.status(500).json({ message: 'Server error: SQL params mismatch.' });
    }

    console.log('createProfileJson → final SQL params snapshot:', {
      user_id: params[0],
      role: params[1],
      name: params[2],
      age: params[3],
      languagesCount: Array.isArray(params[4]) ? params[4].length : 0,
      country: params[5],
      school_grade: params[6],
      category: params[7],
      galleryCount: isTutor ? (Array.isArray(params[10]) ? params[10].length : 0) : null,
      hasVideo: isTutor ? Boolean(params[11]) : null,
      payout_currency: params[16],
      payout_method: params[17],
      mpesa_phone_number: params[15],
      wise_email: params[18],
    });

    const { rows } = await pool.query(insertSQL, params);
    return res.status(201).json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error('createProfileJson error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};


export const updateProfileVideoJson = async (req, res) => {
  try {
    const { video } = req.body || {};
    if (!video || typeof video !== 'string') {
      return res.status(400).json({ message: 'Missing video url.' });
    }
    const { rows } = await pool.query(
      'UPDATE profiles SET video = $1 WHERE user_id = $2 RETURNING *',
      [video, req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ message: 'Profile not found.' });
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error('updateProfileVideoJson error:', err);
    res.status(500).json({ message: 'Failed to update video.' });
  }
};

export const updateProfile = async (req, res) => {
  console.log('Received data on backend:', req.body);
  try {
    const {
      name,
      age: ageStr,
      status,
      category,
      pricing,
      languages,
      experienceLevel,
      recommended,
      paymentMethod,
      bankAccount,
      bankCode,
      mpesaPhoneNumber,
      wiseEmail, // ✅ already added
      gallery: rawGallery,
      country,
      schoolGrade,
      payoutCurrency,
      payoutMethod,
      stripeConnectId,
      paypalEmail,
    } = req.body;

    const profileResult = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [
      req.user.id,
    ]);
    if (!profileResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    const profile = profileResult.rows[0];
    const normalizedRole = String(profile.role || '').toLowerCase();

    let age;
    if (typeof ageStr === 'number') {
      age = ageStr;
    } else if (typeof ageStr === 'string') {
      const trimmed = ageStr.trim();
      if (trimmed !== '') {
        const n = Number(trimmed);
        if (Number.isFinite(n)) age = n;
      }
    }

    const parsedLanguages = Array.isArray(languages) ? languages : [];

    // ---- gallery normalize
    let parsedGallery = [];
    if (rawGallery != null) {
      if (Array.isArray(rawGallery)) parsedGallery = rawGallery;
      else if (typeof rawGallery === 'string') {
        try {
          const arr = JSON.parse(rawGallery);
          parsedGallery = Array.isArray(arr) ? arr : [rawGallery];
        } catch {
          parsedGallery = [rawGallery];
        }
      }
    }

    // ---- description normalize (parse legacy string once)
    let existingDesc = {};
    try {
      existingDesc =
        typeof profile.description === 'string'
          ? JSON.parse(profile.description || '{}')
          : profile.description || {};
    } catch {
      existingDesc = {};
    }

    let description = null;
    if (normalizedRole === 'tutor') {
      const desc = req.body.description || {};
      description = {
        bio: desc.bio ?? existingDesc.bio ?? '',
        expertise: Array.isArray(desc.expertise) ? desc.expertise : existingDesc.expertise || [],
        teachingStyle: Array.isArray(desc.teachingStyle)
          ? desc.teachingStyle
          : existingDesc.teachingStyle || [],
      };
    }

    // ---- payout normalize
    const payout = normalizePayoutFromBody(
      {
        payoutCurrency,
        payoutMethod,
        stripeConnectId,
        stripe_connect_id: stripeConnectId,
        paypalEmail,
        paypal_email: paypalEmail,
        mpesaPhoneNumber: mpesaPhoneNumber ?? profile.mpesa_phone_number,
        wiseEmail: wiseEmail ?? req.body.wise_email ?? profile.wise_email,
        wise_email: wiseEmail ?? req.body.wise_email ?? profile.wise_email,
      },
      normalizedRole,
    );

    if (payout.error) {
      return res.status(400).json({ success: false, message: payout.error });
    }

    // ---- country normalize (server is source of truth)
    const countryFromLegacy =
      country ??
      profile.country ??
      profile.country_code ??
      (existingDesc && existingDesc.country) ??
      null;

    const normalizedCountry = normIso2(countryFromLegacy) || null;

    // ---- validation payload (always include country/schoolGrade)
    const validationData = {
      role: normalizedRole,
      name,
      ...(typeof age === 'number' ? { age } : {}),
      languages: parsedLanguages,
      country: normalizedCountry,
      schoolGrade,
      ...(normalizedRole === 'tutor' && {
        category,
        pricing,
        recommended,
        experienceLevel,
        description,
        status,
        gallery: parsedGallery,
        video: typeof req.body.video === 'string' ? req.body.video : undefined,
        paymentMethod,
        bankAccount,
        bankCode,
        payoutCurrency: payout.payout_currency,
        payoutMethod: payout.payout_method,

        ...(payout.payout_currency === 'KES'
          ? { mpesaPhoneNumber: payout.mpesa_phone_number }
          : {}),

        ...(payout.payout_currency === 'USD' &&
        payout.payout_method === 'stripe' &&
        payout.stripe_connect_id
          ? { stripeConnectId: payout.stripe_connect_id }
          : {}),

        ...(payout.payout_currency === 'USD' &&
        payout.payout_method === 'paypal' &&
        payout.paypal_email
          ? { paypalEmail: payout.paypal_email }
          : {}),

        // ✅ ADD THIS
        ...(payout.payout_currency === 'USD' &&
        payout.payout_method === 'wise' &&
        payout.wise_email
          ? { wiseEmail: payout.wise_email }
          : {}),
      }),
    };

    console.log('updateProfile → validationData:', JSON.stringify(validationData, null, 2));

    const { error, value } = profileUpdateValidationSchema.validate(validationData, {
      stripUnknown: true,
      abortEarly: false,
    });

    if (error) {
      console.error('Validation Error:', error.details);
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    // ---- updatedData to persist
    const updatedData = {
      name: value.name ?? profile.name,
      age: value.age ?? profile.age,
      languages: value.languages ?? profile.languages,

      country: normIso2(value.country) || null, // final guard
      school_grade: value.schoolGrade ?? profile.school_grade,

      category: normalizedRole === 'tutor' ? value.category ?? profile.category : profile.category,
      description: normalizedRole === 'tutor' ? JSON.stringify(value.description) : profile.description,
      pricing: normalizedRole === 'tutor' ? JSON.stringify(value.pricing) : profile.pricing,
      experience_level:
        normalizedRole === 'tutor' ? value.experienceLevel : profile.experience_level,
      status: normalizedRole === 'tutor' ? value.status : profile.status,
      recommended: normalizedRole === 'tutor' ? value.recommended : profile.recommended,
      payment_method: normalizedRole === 'tutor' ? value.paymentMethod : profile.payment_method,

      bank_account:
        normalizedRole === 'tutor' && value.paymentMethod === 'bank'
          ? value.bankAccount
          : profile.bank_account,

      bank_code:
        normalizedRole === 'tutor' && value.paymentMethod === 'bank'
          ? value.bankCode
          : profile.bank_code,

      mpesa_phone_number:
        normalizedRole === 'tutor' && value.paymentMethod === 'mpesa'
          ? value.mpesaPhoneNumber || payout.mpesa_phone_number
          : payout.mpesa_phone_number || profile.mpesa_phone_number,

      gallery: parsedGallery.length ? parsedGallery : profile.gallery,

      video:
        normalizedRole === 'tutor' && typeof value.video === 'string'
          ? value.video
          : profile.video,

      payout_currency:
        normalizedRole === 'tutor'
          ? payout.payout_currency || profile.payout_currency || 'USD'
          : profile.payout_currency,

      payout_method:
        normalizedRole === 'tutor'
          ? payout.payout_method || profile.payout_method || 'stripe'
          : profile.payout_method,

      stripe_connect_id:
        normalizedRole === 'tutor'
          ? payout.stripe_connect_id || profile.stripe_connect_id || null
          : profile.stripe_connect_id,

      paypal_email:
        normalizedRole === 'tutor'
          ? payout.paypal_email || profile.paypal_email || null
          : profile.paypal_email,

      // ✅ ADD THIS (persist wise email)
      wise_email:
        normalizedRole === 'tutor'
          ? payout.wise_email || profile.wise_email || null
          : profile.wise_email,
    };

    // ---- uploads (unchanged)
    const images = ['image1', 'image2', 'image3', 'image4']
      .map((k) => req.files?.[k]?.[0])
      .filter(Boolean);

    if (images.length) {
      const uploaded = await uploadToCloudinary(images, 'image');
      updatedData.gallery = uploaded.map((u) => u.url);
    }

    if (normalizedRole === 'tutor' && req.files?.video?.[0]) {
      const [videoUploaded] = await uploadToCloudinary([req.files.video[0]], 'video');
      updatedData.video = videoUploaded.url || updatedData.video;
    }

    const updateQuery = `
      UPDATE profiles SET
        name = $1,
        age = $2,
        languages = $3,
        country = $4,
        school_grade = $5,
        category = $6,
        description = $7,
        pricing = $8,
        experience_level = $9,
        status = $10,
        recommended = $11,
        payment_method = $12,
        bank_account = $13,
        bank_code = $14,
        mpesa_phone_number = $15,
        gallery = $16,
        video = $17,
        payout_currency = $18,
        payout_method   = $19,
        stripe_connect_id = $20,
        paypal_email      = $21,
        wise_email        = $22
      WHERE user_id = $23
      RETURNING *;
    `;

    const params = [
      updatedData.name,               // $1
      updatedData.age,                // $2
      updatedData.languages,          // $3
      updatedData.country,            // $4
      updatedData.school_grade,       // $5
      updatedData.category,           // $6
      updatedData.description,        // $7
      updatedData.pricing,            // $8
      updatedData.experience_level,   // $9
      updatedData.status,             // $10
      updatedData.recommended,        // $11
      updatedData.payment_method,     // $12
      updatedData.bank_account,       // $13
      updatedData.bank_code,          // $14
      updatedData.mpesa_phone_number, // $15
      updatedData.gallery,            // $16
      updatedData.video,              // $17
      updatedData.payout_currency,    // $18
      updatedData.payout_method,      // $19
      updatedData.stripe_connect_id,  // $20
      updatedData.paypal_email,       // $21
      updatedData.wise_email,         // $22 ✅ NEW
      req.user.id,                    // $23 ✅ shifted
    ];

    const result = await pool.query(updateQuery, params);
    return res.status(200).json({ success: true, profile: result.rows[0] });
  } catch (err) {
    console.error('Error in updateProfile:', err);
    return res.status(500).json({ message: 'Failed to update profile.', error: err.message });
  }
};

// ─── 4. Get User Profile ────────────────────────────────────────────────────
export const getUserProfile = async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { rows } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);

    if (!rows.length) {
      return res.json({ success: true, profileExists: false, profile: { gallery: [] } });
    }

    const prof = rows[0];
    prof.gallery = Array.isArray(prof.gallery) ? prof.gallery : [];
    return res.json({ success: true, profileExists: true, profile: prof });
  } catch (err) {
    console.error('getUserProfile error:', err);
    return res.status(500).json({ message: 'Failed to fetch profile.' });
  }
};


// ─── 5. Toggle Notifications ────────────────────────────────────────────────
export const toggleNotifications = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE profiles SET notifications = NOT notifications WHERE user_id = $1 RETURNING *',
      [req.user.id],
    );
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error('toggleNotifications error:', err);
    res.status(500).json({ message: 'Failed to toggle notifications.' });
  }
};

// ─── 6. Add Recent Chat ─────────────────────────────────────────────────────
export const addRecentChat = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE profiles SET recent_chats_count = recent_chats_count + 1 WHERE id = $1 RETURNING *',
      [req.params.id],
    );
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error('addRecentChat error:', err);
    res.status(500).json({ message: 'Failed to update recent chats.' });
  }
};

// ─── 7. Update Rating ────────────────────────────────────────────────────────
export const updateRating = async (req, res) => {
  try {
    const rating = parseFloat(req.body.rating);
    if (isNaN(rating))
      return res.status(400).json({ message: 'Invalid rating.' });
    const { rows } = await pool.query(
      `UPDATE profiles
         SET rating_total = rating_total + $1,
             rating_count = rating_count + 1
       WHERE id = $2
       RETURNING *`,
      [rating, req.params.id],
    );
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error('updateRating error:', err);
    res.status(500).json({ message: 'Failed to update rating.' });
  }
};

// ─── 8. Get Profiles with Filters ───────────────────────────────────────────
// ─── 8. Get Profiles with Filters (public mode supported) ───────────────────
export const getProfile = async (req, res) => {
  try {
    const {
      status,
      experienceLevel,
      expertise,
      teachingStyle,
      languageFluency,
      pricing,
      category,
      attribute,
      userIds,
      public: publicFlag, // ← NEW
      limit: limitStr, // ← NEW
    } = req.query;

    const isPublic = String(publicFlag || '0') === '1';
    const limit = Math.min(100, Math.max(1, Number(limitStr) || 20));

    const conditions = [`role = 'tutor'`];
    const values = [];
    let idx = 1;

    // In public mode, you may want to hide soft-hidden tutors:
    if (isPublic) {
      conditions.push(`COALESCE(status, 'online') <> 'hidden'`);
    }

    if (userIds) {
      const ids = String(userIds)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      if (ids.length) {
        conditions.push(`user_id = ANY($${idx++}::int[])`);
        values.push(ids);
      }
    }

    if (experienceLevel) {
      conditions.push(`experience_level = $${idx++}`);
      values.push(experienceLevel);
    }
    if (teachingStyle) {
      conditions.push(`(description->'teachingStyle') ?| $${idx++}`);
      values.push(teachingStyle.split(',').map((s) => s.trim()));
    }
    if (expertise) {
      conditions.push(`(description->'expertise') ?| $${idx++}`);
      values.push(expertise.split(',').map((s) => s.trim()));
    }
    if (languageFluency) {
      conditions.push(`language_fluency = $${idx++}`);
      values.push(languageFluency);
    }
    if (pricing) {
      const [min, max] = pricing.split('-').map(Number);
      conditions.push(`(
        ((pricing->>'privateSession')::numeric BETWEEN $${idx} AND $${idx + 1})
        OR ((pricing->>'groupSession')::numeric BETWEEN $${idx} AND $${idx + 1})
        OR ((pricing->>'lecture')::numeric BETWEEN $${idx} AND $${idx + 1})
        OR ((pricing->>'workshop')::numeric BETWEEN $${idx} AND $${idx + 1})
      )`);
      values.push(min, max);
      idx += 2;
    }
    if (category) {
      conditions.push(`category = $${idx++}`);
      values.push(category);
    }
    if (attribute) {
      conditions.push(`attributes = $${idx++}`);
      values.push(attribute);
    }
    if (status && !isPublic) {
      // allow private status filter only when authed
      conditions.push(`status = $${idx++}`);
      values.push(status);
    }

    // Public mode can return the same columns (they’re non-sensitive)
    const sql = `
      SELECT id, user_id, role, name, age, languages,
             gallery, video, status, category,
             pricing, description, experience_level, age_group, certified
      FROM profiles
      WHERE ${conditions.join(' AND ')}
      ORDER BY id DESC
      LIMIT $${idx};
    `;
    values.push(limit);

    const { rows } = await pool.query(sql, values);
    return res.json({ success: true, profiles: rows });
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ message: 'Failed to fetch profiles.' });
  }
};

// ─── 9. Get Profile by ID ───────────────────────────────────────────────────
export const getProfileById = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid id.' });

  try {
    const sql = `
      SELECT id,
             user_id AS "user",
             name, pricing, category,
             gallery, video, role,
             status, description,
             recommended, certified, languages
      FROM profiles
      WHERE id = $1;
    `;
    const { rows } = await pool.query(sql, [id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getProfileById error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ───10. Remove Profile Item ────────────────────────────────────────────────
export const removeProfileItem = async (req, res) => {
  const { id, field } = req.params;
  const item = req.body.item;

  try {
    const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [
      id,
    ]);
    if (!rows.length) return res.status(404).json({ message: 'Not found.' });
    let profile = rows[0];

    if (field === 'gallery') {
      const pid = getPublicIdFromUrl(item);
      await deleteFromCloudinary([pid]);
      const updated = profile.gallery.filter((u) => u !== item);
      const upd = await pool.query(
        'UPDATE profiles SET gallery = $1 WHERE id = $2 RETURNING *',
        [JSON.stringify(updated), id],
      );
      profile = upd.rows[0];
    } else if (field === 'video') {
      if (profile.video) {
        const pid = getPublicIdFromUrl(profile.video);
        await deleteFromCloudinary([pid], 'video');
      }
      const upd = await pool.query(
        'UPDATE profiles SET video = $1 WHERE id = $2 RETURNING *',
        ['', id],
      );
      profile = upd.rows[0];
    } else {
      // assume array field
      const arr = profile[field] || [];
      if (!Array.isArray(arr)) {
        return res.status(400).json({ message: 'Field not array.' });
      }
      const updatedArr = arr.filter((v) => v !== item);
      const upd = await pool.query(
        `UPDATE profiles SET ${field} = $1 WHERE id = $2 RETURNING *`,
        [JSON.stringify(updatedArr), id],
      );
      profile = upd.rows[0];
    }

    res.json({ success: true, profile });
  } catch (err) {
    console.error('removeProfileItem error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ───11. Upload Single File ─────────────────────────────────────────────────
export const uploadSingleFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file.' });
    const paramType = (req.params?.type || '').toLowerCase(); // 'image' | 'video'
    const mime = req.file.mimetype || '';
    const inferred = mime.startsWith('video/') ? 'video' : 'image';
    const resourceType =
      paramType === 'video' || paramType === 'image' ? paramType : inferred;

    // Optional: add a quick log while testing
    console.log(
      'uploadSingleFile → type from param:',
      paramType,
      'mime:',
      mime,
      '→ resourceType:',
      resourceType,
    );

    const [upload] = await uploadToCloudinary([req.file], resourceType);
    res.json({ url: upload.url });
  } catch (err) {
    console.error('uploadSingleFile error:', err);
    res.status(500).json({ message: 'Upload failed.' });
  }
};

// ───12. Profile with Recommendations ────────────────────────────────────────
export const getProfileWithRecommendations = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [
      id,
    ]);
    if (!rows.length) return res.status(404).json({ message: 'Not found.' });
    const profile = rows[0];
    if (Array.isArray(profile.recommended) && profile.recommended.length) {
      const rec = await pool.query(
        'SELECT id,name,status,gallery FROM profiles WHERE id = ANY($1)',
        [profile.recommended],
      );
      profile.recommended = rec.rows;
    } else {
      profile.recommended = [];
    }
    res.json(profile);
  } catch (err) {
    console.error('getProfileWithRecommendations error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ───13. Get Profile by User ID ─────────────────────────────────────────────
export const getProfileByUserId = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ message: 'Invalid userId.' });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM profiles WHERE user_id=$1 AND role='tutor'`,
      [userId],
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getProfileByUserId error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ───14. Get Random Profile ─────────────────────────────────────────────────
export const getRandomProfile = async (req, res) => {
  try {
    const {
      rows: [{ count }],
    } = await pool.query(`SELECT COUNT(*) FROM profiles WHERE role='tutor'`);
    const total = parseInt(count, 10);
    if (!total) return res.status(404).json({ message: 'No tutors.' });
    const offset = Math.floor(Math.random() * total);
    const { rows } = await pool.query(
      `SELECT id,name,role,gallery,category,description,certified
       FROM profiles
       WHERE role='tutor'
       LIMIT 1 OFFSET $1`,
      [offset],
    );
    const prof = rows[0];
    let desc = {};
    try {
      desc = JSON.parse(prof.description || '{}');
    } catch {}
    res.json({
      id: prof.id,
      name: prof.name,
      role: prof.role,
      gallery: prof.gallery,
      category: prof.category,
      expertise: desc.expertise || [],
      teachingStyle: desc.teachingStyle || [],
    });
  } catch (err) {
    console.error('getRandomProfile error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

export const searchTutors = async (req, res) => {
  const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();

  const dev = process.env.NODE_ENV !== 'production';
  const log = (...args) => dev && console.log(...args);

  try {
    const {
      q = '',
      country,
      subject,
      gradeBand,
      status,
      experienceLevel,
      minRating,
      maxTokens,
      maxPrice,
      certified,
      limit: limitStr,
      offset: offsetStr,
    } = req.query;

    const limit = Math.min(50, Math.max(1, Number(limitStr) || 12));
    const offset = Math.max(0, Number(offsetStr) || 0);

    const rawQ = String(q || '').trim();

    // Use AI only for longer multi-word queries (as you had)
    const shouldUseAi =
      rawQ.length >= 6 && /[a-zA-Z]/.test(rawQ) && /\s/.test(rawQ);

    log(`\n[searchTutors:${rid}] incoming`, {
      rawQ,
      shouldUseAi,
      ui: {
        country,
        subject,
        gradeBand,
        status,
        experienceLevel,
        minRating,
        maxTokens,
        maxPrice,
        certified,
        limit,
        offset,
      },
    });

    // ---- AI parse (optional)
    let ai = null;
    let aiMs = 0;

    if (shouldUseAi) {
      const tAi = Date.now();
      ai = await aiParseTutorSearch(rawQ);
      aiMs = Date.now() - tAi;
      log(`[searchTutors:${rid}] ai parsed (${aiMs}ms)`, ai);
    }

    // If AI used: use ai.keywords; else use rawQ as keywords
    const aiKeywords = (ai?.keywords || '').toString().trim();
    const effectiveKeywords = shouldUseAi && ai ? aiKeywords : rawQ;

    // merge (explicit query params win over AI)
    const merged = {
      keywords: effectiveKeywords,
      country: (country || ai?.country || '').toString().trim().toUpperCase(),
      subject: (subject || ai?.subject || '').toString().trim(),
      gradeBand: (gradeBand || ai?.gradeBand || '').toString().trim(),
      status: (status || ai?.status || '').toString().trim().toLowerCase(),
      experienceLevel: (experienceLevel || ai?.experienceLevel || '')
        .toString()
        .trim(),
      minRating: Number(minRating ?? ai?.minRating ?? 0) || 0,
      maxTokens:
        Number(maxTokens ?? maxPrice ?? ai?.maxTokens ?? ai?.maxPrice ?? 0) ||
        0,
      maxPrice: Number(maxPrice ?? ai?.maxPrice ?? 0) || 0,
      certified: String(certified ?? '').length
        ? String(certified) === 'true' || String(certified) === '1'
        : Boolean(ai?.certified),
    };

    // guards
    if (!['', 'online', 'offline'].includes(merged.status)) merged.status = '';
    if (merged.minRating < 0) merged.minRating = 0;
    if (merged.maxPrice < 0) merged.maxPrice = 0;

    // ✅ country-name typed in search box (Kenya) → ISO2 country filter
    if (!merged.country) {
      const iso = resolveCountryIso2FromText(rawQ);
      if (iso) {
        merged.country = iso;

        // If user basically typed only a country, don’t also use it as kw
        if (!shouldUseAi && rawQ.split(/\s+/).length === 1) {
          merged.keywords = '';
        }
      }
    }

    log(`[searchTutors:${rid}] merged`, merged);

    // ────────────────────────────────────────────────────────────────
    // KW decision (prevents "grade 3" from killing results)
    // ────────────────────────────────────────────────────────────────
    let kw = String(merged.keywords || '').trim();

    const aiUsed = Boolean(ai);
    const hasStructured =
      Boolean(merged.country) ||
      Boolean(merged.subject) ||
      Boolean(merged.gradeBand) ||
      Boolean(merged.status) ||
      Boolean(merged.experienceLevel) ||
      merged.minRating > 0 ||
      merged.maxTokens > 0 ||
      Boolean(merged.certified);

    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    if (aiUsed && hasStructured && merged.gradeBand) {
      const raw = norm(rawQ);
      const k = norm(kw);
      const gb = norm(merged.gradeBand);
      if (k === raw || k === gb) kw = '';
    }

    log(`[searchTutors:${rid}] kw decision`, {
      rawQ,
      aiUsed,
      gradeBand: merged.gradeBand,
      mergedKeywords: merged.keywords,
      kwUsed: kw,
    });

    // ────────────────────────────────────────────────────────────────
    // Build SQL
    // ────────────────────────────────────────────────────────────────
    const conditions = [
      `role = 'tutor'`,
      `COALESCE(status,'offline') <> 'hidden'`,
    ];
    const values = [];
    let idx = 1;

    if (merged.country) {
      conditions.push(`country = $${idx++}`);
      values.push(merged.country);
    }

    if (merged.subject) {
      conditions.push(`LOWER(COALESCE(category,'')) LIKE $${idx++}`);
      values.push(`%${merged.subject.toLowerCase()}%`);
    }

    if (merged.status) {
      conditions.push(`LOWER(COALESCE(status,'')) = $${idx++}`);
      values.push(merged.status);
    }

    if (merged.experienceLevel) {
      conditions.push(`experience_level = $${idx++}`);
      values.push(merged.experienceLevel);
    }

    if (merged.certified) {
      conditions.push(`certified = true`);
    }

    // grade band: free-form text[] (grade_bands) + fallback school_grade text
    if (merged.gradeBand) {
      conditions.push(`(
        EXISTS (
          SELECT 1
          FROM unnest(COALESCE(grade_bands, ARRAY[]::text[])) gb
          WHERE LOWER(gb) = LOWER($${idx})
             OR LOWER(gb) LIKE LOWER($${idx + 1})
        )
        OR LOWER(COALESCE(school_grade,'')) LIKE LOWER($${idx + 1})
      )`);

      values.push(merged.gradeBand);
      values.push(`%${merged.gradeBand}%`);
      idx += 2;
    }

    // ✅ tokens: maxTokens across pricing JSON keys (safe parse; no cast crashes)
    if (merged.maxTokens > 0) {
      const num = (k) =>
        `CASE WHEN (pricing->>'${k}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (pricing->>'${k}')::numeric END`;

      conditions.push(`(
    COALESCE(
      NULLIF(${num('tokens')}, 0),
      NULLIF(${num('tokenPrice')}, 0),
      NULLIF(${num('tokensPerHour')}, 0),
      NULLIF(${num('hourlyTokens')}, 0),
      NULLIF(${num('privateSessionTokens')}, 0),
      NULLIF(${num('groupSessionTokens')}, 0),
      NULLIF(${num('lectureTokens')}, 0),
      NULLIF(${num('workshopTokens')}, 0),
      0
    ) <= $${idx++}
  )`);
      values.push(merged.maxTokens);
    }

    // rating
    if (merged.minRating > 0) {
      conditions.push(`(
        CASE WHEN COALESCE(rating_count,0) > 0
          THEN (rating_total::numeric / rating_count::numeric)
          ELSE 0
        END
      ) >= $${idx++}`);
      values.push(merged.minRating);
    }

    // keyword text-ish search
    if (kw) {
      conditions.push(`(
        LOWER(COALESCE(name,'')) LIKE $${idx}
        OR LOWER(COALESCE(category,'')) LIKE $${idx}
        OR LOWER(COALESCE(description->>'bio','')) LIKE $${idx}
      )`);
      values.push(`%${kw.toLowerCase()}%`);
      idx += 1;
    }

    const sql = `
      SELECT
        id, user_id, role, name, age, languages, gallery, video,
        status, category, pricing, description, experience_level,
        certified, country, school_grade, grade_bands,
        CASE WHEN COALESCE(rating_count,0) > 0
          THEN (rating_total::numeric / rating_count::numeric)
          ELSE NULL
        END AS "avgRating"
      FROM profiles
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        "avgRating" DESC NULLS LAST,
        id DESC
      LIMIT $${idx++}
      OFFSET $${idx++};
    `;

    values.push(limit, offset);

    log(`[searchTutors:${rid}] sql`, {
      whereCount: conditions.length,
      paramsCount: values.length,
      limit,
      offset,
      kw,
      sqlPreview: sql.replace(/\s+/g, ' ').trim().slice(0, 260) + '...',
      valuesPreview: values.map((v) =>
        typeof v === 'string' ? (v.length > 80 ? v.slice(0, 80) + '…' : v) : v,
      ),
    });

    const tDb = Date.now();
    const { rows } = await pool.query(sql, values);
    const dbMs = Date.now() - tDb;

    log(`[searchTutors:${rid}] done`, {
      aiUsed,
      aiMs,
      dbMs,
      rows: rows.length,
      totalMs: Date.now() - t0,
    });

    return res.json({
      success: true,
      parsed: ai ? merged : null,
      profiles: rows,
      limit,
      offset,
      meta: dev ? { rid, aiMs, dbMs, aiUsed } : undefined,
    });
  } catch (err) {
    console.error(`[searchTutors:${rid}] error`, {
      message: err?.message,
      code: err?.code,
      hint: err?.hint,
      position: err?.position,
      stack: err?.stack,
      tookMs: Date.now() - t0,
    });
    return res.status(500).json({ message: 'Failed to search tutors.', rid });
  }
};

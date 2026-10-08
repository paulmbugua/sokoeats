import Joi from 'joi';
import pool from '../config/db.js';
import { createPrivateDocumentUpload, createPrivateDocumentViewUrl } from '../services/r2Images.js';
import { pushNotification } from '../services/pushNotificationService.js';

export const declineReasons = [
  { code: 'identity_unreadable', label: 'ID copy is unclear or unreadable' },
  { code: 'id_mismatch', label: 'Names or ID details do not match' },
  { code: 'good_conduct_missing', label: 'Certificate of Good Conduct is missing or incomplete' },
  { code: 'good_conduct_expired', label: 'Certificate of Good Conduct needs renewal' },
  { code: 'passport_photo_invalid', label: 'Passport-size photo does not meet requirements' },
  { code: 'motorbike_photo_missing', label: 'Motorbike photo is missing or unclear' },
  { code: 'vehicle_details_mismatch', label: 'Motorbike details do not match the application' },
  { code: 'service_area_unavailable', label: 'Delivery onboarding is not open in this service area' },
  { code: 'other', label: 'Other - see reviewer note' },
];

const submitSchema = Joi.object({
  deliveryMode: Joi.string().valid('motorbike', 'foot').required(),
  passportPhotoUrl: Joi.string().max(500).required(),
  nationalIdCopyUrl: Joi.string().max(500).required(),
  goodConductUrl: Joi.string().max(500).required(),
  motorbikePhotoUrl: Joi.when('deliveryMode', { is: 'motorbike', then: Joi.string().max(500).required(), otherwise: Joi.string().max(500).allow('', null) }),
  vehicleType: Joi.when('deliveryMode', { is: 'motorbike', then: Joi.string().trim().min(2).max(80).required(), otherwise: Joi.string().allow('', null) }),
  registrationNumber: Joi.when('deliveryMode', { is: 'motorbike', then: Joi.string().trim().min(3).max(40).required(), otherwise: Joi.string().allow('', null) }),
});

const uploadSchema = Joi.object({
  documentType: Joi.string().valid('passport_photo', 'national_id_copy', 'good_conduct', 'motorbike_photo').required(),
  filename: Joi.string().min(3).max(180).required(),
  contentType: Joi.string().valid('image/jpeg', 'image/png', 'image/webp', 'image/avif').required(),
});

const reviewSchema = Joi.object({
  decision: Joi.string().valid('approved', 'declined', 'under_review').required(),
  reasonCode: Joi.when('decision', { is: 'declined', then: Joi.string().valid(...declineReasons.map(item => item.code)).required(), otherwise: Joi.string().allow('', null) }),
  note: Joi.string().trim().max(500).allow('', null),
});

function assertOwnedDocumentRefs(userId, value) {
  const expected = {
    passportPhotoUrl: 'passport_photo', nationalIdCopyUrl: 'national_id_copy', goodConductUrl: 'good_conduct', motorbikePhotoUrl: 'motorbike_photo',
  };
  for (const [field, type] of Object.entries(expected)) {
    const key = value[field];
    if (!key) continue;
    if (!String(key).startsWith(`delivery-partners/${userId}/${type}/`)) throw Object.assign(new Error(`The ${type.replaceAll('_', ' ')} upload does not belong to this account`), { status: 403 });
  }
}

async function publicApplication(row, includeDocumentRefs = false) {
  if (!row) return null;
  const [passportPhotoUrl, nationalIdCopyUrl, goodConductUrl, motorbikePhotoUrl] = await Promise.all([
    createPrivateDocumentViewUrl(row.passport_photo_key), createPrivateDocumentViewUrl(row.national_id_copy_key), createPrivateDocumentViewUrl(row.good_conduct_key), row.motorbike_photo_key ? createPrivateDocumentViewUrl(row.motorbike_photo_key) : null,
  ]);
  return {
    id: row.id, userId: row.user_id, name: row.name, email: row.email, phone: row.phone, city: row.city,
    applicationReference: row.application_reference, deliveryMode: row.delivery_mode, status: row.status,
    passportPhotoUrl, nationalIdCopyUrl, goodConductUrl, motorbikePhotoUrl,
    ...(includeDocumentRefs ? { documentRefs: { passportPhotoUrl: row.passport_photo_key, nationalIdCopyUrl: row.national_id_copy_key, goodConductUrl: row.good_conduct_key, motorbikePhotoUrl: row.motorbike_photo_key || '' } } : {}),
    vehicleType: row.vehicle_type, registrationNumber: row.registration_number,
    declineReasonCode: row.decline_reason_code, reviewNote: row.review_note,
    submittedAt: row.submitted_at, reviewedAt: row.reviewed_at, updatedAt: row.updated_at,
  };
}

async function targetedNotification(client, { userId, title, body, priority = 'normal' }) {
  const { rows } = await client.query(
    `INSERT INTO sokoeats_admin_notifications(title,body,audience,channel,priority,action_label,action_url,target_user_id)
     VALUES($1,$2,'riders','both',$3,'View application','sokoeats://rider/application',$4) RETURNING *`,
    [title, body, priority, userId],
  );
  return rows[0];
}

export async function createDeliveryPartnerUpload(req, res, next) {
  try {
    const { value, error } = uploadSchema.validate(req.body);
    if (error) throw Object.assign(new Error(error.details[0].message), { status: 422 });
    const upload = await createPrivateDocumentUpload({ ownerUserId: req.authUser.id, filename: value.filename, contentType: value.contentType, documentType: value.documentType });
    await pool.query('INSERT INTO sokoeats_media_assets (owner_user_id, object_key, public_url, content_type) VALUES ($1,$2,$3,$4)', [req.authUser.id, upload.key, `private:${upload.key}`, value.contentType]);
    res.status(201).json({ upload });
  } catch (error) { next(error); }
}

export async function getDeliveryPartnerApplication(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT a.*,u.name,u.email,u.phone,u.city,u.application_reference FROM sokoeats_delivery_partner_applications a JOIN sokoeats_users u ON u.id=a.user_id WHERE a.user_id=$1`, [req.authUser.id]);
    res.set('Cache-Control', 'no-store').json({ application: await publicApplication(rows[0], true), declineReasons });
  } catch (error) { next(error); }
}

export async function submitDeliveryPartnerApplication(req, res, next) {
  const client = await pool.connect();
  try {
    const { value, error } = submitSchema.validate(req.body, { abortEarly: false });
    if (error) throw Object.assign(new Error(error.details.map(item => item.message).join('. ')), { status: 422 });
    assertOwnedDocumentRefs(req.authUser.id, value);
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO sokoeats_delivery_partner_applications(user_id,delivery_mode,status,passport_photo_key,national_id_copy_key,good_conduct_key,motorbike_photo_key,vehicle_type,registration_number,submitted_at)
       VALUES($1,$2,'submitted',$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT(user_id) DO UPDATE SET delivery_mode=EXCLUDED.delivery_mode,status='submitted',passport_photo_key=EXCLUDED.passport_photo_key,national_id_copy_key=EXCLUDED.national_id_copy_key,good_conduct_key=EXCLUDED.good_conduct_key,motorbike_photo_key=EXCLUDED.motorbike_photo_key,vehicle_type=EXCLUDED.vehicle_type,registration_number=EXCLUDED.registration_number,decline_reason_code=NULL,review_note=NULL,reviewed_by=NULL,reviewed_at=NULL,submitted_at=NOW(),updated_at=NOW()
       RETURNING *`,
      [req.authUser.id, value.deliveryMode, value.passportPhotoUrl, value.nationalIdCopyUrl, value.goodConductUrl, value.motorbikePhotoUrl || null, value.deliveryMode === 'motorbike' ? value.vehicleType : null, value.deliveryMode === 'motorbike' ? value.registrationNumber.toUpperCase() : null],
    );
    await client.query(`UPDATE sokoeats_users SET status='review',profile=profile || $2::jsonb WHERE id=$1`, [req.authUser.id, JSON.stringify({ deliveryMode: value.deliveryMode, vehicleType: value.deliveryMode === 'motorbike' ? value.vehicleType : '', registrationNumber: value.deliveryMode === 'motorbike' ? value.registrationNumber.toUpperCase() : '', passportPhotoUrl: value.passportPhotoUrl, nationalIdCopyUrl: value.nationalIdCopyUrl, goodConductUrl: value.goodConductUrl, motorbikePhotoUrl: value.motorbikePhotoUrl || '', onboardingStatus: 'submitted' })]);
    const notification = await targetedNotification(client, { userId: req.authUser.id, title: 'Application received', body: `Your ${value.deliveryMode === 'foot' ? 'Errand Partner' : 'Rider'} application is with our verification team. We will notify you here when the review is complete.` });
    await client.query('COMMIT');
    void pushNotification(notification).catch(error => console.error('[SokoEats][Push] application-submission-failed', { userId: req.authUser.id, message: error.message }));
    res.status(201).json({ application: await publicApplication(rows[0], true), message: 'Application submitted for verification.' });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
}

export async function adminListDeliveryPartnerApplications(_req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT a.*,u.name,u.email,u.phone,u.city,u.application_reference FROM sokoeats_delivery_partner_applications a JOIN sokoeats_users u ON u.id=a.user_id ORDER BY CASE a.status WHEN 'submitted' THEN 0 WHEN 'under_review' THEN 1 WHEN 'declined' THEN 2 ELSE 3 END,a.submitted_at DESC NULLS LAST`);
    res.set('Cache-Control', 'no-store').json({ applications: await Promise.all(rows.map(row => publicApplication(row))), declineReasons });
  } catch (error) { next(error); }
}

export async function reviewDeliveryPartnerApplication(req, res, next) {
  const client = await pool.connect();
  try {
    const { value, error } = reviewSchema.validate(req.body);
    if (error) throw Object.assign(new Error(error.details[0].message), { status: 422 });
    await client.query('BEGIN');
    const current = (await client.query('SELECT * FROM sokoeats_delivery_partner_applications WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!current) throw Object.assign(new Error('Delivery partner application not found'), { status: 404 });
    if (value.decision === 'declined' && value.reasonCode === 'motorbike_photo_missing' && current.delivery_mode === 'foot') throw Object.assign(new Error('Motorbike documentation is not required for an Errand Partner'), { status: 422 });
    const reason = declineReasons.find(item => item.code === value.reasonCode)?.label;
    const { rows } = await client.query(`UPDATE sokoeats_delivery_partner_applications SET status=$2,decline_reason_code=$3,review_note=$4,reviewed_by=$5,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`, [current.id, value.decision, value.decision === 'declined' ? value.reasonCode : null, value.note || null, req.authUser.id]);
    await client.query(`UPDATE sokoeats_users SET status=$2,profile=profile || $3::jsonb WHERE id=$1`, [current.user_id, value.decision === 'approved' ? 'active' : 'review', JSON.stringify({ onboardingStatus: value.decision, verificationReason: reason || '', verificationNote: value.note || '', deliveryMode: current.delivery_mode })]);
    const approved = value.decision === 'approved';
    const notification = await targetedNotification(client, {
      userId: current.user_id,
      title: approved ? 'You are approved to deliver' : value.decision === 'under_review' ? 'Application review started' : 'Application needs an update',
      body: approved ? `Your ${current.delivery_mode === 'foot' ? 'Errand Partner' : 'Rider'} profile is verified. You can now go online and accept eligible deliveries.` : value.decision === 'under_review' ? 'Our team is checking your identity and safety documents. No action is needed right now.' : `${reason}. ${value.note || 'Update the requested document and resubmit your application.'}`,
      priority: approved || value.decision === 'declined' ? 'high' : 'normal',
    });
    await client.query('COMMIT');
    void pushNotification(notification).catch(error => console.error('[SokoEats][Push] application-review-failed', { userId: current.user_id, message: error.message }));
    res.json({ application: await publicApplication(rows[0]), message: approved ? 'Delivery partner approved.' : `Application marked ${value.decision.replace('_', ' ')}.` });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
}

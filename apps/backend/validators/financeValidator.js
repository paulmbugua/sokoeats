import Joi from 'joi';

const settlementMethod = Joi.string().valid('mpesa_wallet', 'mpesa_till', 'mpesa_paybill', 'bank').required();

export const vendorComplianceSchema = Joi.object({
  legalBusinessName: Joi.string().trim().min(2).max(160).required(),
  registrationNumber: Joi.string().trim().min(2).max(80).required(),
  kraPin: Joi.string().trim().uppercase().pattern(/^[AP][0-9]{9}[A-Z]$/).required(),
  directorName: Joi.string().trim().min(2).max(160).required(),
  directorNationalId: Joi.string().trim().min(5).max(30).required(),
  settlementMethod,
  settlementBankCode: Joi.string().trim().max(30).allow('', null),
  settlementAccount: Joi.string().trim().min(6).max(30).required(),
  pspSubaccountId: Joi.string().trim().max(100).allow('', null),
  pspRecipientCode: Joi.string().trim().max(100).allow('', null),
  commissionRateBps: Joi.number().integer().min(0).max(5000).default(1500),
  commissionAgreementVersion: Joi.string().trim().min(1).max(40).required(),
  commissionAccepted: Joi.boolean().valid(true).required(),
}).custom((value, helpers) => {
  if (value.settlementMethod === 'bank' && !value.settlementBankCode) return helpers.error('any.custom', { message: 'Bank code is required for bank settlement' });
  return value;
});

export const vendorReviewSchema = Joi.object({
  status: Joi.string().valid('under_review', 'verified', 'rejected', 'suspended').required(),
  note: Joi.string().trim().max(500).allow('', null),
  riskTier: Joi.string().valid('new', 'standard', 'trusted', 'restricted'),
});

export const riderPayoutSchema = Joi.object({
  method: settlementMethod,
  bankCode: Joi.string().trim().max(30).allow('', null),
  accountNumber: Joi.string().trim().min(6).max(30).required(),
  schedule: Joi.string().valid('immediate', 'daily').required(),
}).custom((value, helpers) => {
  if (value.method === 'bank' && !value.bankCode) return helpers.error('any.custom', { message: 'Bank code is required for bank settlement' });
  return value;
});

export const assignRiderSchema = Joi.object({ riderUserId: Joi.string().uuid().required() });
export const deliveryOtpSchema = Joi.object({ otp: Joi.string().pattern(/^[0-9]{6}$/).required() });
export const disputeSchema = Joi.object({ reason: Joi.string().trim().min(8).max(500).required() });
export const disputeResolutionSchema = Joi.object({
  resolution: Joi.string().valid('release', 'refund', 'adjust').required(),
  note: Joi.string().trim().min(3).max(500).required(),
  adjustmentTarget: Joi.when('resolution', { is: 'adjust', then: Joi.string().valid('vendor', 'rider').required(), otherwise: Joi.forbidden() }),
  adjustmentAmount: Joi.when('resolution', { is: 'adjust', then: Joi.number().integer().invalid(0).required(), otherwise: Joi.forbidden() }),
});
export const refundSchema = Joi.object({
  amount: Joi.number().integer().positive(),
  reason: Joi.string().trim().min(5).max(500).required(),
});

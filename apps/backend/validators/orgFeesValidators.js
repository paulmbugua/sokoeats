// apps/backend/validators/orgFeesValidators.js
import Joi from 'joi';

const money = Joi.number().integer().min(0);
const uuidLike = Joi.string().min(1);
const isoDate = Joi.date();

// ✅ ADD THIS
export const orgParamsSchema = Joi.object({
  orgId: uuidLike.required(),
});

// ✅ ADD THIS (use on routes that have both :orgId and :learnerId)
export const orgLearnerParamsSchema = Joi.object({
  orgId: uuidLike.required(),
  learnerId: uuidLike.required(),
});



const feeItemSchema = Joi.object({
  label: Joi.string().min(1).required(),
  amount_cents: money.required(),
  currency: Joi.string().min(2).max(12).default('USD'),
  cadence: Joi.string().allow(null, ''),
  is_optional: Joi.boolean().default(false),
  sort_order: Joi.number().integer().default(0),
  metadata: Joi.object().unknown(true).default({}),
});

export const createStructureSchema = Joi.object({
  title: Joi.string().min(2).required(),
  description: Joi.string().allow('', null),
  currency: Joi.string().min(2).max(12).default('USD'),
  effective_term: Joi.string().allow('', null),
  is_active: Joi.boolean().default(true),
  items: Joi.array().items(feeItemSchema).default([]),
});

export const updateStructureSchema = Joi.object({
  title: Joi.string().min(2),
  description: Joi.string().allow('', null),
  currency: Joi.string().min(2).max(12),
  effective_term: Joi.string().allow('', null),
  is_active: Joi.boolean(),
  items: Joi.array().items(feeItemSchema),
});

export const structureParamsSchema = Joi.object({
  structureId: Joi.number().integer().positive().required(),
});

export const feeChargeSchema = Joi.object({
  learner_id: uuidLike.required(),
  amount_cents: money.required(),
  currency: Joi.string().min(2).max(12).default('USD'),
  description: Joi.string().allow('', null),
  class_label: Joi.string().allow('', null),
  due_date: isoDate.allow(null),
  structure_id: Joi.number().integer().positive().optional(),
  structure_item_id: Joi.number().integer().positive().optional(),
  metadata: Joi.object().unknown(true).default({}),
});

export const bulkFeeChargeSchema = Joi.object({
  learner_ids: Joi.array().items(uuidLike).min(1).required(),
  amount_cents: money.required(),
  currency: Joi.string().min(2).max(12).default('USD'),
  description: Joi.string().allow('', null),
  class_label: Joi.string().allow('', null),
  due_date: isoDate.allow(null),
  structure_id: Joi.number().integer().positive().optional(),
  structure_item_id: Joi.number().integer().positive().optional(),
  metadata: Joi.object().unknown(true).default({}),
});

export const feePaymentSchema = Joi.object({
  learner_id: uuidLike.required(),
  charge_id: Joi.number().integer().positive().optional(),
  amount_cents: money.required(),
  currency: Joi.string().min(2).max(12).default('USD'),
  method: Joi.string().allow('', null),
  reference: Joi.string().allow('', null),
  note: Joi.string().allow('', null),
  received_at: isoDate.allow(null),
  metadata: Joi.object().unknown(true).default({}),
});

export const learnerParamsSchema = Joi.object({
  learnerId: uuidLike.required(),
});

export const balancesQuerySchema = Joi.object({
  class_label: Joi.string().allow('', null),
});

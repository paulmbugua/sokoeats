// apps/backend/validators/orgFeesValidators.js
import Joi from 'joi';

const money = Joi.number().integer().min(0);
const uuidLike = Joi.string().min(1);
const isoDate = Joi.date();

/* ─────────────────────────────────────────────────────────
 * Currency helpers
 * ───────────────────────────────────────────────────────── */

// Currency helpers
const currencyStrict = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^[A-Z]{2,12}$/)
  .messages({
    'string.pattern.base': 'currency must be 2-12 letters (e.g. USD, KES, EUR)',
  });

// Create defaults
const currencyUSD = currencyStrict.default('USD');

// "inherit" semantics (null means inherit / don't inject)
const currencyOptional = currencyStrict.allow(null, '').empty(['', null]).default(null);

// ✅ PATCH semantics (DO NOT inject anything when missing)
const currencyPatch = currencyStrict.allow(null, '').empty(['', null]).optional();


/* ─────────────────────────────────────────────────────────
 * Params
 * ───────────────────────────────────────────────────────── */

export const orgParamsSchema = Joi.object({
  orgId: uuidLike.required(),
});

export const orgLearnerParamsSchema = Joi.object({
  orgId: uuidLike.required(),
  learnerId: uuidLike.required(),
});

export const structureParamsSchema = Joi.object({
  orgId: uuidLike.required(),
  structureId: Joi.number().integer().positive().required(),
}).unknown(true); // ✅ allows any extras just in case

export const learnerParamsSchema = Joi.object({
  orgId: uuidLike.required(),
  learnerId: uuidLike.required(),
}).unknown(true);


/* ─────────────────────────────────────────────────────────
 * Structure items
 * ───────────────────────────────────────────────────────── */

const feeItemSchema = Joi.object({
  label: Joi.string().min(1).required(),
  amount_cents: money.required(),

  // ✅ do NOT default to USD (inherit from structure) -> default null
  currency: currencyOptional,

  cadence: Joi.string().allow('', null).default(null),
  is_optional: Joi.boolean().default(false),
  sort_order: Joi.number().integer().default(0),
  metadata: Joi.object().unknown(true).default({}),
}).default();

/* ─────────────────────────────────────────────────────────
 * Fee structures
 * ───────────────────────────────────────────────────────── */

export const createStructureSchema = Joi.object({
  title: Joi.string().min(2).required(),
  description: Joi.string().allow('', null).default(''),

  // ✅ structure can default to USD
  currency: currencyUSD,

  effective_term: Joi.string().allow('', null).default(null),

  // ✅ publish toggle -> maps to is_active
  is_active: Joi.boolean().default(true),

  // ✅ new scope fields (scope_type kept for backward compatibility, but UI mainly uses scope_value)
  scope_value: Joi.string().allow('', null).max(120).optional(),
  scope_type: Joi.string().allow('', null).max(30).optional(),

  // ✅ always default to []
  items: Joi.array().items(feeItemSchema).default([]),
}).default();

export const updateStructureSchema = Joi.object({
  title: Joi.string().min(2),
  description: Joi.string().allow('', null),

  // ✅ was: currencyOptional (danger: injects null)
  currency: currencyPatch,

  effective_term: Joi.string().allow('', null),
  is_active: Joi.boolean().optional(),
  scope_type: Joi.string().valid('all', 'class', 'grade').allow('', null),
  scope_value: Joi.string().allow('', null),
  items: Joi.array().items(feeItemSchema),
}).default();


/* ─────────────────────────────────────────────────────────
 * Charges
 * ───────────────────────────────────────────────────────── */

export const feeChargeSchema = Joi.object({
  learner_id: uuidLike.required(),
  amount_cents: money.required(),

  // ✅ charges default USD if omitted
  currency: currencyUSD,

  description: Joi.string().allow('', null).default(''),
  class_label: Joi.string().allow('', null).default(null),
  due_date: isoDate.allow(null).default(null),

  structure_id: Joi.number().integer().positive().optional(),
  structure_item_id: Joi.number().integer().positive().optional(),

  metadata: Joi.object().unknown(true).default({}),
}).default();

export const bulkFeeChargeSchema = Joi.object({
  learner_ids: Joi.array().items(uuidLike).min(1).required(),
  amount_cents: money.required(),

  // ✅ bulk charges default USD
  currency: currencyUSD,

  description: Joi.string().allow('', null).default(''),
  class_label: Joi.string().allow('', null).default(null),
  due_date: isoDate.allow(null).default(null),

  structure_id: Joi.number().integer().positive().optional(),
  structure_item_id: Joi.number().integer().positive().optional(),

  metadata: Joi.object().unknown(true).default({}),
}).default();

/* ─────────────────────────────────────────────────────────
 * Payments
 * ───────────────────────────────────────────────────────── */

export const feePaymentSchema = Joi.object({
  learner_id: uuidLike.required(),
  charge_id: Joi.number().integer().positive().optional(),
  amount_cents: money.required(),

  // ✅ inherit from charge currency if linked (so don't inject) -> default null
  currency: currencyOptional,

  method: Joi.string().allow('', null).default(null),
  reference: Joi.string().allow('', null).default(null),
  note: Joi.string().allow('', null).default(null),
  received_at: isoDate.allow(null).default(null),

  metadata: Joi.object().unknown(true).default({}),
}).default();

/* ─────────────────────────────────────────────────────────
 * Queries
 * ───────────────────────────────────────────────────────── */

export const balancesQuerySchema = Joi.object({
  class_label: Joi.string().allow('', null).default(null),
}).default();

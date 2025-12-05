// apps/backend/validators/profileValidator.js
import Joi from 'joi';

// -------------------------------------------------------------
// Constants
// -------------------------------------------------------------
const validCategories = [
  'Mathematics',
  'Sciences',
  'Programming',
  'Languages',
  'Art & Design',
  'Wellness',
];

const validPayoutCurrencies = ['KES', 'USD'];
const validPayoutMethods    = ['mpesa', 'wise']; // ✅ only the two you support

// Defaults
const payoutCurrencyJoi = Joi.string().valid(...validPayoutCurrencies).default('USD');
const payoutMethodJoi   = Joi.string().valid(...validPayoutMethods);

// Reusable URL-or-path schemas
const httpUrl     = Joi.string().uri({ scheme: [/https?/] });
const leadingPath = Joi.string().pattern(/^\/.+/);
const iso2 = /^[A-Z]{2}$/;

const countryJoi = Joi.string().pattern(iso2).uppercase();       // optional
const schoolGradeJoi = Joi.string().min(1).max(64);              // optional

const urlOrPath = (label = 'value') =>
  Joi.alternatives()
    .try(httpUrl, leadingPath)
    .messages({
      'alternatives.match': `"${label}" must be a valid URL or start with "/"`,
    });

const urlPathOrEmpty = (label = 'value') =>
  Joi.alternatives()
    .try(httpUrl, leadingPath, Joi.valid('', null))
    .messages({
      'alternatives.match': `"${label}" must be a valid URL or start with "/" (or be empty)`,
    });

// -------------------------------------------------------------
// Shared (create/update) sub-schemas
// -------------------------------------------------------------
const pricingCreateSchema = Joi.object({
  privateSession: Joi.number().min(5).max(50).required(),
  groupSession:   Joi.number().min(5).max(50).required(),
  workshop:       Joi.number().min(5).max(100).required(),
  lecture:        Joi.number().min(5).max(100).required(),
});

const pricingUpdateSchema = Joi.object({
  privateSession: Joi.number().min(5).max(50),
  groupSession:   Joi.number().min(5).max(50),
  workshop:       Joi.number().min(5).max(100),
  lecture:        Joi.number().min(5).max(100),
}).min(1);

const descriptionCreateSchema = Joi.object({
  bio: Joi.string().min(1).required(),
  expertise: Joi.array().items(Joi.string().trim()).min(1).required(),
  teachingStyle: Joi.array()
    .items(Joi.string().valid('One-on-One','Group','Workshop','Lecture'))
    .min(1)
    .required(),
});

const descriptionUpdateSchema = Joi.object({
  bio: Joi.string().min(1),
  expertise: Joi.array().items(Joi.string().trim()).min(1),
  teachingStyle: Joi.array()
    .items(Joi.string().valid('One-on-One','Group','Workshop','Lecture'))
    .min(1),
}).min(1);

// -------------------------------------------------------------
// Create schema (full required fields for tutors)
// -------------------------------------------------------------
export const profileValidationSchema = Joi.object({
  role: Joi.string().valid('tutor', 'student').required(),

  // Common
  name: Joi.string().min(2).trim().required(),
 age: Joi.number().integer().min(5),
languages: Joi.array().items(Joi.string().trim()).default([]),

 
  
  country: Joi.string().pattern(iso2).uppercase(),     // optional
  schoolGrade: Joi.string().min(1).max(64),            // optional
  // Tutor-only media
  gallery: Joi.when('role', {
    is: 'tutor',
    then: Joi.array().items(urlOrPath('gallery item')).min(1).required(),
    otherwise: Joi.forbidden(),
  }),
  video: Joi.when('role', {
    is: 'tutor',
    then: urlPathOrEmpty('video'),
    otherwise: Joi.forbidden(),
  }),

  category: Joi.when('role', {
    is: 'tutor',
    then: Joi.string().valid(...validCategories).required(),
    otherwise: Joi.forbidden(),
  }),

  recommended: Joi.when('role', {
    is: 'tutor',
    then: Joi.array().items(Joi.string()).optional(),
    otherwise: Joi.forbidden(),
  }),

  experienceLevel: Joi.when('role', {
    is: 'tutor',
    then: Joi.string().valid('Beginner','Intermediate','Advanced','Expert').optional(),
    otherwise: Joi.forbidden(),
  }),

  description: Joi.when('role', {
    is: 'tutor',
    then: descriptionCreateSchema.required(),
    otherwise: Joi.forbidden(),
  }),

  pricing: Joi.when('role', {
    is: 'tutor',
    then: pricingCreateSchema.required(),
    otherwise: Joi.forbidden(),
  }),

  // Legacy (only if KES)
  paymentMethod: Joi.when('role', {
    is: 'tutor',
    then: Joi.when('payoutCurrency', {
      is: 'KES',
      then: Joi.string().valid('mpesa').default('mpesa'),
      otherwise: Joi.forbidden(),
    }),
    otherwise: Joi.forbidden(),
  }),
  bankAccount: Joi.forbidden(),
  bankCode: Joi.forbidden(),

  // ✅ New payout prefs (Wise + M-Pesa only)
  payoutCurrency: Joi.when('role', { is: 'tutor', then: payoutCurrencyJoi, otherwise: Joi.forbidden() }),
  payoutMethod: Joi.when('role', {
    is: 'tutor',
    then: payoutMethodJoi.when('payoutCurrency', {
      is: 'KES', then: Joi.valid('mpesa').default('mpesa'),
      otherwise: Joi.valid('wise').default('wise'), // USD -> Wise
    }),
    otherwise: Joi.forbidden(),
  }),

  wiseEmail: Joi.when('payoutMethod', {
    is: 'wise',
    then: Joi.string().email({ tlds: false }).required(),
    otherwise: Joi.forbidden(),
  }),

  mpesaPhoneNumber: Joi.when('payoutMethod', {
    is: 'mpesa',
    then: Joi.string().pattern(/^(?:07|2547|\+2547|01|2541|\+2541)\d{8}$/).required(),
    otherwise: Joi.forbidden(),
  }),

  // Explicitly forbid Stripe/PayPal fields to avoid mismatches
  stripeConnectId: Joi.forbidden(),
  paypalEmail: Joi.forbidden(),

  status: Joi.when('role', {
    is: 'tutor',
    then: Joi.string().valid('Online','Offline','Busy','Away','Free').optional(),
    otherwise: Joi.forbidden(),
  }),
  notifications: Joi.when('role', {
    is: 'tutor',
    then: Joi.boolean().optional(),
    otherwise: Joi.forbidden(),
  }),
});

// -------------------------------------------------------------
// Update schema (partial, still constrained)
// -------------------------------------------------------------
export const profileUpdateValidationSchema = Joi.object({
  role: Joi.string().valid('tutor', 'student'),

  name: Joi.string().min(2).trim(),
  age: Joi.number().integer().min(5),

   languages: Joi.array().items(Joi.string().trim()),
  country: countryJoi,              // optional
  schoolGrade: schoolGradeJoi,      // optional

  gallery: Joi.array().items(urlOrPath('gallery item')).min(1),
  video: urlPathOrEmpty('video'),

  category: Joi.string().valid(...validCategories),

  recommended: Joi.array().items(Joi.string()),
  experienceLevel: Joi.string().valid('Beginner','Intermediate','Advanced','Expert'),

  description: descriptionUpdateSchema,
  pricing: pricingUpdateSchema,

  payoutCurrency: payoutCurrencyJoi,
  payoutMethod: payoutMethodJoi.when('payoutCurrency', {
    is: 'KES', then: Joi.valid('mpesa'),
    otherwise: Joi.valid('wise'),
  }),

  wiseEmail: Joi.when('payoutMethod', {
    is: 'wise',
    then: Joi.string().email({ tlds: false }).required(),
    otherwise: Joi.forbidden(),
  }),

  mpesaPhoneNumber: Joi.when('payoutMethod', {
    is: 'mpesa',
    then: Joi.string().pattern(/^(?:07|2547|\+2547|01|2541|\+2541)\d{8}$/).required(),
    otherwise: Joi.forbidden(),
  }),

  stripeConnectId: Joi.forbidden(),
  paypalEmail: Joi.forbidden(),

  status: Joi.string().valid('Online','Offline','Busy','Away','Free'),
  notifications: Joi.boolean(),
});

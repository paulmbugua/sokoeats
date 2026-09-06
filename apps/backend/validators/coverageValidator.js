import Joi from 'joi';

export const cityCoverageSchema = Joi.object({
  status: Joi.string().valid('coming_soon','onboarding','active','paused').required(),
  deliveryMode: Joi.string().valid('instant','scheduled','both'),
});
export const zoneMembershipSchema = Joi.object({ active: Joi.boolean().required() });
export const createCitySchema = Joi.object({
  countyCode: Joi.string().pattern(/^[0-9]{3}$/).required(),
  name: Joi.string().trim().min(2).max(100).required(),
  slug: Joi.string().lowercase().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).required(),
  latitude: Joi.number().min(-5).max(5).required(),
  longitude: Joi.number().min(33).max(42).required(),
  status: Joi.string().valid('coming_soon','onboarding','active','paused').default('onboarding'),
  deliveryMode: Joi.string().valid('instant','scheduled','both').default('instant'),
});
export const createZoneSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  latitude: Joi.number().min(-5).max(5).required(),
  longitude: Joi.number().min(33).max(42).required(),
  radiusKm: Joi.number().positive().max(200).required(),
  status: Joi.string().valid('active','paused').default('active'),
  maxSurgeMultiplier: Joi.number().min(1).max(1.75).default(1.75),
});

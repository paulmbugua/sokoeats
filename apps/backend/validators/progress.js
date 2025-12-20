import Joi from 'joi';

export const upsertProgressSchema = Joi.object({
  week: Joi.number().integer().min(1).required(),
  status: Joi.string()
    .valid('Not Started', 'In Progress', 'Completed')
    .required(),
  score: Joi.number().min(0).max(100).optional(),
  notes: Joi.string().max(2000).allow('', null),
});

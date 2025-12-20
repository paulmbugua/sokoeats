// validators/enrollmentValidators.js
import Joi from 'joi';

export const enrollBodySchema = Joi.object({
  course_id: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

export const studentParamsSchema = Joi.object({
  studentId: Joi.alternatives()
    .try(
      Joi.string().valid('me'), // ✅ allow "me"
      Joi.number().integer().positive(),
      Joi.string().pattern(/^\d+$/),
    )
    .required(),
});

export const courseParamsSchema = Joi.object({
  courseId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

export const idParamsSchema = Joi.object({
  id: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

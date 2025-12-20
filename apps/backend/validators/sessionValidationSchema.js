import Joi from 'joi';

export const sessionValidationSchema = Joi.object({
  tutorId: Joi.string().required().label('Tutor ID'),

  // ← allow an optional tutorName
  tutorName: Joi.string().trim().min(2).max(255).label('Tutor Name').optional(),

  subject: Joi.string().trim().min(2).max(255).required().label('Subject'),

  // ← allow the pricing object
  pricing: Joi.object({
    lecture: Joi.number()
      .precision(2)
      .positive()
      .required()
      .label('Lecture Price'),
    workshop: Joi.number()
      .precision(2)
      .positive()
      .required()
      .label('Workshop Price'),
    groupSession: Joi.number()
      .precision(2)
      .positive()
      .required()
      .label('Group Session Price'),
    privateSession: Joi.number()
      .precision(2)
      .positive()
      .required()
      .label('Private Session Price'),
  })
    .required()
    .label('Pricing'),

  date: Joi.date().iso().required().label('Date').messages({
    'date.base': 'Invalid date format',
    'date.format': 'Date must be in ISO format (YYYY-MM-DDTHH:MM:SSZ)',
  }),

  sessionType: Joi.string()
    .valid('privateSession', 'groupSession', 'lecture', 'workshop')
    .required()
    .label('Session Type'),

  // accept numeric or numeric-string costs
  sessionCost: Joi.alternatives()
    .try(
      Joi.number().precision(2).positive(),
      Joi.string().pattern(/^\d+(\.\d{1,2})?$/),
    )
    .required()
    .label('Session Cost')
    .messages({
      'alternatives.match': 'Session cost must be a valid number',
      'number.positive': 'Session cost must be greater than zero',
    }),
})
  // disallow any keys not listed above
  .options({ allowUnknown: false });

// ✅ Review Validation Schema
export const reviewValidationSchema = Joi.object({
  tutorId: Joi.string().required().label('Tutor ID'),

  comment: Joi.string().trim().max(500).required().label('Comment').messages({
    'string.max': 'Comment cannot exceed 500 characters',
  }),

  rating: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .required()
    .label('Rating')
    .messages({
      'number.base': 'Rating must be a number',
      'number.min': 'Rating must be at least 1',
      'number.max': 'Rating cannot exceed 5',
    }),
});

// ✅ Complete Session Validation Schema
export const completeSessionValidationSchema = Joi.object({
  sessionId: Joi.string().required().label('Session ID'),
});

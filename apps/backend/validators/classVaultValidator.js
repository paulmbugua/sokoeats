import Joi from 'joi';

// A string that is either:
//  • an absolute URL (http:// or https://…)
//  • or a relative path, e.g. "/uploads/file.mp4" (percent-encoded, underscores, dots, pluses, hyphens, and parentheses allowed)
const uriOrRelative = Joi.alternatives().try(
  // 1) absolute HTTP/HTTPS URL
  Joi.string().uri({ scheme: ['http', 'https'] }),
  // 2) relative file path with optional leading slash, segments of [A-Za-z0-9_%-\.\+\(\)], and a final extension
  Joi.string().pattern(
    /^(\/?[A-Za-z0-9_%\-\.\+\(\)]+\/)*[A-Za-z0-9_%\-\.\+\(\)]+\.[A-Za-z0-9]+$/,
  ),
);

export const classVaultValidationSchema = Joi.object({
  title: Joi.string().min(3).max(255).required(),
  subject: Joi.string().required(),
  grade_level: Joi.string().required(),
  price: Joi.number().integer().required(),
  duration: Joi.number().integer().optional(),
  tags: Joi.array().items(Joi.string().trim()).optional(),

  // Both video_url and pdf_url may be empty or omitted…
  video_url: uriOrRelative.empty('').optional(),
  pdf_url: uriOrRelative.empty('').optional(),
})
  .or('video_url', 'pdf_url')
  .messages({
    'object.missing': 'Either video_url or pdf_url must be provided',
  });

// For PATCH/PUT: make every field optional
export const classVaultUpdateValidationSchema = classVaultValidationSchema.fork(
  Object.keys(classVaultValidationSchema.describe().keys),
  (schema) => schema.optional(),
);

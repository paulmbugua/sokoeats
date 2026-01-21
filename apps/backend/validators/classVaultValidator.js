import Joi from 'joi';

// absolute http(s) OR safe relative file path
const uriOrRelative = Joi.alternatives().try(
  Joi.string().uri({ scheme: ['http', 'https'] }),
  Joi.string().pattern(
    /^(\/?[A-Za-z0-9_%\-\.\+\(\)]+\/)*[A-Za-z0-9_%\-\.\+\(\)]+\.[A-Za-z0-9]+$/
  )
);

const classVaultBaseSchema = Joi.object({
  title: Joi.string().min(3).max(255),
  subject: Joi.string(),
  grade_level: Joi.string(),
  price: Joi.number().integer(),
  duration: Joi.number().integer(),
  tags: Joi.array().items(Joi.string().trim()),

  video_url: uriOrRelative.empty(''),
  pdf_url: uriOrRelative.empty(''),

  thumbnail_url: uriOrRelative.empty(''),
  preview_url: uriOrRelative.empty(''),
});

// ✅ CREATE requires a main file
export const classVaultValidationSchema = classVaultBaseSchema
  .fork(Object.keys(classVaultBaseSchema.describe().keys), (s) => s.optional())
  .required()
  .or('video_url', 'pdf_url')
  .custom((obj, helpers) => {
    const hasVideo = Boolean(String(obj.video_url || '').trim());
    const hasPdf = Boolean(String(obj.pdf_url || '').trim());
    const hasThumb = Boolean(String(obj.thumbnail_url || '').trim());

    if (hasPdf && !hasVideo && !hasThumb) {
      return helpers.error('any.custom', {
        message: 'thumbnail_url is required for Notes (pdf-only) items.',
      });
    }

    if (hasPdf && !hasVideo && obj.preview_url) obj.preview_url = '';
    return obj;
  })
  .messages({
    'object.missing': 'Either video_url or pdf_url must be provided',
    'any.custom': '{{#message}}',
  });

// ✅ UPDATE: everything optional, NO `.or(...)`
export const classVaultUpdateValidationSchema = classVaultBaseSchema
  .fork(Object.keys(classVaultBaseSchema.describe().keys), (s) => s.optional())
  .messages({
    'any.custom': '{{#message}}',
  });

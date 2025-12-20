// apps/backend/validators/aiCoursesValidator.js
import Joi from 'joi';

/** ========= Size handling ========= */
const LEGACY_TO_NEW = {
  micro: 'mini',
  short: 'standard',
  standard: 'standard',
  deep_dive: 'deep_dive',
};
const VALID_COURSE_SIZES = [
  'mini',
  'standard',
  'extended',
  'deep_dive',
  'bootcamp',
];

/** Optional long-form program tracks */
const VALID_PROGRAM_TRACKS = ['module', 'certificate', 'diploma', 'degree'];

function normKey(v) {
  if (v === undefined || v === null) return undefined;
  return String(v)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}
function normalizeCourseSize(v) {
  const k = normKey(v);
  if (!k) return undefined;
  return VALID_COURSE_SIZES.includes(k) ? k : LEGACY_TO_NEW[k];
}

/** Merge legacy `size` into `courseSize` and normalize */
function mergeLegacySizeIntoCourseSize(value, helpers) {
  const out = { ...value };
  const provided = out.courseSize ?? out.size;
  if (provided != null) {
    const mapped = normalizeCourseSize(provided);
    if (!mapped) {
      return helpers.error('any.invalid', { message: 'Invalid course size' });
    }
    out.courseSize = mapped;
  }
  return out;
}

/** Shared fragments */
const keyPoint = Joi.string().trim().min(1).max(400);
const outlineSection = Joi.object({
  id: Joi.string().trim().optional(),
  title: Joi.string().trim().min(2).max(200).required(),
  keyPoints: Joi.array().items(keyPoint).max(10).default([]),
});

const level = Joi.string().valid('beginner', 'intermediate', 'advanced');
const minutes = Joi.number().integer().min(1).max(10000);
const paragraphs = Joi.number().integer().min(1).max(50);
const sentencesPerParagraph = Joi.number().integer().min(1).max(5);
const finalQuizSize = Joi.number().integer().min(1).max(200);
const totalLessons = Joi.number().integer().min(1).max(500); // cap for sanity

// allow either string or numeric ids in grading payloads
const idSchema = Joi.alternatives().try(Joi.string(), Joi.number());

/** ========= OUTLINE ========= */
export const outlineSchema = Joi.object({
  courseId: Joi.string().uuid().optional(),
  title: Joi.string().trim().min(2).max(200).optional(),
  level: level.optional(),

  // Let the service derive if omitted
  targetMinutes: minutes.optional(),

  // New: either set program track or an explicit lesson count
  programTrack: Joi.string()
    .valid(...VALID_PROGRAM_TRACKS)
    .optional(),
  totalLessons: totalLessons.optional(),

  // New preferred field
  courseSize: Joi.string()
    .valid(...VALID_COURSE_SIZES)
    .optional(),
  // Legacy alias (merged to courseSize)
  size: Joi.string()
    .valid('micro', 'short', 'standard', 'deep_dive')
    .optional(),

  // Optional formatting / sizing hints
  paragraphs: paragraphs.optional(),
  sentencesPerParagraph: sentencesPerParagraph.optional(),
  finalQuizSize: finalQuizSize.optional(),
})
  .or('courseId', 'title')
  .custom(mergeLegacySizeIntoCourseSize, 'normalize course size');

/** ========= LESSON SSML ========= */
export const lessonSchema = Joi.object({
  courseId: Joi.string().uuid().required(),
  outline: Joi.array().items(outlineSection).min(1).required(),
  voiceName: Joi.string().trim().min(2).max(60).default('en-US-JennyNeural'),

  level: level.optional(),
  targetMinutes: minutes.optional(),

  programTrack: Joi.string()
    .valid(...VALID_PROGRAM_TRACKS)
    .optional(),
  totalLessons: totalLessons.optional(),

  courseSize: Joi.string()
    .valid(...VALID_COURSE_SIZES)
    .optional(),
  size: Joi.string()
    .valid('micro', 'short', 'standard', 'deep_dive')
    .optional(),

  paragraphs: paragraphs.optional(),
  sentencesPerParagraph: sentencesPerParagraph.optional(),
  finalQuizSize: finalQuizSize.optional(),

  // batching hints
  start: Joi.number().integer().min(0).optional(),
  count: Joi.number().integer().min(1).optional(),
}).custom(mergeLegacySizeIntoCourseSize, 'normalize course size');

/** ========= QUIZ ========= */
export const quizSchema = Joi.object({
  courseId: Joi.string().uuid().required(),
  outline: Joi.array().items(outlineSection).min(1).required(),

  lessonIndex: Joi.number().integer().min(0).optional(),

  level: level.optional(),
  targetMinutes: minutes.optional(),

  programTrack: Joi.string()
    .valid(...VALID_PROGRAM_TRACKS)
    .optional(),
  totalLessons: totalLessons.optional(),

  courseSize: Joi.string()
    .valid(...VALID_COURSE_SIZES)
    .optional(),
  size: Joi.string()
    .valid('micro', 'short', 'standard', 'deep_dive')
    .optional(),

  // Admin override for quiz type (single-type enforcement)
  quizType: Joi.string().valid('mcq', 'short').default('mcq').optional(),
  // Optional boolean alias (controller converts to quizType)
  isMultipleChoice: Joi.boolean().optional(),

  // org flow linkage
  assignmentId: Joi.string().uuid().optional(),

  paragraphs: paragraphs.optional(),
  sentencesPerParagraph: sentencesPerParagraph.optional(),
  finalQuizSize: finalQuizSize.optional(),
}).custom(mergeLegacySizeIntoCourseSize, 'normalize course size');

/** ========= GRADE ========= */
/* Support both MCQ and Short-Answer question shapes in the incoming quiz */
const baseQuestionFields = {
  id: idSchema.required(),
  // either prompt or display must exist
  prompt: Joi.string().allow('').optional(),
  display: Joi.string().allow('').optional(),
  explanation: Joi.string().optional(),
};

const mcqQuestionForGrading = Joi.object({
  ...baseQuestionFields,
  type: Joi.string().valid('mcq').optional(), // may be absent in some payloads
  // allow 2–10 choices; MCQ UI can vary
  choices: Joi.array().items(Joi.string().required()).min(2).max(10).required(),
  answerIndex: Joi.number().integer().min(0).required(),
}).or('prompt', 'display');

const shortQuestionForGrading = Joi.object({
  ...baseQuestionFields,
  type: Joi.string().valid('short').optional(), // may be absent in some payloads
  // canonical correct answer
  answer: Joi.string().min(1).required(),
  // additional accepted forms
  accept: Joi.array().items(Joi.string()).optional(),
  // optional regex (applied to normalized user text server-side)
  regex: Joi.string().optional(),
}).or('prompt', 'display');

export const gradeSchema = Joi.object({
  quiz: Joi.object({
    // optional pack-level type; controller will infer if missing
    quizType: Joi.string().valid('mcq', 'short').optional(),
    questions: Joi.array()
      .items(
        Joi.alternatives().try(mcqQuestionForGrading, shortQuestionForGrading),
      )
      .min(1)
      .required(),
  }).required(),

  // Either MCQ selection (choiceIndex) or short-answer text (answerText).
  // Also allow several alias keys seen in your controller.
  answers: Joi.array()
    .items(
      Joi.object({
        questionId: idSchema.required(),
        choiceIndex: Joi.number().integer().min(0).optional(), // MCQ path
        answerText: Joi.string().trim().optional(), // Short path
        // aliases your controller already reads:
        text: Joi.string().trim().optional(),
        value: Joi.string().trim().optional(),
        free: Joi.string().trim().optional(),
        written: Joi.string().trim().optional(),
      })
        // Require at least one of these fields to be present
        .or('choiceIndex', 'answerText', 'text', 'value', 'free', 'written')
        .unknown(true), // future-proofing
    )
    .min(1)
    .required(),

  // org flow hints (optional)
  assignmentId: Joi.string().uuid().optional(),

  // If omitted, controller looks up assignment/org defaults; clamp happens there
  passMark: Joi.number().integer().min(0).max(100).optional(),
});

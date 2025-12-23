import express from 'express';
import {
  // newsletters
  createNewsletter,
  generateNewsletterContent,
  saveNewsletterContent,
  sendNewsletter,
  listNewsletters,
  getNewsletter,
  previewNewsletterRecipients,
  listNewsletterRecipients,
  listLearnerNewsletters,
  getLearnerNewsletter,
  getLearnerNewsletterPdf,
} from '../controllers/orgProToolsController.js';

import requireAuth from '../middleware/auth.js';

const router = express.Router();

// base: /api/org/:orgId/pro
router.use(requireAuth);

// Newsletters
router.get('/:orgId/pro/newsletters', listNewsletters);
router.post('/:orgId/pro/newsletters', createNewsletter);
router.get('/:orgId/pro/newsletters/:id', getNewsletter);
router.post('/:orgId/pro/newsletters/generate', generateNewsletterContent);
router.put('/:orgId/pro/newsletters/:id', saveNewsletterContent);
router.post('/:orgId/pro/newsletters/:id/preview-recipients', previewNewsletterRecipients);
router.get('/:orgId/pro/newsletters/:id/recipients', listNewsletterRecipients);
router.post('/:orgId/pro/newsletters/:id/send', sendNewsletter);
router.get('/:orgId/learner/newsletters',  listLearnerNewsletters);
router.get('/:orgId/learner/newsletters/:id', getLearnerNewsletter);
router.get('/:orgId/learner/newsletters/:id/pdf',  getLearnerNewsletterPdf,);


export default router;

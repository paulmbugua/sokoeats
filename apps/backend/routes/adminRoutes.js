// apps/backend/routes/adminRoute.js
import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';

// Pull in ALL handlers that might exist. Some projects will have only a subset;
// below we "guard-call" them so missing ones don't crash the router.
import {
  // Financials
  listTransactions, // payments-only (legacy)
  listFinancialFeed, // unified payments + withdrawals
  proofOfFulfillment,

  // Users (admin ops)
  listUsers,
  adminSetRole,
  adminAdjustTokens,
  adminDeleteUser,
  adminResetPassword,
  adminImpersonateUser,

  // Packages (you may have one or both APIs implemented)
  listPackages,
  upsertPackagePair, // expects {credits, priceUSD, priceKES, offer}
  upsertPackage, // same semantics as upsertPair; credits may be in body or param
  updatePackage, // legacy: update single row by :id
  deletePackage, // delete by :id OR (in newer impl) by :credits
} from '../controllers/adminController.js';

import { adminLogin } from '../controllers/userController.js';
import {
  adminGetOrgPricing,
  adminListOrgs,
  adminOrgSubscriptions,
  adminUpdateOrgPricing,
  adminUpsertOrgPricing,
  adminUpgradeOrg,
} from '../controllers/adminOrgController.js';

const adminRouter = Router();

/* -----------------------------
 * Helpers: pick whichever impl exists
 * ---------------------------- */
const callIfFn = (fn, req, res, next) =>
  typeof fn === 'function'
    ? fn(req, res, next)
    : res.status(501).json({ success: false, message: 'Not implemented' });

// Prefer the “pair” upsert if present; fall back to single upsert.
const upsertPair = (req, res, next) => {
  if (typeof upsertPackagePair === 'function')
    return upsertPackagePair(req, res, next);
  if (typeof upsertPackage === 'function') return upsertPackage(req, res, next);
  return res
    .status(501)
    .json({ success: false, message: 'Upsert package not implemented' });
};

// PUT by credits → use the same upsert logic
const upsertByCredits = (req, res, next) => upsertPair(req, res, next);

/* -----------------------------
 * Public (optional) admin login
 * ---------------------------- */
adminRouter.post('/login', adminLogin);

/* -----------------------------
 * Everything below requires admin auth
 * ---------------------------- */
adminRouter.use(adminAuth);

/* -------- Packages -------- */
// List all package rows (USD & KES)
adminRouter.get('/packages', (req, res, next) =>
  callIfFn(listPackages, req, res, next),
);

// Create/Upsert a pair (both USD & KES) by credits
adminRouter.post('/packages', upsertPair);
adminRouter.post('/packages/pair', upsertPair); // back-compat alias

// Update by DB id (legacy single-row update)
adminRouter.put('/packages/:id', (req, res, next) =>
  callIfFn(updatePackage, req, res, next),
);

// Update/Upsert by credits (both USD & KES) — newer style
adminRouter.put('/packages/by-credits/:credits', upsertByCredits);

// Delete by DB id (legacy)
adminRouter.delete('/packages/:id', (req, res, next) =>
  callIfFn(deletePackage, req, res, next),
);

// (Optional) Delete by credits (if your deletePackage supports it in controller)
// Keep as a separate path to avoid ambiguity with :id route above.
adminRouter.delete('/packages/by-credits/:credits', (req, res, next) =>
  callIfFn(deletePackage, req, res, next),
);

/* -------- Financials -------- */
// Legacy payments-only list
adminRouter.get('/transactions', (req, res, next) =>
  callIfFn(listTransactions, req, res, next),
);

// Unified feed: payments + withdrawals
adminRouter.get('/financials', (req, res, next) =>
  callIfFn(listFinancialFeed, req, res, next),
);

/* Receipts / Proof */
adminRouter.get('/proof', (req, res, next) =>
  callIfFn(proofOfFulfillment, req, res, next),
);
// Handy alias: /receipts/:captureId
adminRouter.get('/receipts/:captureId', (req, res, next) => {
  req.query.captureId = req.params.captureId;
  return callIfFn(proofOfFulfillment, req, res, next);
});

/* -------- Users (admin operations) -------- */
// List users
adminRouter.get('/users', (req, res, next) =>
  callIfFn(listUsers, req, res, next),
);

// Set role: { userId, role }
adminRouter.post('/users/role', (req, res, next) =>
  callIfFn(adminSetRole, req, res, next),
);

// Adjust tokens: { userId, delta } (or { amount })
adminRouter.post('/users/tokens', (req, res, next) =>
  callIfFn(adminAdjustTokens, req, res, next),
);

// Delete user by :id
adminRouter.delete('/users/:id', (req, res, next) =>
  callIfFn(adminDeleteUser, req, res, next),
);

// Reset password by :id
adminRouter.post('/users/:id/reset-password', (req, res, next) =>
  callIfFn(adminResetPassword, req, res, next),
);

// Impersonate user by :id (returns a JWT for that user)
adminRouter.post('/users/:id/impersonate', (req, res, next) =>
  callIfFn(adminImpersonateUser, req, res, next),
);

/* -------- Handyman verification approvals -------- */
adminRouter.get('/handyman-verifications', (req, res, next) =>
  callIfFn(listHandymanVerificationReviews, req, res, next),
);
adminRouter.patch('/handyman-verifications/:id', (req, res, next) =>
  callIfFn(reviewHandymanVerification, req, res, next),
);

/* -------- Orgs & Org Pricing -------- */
adminRouter.get('/orgs', adminListOrgs);
adminRouter.get('/orgs/:orgId/subscriptions', adminOrgSubscriptions);
adminRouter.post('/orgs/:orgId/upgrade', adminUpgradeOrg);

adminRouter.get('/org-pricing', adminGetOrgPricing);
adminRouter.post('/org-pricing', adminUpsertOrgPricing);
adminRouter.put('/org-pricing/:id', adminUpdateOrgPricing);

export default adminRouter;

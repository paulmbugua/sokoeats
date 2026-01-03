import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';

import pool from '../config/db.js';
import { requireOrgFeeAccess, requireOrgAdmin } from '../middleware/orgAccess.js';
import { setInstructorFeeAccess, getOrgFeeAccessStatus } from '../controllers/orgFeesController.js';

// In-memory fixtures
const memberships = new Map(); // key: `${orgId}:${userId}` -> role
const instructorState = new Map(); // key: `${orgId}:${userId}` -> { can_access_fees, fee_access_granted_by_user_id, fee_access_updated_at }

const key = (orgId, userId) => `${orgId}:${userId}`;

function setMembership(orgId, userId, role) {
  memberships.set(key(orgId, userId), role);
}

function setInstructorState(orgId, userId, canAccess) {
  instructorState.set(key(orgId, userId), {
    org_id: orgId,
    user_id: userId,
    can_access_fees: !!canAccess,
    fee_access_granted_by_user_id: null,
    fee_access_updated_at: null,
  });
}

function getDesignated(orgId) {
  for (const [k, v] of instructorState.entries()) {
    if (k.startsWith(`${orgId}:`) && v.can_access_fees) return v;
  }
  return null;
}

// Patch pool.query to use fixtures above
pool.query = async (sql, params = []) => {
  const text = typeof sql === 'string' ? sql : sql?.text || '';
  const normalized = text.trim();
  const lower = normalized.toLowerCase();

  if (text.includes("to_regclass('public.org_instructors')")) {
    return { rows: [{ t_instructors: 'org_instructors', t_profiles: null }], rowCount: 1 };
  }

  if (lower.includes('select role from org_memberships')) {
    const [orgId, userId] = params;
    const role = memberships.get(key(orgId, userId));
    return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
  }

  if (text.includes('COALESCE(i.can_access_fees')) {
    const [orgId, userId] = params;
    const role = memberships.get(key(orgId, userId));
    const instructor = instructorState.get(key(orgId, userId));
    return {
      rows: role ? [{ role, can_access_fees: instructor?.can_access_fees ?? false }] : [],
      rowCount: role ? 1 : 0,
    };
  }

  if (normalized.startsWith('update org_instructors') && text.includes('set can_access_fees=false')) {
    const [orgId, actorUserId] = params;
    for (const [k, v] of instructorState.entries()) {
      if (k.startsWith(`${orgId}:`)) {
        instructorState.set(k, {
          ...v,
          can_access_fees: false,
          fee_access_granted_by_user_id: actorUserId,
          fee_access_updated_at: new Date().toISOString(),
        });
      }
    }
    return { rows: [], rowCount: instructorState.size };
  }

  if (normalized.startsWith('update org_instructors') && text.includes('set can_access_fees=$3')) {
    const [orgId, userId, enabled, actorUserId] = params;
    const existing = instructorState.get(key(orgId, userId)) || {
      org_id: orgId,
      user_id: userId,
      can_access_fees: false,
      fee_access_granted_by_user_id: null,
      fee_access_updated_at: null,
    };
    instructorState.set(key(orgId, userId), {
      ...existing,
      can_access_fees: !!enabled,
      fee_access_granted_by_user_id: actorUserId,
      fee_access_updated_at: new Date().toISOString(),
    });
    return { rows: [], rowCount: 1 };
  }

  if (normalized.startsWith('insert into org_instructors')) {
    const [orgId, userId, enabled, actorUserId] = params;
    instructorState.set(key(orgId, userId), {
      org_id: orgId,
      user_id: userId,
      can_access_fees: !!enabled,
      fee_access_granted_by_user_id: actorUserId,
      fee_access_updated_at: new Date().toISOString(),
    });
    return { rows: [], rowCount: 1 };
  }

  if (text.includes('from org_instructors') && text.includes('can_access_fees is true')) {
    const [orgId] = params;
    const d = getDesignated(orgId);
    return d ? { rows: [{ user_id: d.user_id, fee_access_updated_at: d.fee_access_updated_at, fee_access_granted_by_user_id: d.fee_access_granted_by_user_id }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  if (
    normalized.toLowerCase().startsWith('begin') ||
    normalized.toLowerCase().startsWith('commit') ||
    normalized.toLowerCase().startsWith('rollback')
  ) {
    return { rows: [], rowCount: 0 };
  }

  throw new Error(`Unhandled query in test stub: ${text}`);
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const headerUserId = req.headers['x-user-id'];
    if (headerUserId) {
      req.user = { id: Number(headerUserId) };
    }
    next();
  });

  app.patch('/api/orgs/:orgId/instructors/:instructorUserId/fee-access', requireOrgAdmin, setInstructorFeeAccess);
  app.get('/api/orgs/:orgId/fee-access', getOrgFeeAccessStatus);
  app.get('/api/orgs/:orgId/fees/dummy', requireOrgFeeAccess, (_req, res) => res.json({ ok: true }));

  return app;
}

test('fee access grant/enforce flow', async () => {
  // Seed memberships and instructor rows
  setMembership('1', '10', 'admin');
  setMembership('1', '20', 'instructor');
  setMembership('1', '30', 'instructor');
  setInstructorState('1', '20', false);
  setInstructorState('1', '30', false);

  const app = buildApp();

  // Admin grants to instructor A (20)
  let res = await request(app)
    .patch('/api/orgs/1/instructors/20/fee-access')
    .set('x-user-id', '10')
    .send({ enabled: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.designatedInstructorId, '20');

  // Instructor A allowed
  res = await request(app).get('/api/orgs/1/fees/dummy').set('x-user-id', '20');
  assert.equal(res.status, 200);

  // Instructor B denied
  res = await request(app).get('/api/orgs/1/fees/dummy').set('x-user-id', '30');
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'ORG_FEE_ACCESS_DENIED');

  // Admin denied
  res = await request(app).get('/api/orgs/1/fees/dummy').set('x-user-id', '10');
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'ORG_FEE_ACCESS_DENIED');

  // Grant to instructor B (revokes A)
  res = await request(app)
    .patch('/api/orgs/1/instructors/30/fee-access')
    .set('x-user-id', '10')
    .send({ enabled: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.designatedInstructorId, '30');

  // A revoked
  res = await request(app).get('/api/orgs/1/fees/dummy').set('x-user-id', '20');
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'ORG_FEE_ACCESS_DENIED');

  // B now allowed
  res = await request(app).get('/api/orgs/1/fees/dummy').set('x-user-id', '30');
  assert.equal(res.status, 200);
});


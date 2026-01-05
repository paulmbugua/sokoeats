import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';

import pool from '../config/db.js';
import {
  getOrgAssignments,
  getOrgAssignmentSubmissions,
  markOrgAssignmentOpened,
} from '../controllers/orgLegacyAssignmentsController.js';

const originalQuery = pool.query.bind(pool);

const memberships = new Set();
const assignments = new Map();
const assignmentViews = new Map();
const submissions = [];
const quizAttempts = [];
let clockCounter = 0;

function isoNow() {
  clockCounter += 1;
  return new Date(Date.UTC(2025, 0, 1, 0, 0, clockCounter)).toISOString();
}

function key(orgId, assignmentId, userId) {
  return `${orgId}:${assignmentId}:${userId}`;
}

function seedData() {
  memberships.clear();
  assignments.clear();
  assignmentViews.clear();
  submissions.length = 0;
  quizAttempts.length = 0;
  clockCounter = 0;

  memberships.add('org1:instructor-1');

  assignments.set('a-ai', {
    id: 'a-ai',
    org_id: 'org1',
    course_id: 'course1',
    title_override: 'AI Assignment',
    org_class_label: 'Grade 1',
    org_subject_key: 'math',
    attachment_url: null,
    invite_code: 'code-ai',
    source_kind: 'robot',
    kind: 'robot',
    created_at: '2025-01-01T00:00:00.000Z',
    due_at: null,
  });

  submissions.push({
    id: 'sub-1',
    org_id: 'org1',
    assignment_id: 'a-ai',
    submission_learner_id: 'learner-1',
    submission_user_id: 'learner-user-1',
    student_id: 'ADM001',
    answer_text: 'hello',
    attachment_url: null,
    submitted_at: '2025-01-02T00:00:00.000Z',
    learner_id: 'learner-1',
    learner_class_label: 'Grade 1',
    admission_number: 'ADM001',
    learner_admission_code: 'ADM001',
    learner_user_id: 'learner-user-1',
    learner_name: 'Alice Doe',
    learner_email: 'alice@example.com',
    learner_display_name: 'Alice Doe',
    learner_first_name: 'Alice',
    learner_last_name: 'Doe',
  });

  quizAttempts.push(
    {
      org_id: 'org1',
      assignment_id: 'a-ai',
      user_id: 'learner-user-1',
      score_pct: 40,
      submitted_at: '2025-01-02T01:00:00.000Z',
      status: 'submitted',
    },
    {
      org_id: 'org1',
      assignment_id: 'a-ai',
      user_id: 'learner-user-1',
      score_pct: 90,
      submitted_at: '2025-01-03T01:00:00.000Z',
      status: 'submitted',
    },
  );
}

async function fakeQuery(sql, params = []) {
  const text = typeof sql === 'string' ? sql : sql?.text || '';
  const normalized = text.trim().toLowerCase();

  if (normalized.startsWith('select 1 from org_memberships')) {
    const [orgId, userId] = params;
    const ok = memberships.has(`${orgId}:${userId}`);
    return { rows: ok ? [{ exists: true }] : [], rowCount: ok ? 1 : 0 };
  }

  if (normalized.startsWith('insert into org_assignment_views')) {
    const [orgId, assignmentId, userId] = params;
    const openedAt = isoNow();
    assignmentViews.set(key(orgId, assignmentId, userId), openedAt);
    return { rows: [{ opened_at: openedAt }], rowCount: 1 };
  }

  if (normalized.includes('from org_course_assignments') && normalized.includes('where id = $1')) {
    const [assignmentId] = params;
    const row = assignments.get(String(assignmentId));
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  if (
    normalized.startsWith('select') &&
    normalized.includes('from org_course_assignments a') &&
    normalized.includes('left join org_assignment_views')
  ) {
    const [orgId, userId] = params;
    const rows = Array.from(assignments.values())
      .filter((a) => String(a.org_id) === String(orgId))
      .map((a) => ({
        ...a,
        course_title: 'Course Title',
        submission_count: 1,
        latest_submission_at: '2025-01-02T00:00:00.000Z',
        opened_at: assignmentViews.get(key(orgId, a.id, userId)) || null,
      }));
    return { rows, rowCount: rows.length };
  }

  if (normalized.includes('from org_course_assignment_submissions s')) {
    const [orgId, assignmentId] = params;
    const rows = submissions
      .filter((s) => String(s.org_id) === String(orgId) && String(s.assignment_id) === String(assignmentId))
      .map((s) => ({
        ...s,
      }));
    return { rows, rowCount: rows.length };
  }

  if (normalized.includes('from org_quiz_attempts qa')) {
    const [orgId, assignmentId, userIds] = params;
    const filtered = quizAttempts.filter(
      (a) =>
        String(a.org_id) === String(orgId) &&
        String(a.assignment_id) === String(assignmentId) &&
        a.status === 'submitted' &&
        userIds?.includes?.(a.user_id),
    );

    const grouped = new Map();
    for (const att of filtered) {
      const arr = grouped.get(att.user_id) || [];
      arr.push(att);
      grouped.set(att.user_id, arr);
    }

    const rows = Array.from(grouped.entries()).map(([user_id, attempts]) => {
      attempts.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      const latest = attempts[0];
      return {
        user_id,
        attempts_count: attempts.length,
        last_attempt_at: latest.submitted_at,
        latest_score_pct: latest.score_pct,
      };
    });

    return { rows, rowCount: rows.length };
  }

  throw new Error(`Unhandled query in test stub: ${text}`);
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.headers['x-user-id'] || 'instructor-1';
    req.user = { id: userId };
    next();
  });

  app.post('/api/orgs/:orgId/assignments/:assignmentId/open', markOrgAssignmentOpened);
  app.get('/api/orgs/:orgId/assignments', getOrgAssignments);
  app.get('/api/orgs/:orgId/assignments/:assignmentId/submissions', getOrgAssignmentSubmissions);

  return app;
}

test.beforeEach(() => {
  seedData();
  pool.query = fakeQuery;
});

test.afterEach(() => {
  pool.query = originalQuery;
});

test('marks assignment opened and avoids duplicates', async () => {
  const app = buildApp();

  const first = await request(app)
    .post('/api/orgs/org1/assignments/a-ai/open')
    .set('x-user-id', 'instructor-1');

  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.ok(first.body.opened_at);
  assert.equal(assignmentViews.size, 1);

  const second = await request(app)
    .post('/api/orgs/org1/assignments/a-ai/open')
    .set('x-user-id', 'instructor-1');

  assert.equal(second.status, 200);
  assert.equal(second.body.ok, true);
  assert.equal(assignmentViews.size, 1);
});

test('assignment list returns opened_at for viewer', async () => {
  const app = buildApp();

  await request(app)
    .post('/api/orgs/org1/assignments/a-ai/open')
    .set('x-user-id', 'instructor-1');

  const res = await request(app)
    .get('/api/orgs/org1/assignments?view=instructor')
    .set('x-user-id', 'instructor-1');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.data?.[0].opened_at, 'opened_at should be returned for instructor');
});

test('submissions include learner identity and AI score metadata', async () => {
  const app = buildApp();

  const res = await request(app)
    .get('/api/orgs/org1/assignments/a-ai/submissions')
    .set('x-user-id', 'instructor-1');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const submission = res.body.submissions?.[0];
  assert.ok(submission, 'submission should be present');
  assert.equal(submission.admission_number, 'ADM001');
  assert.equal(submission.learner_display_name, 'Alice Doe');
  assert.equal(submission.learner_email, 'alice@example.com');

  assert.equal(submission.ai_final_score, 90);
  assert.equal(submission.ai_attempts_count, 2);
  assert.equal(submission.ai_last_attempt_at, '2025-01-03T01:00:00.000Z');
});

import axios from 'axios';
import type {
  CurrentUser,
  OrgInviteInfo,
  EnsureShareBody,
  EnsureShareResp,
  OrgTier,
  OrgCycle,
  AcceptInviteResp,
  FeeAccessStatus,
} from '@mytutorapp/shared/types';

function baseUrl(u: string) {
  return u.replace(/\/+$/, '');
}
function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function clientPlatformHeader() {
  const isNative = typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative';
  return { 'x-client-platform': isNative ? 'native' : 'web' };
}

/* ─────────────────────────────────────────────────────────
 * Local shapes (light coupling to shared/types)
 * ───────────────────────────────────────────────────────── */
export type OrgResp = {
  id: string;
  name: string;
  slug?: string | null;

  tier?: OrgTier | null;
  seats?: number | null;

  owner_user_id?: number | string | null;
  owner_email?: string | null;

  logo_url?: string | null;
  signature_url?: string | null;
  certificate_title?: string | null;
  default_pass_mark?: number | null;
  quiz_time_limit_s?: number | null;
  allow_retry?: boolean | null;
  email_domain?: string | null;
  webhook_url?: string | null;
  webhook_enabled?: boolean | null;

  seats_used?: number | null;
  created_at?: string | null;
  updated_at?: string | null;

  [k: string]: any;
};

export type OrgAssignmentRow = {
  id: string | number;

  // Course linkage
  course_id?: string | number | null;
  courseId?: string;

  // Titles
  title?: string;
  title_override?: string | null;
  course_title?: string | null;

  // Config (for AI / quiz-style)
  pass_mark?: number | null;
  timer_s?: number | null;
  max_attempts?: number | null;

  // Org-specific metadata / targeting
  org_class_label?: string | null;
  org_subject_key?: string | null;

  // Legacy / file-based extras
  instructions?: string | null;
  attachment_url?: string | null;

  // Dates
  due_at?: string | null;
  created_at?: string | null;
  submitted_at?: string | null; // learner “my last submission” if backend wants

  // Sharing / source
  invite_code?: string | null;
  source_kind?: string | null; // 'legacy' | 'robot' | 'exam' | ...

  // Status (optional – up to backend)
  status?: string | null;
};

// ─────────────────────────────────────────────────────────
// Org Pricing (portal display)
// ─────────────────────────────────────────────────────────
export type OrgTierKey = 'starter' | 'pro' | 'enterprise';
export type OrgCurrency = 'USD' | 'KES';

export type OrgPricingTable = {
  currency: OrgCurrency;
  tiers: Record<OrgTierKey, { seats: number; monthly: number | null; yearly: number | null }>;
};

export type OrgAssignmentsResponse = {
  ok: boolean;
  data: OrgAssignmentRow[];
  view?: string;
  meta?: {
    class_label?: string | null;
    subject_key?: string | null;
    studentId?: string | null;
    learnerId?: number | null;
  };
};

export type OrgUsageResp = { seats_used: number };

export type OrgAnalyticsRow = {
  bucket: string;
  attempts: number;
  passes: number;
  avg_score: number | null;

  // optional camelCase variant (backend flexibility)
  avgScore?: number | null;

  // optional source descriptors
  source_kind?: string | null;
  source?: string | null;
  kind?: string | null;

  // optional per-source numeric fields (used by deriveAnalyticsSummary)
  exams_attempts?: number | null;
  exams_passes?: number | null;

  robot_attempts?: number | null;
  robot_passes?: number | null;

  assignment_attempts?: number | null;
  assignment_passes?: number | null;

  exam_cards_generated?: number | null;

  // future-proofing
  [k: string]: any;
};

export type OrgAnalyticsResponse = {
  ok: boolean;
  data: OrgAnalyticsRow[];

  // optional summary/meta block used by OrgElearnPortal.loadAnalytics
  summary?: {
    totalAttempts?: number;
    totalPasses?: number;
    overallPassRate?: number;
    overallAvgScore?: number;

    examsAttempts?: number;
    examsPasses?: number;
    examsPassRate?: number;

    robotQuizAttempts?: number;
    robotQuizPasses?: number;
    robotQuizPassRate?: number;

    assignmentAttempts?: number;
    assignmentPasses?: number;
    assignmentPassRate?: number;

    examCardsGenerated?: number;

    [k: string]: any;
  } | null;

  // extra metadata if you ever want to push more info
  meta?: Record<string, any> | null;
};

export type CreateAssignmentBody = {
  courseId: string;
  title_override?: string | null;
  pass_mark?: number | null;
  timer_s?: number | null;
  due_at?: string | null;
  max_attempts?: number | null;
};

export type OrgLearnerProgressRow = {
  user_id: string | number;
  name: string | null;
  email: string | null;
  attempts: number;
  passes: number;
  avg_score: number | null;
  completed_assignments: number;
  last_submit_at: string | null;
  progress_pct: number;
};

export type OrgLearnersProgressResponse = {
  ok: boolean;
  total_assignments: number;
  data: OrgLearnerProgressRow[];
  next_cursor?: string | null;
};

/* ─────────────────────────────────────────────────────────
 * Subscriptions
 * ───────────────────────────────────────────────────────── */
export type OrgSubscribeMethod = 'MPESA' | 'PAYSTACK';
export type OrgSubscribeInitBody = {
  tier: Extract<OrgTier, 'pro' | 'enterprise'>;
  cycle: OrgCycle;
  method: OrgSubscribeMethod;
  phone?: string; // MPESA only
};
export type OrgSubscribeInitResp = {
  paymentId: string;
  method: OrgSubscribeMethod;
  quote: {
    amount_cents: number;
    currency: 'USD' | 'KES';
    tier: string;
    cycle: string;
  };
  checkoutRequestId?: string; // MPESA
  authorizationUrl?: string; // PAYSTACK
  reference?: string; // PAYSTACK
};

/* ─────────────────────────────────────────────────────────
 * Me / Org basics
 * ───────────────────────────────────────────────────────── */
export async function fetchCurrentUser(backendUrl: string, token: string): Promise<CurrentUser> {
  const url = `${baseUrl(backendUrl)}/api/user/me`;
  const res = await axios.get<CurrentUser>(url, { headers: authHeaders(token) });
  return res.data;
}

/** Resolve an assignment invite (public) */
export async function resolveOrgInvite(backendUrl: string, code: string): Promise<OrgInviteInfo> {
  const url = `${baseUrl(backendUrl)}/api/orgs/invite/${encodeURIComponent(code)}`;
  const res = await axios.get<OrgInviteInfo>(url);
  return res.data;
}

/** Accept an ASSIGNMENT invite (authenticated) */
export async function acceptOrgInvite(
  backendUrl: string,
  token: string,
  code: string
): Promise<AcceptInviteResp> {
  const url = `${baseUrl(backendUrl)}/api/orgs/accept-assignment`;
  const res = await axios.post<AcceptInviteResp>(url, { code }, { headers: authHeaders(token) });
  return res.data;
}

/** Seats used */
export async function getOrgUsage(
  backendUrl: string,
  token: string,
  orgId: string
): Promise<OrgUsageResp> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/usage`;
  const res = await axios.get<OrgUsageResp>(url, { headers: authHeaders(token) });
  return res.data;
}

/** Branding/settings */
export async function updateOrgBranding(
  backendUrl: string,
  token: string,
  orgId: string,
  body: Record<string, any>
): Promise<OrgResp> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/branding`;
  const res = await axios.put<OrgResp>(url, body, { headers: authHeaders(token) });
  return res.data;
}

/** Create/Upsert assignment (returns invite_code) */
export async function createOrgAssignment(
  backendUrl: string,
  token: string,
  orgId: string,
  body: CreateAssignmentBody
): Promise<{ invite_code: string } & Record<string, any>> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/assignments`;
  const res = await axios.post(url, body, { headers: authHeaders(token) });
  return res.data;
}

/** Analytics */
export async function getOrgAnalytics(
  backendUrl: string,
  token: string,
  orgId: string,
  period: 'month' | 'term' | 'year' = 'month'
): Promise<OrgAnalyticsResponse> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(
    orgId
  )}/analytics?period=${encodeURIComponent(period)}`;
  const res = await axios.get<OrgAnalyticsResponse>(url, {
    headers: authHeaders(token),
  });
  return res.data;
}

/** Legacy stub upgrade */
export async function upgradeOrgTier(
  backendUrl: string,
  token: string,
  orgId: string,
  tier: OrgTier
): Promise<{ tier: OrgTier; seats: number }> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/upgrade`;
  const res = await axios.post(url, { tier }, { headers: authHeaders(token) });
  return res.data;
}

/** Report test */
export async function sendOrgReportTest(
  backendUrl: string,
  token: string,
  orgId: string,
  to?: string
): Promise<{ ok: boolean }> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/reports/test-send`;
  const res = await axios.post(url, { to }, { headers: authHeaders(token) });
  return res.data;
}

/** Report row */
export async function sendOrgReportRow(
  backendUrl: string,
  token: string,
  orgId: string,
  bucket: string,
  period: 'month' | 'term' | 'year'
): Promise<{ ok: boolean }> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/reports/send`;
  const res = await axios.post(url, { bucket, period }, { headers: authHeaders(token) });
  return res.data;
}

/** Primary org for current user */
export async function getMyOrg(backendUrl: string, token: string): Promise<OrgResp> {
  const url = `${baseUrl(backendUrl)}/api/orgs/mine`;
  const res = await axios.get(url, { headers: authHeaders(token) });
  const data = res.data;
  return (data && typeof data === 'object' && 'org' in data ? (data as any).org : data) as OrgResp;
}

export async function bootstrapOrg(backendUrl: string, token: string) {
  const url = `${baseUrl(backendUrl)}/api/orgs/bootstrap`;
  const { data } = await axios.post(url, {}, { headers: authHeaders(token) });
  return data;
}

export async function getMyOrgOrBootstrap(backendUrl: string, token: string) {
  try {
    const url = `${baseUrl(backendUrl)}/api/orgs/mine`;
    const { data } = await axios.get(url, { headers: authHeaders(token) });
    return data && typeof data === 'object' && 'org' in data ? (data as any).org : data;
  } catch (e: any) {
    if (e?.response?.status === 404) {
      const boot = await bootstrapOrg(backendUrl, token);
      return boot && typeof boot === 'object' && 'org' in boot ? (boot as any).org : boot;
    }
    throw e;
  }
}

/* ─────────────────────────────────────────────────────────
 * Subscriptions
 * ───────────────────────────────────────────────────────── */
export async function initOrgSubscription(
  backendUrl: string,
  token: string,
  orgId: string,
  body: OrgSubscribeInitBody
): Promise<OrgSubscribeInitResp> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/subscribe/init`;
  const res = await axios.post<OrgSubscribeInitResp>(url, body, {
    headers: {
      ...authHeaders(token),
      ...clientPlatformHeader(), // ✅ ADD THIS
    },
  });
  return res.data;
}

export function confirmOrgSubscription(
  backendUrl: string,
  token: string,
  paymentId: string
): Promise<{ ok: boolean; subscription: any }>;
export function confirmOrgSubscription(
  backendUrl: string,
  token: string,
  paymentId: string,
  provider_reference: string
): Promise<{ ok: boolean; subscription: any }>;

export async function confirmOrgSubscription(
  backendUrl: string,
  token: string,
  paymentId: string,
  provider_reference?: string
): Promise<{ ok: boolean; subscription: any }> {
  const url = `${baseUrl(backendUrl)}/api/orgs/subscriptions/${encodeURIComponent(
    paymentId
  )}/confirm`;
  const res = await axios.post(url, provider_reference ? { provider_reference } : {}, {
    headers: authHeaders(token),
  });
  return res.data;
}

/* ─────────────────────────────────────────────────────────
 * Analytics: learners progress
 * ───────────────────────────────────────────────────────── */
export async function getOrgLearnersProgress(
  backendUrl: string,
  token: string,
  orgId: string,
  opts?: { q?: string; limit?: number; cursor?: string }
): Promise<OrgLearnersProgressResponse> {
  const url = new URL(
    `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/learners/progress`
  );
  if (opts?.q) url.searchParams.set('q', String(opts.q));
  if (opts?.limit) url.searchParams.set('limit', String(opts.limit));
  if (opts?.cursor) url.searchParams.set('cursor', String(opts.cursor));
  const res = await axios.get<OrgLearnersProgressResponse>(url.toString(), {
    headers: authHeaders(token),
  });
  return res.data;
}

/* ─────────────────────────────────────────────────────────
 * Roster & Membership Invites
 * ───────────────────────────────────────────────────────── */
export async function getOrgRoster(backendUrl: string, token: string, orgId: string) {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/roster`;
  const res = await axios.get(url, { headers: authHeaders(token) });
  return res.data as {
    instructors: { id: number | string; name?: string; email?: string }[];
    learners: { id: number | string; name?: string; email?: string }[];
  };
}

// CREATE **membership** invite (your InviteModal uses this)
export async function createOrgMembershipInvite(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: { role: 'instructor' | 'learner'; email?: string; expiresSec?: number }
) {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/invites`;
  const res = await axios.post(url, payload, { headers: authHeaders(token) });
  // { ok, invite_code, invite_url }
  return res.data as { ok: boolean; invite_code: string; invite_url: string };
}

// ACCEPT **membership** invite → /accept-membership (updated)
export async function acceptOrgMembershipInvite(backendUrl: string, token: string, code: string) {
  const url = `${baseUrl(backendUrl)}/api/orgs/accept-membership`;
  const res = await axios.post(url, { code }, { headers: authHeaders(token) });
  // { ok, orgId, role }
  return res.data as { ok: boolean; orgId: string; role: 'instructor' | 'learner' };
}

// one-button share for ASSIGNMENTS (must be a **named export**)
export async function ensureOrgShareableAssignment(
  backendUrl: string,
  token: string,
  orgId: string,
  body: EnsureShareBody
): Promise<EnsureShareResp> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/share`;
  const res = await axios.post<EnsureShareResp>(url, body, {
    headers: authHeaders(token),
  });
  return res.data;
}

export async function removeOrgMember(
  backendUrl: string,
  token: string,
  orgId: string,
  userId: string | number
) {
  const url = `${baseUrl(
    backendUrl
  )}/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(String(userId))}`;
  const res = await axios.delete(url, { headers: authHeaders(token) });
  return res.data as { ok: boolean };
}

/** List assignments for this org (admin/instructor or generic viewer) */
export async function getOrgAssignments(
  backendUrl: string,
  token: string,
  orgId: string,
  opts?: {
    view?: 'admin' | 'instructor' | 'learner';
    studentId?: string | number;
    q?: string;
  }
): Promise<OrgAssignmentsResponse> {
  const url = new URL(`${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/assignments`);

  if (opts?.view) {
    url.searchParams.set('view', String(opts.view));
  }
  if (opts?.studentId != null && opts?.studentId !== '') {
    url.searchParams.set('studentId', String(opts.studentId));
  }
  if (opts?.q) {
    url.searchParams.set('q', String(opts.q));
  }

  const res = await axios.get(url.toString(), {
    headers: authHeaders(token),
  });

  // assume backend returns { ok, data: [...] }
  return res.data as OrgAssignmentsResponse;
}

export async function getOrgAssignmentsForLearner(
  backendUrl: string,
  token: string,
  orgId: string,
  opts?: {
    studentId?: string;
    classLabel?: string;
    subjectKey?: string;
  }
): Promise<OrgAssignmentsResponse> {
  const url = new URL(`${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/assignments`);

  // learner-only view
  url.searchParams.set('view', 'learner');

  if (opts?.studentId) {
    url.searchParams.set('studentId', opts.studentId);
  }

  // allow both old & new param names, backend supports both
  if (opts?.classLabel) {
    url.searchParams.set('class', opts.classLabel);
    url.searchParams.set('class_label', opts.classLabel);
  }

  if (opts?.subjectKey) {
    url.searchParams.set('subject', opts.subjectKey);
    url.searchParams.set('subject_key', opts.subjectKey);
  }

  const finalUrl = url.toString();

  console.log('[orgApi:getOrgAssignmentsForLearner] request', {
    backendUrl: baseUrl(backendUrl),
    orgId,
    studentId: opts?.studentId ?? null,
    classLabel: opts?.classLabel ?? null,
    subjectKey: opts?.subjectKey ?? null,
    finalUrl,
  });

  try {
    const res = await axios.get<OrgAssignmentsResponse>(finalUrl, {
      headers: authHeaders(token),
    });

    const data = res.data;
    const count = Array.isArray(data?.data) ? data.data.length : 0;

    console.log('[orgApi:getOrgAssignmentsForLearner] response', {
      status: res.status,
      view: data.view,
      count,
      sampleIds: (data?.data ?? []).slice(0, 5).map((row: any) => row.id),
    });

    return data;
  } catch (e: any) {
    console.error('[orgApi:getOrgAssignmentsForLearner] error', {
      message: e?.message,
      status: e?.response?.status,
      data: e?.response?.data,
    });
    throw e;
  }
}

/* ─────────────────────────────────────────────────────────
 * Learner Attendance
 * ───────────────────────────────────────────────────────── */
export type OrgLearnerAttendanceBody = {
  termId: string;
  lessonsHeld?: number | null;
  lessonsAttended?: number | null;
  behaviorRating?: number | null;
  punctualityRating?: number | null;
  teacherComment?: string | null;
};

export async function saveOrgLearnerAttendance(
  backendUrl: string,
  token: string,
  orgId: string,
  learnerId: number | string,
  body: {
    termId: string;
    // sessionId?: string;
    lessonsHeld: number | null;
    lessonsAttended: number | null;
    behaviorRating: number | null;
    punctualityRating: number | null;
    teacherComment: string | null;
  }
) {
  const url = `${backendUrl}/api/orgs/${orgId}/learners/${learnerId}/attendance`;

  console.log('[orgApi] saveOrgLearnerAttendance →', { url, body });

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error('[orgApi] saveOrgLearnerAttendance error response', {
      status: resp.status,
      text,
    });
    throw new Error(`Failed to save attendance (${resp.status})`);
  }

  return resp.json().catch(() => ({}));
}

/* ─────────────────────────────────────────────────────────
 * Legacy (file-based) assignments
 * ───────────────────────────────────────────────────────── */

export type OrgLegacyAssignmentBody = {
  title: string;
  instructions?: string | null;
  class_label: string;
  subject_key: string;
  attachment_url?: string | null;
  due_at?: string | null;
};

export async function createOrgLegacyAssignment(
  backendUrl: string,
  token: string,
  orgId: string,
  body: OrgLegacyAssignmentBody
): Promise<OrgAssignmentRow> {
  const url = `${baseUrl(backendUrl)}/api/orgs/${encodeURIComponent(orgId)}/assignments/legacy`;

  console.log('[orgApi:createOrgLegacyAssignment] request', { url, body });

  const res = await axios.post<{ ok: boolean; assignment: OrgAssignmentRow }>(url, body, {
    headers: authHeaders(token),
  });

  console.log('[orgApi:createOrgLegacyAssignment] response', {
    status: res.status,
    ok: res.data?.ok,
    id: res.data?.assignment?.id,
  });

  return res.data.assignment;
}

/** Learner submits work for a legacy assignment */
export async function submitOrgLegacyAssignment(
  backendUrl: string,
  token: string,
  orgId: string,
  assignmentId: string | number,
  body: { answer_text?: string | null; attachment_url?: string | null }
): Promise<{ ok: boolean; submission: any }> {
  const url = `${baseUrl(
    backendUrl
  )}/api/orgs/${encodeURIComponent(orgId)}/assignments/${encodeURIComponent(
    String(assignmentId)
  )}/legacy/submit`;

  console.log('[orgApi:submitOrgLegacyAssignment] request', {
    url,
    assignmentId,
    body,
  });

  const res = await axios.post<{ ok: boolean; submission: any }>(url, body, {
    headers: authHeaders(token),
  });

  console.log('[orgApi:submitOrgLegacyAssignment] response', {
    status: res.status,
    ok: res.data?.ok,
    submissionId: res.data?.submission?.id,
  });

  return res.data;
}

export async function getOrgAssignmentSubmissions(
  backendUrl: string,
  token: string,
  orgId: string,
  assignmentId: string | number
): Promise<{ ok: boolean; assignment: any; submissions: any[] }> {
  const url = `${baseUrl(
    backendUrl
  )}/api/orgs/${encodeURIComponent(orgId)}/assignments/${encodeURIComponent(
    String(assignmentId)
  )}/submissions`;

  const res = await axios.get(url, { headers: authHeaders(token) });
  return res.data;
}

/** Public pricing table for portal display (no auth) */
export async function fetchOrgPricingTable(
  backendUrl: string,
  currency: 'USD' | 'KES',
  token?: string
) {
  const base = String(backendUrl || '').replace(/\/+$/, '');
  const url = `${base}/api/orgs/pricing`;

  const r = await axios.get(url, {
    params: { currency },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return r.data;
}

export async function apiListOrgClassLabels(
  backendUrl: string,
  orgId: string,
  orgToken?: string,
): Promise<{ items: Array<{ class_label: string; learners: number; with_emails: number }> }> {
  const url = `${backendUrl}/api/orgs/${encodeURIComponent(orgId)}/class-labels`;

  const { data } = await axios.get(url, {
    headers: orgToken ? { Authorization: `Bearer ${orgToken}` } : undefined,
  });

  // normalize numbers (PG can return strings depending on driver)
  return {
    items: (data?.items || []).map((r: any) => ({
      class_label: String(r.class_label || ''),
      learners: Number(r.learners || 0),
      with_emails: Number(r.with_emails || 0),
    })),
  };
}

export async function getOrgFeeAccessStatus(
  backendUrl: string,
  token: string,
  orgId: string | number,
): Promise<FeeAccessStatus> {
  const base = baseUrl(backendUrl);
  const resp = await fetch(`${base}/api/orgs/${orgId}/fee-access`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) {
    let message = `Failed to load fee access (status ${resp.status})`;
    try {
      const data: any = await resp.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return resp.json();
}

export async function setOrgInstructorFeeAccess(
  backendUrl: string,
  token: string,
  orgId: string | number,
  instructorUserId: string | number,
  enabled: boolean,
): Promise<{ ok: boolean; designatedInstructorId: string | number | null }> {
  const base = baseUrl(backendUrl);
  const resp = await fetch(`${base}/api/orgs/${orgId}/instructors/${instructorUserId}/fee-access`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled }),
  });

  if (!resp.ok) {
    let message = `Failed to set fee access (status ${resp.status})`;
    try {
      const data: any = await resp.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return resp.json();
}
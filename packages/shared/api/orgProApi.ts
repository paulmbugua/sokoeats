// packages/shared/api/orgProApi.ts
import axios from 'axios';
import type {
  OrgAttendanceSession,
  OrgAttendanceEntry,
  OrgFeeCharge,
  OrgFeePayment,
  OrgFeeStatement,
  OrgAnnouncement,
} from '@mytutorapp/shared/types';

/* ─────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────── */

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function axiosCfg(token?: string) {
  // backend uses Bearer-only today; keep withCredentials harmless
  return {
    headers: authHeaders(token),
    withCredentials: true,
  };
}

function apiBaseFromEnv() {
  return (process.env.EXPO_PUBLIC_API_URL ||
    process.env.VITE_API_URL ||
    process.env.API_URL ||
    '').replace(/\/+$/, '');
}

// ✅ Pro tools are mounted under /api/orgs/:orgId/...
function orgProBase(backendUrl: string | undefined, orgId: string) {
  const base = (backendUrl?.trim() || apiBaseFromEnv()).replace(/\/+$/, '');
  return `${base}/api/orgs/${orgId}`;
}

function looksLikeJwt(v: any) {
  const s = String(v || '');
  return s.split('.').length === 3 && s.length > 20;
}

function orgFeesBase(backendUrl: string | undefined, orgId: string) {
  const base = (backendUrl?.trim() || apiBaseFromEnv()).replace(/\/+$/, '');
  return `${base}/api/orgs/${orgId}`;
}

/**
 * ✅ Newsletters are mounted under /api/org/:orgId/... (SINGULAR)
 * Backend routes:
 *  - /api/org/:orgId/pro/newsletters...
 *  - /api/org/:orgId/learner/newsletters...
 */
function orgNewsletterProBase(backendUrl: string | undefined, orgId: string) {
  const base = (backendUrl?.trim() || apiBaseFromEnv()).replace(/\/+$/, '');
  return `${base}/api/org/${orgId}/pro`;
}

function orgNewsletterLearnerBase(backendUrl: string | undefined, orgId: string) {
  const base = (backendUrl?.trim() || apiBaseFromEnv()).replace(/\/+$/, '');
  return `${base}/api/org/${orgId}`;
}

/* ─────────────────────────────────────────────────────────
 * Attendance
 * ───────────────────────────────────────────────────────── */

export async function apiCreateAttendanceSession(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgAttendanceSession>,
  orgToken?: string,
): Promise<OrgAttendanceSession> {
  const { data } = await axios.post(
    `${orgProBase(backendUrl, orgId)}/attendance/sessions`,
    payload,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiSaveAttendanceEntries(
  backendUrl: string,
  orgId: string,
  sessionId: number,
  entries: OrgAttendanceEntry[],
  orgToken?: string,
): Promise<{ ok: boolean }> {
  const { data } = await axios.post(
    `${orgProBase(backendUrl, orgId)}/attendance/entries`,
    { session_id: sessionId, entries },
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiGetAttendanceReport(
  backendUrl: string,
  orgId: string,
  params: { start?: string; end?: string; class_label?: string },
  orgToken?: string,
): Promise<{ sessions: OrgAttendanceSession[]; summary: Record<string, number> }> {
  const { data } = await axios.get(
    `${orgProBase(backendUrl, orgId)}/attendance/report`,
    { ...axiosCfg(orgToken), params },
  );
  return data;
}

/* ─────────────────────────────────────────────────────────
 * Fees & balances (PRO / instructor tools)
 * ───────────────────────────────────────────────────────── */

export async function apiCreateFeeCharge(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgFeeCharge>,
  orgToken?: string,
): Promise<OrgFeeCharge> {
  const { data } = await axios.post(
    `${orgFeesBase(backendUrl, orgId)}/fees/charges`,
    payload,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiBulkFeeCharges(
  backendUrl: string,
  orgId: string,
  payload: {
    learner_ids: string[];
    amount_cents: number;
    currency?: string;
    description?: string;
    class_label?: string;
    due_date?: string;
  },
  orgToken?: string,
): Promise<{ inserted: OrgFeeCharge[]; failed?: { learner_id: string; reason: string }[] }> {
  const { data } = await axios.post(
    `${orgFeesBase(backendUrl, orgId)}/fees/charges/bulk`,
    payload,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiRecordFeePayment(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgFeePayment>,
  orgToken?: string,
): Promise<OrgFeePayment> {
  const { data } = await axios.post(
    `${orgFeesBase(backendUrl, orgId)}/fees/payments`,
    payload,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiGetFeeBalances(
  backendUrl: string,
  orgId: string,
  orgToken?: string,
): Promise<{ balances: { learner_id: string; charges: number; payments: number; balance: number }[] }> {
  const { data } = await axios.get(
    `${orgFeesBase(backendUrl, orgId)}/fees/balances`,
    axiosCfg(orgToken),
  );
  return data;
}

/**
 * ✅ PRO statement (requires pro tier + instructor on backend routes)
 * GET /api/orgs/:orgId/fees/learners/:learnerId/statement
 */
export async function apiGetFeeStatement(
  backendUrl: string,
  orgId: string,
  a: string | number,
  b: string | number,
) {
  let token: string;
  let learnerId: string | number;

  if (looksLikeJwt(a) && !looksLikeJwt(b)) {
    token = String(a);
    learnerId = b;
  } else if (!looksLikeJwt(a) && looksLikeJwt(b)) {
    learnerId = a;
    token = String(b);
  } else {
    // fallback to common old order (learnerId, token)
    learnerId = a;
    token = String(b);
  }

  if (!looksLikeJwt(token)) {
    throw new Error(
      `Invalid auth token passed to apiGetFeeStatement (got: "${String(token).slice(0, 30)}...")`,
    );
  }

  const url = `${orgFeesBase(backendUrl, orgId)}/fees/learners/${encodeURIComponent(
    String(learnerId),
  )}/statement`;

  const r = await axios.get(url, axiosCfg(token));
  return r.data;
}

/**
 * ✅ Convenience: URL only (use for <a href>, iframe, window.open)
 */
export function apiGetFeeStatementPdfUrl(
  backendUrl: string,
  orgId: string,
  learnerId: string | number,
) {
  return `${orgFeesBase(backendUrl, orgId)}/fees/learners/${encodeURIComponent(
    String(learnerId),
  )}/statement.pdf`;
}

/**
 * ✅ If you still want a Blob download helper
 */
export async function apiDownloadFeeStatementPdf(
  backendUrl: string,
  orgId: string,
  learnerId: string,
  orgToken?: string,
): Promise<Blob> {
  const { data } = await axios.get(
    `${orgFeesBase(backendUrl, orgId)}/fees/learners/${encodeURIComponent(learnerId)}/statement.pdf`,
    {
      ...axiosCfg(orgToken),
      responseType: 'blob',
    },
  );
  return data as Blob;
}

/* ─────────────────────────────────────────────────────────
 * Fees (Learner self-service)
 * ───────────────────────────────────────────────────────── */

export async function apiGetMyFeeStatement(backendUrl: string, orgId: string, token: string) {
  if (!looksLikeJwt(token)) throw new Error('Invalid auth token for apiGetMyFeeStatement');
  const url = `${orgFeesBase(backendUrl, orgId)}/fees/learner/statement`;
  const r = await axios.get(url, axiosCfg(token));
  return r.data;
}

export async function apiGetMyFeeStructure(backendUrl: string, orgId: string, token: string) {
  if (!looksLikeJwt(token)) throw new Error('Invalid auth token for apiGetMyFeeStructure');
  const url = `${orgFeesBase(backendUrl, orgId)}/fees/learner/structure`;
  const r = await axios.get(url, axiosCfg(token));
  return r.data;
}

/* ─────────────────────────────────────────────────────────
 * Newsletters ✅ /api/org/:orgId/pro/... (staff) & /api/org/:orgId/learner/... (learner)
 * ───────────────────────────────────────────────────────── */

export type OrgNewsletter = {
  id: string; // uuid
  org_id: string;
  term_label?: string | null;
  title: string;
  content_md: string;
  status: 'draft' | 'sending' | 'sent' | 'archived';
  class_label?: string | null;
  created_at: string;
  updated_at: string;
  sent_at?: string | null;
};

export type NewsletterSendMode = 'all' | 'class' | 'custom';

export type NewsletterChannel = 'in_app' | 'email' | 'both';

export type PreviewNewsletterRecipientsReq = {
  mode?: NewsletterSendMode;
  class_label?: string;
  recipients?: string[];
  channel?: NewsletterChannel;
};

export type SendNewsletterReq = {
  mode?: NewsletterSendMode;
  class_label?: string;
  recipients?: string[];
  channel?: NewsletterChannel;
  pdf_base64?: string | null;
};

export type OrgNewsletterRecipientsResp = {
  items: Array<{
    recipient_email: string;
    delivered: boolean;
    delivered_at?: string | null;
    error?: string | null;
    created_at: string;
  }>;
  summary: { total: number; delivered: number; failed: number };
};

export async function apiListOrgNewsletters(
  backendUrl: string,
  orgId: string,
  orgToken?: string,
): Promise<{ items: OrgNewsletter[] }> {
  const { data } = await axios.get(
    `${orgNewsletterProBase(backendUrl, orgId)}/newsletters`,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiCreateOrgNewsletter(
  backendUrl: string,
  orgId: string,
  body: { term_label?: string; title: string },
  orgToken?: string,
): Promise<OrgNewsletter> {
  const { data } = await axios.post(
    `${orgNewsletterProBase(backendUrl, orgId)}/newsletters`,
    body,
    axiosCfg(orgToken),
  );
  return data;
}

export type NewsletterGenerated = {
  content_md: string;
  titleSuggestion: string;
  sections: Array<{ heading: string; bullets?: string[]; paragraphs?: string[] }>;
  closing: string;
  ai_fallback?: boolean;
  ai_error?: string;
};

export async function apiGenerateOrgNewsletterContent(
  backendUrl: string,
  orgId: string,
  body: { term_label?: string; title?: string; notes?: string },
  orgToken?: string,
): Promise<NewsletterGenerated> {
  const { data } = await axios.post(
    `${orgNewsletterProBase(backendUrl, orgId)}/newsletters/generate`,
    body,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiGetOrgNewsletter(
  backendUrl: string,
  orgId: string,
  id: string,
  orgToken?: string,
): Promise<OrgNewsletter> {
  const { data } = await axios.get(
    `${orgNewsletterProBase(backendUrl, orgId)}/newsletters/${id}`,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiUpdateOrgNewsletter(
  backendUrl: string,
  orgId: string,
  id: string,
  body: Partial<Pick<OrgNewsletter, 'content_md' | 'title' | 'term_label' | 'status' | 'class_label'>>,
  orgToken?: string,
): Promise<OrgNewsletter> {
  const { data } = await axios.put(
    `${orgNewsletterProBase(backendUrl, orgId)}/newsletters/${id}`,
    body,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiPreviewNewsletterRecipients(
  backendUrl: string,
  orgId: string,
  id: string,
  body: PreviewNewsletterRecipientsReq,
  orgToken?: string,
): Promise<{ count: number; sample: string[] }> {
  const { data } = await axios.post(
    `${orgNewsletterProBase(backendUrl, orgId)}/newsletters/${id}/preview-recipients`,
    body,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiListNewsletterRecipients(
  backendUrl: string,
  orgId: string,
  id: string,
  orgToken?: string,
): Promise<OrgNewsletterRecipientsResp> {
  const { data } = await axios.get(
    `${orgNewsletterProBase(backendUrl, orgId)}/newsletters/${id}/recipients`,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiSendOrgNewsletter(
  backendUrl: string,
  orgId: string,
  id: string,
  body: SendNewsletterReq,
  orgToken?: string,
): Promise<OrgNewsletter> {
  const { data } = await axios.post(
    `${orgNewsletterProBase(backendUrl, orgId)}/newsletters/${id}/send`,
    body,
    axiosCfg(orgToken),
  );
  return data;
}

/* ─────────────────────────────────────────────────────────
 * Announcements
 * ───────────────────────────────────────────────────────── */

export async function apiCreateAnnouncement(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgAnnouncement>,
  orgToken?: string,
): Promise<OrgAnnouncement> {
  const { data } = await axios.post(
    `${orgProBase(backendUrl, orgId)}/announcements`,
    payload,
    axiosCfg(orgToken),
  );
  return data;
}

export async function apiListAnnouncements(
  backendUrl: string,
  orgId: string,
  audience: string,
  orgToken?: string,
): Promise<{ items: OrgAnnouncement[] }> {
  const { data } = await axios.get(
    `${orgProBase(backendUrl, orgId)}/announcements`,
    { ...axiosCfg(orgToken), params: { audience } },
  );
  return data;
}

/* ─────────────────────────────────────────────────────────
 * Learner newsletters (learner-side) ✅ /api/org/:orgId/learner/...
 * ───────────────────────────────────────────────────────── */

export async function apiListLearnerNewsletters(
  backendUrl: string,
  orgId: string,
  token?: string,
) {
  const res = await fetch(`${orgNewsletterLearnerBase(backendUrl, orgId)}/learner/newsletters`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGetLearnerNewsletter(
  backendUrl: string,
  orgId: string,
  id: string,
  token?: string,
) {
  const res = await fetch(
    `${orgNewsletterLearnerBase(backendUrl, orgId)}/learner/newsletters/${id}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function apiGetMyFeeStatementPdfUrl(backendUrl: string, orgId: string) {
  return `${orgFeesBase(backendUrl, orgId)}/fees/learner/statement.pdf`;
}

export async function apiDownloadMyFeeStatementPdf(
  backendUrl: string,
  orgId: string,
  token: string,
): Promise<Blob> {
  if (!looksLikeJwt(token)) throw new Error('Invalid auth token for apiDownloadMyFeeStatementPdf');
  const { data } = await axios.get(apiGetMyFeeStatementPdfUrl(backendUrl, orgId), {
    ...axiosCfg(token),
    responseType: 'blob',
  });
  return data as Blob;
}

export function apiGetMyFeeStructurePdfUrl(backendUrl: string, orgId: string) {
  return `${orgFeesBase(backendUrl, orgId)}/fees/learner/structure.pdf`;
}

export async function apiDownloadMyFeeStructurePdf(
  backendUrl: string,
  orgId: string,
  token: string,
): Promise<Blob> {
  if (!looksLikeJwt(token)) throw new Error('Invalid auth token for apiDownloadMyFeeStructurePdf');
  const { data } = await axios.get(apiGetMyFeeStructurePdfUrl(backendUrl, orgId), {
    ...axiosCfg(token),
    responseType: 'blob',
  });
  return data as Blob;
}


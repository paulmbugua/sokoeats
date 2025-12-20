// packages/shared/api/orgProApi.ts
import axios from 'axios';
import type {
  OrgAttendanceSession,
  OrgAttendanceEntry,
  OrgFeeCharge,
  OrgFeePayment,
  OrgFeeStatement,
  OrgNewsletter,
  OrgAnnouncement,
} from '@mytutorapp/shared/types';

function url(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Attendance
export async function apiCreateAttendanceSession(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgAttendanceSession>,
  token?: string,
): Promise<OrgAttendanceSession> {
  const { data } = await axios.post(
    url(backendUrl, `/api/orgs/${orgId}/attendance/sessions`),
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function apiSaveAttendanceEntries(
  backendUrl: string,
  orgId: string,
  sessionId: number,
  entries: OrgAttendanceEntry[],
  token?: string,
): Promise<{ ok: boolean }> {
  const { data } = await axios.post(
    url(backendUrl, `/api/orgs/${orgId}/attendance/entries`),
    { session_id: sessionId, entries },
    { headers: authHeaders(token) },
  );
  return data;
}

export async function apiGetAttendanceReport(
  backendUrl: string,
  orgId: string,
  params: { start?: string; end?: string; class_label?: string },
  token?: string,
): Promise<{ sessions: OrgAttendanceSession[]; summary: Record<string, number> }> {
  const { data } = await axios.get(url(backendUrl, `/api/orgs/${orgId}/attendance/report`), {
    params,
    headers: authHeaders(token),
  });
  return data;
}

// Fees & balances
export async function apiCreateFeeCharge(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgFeeCharge>,
  token?: string,
): Promise<OrgFeeCharge> {
  const { data } = await axios.post(
    url(backendUrl, `/api/orgs/${orgId}/fees/charges`),
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function apiBulkFeeCharges(
  backendUrl: string,
  orgId: string,
  payload: { learner_ids: string[]; amount_cents: number; currency?: string; description?: string; class_label?: string; due_date?: string },
  token?: string,
): Promise<{ inserted: OrgFeeCharge[] }> {
  const { data } = await axios.post(
    url(backendUrl, `/api/orgs/${orgId}/fees/charges/bulk`),
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function apiRecordFeePayment(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgFeePayment>,
  token?: string,
): Promise<OrgFeePayment> {
  const { data } = await axios.post(
    url(backendUrl, `/api/orgs/${orgId}/fees/payments`),
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function apiGetFeeBalances(
  backendUrl: string,
  orgId: string,
  token?: string,
): Promise<{ balances: { learner_id: string; charges: number; payments: number; balance: number }[] }> {
  const { data } = await axios.get(url(backendUrl, `/api/orgs/${orgId}/fees/balances`), {
    headers: authHeaders(token),
  });
  return data;
}

export async function apiGetFeeStatement(
  backendUrl: string,
  orgId: string,
  learnerId: string,
  token?: string,
): Promise<OrgFeeStatement> {
  const { data } = await axios.get(
    url(backendUrl, `/api/orgs/${orgId}/fees/learners/${learnerId}/statement`),
    { headers: authHeaders(token) },
  );
  return data;
}

// Newsletters
export async function apiCreateNewsletter(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgNewsletter>,
  token?: string,
): Promise<OrgNewsletter> {
  const { data } = await axios.post(url(backendUrl, `/api/orgs/${orgId}/newsletters`), payload, {
    headers: authHeaders(token),
  });
  return data;
}

export async function apiGenerateNewsletter(
  backendUrl: string,
  orgId: string,
  payload: { term_label?: string; title?: string; notes?: string },
  token?: string,
): Promise<{ content_md: string }> {
  const { data } = await axios.post(
    url(backendUrl, `/api/orgs/${orgId}/newsletters/generate`),
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function apiSaveNewsletter(
  backendUrl: string,
  orgId: string,
  id: number,
  payload: Partial<OrgNewsletter>,
  token?: string,
): Promise<OrgNewsletter> {
  const { data } = await axios.put(
    url(backendUrl, `/api/orgs/${orgId}/newsletters/${id}`),
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function apiSendNewsletter(
  backendUrl: string,
  orgId: string,
  id: number,
  recipients: string[],
  token?: string,
): Promise<OrgNewsletter> {
  const { data } = await axios.post(
    url(backendUrl, `/api/orgs/${orgId}/newsletters/${id}/send`),
    { recipients },
    { headers: authHeaders(token) },
  );
  return data;
}

export async function apiListNewsletters(
  backendUrl: string,
  orgId: string,
  token?: string,
): Promise<{ items: OrgNewsletter[] }> {
  const { data } = await axios.get(url(backendUrl, `/api/orgs/${orgId}/newsletters`), {
    headers: authHeaders(token),
  });
  return data;
}

// Announcements
export async function apiCreateAnnouncement(
  backendUrl: string,
  orgId: string,
  payload: Partial<OrgAnnouncement>,
  token?: string,
): Promise<OrgAnnouncement> {
  const { data } = await axios.post(url(backendUrl, `/api/orgs/${orgId}/announcements`), payload, {
    headers: authHeaders(token),
  });
  return data;
}

export async function apiListAnnouncements(
  backendUrl: string,
  orgId: string,
  audience: string,
  token?: string,
): Promise<{ items: OrgAnnouncement[] }> {
  const { data } = await axios.get(url(backendUrl, `/api/orgs/${orgId}/announcements`), {
    params: { audience },
    headers: authHeaders(token),
  });
  return data;
}

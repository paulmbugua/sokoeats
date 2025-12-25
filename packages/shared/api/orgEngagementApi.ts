// packages/shared/api/orgEngagementApi.ts
import axios from 'axios';
import type {
  OrgAnnouncement,
  OrgAttendanceReport,
  OrgAttendanceSession,
  OrgClub,
  OrgClubMembership,
  OrgMessageLog,
  OrgSportsEvent,
} from '@mytutorapp/shared/types';

/* ─────────────────────────────────────────────────────────
 * Helpers (match orgProApi style)
 * ───────────────────────────────────────────────────────── */

function pickArray(data: any, keys: string[]) {
  if (Array.isArray(data)) return data;
  for (const k of keys) {
    const v = data?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * ✅ Robust backend URL resolver (web + native + SSR)
 * - prefers explicit backendUrl
 * - supports window.__BACKEND_URL__
 * - supports Vite import.meta.env
 * - falls back to process.env (Expo / Node)
 */
function resolveBackendUrl(backendUrl?: string) {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : null;
  const pEnv = typeof process !== 'undefined' ? (process as any).env : null;

  const base =
    backendUrl ||
    w?.__BACKEND_URL__ ||
    metaEnv?.VITE_BACKEND_URL ||
    metaEnv?.VITE_API_URL ||
    pEnv?.EXPO_PUBLIC_API_URL ||
    pEnv?.VITE_API_URL ||
    pEnv?.API_URL ||
    '';

  return String(base || '').replace(/\/+$/, '');
}

function axiosCfg(token?: string) {
  // backend uses Bearer-only today; keep withCredentials harmless and consistent
  return {
    headers: authHeaders(token),
    withCredentials: true,
  };
}

// ✅ Engagement tools are mounted under /api/orgs/:orgId/...
function orgBase(backendUrl: string | undefined, orgId: string) {
  const base = resolveBackendUrl(backendUrl);
  return `${base}/api/orgs/${orgId}`;
}

/** ✅ Compatibility mapper (supports older UI payload keys) */
function normalizeAnnouncementPayload(payload: any) {
  const p = payload || {};

  // If caller already uses backend keys, keep them.
  // Otherwise accept older UI keys: is_pinned, visible_from, visible_to, kind
  const pinned =
    p.pinned ?? p.is_pinned ?? (typeof p.is_pinned === 'boolean' ? p.is_pinned : undefined);
  const start_at = p.start_at ?? p.visible_from ?? undefined;
  const end_at = p.end_at ?? p.visible_to ?? undefined;
  const category = p.category ?? p.kind ?? undefined;

  return {
    ...p,
    ...(pinned !== undefined ? { pinned } : null),
    ...(start_at !== undefined ? { start_at } : null),
    ...(end_at !== undefined ? { end_at } : null),
    ...(category !== undefined ? { category } : null),
  };
}

/* ─────────────────────────────────────────────────────────
 * Attendance
 * ───────────────────────────────────────────────────────── */

export async function listAttendanceSessions(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgAttendanceSession[]> {
  const { data } = await axios.get(`${orgBase(backendUrl, orgId)}/attendance/sessions`, {
    ...axiosCfg(token),
    params,
  });
  return pickArray(data, ['sessions', 'items', 'rows']);
}

export async function getAttendanceSession(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  sessionId: number,
): Promise<OrgAttendanceSession> {
  const { data } = await axios.get(
    `${orgBase(backendUrl, orgId)}/attendance/sessions/${sessionId}`,
    axiosCfg(token),
  );
  return data;
}

export async function createAttendanceSession(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  payload: Partial<OrgAttendanceSession>,
): Promise<OrgAttendanceSession> {
  const { data } = await axios.post(
    `${orgBase(backendUrl, orgId)}/attendance/sessions`,
    payload,
    axiosCfg(token),
  );
  return data;
}

export async function updateAttendanceSession(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  sessionId: number,
  payload: Partial<OrgAttendanceSession>,
): Promise<OrgAttendanceSession> {
  const { data } = await axios.put(
    `${orgBase(backendUrl, orgId)}/attendance/sessions/${sessionId}`,
    payload,
    axiosCfg(token),
  );
  return data;
}

export async function deleteAttendanceSession(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  sessionId: number,
): Promise<void> {
  await axios.delete(
    `${orgBase(backendUrl, orgId)}/attendance/sessions/${sessionId}`,
    axiosCfg(token),
  );
}

export async function upsertAttendanceEntries(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  sessionId: number,
  payload: { entries: { learner_id: string; status: string; note?: string | null }[] },
): Promise<{ ok: boolean }> {
  const { data } = await axios.post(
    `${orgBase(backendUrl, orgId)}/attendance/sessions/${sessionId}/entries`,
    payload,
    axiosCfg(token),
  );
  return data;
}

export async function getAttendanceReport(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgAttendanceReport> {
  const { data } = await axios.get(`${orgBase(backendUrl, orgId)}/attendance/report`, {
    ...axiosCfg(token),
    params,
  });
  return data;
}

export async function downloadAttendanceReportCsv(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<Blob> {
  const { data } = await axios.get(`${orgBase(backendUrl, orgId)}/attendance/report.csv`, {
    ...axiosCfg(token),
    params,
    responseType: 'blob',
  });
  return data as Blob;
}

export async function clearAttendanceEntries(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  sessionId: number,
): Promise<{ ok: boolean; deleted: number }> {
  const { data } = await axios.delete(
    `${orgBase(backendUrl, orgId)}/attendance/sessions/${sessionId}/entries`,
    axiosCfg(token),
  );
  return data;
}

/* ─────────────────────────────────────────────────────────
 * Announcements
 * ───────────────────────────────────────────────────────── */

export async function listAnnouncements(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgAnnouncement[]> {
  const { data } = await axios.get(`${orgBase(backendUrl, orgId)}/announcements`, {
    ...axiosCfg(token),
    params,
  });

  // supports: { items: [...] } OR direct array OR other legacy keys
  return pickArray(data, ['items', 'announcements', 'rows']);
}

export async function getAnnouncementFeed(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgAnnouncement[]> {
  const { data } = await axios.get(`${orgBase(backendUrl, orgId)}/announcements/feed`, {
    ...axiosCfg(token),
    params,
  });

  return pickArray(data, ['items', 'announcements', 'rows']);
}

export async function createAnnouncement(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  payload: Partial<OrgAnnouncement>,
): Promise<OrgAnnouncement> {
  const normalized = normalizeAnnouncementPayload(payload);
  const { data } = await axios.post(
    `${orgBase(backendUrl, orgId)}/announcements`,
    normalized,
    axiosCfg(token),
  );
  return data;
}

export async function updateAnnouncement(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  announcementId: number,
  payload: Partial<OrgAnnouncement>,
): Promise<OrgAnnouncement> {
  const normalized = normalizeAnnouncementPayload(payload);
  const { data } = await axios.put(
    `${orgBase(backendUrl, orgId)}/announcements/${announcementId}`,
    normalized,
    axiosCfg(token),
  );
  return data;
}

export async function deleteAnnouncement(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  announcementId: number,
): Promise<void> {
  await axios.delete(
    `${orgBase(backendUrl, orgId)}/announcements/${announcementId}`,
    axiosCfg(token),
  );
}

export async function getAnnouncementAgmPdf(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  announcementId: number,
): Promise<Blob> {
  const { data } = await axios.get(
    `${orgBase(backendUrl, orgId)}/announcements/${announcementId}/agm.pdf`,
    { ...axiosCfg(token), responseType: 'blob' },
  );
  return data as Blob;
}

/* ─────────────────────────────────────────────────────────
 * Sports (UPDATED per your requested resolver + return shapes)
 * ───────────────────────────────────────────────────────── */

export async function listSportsEvents(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  params?: Record<string, any>,
): Promise<OrgSportsEvent[]> {
  const base = resolveBackendUrl(backendUrl);
  const url = `${base}/api/orgs/${orgId}/sports/events`;
  const r = await axios.get(url, { ...axiosCfg(token), params });

  // Prefer { items: [...] } (new), but keep legacy support too
  return (r.data?.items ?? pickArray(r.data, ['items', 'events', 'rows'])) as OrgSportsEvent[];
}

export async function createSportsEvent(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  payload: Partial<OrgSportsEvent>,
): Promise<OrgSportsEvent> {
  const base = resolveBackendUrl(backendUrl);
  const url = `${base}/api/orgs/${orgId}/sports/events`;
  const r = await axios.post(url, payload, axiosCfg(token));
  return r.data as OrgSportsEvent;
}

export async function updateSportsEvent(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  eventId: number,
  payload: Partial<OrgSportsEvent>,
): Promise<OrgSportsEvent> {
  const base = resolveBackendUrl(backendUrl);
  const url = `${base}/api/orgs/${orgId}/sports/events/${eventId}`;
  const r = await axios.put(url, payload, axiosCfg(token));
  return r.data as OrgSportsEvent;
}

export async function deleteSportsEvent(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  eventId: number,
): Promise<{ ok: boolean }> {
  const base = resolveBackendUrl(backendUrl);
  const url = `${base}/api/orgs/${orgId}/sports/events/${eventId}`;
  const r = await axios.delete(url, axiosCfg(token));
  return r.data as { ok: boolean };
}

// optional convenience (your backend exposes /sports/events.csv)
export async function downloadSportsEventsCsv(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<Blob> {
  const base = resolveBackendUrl(backendUrl);
  const url = `${base}/api/orgs/${orgId}/sports/events.csv`;
  const r = await axios.get(url, {
    ...axiosCfg(token),
    params,
    responseType: 'blob',
  });
  return r.data as Blob;
}

/* ─────────────────────────────────────────────────────────
 * Clubs
 * ───────────────────────────────────────────────────────── */

export async function listClubs(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
): Promise<OrgClub[]> {
  const { data } = await axios.get(`${orgBase(backendUrl, orgId)}/clubs`, axiosCfg(token));
  return pickArray(data, ['items', 'clubs', 'rows']);
}

export async function getMyClubs(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
): Promise<OrgClub[]> {
  const { data } = await axios.get(`${orgBase(backendUrl, orgId)}/clubs/mine`, axiosCfg(token));
  return pickArray(data, ['items', 'clubs', 'rows']);
}

export async function createClub(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  payload: Partial<OrgClub>,
): Promise<OrgClub> {
  const { data } = await axios.post(`${orgBase(backendUrl, orgId)}/clubs`, payload, axiosCfg(token));
  return data;
}

export async function updateClub(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  clubId: number,
  payload: Partial<OrgClub>,
): Promise<OrgClub> {
  const { data } = await axios.put(
    `${orgBase(backendUrl, orgId)}/clubs/${clubId}`,
    payload,
    axiosCfg(token),
  );
  return data;
}

export async function deleteClub(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  clubId: number,
): Promise<void> {
  await axios.delete(`${orgBase(backendUrl, orgId)}/clubs/${clubId}`, axiosCfg(token));
}

export async function listClubMembers(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  clubId: number,
): Promise<OrgClubMembership[]> {
  const { data } = await axios.get(
    `${orgBase(backendUrl, orgId)}/clubs/${clubId}/members`,
    axiosCfg(token),
  );
  return pickArray(data, ['members', 'items', 'rows']);
}

export async function enrollClubMember(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  clubId: number,
  payload: { member_id: string; role?: string },
): Promise<OrgClubMembership> {
  const { data } = await axios.post(
    `${orgBase(backendUrl, orgId)}/clubs/${clubId}/enroll`,
    payload,
    axiosCfg(token),
  );
  return data;
}

export async function unenrollClubMember(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  clubId: number,
  payload: { member_id: string },
): Promise<{ ok: boolean }> {
  const { data } = await axios.post(
    `${orgBase(backendUrl, orgId)}/clubs/${clubId}/unenroll`,
    payload,
    axiosCfg(token),
  );
  return data;
}

/* ─────────────────────────────────────────────────────────
 * Message log
 * ───────────────────────────────────────────────────────── */

export async function listMessageLogs(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgMessageLog[]> {
  const { data } = await axios.get(`${orgBase(backendUrl, orgId)}/messages/log`, {
    ...axiosCfg(token),
    params,
  });
  return pickArray(data, ['items', 'logs', 'rows']);
}

export async function sendMessageNow(
  backendUrl: string | undefined,
  token: string,
  orgId: string,
  payload: {
    subject?: string;
    body?: string;
    template_key?: string;
    payload?: Record<string, unknown>;
    recipients: any[];
  },
): Promise<OrgMessageLog[]> {
  const { data } = await axios.post(
    `${orgBase(backendUrl, orgId)}/messages/send-now`,
    payload,
    axiosCfg(token),
  );
  return pickArray(data, ['items', 'logs', 'rows']);
}

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

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

// Attendance
export async function listAttendanceSessions(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgAttendanceSession[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/attendance/sessions`, {
    headers: authHeaders(token),
    params,
  });
  return data.sessions || [];
}

export async function getAttendanceSession(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: number,
): Promise<OrgAttendanceSession> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/attendance/sessions/${sessionId}`, {
    headers: authHeaders(token),
  });
  return data;
}

export async function createAttendanceSession(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<OrgAttendanceSession>,
): Promise<OrgAttendanceSession> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/attendance/sessions`, payload, {
    headers: authHeaders(token),
  });
  return data;
}

export async function updateAttendanceSession(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: number,
  payload: Partial<OrgAttendanceSession>,
): Promise<OrgAttendanceSession> {
  const { data } = await axios.put(
    `${backendUrl}/api/orgs/${orgId}/attendance/sessions/${sessionId}`,
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function deleteAttendanceSession(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: number,
): Promise<void> {
  await axios.delete(`${backendUrl}/api/orgs/${orgId}/attendance/sessions/${sessionId}`, {
    headers: authHeaders(token),
  });
}

export async function upsertAttendanceEntries(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: number,
  payload: { entries: { learner_id: string; status: string; note?: string | null }[] },
): Promise<{ ok: boolean }> {
  const { data } = await axios.post(
    `${backendUrl}/api/orgs/${orgId}/attendance/sessions/${sessionId}/entries`,
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function getAttendanceReport(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgAttendanceReport> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/attendance/report`, {
    headers: authHeaders(token),
    params,
  });
  return data;
}

export async function downloadAttendanceReportCsv(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<Blob> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/attendance/report.csv`, {
    headers: authHeaders(token),
    params,
    responseType: 'blob',
  });
  return data as Blob;
}

// Announcements
export async function listAnnouncements(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgAnnouncement[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/announcements`, {
    headers: authHeaders(token),
    params,
  });
  return data.items || [];
}

export async function getAnnouncementFeed(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgAnnouncement[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/announcements/feed`, {
    headers: authHeaders(token),
    params,
  });
  return data.items || [];
}

export async function createAnnouncement(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<OrgAnnouncement>,
): Promise<OrgAnnouncement> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/announcements`, payload, {
    headers: authHeaders(token),
  });
  return data;
}

export async function updateAnnouncement(
  backendUrl: string,
  token: string,
  orgId: string,
  announcementId: number,
  payload: Partial<OrgAnnouncement>,
): Promise<OrgAnnouncement> {
  const { data } = await axios.put(
    `${backendUrl}/api/orgs/${orgId}/announcements/${announcementId}`,
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function deleteAnnouncement(
  backendUrl: string,
  token: string,
  orgId: string,
  announcementId: number,
): Promise<void> {
  await axios.delete(`${backendUrl}/api/orgs/${orgId}/announcements/${announcementId}`, {
    headers: authHeaders(token),
  });
}

export async function getAnnouncementAgmPdf(
  backendUrl: string,
  token: string,
  orgId: string,
  announcementId: number,
): Promise<Blob> {
  const { data } = await axios.get(
    `${backendUrl}/api/orgs/${orgId}/announcements/${announcementId}/agm.pdf`,
    { headers: authHeaders(token), responseType: 'blob' },
  );
  return data as Blob;
}

// Sports
export async function listSportsEvents(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgSportsEvent[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/sports/events`, {
    headers: authHeaders(token),
    params,
  });
  return data.items || [];
}

export async function createSportsEvent(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<OrgSportsEvent>,
): Promise<OrgSportsEvent> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/sports/events`, payload, {
    headers: authHeaders(token),
  });
  return data;
}

export async function updateSportsEvent(
  backendUrl: string,
  token: string,
  orgId: string,
  eventId: number,
  payload: Partial<OrgSportsEvent>,
): Promise<OrgSportsEvent> {
  const { data } = await axios.put(
    `${backendUrl}/api/orgs/${orgId}/sports/events/${eventId}`,
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function deleteSportsEvent(
  backendUrl: string,
  token: string,
  orgId: string,
  eventId: number,
): Promise<void> {
  await axios.delete(`${backendUrl}/api/orgs/${orgId}/sports/events/${eventId}`, {
    headers: authHeaders(token),
  });
}

// Clubs
export async function listClubs(
  backendUrl: string,
  token: string,
  orgId: string,
): Promise<OrgClub[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/clubs`, {
    headers: authHeaders(token),
  });
  return data.items || [];
}

export async function getMyClubs(
  backendUrl: string,
  token: string,
  orgId: string,
): Promise<OrgClub[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/clubs/mine`, {
    headers: authHeaders(token),
  });
  return data.items || [];
}

export async function createClub(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<OrgClub>,
): Promise<OrgClub> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/clubs`, payload, {
    headers: authHeaders(token),
  });
  return data;
}

export async function updateClub(
  backendUrl: string,
  token: string,
  orgId: string,
  clubId: number,
  payload: Partial<OrgClub>,
): Promise<OrgClub> {
  const { data } = await axios.put(`${backendUrl}/api/orgs/${orgId}/clubs/${clubId}`, payload, {
    headers: authHeaders(token),
  });
  return data;
}

export async function deleteClub(
  backendUrl: string,
  token: string,
  orgId: string,
  clubId: number,
): Promise<void> {
  await axios.delete(`${backendUrl}/api/orgs/${orgId}/clubs/${clubId}`, {
    headers: authHeaders(token),
  });
}

export async function listClubMembers(
  backendUrl: string,
  token: string,
  orgId: string,
  clubId: number,
): Promise<OrgClubMembership[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/clubs/${clubId}/members`, {
    headers: authHeaders(token),
  });
  return data.members || [];
}

export async function enrollClubMember(
  backendUrl: string,
  token: string,
  orgId: string,
  clubId: number,
  payload: { member_id: string; role?: string },
): Promise<OrgClubMembership> {
  const { data } = await axios.post(
    `${backendUrl}/api/orgs/${orgId}/clubs/${clubId}/enroll`,
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

export async function unenrollClubMember(
  backendUrl: string,
  token: string,
  orgId: string,
  clubId: number,
  payload: { member_id: string },
): Promise<{ ok: boolean }> {
  const { data } = await axios.post(
    `${backendUrl}/api/orgs/${orgId}/clubs/${clubId}/unenroll`,
    payload,
    { headers: authHeaders(token) },
  );
  return data;
}

// Message log
export async function listMessageLogs(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: Record<string, unknown>,
): Promise<OrgMessageLog[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/messages/log`, {
    headers: authHeaders(token),
    params,
  });
  return data.items || [];
}

export async function sendMessageNow(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: { subject?: string; body?: string; template_key?: string; payload?: Record<string, unknown>; recipients: any[] },
): Promise<OrgMessageLog[]> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/messages/send-now`, payload, {
    headers: authHeaders(token),
  });
  return data.items || [];
}

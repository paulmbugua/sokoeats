// packages/shared/api/orgExamsApi.ts
import axios from 'axios';
import type {
  OrgExamConfig,
  OrgExamResultRow,
  OrgExamStudentCard,
  OrgExamAnalyticsRow,
} from '@mytutorapp/shared/types'; // adjust import path if needed

type PeriodLike = 'month' | 'term' | 'year'; // reuse

export async function getOrgExamConfig(
  backendUrl: string,
  token: string,
  orgId: string
): Promise<OrgExamConfig> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/exams/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    terms: data.terms ?? [],
    sessions: data.sessions ?? [],
    gradingBands: data.gradingBands ?? [],
  };
}

export async function saveOrgExamConfig(
  backendUrl: string,
  token: string,
  orgId: string,
  config: OrgExamConfig
): Promise<OrgExamConfig> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/exams/config`, config, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    terms: data.terms ?? [],
    sessions: data.sessions ?? [],
    gradingBands: data.gradingBands ?? [],
  };
}

export async function getOrgExamSheet(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: string,
  classLabel?: string
): Promise<OrgExamResultRow[]> {
  const params: any = { sessionId };
  if (classLabel) params.classLabel = classLabel;

  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/exams/sheet`, {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.rows ?? [];
}

export async function saveOrgExamSheet(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: {
    sessionId: string;
    classLabel?: string;
    rows: OrgExamResultRow[];
  }
): Promise<void> {
  await axios.post(`${backendUrl}/api/orgs/${orgId}/exams/sheet`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getOrgExamStudentCard(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: string,
  studentId: number
): Promise<OrgExamStudentCard> {
  const { data } = await axios.get(
    `${backendUrl}/api/orgs/${orgId}/exams/student/${studentId}/card`,
    {
      params: { sessionId },
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return data;
}

export async function sendOrgExamStudentCardEmail(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: string,
  studentId: number,
  toOverride?: string
): Promise<{ ok: boolean; to?: string }> {
  const { data } = await axios.post(
    `${backendUrl}/api/orgs/${orgId}/exams/student/${studentId}/notify`,
    { sessionId, toOverride },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

export async function getOrgExamAnalytics(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: string
): Promise<OrgExamAnalyticsRow[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/exams/analytics`, {
    params: { sessionId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.data ?? [];
}

/**
 * Fetch a student's exam report card PDF as a Blob.
 */
export async function getOrgExamStudentCardPdf(
  backendUrl: string,
  token: string,
  orgId: string,
  sessionId: string,
  studentId: number
): Promise<Blob> {
  const { data } = await axios.get(
    `${backendUrl}/api/orgs/${orgId}/exams/student/${studentId}/card.pdf`,
    {
      params: { sessionId },
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob',
    }
  );
  return data as Blob;
}

export async function aiTransformOrgExamConfig(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: {
    config?: OrgExamConfig;
    instructions: string;
  }
): Promise<OrgExamConfig> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/exams/config/ai`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return (data && data.config) || (payload.config as OrgExamConfig);
}

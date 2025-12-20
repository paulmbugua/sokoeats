// packages/shared/api/orgLearnersApi.ts
import axios from 'axios';

/* ───────────────────────── Types ───────────────────────── */

export type CreateOrgLearnerPayload = {
  name: string;
  email?: string;

  // class / grade
  classLabel?: string;
  class_label?: string;

  // guardian
  guardianEmail?: string;
  guardian_email?: string;

  // admission
  admissionCode?: string;
  admission_code?: string;

  // optional grouping labels
  houseLabel?: string;
  house_label?: string;
  dormLabel?: string;
  dorm_label?: string;
  clubLabel?: string;
  club_label?: string;

  // optional pre-set photo
  photoUrl?: string;
  photo_url?: string;
};

export type OrgLearner = {
  id: number;
  name: string;
  email?: string | null;
  admission_code?: string | null;
  class_label?: string | null;
  guardian_email?: string | null;
  house_label?: string | null;
  dorm_label?: string | null;
  club_label?: string | null;
  photo_url?: string | null;
};

export type CreateOrgLearnerResponse = {
  ok: boolean;
  learner: OrgLearner;
  /** Present only when a brand new user was created */
  tempPassword?: string | null;
};

export type BulkCreateOrgLearnersCsvResponseRaw = {
  ok: boolean;
  createdCount: number;
  errorCount: number;
  created: Array<{
    row: number;
    id: number;
    name: string;
    email?: string | null;
    admission_code?: string | null;
    tempPassword?: string | null;
  }>;
  errors: Array<{
    row: number;
    error: string;
  }>;
};

/**
 * What the rest of the app will see.
 * We compute `reusedCount` from the raw payload so your
 * existing UI (`resp.reusedCount`) keeps working.
 */
export type BulkCreateOrgLearnersCsvResponse = {
  ok: boolean;
  createdCount: number;
  errorCount: number;
  reusedCount: number;
  created: BulkCreateOrgLearnersCsvResponseRaw['created'];
  errors: BulkCreateOrgLearnersCsvResponseRaw['errors'];
};

export type SetOrgLearnerPhotoPayload = {
  admission_code?: string;
  admissionCode?: string;
  photo_url?: string;
  photoUrl?: string;
};

export type SetOrgLearnerPhotoResponse = {
  ok: boolean;
  user_id: number;
  photo_url: string;
};

/* ────────────────────── Single learner create ────────────────────── */

export async function createOrgLearner(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: CreateOrgLearnerPayload
): Promise<CreateOrgLearnerResponse> {
  const base = backendUrl.replace(/\/+$/, '');

  const body = {
    name: payload.name,
    email: payload.email ?? undefined,

    // Prefer camelCase in the wire payload; backend supports both
    classLabel: payload.classLabel ?? payload.class_label ?? undefined,
    guardianEmail: payload.guardianEmail ?? payload.guardian_email ?? undefined,
    admissionCode: payload.admissionCode ?? payload.admission_code ?? undefined,
    houseLabel: payload.houseLabel ?? payload.house_label ?? undefined,
    dormLabel: payload.dormLabel ?? payload.dorm_label ?? undefined,
    clubLabel: payload.clubLabel ?? payload.club_label ?? undefined,
    photoUrl: payload.photoUrl ?? payload.photo_url ?? undefined,
  };

  const res = await axios.post<CreateOrgLearnerResponse>(
    `${base}/api/orgs/${orgId}/learners`,
    body,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return res.data;
}

/* ────────────────────── CSV bulk upload ────────────────────── */

export async function uploadOrgLearnersCsv(
  backendUrl: string,
  token: string,
  orgId: string,
  file: File
): Promise<BulkCreateOrgLearnersCsvResponse> {
  const base = backendUrl.replace(/\/+$/, '');
  const fd = new FormData();
  fd.append('file', file);

  const res = await axios.post<BulkCreateOrgLearnersCsvResponseRaw>(
    `${base}/api/orgs/${orgId}/learners/csv`,
    fd,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  const data = res.data;

  // Approximate "reused" as learners where tempPassword is null/empty
  const reusedCount = (data.created || []).filter((c) => !c.tempPassword).length;

  return {
    ok: data.ok,
    createdCount: data.createdCount,
    errorCount: data.errorCount,
    reusedCount,
    created: data.created,
    errors: data.errors,
  };
}

/* ────────────────────── Map photo by admission code ────────────────────── */

export async function setOrgLearnerPhotoByAdmission(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: SetOrgLearnerPhotoPayload
): Promise<SetOrgLearnerPhotoResponse> {
  const base = backendUrl.replace(/\/+$/, '');

  const admission_code = payload.admission_code ?? payload.admissionCode;
  const photo_url = payload.photo_url ?? payload.photoUrl;

  if (!admission_code) {
    throw new Error('admission_code is required');
  }
  if (!photo_url) {
    throw new Error('photo_url is required');
  }

  const res = await axios.post<SetOrgLearnerPhotoResponse>(
    `${base}/api/orgs/${orgId}/learners/photo-by-admission`,
    { admission_code, photo_url },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return res.data;
}

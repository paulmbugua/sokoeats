// packages/shared/api/orgInstructorsApi.ts

export interface CreateOrgInstructorPayload {
  name: string;
  email?: string;
  subject?: string;
  staff_code?: string; // snake_case
  staffCode?: string; // camelCase (UI currently sends this)
}

export interface OrgInstructorResponse {
  ok: boolean;
  instructor: {
    id: number | string;
    name: string;
    email: string | null;
    staff_code?: string | null;
    subject?: string | null;
  };
  tempPassword?: string | null;
}

export interface BulkInstructorsCsvResponse {
  ok: boolean;
  createdCount: number;
  errorCount: number;
  reusedCount?: number;
  created: Array<{
    row: number;
    id: number | string;
    name: string;
    email: string | null;
    staff_code?: string | null;
    tempPassword?: string | null;
  }>;
  errors: Array<{
    row: number;
    error: string;
  }>;
}

/**
 * Create a single instructor (used by AddInstructorModal).
 */
export async function createOrgInstructor(
  backendUrl: string,
  token: string,
  orgId: string | number,
  payload: CreateOrgInstructorPayload
): Promise<OrgInstructorResponse> {
  const base = backendUrl.replace(/\/+$/, '');
  const resp = await fetch(`${base}/api/orgs/${orgId}/instructors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let message = `Failed to create instructor (status ${resp.status})`;
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

/**
 * Upload instructors CSV (used by instructor CSV import).
 * Expects field name "file" (matches orgRoutes upload.single('file')).
 */
export async function uploadOrgInstructorsCsv(
  backendUrl: string,
  token: string,
  orgId: string | number,
  file: File
): Promise<BulkInstructorsCsvResponse> {
  const base = backendUrl.replace(/\/+$/, '');
  const form = new FormData();
  form.append('file', file);

  const resp = await fetch(`${base}/api/orgs/${orgId}/instructors/csv`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!resp.ok) {
    let message = `Failed to upload instructors CSV (status ${resp.status})`;
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

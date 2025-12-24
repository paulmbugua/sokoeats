// packages/shared/api/orgFeesApi.ts
import axios from 'axios';
import type { FeeBalanceRow, FeeCharge, FeePayment, FeeStructure } from '@mytutorapp/shared/types';

/* ─────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────── */

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Add near the top of file
function stripNullish<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: any = { ...obj };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v === undefined || v === null) delete out[k];
    if (typeof v === 'string' && v.trim() === '') delete out[k];
  }
  return out;
}

/* ─────────────────────────────────────────────────────────
 * Fee structures
 * ───────────────────────────────────────────────────────── */

export async function listFeeStructures(backendUrl: string, token: string, orgId: string) {
  const url = `${backendUrl}/api/orgs/${orgId}/fees/structures`;
  const r = await axios.get(url, {
    headers: authHeaders(token),
    params: { _ts: Date.now() }, // ✅ cache buster
    withCredentials: true,
  });
  return r.data?.items || [];
}

export async function createFeeStructure(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<FeeStructure>,
): Promise<FeeStructure> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/fees/structures`, payload, {
    headers: authHeaders(token),
    withCredentials: true,
  });
  return data;
}

export type StructurePatch = {
  title?: string;
  description?: string | null;
  currency?: string | null;
  effective_term?: string | null;
  is_active?: boolean;
  scope_type?: string | null;
  scope_value?: string | null;
  items?: any[];
};

function pickStructurePatch(x: any): StructurePatch {
  return stripNullish({
    title: x?.title,
    description: x?.description ?? null,
    currency: x?.currency ?? undefined, // undefined => don't send
    effective_term: x?.effective_term ?? null,
    is_active: x?.is_active ?? undefined,
    scope_type: x?.scope_type ?? null,
    scope_value: x?.scope_value ?? null,
    items: Array.isArray(x?.items) ? x.items : undefined,
  } as any) as StructurePatch;
}

export async function updateFeeStructure(
  backendUrl: string,
  token: string,
  orgId: string,
  structureId: number | string,
  patch: any,
): Promise<FeeStructure> {
  const url = `${backendUrl}/api/orgs/${orgId}/fees/structures/${structureId}`;
  const body = pickStructurePatch(patch);

  const { data } = await axios.put(url, body, {
    headers: authHeaders(token),
    withCredentials: true,
  });
  return data;
}

export async function activateFeeStructure(
  backendUrl: string,
  token: string,
  orgId: string,
  structureId: number,
): Promise<FeeStructure> {
  const { data } = await axios.post(
    `${backendUrl}/api/orgs/${orgId}/fees/structures/${structureId}/activate`,
    {},
    { headers: authHeaders(token), withCredentials: true },
  );
  return data;
}

export async function getFeeStructurePdf(
  backendUrl: string,
  token: string,
  orgId: string,
  structureId: number,
): Promise<Blob> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/fees/structures/${structureId}.pdf`, {
    headers: authHeaders(token),
    responseType: 'blob',
    withCredentials: true,
  });
  return data as Blob;
}

/* ─────────────────────────────────────────────────────────
 * Charges
 * ───────────────────────────────────────────────────────── */

export async function createFeeCharge(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<FeeCharge>,
): Promise<FeeCharge> {
  const body = stripNullish(payload as any);
  // IMPORTANT: do NOT send structure_id / structure_item_id unless they are real numbers
  // stripNullish already deletes null/undefined/""
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/fees/charges`, body, {
    headers: authHeaders(token),
    withCredentials: true,
  });
  return data;
}

export async function createBulkFeeCharges(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: { learner_ids: (string | number)[] } & Partial<FeeCharge>,
): Promise<{ inserted: FeeCharge[]; failed: { learner_id: string; reason: string }[] }> {
  const body = stripNullish(payload as any);

  // extra safety: bulk schema does NOT include learner_id, so remove if UI accidentally passes it
  delete (body as any).learner_id;

  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/fees/charges/bulk`, body, {
    headers: authHeaders(token),
    withCredentials: true,
  });
  return data;
}

/* ─────────────────────────────────────────────────────────
 * Payments
 * ───────────────────────────────────────────────────────── */

export async function recordFeePayment(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<FeePayment>,
): Promise<FeePayment> {
  const body = stripNullish(payload as any);
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/fees/payments`, body, {
    headers: authHeaders(token),
    withCredentials: true,
  });
  return data;
}

/* ─────────────────────────────────────────────────────────
 * Balances + statement
 * ───────────────────────────────────────────────────────── */

export async function getFeeBalances(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: { class_label?: string | null },
): Promise<FeeBalanceRow[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/fees/balances`, {
    params,
    headers: authHeaders(token),
    withCredentials: true,
  });
  return data.balances ?? [];
}

export async function getFeeStatement(
  backendUrl: string,
  token: string,
  orgId: string,
  learnerId: string,
): Promise<{
  charges: FeeCharge[];
  payments: FeePayment[];
  summary: { total_charges: number; total_payments: number; balance: number };
}> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/fees/learners/${learnerId}/statement`, {
    headers: authHeaders(token),
    withCredentials: true,
  });
  return data;
}

export async function getFeeStatementPdf(
  backendUrl: string,
  token: string,
  orgId: string,
  learnerId: string,
): Promise<Blob> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/fees/learners/${learnerId}/statement.pdf`, {
    headers: authHeaders(token),
    responseType: 'blob',
    withCredentials: true,
  });
  return data as Blob;
}

/* ─────────────────────────────────────────────────────────
 * Inbound payments
 * ───────────────────────────────────────────────────────── */

export type FeeInboundRow = {
  id: string | number;
  org_id: string;
  amount_cents: number;
  currency?: string;
  status?: string; // e.g. "unmatched" | "matched"
  payer_phone?: string | null;
  payer_name?: string | null;
  reference?: string | null;
  raw?: any;
  created_at?: string;
};

export async function listFeeInbound(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: { status?: string },
): Promise<FeeInboundRow[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/fees/inbound`, {
    params,
    headers: authHeaders(token),
    withCredentials: true,
  });
  // be defensive about backend shape:
  return data.items ?? data.inbound ?? data.rows ?? [];
}

export async function attachFeeInboundToLearner(
  backendUrl: string,
  token: string,
  orgId: string,
  inboundId: string | number,
  payload: { learner_id: string },
): Promise<FeeInboundRow> {
  const { data } = await axios.post(
    `${backendUrl}/api/orgs/${orgId}/fees/inbound/${encodeURIComponent(String(inboundId))}/attach`,
    payload,
    { headers: authHeaders(token), withCredentials: true },
  );
  return data;
}

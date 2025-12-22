// packages/shared/api/orgFeesApi.ts
import axios from 'axios';
import type {
  FeeBalanceRow,
  FeeCharge,
  FeePayment,
  FeeStructure,
} from '@mytutorapp/shared/types';

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


export async function listFeeStructures(
  backendUrl: string,
  token: string,
  orgId: string,
): Promise<FeeStructure[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/fees/structures`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.items ?? [];
}

export async function createFeeStructure(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<FeeStructure>,
): Promise<FeeStructure> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/fees/structures`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function updateFeeStructure(
  backendUrl: string,
  token: string,
  orgId: string,
  structureId: number,
  payload: Partial<FeeStructure>,
): Promise<FeeStructure> {
  const { data } = await axios.put(
    `${backendUrl}/api/orgs/${orgId}/fees/structures/${structureId}`,
    payload,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
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
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export async function getFeeStructurePdf(
  backendUrl: string,
  token: string,
  orgId: string,
  structureId: number,
): Promise<Blob> {
  const { data } = await axios.get(
    `${backendUrl}/api/orgs/${orgId}/fees/structures/${structureId}.pdf`,
    {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob',
    },
  );
  return data as Blob;
}

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
    headers: { Authorization: `Bearer ${token}` },
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
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}


export async function recordFeePayment(
  backendUrl: string,
  token: string,
  orgId: string,
  payload: Partial<FeePayment>,
): Promise<FeePayment> {
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/fees/payments`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function getFeeBalances(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: { class_label?: string | null },
): Promise<FeeBalanceRow[]> {
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/fees/balances`, {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.balances ?? [];
}

export async function getFeeStatement(
  backendUrl: string,
  token: string,
  orgId: string,
  learnerId: string,
): Promise<{ charges: FeeCharge[]; payments: FeePayment[]; summary: { total_charges: number; total_payments: number; balance: number } }>
{
  const { data } = await axios.get(`${backendUrl}/api/orgs/${orgId}/fees/learners/${learnerId}/statement`, {
    headers: { Authorization: `Bearer ${token}` },
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
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  });
  return data as Blob;
}


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
    headers: { Authorization: `Bearer ${token}` },
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
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}


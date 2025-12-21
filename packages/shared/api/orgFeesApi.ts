// packages/shared/api/orgFeesApi.ts
import axios from 'axios';
import type {
  FeeBalanceRow,
  FeeCharge,
  FeePayment,
  FeeStructure,
} from '@mytutorapp/shared/types';

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
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/fees/charges`, payload, {
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
  const { data } = await axios.post(`${backendUrl}/api/orgs/${orgId}/fees/charges/bulk`, payload, {
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

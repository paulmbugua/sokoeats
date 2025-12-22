import { useCallback, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { FeeCharge, FeePayment } from '@mytutorapp/shared/types';
import {
  createBulkFeeCharges,
  createFeeCharge,
  getFeeStatement,
  getFeeStatementPdf,
  recordFeePayment,
} from '@mytutorapp/shared/api/orgFeesApi';

interface UseOrgFeeStatementProps {
  backendUrl?: string;
  token?: string | null;
  orgId?: string | null;
}

export function useOrgFeeStatement(opts?: UseOrgFeeStatementProps) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;

  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [charges, setCharges] = useState<FeeCharge[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const summary_by_currency = useMemo(() => {
  const sumByCur = (rows: Array<{ currency?: string; amount_cents?: number }>) => {
    const m = new Map<string, number>();
    for (const r of rows || []) {
      const cur = String(r.currency || 'USD').toUpperCase();
      m.set(cur, (m.get(cur) || 0) + Number(r.amount_cents || 0));
    }
    return Array.from(m.entries()).map(([currency, amount_cents]) => ({ currency, amount_cents }));
  };

  const chargesBy = sumByCur(charges);
  const paymentsBy = sumByCur(payments);

  const all = new Set([...chargesBy.map(x => x.currency), ...paymentsBy.map(x => x.currency)]);

  return Array.from(all).map((cur) => {
    const ch = chargesBy.find(x => x.currency === cur)?.amount_cents || 0;
    const pay = paymentsBy.find(x => x.currency === cur)?.amount_cents || 0;
    return { currency: cur, total_charges: ch, total_payments: pay, balance: ch - pay };
  });
}, [charges, payments]);

// optional legacy summary for older UI pieces:
const summary = useMemo(() => {
  const first = summary_by_currency.find(x => x.currency === 'USD') || summary_by_currency[0];
  return first
    ? { total_charges: first.total_charges, total_payments: first.total_payments, balance: first.balance }
    : { total_charges: 0, total_payments: 0, balance: 0 };
}, [summary_by_currency]);


  const fetchStatement = useCallback(
    async (learnerId: string) => {
      if (!ensure()) return null;
      setLoading(true);
      try {
        const data = await getFeeStatement(backendUrl, token as string, orgId as string, learnerId);
        setCharges(data?.charges || []);
        setPayments(data?.payments || []);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const addCharge = useCallback(
    async (payload: Partial<FeeCharge>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const created = await createFeeCharge(backendUrl, token as string, orgId as string, payload);
        setCharges((prev) => [created, ...prev]);
        return created;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const addBulkCharges = useCallback(
    async (
      payload: { learner_ids: (string | number)[] } & Partial<FeeCharge>,
    ): Promise<{ inserted: FeeCharge[]; failed: { learner_id: string; reason: string }[] } | null> => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const result = await createBulkFeeCharges(backendUrl, token as string, orgId as string, payload);
        const inserted = result?.inserted || [];
        if (inserted.length) {
          setCharges((prev) => [...inserted, ...prev]);
        }
        return result;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const addPayment = useCallback(
    async (payload: Partial<FeePayment>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const payment = await recordFeePayment(backendUrl, token as string, orgId as string, payload);
        setPayments((prev) => [payment, ...prev]);
        return payment;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const downloadStatementPdf = useCallback(
    async (learnerId: string, fileName = 'fee-statement.pdf') => {
      if (!ensure()) return null;

      const params = new URLSearchParams();
      params.set('token', token as string);
      const url = `${backendUrl}/api/orgs/${orgId}/fees/learners/${learnerId}/statement.pdf?${params.toString()}`;

      if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        try {
          const blob = await getFeeStatementPdf(backendUrl, token as string, orgId as string, learnerId);
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(blobUrl);
        } catch (e) {
          console.error('[useOrgFeeStatement] download failed', e);
        }
      }

      return url;
    },
    [backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
    charges,
    payments,
    summary,
    loading,
    saving,
    fetchStatement,
    addCharge,
    addBulkCharges,
    addPayment,
    downloadStatementPdf,
     summary_by_currency,
  };
}

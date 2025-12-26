import type { FeeStructureItem } from '@mytutorapp/shared/types';

export function cn(...xs: Array<string | false | null | undefined>) {
  // Not really used in RN styles, but kept for parity (and harmless).
  return xs.filter(Boolean).join(' ');
}

export const PROD_BASE = 'https://server.daybreaklearner.com';

export function moneyFromCents(cents?: number, currency?: string) {
  const cur = String(currency || 'USD').toUpperCase();
  const v = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v);
  } catch {
    return `${cur} ${v.toFixed(2)}`;
  }
}

export function toCents(amountMajor: string) {
  const n = Number(String(amountMajor || '').replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** ✅ allow id to be string | number, and always stringify when using it */
export type LearnerLite = {
  id?: string | number;
  user_id?: string | number;
  learner_id?: string | number;
  admission_code?: string | number;
  name?: string;
  full_name?: string;
  email?: string;
  class_label?: string;
  grade?: string;
};

export function pickFeeLearnerRef(l: LearnerLite) {
  // IMPORTANT: keep fees keyed by user_id for DB consistency
  const v = (l as any)?.user_id ?? (l as any)?.learner_id ?? (l as any)?.id ?? '';
  return String(v || '').trim();
}

export function pickAdmissionCode(l: LearnerLite) {
  return String((l as any)?.admission_code ?? '').trim();
}

export function pickDisplayLearnerId(l: LearnerLite) {
  // what we show in the UI
  return pickAdmissionCode(l) || pickFeeLearnerRef(l);
}

export function pickLearnerName(l: LearnerLite) {
  return (
    (l as any)?.name ||
    (l as any)?.full_name ||
    String((l as any)?.admission_code || '') ||
    String((l as any)?.learner_id || '') ||
    String((l as any)?.id || '') ||
    'Learner'
  );
}

export function pickLearnerId(l: LearnerLite) {
  // for fee APIs we key by user_id etc
  return pickFeeLearnerRef(l);
}

export function maxCurrencyValue(rows: Array<{ currency: string; value: number }>) {
  return Math.max(0, ...(rows || []).map((r) => Number((r as any)?.value || 0)));
}

export function calcTotalsPerCurrency(charges: any[] = [], payments: any[] = []) {
  const m = new Map<string, { currency: string; charges: number; payments: number; balance: number }>();

  for (const c of charges || []) {
    const cur = String(c?.currency || 'USD').toUpperCase();
    const amt = Number(c?.amount_cents || 0);
    const row = m.get(cur) || { currency: cur, charges: 0, payments: 0, balance: 0 };
    row.charges += amt;
    m.set(cur, row);
  }

  for (const p of payments || []) {
    const cur = String(p?.currency || 'USD').toUpperCase();
    const amt = Number(p?.amount_cents || 0);
    const row = m.get(cur) || { currency: cur, charges: 0, payments: 0, balance: 0 };
    row.payments += amt;
    m.set(cur, row);
  }

  for (const row of m.values()) {
    row.balance = Number(row.charges || 0) - Number(row.payments || 0);
  }

  return Array.from(m.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

export const emptyItem = (currency: string = 'USD'): FeeStructureItem =>
  ({
    id: 0,
    structure_id: 0,
    label: '',
    amount_cents: 0,
    currency: String(currency || 'USD').toUpperCase(),
    cadence: '',
    is_optional: false,
    sort_order: 0,
  }) as any;

// apps/web/src/pages/org/OrgFees.web.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useOrgFeeInbound } from '@mytutorapp/shared/hooks/useOrgFeeInbound';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { getOrgRoster } from '@mytutorapp/shared/api/orgApi';
import { useOrgFeeStructures } from '@mytutorapp/shared/hooks/useOrgFeeStructures';
import { useOrgFeeBalances } from '@mytutorapp/shared/hooks/useOrgFeeBalances';
import { useOrgFeeStatement } from '@mytutorapp/shared/hooks/useOrgFeeStatement';
import { Coachmark, useCoachmark } from '../../components/hints/Coachmark';
import SeoHead from '../../components/seo/SeoHead';
import type { FeeStructure, FeeStructureItem } from '@mytutorapp/shared/types';

import {
  calcTotalsPerCurrency,
  cn,
  emptyItem,
  LearnerLite,
  maxCurrencyValue,
  moneyFromCents,
  pickAdmissionCode,
  pickFeeLearnerRef,
  pickLearnerName,
  PROD_BASE,
  toCents,
} from './OrgFees.shared';

import { CopyRow, EmptyState, Badge, MoneyStack, SectionCard } from './OrgFees.ui';

import {
  ResponsiveChargeModal,
  ResponsivePaymentModal,
  StatementModal,
  UnmatchedPaymentsModal,
} from './OrgFees.modals';
import FeeGate from './gates/FeeGate.web';

/* ─────────────────────────────────────────────────────────
 * Small circular checkbox (better UX: tiny click target + clean look)
 * ───────────────────────────────────────────────────────── */
function CircleCheckbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 select-none',
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cn(
          'h-4 w-4 rounded-full border flex items-center justify-center transition',
          'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900',
          'peer-checked:border-blue-600 peer-checked:bg-blue-600 dark:peer-checked:border-blue-500 dark:peer-checked:bg-blue-500',
        )}
        aria-hidden="true"
      >
        <span className={cn('h-1.5 w-1.5 rounded-full bg-white opacity-0 peer-checked:opacity-100')} />
      </span>
      <span className="text-xs text-slate-600 dark:text-slate-200">{label}</span>
    </label>
  );
}

function renderUpgradeCta(upgradeCta: any) {
  if (!upgradeCta) return null;

  if (React.isValidElement(upgradeCta)) return upgradeCta;
  if (typeof upgradeCta === 'string' || typeof upgradeCta === 'number') {
    return <div className="mt-4 text-sm text-slate-700 dark:text-slate-200">{upgradeCta}</div>;
  }

  if (typeof upgradeCta === 'object') {
    const headline = String(upgradeCta.headline || upgradeCta.title || 'Upgrade required');
    const body = String(upgradeCta.body || upgradeCta.message || 'Upgrade to Pro to use this feature.');

    const actionNode = React.isValidElement(upgradeCta.action) ? upgradeCta.action : null;
    const href = String(upgradeCta.href || upgradeCta.link || '/org/billing');
    const ctaLabel = String(upgradeCta.ctaLabel || upgradeCta.label || 'Upgrade');

    return (
      <EmptyState
        title={headline}
        body={body}
        action={
          actionNode || (
            <Link className="text-blue-600 underline" to={href}>
              {ctaLabel}
            </Link>
          )
        }
      />
    );
  }

  return (
    <pre className="mt-4 rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-800">
      {JSON.stringify(upgradeCta, null, 2)}
    </pre>
  );
}

/** ✅ scope helper: prefer scope_value, fallback to legacy "Scope:" in description */
function pickScopeValueFromStructure(s: any): string {
  const direct = String(s?.scope_value ?? '').trim();
  if (direct) return direct;

  const desc = String(s?.description ?? '');
  const m = desc.match(/\bScope:\s*([a-zA-Z_]+)\s+(.+)\s*$/i);
  if (!m) return '';
  return String(m[2] || '').trim();
}

/** ✅ helper: compare ids safely as strings */
const sameId = (a: any, b: any) => String(a ?? '') === String(b ?? '');

/** small guard */
function safePageSize(v: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

const OrgFeesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [learnerPage, setLearnerPage] = useState(1);
  const [learnerPageSize, setLearnerPageSize] = useState(10);

  const { backendUrl, orgToken } = useShopContext() as any;
  const { isPro, upgradeCta, org, activeOrgId } = useOrgProTools() as any;
  const orgId: string | undefined = activeOrgId || org?.id;

  useEffect(() => {
  if (!orgId) return;

  const key = `org:feesUnlock:${orgId}`;
  const at = Number(sessionStorage.getItem(key) || 0);
  const ok = at > 0 && Date.now() - at < 10 * 60 * 1000;

  if (!ok) {
    const sp = new URLSearchParams({
      kind: 'instructor',
      reauth: 'fees',
      orgId: String(orgId),
      returnTo: window.location.pathname + window.location.search,
    });
    navigate(`/org/login?${sp.toString()}`, { replace: true });
  }
}, [orgId, navigate]);

const feesUnlocked = useMemo(() => {
  if (!orgId) return false;
  const key = `org:feesUnlock:${orgId}`;
  const at = Number(sessionStorage.getItem(key) || 0);
  return at > 0 && Date.now() - at < 10 * 60 * 1000;
}, [orgId]);



  // ✅ (1) Keep as string in URL + state
  const structureIdParam = useMemo(() => {
    const raw = searchParams.get('structureId');
    const s = String(raw || '').trim();
    return s ? s : null;
  }, [searchParams]);

  function setParam(key: string, val?: string | null) {
    const next = new URLSearchParams(searchParams);
    if (val && String(val).trim()) next.set(key, String(val));
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const mode = useMemo<'none' | 'charge' | 'payment' | 'statement' | 'print'>(() => {
    const p = location.pathname;
    if (p.endsWith('/charge/new')) return 'charge';
    if (p.endsWith('/payment/new')) return 'payment';
    if (p.endsWith('/statement')) return 'statement';
    if (p.endsWith('/print')) return 'print';
    return 'none';
  }, [location.pathname]);

  const selectedLearnerId = searchParams.get('learnerId') || '';
  const closeToHome = () => navigate('/org/fees');

  const rosterQuery = useQuery({
    queryKey: ['orgRoster', backendUrl, orgId, orgToken],
    enabled: Boolean(backendUrl && orgId && orgToken),
    queryFn: async () => {
      /** ✅ FIX: treat roster response as any so we can safely fallback to .items */
      const raw = (await getOrgRoster(backendUrl, orgToken as string, orgId as string)) as any;
      const learnersRaw = (raw?.learners ?? raw?.items ?? []) as any[];
      const learners: LearnerLite[] = Array.isArray(learnersRaw) ? (learnersRaw as LearnerLite[]) : [];
      return { raw, learners };
    },
    staleTime: 30_000,
  });

  const learners: LearnerLite[] = rosterQuery.data?.learners || [];

  const classLabels = useMemo(() => {
    const s = new Set<string>();
    for (const l of learners) {
      const c = String((l as any).class_label || '').trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [learners]);

  const {
    structures,
    loading: structuresLoading,
    saving: structuresSaving,
    fetchStructures,
    saveStructure,
    editStructure,
    activateStructure,
    downloadStructurePdf,
  } = useOrgFeeStructures({ backendUrl, token: orgToken, orgId });

  const { balances, loading: balancesLoading, fetchBalances } = useOrgFeeBalances({
    backendUrl,
    token: orgToken,
    orgId,
  });
  const feesQuickActionsHint = useCoachmark('org_fees_quick_actions_v1', !balancesLoading);

  const {
    charges,
    payments,
    summary,
    loading: statementLoading,
    fetchStatement,
    addCharge,
    addBulkCharges,
    addPayment,
    downloadStatementPdf,
  } = useOrgFeeStatement({ backendUrl, token: orgToken, orgId });

  const [institutionTotals, setInstitutionTotals] = useState<
    { currency: string; total_charged: number; total_paid: number; balance: number }[]
  >([]);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [loadingInstitution, setLoadingInstitution] = useState(false);
  const [downloadingOrgPdf, setDownloadingOrgPdf] = useState(false);
  const [downloadingInstitutionPdf, setDownloadingInstitutionPdf] = useState(false);

  /** ✅ structure form */
  const [creatingNew, setCreatingNew] = useState(false);

  const [structureForm, setStructureForm] = useState({
    title: '',
    description: '',
    currency: 'USD',
    effective_term: '',
    scopeValue: '',
  });

  const [structureItems, setStructureItems] = useState<FeeStructureItem[]>([emptyItem()]);

  // ✅ (2) selected id is string
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);

  const { rows: inboundUnmatched, loading: inboundLoading, fetchUnmatched, attachToLearner } = useOrgFeeInbound({
    backendUrl,
    token: orgToken,
    orgId,
  });

  const [unmatchedOpen, setUnmatchedOpen] = useState(false);

  useEffect(() => {
    if (backendUrl && orgId && orgToken && isPro) {
      fetchStructures();
      fetchBalances();
    }
  }, [backendUrl, orgId, orgToken, fetchStructures, fetchBalances, isPro]);

  useEffect(() => {
    if (selectedLearnerId && (mode === 'statement' || mode === 'print')) {
      fetchStatement(selectedLearnerId);
    }
  }, [selectedLearnerId, mode, fetchStatement]);

  const fetchInstitutionStatement = useCallback(async () => {
    if (!backendUrl || !orgId || !orgToken) return;

    setLoadingInstitution(true);
    try {
      const params = new URLSearchParams();
      if (rangeFrom) params.set('from', rangeFrom);
      if (rangeTo) params.set('to', rangeTo);

      const resp = await fetch(
        `${backendUrl}/api/orgs/${orgId}/fees/institution-statement?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${orgToken}` },
        },
      );

      if (!resp.ok) throw new Error('Unable to load institution statement');
      const json = await resp.json();
      setInstitutionTotals(Array.isArray(json?.totals_by_currency) ? json.totals_by_currency : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInstitution(false);
    }
  }, [backendUrl, orgId, orgToken, rangeFrom, rangeTo]);

  useEffect(() => {
    fetchInstitutionStatement();
  }, [fetchInstitutionStatement]);

  const downloadOrgStructurePdf = useCallback(async () => {
    if (!backendUrl || !orgId || !orgToken) return;
    setDownloadingOrgPdf(true);
    try {
      const resp = await fetch(`${backendUrl}/api/orgs/${orgId}/fees/structure.pdf`, {
        headers: { Authorization: `Bearer ${orgToken}` },
      });
      if (!resp.ok) throw new Error('Unable to download fee structure');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fee-structure.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingOrgPdf(false);
    }
  }, [backendUrl, orgId, orgToken]);

  const downloadInstitutionStatementPdf = useCallback(async () => {
    if (!backendUrl || !orgId || !orgToken) return;
    setDownloadingInstitutionPdf(true);
    try {
      const params = new URLSearchParams();
      if (rangeFrom) params.set('from', rangeFrom);
      if (rangeTo) params.set('to', rangeTo);

      const resp = await fetch(
        `${backendUrl}/api/orgs/${orgId}/fees/institution-statement.pdf?${params.toString()}`,
        { headers: { Authorization: `Bearer ${orgToken}` } },
      );
      if (!resp.ok) throw new Error('Unable to download institution statement');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'institution-fee-statement.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingInstitutionPdf(false);
    }
  }, [backendUrl, orgId, orgToken, rangeFrom, rangeTo]);

  // ✅ (3) auto-select respects "New structure" mode (string ids)
  useEffect(() => {
    if (!structures?.length) return;
    if (creatingNew) return;

    const wanted = structureIdParam;
    const exists = wanted && structures.some((x: any) => sameId(x.id, wanted));

    const fallback = structures.find((s: any) => s.is_active) || structures[0];
    const id = exists ? wanted : fallback?.id ? String(fallback.id) : null;

    if (id && !sameId(id, selectedStructureId)) {
      setSelectedStructureId(String(id));
      setParam('structureId', String(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structures, structureIdParam, creatingNew]);

  // ✅ (4) load selected structure into form (scope_value)
  useEffect(() => {
  if (!selectedStructureId) return;

  const s = (structures || []).find((x: any) => sameId(x.id, selectedStructureId));
  if (!s) return;

  setCreatingNew(false);

  setStructureForm({
    title: s.title || '',
    description: String(s.description || '').replace(/\s+\|\s+Scope:.+$/i, '').trim(),
    currency: (s.currency || 'USD').toUpperCase(),
    effective_term: s.effective_term || '',
    scopeValue: pickScopeValueFromStructure(s),
  });

  const nextItems =
    Array.isArray(s.items) && s.items.length
      ? (s.items as any[]).map((it: any, idx: number) => ({
          ...it,
          id: it.id || idx + 1,
          sort_order: it.sort_order ?? idx,
          currency: (it.currency || s.currency || 'USD').toUpperCase(),
        }))
      : [emptyItem()];

  setStructureItems(nextItems);
}, [selectedStructureId, structures]);

useEffect(() => {
  if (backendUrl && orgId && orgToken && isPro && feesUnlocked) {
    fetchStructures();
    fetchBalances();
  }
}, [backendUrl, orgId, orgToken, isPro, feesUnlocked, fetchStructures, fetchBalances]);



  const mergedRows = useMemo(() => {
    const byLearner = new Map<string, any>();
    for (const b of balances || []) byLearner.set(String((b as any).learner_id), b);

    return learners.map((l) => {
      const feeLearnerId = pickFeeLearnerRef(l); // used for API calls
      const admission = pickAdmissionCode(l); // shown to humans
      const b = byLearner.get(String(feeLearnerId)) || { currencies: [] };

      return {
        learner: l,
        feeLearnerId,
        admission_code: admission,
        name: pickLearnerName(l),
        class_label: (l as any).class_label || '',
        currencies: Array.isArray(b.currencies) ? b.currencies : [],
      };
    });
  }, [learners, balances]);

  const [q, setQ] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return mergedRows
      .filter((r) => {
        if (classFilter !== 'all' && String(r.class_label || '') !== classFilter) return false;
        if (!query) return true;

        return (
          String(r.name).toLowerCase().includes(query) ||
          String(r.feeLearnerId).toLowerCase().includes(query) ||
          String(r.class_label || '').toLowerCase().includes(query) ||
          String(r.admission_code || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const aMax = Math.max(0, ...(a.currencies || []).map((x: any) => Number(x?.balance || 0)));
        const bMax = Math.max(0, ...(b.currencies || []).map((x: any) => Number(x?.balance || 0)));
        return bMax - aMax;
      });
  }, [mergedRows, q, classFilter]);

  const totalLearnerPages = useMemo(() => {
    if (!filtered.length) return 1;
    return Math.max(1, Math.ceil(filtered.length / safePageSize(learnerPageSize)));
  }, [filtered.length, learnerPageSize]);

  const paginatedFiltered = useMemo(() => {
    const size = safePageSize(learnerPageSize);
    const start = (learnerPage - 1) * size;
    return filtered.slice(start, start + size);
  }, [filtered, learnerPage, learnerPageSize]);

  useEffect(() => {
    setLearnerPage(1);
  }, [q, classFilter]);

  useEffect(() => {
    if (learnerPage > totalLearnerPages) setLearnerPage(totalLearnerPages);
  }, [learnerPage, totalLearnerPages]);

  const learnerRangeText = useMemo(() => {
    if (!filtered.length) return 'No learners found';
    const size = safePageSize(learnerPageSize);
    const start = (learnerPage - 1) * size + 1;
    const end = Math.min(learnerPage * size, filtered.length);
    return `Showing ${start}–${end} of ${filtered.length} learners`;
  }, [filtered.length, learnerPage, learnerPageSize]);

  const totalStructure = useMemo(
    () => structureItems.reduce((acc, item) => acc + Number((item as any).amount_cents || 0), 0),
    [structureItems],
  );

  const activeStructureCurrency = useMemo(() => {
    const s =
      (structures || []).find((x: any) => x.is_active) ||
      (structures || []).find((x: any) => (selectedStructureId ? sameId(x.id, selectedStructureId) : false));

    return String(s?.currency || structureForm.currency || 'USD').toUpperCase();
  }, [structures, selectedStructureId, structureForm.currency]);

  const learnerCurrenciesMap = useMemo(() => {
    const m = new Map<string, string[]>();

    for (const r of mergedRows) {
      const uniques: string[] = Array.from(
        new Set<string>(
          ((r.currencies as any[]) || [])
            .map((x: any): string => String(x?.currency || '').trim().toUpperCase())
            .filter((c): c is string => Boolean(c)),
        ),
      );

      m.set(String(r.feeLearnerId), uniques);
    }

    return m;
  }, [mergedRows]);

  const currencyHintForLearner = useMemo(() => {
    return (learnerId: string) => {
      const curList = learnerCurrenciesMap.get(String(learnerId)) || [];
      if (curList.length === 1) return curList[0];
      if (curList.includes(activeStructureCurrency)) return activeStructureCurrency;
      return activeStructureCurrency || 'USD';
    };
  }, [learnerCurrenciesMap, activeStructureCurrency]);

  // ✅ used for activation + pdf numeric calls
  const selectedStructureIdNum = selectedStructureId ? Number(selectedStructureId) : null;

  function deriveScope(scopeValueRaw: string): { scope_type: 'all' | 'class' | 'grade'; scope_value: string } {
  const raw = String(scopeValueRaw || '').trim();
  const low = raw.toLowerCase();

  // treat these as "all"
  if (!raw || low === 'all' || low === '*' || low === 'any') {
    return { scope_type: 'all', scope_value: '' };
  }

  // grade heuristics: "grade 6", "class 6", "6"
  const digits = (low.match(/\d+/) || [])[0] || '';
  const looksGrade = low.startsWith('grade ') || low.startsWith('class ') || (/^\d+$/.test(low) && !!digits);

  return { scope_type: looksGrade ? 'grade' : 'class', scope_value: raw };
}


const handleSaveStructure = async ({ forceActive }: { forceActive?: boolean } = {}) => {
  const current = selectedStructureId
    ? (structures || []).find((x: any) => sameId(x.id, selectedStructureId))
    : null;

  const willBeActive =
    typeof forceActive === 'boolean'
      ? forceActive
      : Boolean(current?.is_active);

  const { scope_type, scope_value } = deriveScope(structureForm.scopeValue);

  const payload = {
    title: String(structureForm.title || '').trim(),

    // ✅ send strings (not null) to satisfy strict Joi by default
    description: String(structureForm.description || '').trim(),
    effective_term: String(structureForm.effective_term || '').trim(),

    currency: String(structureForm.currency || 'USD').toUpperCase(),

    // ✅ send both as a pair
    scope_type,
    scope_value,

    is_active: Boolean(willBeActive),

    items: (structureItems || [])
      .filter((i: any) => String(i?.label || '').trim() && Number(i?.amount_cents || 0) > 0)
      .map((item: any, idx: number) => ({
        label: String(item.label || '').trim(),
        amount_cents: Math.max(0, Math.round(Number(item.amount_cents || 0))),
        currency: String(item.currency || structureForm.currency || 'USD').toUpperCase(),
        cadence: String(item.cadence || '').trim() || null,
        is_optional: Boolean(item.is_optional),
        sort_order: idx,
        metadata: (item.metadata && typeof item.metadata === 'object') ? item.metadata : {},
      })),
  } as any;

  const idNum = selectedStructureId ? Number(selectedStructureId) : null;

  let saved: any = null;

  try {
    if (idNum && Number.isFinite(idNum)) {
      saved = await editStructure(idNum, payload as Partial<FeeStructure>);
    } else {
      saved = await saveStructure(payload as Partial<FeeStructure>);
    }

    setCreatingNew(false);

    if (saved?.id) {
      setSelectedStructureId(String(saved.id));
      setParam('structureId', String(saved.id));
    }

    await fetchStructures();
  } catch (e: any) {
    // ✅ show the real backend message instead of a generic Axios error
    const msg = e?.response?.data?.message || e?.message || 'Failed to save structure';
    console.error('[handleSaveStructure] failed:', msg, e?.response?.data);
    alert(msg);
    throw e;
  }
};



  // ✅ requested numeric-safe activate (used in banner as quick fix)
  const handleActivateStructure = async () => {
    if (!selectedStructureIdNum || !Number.isFinite(selectedStructureIdNum)) return;
    await activateStructure(selectedStructureIdNum);
    fetchStructures();
  };

  const openCharge = (learnerId?: string) => {
    navigate('/org/fees/charge/new' + (learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ''));
  };

  const openPayment = (learnerId?: string) => {
    navigate('/org/fees/payment/new' + (learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ''));
  };

  const openStatement = (learnerId: string) => {
    navigate(`/org/fees/statement?learnerId=${encodeURIComponent(learnerId)}`);
  };

  const openPrint = (learnerId: string) => {
    navigate(`/org/fees/print?learnerId=${encodeURIComponent(learnerId)}`);
  };

  /** ✅ Load unmatched list when modal opens */
  useEffect(() => {
    if (unmatchedOpen) {
      fetchUnmatched();
    }
  }, [unmatchedOpen, fetchUnmatched]);

  if (!isPro) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Fees</h1>
        <p className="text-sm text-slate-500">Upgrade to Pro to manage org fee structures and balances.</p>
        {renderUpgradeCta(upgradeCta)}
      </div>
    );
  }

  // ---------------- PRINT VIEW (kept as-is) ----------------
  if (mode === 'print') {
    const learner = learners.find((l) => pickFeeLearnerRef(l) === selectedLearnerId);
    const learnerName = learner ? pickLearnerName(learner) : selectedLearnerId || 'Learner';

    const totals = calcTotalsPerCurrency(charges || [], payments || []);
    const chargeRows = totals.map((t) => ({ currency: t.currency, value: t.charges }));
    const paymentRows = totals.map((t) => ({ currency: t.currency, value: t.payments }));
    const balanceRows = totals.map((t) => ({ currency: t.currency, value: t.balance }));

    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={() =>
              navigate('/org/fees' + (selectedLearnerId ? `?learnerId=${encodeURIComponent(selectedLearnerId)}` : ''))
            }
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadStatementPdf(selectedLearnerId, 'statement.pdf')}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Print
            </button>
          </div>
        </div>

        {!selectedLearnerId ? (
          <EmptyState
            title="Pick a learner to print"
            body="Open a statement first, then click Print."
            action={
              <Link className="text-blue-600 underline" to="/org/fees">
                Go to Fees
              </Link>
            }
          />
        ) : statementLoading ? (
          <div className="text-sm text-slate-500">Loading statement…</div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-semibold">Fee Statement</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {org?.name || 'Organization'} • {learnerName}
                </div>
                <div className="text-xs text-slate-500">
                  Learner ID: <span className="font-mono">{selectedLearnerId}</span>
                </div>
              </div>
              <div className="text-left text-xs text-slate-500 sm:text-right">Generated: {new Date().toLocaleString()}</div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Total charges</div>
                <div className="mt-2">
                  <MoneyStack rows={chargeRows} />
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Total payments</div>
                <div className="mt-2">
                  <MoneyStack rows={paymentRows} />
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Balance</div>
                <div className="mt-2">
                  <MoneyStack rows={balanceRows} />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold">Charges</div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(charges || []).map((c: any) => (
                        <tr key={`c-${c.id}`} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                          <td className="px-3 py-2">{c.description || 'Fee'}</td>
                          <td className="px-3 py-2 text-right">{moneyFromCents(Number(c.amount_cents || 0), c.currency)}</td>
                        </tr>
                      ))}
                      {(!charges || charges.length === 0) && (
                        <tr>
                          <td className="px-3 py-3 text-slate-500" colSpan={3}>
                            No charges yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold">Payments</div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">Received</th>
                        <th className="px-3 py-2 text-left">Method</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payments || []).map((p: any) => (
                        <tr key={`p-${p.id}`} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2">
                            {p.received_at
                              ? new Date(p.received_at).toLocaleString()
                              : p.created_at
                                ? new Date(p.created_at).toLocaleString()
                                : '-'}
                          </td>
                          <td className="px-3 py-2">{p.method || '-'}</td>
                          <td className="px-3 py-2 text-right">{moneyFromCents(Number(p.amount_cents || 0), p.currency)}</td>
                        </tr>
                      ))}
                      {(!payments || payments.length === 0) && (
                        <tr>
                          <td className="px-3 py-3 text-slate-500" colSpan={3}>
                            No payments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-4 text-[11px] text-slate-500">Note: Totals above are computed per currency from line items.</div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- MAIN PAGE ----------------
  const editing = selectedStructureId ? (structures || []).find((x: any) => sameId(x.id, selectedStructureId)) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:py-10">
      <SeoHead
        title="Fees & Payments | DayBreak"
        description="Manage fee structures and balances."
        canonicalPath={location.pathname}
        noindex
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Fees & balances</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Build fee structures, create charges, record payments, and generate printable statements.
          </p>
        </div>
      </div>

      <SectionCard
        title="Institution totals"
        subtitle="Summaries per currency plus quick PDF downloads for admins"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">From</div>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">To</div>
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <button
            type="button"
            disabled={loadingInstitution}
            onClick={fetchInstitutionStatement}
            className={cn(
              'rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
              loadingInstitution && 'opacity-60',
            )}
          >
            {loadingInstitution ? 'Refreshing…' : 'Refresh totals'}
          </button>

          <button
            type="button"
            disabled={downloadingInstitutionPdf}
            onClick={downloadInstitutionStatementPdf}
            className={cn(
              'rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600',
              downloadingInstitutionPdf && 'opacity-60',
            )}
          >
            {downloadingInstitutionPdf ? 'Downloading…' : 'Download institution statement PDF'}
          </button>

          <button
            type="button"
            disabled={downloadingOrgPdf}
            onClick={downloadOrgStructurePdf}
            className={cn(
              'rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
              downloadingOrgPdf && 'opacity-60',
            )}
          >
            {downloadingOrgPdf ? 'Preparing…' : 'Download fee structure PDF'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {institutionTotals && institutionTotals.length ? (
            institutionTotals.map((t) => (
              <div
                key={t.currency}
                className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.currency}</div>
                <div className="mt-1 space-y-1 text-slate-700 dark:text-slate-100">
                  <div>Charged: {moneyFromCents(t.total_charged || 0, t.currency)}</div>
                  <div>Paid: {moneyFromCents(t.total_paid || 0, t.currency)}</div>
                  <div className="font-semibold">Balance: {moneyFromCents(t.balance || 0, t.currency)}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500">No totals yet. Refresh after recording charges/payments.</div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Payment callback URLs (share with the school)"
        subtitle="Daraja will call these URLs when parents pay the PayBill. Bank integrations can post to the bank endpoint."
      >
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <CopyRow label="M-Pesa Daraja Validation URL" value={`${PROD_BASE}/api/fees/inbound/validate`} />
            <CopyRow label="M-Pesa Daraja Confirmation URL" value={`${PROD_BASE}/api/fees/inbound/confirm`} />
          </div>

          <CopyRow label="Bank inbound URL (for bank/partner system)" value={`${PROD_BASE}/api/fees/inbound/bank`} />

          <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Unmatched payments</div>
                <div className="mt-1 text-slate-600 dark:text-slate-300">
                  If a parent used the wrong admission number / no reference, open the unmatched list and attach it to
                  the correct learner.
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setUnmatchedOpen(true);
                  await fetchUnmatched();
                }}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                View unmatched
              </button>
            </div>

            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-300">
              Tip: pick a payment, search the learner, then click <span className="font-semibold">Attach</span>.
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Fee structure builder" subtitle="Line items, totals, and activation per scope">
          {/* ✅ Editing banner (requested) */}
          <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Editing</div>
              <div className="truncate text-sm font-semibold">{creatingNew ? 'New structure' : editing?.title || '—'}</div>
              <div className="text-[11px] text-slate-500">
                {editing?.is_active ? 'Active' : 'Draft'}
                {editing ? ` • ${pickScopeValueFromStructure(editing) || 'All learners'}` : ''}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {editing?.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Draft</Badge>}
              {/* quick activate (uses numeric-safe handler) */}
              {editing && !editing.is_active && (
                <button
                  type="button"
                  disabled={!selectedStructureIdNum || structuresSaving}
                  onClick={handleActivateStructure}
                  className={cn(
                    'rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900',
                    (!selectedStructureIdNum || structuresSaving) && 'opacity-60',
                  )}
                >
                  Activate
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Title</div>
              <input
                value={structureForm.title}
                onChange={(e) => setStructureForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                placeholder="e.g. Term 1 Fees"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Currency</div>
              <select
                value={structureForm.currency}
                onChange={(e) => {
                  const nextCur = String(e.target.value || 'USD').toUpperCase();
                  setStructureForm((f) => ({ ...f, currency: nextCur }));
                  // keep items in sync
                  setStructureItems((prev) =>
                    prev.map((it: any) => ({
                      ...it,
                      currency: String(it.currency || nextCur).toUpperCase(),
                    })),
                  );
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="USD">USD</option>
                <option value="KES">KES</option>
                <option value="QAR">QAR</option>
              </select>
            </div>

            {/* Applies-to UI: datalist + quick chips */}
            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">
                Applies to (class / grade / group)
              </div>

              <input
                list="classLabelSuggestions"
                value={structureForm.scopeValue}
                onChange={(e) => setStructureForm((f) => ({ ...f, scopeValue: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                placeholder="e.g. Grade 6, 6A, Form 2, All"
              />

              <datalist id="classLabelSuggestions">
                {classLabels.map((c) => (
                  <option key={c} value={c} />
                ))}
                <option value="Grade 6" />
                <option value="Grade 7" />
                <option value="All" />
              </datalist>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setStructureForm((f) => ({ ...f, scopeValue: '' }))}
                  className="rounded-full border border-slate-200 px-2 py-1 dark:border-slate-700"
                >
                  All
                </button>

                {classLabels.slice(0, 8).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setStructureForm((f) => ({ ...f, scopeValue: c }))}
                    className="rounded-full border border-slate-200 px-2 py-1 dark:border-slate-700"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Effective term</div>
              <input
                value={structureForm.effective_term}
                onChange={(e) => setStructureForm((f) => ({ ...f, effective_term: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                placeholder="e.g. 2025 Term 1"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Description</div>
              <input
                value={structureForm.description}
                onChange={(e) => setStructureForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-200">
              <span>Line items</span>
              <button
                type="button"
                onClick={() => setStructureItems((prev) => [...prev, { ...emptyItem(), currency: structureForm.currency }])}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Add item
              </button>
            </div>

            <div className="space-y-2">
              {structureItems.map((item, idx) => (
                <div
                  key={`item-${idx}`}
                  className="grid gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800 md:grid-cols-12"
                >
                  <div className="md:col-span-4">
                    <div className="text-[11px] font-semibold text-slate-500">Label</div>
                    <input
                      value={(item as any).label}
                      onChange={(e) =>
                        setStructureItems((prev) =>
                          prev.map((it: any, i: number) => (i === idx ? { ...it, label: e.target.value } : it)),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="Tuition"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <div className="text-[11px] font-semibold text-slate-500">Amount</div>
                    <input
                      value={(Number((item as any).amount_cents || 0) / 100 || '').toString()}
                      onChange={(e) =>
                        setStructureItems((prev) =>
                          prev.map((it: any, i: number) => (i === idx ? { ...it, amount_cents: toCents(e.target.value) } : it)),
                        )
                      }
                      inputMode="decimal"
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <div className="text-[11px] font-semibold text-slate-500">Cadence</div>
                    <input
                      value={(item as any).cadence || ''}
                      onChange={(e) =>
                        setStructureItems((prev) =>
                          prev.map((it: any, i: number) => (i === idx ? { ...it, cadence: e.target.value } : it)),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="per term"
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-col justify-center gap-2 md:items-end">
                    <CircleCheckbox
                      checked={Boolean((item as any).is_optional)}
                      onChange={(next) =>
                        setStructureItems((prev) =>
                          prev.map((it: any, i: number) => (i === idx ? { ...it, is_optional: next } : it)),
                        )
                      }
                      label="Optional"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setStructureItems((prev) => (prev.length === 1 ? [emptyItem()] : prev.filter((_, i) => i !== idx)))
                      }
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-500">Live total</div>
                <div className="text-lg font-semibold">{moneyFromCents(totalStructure, structureForm.currency)}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreatingNew(true);
                    setSelectedStructureId(null);
                    setParam('structureId', null);

                    setStructureForm({
                      title: '',
                      description: '',
                      currency: 'USD',
                      effective_term: '',
                      scopeValue: '',
                    });
                    setStructureItems([emptyItem()]);
                  }}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  New structure
                </button>

                {/* ✅ requested button set */}
                <button
                  type="button"
                  disabled={structuresSaving || !structureForm.title}
                  onClick={async () => {
                    await handleSaveStructure({ forceActive: false });
                  }}
                  className={cn(
                    'rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
                    (structuresSaving || !structureForm.title) && 'opacity-60',
                  )}
                >
                  Save draft
                </button>

                <button
                  type="button"
                  disabled={structuresSaving || !structureForm.title}
                  onClick={async () => {
                    await handleSaveStructure({ forceActive: true });
                  }}
                  className={cn(
                    'rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700',
                    (structuresSaving || !structureForm.title) && 'opacity-60',
                  )}
                >
                  Save & activate
                </button>

                <button
                  type="button"
                  disabled={!selectedStructureIdNum || structuresLoading}
                  onClick={() => {
                    if (!selectedStructureIdNum || !Number.isFinite(selectedStructureIdNum)) return;
                    downloadStructurePdf(selectedStructureIdNum, 'fee-structure.pdf');
                  }}
                  className={cn(
                    'rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
                    (!selectedStructureIdNum || structuresLoading) && 'opacity-60',
                  )}
                >
                  Structure PDF
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Existing structures</div>
              <div className="space-y-2">
                {(structures || []).map((s: any) => (
                  <button
                    key={String(s.id)}
                    type="button"
                    onClick={() => {
                      setCreatingNew(false);
                      setSelectedStructureId(String(s.id));
                      setParam('structureId', String(s.id));
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm',
                      'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800',
                      selectedStructureId && sameId(selectedStructureId, s.id) &&
                        'border-blue-400 bg-blue-50/60 dark:border-blue-500/50 dark:bg-blue-900/10',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{s.title}</div>
                      <div className="text-xs text-slate-500">
                        {pickScopeValueFromStructure(s) ? `Applies to: ${pickScopeValueFromStructure(s)}` : 'Applies to: All learners'} •{' '}
                        {String(s.currency || 'USD').toUpperCase()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      {s.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Draft</Badge>}
                      {s.effective_term ? <Badge tone="neutral">{s.effective_term}</Badge> : null}
                    </div>
                  </button>
                ))}

                {!structures?.length && !structuresLoading && (
                  <EmptyState
                    title="No fee structures yet"
                    body="Add line items and save to create your first structure."
                    action={
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingNew(true);
                          setSelectedStructureId(null);
                          setParam('structureId', null);

                          setStructureForm({
                            title: '',
                            description: '',
                            currency: 'USD',
                            effective_term: '',
                            scopeValue: '',
                          });
                          setStructureItems([emptyItem()]);
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        Start now
                      </button>
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Quick actions" subtitle="Charges, payments, balances, and statements">
          <div className="relative grid gap-3 md:grid-cols-2">
            <Coachmark
              id="org_fees_quick_actions_v1"
              title="Record fees faster"
              text="Select a learner below, then use Quick actions to charge or record payments."
              visible={feesQuickActionsHint.visible}
              onDismiss={feesQuickActionsHint.dismiss}
              placement="top"
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Balances</div>
              <div className="mt-1 text-lg font-semibold">{balancesLoading ? 'Loading…' : `${balances?.length || 0} learners`}</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => fetchBalances()}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Statements</div>
              <div className="mt-1 text-lg font-semibold">Download PDFs</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!selectedLearnerId}
                  onClick={() => selectedLearnerId && downloadStatementPdf(selectedLearnerId, 'fee-statement.pdf')}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Statement PDF
                </button>
                <button
                  type="button"
                  disabled={!selectedLearnerId}
                  onClick={() => selectedLearnerId && openPrint(selectedLearnerId)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Print view
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Charges</div>
              <div className="mt-1 text-lg font-semibold">Create per learner or bulk</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => openCharge(selectedLearnerId || undefined)}
                  className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  New charge
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Payments</div>
              <div className="mt-1 text-lg font-semibold">Record receipts</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => openPayment(selectedLearnerId || undefined)}
                  className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  Record payment
                </button>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Balances" subtitle="Search learners and open statements">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-2 md:grid-cols-3 md:items-end">
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Search</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, ID, or class"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Class filter</div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="all">All classes</option>
                {classLabels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="flex items-center gap-3 pt-5 text-sm text-slate-500">
                <span>{balancesLoading ? 'Refreshing balances…' : learnerRangeText}</span>

                <select
                  value={learnerPageSize}
                  onChange={(e) => setLearnerPageSize(Number(e.target.value))}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={learnerPage <= 1}
                    onClick={() => setLearnerPage((p) => Math.max(1, p - 1))}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold disabled:opacity-60 dark:border-slate-800"
                  >
                    Prev
                  </button>

                  <span className="text-xs">
                    Page {learnerPage} / {totalLearnerPages}
                  </span>

                  <button
                    type="button"
                    disabled={learnerPage >= totalLearnerPages}
                    onClick={() => setLearnerPage((p) => Math.min(totalLearnerPages, p + 1))}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold disabled:opacity-60 dark:border-slate-800"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2 text-left">Learner</th>
                <th className="px-3 py-2 text-left">Class</th>
                <th className="px-3 py-2 text-right">Charges</th>
                <th className="px-3 py-2 text-right">Payments</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedFiltered.map((r) => {
                const feeLearnerId = r.feeLearnerId;
                const isSelected = selectedLearnerId && feeLearnerId === selectedLearnerId;

                const chargeRows = (r.currencies || []).map((x: any) => ({
                  currency: x.currency,
                  value: Number(x.charges || 0),
                }));
                const paymentRows = (r.currencies || []).map((x: any) => ({
                  currency: x.currency,
                  value: Number(x.payments || 0),
                }));
                const balanceRows = (r.currencies || []).map((x: any) => ({
                  currency: x.currency,
                  value: Number(x.balance || 0),
                }));
                const maxBal = maxCurrencyValue(balanceRows);

                return (
                  <tr
                    key={feeLearnerId}
                    className={cn(
                      'border-t border-slate-200 dark:border-slate-800',
                      isSelected && 'bg-blue-50/60 dark:bg-blue-900/10',
                    )}
                    onClick={() => setParam('learnerId', r.feeLearnerId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{r.admission_code || '—'}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Internal: <span className="font-mono">{r.feeLearnerId}</span>
                      </div>
                    </td>

                    <td className="px-3 py-2">{r.class_label || '-'}</td>

                    <td className="px-3 py-2 text-right">
                      <MoneyStack rows={chargeRows} />
                    </td>

                    <td className="px-3 py-2 text-right">
                      <MoneyStack rows={paymentRows} />
                    </td>

                    <td className="px-3 py-2 text-right">
                      <Badge tone={maxBal > 0 ? 'warn' : 'ok'}>
                        <MoneyStack rows={balanceRows} />
                      </Badge>
                    </td>

                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCharge(feeLearnerId);
                          }}
                          className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Charge
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPayment(feeLearnerId);
                          }}
                          className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          Pay
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openStatement(feeLearnerId);
                          }}
                          className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Statement
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    {rosterQuery.isLoading ? 'Loading roster…' : 'No learners match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          Tip: select a learner, then open <span className="font-semibold">Statement</span> to view history and print.
        </div>
      </SectionCard>

      {mode === 'charge' && (
        <ResponsiveChargeModal
          title="Create fee charge"
          onClose={closeToHome}
          learners={learners}
          classLabels={classLabels}
          selectedLearnerId={selectedLearnerId}
          defaultCurrency={activeStructureCurrency}
          currencyHintForLearner={currencyHintForLearner}
          learnerCurrenciesMap={learnerCurrenciesMap}
          onCharge={async (payload, isBulk) => {
            if (isBulk) {
              await addBulkCharges(payload as any);
            } else {
              await addCharge(payload as any);
            }
            await fetchBalances();
            if ((payload as any)?.learner_id) await fetchStatement((payload as any).learner_id);
          }}
        />
      )}

      {mode === 'payment' && (
        <ResponsivePaymentModal
          title="Record payment"
          onClose={closeToHome}
          learners={learners}
          selectedLearnerId={selectedLearnerId}
          defaultCurrency={activeStructureCurrency}
          currencyHintForLearner={currencyHintForLearner}
          learnerCurrenciesMap={learnerCurrenciesMap}
          onPayment={async (payload) => {
            await addPayment(payload as any);
            await fetchBalances();
            if ((payload as any)?.learner_id) await fetchStatement((payload as any).learner_id);
          }}
        />
      )}

      {mode === 'statement' && (
        <StatementModal
          title={`Statement${selectedLearnerId ? ` • ${selectedLearnerId}` : ''}`}
          onClose={closeToHome}
          learnerId={selectedLearnerId}
          summary={summary}
          charges={charges}
          payments={payments}
          loading={statementLoading}
          onOpenCharge={() => openCharge(selectedLearnerId)}
          onOpenPayment={() => openPayment(selectedLearnerId)}
          onPrint={() => openPrint(selectedLearnerId)}
          onDownload={() => downloadStatementPdf(selectedLearnerId, 'fee-statement.pdf')}
        />
      )}

      {unmatchedOpen && (
        <UnmatchedPaymentsModal
          title="Unmatched inbound payments"
          onClose={() => setUnmatchedOpen(false)}
          loading={inboundLoading}
          rows={inboundUnmatched}
          learners={learners}
          onRefresh={fetchUnmatched}
          onAttach={async (inboundId, learnerId) => {
            await attachToLearner(inboundId, learnerId);
            await fetchUnmatched();
            await fetchBalances();
          }}
        />
      )}
    </div>
  );
};

export default function OrgFeesPageWithGate() {
  return (
    <FeeGate>
      <OrgFeesPage />
    </FeeGate>
  );
}

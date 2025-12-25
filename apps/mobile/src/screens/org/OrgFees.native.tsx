// apps/mobile/src/screens/org/OrgFees.native.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import tw from '../../../tailwind';

import { useQuery } from '@tanstack/react-query';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { getOrgRoster } from '@mytutorapp/shared/api/orgApi';
import { useOrgFeeInbound } from '@mytutorapp/shared/hooks/useOrgFeeInbound';
import { useOrgFeeStructures } from '@mytutorapp/shared/hooks/useOrgFeeStructures';
import { useOrgFeeBalances } from '@mytutorapp/shared/hooks/useOrgFeeBalances';
import { useOrgFeeStatement } from '@mytutorapp/shared/hooks/useOrgFeeStatement';
import { PROD_BASE, moneyFromCents, toCents, emptyItem } from './OrgFees.shared.native';
import { CopyRow, MoneyStack, Badge, EmptyState, SectionCard, CircleCheckbox, Modal } from './OrgFees.ui.native';
import {
  UnmatchedPaymentsModal,
  ResponsiveChargeModal,
  ResponsivePaymentModal,
  StatementModal,
} from './OrgFees.modals.native';

import type { FeeStructure, FeeStructureItem } from '@mytutorapp/shared/types';



function pickString(...xs: any[]) {
  for (const x of xs) {
    const s = typeof x === 'string' ? x : x == null ? '' : String(x);
    if (s.trim()) return s.trim();
  }
  return '';
}

function pickAdmissionCode(l: any) {
  return pickString(
    l?.admission_code,
    l?.admissionNo,
    l?.adm_no,
    l?.admission_number,
    l?.admission,
    l?.profile?.admission_code,
  );
}

function pickLearnerName(l: any) {
  const full = pickString(
    l?.name,
    l?.full_name,
    l?.display_name,
    l?.profile?.name,
    l?.profile?.full_name,
  );
  if (full) return full;

  const first = pickString(l?.first_name, l?.profile?.first_name);
  const last = pickString(l?.last_name, l?.profile?.last_name);
  const joined = `${first} ${last}`.trim();
  if (joined) return joined;

  return pickString(l?.email, l?.profile?.email, l?.phone, l?.id, l?.user_id) || 'Learner';
}

/** used for API calls (balances/statement). Prefer learner_id if present. */
function pickFeeLearnerRef(l: any) {
  return pickString(l?.learner_id, l?.id, l?.user_id);
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

const sameId = (a: any, b: any) => String(a ?? '') === String(b ?? '');

function safePageSize(v: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function calcTotalsPerCurrency(charges: any[] = [], payments: any[] = []) {
  const m = new Map<string, { currency: string; charges: number; payments: number; balance: number }>();

  for (const c of charges || []) {
    const cur = String(c?.currency || 'USD').toUpperCase();
    const row = m.get(cur) || { currency: cur, charges: 0, payments: 0, balance: 0 };
    row.charges += Number(c?.amount_cents || 0);
    m.set(cur, row);
  }
  for (const p of payments || []) {
    const cur = String(p?.currency || 'USD').toUpperCase();
    const row = m.get(cur) || { currency: cur, charges: 0, payments: 0, balance: 0 };
    row.payments += Number(p?.amount_cents || 0);
    m.set(cur, row);
  }

  const out = Array.from(m.values()).map((x) => ({ ...x, balance: x.charges - x.payments }));
  out.sort((a, b) => b.balance - a.balance);
  return out;
}

function maxCurrencyValue(rows: Array<{ currency: string; value: number }>) {
  return Math.max(0, ...(rows || []).map((r) => Number(r?.value || 0)));
}

function deriveScope(scopeValueRaw: string): { scope_type: 'all' | 'class' | 'grade'; scope_value: string } {
  const raw = String(scopeValueRaw || '').trim();
  const low = raw.toLowerCase();

  if (!raw || low === 'all' || low === '*' || low === 'any') {
    return { scope_type: 'all', scope_value: '' };
  }

  const digits = (low.match(/\d+/) || [])[0] || '';
  const looksGrade = low.startsWith('grade ') || low.startsWith('class ') || (/^\d+$/.test(low) && !!digits);

  return { scope_type: looksGrade ? 'grade' : 'class', scope_value: raw };
}

/* ─────────────────────────────────────────────────────────
 * Tiny UI helpers
 * ───────────────────────────────────────────────────────── */

function useTheme() {
  const scheme = useColorScheme();
  return useMemo(() => {
    const dark = scheme === 'dark';
    return {
      dark,
      bg: dark ? '#0b1220' : '#f8fafc',
      card: dark ? '#0f172a' : '#ffffff',
      border: dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.12)',
      text: dark ? '#e2e8f0' : '#0f172a',
      subtext: dark ? 'rgba(226,232,240,0.78)' : 'rgba(15,23,42,0.65)',
      muted: dark ? 'rgba(226,232,240,0.55)' : 'rgba(15,23,42,0.45)',

      primary: '#2563eb',
      primarySoft: dark ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.10)',

      okBg: dark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.12)',
      okBorder: dark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.25)',
      okText: dark ? '#d1fae5' : '#064e3b',

      warnBg: dark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.12)',
      warnBorder: dark ? 'rgba(245,158,11,0.40)' : 'rgba(245,158,11,0.28)',
      warnText: dark ? '#fde68a' : '#7c2d12',

      badBg: dark ? 'rgba(244,63,94,0.14)' : 'rgba(244,63,94,0.10)',
      badBorder: dark ? 'rgba(244,63,94,0.38)' : 'rgba(244,63,94,0.22)',
      badText: dark ? '#fecdd3' : '#9f1239',
    };
  }, [scheme]);
}

const Card = ({ theme, children }: any) => (
  <View style={[tw`rounded-3xl border p-4`, { backgroundColor: theme.card, borderColor: theme.border }]}>
    {children}
  </View>
);

const H = ({ theme, children }: any) => <Text style={[tw`text-base font-bold`, { color: theme.text }]}>{children}</Text>;

const P = ({ theme, children }: any) => <Text style={[tw`text-sm`, { color: theme.subtext }]}>{children}</Text>;

const Tiny = ({ theme, children }: any) => <Text style={[tw`text-xs`, { color: theme.muted }]}>{children}</Text>;



const Btn = ({ theme, label, onPress, kind = 'primary', disabled }: any) => {
  const bg =
    kind === 'primary' ? theme.primary : kind === 'dark' ? (theme.dark ? '#334155' : '#0f172a') : 'transparent';
  const borderColor = kind === 'ghost' ? theme.border : 'transparent';
  const textColor = kind === 'ghost' ? theme.text : '#fff';

  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        tw`px-4 py-3 rounded-2xl border`,
        {
          backgroundColor: disabled ? theme.border : bg,
          borderColor,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[tw`text-sm font-semibold text-center`, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const Chip = ({ theme, active, label, onPress, disabled }: any) => (
  <TouchableOpacity
    disabled={disabled}
    onPress={onPress}
    style={[
      tw`px-3 py-2 rounded-full border mr-2 mb-2`,
      {
        borderColor: active ? theme.primary : theme.border,
        backgroundColor: active ? theme.primarySoft : 'transparent',
        opacity: disabled ? 0.55 : 1,
      },
    ]}
  >
    <Text style={[tw`text-xs font-semibold`, { color: active ? theme.primary : theme.text }]}>{label}</Text>
  </TouchableOpacity>
);



const Divider = ({ theme }: any) => <View style={[tw`h-px my-3`, { backgroundColor: theme.border }]} />;

function Field({ theme, label, value, onChange, placeholder, multiline, height }: any) {
  return (
    <View style={tw`mb-3`}>
      <Text style={[tw`text-xs uppercase tracking-wider mb-1`, { color: theme.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        multiline={multiline}
        style={[
          tw`rounded-2xl px-3 py-3 border`,
          {
            borderColor: theme.border,
            backgroundColor: theme.card,
            color: theme.text,
            minHeight: height,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────── */

export default function OrgFeesNative() {
  const theme = useTheme();

  const [learnerPage, setLearnerPage] = useState(1);
  const [learnerPageSize, setLearnerPageSize] = useState(10);

  const { backendUrl, orgToken } = useShopContext() as any;
  const { isPro, upgradeCta, org, activeOrgId } = useOrgProTools() as any;

  const orgId: string | undefined = activeOrgId || org?.id;

  // Roster
  const rosterQuery = useQuery({
    queryKey: ['orgRoster', backendUrl, orgId, orgToken],
    enabled: Boolean(backendUrl && orgId && orgToken),
    queryFn: async () => {
      const raw = (await getOrgRoster(backendUrl, orgToken as string, orgId as string)) as any;
      const learnersRaw = (raw?.learners ?? raw?.items ?? []) as any[];
      const learners = Array.isArray(learnersRaw) ? learnersRaw : [];
      return { raw, learners };
    },
    staleTime: 30_000,
  });

  const learners: any[] = rosterQuery.data?.learners || [];

  const classLabels = useMemo(() => {
    const s = new Set<string>();
    for (const l of learners) {
      const c = String(l?.class_label || '').trim();
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

  const {
    charges,
    payments,
    summary,
    loading: statementLoading,
    fetchStatement,
    addCharge,
    addPayment,
    downloadStatementPdf,
  } = useOrgFeeStatement({ backendUrl, token: orgToken, orgId });

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
  }, [backendUrl, orgId, orgToken, isPro, fetchStructures, fetchBalances]);

  /* ─────────────────────────────────────────────────────────
   * Structure builder state
   * ───────────────────────────────────────────────────────── */
  const [creatingNew, setCreatingNew] = useState(false);

  const [structureForm, setStructureForm] = useState({
    title: '',
    description: '',
    currency: 'USD',
    effective_term: '',
    scopeValue: '',
  });

  const [structureItems, setStructureItems] = useState<FeeStructureItem[]>([emptyItem('USD')]);
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);

  // auto-select default structure (active or first) unless creatingNew
  useEffect(() => {
    if (!structures?.length) return;
    if (creatingNew) return;

    const fallback = (structures as any[]).find((s: any) => s.is_active) || (structures as any[])[0];
    const id = fallback?.id ? String(fallback.id) : null;

    if (id && !sameId(id, selectedStructureId)) {
      setSelectedStructureId(id);
    }
  }, [structures, creatingNew, selectedStructureId]);

  // load selected structure into form
  useEffect(() => {
    if (!selectedStructureId) return;

    const s = (structures || []).find((x: any) => sameId(x.id, selectedStructureId));
    if (!s) return;

    setCreatingNew(false);

    setStructureForm({
      title: s.title || '',
      description: String(s.description || '').replace(/\s+\|\s+Scope:.+$/i, '').trim(),
      currency: String(s.currency || 'USD').toUpperCase(),
      effective_term: s.effective_term || '',
      scopeValue: pickScopeValueFromStructure(s),
    });

    const nextItems =
      Array.isArray(s.items) && s.items.length
        ? (s.items as any[]).map((it: any, idx: number) => ({
            ...it,
            id: it.id || idx + 1,
            sort_order: it.sort_order ?? idx,
            currency: String(it.currency || s.currency || 'USD').toUpperCase(),
          }))
        : [emptyItem(String(s.currency || 'USD').toUpperCase())];

    setStructureItems(nextItems as any);
  }, [selectedStructureId, structures]);

  const totalStructure = useMemo(
    () => (structureItems || []).reduce((acc, item: any) => acc + Number(item?.amount_cents || 0), 0),
    [structureItems],
  );

  const selectedStructureIdNum = selectedStructureId ? Number(selectedStructureId) : null;
  const editing = selectedStructureId ? (structures || []).find((x: any) => sameId(x.id, selectedStructureId)) : null;

  const activeStructureCurrency = useMemo(() => {
    const s =
      (structures || []).find((x: any) => x.is_active) ||
      (structures || []).find((x: any) => (selectedStructureId ? sameId(x.id, selectedStructureId) : false));

    return String(s?.currency || structureForm.currency || 'USD').toUpperCase();
  }, [structures, selectedStructureId, structureForm.currency]);

  const handleActivateStructure = async () => {
    if (!selectedStructureIdNum || !Number.isFinite(selectedStructureIdNum)) return;
    try {
      await activateStructure(selectedStructureIdNum);
      await fetchStructures();
    } catch (e: any) {
      Alert.alert('Activation failed', e?.response?.data?.message || e?.message || 'Failed to activate structure');
    }
  };

  const handleSaveStructure = async ({ forceActive }: { forceActive?: boolean } = {}) => {
    const current = selectedStructureId ? (structures || []).find((x: any) => sameId(x.id, selectedStructureId)) : null;

    const willBeActive = typeof forceActive === 'boolean' ? forceActive : Boolean(current?.is_active);

    const { scope_type, scope_value } = deriveScope(structureForm.scopeValue);

    const payload = {
      title: String(structureForm.title || '').trim(),
      description: String(structureForm.description || '').trim(),
      effective_term: String(structureForm.effective_term || '').trim(),
      currency: String(structureForm.currency || 'USD').toUpperCase(),
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
          metadata: item?.metadata && typeof item.metadata === 'object' ? item.metadata : {},
        })),
    } as any;

    const idNum = selectedStructureId ? Number(selectedStructureId) : null;

    try {
      let saved: any = null;

      if (idNum && Number.isFinite(idNum)) {
        saved = await editStructure(idNum, payload as Partial<FeeStructure>);
      } else {
        saved = await saveStructure(payload as Partial<FeeStructure>);
      }

      setCreatingNew(false);

      if (saved?.id) setSelectedStructureId(String(saved.id));

      await fetchStructures();
      Alert.alert('Saved', willBeActive ? 'Structure saved & activated.' : 'Structure saved as draft.');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to save structure';
      Alert.alert('Save failed', msg);
      throw e;
    }
  };

  /* ─────────────────────────────────────────────────────────
   * Balances table logic (mobile list)
   * ───────────────────────────────────────────────────────── */
  const mergedRows = useMemo(() => {
    const byLearner = new Map<string, any>();
    for (const b of balances || []) byLearner.set(String((b as any)?.learner_id), b);

    return learners.map((l) => {
      const feeLearnerId = pickFeeLearnerRef(l);
      const admission = pickAdmissionCode(l);
      const b = byLearner.get(String(feeLearnerId)) || { currencies: [] };

      return {
        learner: l,
        feeLearnerId,
        admission_code: admission,
        name: pickLearnerName(l),
        class_label: l?.class_label || '',
        currencies: Array.isArray(b.currencies) ? b.currencies : [],
      };
    });
  }, [learners, balances]);

  const [q, setQ] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [selectedLearnerId, setSelectedLearnerId] = useState<string>('');

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

  useEffect(() => setLearnerPage(1), [q, classFilter]);

  const totalLearnerPages = useMemo(() => {
    if (!filtered.length) return 1;
    return Math.max(1, Math.ceil(filtered.length / safePageSize(learnerPageSize)));
  }, [filtered.length, learnerPageSize]);

  useEffect(() => {
    if (learnerPage > totalLearnerPages) setLearnerPage(totalLearnerPages);
  }, [learnerPage, totalLearnerPages]);

  const paginatedFiltered = useMemo(() => {
    const size = safePageSize(learnerPageSize);
    const start = (learnerPage - 1) * size;
    return filtered.slice(start, start + size);
  }, [filtered, learnerPage, learnerPageSize]);

  const learnerRangeText = useMemo(() => {
    if (!filtered.length) return 'No learners found';
    const size = safePageSize(learnerPageSize);
    const start = (learnerPage - 1) * size + 1;
    const end = Math.min(learnerPage * size, filtered.length);
    return `Showing ${start}–${end} of ${filtered.length} learners`;
  }, [filtered.length, learnerPage, learnerPageSize]);

  /* learner currencies hint */
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

  /* ─────────────────────────────────────────────────────────
   * Modals
   * ───────────────────────────────────────────────────────── */
  const [mode, setMode] = useState<'none' | 'charge' | 'payment' | 'statement'>('none');

  const openCharge = (learnerId?: string) => {
    if (learnerId) setSelectedLearnerId(learnerId);
    setMode('charge');
  };

  const openPayment = (learnerId?: string) => {
    if (learnerId) setSelectedLearnerId(learnerId);
    setMode('payment');
  };

  const openStatement = async (learnerId: string) => {
    setSelectedLearnerId(learnerId);
    setMode('statement');
    try {
      await fetchStatement(learnerId);
    } catch {}
  };

  useEffect(() => {
    if (unmatchedOpen) fetchUnmatched();
  }, [unmatchedOpen, fetchUnmatched]);

  /* charge form */
  const [chargeDesc, setChargeDesc] = useState('Fee charge');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeCurrency, setChargeCurrency] = useState('USD');

  useEffect(() => {
    if (mode === 'charge' && selectedLearnerId) {
      setChargeCurrency(currencyHintForLearner(selectedLearnerId));
    }
  }, [mode, selectedLearnerId, currencyHintForLearner]);

  /* payment form */
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState('USD');
  const [payMethod, setPayMethod] = useState('cash');
  const [payRef, setPayRef] = useState('');
  const [payNote, setPayNote] = useState('');

  useEffect(() => {
    if (mode === 'payment' && selectedLearnerId) {
      setPayCurrency(currencyHintForLearner(selectedLearnerId));
    }
  }, [mode, selectedLearnerId, currencyHintForLearner]);

  const selectedLearner = useMemo(() => {
    return learners.find((l: any) => sameId(pickFeeLearnerRef(l), selectedLearnerId)) || null;
  }, [learners, selectedLearnerId]);

  /* ─────────────────────────────────────────────────────────
   * Upgrade gating
   * ───────────────────────────────────────────────────────── */
  if (!isPro) {
    return (
      <View style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
        <ScrollView contentContainerStyle={tw`px-4 py-6`}>
          <Text style={[tw`text-2xl font-bold`, { color: theme.text }]}>Fees</Text>
          <Text style={[tw`text-sm mt-2`, { color: theme.subtext }]}>
            Upgrade to Pro to manage org fee structures and balances.
          </Text>

          <View style={tw`mt-4`}>
            <Card theme={theme}>
              <H theme={theme}>{String(upgradeCta?.headline || upgradeCta?.title || 'Upgrade required')}</H>
              <P theme={theme}>{String(upgradeCta?.body || upgradeCta?.message || 'Upgrade to Pro to use this feature.')}</P>
            </Card>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ─────────────────────────────────────────────────────────
   * Render
   * ───────────────────────────────────────────────────────── */

  return (
    <View style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={tw`px-4 pt-6 pb-28`}>
        <Text style={[tw`text-xs uppercase tracking-wider`, { color: theme.primary }]}>Org tools</Text>
        <Text style={[tw`text-2xl font-bold mt-1`, { color: theme.text }]}>Fees & balances</Text>
        <Text style={[tw`text-sm mt-1`, { color: theme.subtext }]}>
          Build fee structures, create charges, record payments, and view statements.
        </Text>

        {/* Callback URLs */}
        <View style={tw`mt-4`}>
          <Card theme={theme}>
            <H theme={theme}>Payment callback URLs</H>
            <P theme={theme}>Share with your school / integrator for inbound payments.</P>

            <Divider theme={theme} />

            <Tiny theme={theme}>Daraja Validation URL</Tiny>
            <Text style={[tw`text-xs mt-1`, { color: theme.text }]} selectable>
              {`${PROD_BASE}/api/fees/inbound/validate`}
            </Text>

            <View style={tw`mt-3`} />

            <Tiny theme={theme}>Daraja Confirmation URL</Tiny>
            <Text style={[tw`text-xs mt-1`, { color: theme.text }]} selectable>
              {`${PROD_BASE}/api/fees/inbound/confirm`}
            </Text>

            <View style={tw`mt-3`} />

            <Tiny theme={theme}>Bank inbound URL</Tiny>
            <Text style={[tw`text-xs mt-1`, { color: theme.text }]} selectable>
              {`${PROD_BASE}/api/fees/inbound/bank`}
            </Text>

            <View style={tw`mt-4`} />

            <View style={tw`flex-row items-center justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={[tw`text-sm font-semibold`, { color: theme.text }]}>Unmatched payments</Text>
                <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                  If a parent used the wrong reference, attach the payment to the correct learner.
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  setUnmatchedOpen(true);
                  await fetchUnmatched();
                }}
                style={[tw`px-3 py-2 rounded-2xl`, { backgroundColor: theme.primary }]}
              >
                <Text style={tw`text-white text-xs font-semibold`}>View unmatched</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        {/* Structure builder */}
        <View style={tw`mt-4`}>
          <Card theme={theme}>
            <H theme={theme}>Fee structure builder</H>
            <P theme={theme}>Line items, totals, and activation per scope.</P>

            <Divider theme={theme} />

            {/* Editing banner */}
            <View style={[tw`rounded-2xl border p-3`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}>
              <Tiny theme={theme}>Editing</Tiny>
              <Text style={[tw`text-sm font-bold mt-1`, { color: theme.text }]}>
                {creatingNew ? 'New structure' : editing?.title || '—'}
              </Text>
              <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                {(editing?.is_active ? 'Active' : 'Draft') +
                  (editing ? ` • ${pickScopeValueFromStructure(editing) || 'All learners'}` : '')}
              </Text>

              <View style={tw`flex-row items-center mt-2`}>
                <Badge theme={theme} tone={editing?.is_active ? 'ok' : 'neutral'} label={editing?.is_active ? 'Active' : 'Draft'} />
                <View style={tw`w-2`} />
                {editing && !editing.is_active ? (
                  <Btn
                    theme={theme}
                    kind="ghost"
                    label="Activate"
                    disabled={!selectedStructureIdNum || structuresSaving}
                    onPress={handleActivateStructure}
                  />
                ) : null}
              </View>
            </View>

            <View style={tw`mt-3`}>
              <Field
                theme={theme}
                label="Title"
                value={structureForm.title}
                onChange={(title: string) => setStructureForm((f) => ({ ...f, title }))}
                placeholder="e.g. Term 1 Fees"
              />

              <Text style={[tw`text-xs uppercase tracking-wider mb-2`, { color: theme.muted }]}>Currency</Text>
              <View style={tw`flex-row flex-wrap`}>
                {['USD', 'KES', 'QAR'].map((cur) => (
                  <Chip
                    key={cur}
                    theme={theme}
                    label={cur}
                    active={structureForm.currency === cur}
                    onPress={() => {
                      setStructureForm((f) => ({ ...f, currency: cur }));
                      setStructureItems((prev: any[]) =>
                        prev.map((it) => ({ ...it, currency: String(it.currency || cur).toUpperCase() })),
                      );
                    }}
                  />
                ))}
              </View>

              <Field
                theme={theme}
                label="Applies to (class / grade / group)"
                value={structureForm.scopeValue}
                onChange={(scopeValue: string) => setStructureForm((f) => ({ ...f, scopeValue }))}
                placeholder="e.g. Grade 6, 6A, Form 2, All"
              />

              <View style={tw`flex-row flex-wrap`}>
                <Chip theme={theme} label="All" active={!structureForm.scopeValue} onPress={() => setStructureForm((f) => ({ ...f, scopeValue: '' }))} />
                {classLabels.slice(0, 8).map((c) => (
                  <Chip
                    key={c}
                    theme={theme}
                    label={c}
                    active={structureForm.scopeValue === c}
                    onPress={() => setStructureForm((f) => ({ ...f, scopeValue: c }))}
                  />
                ))}
              </View>

              <Field
                theme={theme}
                label="Effective term"
                value={structureForm.effective_term}
                onChange={(effective_term: string) => setStructureForm((f) => ({ ...f, effective_term }))}
                placeholder="e.g. 2025 Term 1"
              />

              <Field
                theme={theme}
                label="Description"
                value={structureForm.description}
                onChange={(description: string) => setStructureForm((f) => ({ ...f, description }))}
                placeholder="Optional notes"
              />

              <Divider theme={theme} />

              <View style={tw`flex-row items-center justify-between`}>
                <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>Line items</Text>
                <TouchableOpacity
                  onPress={() => setStructureItems((prev: any[]) => [...prev, { ...emptyItem(structureForm.currency), currency: structureForm.currency }])}
                >
                  <Text style={[tw`text-sm font-semibold`, { color: theme.primary }]}>+ Add item</Text>
                </TouchableOpacity>
              </View>

              <View style={tw`mt-2`}>
                {structureItems.map((item: any, idx: number) => {
                  const amountMajor =
                    Number(item?.amount_cents || 0) > 0 ? (Number(item.amount_cents) / 100).toString() : '';

                  return (
                    <View key={`item-${idx}`} style={[tw`rounded-3xl border p-3 mb-2`, { borderColor: theme.border }]}>
                      <Field
                        theme={theme}
                        label="Label"
                        value={String(item?.label || '')}
                        onChange={(label: string) =>
                          setStructureItems((prev: any[]) => prev.map((it, i) => (i === idx ? { ...it, label } : it)))
                        }
                        placeholder="Tuition"
                      />

                      <Field
                        theme={theme}
                        label="Amount"
                        value={amountMajor}
                        onChange={(v: string) =>
                          setStructureItems((prev: any[]) =>
                            prev.map((it, i) => (i === idx ? { ...it, amount_cents: toCents(v) } : it)),
                          )
                        }
                        placeholder="0.00"
                      />

                      <Field
                        theme={theme}
                        label="Cadence (optional)"
                        value={String(item?.cadence || '')}
                        onChange={(cadence: string) =>
                          setStructureItems((prev: any[]) => prev.map((it, i) => (i === idx ? { ...it, cadence } : it)))
                        }
                        placeholder="per term"
                      />

                      <View style={tw`flex-row items-center justify-between`}>
                        <CircleCheckbox
                          theme={theme}
                          checked={!!item?.is_optional}
                          label="Optional"
                          onChange={(next: boolean) =>
                            setStructureItems((prev: any[]) => prev.map((it, i) => (i === idx ? { ...it, is_optional: next } : it)))
                          }
                        />

                        <TouchableOpacity
                          onPress={() =>
                            setStructureItems((prev: any[]) => (prev.length === 1 ? [emptyItem(structureForm.currency)] : prev.filter((_, i) => i !== idx)))
                          }
                        >
                          <Text style={[tw`text-sm font-semibold`, { color: theme.badText }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={[tw`rounded-3xl border p-3`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}>
                <Tiny theme={theme}>Live total</Tiny>
                <Text style={[tw`text-xl font-bold mt-1`, { color: theme.text }]}>
                  {moneyFromCents(totalStructure, structureForm.currency)}
                </Text>

                <View style={tw`mt-3`}>
                  <Btn
                    theme={theme}
                    kind="ghost"
                    label="New structure"
                    onPress={() => {
                      setCreatingNew(true);
                      setSelectedStructureId(null);

                      setStructureForm({
                        title: '',
                        description: '',
                        currency: 'USD',
                        effective_term: '',
                        scopeValue: '',
                      });
                      setStructureItems([emptyItem('USD')]);
                    }}
                  />
                </View>

                <View style={tw`mt-2`}>
                  <Btn
                    theme={theme}
                    kind="ghost"
                    disabled={structuresSaving || !structureForm.title?.trim()}
                    label={structuresSaving ? 'Saving…' : 'Save draft'}
                    onPress={() => handleSaveStructure({ forceActive: false })}
                  />
                </View>

                <View style={tw`mt-2`}>
                  <Btn
                    theme={theme}
                    kind="primary"
                    disabled={structuresSaving || !structureForm.title?.trim()}
                    label={structuresSaving ? 'Saving…' : 'Save & activate'}
                    onPress={() => handleSaveStructure({ forceActive: true })}
                  />
                </View>

                <View style={tw`mt-2`}>
                  <Btn
                    theme={theme}
                    kind="ghost"
                    disabled={!selectedStructureIdNum || structuresLoading}
                    label="Structure PDF"
                    onPress={async () => {
                      if (!selectedStructureIdNum || !Number.isFinite(selectedStructureIdNum)) return;
                      try {
                        // NOTE: This may be web-oriented in your shared hook.
                        // If it fails on native, we’ll swap it to an Expo FileSystem + Sharing implementation.
                        await downloadStructurePdf(selectedStructureIdNum, 'fee-structure.pdf');
                      } catch (e: any) {
                        Alert.alert('PDF', e?.message || 'PDF download not configured for mobile yet.');
                      }
                    }}
                  />
                </View>
              </View>

              <Divider theme={theme} />

              <Text style={[tw`text-sm font-bold mb-2`, { color: theme.text }]}>Existing structures</Text>
              {structuresLoading ? <ActivityIndicator /> : null}

              {(structures || []).map((s: any) => (
                <TouchableOpacity
                  key={String(s.id)}
                  onPress={() => {
                    setCreatingNew(false);
                    setSelectedStructureId(String(s.id));
                  }}
                  style={[
                    tw`rounded-3xl border p-3 mb-2`,
                    {
                      borderColor: selectedStructureId && sameId(selectedStructureId, s.id) ? theme.primary : theme.border,
                      backgroundColor: selectedStructureId && sameId(selectedStructureId, s.id) ? theme.primarySoft : 'transparent',
                    },
                  ]}
                >
                  <Text style={[tw`text-sm font-bold`, { color: theme.text }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                    {(pickScopeValueFromStructure(s) ? `Applies to: ${pickScopeValueFromStructure(s)}` : 'Applies to: All learners') +
                      ` • ${String(s.currency || 'USD').toUpperCase()}`}
                  </Text>

                  <View style={tw`flex-row flex-wrap mt-2`}>
                    <Badge theme={theme} tone={s.is_active ? 'ok' : 'neutral'} label={s.is_active ? 'Active' : 'Draft'} />
                    {s.effective_term ? (
                      <View style={tw`ml-2`}>
                        <Badge theme={theme} tone="neutral" label={String(s.effective_term)} />
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}

              {!structures?.length && !structuresLoading ? (
                <Text style={[tw`text-sm`, { color: theme.subtext }]}>No fee structures yet. Create one above.</Text>
              ) : null}
            </View>
          </Card>
        </View>

        {/* Quick actions */}
        <View style={tw`mt-4`}>
          <Card theme={theme}>
            <H theme={theme}>Quick actions</H>
            <P theme={theme}>Charges, payments, balances, and statements.</P>

            <Divider theme={theme} />

            <View style={tw`flex-row flex-wrap`}>
              <Chip theme={theme} label={balancesLoading ? 'Refreshing…' : 'Refresh balances'} active={false} onPress={fetchBalances} />
              <Chip
                theme={theme}
                label="Record payment"
                active={false}
                onPress={() => openPayment(selectedLearnerId || undefined)}
              />
              <Chip
                theme={theme}
                label="New charge"
                active={false}
                onPress={() => openCharge(selectedLearnerId || undefined)}
              />
              <Chip
                theme={theme}
                label="Open statement"
                active={false}
                disabled={!selectedLearnerId}
                onPress={() => selectedLearnerId && openStatement(selectedLearnerId)}
              />
            </View>

            <Text style={[tw`text-xs mt-2`, { color: theme.muted }]}>
              Tip: select a learner below, then open Statement.
            </Text>
          </Card>
        </View>

        {/* Balances */}
        <View style={tw`mt-4`}>
          <Card theme={theme}>
            <H theme={theme}>Balances</H>
            <P theme={theme}>Search learners and open statements.</P>

            <Divider theme={theme} />

            <Field
              theme={theme}
              label="Search"
              value={q}
              onChange={setQ}
              placeholder="Name, ID, admission, or class"
            />

            <Text style={[tw`text-xs uppercase tracking-wider mb-2`, { color: theme.muted }]}>Class filter</Text>
            <View style={tw`flex-row flex-wrap`}>
              <Chip theme={theme} label="All" active={classFilter === 'all'} onPress={() => setClassFilter('all')} />
              {classLabels.slice(0, 10).map((c) => (
                <Chip key={c} theme={theme} label={c} active={classFilter === c} onPress={() => setClassFilter(c)} />
              ))}
            </View>

            <View style={tw`mt-2 flex-row items-center justify-between`}>
              <Text style={[tw`text-xs`, { color: theme.muted }]}>
                {balancesLoading ? 'Refreshing balances…' : learnerRangeText}
              </Text>

              <View style={tw`flex-row items-center`}>
                <TouchableOpacity
                  disabled={learnerPage <= 1}
                  onPress={() => setLearnerPage((p) => Math.max(1, p - 1))}
                  style={[tw`px-3 py-2 rounded-2xl border`, { borderColor: theme.border, opacity: learnerPage <= 1 ? 0.5 : 1 }]}
                >
                  <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>Prev</Text>
                </TouchableOpacity>

                <Text style={[tw`text-xs mx-2`, { color: theme.muted }]}>
                  {learnerPage}/{totalLearnerPages}
                </Text>

                <TouchableOpacity
                  disabled={learnerPage >= totalLearnerPages}
                  onPress={() => setLearnerPage((p) => Math.min(totalLearnerPages, p + 1))}
                  style={[
                    tw`px-3 py-2 rounded-2xl border`,
                    { borderColor: theme.border, opacity: learnerPage >= totalLearnerPages ? 0.5 : 1 },
                  ]}
                >
                  <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Divider theme={theme} />

            {rosterQuery.isLoading ? (
              <ActivityIndicator />
            ) : filtered.length === 0 ? (
              <Text style={[tw`text-sm`, { color: theme.subtext }]}>No learners match your search.</Text>
            ) : (
              <View>
                {paginatedFiltered.map((r) => {
                  const feeLearnerId = r.feeLearnerId;
                  const isSelected = selectedLearnerId && feeLearnerId === selectedLearnerId;

                  const chargeRows = (r.currencies || []).map((x: any) => ({ currency: x.currency, value: Number(x.charges || 0) }));
                  const paymentRows = (r.currencies || []).map((x: any) => ({ currency: x.currency, value: Number(x.payments || 0) }));
                  const balanceRows = (r.currencies || []).map((x: any) => ({ currency: x.currency, value: Number(x.balance || 0) }));
                  const maxBal = maxCurrencyValue(balanceRows);

                  return (
                    <TouchableOpacity
                      key={String(feeLearnerId)}
                      onPress={() => setSelectedLearnerId(feeLearnerId)}
                      style={[
                        tw`rounded-3xl border p-3 mb-2`,
                        {
                          borderColor: isSelected ? theme.primary : theme.border,
                          backgroundColor: isSelected ? theme.primarySoft : 'transparent',
                        },
                      ]}
                    >
                      <View style={tw`flex-row items-start justify-between`}>
                        <View style={tw`flex-1 pr-3`}>
                          <Text style={[tw`text-sm font-bold`, { color: theme.text }]} numberOfLines={1}>
                            {r.name}
                          </Text>
                          <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                            {r.class_label || '—'} • ADM: {r.admission_code || '—'}
                          </Text>
                          <Text style={[tw`text-[11px] mt-1`, { color: theme.muted }]} numberOfLines={1}>
                            Internal: {String(r.feeLearnerId)}
                          </Text>
                        </View>

                        <Badge
                          theme={theme}
                          tone={maxBal > 0 ? 'warn' : 'ok'}
                          label={maxBal > 0 ? 'Owes' : 'Clear'}
                        />
                      </View>

                      <View style={tw`mt-3 flex-row`}>
                        <View style={tw`flex-1`}>
                          <Tiny theme={theme}>Charges</Tiny>
                          <MoneyStack theme={theme} rows={chargeRows} />
                        </View>
                        <View style={tw`flex-1`}>
                          <Tiny theme={theme}>Payments</Tiny>
                          <MoneyStack theme={theme} rows={paymentRows} />
                        </View>
                        <View style={tw`flex-1`}>
                          <Tiny theme={theme}>Balance</Tiny>
                          <MoneyStack theme={theme} rows={balanceRows} />
                        </View>
                      </View>

                      <View style={tw`mt-3 flex-row flex-wrap`}>
                        <View style={tw`flex-1 mr-2`}>
                          <Btn theme={theme} kind="primary" label="Charge" onPress={() => openCharge(feeLearnerId)} />
                        </View>
                        <View style={tw`flex-1 mr-2`}>
                          <Btn theme={theme} kind="dark" label="Pay" onPress={() => openPayment(feeLearnerId)} />
                        </View>
                        <View style={tw`flex-1`}>
                          <Btn theme={theme} kind="ghost" label="Statement" onPress={() => openStatement(feeLearnerId)} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Card>
        </View>
      </ScrollView>

      {/* ─────────────────────────────
       * Charge modal
       * ───────────────────────────── */}
      {mode === 'charge' ? (
        <ResponsiveChargeModal
          title={`Create charge${selectedLearner ? ` • ${pickLearnerName(selectedLearner)}` : ''}`}
          onClose={() => setMode('none')}
          learners={learners}
          classLabels={classLabels}
          selectedLearnerId={selectedLearnerId}
          defaultCurrency={activeStructureCurrency}
          currencyHintForLearner={currencyHintForLearner}
          learnerCurrenciesMap={learnerCurrenciesMap}
          onCharge={async (payload, isBulk) => {
            await addCharge(payload);        // assumes backend accepts bulk if payload.learner_ids exists
            await fetchBalances();
            if (!isBulk && payload?.learner_id) await fetchStatement(payload.learner_id);
          }}
          theme={theme}
        />
      ) : null}


      {/* ─────────────────────────────
       * Payment modal
       * ───────────────────────────── */}
            {mode === 'payment' ? (
          <ResponsivePaymentModal
            title={`Record payment${selectedLearner ? ` • ${pickLearnerName(selectedLearner)}` : ''}`}
            onClose={() => setMode('none')}
            learners={learners}
            selectedLearnerId={selectedLearnerId}
            defaultCurrency={activeStructureCurrency}
            currencyHintForLearner={currencyHintForLearner}
            learnerCurrenciesMap={learnerCurrenciesMap}
            onPayment={async (payload) => {
              await addPayment(payload);
              await fetchBalances();
              if (payload?.learner_id) await fetchStatement(payload.learner_id);
            }}
            theme={theme}
          />
        ) : null}


      {/* ─────────────────────────────
       * Statement modal
       * ───────────────────────────── */}
     {mode === 'statement' ? (
            <StatementModal
              title={`Statement${selectedLearner ? ` • ${pickLearnerName(selectedLearner)}` : ''}`}
              onClose={() => setMode('none')}
              learnerId={selectedLearnerId}
              charges={charges}
              payments={payments}
              loading={statementLoading}
              onOpenCharge={() => setMode('charge')}
              onOpenPayment={() => setMode('payment')}
              onDownload={() => downloadStatementPdf(selectedLearnerId, 'fee-statement.pdf')}
              onPrint={() => {}}
              theme={theme}
            />
          ) : null}


      {/* ─────────────────────────────
       * Unmatched modal
       * ───────────────────────────── */}
      {unmatchedOpen ? (
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
              theme={theme}
            />
          ) : null}

    </View>
  );
}

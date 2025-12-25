import React from 'react';
import { ActivityIndicator, Image, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import tw from '../../../tailwind';

import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  apiGetMyFeeStatement,
  apiGetMyFeeStructure,
} from '@mytutorapp/shared/api/orgProApi';

import { useFeeTheme, EmptyState } from './OrgFees.ui.native';
import { moneyFromCents } from './OrgFees.shared.native';

/* ─────────────────────────────────────────────
 * Helpers (same logic as web)
 * ───────────────────────────────────────────── */

function sanitizeFilenamePart(s: string) {
  return String(s || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function pickNumber(...xs: any[]) {
  for (const x of xs) {
    const n = Number(x);
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  return 0;
}

function pickString(...xs: any[]) {
  for (const x of xs) {
    const s = typeof x === 'string' ? x : x == null ? '' : String(x);
    if (s.trim()) return s.trim();
  }
  return '';
}

function pickArray(...xs: any[]) {
  for (const x of xs) if (Array.isArray(x)) return x;
  return [];
}

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/g, '');
  const p = String(path || '').replace(/^\/+/g, '');
  return `${b}/${p}`;
}

async function downloadAndOpenPdf({
  backendUrl,
  orgId,
  orgToken,
  kind,
  filename,
}: {
  backendUrl: string;
  orgId: string;
  orgToken: string;
  kind: 'statement' | 'structure';
  filename: string; // without .pdf
}) {
  const endpoint =
    kind === 'statement'
      ? `/api/orgs/${orgId}/fees/learner/statement.pdf`
      : `/api/orgs/${orgId}/fees/learner/structure.pdf`;

  const url = joinUrl(backendUrl, endpoint);

  const safeName = (filename || 'file')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'file';

  const outUri = `${FileSystem.documentDirectory}${safeName}.pdf`;

  // 1) download with auth header
  const res = await FileSystem.downloadAsync(url, outUri, {
    headers: { Authorization: `Bearer ${orgToken}` },
  });

  // 2) try open
  try {
    const canOpen = await Linking.canOpenURL(res.uri);
    if (canOpen) {
      await Linking.openURL(res.uri);
      return res.uri;
    }
  } catch {
    // fallthrough
  }

  // 3) fallback: copy path so user can access it
  await Clipboard.setStringAsync(res.uri);

  Alert.alert(
    'PDF downloaded',
    Platform.OS === 'android'
      ? 'Saved to app storage. We couldn’t open it automatically. The file path has been copied to your clipboard.'
      : 'Saved to app storage. We couldn’t open it automatically. The file path has been copied to your clipboard.',
    [{ text: 'OK' }],
  );

  return res.uri;
}


/* ─────────────────────────────────────────────
 * Small themed UI atoms
 * ───────────────────────────────────────────── */

function Card({ theme, children }: any) {
  return (
    <View
      style={[
        tw`rounded-3xl border p-4`,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      {children}
    </View>
  );
}

function PillSwitch({
  theme,
  value,
  onChange,
}: {
  theme: any;
  value: 'statement' | 'structure';
  onChange: (v: 'statement' | 'structure') => void;
}) {
  const activeBg = theme.dark ? '#ffffff' : '#0f172a';
  const activeText = theme.dark ? '#0b1220' : '#ffffff';

  return (
    <View
      style={[
        tw`flex-row rounded-full border p-1`,
        { borderColor: theme.border, backgroundColor: theme.primarySoft },
      ]}
    >
      {(['statement', 'structure'] as const).map((k) => {
        const active = value === k;
        return (
          <TouchableOpacity
            key={k}
            onPress={() => onChange(k)}
            style={[
              tw`px-4 py-2 rounded-full`,
              { backgroundColor: active ? activeBg : 'transparent' },
            ]}
          >
            <Text
              style={[
                tw`text-xs font-semibold`,
                { color: active ? activeText : theme.text },
              ]}
            >
              {k === 'statement' ? 'Statement' : 'Fee structure'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function GhostBtn({ theme, label, onPress, disabled }: any) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        tw`px-3 py-2 rounded-2xl border`,
        {
          borderColor: theme.border,
          backgroundColor: theme.primarySoft,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SolidBtn({ theme, label, onPress, disabled, tone }: any) {
  const bg =
    tone === 'emerald' ? '#059669' : tone === 'sky' ? '#0284c7' : theme.primary;

  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        tw`px-4 py-3 rounded-2xl`,
        { backgroundColor: disabled ? theme.border : bg, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={tw`text-sm font-semibold text-white`}>{label}</Text>
    </TouchableOpacity>
  );
}

function Notice({ theme, tone, children }: any) {
  const bg =
    tone === 'warn'
      ? theme.warnBg
      : tone === 'bad'
        ? theme.badBg
        : theme.primarySoft;
  const border =
    tone === 'warn'
      ? theme.warnBorder
      : tone === 'bad'
        ? theme.badBorder
        : theme.border;
  const text =
    tone === 'warn'
      ? theme.warnText
      : tone === 'bad'
        ? theme.badText
        : theme.text;

  return (
    <View style={[tw`rounded-2xl border p-3`, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[tw`text-sm`, { color: text }]}>{children}</Text>
    </View>
  );
}

function MiniStat({ theme, label, value }: any) {
  return (
    <View style={[tw`flex-1 rounded-2xl border p-3`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}>
      <Text style={[tw`text-xs`, { color: theme.muted }]}>{label}</Text>
      <Text style={[tw`text-lg font-bold mt-1`, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

/* ─────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────── */

export default function OrgLearnerFeesNative() {
  const theme = useFeeTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  const { org, role, currentUser } = (useOrg?.() ?? {}) as any;

  const {
    backendUrl,
    orgToken,
    userId: ctxUserId,
    user: shopUser,
    orgLearner: ctxOrgLearner,
    orgUser: ctxOrgUser,
  } = (useShopContext?.() ?? {}) as any;

  const orgId = org?.id ? String(org.id) : '';
  const plan = String(org?.tier || '').toLowerCase();
  const isProTier = plan === 'pro' || plan === 'enterprise';

  const [view, setView] = React.useState<'statement' | 'structure'>('statement');

  // native params (support: route.params?.studentId)
  const rawStudentIdParam =
    route?.params?.studentId ?? route?.params?.student_id ?? '';

  // Resolve learner identity (same strategy as web)
  const learnerProfileFromOrg =
    (currentUser as any)?.org_learner_profile ||
    (currentUser as any)?.orgLearnerProfile ||
    (currentUser as any)?.org_learner_profiles?.[0] ||
    null;

  const learnerProfileFromShop =
    (shopUser as any)?.org_learner_profile ||
    (shopUser as any)?.orgLearnerProfile ||
    (shopUser as any)?.org_learner_profiles?.[0] ||
    null;

  const learner: any =
    learnerProfileFromOrg ||
    learnerProfileFromShop ||
    ctxOrgLearner ||
    ctxOrgUser ||
    shopUser ||
    currentUser ||
    null;

  const learnerUserBase: any = shopUser || currentUser || ctxOrgUser || null;

  const learnerUserId: number | string | null =
    learner?.user_id ??
    learner?.student_user_id ??
    learner?.userId ??
    learner?.id ??
    ctxUserId ??
    shopUser?.id ??
    shopUser?.user_id ??
    shopUser?.userId ??
    null;

  const learnerStudentId: string =
    rawStudentIdParam && String(rawStudentIdParam).trim() !== ''
      ? String(rawStudentIdParam).trim()
      : learnerUserId != null
        ? String(learnerUserId)
        : '';

  const learnerName: string =
    learnerUserBase?.name ||
    learner?.name ||
    learner?.full_name ||
    learner?.fullName ||
    learnerUserBase?.email ||
    learner?.email ||
    'Learner';

  const learnerEmail: string =
    learnerUserBase?.email ||
    learner?.email ||
    learnerUserBase?.email_address ||
    learner?.email_address ||
    learner?.guardian_email ||
    '';

  const learnerGrade: string =
    learner?.class_label || learner?.classLabel || learner?.grade || '';

  const admissionCode: string =
    learner?.admission_code || learner?.admissionCode || '';

  const learnerPhoto: string =
    (learnerProfileFromOrg &&
      (learnerProfileFromOrg.photo_url || learnerProfileFromOrg.photoUrl)) ||
    (learnerProfileFromShop &&
      (learnerProfileFromShop.photo_url || learnerProfileFromShop.photoUrl)) ||
    learner?.photo_url ||
    learner?.photoUrl ||
    '';

  const learnerInitial = (learnerName || 'L').trim().charAt(0).toUpperCase();

  // Queries
  const statementQ = useQuery({
    queryKey: ['org-my-fee-statement-native', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId && isProTier,
    queryFn: async () => apiGetMyFeeStatement(backendUrl, String(orgId), orgToken),
  });

  const structureQ = useQuery({
    queryKey: ['org-my-fee-structure-native', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId && isProTier,
    queryFn: async () => apiGetMyFeeStructure(backendUrl, String(orgId), orgToken),
  });

  const statement: any = statementQ.data || null;
  const structure: any = structureQ.data || null;

  // Statement compute
  const summaryBy = pickArray(statement?.summary_by_currency, statement?.summaryByCurrency, []);
  const summary0 = summaryBy?.[0] || null;

  const primaryCurrency = pickString(
    statement?.summary?.currency,
    statement?.currency,
    summary0?.currency,
    'KES',
  );

  const billedCents = pickNumber(
    statement?.summary?.total_charges,
    summary0?.total_charges,
    statement?.summary?.billed_cents,
    statement?.summary?.billedCents,
    statement?.charges_total_cents,
    statement?.chargesTotalCents,
  );

  const paidCents = pickNumber(
    statement?.summary?.total_payments,
    summary0?.total_payments,
    statement?.summary?.paid_cents,
    statement?.summary?.paidCents,
    statement?.payments_total_cents,
    statement?.paymentsTotalCents,
  );

  const balanceCents = pickNumber(
    statement?.summary?.balance,
    summary0?.balance,
    statement?.summary?.balance_cents,
    statement?.summary?.balanceCents,
    statement?.balance_cents,
    statement?.balanceCents,
    billedCents - paidCents,
  );

  const charges = pickArray(statement?.charges, statement?.items?.charges, statement?.statement?.charges);
  const payments = pickArray(statement?.payments, statement?.items?.payments, statement?.statement?.payments);

  // Structure compute
  const structureItems = pickArray(structure?.items, structure?.structure?.items, []);
  const structureTitle = pickString(structure?.title, structure?.structure?.title, 'Fee structure');
  const structureTerm = pickString(structure?.effective_term, structure?.effectiveTerm, '');
  const structureDesc = pickString(structure?.description, structure?.note, '');
  const structureScopeType = pickString(structure?.scope_type, structure?.scopeType, '');
  const structureScopeValue = pickString(structure?.scope_value, structure?.scopeValue, '');

  const structureTotalCents = React.useMemo(() => {
    return (structureItems || []).reduce((acc: number, it: any) => {
      const amt = pickNumber(it?.amount_cents, it?.amountCents, it?.amount, 0);
      return acc + amt;
    }, 0);
  }, [structureItems]);

  const structureCurrency = pickString(
    structure?.currency,
    structure?.structure?.currency,
    structureItems?.[0]?.currency,
    'KES',
  );

  // Downloads
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const [downloadingStructure, setDownloadingStructure] = React.useState(false);
  const [downloadStructureError, setDownloadStructureError] = React.useState<string | null>(null);

  const portalLabel = role ? `${String(role).toUpperCase()} PORTAL` : 'LEARNER PORTAL';
  const planLabel = org?.tier ? String(org.tier).toUpperCase() : 'STARTER';

  const onDownloadStatement = React.useCallback(async () => {
    setDownloadError(null);
    if (!backendUrl || !orgToken || !orgId || !learnerStudentId) return;

    setDownloading(true);
    try {
      const safeOrg = sanitizeFilenamePart(org?.name || 'org');
      const safeAdm = sanitizeFilenamePart(admissionCode || learnerStudentId);
      const filename = `fee-statement-${safeOrg}-${safeAdm}`;

      await downloadAndOpenPdf({
        backendUrl,
        orgId: String(orgId),
        orgToken,
        kind: 'statement',
        filename,
      });
    } catch (e: any) {
      setDownloadError(String(e?.message || e || 'Failed to download PDF.'));
    } finally {
      setDownloading(false);
    }
  }, [backendUrl, orgToken, orgId, learnerStudentId, org?.name, admissionCode]);

  const onDownloadStructure = React.useCallback(async () => {
    setDownloadStructureError(null);
    if (!backendUrl || !orgToken || !orgId) return;

    setDownloadingStructure(true);
    try {
      const safeOrg = sanitizeFilenamePart(org?.name || 'org');
      const safeAdm = sanitizeFilenamePart(admissionCode || learnerStudentId || 'learner');
      const filename = `fee-structure-${safeOrg}-${safeAdm}`;

      await downloadAndOpenPdf({
        backendUrl,
        orgId: String(orgId),
        orgToken,
        kind: 'structure',
        filename,
      });
    } catch (e: any) {
      setDownloadStructureError(String(e?.message || e || 'Failed to download structure PDF.'));
    } finally {
      setDownloadingStructure(false);
    }
  }, [backendUrl, orgToken, orgId, org?.name, admissionCode, learnerStudentId]);

  return (
    <View style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={tw`px-3 py-6`}>
        <View style={tw`max-w-[920px] w-full self-center space-y-4`}>
          {/* Header */}
          <Card theme={theme}>
            <View style={tw`flex-row items-start justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={[tw`text-[11px] font-semibold tracking-widest`, { color: theme.subtext }]}>
                  {portalLabel} • FEES
                </Text>
                <Text style={[tw`text-xl font-bold mt-1`, { color: theme.text }]} numberOfLines={1}>
                  {org?.name || 'Your Institution'}
                </Text>
                <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>{planLabel} plan</Text>
              </View>

              <View style={tw`items-end`}>
                <GhostBtn
                  theme={theme}
                  label="← Back"
                  onPress={() => {
                    if (nav.canGoBack?.()) nav.goBack();
                    else nav.navigate?.('OrgElearnPortal');
                  }}
                />
              </View>
            </View>
          </Card>

          {/* Learner identity */}
          <Card theme={theme}>
            <View style={tw`flex-row items-center`}>
              <View
                style={[
                  tw`h-14 w-14 rounded-2xl items-center justify-center overflow-hidden border`,
                  { backgroundColor: theme.primarySoft, borderColor: theme.border },
                ]}
              >
                {learnerPhoto ? (
                  <Image source={{ uri: learnerPhoto }} style={tw`h-full w-full`} resizeMode="cover" />
                ) : (
                  <Text style={tw`text-xl font-bold text-white`}>{learnerInitial}</Text>
                )}
              </View>

              <View style={tw`flex-1 ml-3`}>
                <Text style={[tw`text-[11px] font-semibold tracking-widest`, { color: theme.subtext }]}>
                  Fee statement for
                </Text>

                <View style={tw`flex-row flex-wrap items-center mt-1`}>
                  <Text style={[tw`text-lg font-semibold mr-2`, { color: theme.text }]} numberOfLines={1}>
                    {learnerName}
                  </Text>

                  {learnerGrade ? (
                    <View
                      style={[
                        tw`px-2 py-1 rounded-full border`,
                        { borderColor: 'rgba(16,185,129,0.35)', backgroundColor: theme.okBg },
                      ]}
                    >
                      <Text style={[tw`text-[11px] font-semibold`, { color: theme.okText }]}>
                        Grade / Class: {learnerGrade}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={tw`mt-2`}>
                  <Text style={[tw`text-xs`, { color: theme.subtext }]}>
                    <Text style={{ opacity: 0.8 }}>📧 Email: </Text>
                    <Text style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) }}>
                      {learnerEmail || 'No email on file yet – ask your teacher to update it.'}
                    </Text>
                  </Text>

                  {admissionCode ? (
                    <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                      <Text style={{ opacity: 0.8 }}>🆔 Admission No: </Text>
                      <Text style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) }}>
                        {admissionCode}
                      </Text>
                    </Text>
                  ) : null}

                  <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                    <Text style={{ opacity: 0.8 }}>Student ID: </Text>
                    <Text style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) }}>
                      {learnerStudentId || '—'}
                    </Text>
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          {/* Switcher */}
          <Card theme={theme}>
            <View style={tw`flex-row items-center justify-between`}>
              <PillSwitch theme={theme} value={view} onChange={setView} />
              <Text style={[tw`text-[11px]`, { color: theme.muted }]}>
                {view === 'statement' ? 'Your history' : 'Official breakdown'}
              </Text>
            </View>

            <Text style={[tw`text-sm mt-3`, { color: theme.subtext }]}>
              {view === 'statement'
                ? 'This shows charges and payments recorded by the school.'
                : 'This shows the school’s current fee breakdown for your class/grade.'}
            </Text>
          </Card>

          {/* Pro gating */}
          {!isProTier ? (
            <Card theme={theme}>
              <Notice theme={theme} tone="warn">
                This institution’s fees module is available on <Text style={tw`font-bold`}>Pro/Enterprise</Text>. If you
                need fee details here, ask your admin.
              </Notice>
            </Card>
          ) : !learnerStudentId ? (
            <Card theme={theme}>
              <Notice theme={theme} tone="bad">
                Could not determine your student ID. Please sign out and use the correct learner login card (or open this
                page with a passed param).
              </Notice>
            </Card>
          ) : view === 'structure' ? (
            <>
              {/* STRUCTURE VIEW */}
              {structureQ.isLoading ? (
                <Card theme={theme}>
                  <View style={tw`py-2`}>
                    <Text style={[tw`text-sm`, { color: theme.subtext }]}>Loading fee structure…</Text>
                    <View style={tw`mt-3`}>
                      <ActivityIndicator />
                    </View>
                  </View>
                </Card>
              ) : structureQ.error ? (
                <Card theme={theme}>
                  <Notice theme={theme} tone="bad">
                    Could not load fee structure.{' '}
                    <Text style={{ color: theme.subtext }}>
                      {String((structureQ.error as any)?.message || structureQ.error)}
                    </Text>
                  </Notice>
                </Card>
              ) : !structure || (!structureItems?.length && !structure?.title) ? (
                <Card theme={theme}>
                  <EmptyState
                    theme={theme}
                    title="No fee structure yet"
                    body="No fee structure has been published for your class yet. Please ask the school office."
                  />
                </Card>
              ) : (
                <Card theme={theme}>
                  <View style={tw`flex-row items-start justify-between`}>
                    <View style={tw`flex-1 pr-3`}>
                      <Text style={[tw`text-lg font-semibold`, { color: theme.text }]} numberOfLines={1}>
                        {structureTitle}
                      </Text>

                      <View style={tw`mt-2`}>
                        {structureTerm ? (
                          <Text style={[tw`text-xs`, { color: theme.subtext }]}>
                            Term: <Text style={{ color: theme.text }}>{structureTerm}</Text>
                          </Text>
                        ) : null}

                        {structureScopeType || structureScopeValue ? (
                          <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                            Applies to:{' '}
                            <Text style={{ color: theme.text }}>
                              {structureScopeType ? structureScopeType.toUpperCase() : 'SCOPE'}
                              {structureScopeValue ? ` • ${structureScopeValue}` : ''}
                            </Text>
                          </Text>
                        ) : null}

                        {structureDesc ? (
                          <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>{structureDesc}</Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={tw`items-end`}>
                      <View style={tw`flex-row`}>
                        <View style={tw`mr-2`}>
                          <GhostBtn theme={theme} label="Refresh" onPress={() => structureQ.refetch()} />
                        </View>
                      </View>

                      <View style={tw`mt-2`}>
                        <SolidBtn
                          theme={theme}
                          tone="sky"
                          disabled={downloadingStructure}
                          label={downloadingStructure ? 'Preparing…' : '⬇️ Structure PDF'}
                          onPress={onDownloadStructure}
                        />
                      </View>
                    </View>
                  </View>

                  {downloadStructureError ? (
                    <View style={tw`mt-3`}>
                      <Notice theme={theme} tone="bad">
                        {downloadStructureError}
                      </Notice>
                    </View>
                  ) : null}

                  {/* Total + Breakdown */}
                  <View style={tw`mt-4`}>
                    <View style={tw`flex-row`}>
                      <MiniStat
                        theme={theme}
                        label="Total"
                        value={moneyFromCents(structureTotalCents, structureCurrency)}
                      />
                    </View>

                    <Text style={[tw`text-xs mt-3`, { color: theme.muted }]}>
                      Optional items may not be required.
                    </Text>

                    <View style={[tw`mt-4 rounded-3xl border overflow-hidden`, { borderColor: theme.border }]}>
                      <View style={[tw`px-3 py-2`, { backgroundColor: theme.primarySoft }]}>
                        <Text style={[tw`text-xs`, { color: theme.subtext }]}>Breakdown</Text>
                      </View>

                      {(structureItems || []).map((it: any, idx: number) => {
                        const label = pickString(it?.label, it?.name, `Item ${idx + 1}`);
                        const amt = pickNumber(it?.amount_cents, it?.amountCents, it?.amount, 0);
                        const cur = pickString(it?.currency, structureCurrency);
                        const cadence = pickString(it?.cadence, '');
                        const isOpt = Boolean(it?.is_optional ?? it?.isOptional);

                        return (
                          <View
                            key={it?.id ?? `${label}-${idx}`}
                            style={[tw`px-3 py-3 border-t`, { borderTopColor: theme.border }]}
                          >
                            <View style={tw`flex-row items-start justify-between`}>
                              <View style={tw`flex-1 pr-3`}>
                                <Text style={[tw`text-sm font-semibold`, { color: theme.text }]} numberOfLines={1}>
                                  {label}
                                </Text>
                                <Text style={[tw`text-[11px] mt-1`, { color: theme.muted }]}>
                                  {cadence ? cadence : '—'} • {isOpt ? 'Optional' : 'Required'}
                                </Text>
                              </View>
                              <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>
                                {moneyFromCents(amt, cur)}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    <Text style={[tw`text-[11px] mt-3`, { color: theme.muted }]}>
                      Tip: “Fee structure” is the published plan. Your “Statement” reflects what has actually been billed/paid.
                    </Text>
                  </View>
                </Card>
              )}
            </>
          ) : (
            <>
              {/* STATEMENT VIEW */}
              {statementQ.isLoading ? (
                <Card theme={theme}>
                  <View style={tw`py-2`}>
                    <Text style={[tw`text-sm`, { color: theme.subtext }]}>Loading your fee statement…</Text>
                    <View style={tw`mt-3`}>
                      <ActivityIndicator />
                    </View>
                  </View>
                </Card>
              ) : statementQ.error ? (
                <Card theme={theme}>
                  <Notice theme={theme} tone="bad">
                    Could not load fee statement.{' '}
                    <Text style={{ color: theme.subtext }}>
                      {String((statementQ.error as any)?.message || statementQ.error)}
                    </Text>
                  </Notice>
                </Card>
              ) : !statement ? (
                <Card theme={theme}>
                  <EmptyState
                    theme={theme}
                    title="No statement yet"
                    body="No fee statement is available yet. Please ask the school office."
                  />
                </Card>
              ) : (
                <>
                  {/* Summary */}
                  <Card theme={theme}>
                    <View style={tw`flex-row items-start justify-between`}>
                      <View style={tw`flex-1 pr-3`}>
                        <Text style={[tw`text-lg font-semibold`, { color: theme.text }]}>Statement summary</Text>
                        <Text style={[tw`text-sm mt-1`, { color: theme.subtext }]}>
                          Totals are based on charges and payments recorded by the school.
                        </Text>
                      </View>

                      <View style={tw`items-end`}>
                        <View style={tw`flex-row`}>
                          <View style={tw`mr-2`}>
                            <GhostBtn theme={theme} label="Refresh" onPress={() => statementQ.refetch()} />
                          </View>
                        </View>
                        <View style={tw`mt-2`}>
                          <SolidBtn
                            theme={theme}
                            tone="emerald"
                            disabled={downloading}
                            label={downloading ? 'Preparing…' : '⬇️ Download PDF'}
                            onPress={onDownloadStatement}
                          />
                        </View>
                      </View>
                    </View>

                    {downloadError ? (
                      <View style={tw`mt-3`}>
                        <Notice theme={theme} tone="bad">
                          {downloadError}
                        </Notice>
                      </View>
                    ) : null}

                    {summaryBy.length > 1 ? (
                      <View style={tw`mt-4`}>
                        {summaryBy.map((r: any) => (
                          <View
                            key={String(r.currency || '')}
                            style={[
                              tw`rounded-2xl border p-3 mb-3`,
                              { borderColor: theme.border, backgroundColor: theme.primarySoft },
                            ]}
                          >
                            <Text style={[tw`text-xs font-semibold`, { color: theme.subtext }]}>
                              {String(r.currency || '').toUpperCase()}
                            </Text>

                            <View style={tw`mt-2`}>
                              <View style={tw`flex-row justify-between`}>
                                <Text style={[tw`text-sm`, { color: theme.subtext }]}>Total billed</Text>
                                <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>
                                  {moneyFromCents(r.total_charges, r.currency)}
                                </Text>
                              </View>

                              <View style={tw`flex-row justify-between mt-1`}>
                                <Text style={[tw`text-sm`, { color: theme.subtext }]}>Total paid</Text>
                                <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>
                                  {moneyFromCents(r.total_payments, r.currency)}
                                </Text>
                              </View>

                              <View style={tw`flex-row justify-between mt-1`}>
                                <Text style={[tw`text-sm`, { color: theme.subtext }]}>Balance</Text>
                                <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>
                                  {moneyFromCents(r.balance, r.currency)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={tw`mt-4 flex-row`}>
                        <View style={tw`mr-2 flex-1`}>
                          <MiniStat theme={theme} label="Total billed" value={moneyFromCents(billedCents, primaryCurrency)} />
                        </View>
                        <View style={tw`mr-2 flex-1`}>
                          <MiniStat theme={theme} label="Total paid" value={moneyFromCents(paidCents, primaryCurrency)} />
                        </View>
                        <MiniStat theme={theme} label="Balance" value={moneyFromCents(balanceCents, primaryCurrency)} />
                      </View>
                    )}

                    <Text style={[tw`text-[11px] mt-3`, { color: theme.muted }]}>
                      If anything looks wrong, contact the school office. Learners can only view their own statement.
                    </Text>
                  </Card>

                  {/* Charges */}
                  <Card theme={theme}>
                    <Text style={[tw`text-base font-semibold`, { color: theme.text }]}>Recent charges</Text>

                    {charges?.length ? (
                      <View style={[tw`mt-3 rounded-3xl border overflow-hidden`, { borderColor: theme.border }]}>
                        {charges.slice(0, 12).map((c: any, idx: number) => {
                          const desc = pickString(c?.description, c?.label, c?.name, 'Charge');
                          const date = pickString(c?.due_date, c?.date, c?.created_at, '');
                          const amt = pickNumber(c?.amount_cents, c?.amountCents, c?.amount, 0);
                          const rowCur = pickString(c?.currency, primaryCurrency);

                          return (
                            <View
                              key={c?.id ?? `${desc}-${idx}`}
                              style={[tw`px-3 py-3 border-t`, { borderTopColor: idx === 0 ? 'transparent' : theme.border }]}
                            >
                              <View style={tw`flex-row items-start justify-between`}>
                                <View style={tw`flex-1 pr-3`}>
                                  <Text style={[tw`text-sm font-semibold`, { color: theme.text }]} numberOfLines={1}>
                                    {desc}
                                  </Text>
                                  {date ? (
                                    <Text style={[tw`text-[11px] mt-1`, { color: theme.muted }]} numberOfLines={1}>
                                      {date}
                                    </Text>
                                  ) : null}
                                </View>
                                <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>
                                  {moneyFromCents(amt, rowCur)}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={[tw`text-sm mt-2`, { color: theme.subtext }]}>No charges recorded yet.</Text>
                    )}
                  </Card>

                  {/* Payments */}
                  <Card theme={theme}>
                    <Text style={[tw`text-base font-semibold`, { color: theme.text }]}>Recent payments</Text>

                    {payments?.length ? (
                      <View style={[tw`mt-3 rounded-3xl border overflow-hidden`, { borderColor: theme.border }]}>
                        {payments.slice(0, 12).map((p: any, idx: number) => {
                          const method = pickString(p?.method, p?.payment_method, p?.channel, '');
                          const title = method ? `Payment (${method})` : 'Payment';
                          const date = pickString(p?.date, p?.received_at, p?.created_at, '');
                          const amt = pickNumber(p?.amount_cents, p?.amountCents, p?.amount, 0);
                          const rowCur = pickString(p?.currency, primaryCurrency);

                          return (
                            <View
                              key={p?.id ?? `${title}-${idx}`}
                              style={[tw`px-3 py-3 border-t`, { borderTopColor: idx === 0 ? 'transparent' : theme.border }]}
                            >
                              <View style={tw`flex-row items-start justify-between`}>
                                <View style={tw`flex-1 pr-3`}>
                                  <Text style={[tw`text-sm font-semibold`, { color: theme.text }]} numberOfLines={1}>
                                    {title}
                                  </Text>
                                  {date ? (
                                    <Text style={[tw`text-[11px] mt-1`, { color: theme.muted }]} numberOfLines={1}>
                                      {date}
                                    </Text>
                                  ) : null}
                                </View>
                                <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>
                                  {moneyFromCents(amt, rowCur)}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={[tw`text-sm mt-2`, { color: theme.subtext }]}>No payments recorded yet.</Text>
                    )}
                  </Card>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

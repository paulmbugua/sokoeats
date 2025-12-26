/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */

// apps/mobile/src/screens/org/OrgAnnouncements.native.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgAnnouncements } from '@mytutorapp/shared/hooks/useOrgAnnouncements';

import { useThemePref } from '../../theme/ThemeContext';

// Optional but recommended (parity with Newsletter screen)
import { RefreshableScrollView } from '../../refresh/Refreshable';
import { useRegisterScreenRefresh } from '../../refresh/GlobalRefreshProvider';

/* ─────────────────────────────────────────────────────────
 * Helpers (ported)
 * ───────────────────────────────────────────────────────── */

function toIsoOrNull(v: string) {
  const s = String(v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function fmtWhen(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}
function statusBadge(a: any) {
  const st =
    a?.status ||
    (a?.end_at && new Date(a.end_at).getTime() < Date.now()
      ? 'expired'
      : a?.start_at && new Date(a.start_at).getTime() > Date.now()
        ? 'scheduled'
        : 'live');
  return String(st || 'live');
}

/* ─────────────────────────────────────────────────────────
 * Theme + UI bits (aligned to Newsletter screen)
 * ───────────────────────────────────────────────────────── */

const Pill = ({
  label,
  tone,
  theme,
}: {
  label: string;
  tone?: 'base' | 'warn' | 'info';
  theme: any;
}) => {
  const bg = tone === 'warn' ? theme.warnBg : tone === 'info' ? theme.primarySoft : theme.chipBg;
  const border = tone === 'warn' ? theme.warnBorder : tone === 'info' ? theme.primaryBorder : theme.border;
  const color = tone === 'warn' ? theme.warnText : tone === 'info' ? theme.primaryText : theme.subtext;

  return (
    <View style={[tw`px-2 py-1 rounded-full border`, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[tw`text-[11px] font-extrabold`, { color }]}>{label}</Text>
    </View>
  );
};

const Banner = ({
  tone,
  msg,
  theme,
}: {
  tone: 'ok' | 'warn' | 'bad';
  msg: string;
  theme: any;
}) => {
  const bg = tone === 'ok' ? theme.okBg : tone === 'warn' ? theme.warnBg : theme.badBg;
  const border = tone === 'ok' ? theme.okBorder : tone === 'warn' ? theme.warnBorder : theme.badBorder;
  const color = tone === 'ok' ? theme.okText : tone === 'warn' ? theme.warnText : theme.badText;

  return (
    <View style={[tw`rounded-2xl border p-3`, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[tw`text-sm`, { color }]}>{msg}</Text>
    </View>
  );
};

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  theme,
  multiline,
  height,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  theme: any;
  multiline?: boolean;
  height?: number;
}) => (
  <View style={tw`mb-3`}>
    <Text style={[tw`text-xs font-extrabold mb-1`, { color: theme.label }]}>
      {label}
    </Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.placeholder}
      multiline={multiline}
      style={[
        tw`rounded-2xl px-3 py-3 border`,
        {
          borderColor: theme.border,
          backgroundColor: theme.inputBg,
          color: theme.text,
          minHeight: height,
          textAlignVertical: multiline ? 'top' : 'center',
        },
      ]}
    />
  </View>
);

const PrimaryBtn = ({
  label,
  onPress,
  disabled,
  theme,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  theme: any;
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[
      tw`px-4 py-3 rounded-2xl`,
      { backgroundColor: disabled ? theme.btnDisabledBg : theme.btnPrimaryBg, opacity: disabled ? 0.7 : 1 },
    ]}
  >
    <Text style={tw`text-white font-extrabold text-sm`}>{label}</Text>
  </TouchableOpacity>
);

const GhostBtn = ({
  label,
  onPress,
  disabled,
  theme,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  theme: any;
  danger?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[
      tw`px-4 py-3 rounded-2xl border`,
      {
        borderColor: danger ? theme.badBorder : theme.border,
        backgroundColor: theme.btnGhostBg,
        opacity: disabled ? 0.6 : 1,
      },
    ]}
  >
    <Text style={[tw`font-extrabold text-sm`, { color: danger ? theme.badText : theme.text }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const SegBtn = ({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  theme: any;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      tw`flex-1 px-3 py-3 rounded-2xl border`,
      {
        borderColor: active ? theme.primary : theme.border,
        backgroundColor: active ? theme.primarySoft : theme.btnGhostBg,
      },
    ]}
  >
    <Text style={[tw`text-sm font-extrabold text-center`, { color: active ? theme.primaryText : theme.text }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const CircleCheckboxNative = ({
  checked,
  label,
  onChange,
  theme,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  theme: any;
}) => (
  <TouchableOpacity onPress={() => onChange(!checked)} style={tw`flex-row items-center mr-4 mb-2`}>
    <View
      style={[
        tw`w-5 h-5 rounded-full border items-center justify-center`,
        { borderColor: checked ? theme.primary : theme.border },
      ]}
    >
      {checked ? <View style={[tw`w-3 h-3 rounded-full`, { backgroundColor: theme.primary }]} /> : null}
    </View>
    <Text style={[tw`ml-2 text-sm`, { color: theme.text }]}>{label}</Text>
  </TouchableOpacity>
);

/* ─────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────── */

export default function OrgAnnouncementsNative() {
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';

  // Match Newsletter layout paddings (avoid footer overlay)
  const NAV_SPACER_PX = 12;
  const FOOTER_OVERLAY_PX = 84;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  const theme = useMemo(() => {
    return {
      dark: isDark,

      // Screen + cards (match Newsletter)
      bg: isDark ? '#0b1016' : '#f8fafc',
      card: isDark ? '#0f1821' : '#ffffff',
      card2: isDark ? '#0b1620' : '#ffffff',

      border: isDark ? 'rgba(255,255,255,0.10)' : '#cedbe8',
      text: isDark ? '#ffffff' : '#0d141c',
      subtext: isDark ? 'rgba(255,255,255,0.70)' : '#49739c',
      label: isDark ? 'rgba(255,255,255,0.70)' : '#49739c',
      placeholder: isDark ? 'rgba(255,255,255,0.45)' : '#94a3b8',
      inputBg: isDark ? '#0b1620' : '#f8fafc',

      // Primary
      primary: '#2563eb',
      primarySoft: isDark ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.10)',
      primaryBorder: isDark ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.25)',
      primaryText: isDark ? '#bfdbfe' : '#1d4ed8',

      chipBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',

      // Buttons
      btnPrimaryBg: '#3d99f5',
      btnDisabledBg: isDark ? '#334155' : '#cbd5e1',
      btnGhostBg: isDark ? '#172534' : '#e7edf4',

      // Status colors
      okBg: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.12)',
      okBorder: isDark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.25)',
      okText: isDark ? '#d1fae5' : '#064e3b',

      warnBg: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.12)',
      warnBorder: isDark ? 'rgba(245,158,11,0.40)' : 'rgba(245,158,11,0.28)',
      warnText: isDark ? '#fde68a' : '#7c2d12',

      badBg: isDark ? 'rgba(244,63,94,0.14)' : 'rgba(244,63,94,0.10)',
      badBorder: isDark ? 'rgba(244,63,94,0.38)' : 'rgba(244,63,94,0.22)',
      badText: isDark ? '#fecdd3' : '#9f1239',
    };
  }, [isDark]);

  const { isPro, upgradeCta, classLabels = [] } = (useOrgProTools?.() ?? {}) as any;

  const {
    orgId: ctxOrgId,
    token: ctxUserToken,
    orgToken: ctxOrgToken,
    backendUrl: ctxBackendUrl,
  } = useShopContext() as any;

  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  const token: string | undefined = (ctxOrgToken as string) || (ctxUserToken as string) || undefined;
const orgId: string | undefined = (ctxOrgId as string) || (orgFromHook?.id as string) || undefined;
const backendUrl: string | undefined = (ctxBackendUrl as string) || undefined;


  const {
    announcements,
    loading,
    saving,
    error,
    notice,
    fetchAnnouncements,
    saveAnnouncement,
    removeAnnouncement,
    downloadAgmPdf,
  } = useOrgAnnouncements({
    orgId,
    token,
    backendUrl,
  }) as any;

  const [form, setForm] = useState({
    title: '',
    body: '',
    pinned: false,
    audience: 'all',
    start_at: '',
    end_at: '',
    category: 'general',
    meeting_at: '',
    meeting_location: '',
    meeting_url: '',
    agenda_md: '',
    class_label: '',
  });

  const [limitToClass, setLimitToClass] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'warn' | 'bad'; msg: string } | null>(null);

  const isAgm = String(form.category || '').toLowerCase() === 'agm';
  const canPost = useMemo(() => Boolean(form.title.trim() && form.body.trim()), [form.title, form.body]);

  const missingCtx = !orgId || !token || !backendUrl;

  useEffect(() => {
    if (!orgId || !token || !backendUrl) return;
    fetchAnnouncements();
  }, [orgId, token, backendUrl, fetchAnnouncements]);

  const refreshAll = useCallback(async () => {
    if (!orgId || !token || !backendUrl) return;
    try {
      await fetchAnnouncements();
    } catch {
      // ignore
    }
  }, [orgId, token, backendUrl, fetchAnnouncements]);

  useRegisterScreenRefresh(refreshAll);

  const autoFillAgm = () => {
    const when = form.meeting_at ? fmtWhen(toIsoOrNull(form.meeting_at)) : 'TBD';
    const where = form.meeting_location?.trim() ? form.meeting_location.trim() : 'TBD';
    const link = form.meeting_url?.trim() ? form.meeting_url.trim() : '';

    const agenda = form.agenda_md?.trim()
      ? form.agenda_md.trim()
      : `- Confirmation of minutes
- Financial report
- Elections (if applicable)
- AOB (Any Other Business)
- Closing remarks`;

    const title = form.title.trim() || 'Annual General Meeting (AGM) Notice';
    const body = `Dear Parents/Guardians,

This is a formal notice for our Annual General Meeting (AGM).

📅 Date/Time: ${when}
📍 Location: ${where}${link ? `\n🔗 Online link: ${link}` : ''}

Agenda:
${agenda}

Kindly attend on time. If you are unable to attend, please share any questions in advance through the school office.

Thank you.`;

    setForm((p) => ({ ...p, title, body, agenda_md: agenda }));
  };

  const handleSave = useCallback(async () => {
    if (!canPost || missingCtx) return;

    setFlash(null);

    const payload: any = {
      title: form.title.trim(),
      body: form.body.trim(),
      audience: String(form.audience || 'all').trim().toLowerCase(),
      class_label: limitToClass && form.class_label?.trim() ? form.class_label.trim() : null,
      pinned: !!form.pinned,
      start_at: toIsoOrNull(form.start_at),
      end_at: toIsoOrNull(form.end_at),
      category: form.category,
    };

    if (isAgm) {
      payload.meeting_at = toIsoOrNull(form.meeting_at);
      payload.meeting_location = form.meeting_location?.trim() || null;
      payload.meeting_url = form.meeting_url?.trim() || null;
      payload.agenda_md = form.agenda_md?.trim() || null;
      payload.metadata = { kind: 'agm' };
    }

    try {
      const created = await saveAnnouncement(payload);
      if (created) {
        setForm({
          title: '',
          body: '',
          pinned: false,
          audience: 'all',
          start_at: '',
          end_at: '',
          category: 'general',
          meeting_at: '',
          meeting_location: '',
          meeting_url: '',
          agenda_md: '',
          class_label: '',
        });
        setLimitToClass(false);
        setFlash({ tone: 'ok', msg: 'Published.' });
        fetchAnnouncements();
      }
    } catch (e: any) {
      setFlash({ tone: 'bad', msg: e?.response?.data?.message || e?.message || 'Publish failed.' });
    }
  }, [canPost, missingCtx, form, limitToClass, isAgm, saveAnnouncement, fetchAnnouncements]);

  const handleDelete = (id: number) => {
    Alert.alert('Delete announcement?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAnnouncement(id);
            setFlash({ tone: 'ok', msg: 'Deleted.' });
            fetchAnnouncements();
          } catch (e: any) {
            setFlash({ tone: 'bad', msg: e?.response?.data?.message || e?.message || 'Delete failed.' });
          }
        },
      },
    ]);
  };

  const downloadAgm = async (id: number) => {
    try {
      await downloadAgmPdf(id, `announcement-${id}-agm.pdf`);
      setFlash({ tone: 'ok', msg: 'AGM PDF prepared.' });
    } catch (e: any) {
      setFlash({ tone: 'bad', msg: e?.response?.data?.message || e?.message || 'Failed to download AGM PDF.' });
    }
  };

  const classOptions: string[] = useMemo(() => {
    const xs = Array.isArray(classLabels) ? classLabels.filter(Boolean) : [];
    return Array.from(new Set(xs.map(String)));
  }, [classLabels]);

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      <RefreshableScrollView
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`px-4`,
          { paddingTop: insets.top + NAV_SPACER_PX, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header (matches Newsletter feel) */}
        <View style={tw`flex-row items-start justify-between`}>
          <View style={tw`flex-1 pr-3`}>
            <Text style={[tw`text-[26px] font-extrabold`, { color: theme.text }]}>
              Announcements
            </Text>
            <Text style={[tw`mt-1 text-sm`, { color: theme.subtext }]}>
              Post updates. Schedule visibility. Pin important messages. AGM notices can export PDF.
            </Text>
          </View>

          <View style={tw`items-end`}>
            <View
              style={[
                tw`px-3 py-1 rounded-full border`,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={[tw`text-xs font-extrabold`, { color: theme.text }]}>
                Pro / Enterprise
              </Text>
            </View>
          </View>
        </View>

        {/* Upgrade gate */}
        {!isPro && upgradeCta ? (
          <View style={[tw`mt-4 rounded-2xl border p-4`, { borderColor: theme.warnBorder, backgroundColor: theme.warnBg }]}>
            <Text style={[tw`font-extrabold`, { color: theme.warnText }]}>{upgradeCta.headline}</Text>
            <Text style={[tw`mt-1 text-sm`, { color: theme.warnText }]}>{upgradeCta.body}</Text>
          </View>
        ) : null}

        {/* Missing context banner */}
        {missingCtx ? (
          <View style={tw`mt-4`}>
            <Banner
              tone="bad"
              msg={`Missing org/session context\norgId: ${orgId ?? 'null'} • token: ${token ? 'present' : 'missing'} • backendUrl: ${backendUrl ? 'present' : 'missing'}`}
              theme={theme}
            />
          </View>
        ) : null}

        {/* Flash + hook notice/error */}
        {flash?.msg ? (
          <View style={tw`mt-4`}>
            <Banner tone={flash.tone} msg={flash.msg} theme={theme} />
          </View>
        ) : null}

        {(error || notice) ? (
          <View style={tw`mt-4`}>
            <Banner tone={error ? 'bad' : 'ok'} msg={String(error || notice)} theme={theme} />
          </View>
        ) : null}

        {/* Composer card */}
        <View style={[tw`mt-4 rounded-2xl border p-4`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Type */}
          <Text style={[tw`text-xs font-extrabold mb-2`, { color: theme.label }]}>Type</Text>
          <View style={tw`flex-row gap-2`}>
            <SegBtn
              label="General"
              active={!isAgm}
              onPress={() => setForm((p) => ({ ...p, category: 'general' }))}
              theme={theme}
            />
            <SegBtn
              label="AGM Notice"
              active={isAgm}
              onPress={() => setForm((p) => ({ ...p, category: 'agm' }))}
              theme={theme}
            />
          </View>

          {/* Audience */}
          <Text style={[tw`mt-4 text-xs font-extrabold mb-2`, { color: theme.label }]}>Audience</Text>
          <View style={tw`flex-row flex-wrap`}>
            {(['all', 'learners', 'instructors'] as const).map((k) => {
              const active = form.audience === k;
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() => setForm((p) => ({ ...p, audience: k }))}
                  style={[
                    tw`mr-2 mb-2 px-3 py-2 rounded-full border`,
                    {
                      borderColor: active ? theme.primaryBorder : theme.border,
                      backgroundColor: active ? theme.primarySoft : theme.btnGhostBg,
                    },
                  ]}
                >
                  <Text style={[tw`text-xs font-extrabold`, { color: active ? theme.primaryText : theme.text }]}>
                    {k === 'all' ? 'All' : k === 'learners' ? 'Learners' : 'Instructors'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Pin + class targeting */}
          <View style={tw`mt-1 flex-row flex-wrap items-center`}>
            <CircleCheckboxNative
              checked={!!form.pinned}
              onChange={(next) => setForm((p) => ({ ...p, pinned: next }))}
              label="Pin announcement"
              theme={theme}
            />
            <CircleCheckboxNative
              checked={!!limitToClass}
              onChange={(next) => {
                setLimitToClass(next);
                if (!next) setForm((p) => ({ ...p, class_label: '' }));
              }}
              label="Target a class"
              theme={theme}
            />
          </View>

          {/* Target class */}
          <Text style={[tw`text-xs font-extrabold mb-2`, { color: theme.label }]}>
            Target class (optional)
          </Text>
          {classOptions.length ? (
            <View style={tw`flex-row flex-wrap`}>
              {classOptions.map((c) => {
                const active = limitToClass && form.class_label === c;
                return (
                  <TouchableOpacity
                    key={c}
                    disabled={!limitToClass}
                    onPress={() => setForm((p) => ({ ...p, class_label: c }))}
                    style={[
                      tw`mr-2 mb-2 px-3 py-2 rounded-full border`,
                      {
                        borderColor: active ? theme.primaryBorder : theme.border,
                        backgroundColor: active ? theme.primarySoft : theme.btnGhostBg,
                        opacity: limitToClass ? 1 : 0.55,
                      },
                    ]}
                  >
                    <Text style={[tw`text-xs font-extrabold`, { color: active ? theme.primaryText : theme.text }]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Field
              label="Class label"
              value={form.class_label}
              onChange={(class_label) => setForm((p) => ({ ...p, class_label }))}
              placeholder="e.g. Grade 5"
              theme={theme}
            />
          )}

          {/* Title */}
          <Field
            label="Title"
            value={form.title}
            onChange={(title) => setForm((p) => ({ ...p, title }))}
            placeholder={isAgm ? 'Annual General Meeting (AGM) Notice' : 'Weekly update'}
            theme={theme}
          />

          {/* Visible windows (simple text inputs for datetime) */}
          <Text style={[tw`text-[11px]`, { color: theme.subtext }]}>
            Date/time tip: use ISO-ish text like <Text style={{ color: theme.text }}>2025-12-25T08:30</Text>
          </Text>

          <View style={tw`mt-2`}>
            <Field
              label="Visible from (optional)"
              value={form.start_at}
              onChange={(start_at) => setForm((p) => ({ ...p, start_at }))}
              placeholder="2025-12-25T08:30"
              theme={theme}
            />
            <Field
              label="Visible to (optional)"
              value={form.end_at}
              onChange={(end_at) => setForm((p) => ({ ...p, end_at }))}
              placeholder="2025-12-26T17:00"
              theme={theme}
            />
          </View>

          {/* AGM extra fields */}
          {isAgm ? (
            <View style={tw`mt-1`}>
              <Field
                label="Meeting date/time (optional)"
                value={form.meeting_at}
                onChange={(meeting_at) => setForm((p) => ({ ...p, meeting_at }))}
                placeholder="2025-12-30T10:00"
                theme={theme}
              />
              <Field
                label="Location (optional)"
                value={form.meeting_location}
                onChange={(meeting_location) => setForm((p) => ({ ...p, meeting_location }))}
                placeholder="School hall"
                theme={theme}
              />
              <Field
                label="Online link (optional)"
                value={form.meeting_url}
                onChange={(meeting_url) => setForm((p) => ({ ...p, meeting_url }))}
                placeholder="https://…"
                theme={theme}
              />
              <Field
                label="Agenda (markdown bullets)"
                value={form.agenda_md}
                onChange={(agenda_md) => setForm((p) => ({ ...p, agenda_md }))}
                placeholder="- Confirmation of minutes…"
                theme={theme}
                multiline
                height={110}
              />

              <View style={tw`flex-row flex-wrap gap-2 mb-2`}>
                <GhostBtn label="Auto-build AGM message" onPress={autoFillAgm} theme={theme} />
              </View>
            </View>
          ) : null}

          {/* Body */}
          <Field
            label="Body"
            value={form.body}
            onChange={(body) => setForm((p) => ({ ...p, body }))}
            placeholder="Share key dates and reminders"
            theme={theme}
            multiline
            height={140}
          />

          {/* Actions */}
          <View style={tw`flex-row flex-wrap gap-2 mt-2`}>
            <PrimaryBtn
              label={saving ? 'Publishing…' : 'Publish'}
              onPress={handleSave}
              disabled={!canPost || saving || missingCtx}
              theme={theme}
            />
            <GhostBtn
              label="Refresh"
              onPress={refreshAll}
              disabled={missingCtx}
              theme={theme}
            />
          </View>
        </View>

        {/* List card */}
        <View style={[tw`mt-4 rounded-2xl border p-4`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={[tw`text-sm font-extrabold`, { color: theme.text }]}>Recent</Text>
            {loading ? (
              <View style={tw`flex-row items-center`}>
                <ActivityIndicator />
                <Text style={[tw`ml-2 text-xs`, { color: theme.subtext }]}>Loading…</Text>
              </View>
            ) : null}
          </View>

          {!loading && !announcements?.length ? (
            <Text style={[tw`mt-3`, { color: theme.subtext }]}>No announcements yet.</Text>
          ) : (
            <View style={tw`mt-3`}>
              {(announcements as any[]).map((a) => {
                const st = statusBadge(a);
                const isPinned = !!a?.pinned;
                const isAgmRow = String(a?.category || '').toLowerCase() === 'agm';
                const cls = a?.class_label ? String(a.class_label) : '';

                return (
                  <View
                    key={String(a?.id)}
                    style={[
                      tw`mb-3 rounded-2xl border p-3`,
                      { borderColor: theme.border, backgroundColor: theme.card2 },
                    ]}
                  >
                    <View style={tw`flex-row items-start justify-between`}>
                      <View style={tw`flex-1 pr-3`}>
                        <Text style={[tw`text-base font-extrabold`, { color: theme.text }]} numberOfLines={2}>
                          {a?.title || 'Untitled'}
                        </Text>

                        <View style={tw`flex-row flex-wrap items-center gap-2 mt-2`}>
                          {isPinned ? <Pill label="Pinned" tone="warn" theme={theme} /> : null}
                          {isAgmRow ? <Pill label="AGM" tone="info" theme={theme} /> : null}
                          <Pill label={st} theme={theme} />
                          {cls ? <Pill label={cls} theme={theme} /> : null}
                        </View>

                        <Text style={[tw`text-xs mt-2`, { color: theme.subtext }]}>
                          {a?.start_at ? `From: ${fmtWhen(a.start_at)}` : 'From: now'} •{' '}
                          {a?.end_at ? `To: ${fmtWhen(a.end_at)}` : 'No end'}
                        </Text>
                      </View>

                      <View style={tw`items-end`}>
                        {isAgmRow ? (
                          <TouchableOpacity onPress={() => downloadAgm(Number(a.id))} style={tw`mb-2`}>
                            <Text style={[tw`text-xs font-extrabold`, { color: theme.primaryText }]}>
                              Download AGM PDF
                            </Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity onPress={() => handleDelete(Number(a.id))}>
                          <Text style={[tw`text-xs font-extrabold`, { color: theme.badText }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={[tw`text-sm mt-3`, { color: theme.subtext }]}>{String(a?.body || '')}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={tw`h-10`} />
      </RefreshableScrollView>
    </SafeAreaView>
  );
}

/* eslint-disable no-console */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';

import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgSports } from '@mytutorapp/shared/hooks/useOrgSports';
import type { OrgSportsEvent } from '@mytutorapp/shared/types';

/* ─────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────── */
function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function toIsoOrNull(v: string) {
  const s = String(v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isoToLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

function dateToLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

function fmtWhen(iso?: string | null) {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

const KIND_LABEL: Record<string, string> = {
  fixture: 'Fixture',
  practice: 'Practice',
  tournament: 'Tournament',
  other: 'Other',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TEMPLATES: Array<Partial<OrgSportsEvent> & { label: string; hint: string }> = [
  {
    label: 'Football match',
    hint: 'Fixture • vs opponent • set time + venue',
    kind: 'fixture' as any,
    title: 'Football Match',
    audience: 'learners' as any,
  },
  {
    label: 'Training session',
    hint: 'Practice • team training • set time + venue',
    kind: 'practice' as any,
    title: 'Team Training',
    audience: 'learners' as any,
  },
  {
    label: 'Athletics meet',
    hint: 'Tournament • track & field • add location',
    kind: 'tournament' as any,
    title: 'Athletics Meet',
    audience: 'all' as any,
  },
  {
    label: 'Friendly match',
    hint: 'Fixture • low-stakes • keep score optional',
    kind: 'fixture' as any,
    title: 'Friendly Match',
    audience: 'learners' as any,
  },
];

/* ─────────────────────────────────────────────────────────
 * UI atoms (same style family as your Clubs native)
 * ───────────────────────────────────────────────────────── */
const Card: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <View
    style={[
      tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`,
      style,
    ]}
  >
    {children}
  </View>
);

const Pill: React.FC<{ label: string; kind?: 'blue' | 'green' | 'amber' | 'slate' | 'rose' }> = ({
  label,
  kind = 'slate',
}) => {
  const cls =
    kind === 'green'
      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20'
      : kind === 'amber'
      ? 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20'
      : kind === 'rose'
      ? 'border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20'
      : kind === 'blue'
      ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
      : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-900/30';

  const text =
    kind === 'green'
      ? 'text-emerald-800 dark:text-emerald-200'
      : kind === 'amber'
      ? 'text-amber-900 dark:text-amber-200'
      : kind === 'rose'
      ? 'text-rose-800 dark:text-rose-200'
      : kind === 'blue'
      ? 'text-blue-800 dark:text-blue-200'
      : 'text-slate-700 dark:text-slate-200';

  return (
    <View style={tw`px-2 py-1 rounded-full border ${cls}`}>
      <Text style={tw`text-[11px] font-bold ${text}`}>{label}</Text>
    </View>
  );
};

const Chip: React.FC<{ label: string; active?: boolean; onPress?: () => void; hint?: string }> = ({
  label,
  active,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={tw`px-3 py-2 rounded-full border ${
      active
        ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
        : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
    }`}
  >
    <Text
      style={tw`text-xs font-semibold ${
        active ? 'text-blue-700 dark:text-blue-200' : 'text-[#0d141c] dark:text-white'
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

const Btn: React.FC<{
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'ghost' | 'danger' | 'soft';
}> = ({ label, onPress, disabled, tone = 'ghost' }) => {
  const base =
    tone === 'primary'
      ? 'bg-blue-600'
      : tone === 'danger'
      ? 'bg-rose-900/20 border border-rose-200 dark:border-rose-900/40'
      : tone === 'soft'
      ? 'bg-[#e7edf4] dark:bg-[#172534]'
      : 'bg-[#e7edf4] dark:bg-[#172534]';

  const txt =
    tone === 'primary' ? 'text-white' : tone === 'danger' ? 'text-rose-700 dark:text-rose-200' : 'text-[#0d141c] dark:text-white';

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={tw`h-10 px-4 rounded-xl items-center justify-center ${base} ${disabled ? 'opacity-60' : ''}`}
    >
      <Text style={tw`text-sm font-bold ${txt}`}>{label}</Text>
    </Pressable>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: any;
  autoCapitalize?: any;
}> = ({ label, value, onChangeText, placeholder, multiline, inputMode, autoCapitalize }) => (
  <View>
    <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/70`}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
      multiline={multiline}
      inputMode={inputMode}
      autoCapitalize={autoCapitalize}
      textAlignVertical={multiline ? 'top' : 'auto'}
      style={tw`mt-2 ${multiline ? 'h-24' : 'h-11'} rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 ${multiline ? 'py-3' : ''} text-[#0d141c] dark:text-white`}
    />
  </View>
);

/* ─────────────────────────────────────────────────────────
 * Simple select modal (native replacement for <select>)
 * ───────────────────────────────────────────────────────── */
function SelectModal({
  open,
  title,
  value,
  options,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onClose: () => void;
  onSelect: (v: string) => void;
}) {
  if (!open) return null;
  return (
    <Modal transparent animationType="slide" visible={open} onRequestClose={onClose}>
      <View style={tw`flex-1 bg-black/40 justify-end`}>
        <View style={tw`rounded-t-3xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-4 max-h-[80%]`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>{title}</Text>
            <Pressable
              onPress={onClose}
              style={tw`h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
            >
              <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>Close</Text>
            </Pressable>
          </View>

          <ScrollView style={tw`mt-3`}>
            {options.map((o) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                  style={tw`px-3 py-3 rounded-2xl border ${
                    active
                      ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                      : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620]'
                  } mb-2`}
                >
                  <Text
                    style={tw`text-sm font-bold ${
                      active ? 'text-blue-700 dark:text-blue-200' : 'text-[#0d141c] dark:text-white'
                    }`}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────
 * DateTime field (minimal & solid)
 * Stores value as "YYYY-MM-DDTHH:mm" just like web datetime-local.
 * ───────────────────────────────────────────────────────── */
function DateTimeField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [step, setStep] = useState<'date' | 'time'>('date');
  const [tmp, setTmp] = useState<Date>(() => {
    const d = value ? new Date(value) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  });

  useEffect(() => {
    const d = value ? new Date(value) : new Date();
    if (!Number.isNaN(d.getTime())) setTmp(d);
  }, [value]);

  const open = () => {
    setStep('date');
    setPickerOpen(true);
  };

  const onPick = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') {
      // Android returns "dismissed" via selected undefined
      if (!selected) {
        setPickerOpen(false);
        return;
      }
      if (step === 'date') {
        const next = new Date(tmp);
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        setTmp(next);
        setStep('time');
        return;
      }
      // time step
      const next = new Date(tmp);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setTmp(next);
      setPickerOpen(false);
      onChange(dateToLocalInput(next));
      return;
    }

    // iOS: we can just accept selected and commit
    if (!selected) return;
    setTmp(selected);
    onChange(dateToLocalInput(selected));
  };

  return (
    <View>
      <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/70`}>{label}</Text>

      <View style={tw`mt-2 flex-row gap-2`}>
        <View style={tw`flex-1`}>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder || 'YYYY-MM-DDTHH:mm'}
            placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
            autoCapitalize="none"
            style={tw`h-11 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
          />
        </View>

        <Pressable
          onPress={open}
          style={tw`h-11 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
        >
          <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>Pick</Text>
        </Pressable>
      </View>

      {pickerOpen ? (
        <View style={tw`mt-2`}>
          <DateTimePicker
            value={tmp}
            mode={Platform.OS === 'android' ? step : 'datetime'}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onPick}
          />
        </View>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────── */
const OrgToolsSportsNative: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const FOOTER_OVERLAY_PX = 84;
  const NAV_SPACER_PX = 12;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  const { isPro, upgradeCta, org, activeOrgId } = useOrgProTools() as any;
  const { backendUrl, token: userToken, orgToken, orgId: ctxOrgId } = useShopContext() as any;

  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  const orgIdParam = route?.params?.orgId ?? null;

  // Strict: Sports page is designed for orgToken
  const resolvedOrgId =
    (orgIdParam as string) ||
    (activeOrgId as string) ||
    (ctxOrgId as string) ||
    (org?.id as string) ||
    (orgFromHook?.id as string) ||
    null;

  const strictMissing = !resolvedOrgId || !orgToken;

  // fallback token for dev (but we still pass orgToken explicitly into hook)
  const sportsToken = (orgToken as string) || (userToken as string) || null;
  const missingCtx = !resolvedOrgId || !sportsToken;

  const { events, loading, saving, error, notice, fetchEvents, saveEvent, editEvent, removeEvent } =
    useOrgSports({
      orgId: resolvedOrgId,
      token: orgToken ?? null, // ✅ pass orgToken explicitly like web
      backendUrl,
    }) as any;

  useEffect(() => {
    console.log('[OrgToolsSportsNative] context snapshot', {
      route_orgIdParam: orgIdParam ?? null,
      activeOrgId: activeOrgId ?? null,
      ctxOrgId: ctxOrgId ?? null,
      orgFromHook_id: orgFromHook?.id ?? null,
      orgFromProTools_id: org?.id ?? null,
      resolved_orgId: resolvedOrgId ?? null,
      has_user_token: Boolean(userToken),
      has_org_token: Boolean(orgToken),
      resolved_has_sports_token: Boolean(sportsToken),
      backendUrl_ctx: backendUrl ?? null,
    });
  }, [orgIdParam, activeOrgId, ctxOrgId, orgFromHook?.id, org?.id, resolvedOrgId, userToken, orgToken, sportsToken, backendUrl]);

  // Filters
  const [mode, setMode] = useState<'upcoming' | 'results' | 'all'>('upcoming');
  const [q, setQ] = useState('');
  const [fKind, setFKind] = useState<string>('');
  const [fTeam, setFTeam] = useState<string>('');
  const [fAudience, setFAudience] = useState<string>('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const refresh = useCallback(async () => {
    if (!resolvedOrgId || !sportsToken) return;

    const status = mode === 'results' ? 'completed' : mode === 'upcoming' ? 'scheduled' : '';

    await fetchEvents({
      status: status || undefined,
      kind: fKind || undefined,
      team_label: fTeam || undefined,
      audience: fAudience || undefined,
      q: q.trim() || undefined,
      limit: 300,
      offset: 0,
    });
  }, [resolvedOrgId, sportsToken, fetchEvents, mode, fKind, fTeam, fAudience, q]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Composer
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    kind: 'fixture',
    team_label: '',
    opponent: '',
    location: '',
    audience: 'learners',
    status: 'scheduled',
    event_at: '',
    end_at: '',
    description: '',
    score_home: '',
    score_away: '',
  });

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm({
      title: '',
      kind: 'fixture',
      team_label: '',
      opponent: '',
      location: '',
      audience: 'learners',
      status: 'scheduled',
      event_at: '',
      end_at: '',
      description: '',
      score_home: '',
      score_away: '',
    });
  }, []);

  const canSave = useMemo(() => Boolean(form.title.trim()), [form.title]);

  const teams = useMemo(() => {
    const s = new Set<string>();
    (events || []).forEach((e: any) => {
      const t = String(e?.team_label || '').trim();
      if (t) s.add(t);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [events]);

  const listClientFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = (events || []) as OrgSportsEvent[];
    if (!needle) return base;
    return base.filter((e) => {
      const hay = `${e.title || ''} ${e.description || ''} ${(e as any).opponent || ''} ${(e as any).team_label || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [events, q]);

  const totalPages = useMemo(() => {
    if (!listClientFiltered.length) return 1;
    return Math.max(1, Math.ceil(listClientFiltered.length / pageSize));
  }, [listClientFiltered.length, pageSize]);

  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return listClientFiltered.slice(start, start + pageSize);
  }, [listClientFiltered, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [q, mode, fKind, fTeam, fAudience]);

  const grouped = useMemo(() => {
    const m = new Map<string, OrgSportsEvent[]>();
    for (const e of paginatedEvents) {
      const key = (e as any).event_at ? new Date((e as any).event_at).toDateString() : 'TBC';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }

    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => {
        const ta = (a as any).event_at ? new Date((a as any).event_at).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = (b as any).event_at ? new Date((b as any).event_at).getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
      m.set(k, arr);
    }

    const keys = Array.from(m.keys()).sort((a, b) => {
      if (a === 'TBC') return 1;
      if (b === 'TBC') return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });

    return keys.map((k) => ({ day: k, items: m.get(k)! }));
  }, [listClientFiltered]);

  const instructorHint = useMemo(() => {
    const s = String(error || '').toLowerCase();
    return s.includes('403') || s.includes('forbidden') || s.includes('instructor');
  }, [error]);

  const handlePickTemplate = (t: any) => {
    setForm((p) => ({
      ...p,
      title: String(t.title || p.title || '').trim(),
      kind: String(t.kind || p.kind || 'fixture'),
      audience: String(t.audience || p.audience || 'learners'),
      status: 'scheduled',
    }));
  };

  const handleEditClick = (evt: OrgSportsEvent) => {
    setEditingId(Number((evt as any).id));
    setForm({
      title: String(evt.title || ''),
      kind: String((evt as any).kind || 'fixture'),
      team_label: String((evt as any).team_label || ''),
      opponent: String((evt as any).opponent || ''),
      location: String(evt.location || ''),
      audience: String((evt as any).audience || 'learners'),
      status: String((evt as any).status || 'scheduled'),
      event_at: isoToLocalInput((evt as any).event_at),
      end_at: isoToLocalInput((evt as any).end_at),
      description: String(evt.description || ''),
      score_home: (evt as any).score_home == null ? '' : String((evt as any).score_home),
      score_away: (evt as any).score_away == null ? '' : String((evt as any).score_away),
    });

    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSave = async () => {
    if (!canSave || missingCtx) return;

    const payload: Partial<OrgSportsEvent> = {
      title: form.title.trim(),
      description: form.description.trim() || null,

      kind: (form.kind || 'fixture').trim() as any,
      team_label: form.team_label.trim() || null,
      opponent: form.opponent.trim() || null,
      audience: (form.audience || 'all').trim() as any,
      status: (form.status || 'scheduled').trim() as any,

      event_at: toIsoOrNull(form.event_at) || null,
      end_at: toIsoOrNull(form.end_at) || null,

      location: form.location.trim() || null,
      score_home: form.score_home.trim() ? Number(form.score_home) : null,
      score_away: form.score_away.trim() ? Number(form.score_away) : null,
    };

    const ok = editingId ? await editEvent(editingId, payload) : await saveEvent(payload);
    if (ok) {
      resetForm();
      refresh();
    }
  };

  const doDuplicate = async (evt: OrgSportsEvent) => {
    const payload: Partial<OrgSportsEvent> = {
      ...(evt as any),
      id: undefined as any,
      status: 'scheduled' as any,
      score_home: null as any,
      score_away: null as any,
      title: evt.title ? `${evt.title} (copy)` : 'Copy',
    };
    await saveEvent(payload);
    refresh();
  };

  // Score modal
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreEvt, setScoreEvt] = useState<OrgSportsEvent | null>(null);
  const [scoreHome, setScoreHome] = useState('');
  const [scoreAway, setScoreAway] = useState('');

  const openScore = (evt: OrgSportsEvent) => {
    setScoreEvt(evt);
    setScoreHome((evt as any).score_home == null ? '' : String((evt as any).score_home));
    setScoreAway((evt as any).score_away == null ? '' : String((evt as any).score_away));
    setScoreOpen(true);
  };

  const submitScore = async () => {
    if (!scoreEvt) return;
    const home = scoreHome.trim() ? Number(scoreHome) : null;
    const away = scoreAway.trim() ? Number(scoreAway) : null;

    await editEvent((scoreEvt as any).id, {
      score_home: home as any,
      score_away: away as any,
      status: 'completed' as any,
    });

    setScoreOpen(false);
    setScoreEvt(null);
    refresh();
  };

  // Export CSV (native-safe): open link in browser + copy to clipboard
  const handleExportCsv = async () => {
    if (!backendUrl || !resolvedOrgId || !sportsToken) return;

    const base = String(backendUrl).replace(/\/+$/, '');
    const url = `${base}/api/orgs/${resolvedOrgId}/sports/events.csv`;

    const status = mode === 'results' ? 'completed' : mode === 'upcoming' ? 'scheduled' : '';

    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (fKind) params.set('kind', fKind);
    if (fTeam) params.set('team_label', fTeam);
    if (fAudience) params.set('audience', fAudience);
    if (q.trim()) params.set('q', q.trim());
    params.set('limit', '500');
    params.set('offset', '0');

    const full = `${url}?${params.toString()}`;

    // helpful: copy link for debugging
    await Clipboard.setStringAsync(full);

    // open in device browser (user can download/save)
    await WebBrowser.openBrowserAsync(full);
  };

  // Select modals
  const [kindSel, setKindSel] = useState(false);
  const [audSel, setAudSel] = useState(false);
  const [teamSel, setTeamSel] = useState(false);
  const [statusSel, setStatusSel] = useState(false);

  // Pro gate
  if (!isPro && upgradeCta) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={[tw`px-4`, { paddingTop: insets.top + NAV_SPACER_PX, paddingBottom: bottomPad }]}
        >
          <Text style={tw`text-xs font-extrabold uppercase tracking-widest text-blue-500`}>Org tools</Text>
          <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white mt-1`}>Sports</Text>
          <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
            Plan fixtures & training, track results, and keep everyone informed.
          </Text>

          <View style={tw`mt-4`}>
            <Card>
              <Text style={tw`font-extrabold text-amber-900 dark:text-amber-200`}>{upgradeCta.headline}</Text>
              <Text style={tw`text-sm mt-1 text-amber-900/90 dark:text-amber-200/90`}>{upgradeCta.body}</Text>

              <Pressable
                onPress={() => navigation.navigate('OrgProfile')}
                style={tw`mt-3 h-10 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`font-bold text-[#0d141c] dark:text-white`}>Upgrade billing</Text>
              </Pressable>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <ScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        contentContainerStyle={[tw`px-4`, { paddingTop: insets.top + NAV_SPACER_PX, paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Strict orgToken warning */}
        {strictMissing ? (
          <View style={tw`rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20 p-4 mb-4`}>
            <Text style={tw`font-extrabold text-rose-800 dark:text-rose-200`}>Org session required</Text>
            <Text style={tw`text-xs mt-1 text-rose-800/90 dark:text-rose-200/90`}>
              This page is designed for <Text style={tw`font-extrabold`}>orgToken</Text>. Please log in via the org portal.
            </Text>
          </View>
        ) : null}

        {/* Missing context strip */}
        {missingCtx ? (
          <View style={tw`rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20 p-4 mb-4`}>
            <Text style={tw`font-extrabold text-rose-800 dark:text-rose-200`}>Missing org/session context</Text>
            <Text style={tw`text-xs mt-1 text-rose-800/90 dark:text-rose-200/90`}>
              orgId: {String(resolvedOrgId ?? 'null')} • token: {sportsToken ? 'present' : 'missing'}
            </Text>
            <Text style={tw`text-[11px] mt-1 text-rose-800/80 dark:text-rose-200/80`}>
              Check logs: [OrgToolsSportsNative]
            </Text>
          </View>
        ) : null}

        {/* Header */}
        <View style={tw`mb-3`}>
          <Text style={tw`text-xs font-extrabold uppercase tracking-widest text-blue-500`}>Org tools</Text>
          <View style={tw`flex-row items-center justify-between mt-1`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white`}>Sports</Text>
              <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
                Plan fixtures & training, track results, and keep everyone informed.
              </Text>
            </View>
            <Pill label="Pro / Enterprise" kind="blue" />
          </View>
        </View>

        {/* Composer */}
        <Card>
          {(error || notice) ? (
            <View
              style={tw`mb-3 rounded-2xl border ${
                error
                  ? 'border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20'
              } p-3`}
            >
              <Text
                style={tw`text-sm font-semibold ${
                  error ? 'text-rose-800 dark:text-rose-200' : 'text-emerald-800 dark:text-emerald-200'
                }`}
              >
                {String(error || notice)}
              </Text>
              {instructorHint ? (
                <Text style={tw`text-[11px] mt-1 text-[#49739c] dark:text-white/70`}>
                  Tip: Sports endpoints require Pro tier + Org Instructor. If you’re not an instructor, you’ll get 403.
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={tw`flex-row items-start justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                {editingId ? 'Edit event' : 'Create event'}
              </Text>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
                Fixtures + practices + tournaments — one place.
              </Text>
            </View>

            {editingId ? <Btn label="Cancel" tone="soft" onPress={resetForm} /> : null}
          </View>

          {/* Templates */}
          {!editingId ? (
            <View style={tw`mt-4`}>
              <Text style={tw`text-xs font-extrabold uppercase tracking-widest text-[#49739c] dark:text-white/60 mb-2`}>
                Quick templates
              </Text>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {TEMPLATES.map((t) => (
                  <Chip key={t.label} label={t.label} onPress={() => handlePickTemplate(t)} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={tw`mt-4 gap-3`}>
            <Field
              label="Title"
              value={form.title}
              onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
              placeholder="U13 Football vs Green Hills"
            />

            {/* Kind + Audience */}
            <View style={tw`flex-row flex-wrap gap-2`}>
              <Pressable
                onPress={() => setKindSel(true)}
                style={tw`h-11 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>
                  Kind: {KIND_LABEL[form.kind] || form.kind}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setAudSel(true)}
                style={tw`h-11 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>Audience: {form.audience}</Text>
              </Pressable>
            </View>

            <View style={tw`flex-row gap-2`}>
              <View style={tw`flex-1`}>
                <Field
                  label="Team (optional)"
                  value={form.team_label}
                  onChangeText={(v) => setForm((p) => ({ ...p, team_label: v }))}
                  placeholder="U13 / Senior / Girls Volleyball"
                />
              </View>
              <View style={tw`flex-1`}>
                <Field
                  label="Opponent (optional)"
                  value={form.opponent}
                  onChangeText={(v) => setForm((p) => ({ ...p, opponent: v }))}
                  placeholder="Green Hills School"
                />
              </View>
            </View>

            <Field
              label="Location"
              value={form.location}
              onChangeText={(v) => setForm((p) => ({ ...p, location: v }))}
              placeholder="Main field / Court A / Stadium"
            />

            <DateTimeField
              label="Start"
              value={form.event_at}
              onChange={(v) => setForm((p) => ({ ...p, event_at: v }))}
              placeholder="YYYY-MM-DDTHH:mm"
            />

            <DateTimeField
              label="End (optional)"
              value={form.end_at}
              onChange={(v) => setForm((p) => ({ ...p, end_at: v }))}
              placeholder="YYYY-MM-DDTHH:mm"
            />

            {/* Status + Scores */}
            <View style={tw`flex-row flex-wrap gap-2`}>
              <Pressable
                onPress={() => setStatusSel(true)}
                style={tw`h-11 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>
                  Status: {STATUS_LABEL[form.status] || form.status}
                </Text>
              </Pressable>
            </View>

            <View style={tw`flex-row gap-2`}>
              <View style={tw`flex-1`}>
                <Field
                  label="Score (home)"
                  value={form.score_home}
                  onChangeText={(v) => setForm((p) => ({ ...p, score_home: v }))}
                  placeholder="—"
                  inputMode="numeric"
                />
              </View>
              <View style={tw`flex-1`}>
                <Field
                  label="Score (away)"
                  value={form.score_away}
                  onChangeText={(v) => setForm((p) => ({ ...p, score_away: v }))}
                  placeholder="—"
                  inputMode="numeric"
                />
              </View>
            </View>

            <Field
              label="Notes (optional)"
              value={form.description}
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              placeholder="Kickoff time, kit color, transport details, etc."
              multiline
            />

            <View style={tw`flex-row flex-wrap gap-2`}>
              <Btn label={saving ? 'Saving…' : editingId ? 'Save changes' : 'Save event'} tone="primary" disabled={!canSave || saving || missingCtx} onPress={handleSave} />
              <Btn label="Refresh list" tone="soft" onPress={refresh} />
              <Btn label="Export CSV" tone="soft" disabled={missingCtx || !backendUrl} onPress={handleExportCsv} />
            </View>

            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60 mt-2`}>
              Tip: Export CSV opens the link in your browser (link copied to clipboard).
            </Text>
          </View>
        </Card>

        {/* Filters + List */}
        <View style={tw`mt-4`} />
        <Card>
          {/* Mode chips */}
          <View style={tw`flex-row flex-wrap gap-2`}>
            <Chip label="Upcoming" active={mode === 'upcoming'} onPress={() => setMode('upcoming')} />
            <Chip label="Results" active={mode === 'results'} onPress={() => setMode('results')} />
            <Chip label="All" active={mode === 'all'} onPress={() => setMode('all')} />
          </View>

          <View style={tw`mt-3 gap-2`}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search… (team, opponent, title)"
              placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
              style={tw`h-11 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
            />

            <View style={tw`flex-row flex-wrap gap-2`}>
              <Pressable
                onPress={() => setKindSel(true)}
                style={tw`h-10 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>
                  Kind: {fKind ? (KIND_LABEL[fKind] || fKind) : 'All'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setTeamSel(true)}
                style={tw`h-10 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>
                  Team: {fTeam ? fTeam : 'All'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setAudSel(true)}
                style={tw`h-10 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>
                  Audience: {fAudience ? fAudience : 'All'}
                </Text>
              </Pressable>

              <Btn label="Apply" tone="soft" onPress={refresh} />
            </View>
          </View>

          <View style={tw`mt-3 flex-row items-center justify-between`}>
            <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
              {loading
                ? 'Loading…'
                : `Showing ${listClientFiltered.length ? (page - 1) * pageSize + 1 : 0}-${Math.min(
                    page * pageSize,
                    listClientFiltered.length,
                  )} of ${listClientFiltered.length}`}
            </Text>

            <View style={tw`flex-row items-center gap-2`}>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>Rows:</Text>
              <View style={tw`flex-row gap-2`}>
                {[10, 25, 50].map((n) => (
                  <Chip
                    key={n}
                    label={String(n)}
                    active={pageSize === n}
                    onPress={() => {
                      setPage(1);
                      setPageSize(n);
                    }}
                    theme={theme}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={tw`mt-4`}>
            {loading ? (
              <View style={tw`py-3 flex-row items-center gap-2`}>
                <ActivityIndicator />
                <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>Loading events…</Text>
              </View>
            ) : !listClientFiltered.length ? (
              <View style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] p-4`}>
                <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>
                  No events yet. Use the form above to create your first fixture or practice.
                </Text>
              </View>
            ) : (
              <View style={tw`gap-4`}>
                {grouped.map((g) => (
                  <View key={g.day} style={tw`gap-2`}>
                    <Text style={tw`text-xs font-extrabold uppercase tracking-widest text-[#49739c] dark:text-white/60`}>
                      {g.day}
                    </Text>

                    {g.items.map((e) => {
                      const k = String((e as any).kind || 'fixture');
                      const st = String((e as any).status || 'scheduled');

                      const tone =
                        st === 'completed' ? 'green' : st === 'cancelled' ? 'rose' : 'blue';

                      const title = e.title || 'Untitled';
                      const team = String((e as any).team_label || '').trim();
                      const opp = String((e as any).opponent || '').trim();

                      const score =
                        (e as any).score_home != null || (e as any).score_away != null
                          ? `${(e as any).score_home ?? '—'} : ${(e as any).score_away ?? '—'}`
                          : null;

                      return (
                        <View
                          key={String((e as any).id)}
                          style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620] p-3`}
                        >
                          <View style={tw`flex-row items-start justify-between gap-2`}>
                            <View style={tw`flex-1 pr-2`}>
                              <View style={tw`flex-row flex-wrap items-center gap-2`}>
                                <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`} numberOfLines={1}>
                                  {title}
                                </Text>
                                <Pill label={KIND_LABEL[k] || k} kind="slate" />
                                <Pill label={STATUS_LABEL[st] || st} kind={tone as any} />
                                {score ? <Pill label={`Score ${score}`} kind="amber" /> : null}
                              </View>

                              <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
                                <Text style={tw`font-bold`}>{fmtWhen((e as any).event_at)}</Text>
                                {(e as any).end_at ? <Text style={tw`text-[#49739c] dark:text-white/60`}> → {fmtWhen((e as any).end_at)}</Text> : null}
                              </Text>

                              <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
                                {team ? <Text style={tw`font-bold`}>{team}</Text> : <Text style={tw`text-[#49739c] dark:text-white/60`}>Team TBC</Text>}
                                {opp ? <Text style={tw`text-[#49739c] dark:text-white/60`}> vs {opp}</Text> : null}
                                {e.location ? <Text style={tw`text-[#49739c] dark:text-white/60`}> • {String(e.location)}</Text> : null}
                              </Text>

                              {e.description ? (
                                <Text style={tw`text-sm text-[#0d141c] dark:text-white/90 mt-2`}>
                                  {String(e.description)}
                                </Text>
                              ) : null}
                            </View>

                            <View style={tw`gap-2`}>
                              <Btn label="Edit" tone="soft" onPress={() => handleEditClick(e)} />
                              <Btn label="Duplicate" tone="soft" onPress={() => doDuplicate(e)} />
                              <Btn label="Record score" tone="soft" onPress={() => openScore(e)} />
                              <Btn
                                label="Delete"
                                tone="danger"
                                onPress={() =>
                                  Alert.alert('Delete event?', `Delete "${title}"?`, [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Delete',
                                      style: 'destructive',
                                      onPress: async () => {
                                        const ok = await removeEvent((e as any).id);
                                        if (ok) refresh();
                                      },
                                    },
                                  ])
                                }
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}

            {!loading && listClientFiltered.length ? (
              <View style={tw`mt-3 flex-row items-center justify-between`}>
                <Pressable
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] ${page === 1 ? 'opacity-50' : ''}`}
                >
                  <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>‹ Prev</Text>
                </Pressable>

                <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                  Page {page} of {totalPages}
                </Text>

                <Pressable
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] ${page === totalPages ? 'opacity-50' : ''}`}
                >
                  <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>Next ›</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60 mt-4`}>
              Tip: Filters + Apply will fetch filtered results from the server.
            </Text>
          </View>
        </Card>

        {/* Score modal */}
        <Modal transparent animationType="slide" visible={scoreOpen} onRequestClose={() => setScoreOpen(false)}>
          <View style={tw`flex-1 bg-black/40 justify-end`}>
            <View style={tw`rounded-t-3xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-4`}>
              <View style={tw`flex-row items-start justify-between`}>
                <View style={tw`flex-1 pr-3`}>
                  <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                    {scoreEvt?.title ? `Record score: ${scoreEvt.title}` : 'Record score'}
                  </Text>
                  <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
                    Saving a score will mark status as completed.
                  </Text>
                </View>
                <Btn
                  label="Close"
                  tone="soft"
                  onPress={() => {
                    setScoreOpen(false);
                    setScoreEvt(null);
                  }}
                />
              </View>

              <View style={tw`mt-4 gap-3`}>
                <View style={tw`flex-row gap-2`}>
                  <View style={tw`flex-1`}>
                    <Field
                      label="Home"
                      value={scoreHome}
                      onChangeText={setScoreHome}
                      placeholder="—"
                      inputMode="numeric"
                    />
                  </View>
                  <View style={tw`flex-1`}>
                    <Field
                      label="Away"
                      value={scoreAway}
                      onChangeText={setScoreAway}
                      placeholder="—"
                      inputMode="numeric"
                    />
                  </View>
                </View>

                <View style={tw`flex-row gap-2`}>
                  <Btn label="Save score (mark completed)" tone="primary" onPress={submitScore} />
                  <Btn
                    label="Cancel"
                    tone="soft"
                    onPress={() => {
                      setScoreOpen(false);
                      setScoreEvt(null);
                    }}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Select modals */}
        <SelectModal
          open={kindSel}
          title="Select kind"
          value={fKind}
          onClose={() => setKindSel(false)}
          onSelect={(v) => setFKind(v)}
          options={[
            { label: 'All kinds', value: '' },
            { label: 'Fixture', value: 'fixture' },
            { label: 'Practice', value: 'practice' },
            { label: 'Tournament', value: 'tournament' },
            { label: 'Other', value: 'other' },
          ]}
        />

        <SelectModal
          open={audSel}
          title="Select audience"
          value={fAudience}
          onClose={() => setAudSel(false)}
          onSelect={(v) => setFAudience(v)}
          options={[
            { label: 'All audiences', value: '' },
            { label: 'All', value: 'all' },
            { label: 'Learners', value: 'learners' },
            { label: 'Instructors', value: 'instructors' },
            { label: 'Parents', value: 'parents' },
          ]}
        />

        <SelectModal
          open={teamSel}
          title="Select team"
          value={fTeam}
          onClose={() => setTeamSel(false)}
          onSelect={(v) => setFTeam(v)}
          options={[
            { label: 'All teams', value: '' },
            ...teams.map((t) => ({ label: t, value: t })),
          ]}
        />

        <SelectModal
          open={statusSel}
          title="Select status"
          value={form.status}
          onClose={() => setStatusSel(false)}
          onSelect={(v) => setForm((p) => ({ ...p, status: v }))}
          options={[
            { label: 'Scheduled', value: 'scheduled' },
            { label: 'Completed', value: 'completed' },
            { label: 'Cancelled', value: 'cancelled' },
          ]}
        />

        <SelectModal
          open={false}
          title=""
          value=""
          onClose={() => {}}
          onSelect={() => {}}
          options={[]}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default OrgToolsSportsNative;

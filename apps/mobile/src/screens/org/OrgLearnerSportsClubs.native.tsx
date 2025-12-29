// apps/mobile/src/screens/org/OrgLearnerSportsClubs.native.tsx
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

import type { OrgSportsEvent, OrgClub } from '@mytutorapp/shared/types';
import { listSportsEvents, getMyClubs as apiGetMyClubs } from '@mytutorapp/shared/api/orgEngagementApi';

import { useThemePref } from '../../theme/ThemeContext';

type TabKey = 'sports' | 'clubs';
type SportsMode = 'upcoming' | 'results';

function pickString(...xs: any[]) {
  for (const x of xs) {
    const s = typeof x === 'string' ? x : x == null ? '' : String(x);
    if (s.trim()) return s.trim();
  }
  return '';
}

function fmtWhen(iso?: string | null) {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function dayKey(iso?: string | null) {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBC';
  return d.toDateString();
}

function errMessage(e: any) {
  const msg =
    e?.response?.data?.message ??
    e?.response?.data ??
    e?.message ??
    (typeof e === 'string' ? e : '');
  return String(msg || '').slice(0, 400);
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

/* ─────────────────────────────────────────────
 * Theme resolver (same approach as fees screen)
 * ───────────────────────────────────────────── */

function resolveIsDark(themePref: any): boolean {
  if (!themePref) return false;
  if (typeof themePref === 'boolean') return themePref;

  const candidates = [
    themePref.isDark,
    themePref.dark,
    themePref.is_dark,
    themePref?.pref === 'dark',
    themePref?.mode === 'dark',
    themePref?.theme === 'dark',
    themePref?.themePref === 'dark',
    themePref?.appearance === 'dark',
  ];

  for (const c of candidates) {
    if (typeof c === 'boolean') return c;
    if (typeof c === 'string') return c.toLowerCase() === 'dark';
  }
  return false;
}

function buildTheme(isDark: boolean) {
  const bg = isDark ? '#020617' : '#f8fafc';
  const card = isDark ? '#0b1220' : '#ffffff';
  const text = isDark ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)';
  const subtext = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(71,85,105,0.95)';
  const muted = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(100,116,139,0.95)';

  const border = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)';
  const soft = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#ffffff';

  const badBg = isDark ? 'rgba(127,29,29,0.18)' : 'rgba(254,242,242,1)';
  const badBorder = isDark ? 'rgba(244,63,94,0.25)' : 'rgba(254,202,202,1)';
  const badText = isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)';

  const warnBg = isDark ? 'rgba(245,158,11,0.14)' : 'rgba(255,251,235,1)';
  const warnBorder = isDark ? 'rgba(245,158,11,0.22)' : 'rgba(253,230,138,1)';
  const warnText = isDark ? 'rgba(253,230,138,0.95)' : 'rgba(146,64,14,0.95)';

  return {
    dark: isDark,
    bg,
    card,
    text,
    subtext,
    muted,
    border,
    soft,
    inputBg,
    badBg,
    badBorder,
    badText,
    warnBg,
    warnBorder,
    warnText,
  };
}

/* ─────────────────────────────────────────────
 * UI Atoms
 * ───────────────────────────────────────────── */

function Card({
  theme,
  children,
  style,
}: {
  theme: any;
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View
      style={[
        tw`rounded-3xl p-4 border`,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Badge({
  theme,
  tone,
  children,
}: {
  theme: any;
  tone: 'blue' | 'green' | 'amber' | 'slate' | 'rose';
  children: React.ReactNode;
}) {
  const colors =
    tone === 'green'
      ? {
          bg: theme.dark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.10)',
          border: theme.dark ? 'rgba(16,185,129,0.28)' : 'rgba(16,185,129,0.28)',
          text: theme.dark ? 'rgba(167,243,208,0.95)' : 'rgba(6,95,70,0.95)',
        }
      : tone === 'amber'
        ? {
            bg: theme.dark ? 'rgba(245,158,11,0.14)' : 'rgba(245,158,11,0.10)',
            border: theme.dark ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.28)',
            text: theme.dark ? 'rgba(253,230,138,0.95)' : 'rgba(146,64,14,0.95)',
          }
        : tone === 'rose'
          ? {
              bg: theme.dark ? 'rgba(244,63,94,0.14)' : 'rgba(244,63,94,0.10)',
              border: theme.dark ? 'rgba(244,63,94,0.28)' : 'rgba(244,63,94,0.28)',
              text: theme.dark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)',
            }
          : tone === 'blue'
            ? {
                bg: theme.dark ? 'rgba(56,189,248,0.14)' : 'rgba(56,189,248,0.10)',
                border: theme.dark ? 'rgba(56,189,248,0.26)' : 'rgba(56,189,248,0.26)',
                text: theme.dark ? 'rgba(186,230,253,0.95)' : 'rgba(12,74,110,0.95)',
              }
            : {
                bg: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                border: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.30)',
                text: theme.dark ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.72)',
              };

  return (
    <View
      style={[
        tw`px-2 py-0.5 rounded-full mr-1 mb-1 border`,
        { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text }}>{children as any}</Text>
    </View>
  );
}

function ChipButton({
  theme,
  active,
  label,
  onPress,
}: {
  theme: any;
  active?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`px-3 py-2 rounded-full mr-2 mb-2 border`,
        {
          backgroundColor: active ? (theme.dark ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)') : theme.soft,
          borderColor: active ? (theme.dark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.10)') : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: active ? (theme.dark ? '#0b1220' : '#ffffff') : theme.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TabButton({
  theme,
  active,
  icon,
  title,
  subtitle,
  onPress,
}: {
  theme: any;
  active: boolean;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`flex-1 rounded-2xl p-4 border`,
        {
          backgroundColor: active ? (theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.95)') : theme.soft,
          borderColor: active ? (theme.dark ? 'rgba(255,255,255,0.20)' : 'rgba(15,23,42,0.10)') : theme.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View style={tw`flex-row items-start`}>
        <Text style={tw`text-xl mr-3`}>{icon}</Text>
        <View style={tw`flex-1`}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              color: active ? (theme.dark ? 'rgba(255,255,255,0.95)' : '#ffffff') : theme.text,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: 12,
              color: active ? (theme.dark ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.80)') : theme.subtext,
            }}
          >
            {subtitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function GhostButton({
  theme,
  label,
  onPress,
}: {
  theme: any;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`px-3 py-2 rounded-full border`,
        {
          backgroundColor: theme.soft,
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{label}</Text>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────── */

export default function OrgLearnerSportsClubsNative() {
  const themePref = useThemePref();
  const isDark = resolveIsDark(themePref);
  const theme = React.useMemo(() => buildTheme(isDark), [isDark]);

  const insets = useSafeAreaInsets();

  // Ensure content never goes under footer / bottom tabs
  const FOOTER_OVERLAY_PX = 84;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + (insets.bottom || 0));
  const topPad = (insets.top || 0) + 12;

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeParams = (route?.params || {}) as any;

  const { width } = useWindowDimensions();
  const clubCols = width >= 720 ? 2 : 1;

  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  const { backendUrl, token: userToken, orgToken, orgId: ctxOrgId } = (useShopContext?.() ?? {}) as any;

  const resolvedOrgId =
    (ctxOrgId as string) || (orgFromHook?.id as string) || (orgState?.org?.id as string) || null;

  const sportsToken = (orgToken as string) || (userToken as string) || null;
  const clubsToken = (userToken as string) || (orgToken as string) || null;

  const [activeTab, setActiveTab] = React.useState<TabKey>((routeParams?.tab as TabKey) || 'sports');

  // ─────────────────────────────────────────────
  // Sports state
  // ─────────────────────────────────────────────
  const [sportsMode, setSportsMode] = React.useState<SportsMode>('upcoming');
  const [sportsQ, setSportsQ] = React.useState('');
  const [sportsKind, setSportsKind] = React.useState<string>(''); // '' = all

  const sportsQuery = useQuery({
    queryKey: ['org-learner-sports', resolvedOrgId, sportsMode, sportsKind, sportsQ],
    enabled: Boolean(backendUrl && resolvedOrgId && sportsToken),
    queryFn: async () => {
      const status = sportsMode === 'results' ? 'completed' : 'scheduled';
      const rows = await listSportsEvents(backendUrl, sportsToken as string, resolvedOrgId as string, {
        status,
        kind: sportsKind || undefined,
        q: sportsQ.trim() || undefined,
        limit: 300,
        offset: 0,
      });
      return Array.isArray(rows) ? (rows as OrgSportsEvent[]) : [];
    },
    staleTime: 20_000,
  });

  const sportsAll = (sportsQuery.data || []) as any[];

  const sportsVisible = React.useMemo(() => {
    return sportsAll.filter((e) => {
      const a = String(e?.audience || '').trim().toLowerCase();
      return !a || a === 'learners' || a === 'all';
    });
  }, [sportsAll]);

  const sportsGrouped = React.useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of sportsVisible) {
      const k = dayKey(e?.event_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }

    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => {
        const ta = a?.event_at ? new Date(a.event_at).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b?.event_at ? new Date(b.event_at).getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
      m.set(k, arr);
    }

    const keys = Array.from(m.keys()).sort((a, b) => {
      if (a === 'TBC') return 1;
      if (b === 'TBC') return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });

    return keys.map((k) => ({ title: k, data: m.get(k)! }));
  }, [sportsVisible]);

  const nextEvent = React.useMemo(() => {
    const upcoming = sportsVisible
      .filter((e) => String(e?.status || 'scheduled').toLowerCase() === 'scheduled')
      .filter((e) => e?.event_at && !Number.isNaN(new Date(e.event_at).getTime()))
      .sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());
    return upcoming[0] || null;
  }, [sportsVisible]);

  // ─────────────────────────────────────────────
  // Clubs state
  // ─────────────────────────────────────────────
  const clubsQuery = useQuery({
    queryKey: ['org-learner-my-clubs', resolvedOrgId],
    enabled: Boolean(backendUrl && resolvedOrgId && clubsToken),
    queryFn: async () => {
      const rows = await apiGetMyClubs(backendUrl, clubsToken as string, resolvedOrgId as string);
      return Array.isArray(rows) ? (rows as OrgClub[]) : [];
    },
    staleTime: 20_000,
  });

  const myClubs = (clubsQuery.data || []) as any[];

  const clubsErr: any = clubsQuery.error;
  const clubsStatus = clubsErr?.response?.status;
  const clubsMsg = errMessage(clubsErr);

  const clubsAuthErr =
    clubsStatus === 401 || clubsStatus === 403 || /unauthor|token|session|jwt|forbidden/i.test(clubsMsg);

  const showMineHeadsUp = activeTab === 'clubs' && !userToken && clubsAuthErr;

  const missingCtx = !resolvedOrgId || !backendUrl || (!sportsToken && !clubsToken);

  const goDashboard = () => {
    try {
      navigation.navigate('OrgElearnPortal');
    } catch {
      try {
        navigation.navigate('Home');
      } catch {
        navigation.goBack?.();
      }
    }
  };

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={tw`flex-1`}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        indicatorStyle={theme.dark ? 'white' : 'black'}
        contentContainerStyle={[
          tw`px-3`,
          {
            paddingTop: topPad,
            paddingBottom: bottomPad,
          },
        ]}
      >
        <View style={tw`max-w-[920px] w-full self-center`}>
          {/* Header */}
          <Card theme={theme}>
            <View style={tw`flex-row items-start justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={[tw`text-[11px] tracking-widest font-semibold`, { color: theme.subtext }]}>
                  LEARNER ACTIVITIES
                </Text>
                <Text style={[tw`mt-1 text-xl font-extrabold`, { color: theme.text }]} numberOfLines={2}>
                  Sports Calendar & Clubs
                </Text>
                <Text style={[tw`mt-1 text-xs`, { color: theme.subtext }]}>
                  See sports events and your enrolled clubs — in one place.
                </Text>
              </View>

              <View style={tw`items-end`}>
                <View style={tw`mb-2`}>
                  <GhostButton theme={theme} label="← Back" onPress={() => navigation.goBack?.()} />
                </View>
                </View>
            </View>
          </Card>

          {missingCtx ? (
            <Card
              theme={theme}
              style={[
                tw`mt-3`,
                {
                  backgroundColor: theme.badBg,
                  borderColor: theme.badBorder,
                },
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: theme.badText }}>
                Missing org/session context
              </Text>
              <Text style={[tw`mt-1 text-sm`, { color: theme.subtext }]}>
                We need orgId + a token to load sports/clubs.
              </Text>
            </Card>
          ) : null}

          {/* Tabs */}
          <Card theme={theme} style={tw`mt-3`}>
            <View style={tw`flex-row`}>
              <TabButton
                theme={theme}
                active={activeTab === 'sports'}
                onPress={() => setActiveTab('sports')}
                icon="🏆"
                title="Sports Calendar"
                subtitle="Upcoming fixtures, practice, tournaments."
              />
              <View style={tw`w-3`} />
              <TabButton
                theme={theme}
                active={activeTab === 'clubs'}
                onPress={() => setActiveTab('clubs')}
                icon="🤝"
                title="Clubs & Societies"
                subtitle="Clubs you are enrolled in."
              />
            </View>
          </Card>

          {/* SPORTS */}
          {activeTab === 'sports' ? (
            <Card theme={theme} style={tw`mt-3`}>
              <View style={tw`flex-row items-start justify-between`}>
                <View style={tw`flex-1 pr-3`}>
                  <Text style={[tw`text-lg font-extrabold`, { color: theme.text }]}>Sports calendar</Text>
                  <Text style={[tw`mt-1 text-sm`, { color: theme.subtext }]}>
                    Only events meant for <Text style={{ fontWeight: '800', color: theme.text }}>learners</Text> (or{' '}
                    <Text style={{ fontWeight: '800', color: theme.text }}>everyone</Text>) appear here.
                  </Text>
                </View>

                <GhostButton theme={theme} label="Refresh" onPress={() => sportsQuery.refetch()} />
              </View>

              {/* mode chips */}
              <View style={tw`mt-3 flex-row flex-wrap`}>
                <ChipButton
                  theme={theme}
                  active={sportsMode === 'upcoming'}
                  label="Upcoming"
                  onPress={() => setSportsMode('upcoming')}
                />
                <ChipButton
                  theme={theme}
                  active={sportsMode === 'results'}
                  label="Results"
                  onPress={() => setSportsMode('results')}
                />
              </View>

              {/* next up */}
              {sportsMode === 'upcoming' && nextEvent ? (
                <View
                  style={[
                    tw`mt-3 rounded-2xl p-4 border`,
                    {
                      borderColor: theme.dark ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.30)',
                      backgroundColor: theme.dark ? 'rgba(16,185,129,0.10)' : 'rgba(236,253,245,1)',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      letterSpacing: 2,
                      fontWeight: '800',
                      color: theme.dark ? 'rgba(167,243,208,0.9)' : 'rgba(6,95,70,0.85)',
                    }}
                  >
                    NEXT UP
                  </Text>

                  <Text style={[tw`mt-1 text-base font-extrabold`, { color: theme.text }]} numberOfLines={2}>
                    {pickString(nextEvent?.title, 'Untitled event')}
                  </Text>

                  <Text style={[tw`mt-2 text-sm`, { color: theme.text }]}>
                    <Text style={{ fontWeight: '800' }}>{fmtWhen(nextEvent?.event_at)}</Text>
                    {nextEvent?.location ? <Text style={{ color: theme.subtext }}> • {nextEvent.location}</Text> : null}
                  </Text>

                  <View style={tw`mt-2 flex-row flex-wrap`}>
                    <Badge theme={theme} tone="slate">
                      {KIND_LABEL[String(nextEvent?.kind || 'other')] || String(nextEvent?.kind || 'other')}
                    </Badge>
                    <Badge theme={theme} tone="blue">
                      {STATUS_LABEL[String(nextEvent?.status || 'scheduled')] ||
                        String(nextEvent?.status || 'scheduled')}
                    </Badge>
                    {nextEvent?.team_label ? (
                      <Badge theme={theme} tone="amber">
                        {String(nextEvent.team_label)}
                      </Badge>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* filters */}
              <View style={tw`mt-4`}>
                <TextInput
                  value={sportsQ}
                  onChangeText={setSportsQ}
                  placeholder="Search sports… (team, opponent, title)"
                  placeholderTextColor={theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(100,116,139,0.85)'}
                  style={[
                    tw`rounded-2xl px-4 py-3 text-sm border`,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                />

                <View style={tw`mt-3 flex-row flex-wrap`}>
                  <ChipButton theme={theme} active={!sportsKind} label="All kinds" onPress={() => setSportsKind('')} />
                  <ChipButton
                    theme={theme}
                    active={sportsKind === 'fixture'}
                    label="Fixture"
                    onPress={() => setSportsKind('fixture')}
                  />
                  <ChipButton
                    theme={theme}
                    active={sportsKind === 'practice'}
                    label="Practice"
                    onPress={() => setSportsKind('practice')}
                  />
                  <ChipButton
                    theme={theme}
                    active={sportsKind === 'tournament'}
                    label="Tournament"
                    onPress={() => setSportsKind('tournament')}
                  />
                  <ChipButton
                    theme={theme}
                    active={sportsKind === 'other'}
                    label="Other"
                    onPress={() => setSportsKind('other')}
                  />
                </View>
              </View>

              {/* list */}
              <View style={tw`mt-3`}>
                {sportsQuery.isLoading ? (
                  <View style={tw`py-6`}>
                    <Text style={[tw`text-sm`, { color: theme.subtext }]}>Loading sports…</Text>
                    <ActivityIndicator style={tw`mt-3`} color={theme.text} />
                  </View>
                ) : sportsQuery.error ? (
                  <View
                    style={[
                      tw`mt-2 rounded-2xl p-3 border`,
                      { borderColor: theme.badBorder, backgroundColor: theme.badBg },
                    ]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.badText }}>
                      Could not load sports.
                    </Text>
                    <Text style={[tw`mt-1 text-sm`, { color: theme.subtext }]}>{errMessage(sportsQuery.error)}</Text>
                  </View>
                ) : sportsGrouped.length === 0 ? (
                  <View
                    style={[
                      tw`mt-2 rounded-2xl p-4 border`,
                      { borderColor: theme.border, backgroundColor: theme.soft },
                    ]}
                  >
                    <Text style={[tw`text-sm`, { color: theme.subtext }]}>
                      No sports events found yet. If your school has sports, ask a staff member to publish fixtures.
                    </Text>
                  </View>
                ) : (
                  <SectionList
                    sections={sportsGrouped as any}
                    keyExtractor={(item: any, idx) => String(item?.id ?? idx)}
                    scrollEnabled={false}
                    renderSectionHeader={({ section }: any) => (
                      <Text
                        style={[
                          tw`mt-4 mb-2 text-[11px] tracking-widest font-semibold`,
                          { color: theme.muted },
                        ]}
                      >
                        {String(section.title || '')}
                      </Text>
                    )}
                    renderItem={({ item }: any) => {
                      const e = item;
                      const k = String(e?.kind || 'other');
                      const st = String(e?.status || 'scheduled');

                      const tone = st === 'completed' ? 'green' : st === 'cancelled' ? 'rose' : 'blue';

                      const title = pickString(e?.title, 'Untitled');
                      const team = pickString(e?.team_label);
                      const opp = pickString(e?.opponent);

                      const score =
                        e?.score_home != null || e?.score_away != null
                          ? `${e?.score_home ?? '—'} : ${e?.score_away ?? '—'}`
                          : null;

                      return (
                        <View
                          style={[
                            tw`rounded-2xl p-4 mb-2 border`,
                            {
                              backgroundColor: theme.inputBg,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <View style={tw`flex-row flex-wrap items-center`}>
                            <Text style={[tw`text-base font-extrabold mr-2`, { color: theme.text }]} numberOfLines={2}>
                              {title}
                            </Text>
                            <Badge theme={theme} tone="slate">
                              {KIND_LABEL[k] || k}
                            </Badge>
                            <Badge theme={theme} tone={tone as any}>
                              {STATUS_LABEL[st] || st}
                            </Badge>
                            {score ? (
                              <Badge theme={theme} tone="amber">
                                Score {score}
                              </Badge>
                            ) : null}
                          </View>

                          <Text style={[tw`mt-2 text-sm`, { color: theme.text }]}>
                            <Text style={{ fontWeight: '800' }}>{fmtWhen(e?.event_at)}</Text>
                            {e?.end_at ? <Text style={{ color: theme.subtext }}> → {fmtWhen(e.end_at)}</Text> : null}
                          </Text>

                          <Text style={[tw`mt-1 text-sm`, { color: theme.subtext }]}>
                            {team ? (
                              <Text style={{ fontWeight: '800', color: theme.text }}>{team}</Text>
                            ) : (
                              <Text style={{ color: theme.subtext }}>Team TBC</Text>
                            )}
                            {opp ? <Text style={{ color: theme.subtext }}> vs {opp}</Text> : null}
                            {e?.location ? <Text style={{ color: theme.subtext }}> • {String(e.location)}</Text> : null}
                          </Text>

                          {e?.description ? (
                            <Text style={[tw`mt-2 text-sm`, { color: theme.subtext }]}>{String(e.description)}</Text>
                          ) : null}
                        </View>
                      );
                    }}
                  />
                )}
              </View>
            </Card>
          ) : null}

          {/* CLUBS */}
          {activeTab === 'clubs' ? (
            <Card theme={theme} style={tw`mt-3`}>
              <View style={tw`flex-row items-start justify-between`}>
                <View style={tw`flex-1 pr-3`}>
                  <Text style={[tw`text-lg font-extrabold`, { color: theme.text }]}>Clubs &amp; societies</Text>
                  <Text style={[tw`mt-1 text-sm`, { color: theme.subtext }]}>
                    These are the clubs you are currently enrolled in.
                  </Text>
                </View>

                <GhostButton theme={theme} label="Refresh" onPress={() => clubsQuery.refetch()} />
              </View>

              {showMineHeadsUp ? (
                <View
                  style={[
                    tw`mt-3 rounded-2xl px-3 py-2 border`,
                    { backgroundColor: theme.warnBg, borderColor: theme.warnBorder },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.warnText }}>
                    Heads-up: “My clubs” needs an active session token. If it doesn’t load, sign out and log in again.
                  </Text>
                </View>
              ) : null}

              <View style={tw`mt-3`}>
                {clubsQuery.isLoading ? (
                  <View style={tw`py-6`}>
                    <Text style={[tw`text-sm`, { color: theme.subtext }]}>Loading your clubs…</Text>
                    <ActivityIndicator style={tw`mt-3`} color={theme.text} />
                  </View>
                ) : clubsQuery.error ? (
                  <View
                    style={[
                      tw`mt-2 rounded-2xl p-3 border`,
                      { backgroundColor: theme.badBg, borderColor: theme.badBorder },
                    ]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.badText }}>
                      Could not load your clubs.
                    </Text>
                    <Text style={[tw`mt-1 text-sm`, { color: theme.subtext }]}>{errMessage(clubsQuery.error)}</Text>
                  </View>
                ) : myClubs.length === 0 ? (
                  <View
                    style={[
                      tw`mt-2 rounded-2xl p-4 border`,
                      { borderColor: theme.border, backgroundColor: theme.soft },
                    ]}
                  >
                    <Text style={[tw`text-sm`, { color: theme.subtext }]}>
                      You are not enrolled in any club yet. Ask your teacher/admin to add you to a club.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={myClubs}
                    key={clubCols}
                    numColumns={clubCols}
                    scrollEnabled={false}
                    keyExtractor={(c: any, idx) => String(c?.id ?? idx)}
                    columnWrapperStyle={clubCols > 1 ? { gap: 12 } : undefined}
                    contentContainerStyle={{ paddingTop: 8 }}
                    renderItem={({ item }: any) => {
                      const c = item;
                      const name = pickString(c?.name, 'Club');
                      const desc = pickString(c?.description);
                      const schedule = pickString(c?.meeting_schedule, c?.meetingSchedule);
                      const memberRole = pickString(c?.role, c?.member_role, c?.membership_role);
                      const active = c?.is_active == null ? true : Boolean(c?.is_active);

                      return (
                        <View style={{ flex: 1, marginBottom: 12 }}>
                          <View
                            style={[
                              tw`rounded-2xl p-4 border`,
                              { backgroundColor: theme.inputBg, borderColor: theme.border },
                            ]}
                          >
                            <View style={tw`flex-row items-start justify-between`}>
                              <View style={tw`flex-1 pr-3`}>
                                <Text style={[tw`text-base font-extrabold`, { color: theme.text }]} numberOfLines={2}>
                                  {name}
                                </Text>
                                <Text style={[tw`mt-1 text-xs`, { color: theme.subtext }]}>
                                  {schedule ? `📅 ${schedule}` : '📅 Schedule: TBC'}
                                </Text>
                              </View>

                              <View style={tw`items-end`}>
                                <View style={tw`flex-row flex-wrap justify-end`}>
                                  <Badge theme={theme} tone={active ? 'green' : 'slate'}>
                                    {active ? 'Active' : 'Inactive'}
                                  </Badge>
                                  {memberRole ? (
                                    <Badge theme={theme} tone="blue">
                                      {memberRole}
                                    </Badge>
                                  ) : null}
                                </View>
                              </View>
                            </View>

                            {desc ? (
                              <Text style={[tw`mt-3 text-sm`, { color: theme.subtext }]}>{desc}</Text>
                            ) : (
                              <Text style={[tw`mt-3 text-sm`, { color: theme.muted }]}>No description yet.</Text>
                            )}
                          </View>
                        </View>
                      );
                    }}
                  />
                )}
              </View>
            </Card>
          ) : null}

          {/* Footer tip */}
          <Card theme={theme} style={tw`mt-3`}>
            <Text style={[tw`text-xs`, { color: theme.subtext }]}>
              Tip: Sports events are published by staff. Clubs are assigned by staff — if anything is missing, ask your
              class teacher to update it.
            </Text>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

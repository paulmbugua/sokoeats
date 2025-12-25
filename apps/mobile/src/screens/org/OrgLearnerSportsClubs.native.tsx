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
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import tw from 'twrnc';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

import type { OrgSportsEvent, OrgClub } from '@mytutorapp/shared/types';
import {
  listSportsEvents,
  getMyClubs as apiGetMyClubs,
} from '@mytutorapp/shared/api/orgEngagementApi';

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

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const isDark = useColorScheme() === 'dark';
  return (
    <View
      style={[
        tw`rounded-3xl p-4`,
        {
          backgroundColor: isDark ? '#0b1220' : 'rgba(255,255,255,0.92)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)',
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.22 : 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'blue' | 'green' | 'amber' | 'slate' | 'rose';
  children: React.ReactNode;
}) {
  const isDark = useColorScheme() === 'dark';

  const colors =
    tone === 'green'
      ? {
          bg: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.10)',
          border: isDark ? 'rgba(16,185,129,0.28)' : 'rgba(16,185,129,0.28)',
          text: isDark ? 'rgba(167,243,208,0.95)' : 'rgba(6,95,70,0.95)',
        }
      : tone === 'amber'
        ? {
            bg: isDark ? 'rgba(245,158,11,0.14)' : 'rgba(245,158,11,0.10)',
            border: isDark ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.28)',
            text: isDark ? 'rgba(253,230,138,0.95)' : 'rgba(146,64,14,0.95)',
          }
        : tone === 'rose'
          ? {
              bg: isDark ? 'rgba(244,63,94,0.14)' : 'rgba(244,63,94,0.10)',
              border: isDark ? 'rgba(244,63,94,0.28)' : 'rgba(244,63,94,0.28)',
              text: isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)',
            }
          : tone === 'blue'
            ? {
                bg: isDark ? 'rgba(56,189,248,0.14)' : 'rgba(56,189,248,0.10)',
                border: isDark ? 'rgba(56,189,248,0.26)' : 'rgba(56,189,248,0.26)',
                text: isDark ? 'rgba(186,230,253,0.95)' : 'rgba(12,74,110,0.95)',
              }
            : {
                bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.30)',
                text: isDark ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.72)',
              };

  return (
    <View
      style={[
        tw`px-2 py-0.5 rounded-full mr-1 mb-1`,
        { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
      ]}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text }}>{children as any}</Text>
    </View>
  );
}

function ChipButton({
  active,
  label,
  onPress,
}: {
  active?: boolean;
  label: string;
  onPress: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`px-3 py-2 rounded-full mr-2 mb-2`,
        {
          backgroundColor: active
            ? isDark
              ? 'rgba(255,255,255,0.95)'
              : 'rgba(15,23,42,0.95)'
            : isDark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.85)',
          borderWidth: 1,
          borderColor: active
            ? isDark
              ? 'rgba(255,255,255,0.15)'
              : 'rgba(15,23,42,0.10)'
            : isDark
              ? 'rgba(255,255,255,0.12)'
              : 'rgba(148,163,184,0.35)',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: active ? (isDark ? '#0b1220' : '#ffffff') : isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TabButton({
  active,
  icon,
  title,
  subtitle,
  onPress,
}: {
  active: boolean;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`flex-1 rounded-2xl p-4`,
        {
          backgroundColor: active
            ? isDark
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(15,23,42,0.95)'
            : isDark
              ? 'rgba(255,255,255,0.05)'
              : '#ffffff',
          borderWidth: 1,
          borderColor: active
            ? isDark
              ? 'rgba(255,255,255,0.20)'
              : 'rgba(15,23,42,0.10)'
            : isDark
              ? 'rgba(255,255,255,0.10)'
              : 'rgba(148,163,184,0.35)',
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
              color: active ? (isDark ? 'rgba(255,255,255,0.95)' : '#ffffff') : isDark ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)',
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: 12,
              color: active
                ? isDark
                  ? 'rgba(255,255,255,0.70)'
                  : 'rgba(255,255,255,0.80)'
                : isDark
                  ? 'rgba(255,255,255,0.65)'
                  : 'rgba(71,85,105,0.95)',
            }}
          >
            {subtitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function OrgLearnerSportsClubsNative() {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeParams = (route?.params || {}) as any;

  const shellBg = isDark ? '#020617' : '#f8fafc';
  const textPrimary = isDark ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(71,85,105,0.95)';

  const { width } = useWindowDimensions();
  const clubCols = width >= 720 ? 2 : 1;

  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  const { backendUrl, token: userToken, orgToken, orgId: ctxOrgId } = useShopContext() as any;

  const resolvedOrgId =
    (ctxOrgId as string) ||
    (orgFromHook?.id as string) ||
    (orgState?.org?.id as string) ||
    null;

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
    // best-effort; adjust the route name to your real learner dashboard screen
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
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: shellBg }]}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 18 }}>
        {/* Header */}
        <Card>
          <View style={tw`flex-row items-start justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={[tw`text-[11px] tracking-widest`, { color: textSecondary }]}>
                LEARNER ACTIVITIES
              </Text>
              <Text style={[tw`mt-1 text-xl font-extrabold`, { color: textPrimary }]} numberOfLines={2}>
                Sports Calendar & Clubs
              </Text>
              <Text style={[tw`mt-1 text-xs`, { color: textSecondary }]}>
                See sports events and your enrolled clubs — in one place.
              </Text>
            </View>

            <View style={tw`items-end`}>
              <Pressable
                onPress={() => navigation.goBack?.()}
                style={({ pressed }) => [
                  tw`px-3 py-2 rounded-full mb-2`,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                  ← Back
                </Text>
              </Pressable>

              <Pressable
                onPress={goDashboard}
                style={({ pressed }) => [
                  tw`px-3 py-2 rounded-full`,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                  Dashboard
                </Text>
              </Pressable>
            </View>
          </View>
        </Card>

        {missingCtx ? (
          <Card
            style={[
              tw`mt-3`,
              { backgroundColor: isDark ? 'rgba(127,29,29,0.20)' : 'rgba(254,242,242,1)' },
            ]}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)' }}>
              Missing org/session context
            </Text>
            <Text style={[tw`mt-1 text-sm`, { color: textSecondary }]}>
              We need orgId + a token to load sports/clubs.
            </Text>
          </Card>
        ) : null}

        {/* Tabs */}
        <Card style={tw`mt-3`}>
          <View style={tw`flex-row`}>
            <TabButton
              active={activeTab === 'sports'}
              onPress={() => setActiveTab('sports')}
              icon="🏆"
              title="Sports Calendar"
              subtitle="Upcoming fixtures, practice, tournaments."
            />
            <View style={tw`w-3`} />
            <TabButton
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
          <Card style={tw`mt-3`}>
            <View style={tw`flex-row items-start justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={[tw`text-lg font-extrabold`, { color: textPrimary }]}>Sports calendar</Text>
                <Text style={[tw`mt-1 text-sm`, { color: textSecondary }]}>
                  Only events meant for <Text style={{ fontWeight: '800', color: textPrimary }}>learners</Text> (or{' '}
                  <Text style={{ fontWeight: '800', color: textPrimary }}>everyone</Text>) appear here.
                </Text>
              </View>

              <Pressable
                onPress={() => sportsQuery.refetch()}
                style={({ pressed }) => [
                  tw`px-3 py-2 rounded-full`,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                  Refresh
                </Text>
              </Pressable>
            </View>

            {/* mode chips */}
            <View style={tw`mt-3 flex-row flex-wrap`}>
              <ChipButton active={sportsMode === 'upcoming'} label="Upcoming" onPress={() => setSportsMode('upcoming')} />
              <ChipButton active={sportsMode === 'results'} label="Results" onPress={() => setSportsMode('results')} />
            </View>

            {/* next up */}
            {sportsMode === 'upcoming' && nextEvent ? (
              <View
                style={[
                  tw`mt-3 rounded-2xl p-4`,
                  {
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.30)',
                    backgroundColor: isDark ? 'rgba(16,185,129,0.10)' : 'rgba(236,253,245,1)',
                  },
                ]}
              >
                <Text style={{ fontSize: 11, letterSpacing: 2, fontWeight: '800', color: isDark ? 'rgba(167,243,208,0.9)' : 'rgba(6,95,70,0.85)' }}>
                  NEXT UP
                </Text>
                <Text style={[tw`mt-1 text-base font-extrabold`, { color: textPrimary }]} numberOfLines={2}>
                  {pickString(nextEvent?.title, 'Untitled event')}
                </Text>
                <Text style={[tw`mt-2 text-sm`, { color: isDark ? 'rgba(255,255,255,0.80)' : 'rgba(15,23,42,0.85)' }]}>
                  <Text style={{ fontWeight: '800' }}>{fmtWhen(nextEvent?.event_at)}</Text>
                  {nextEvent?.location ? <Text style={{ color: textSecondary }}> • {nextEvent.location}</Text> : null}
                </Text>

                <View style={tw`mt-2 flex-row flex-wrap`}>
                  <Badge tone="slate">{KIND_LABEL[String(nextEvent?.kind || 'other')] || String(nextEvent?.kind || 'other')}</Badge>
                  <Badge tone="blue">{STATUS_LABEL[String(nextEvent?.status || 'scheduled')] || String(nextEvent?.status || 'scheduled')}</Badge>
                  {nextEvent?.team_label ? <Badge tone="amber">{String(nextEvent.team_label)}</Badge> : null}
                </View>
              </View>
            ) : null}

            {/* filters */}
            <View style={tw`mt-4`}>
              <TextInput
                value={sportsQ}
                onChangeText={setSportsQ}
                placeholder="Search sports… (team, opponent, title)"
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(100,116,139,0.85)'}
                style={[
                  tw`rounded-2xl px-4 py-3 text-sm`,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)',
                    color: textPrimary,
                  },
                ]}
              />

              <View style={tw`mt-3 flex-row flex-wrap`}>
                <ChipButton active={!sportsKind} label="All kinds" onPress={() => setSportsKind('')} />
                <ChipButton active={sportsKind === 'fixture'} label="Fixture" onPress={() => setSportsKind('fixture')} />
                <ChipButton active={sportsKind === 'practice'} label="Practice" onPress={() => setSportsKind('practice')} />
                <ChipButton active={sportsKind === 'tournament'} label="Tournament" onPress={() => setSportsKind('tournament')} />
                <ChipButton active={sportsKind === 'other'} label="Other" onPress={() => setSportsKind('other')} />
              </View>
            </View>

            {/* list */}
            <View style={tw`mt-3`}>
              {sportsQuery.isLoading ? (
                <View style={tw`py-6`}>
                  <Text style={[tw`text-sm`, { color: textSecondary }]}>Loading sports…</Text>
                  <ActivityIndicator style={tw`mt-3`} />
                </View>
              ) : sportsQuery.error ? (
                <View
                  style={[
                    tw`mt-2 rounded-2xl p-3`,
                    {
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(244,63,94,0.25)' : 'rgba(254,202,202,1)',
                      backgroundColor: isDark ? 'rgba(127,29,29,0.18)' : 'rgba(254,242,242,1)',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)' }}>
                    Could not load sports.
                  </Text>
                  <Text style={[tw`mt-1 text-sm`, { color: textSecondary }]}>{errMessage(sportsQuery.error)}</Text>
                </View>
              ) : sportsGrouped.length === 0 ? (
                <View
                  style={[
                    tw`mt-2 rounded-2xl p-4`,
                    {
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.30)',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(248,250,252,1)',
                    },
                  ]}
                >
                  <Text style={[tw`text-sm`, { color: textSecondary }]}>
                    No sports events found yet. If your school has sports, ask a staff member to publish fixtures.
                  </Text>
                </View>
              ) : (
                <SectionList
                  sections={sportsGrouped as any}
                  keyExtractor={(item: any, idx) => String(item?.id ?? idx)}
                  scrollEnabled={false}
                  renderSectionHeader={({ section }: any) => (
                    <Text style={[tw`mt-4 mb-2 text-[11px] tracking-widest`, { color: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(100,116,139,0.95)' }]}>
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
                          tw`rounded-2xl p-4 mb-2`,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)',
                          },
                        ]}
                      >
                        <View style={tw`flex-row flex-wrap items-center`}>
                          <Text style={[tw`text-base font-extrabold mr-2`, { color: textPrimary }]} numberOfLines={2}>
                            {title}
                          </Text>
                          <Badge tone="slate">{KIND_LABEL[k] || k}</Badge>
                          <Badge tone={tone as any}>{STATUS_LABEL[st] || st}</Badge>
                          {score ? <Badge tone="amber">Score {score}</Badge> : null}
                        </View>

                        <Text style={[tw`mt-2 text-sm`, { color: isDark ? 'rgba(255,255,255,0.82)' : 'rgba(15,23,42,0.85)' }]}>
                          <Text style={{ fontWeight: '800' }}>{fmtWhen(e?.event_at)}</Text>
                          {e?.end_at ? <Text style={{ color: textSecondary }}> → {fmtWhen(e.end_at)}</Text> : null}
                        </Text>

                        <Text style={[tw`mt-1 text-sm`, { color: isDark ? 'rgba(255,255,255,0.70)' : 'rgba(15,23,42,0.70)' }]}>
                          {team ? (
                            <Text style={{ fontWeight: '800', color: isDark ? 'rgba(255,255,255,0.86)' : 'rgba(15,23,42,0.86)' }}>
                              {team}
                            </Text>
                          ) : (
                            <Text style={{ color: textSecondary }}>Team TBC</Text>
                          )}
                          {opp ? <Text style={{ color: textSecondary }}> vs {opp}</Text> : null}
                          {e?.location ? <Text style={{ color: textSecondary }}> • {String(e.location)}</Text> : null}
                        </Text>

                        {e?.description ? (
                          <Text style={[tw`mt-2 text-sm`, { color: textSecondary }]}>{String(e.description)}</Text>
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
          <Card style={tw`mt-3`}>
            <View style={tw`flex-row items-start justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={[tw`text-lg font-extrabold`, { color: textPrimary }]}>Clubs &amp; societies</Text>
                <Text style={[tw`mt-1 text-sm`, { color: textSecondary }]}>
                  These are the clubs you are currently enrolled in.
                </Text>
              </View>

              <Pressable
                onPress={() => clubsQuery.refetch()}
                style={({ pressed }) => [
                  tw`px-3 py-2 rounded-full`,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                  Refresh
                </Text>
              </Pressable>
            </View>

            {showMineHeadsUp ? (
              <View
                style={[
                  tw`mt-3 rounded-2xl px-3 py-2`,
                  {
                    backgroundColor: isDark ? 'rgba(245,158,11,0.14)' : 'rgba(255,251,235,1)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(245,158,11,0.22)' : 'rgba(253,230,138,1)',
                  },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? 'rgba(253,230,138,0.95)' : 'rgba(146,64,14,0.95)' }}>
                  Heads-up: “My clubs” needs an active session token. If it doesn’t load, sign out and log in again.
                </Text>
              </View>
            ) : null}

            <View style={tw`mt-3`}>
              {clubsQuery.isLoading ? (
                <View style={tw`py-6`}>
                  <Text style={[tw`text-sm`, { color: textSecondary }]}>Loading your clubs…</Text>
                  <ActivityIndicator style={tw`mt-3`} />
                </View>
              ) : clubsQuery.error ? (
                <View
                  style={[
                    tw`mt-2 rounded-2xl p-3`,
                    {
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(244,63,94,0.25)' : 'rgba(254,202,202,1)',
                      backgroundColor: isDark ? 'rgba(127,29,29,0.18)' : 'rgba(254,242,242,1)',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)' }}>
                    Could not load your clubs.
                  </Text>
                  <Text style={[tw`mt-1 text-sm`, { color: textSecondary }]}>{errMessage(clubsQuery.error)}</Text>
                </View>
              ) : myClubs.length === 0 ? (
                <View
                  style={[
                    tw`mt-2 rounded-2xl p-4`,
                    {
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.30)',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(248,250,252,1)',
                    },
                  ]}
                >
                  <Text style={[tw`text-sm`, { color: textSecondary }]}>
                    You are not enrolled in any club yet. Ask your teacher/admin to add you to a club.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={myClubs}
                  key={clubCols} // force relayout when columns change
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
                    const role = pickString(c?.role, c?.member_role, c?.membership_role);
                    const active = c?.is_active == null ? true : Boolean(c?.is_active);

                    return (
                      <View style={{ flex: 1, marginBottom: 12 }}>
                        <View
                          style={[
                            tw`rounded-2xl p-4`,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                              borderWidth: 1,
                              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)',
                            },
                          ]}
                        >
                          <View style={tw`flex-row items-start justify-between`}>
                            <View style={tw`flex-1 pr-3`}>
                              <Text style={[tw`text-base font-extrabold`, { color: textPrimary }]} numberOfLines={2}>
                                {name}
                              </Text>
                              <Text style={[tw`mt-1 text-xs`, { color: textSecondary }]}>
                                {schedule ? `📅 ${schedule}` : '📅 Schedule: TBC'}
                              </Text>
                            </View>
                            <View style={tw`items-end`}>
                              <View style={tw`flex-row flex-wrap justify-end`}>
                                <Badge tone={active ? 'green' : 'slate'}>{active ? 'Active' : 'Inactive'}</Badge>
                                {role ? <Badge tone="blue">{role}</Badge> : null}
                              </View>
                            </View>
                          </View>

                          {desc ? (
                            <Text style={[tw`mt-3 text-sm`, { color: textSecondary }]}>{desc}</Text>
                          ) : (
                            <Text style={[tw`mt-3 text-sm`, { color: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(100,116,139,0.95)' }]}>
                              No description yet.
                            </Text>
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
        <Card style={tw`mt-3`}>
          <Text style={[tw`text-xs`, { color: textSecondary }]}>
            Tip: Sports events are published by staff. Clubs are assigned by staff — if anything is missing, ask your class teacher to update it.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

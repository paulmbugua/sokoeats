/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { getMyOrgOrBootstrap, getOrgUsage } from '@mytutorapp/shared/api';
import { getOrgRoster as apiRoster } from '@mytutorapp/shared/api/orgApi';

import ThemeToggle from '../ThemeToggle.native';
import { useThemePref } from '../../theme/ThemeContext';

// Shared native helpers + UI
import { resolveAsset, tierTone, Skeleton } from './OrgProfileShared.native';

/* ---------------- types ---------------- */
type Org = {
  id: string;
  name?: string;
  slug?: string;
  logo_url?: string;
  signature_url?: string;
  certificate_title?: string;
  tier?: 'starter' | 'pro' | 'enterprise';
  seats_used?: number;
  owner_email?: string;
  email_domain?: string;

  // School contact fields
  address_line1?: string;
  address_line2?: string;
  phone_number?: string;
  contact_email?: string;
  website_url?: string;

  // Learner grouping labels
  house_label?: string;
  dorm_label?: string;
  club_label?: string;
};

/* ---------------- theming ---------------- */
function usePalette() {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';
  return {
    isDark,
    bg: isDark ? '#020617' : '#f8fafc',
    card: isDark ? '#0b1016' : '#ffffff',
    softCard: isDark ? '#050816' : '#ffffff',
    border: isDark ? 'rgba(148,163,184,0.28)' : '#cedbe8',
    divider: isDark ? 'rgba(15,23,42,1)' : '#e7edf4',
    dashed: isDark ? 'rgba(148,163,184,0.45)' : '#cedbe8',
    text: isDark ? '#e5f0ff' : '#0d141c',
    textMuted: isDark ? 'rgba(148,163,184,0.95)' : '#49739c',
    textSubtle: isDark ? 'rgba(148,163,184,0.85)' : 'rgba(73,115,156,0.75)',
    chipBg: (_c: string) => (isDark ? `${_c}24` : '#e7edf4'),
    chipDot: (c: string) => c,
    surface(style?: any) {
      return [
        tw`rounded-3xl p-5`,
        {
          backgroundColor: this.card,
          borderColor: this.border,
          borderWidth: 1,
        },
        style,
      ];
    },
    smallSurface(style?: any) {
      return [
        tw`rounded-2xl p-4`,
        {
          backgroundColor: this.card,
          borderColor: this.border,
          borderWidth: 1,
        },
        style,
      ];
    },
    softSurface(style?: any) {
      return [
        tw`rounded-3xl p-5`,
        {
          backgroundColor: this.softCard,
          borderColor: this.border,
          borderWidth: 1,
        },
        style,
      ];
    },
  };
}

/* ---------------- helpers ---------------- */
async function tryFetchRosterCounts(backendUrl: string, token: string, orgId: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const base = backendUrl.replace(/\/+$/, '');
  const candidates = [
    `${base}/api/orgs/${orgId}/roster`,
    `${base}/api/organizations/${orgId}/roster`,
    `${base}/api/orgs/${orgId}/members`,
    `${base}/api/organizations/${orgId}/members`,
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers });
      if (r.ok) {
        const j: any = await r.json();
        const instructors = Array.isArray(j?.instructors) ? j.instructors : [];
        const learners = Array.isArray(j?.learners) ? j.learners : [];
        return { instructorCount: instructors.length, learnerCount: learners.length };
      }
    } catch {
      // ignore
    }
  }

  return { instructorCount: 0, learnerCount: 0 };
}

/* ---------------- micro UI ---------------- */
const StatCard: React.FC<{
  label: string;
  value: string;
  palette: ReturnType<typeof usePalette>;
}> = ({ label, value, palette }) => (
  <View style={palette.smallSurface()}>
    <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>{label}</Text>
    <Text style={[tw`text-2xl font-extrabold mt-1`, { color: palette.text, letterSpacing: 0.2 }]}>
      {value}
    </Text>
  </View>
);

const ProgressBar: React.FC<{
  pct: number;
  palette: ReturnType<typeof usePalette>;
}> = ({ pct, palette }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const bar = clamped >= 90 ? '#ef4444' : clamped >= 70 ? '#f59e0b' : '#10b981';
  return (
    <View style={[tw`h-2 rounded-full mt-2 overflow-hidden`, { backgroundColor: palette.divider }]}>
      <View style={[tw`h-2 rounded-full`, { width: `${clamped}%`, backgroundColor: bar }]} />
    </View>
  );
};

const ActionPill: React.FC<{
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  palette: ReturnType<typeof usePalette>;
  icon?: keyof typeof Ionicons.glyphMap;
}> = ({ label, onPress, disabled, palette, icon }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.85}
    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    style={[
      tw`px-3 py-2 rounded-full mr-2 mb-2 flex-row items-center`,
      {
        backgroundColor: palette.divider,
        opacity: disabled ? 0.5 : 1,
        maxWidth: '100%',
        alignSelf: 'flex-start',
      },
    ]}
    accessibilityRole="button"
  >
    {!!icon && <Ionicons name={icon} size={14} color={palette.text} />}
    <Text
      style={[
        tw`text-[11px] font-semibold`,
        {
          color: palette.text,
          marginLeft: icon ? 6 : 0,
          flexShrink: 1,
          flexWrap: 'wrap',
        },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

/* ---------------- screen ---------------- */
const OrgProfileNative: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  const { backendUrl, orgToken, orgLogout } = useShopContext() as any;

  const [org, setOrg] = useState<Org | null>(null);
  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [seatsMax, setSeatsMax] = useState<number>(50);
  const [loading, setLoading] = useState(true);

  // ✅ roster moved to separate page — keep only counts here
  const [instructorCount, setInstructorCount] = useState(0);
  const [learnerCount, setLearnerCount] = useState(0);

  // 🔧 UPDATE THIS if your native route name differs
  const ROSTER_SCREEN = 'OrgRoster';

  const seatCap = useCallback((tier?: string) => {
    switch ((tier || 'starter').toLowerCase()) {
      case 'enterprise':
        return 5000;
      case 'pro':
        return 500;
      default:
        return 50;
    }
  }, []);

  const refreshRosterCounts = useCallback(
    async (orgId: string) => {
      if (!orgToken || !orgId) return;
      try {
        const roster: any = await apiRoster(backendUrl, orgToken, orgId);
        const instructors = Array.isArray(roster?.instructors) ? roster.instructors : [];
        const learners = Array.isArray(roster?.learners) ? roster.learners : [];
        setInstructorCount(instructors.length);
        setLearnerCount(learners.length);
      } catch {
        const fallback = await tryFetchRosterCounts(backendUrl, orgToken, orgId);
        setInstructorCount(fallback.instructorCount);
        setLearnerCount(fallback.learnerCount);
      }
    },
    [backendUrl, orgToken]
  );

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!orgToken) {
        setLoading(false);
        return;
      }
      try {
        const o = await getMyOrgOrBootstrap(backendUrl, orgToken);
        if (stop) return;

        setOrg(o);
        setSeatsMax(seatCap(o?.tier));

        try {
          const u = await getOrgUsage(backendUrl, orgToken, o.id);
          if (!stop) setSeatsUsed(Number(u?.seats_used ?? 0));
        } catch {
          if (!stop) setSeatsUsed(Number(o?.seats_used ?? 0));
        }

        if (!stop) await refreshRosterCounts(o.id);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load organization.');
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [backendUrl, orgToken, seatCap, refreshRosterCounts]);

  const logo = useMemo(
    () => resolveAsset(org?.logo_url, backendUrl, org?.name),
    [org?.logo_url, backendUrl, org?.name]
  );

  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100));
  const tierColors = tierTone(org?.tier);

  const hasGroupingLabels =
    !!org?.house_label?.trim() || !!org?.dorm_label?.trim() || !!org?.club_label?.trim();

  const exitOrgMode = async () => {
    try {
      await AsyncStorage.multiRemove(['auth:mode', 'auth:orgId', 'auth:returnTo:org', 'auth:returnTo']);
    } catch {}
    navigation.replace('ProfileSelf');
  };

  const logoutInstitution = async () => {
    try {
      await orgLogout?.();
      await AsyncStorage.multiRemove([
        'auth:mode',
        'auth:orgId',
        'auth:returnTo:org',
        'auth:returnTo',
        'orgToken',
        'auth:token',
        'org:role',
        'org:activeId',
      ]);
    } catch {}
    navigation.replace('InstitutionLogin', { logoutOrg: true });
  };

  const goPortal = useCallback(() => {
    navigation.navigate('OrgElearnPortal', { tab: 'branding', from: 'profile' });
  }, [navigation]);

  const goRoster = useCallback(() => {
    // Keep it simple — one clear entry point to the new roster page
    navigation.navigate(ROSTER_SCREEN, { from: 'profile', orgId: org?.id });
  }, [navigation, org?.id]);

  const goFees = useCallback(() => {
    const orgId = org?.id;

    if (!orgToken) {
      navigation.navigate('InstitutionLogin', {
        reauth: 'fees',
        orgId,
        returnTo: 'OrgFees',
      });
      return;
    }

    navigation.navigate('OrgFees');
  }, [navigation, org?.id, orgToken]);

  const bottomPad = Math.max(24, insets.bottom + 24);

  if (!orgToken) {
    return (
      <SafeAreaView style={[tw`flex-1`, { backgroundColor: palette.card }]} edges={['top', 'left', 'right', 'bottom']}>
        <View style={tw`px-4 pt-3 pb-1 flex-row justify-end`}>
          <ThemeToggle />
        </View>

        <View style={tw`flex-1 items-center justify-center p-6`}>
          <View style={palette.softSurface()}>
            <Text style={[tw`text-xl font-bold`, { color: palette.text }]}>Institution Profile</Text>
            <Text style={[tw`text-sm mt-2`, { color: palette.textMuted }]}>
              Please sign in as an institution to continue.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('InstitutionLogin')}
              style={tw`mt-4 h-10 px-4 rounded-xl bg-emerald-600 items-center justify-center`}
              accessibilityRole="button"
              accessibilityLabel="Open institution login"
            >
              <Text style={tw`text-white font-semibold`}>Institution Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: palette.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <Animated.ScrollView
        contentContainerStyle={[tw`pb-0`, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        entering={FadeIn.duration(220)}
      >
        {/* Top bar */}
        <View style={tw`px-4 pt-3 pb-1 flex-row justify-end`}>
          <ThemeToggle />
        </View>

        {/* Header */}
        <View style={tw`px-4`}>
          <Animated.View entering={FadeInDown.duration(380)}>
            <View style={palette.surface()}>
              <View style={tw`flex-row items-start`}>
                {/* Left: Logo + Name */}
                <View style={tw`flex-row items-center flex-1 min-w-0`}>
                  {loading ? (
                    <Skeleton style={tw`h-16 w-16 rounded-2xl`} />
                  ) : (
                    <Image
                      source={{ uri: logo }}
                      style={[tw`h-16 w-16 rounded-2xl`, { backgroundColor: palette.divider }]}
                      contentFit="cover"
                      transition={250}
                      accessibilityLabel="Organization logo"
                    />
                  )}

                  <View style={tw`ml-3 flex-1 min-w-0`}>
                    <View style={tw`flex-row items-center flex-wrap min-w-0`}>
                      {loading ? (
                        <Skeleton style={tw`h-6 w-40 rounded`} />
                      ) : (
                        <Text numberOfLines={1} style={[tw`text-[20px] font-extrabold`, { color: palette.text }]}>
                          {org?.name || 'Institution'}
                        </Text>
                      )}

                      {!loading && (
                        <View
                          style={[
                            tw`ml-2 px-2 py-0.5 rounded-full flex-row items-center`,
                            { backgroundColor: palette.chipBg(tierColors.bg) },
                          ]}
                        >
                          <View style={[tw`h-1.5 w-1.5 rounded-full mr-1`, { backgroundColor: palette.chipDot(tierColors.bg) }]} />
                          <Text style={[tw`text-[10px] font-semibold`, { color: palette.text }]}>
                            {(org?.tier || 'starter').toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text numberOfLines={1} style={[tw`text-xs mt-0.5`, { color: palette.textMuted }]}>
                      {loading ? ' ' : org?.slug ? `@${org.slug}` : '—'}
                    </Text>
                  </View>
                </View>

                {/* Right: actions */}
                <View style={tw`ml-3 items-end`}>
                  <TouchableOpacity
                    onPress={goPortal}
                    style={tw`h-9 px-3 rounded-2xl bg-indigo-600 items-center justify-center flex-row`}
                    accessibilityRole="button"
                    accessibilityLabel="Open organization portal"
                  >
                    <Ionicons name="grid-outline" size={16} color="#fff" />
                    <Text style={tw`text-white text-xs font-semibold ml-1`}>Portal</Text>
                  </TouchableOpacity>

                  {/* ✅ NEW: Roster link (separate page) */}
                  <TouchableOpacity
                    onPress={goRoster}
                    style={[tw`mt-2 h-9 px-3 rounded-2xl items-center justify-center flex-row`, { backgroundColor: palette.divider }]}
                    accessibilityRole="button"
                    accessibilityLabel="Open roster"
                  >
                    <Ionicons name="people-outline" size={16} color={palette.text} />
                    <Text style={[tw`text-xs font-semibold ml-1`, { color: palette.text }]}>Roster</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={exitOrgMode}
                    style={[tw`mt-2 h-8 px-3 rounded-2xl items-center justify-center flex-row`, { backgroundColor: palette.divider }]}
                    accessibilityRole="button"
                    accessibilityLabel="Exit organization mode"
                  >
                    <Ionicons name="swap-horizontal-outline" size={14} color={palette.text} />
                    <Text style={[tw`text-[11px] font-medium ml-1`, { color: palette.text }]}>Exit org</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Stats */}
              <View style={tw`mt-4 gap-3`}>
                <StatCard label="Seats used" value={loading ? ' ' : `${seatsUsed}/${seatsMax}`} palette={palette} />

                <View style={palette.smallSurface()}>
                  <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Usage</Text>
                  {loading ? (
                    <>
                      <Skeleton style={tw`h-6 w-24 mt-2 rounded`} />
                      <Skeleton style={tw`h-2 w-full mt-2 rounded`} />
                    </>
                  ) : (
                    <>
                      <Text style={[tw`text-2xl font-extrabold mt-1`, { color: palette.text }]}>{seatPct}%</Text>
                      <ProgressBar pct={seatPct} palette={palette} />
                    </>
                  )}
                </View>

                {/* ✅ NEW: Roster summary card + link */}
                <View style={palette.smallSurface()}>
                  <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Roster</Text>

                  {loading ? (
                    <>
                      <Skeleton style={tw`h-4 w-40 mt-2 rounded`} />
                      <Skeleton style={tw`h-4 w-32 mt-2 rounded`} />
                    </>
                  ) : (
                    <>
                      <Text style={[tw`mt-2 text-xs font-semibold`, { color: palette.text }]}>
                        Instructors: {instructorCount}
                      </Text>
                      <Text style={[tw`mt-1 text-xs font-semibold`, { color: palette.text }]}>
                        Learners: {learnerCount}
                      </Text>

                      <TouchableOpacity
                        onPress={goRoster}
                        style={[tw`mt-3 h-9 px-3 rounded-2xl items-center justify-center flex-row`, { backgroundColor: palette.divider }]}
                        accessibilityRole="button"
                        accessibilityLabel="Open roster management"
                      >
                        <Ionicons name="open-outline" size={16} color={palette.text} />
                        <Text style={[tw`ml-1 text-[11px] font-semibold`, { color: palette.text }]}>
                          Open roster management
                        </Text>
                      </TouchableOpacity>

                      <Text style={[tw`mt-2 text-[10px]`, { color: palette.textSubtle }]}>
                        Add learners/instructors, import CSV, invites, login sheet, photos — now live in Roster.
                      </Text>
                    </>
                  )}
                </View>

                <View style={palette.smallSurface()}>
                  <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Plan</Text>
                  <Text style={[tw`text-2xl font-extrabold mt-1`, { color: palette.text }]}>
                    {loading ? ' ' : (org?.tier || 'starter').toUpperCase()}
                  </Text>
                  {!loading && (
                    <TouchableOpacity
                      onPress={() => navigation.navigate('OrgElearnPortal', { tab: 'branding', from: 'profile' })}
                      style={[tw`mt-2 h-8 px-3 rounded-2xl items-center justify-center`, { backgroundColor: palette.divider }]}
                      accessibilityRole="button"
                      accessibilityLabel="Manage plan in branding"
                    >
                      <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>Manage plan</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={palette.smallSurface()}>
                  <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Certificates</Text>
                  {loading ? (
                    <Skeleton style={tw`h-4 w-40 mt-2 rounded`} />
                  ) : (
                    <>
                      <Text numberOfLines={2} style={[tw`mt-1 text-xs font-semibold`, { color: palette.text }]}>
                        {org?.certificate_title || 'Certificate of Completion'}
                      </Text>
                      <Text style={[tw`mt-1 text-[11px]`, { color: palette.textSubtle }]}>
                        Signature & pass marks live in Branding.
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Branding */}
        <View style={tw`px-4 mt-4`}>
          <Animated.View entering={FadeInDown.delay(120).duration(380)} style={palette.surface()}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Branding</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('OrgElearnPortal', { tab: 'branding', from: 'profile' })}
                style={tw`h-8 px-3 rounded-2xl bg-emerald-600 items-center justify-center flex-row`}
                accessibilityRole="button"
                accessibilityLabel="Edit branding in portal"
              >
                <Ionicons name="color-palette-outline" size={14} color="#fff" />
                <Text style={tw`text-white text-xs font-semibold ml-1`}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={tw`mt-3`}>
              {/* Logo */}
              <View
                style={[
                  tw`rounded-2xl p-3 mb-2`,
                  { backgroundColor: palette.divider, borderColor: palette.border, borderWidth: 1 },
                ]}
              >
                <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Logo</Text>
                {loading ? (
                  <Skeleton style={tw`h-20 w-20 mt-2 rounded-2xl`} />
                ) : (
                  <Image
                    source={{ uri: resolveAsset(org?.logo_url, backendUrl) }}
                    style={[tw`h-20 w-20 mt-2 rounded-2xl`, { backgroundColor: palette.bg }]}
                    contentFit="contain"
                    transition={220}
                  />
                )}
              </View>

              {/* Signature */}
              <View
                style={[
                  tw`rounded-2xl p-3 mb-2`,
                  { backgroundColor: palette.divider, borderColor: palette.border, borderWidth: 1 },
                ]}
              >
                <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Registrar Signature</Text>
                {loading ? (
                  <Skeleton style={tw`h-16 w-40 mt-2 rounded-2xl`} />
                ) : (
                  <Image
                    source={{ uri: resolveAsset(org?.signature_url, backendUrl) }}
                    style={[tw`h-16 mt-2 rounded-2xl`, { backgroundColor: palette.bg }]}
                    contentFit="contain"
                    transition={220}
                  />
                )}
              </View>

              {/* Email domain */}
              <View
                style={[
                  tw`rounded-2xl p-3 mb-2`,
                  { backgroundColor: palette.divider, borderColor: palette.border, borderWidth: 1 },
                ]}
              >
                <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Email domain</Text>
                {loading ? (
                  <Skeleton style={tw`h-5 w-40 mt-2 rounded-xl`} />
                ) : (
                  <Text style={[tw`mt-1 text-xs`, { color: palette.text }]}>
                    {org?.email_domain?.trim() || 'Not restricted'}
                  </Text>
                )}
              </View>

              {/* School contact */}
              <View
                style={[
                  tw`rounded-2xl p-3`,
                  { backgroundColor: palette.divider, borderColor: palette.border, borderWidth: 1 },
                ]}
              >
                <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>School contact</Text>
                {loading ? (
                  <Skeleton style={tw`h-10 w-full mt-2 rounded-xl`} />
                ) : (
                  <View style={tw`mt-2`}>
                    {!!org?.address_line1 && <Text style={[tw`text-xs`, { color: palette.text }]}>{org.address_line1}</Text>}
                    {!!org?.address_line2 && <Text style={[tw`text-xs`, { color: palette.text }]}>{org.address_line2}</Text>}
                    {!!org?.phone_number && (
                      <Text style={[tw`text-[11px] mt-1`, { color: palette.textSubtle }]}>Tel: {org.phone_number}</Text>
                    )}
                    {!!org?.contact_email && (
                      <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Email: {org.contact_email}</Text>
                    )}
                    {!!org?.website_url && (
                      <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Website: {org.website_url}</Text>
                    )}
                    {!org?.address_line1 && !org?.phone_number && !org?.contact_email && !org?.website_url && (
                      <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Not set yet.</Text>
                    )}
                  </View>
                )}
              </View>

              {/* Grouping labels */}
              {!loading && hasGroupingLabels && (
                <View style={tw`mt-3`}>
                  {!!org?.house_label?.trim() && (
                    <View
                      style={[
                        tw`rounded-2xl px-3 py-2 mb-2`,
                        { backgroundColor: palette.divider, borderColor: palette.border, borderWidth: 1 },
                      ]}
                    >
                      <Text style={[tw`text-[10px] uppercase tracking-wide`, { color: palette.textSubtle }]}>
                        House label
                      </Text>
                      <Text style={[tw`mt-1 text-xs`, { color: palette.text }]}>{org.house_label}</Text>
                    </View>
                  )}

                  {!!org?.dorm_label?.trim() && (
                    <View
                      style={[
                        tw`rounded-2xl px-3 py-2 mb-2`,
                        { backgroundColor: palette.divider, borderColor: palette.border, borderWidth: 1 },
                      ]}
                    >
                      <Text style={[tw`text-[10px] uppercase tracking-wide`, { color: palette.textSubtle }]}>
                        Dorm label
                      </Text>
                      <Text style={[tw`mt-1 text-xs`, { color: palette.text }]}>{org.dorm_label}</Text>
                    </View>
                  )}

                  {!!org?.club_label?.trim() && (
                    <View
                      style={[
                        tw`rounded-2xl px-3 py-2`,
                        { backgroundColor: palette.divider, borderColor: palette.border, borderWidth: 1 },
                      ]}
                    >
                      <Text style={[tw`text-[10px] uppercase tracking-wide`, { color: palette.textSubtle }]}>
                        Club label
                      </Text>
                      <Text style={[tw`mt-1 text-xs`, { color: palette.text }]}>{org.club_label}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </Animated.View>
        </View>

        {/* Quick actions */}
        <View style={tw`px-4 mt-4`}>
          <Animated.View entering={FadeInDown.delay(160).duration(380)} style={palette.softSurface()}>
            <View style={tw`flex-row items-center justify-between`}>
              <View>
                <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Quick actions</Text>
                <Text style={[tw`text-xs mt-1`, { color: palette.textSubtle }]}>
                  Your main tools — roster is now a separate page.
                </Text>
              </View>

              <View style={[tw`px-2 py-1 rounded-full flex-row items-center`, { backgroundColor: palette.divider }]}>
                <View style={[tw`h-1.5 w-1.5 rounded-full mr-1`, { backgroundColor: '#22c55e' }]} />
                <Text style={[tw`text-[10px] font-medium`, { color: palette.textMuted }]}>Live</Text>
              </View>
            </View>

            <View style={tw`mt-3 flex-row flex-wrap`}>
              <ActionPill palette={palette} label="Open portal" icon="grid-outline" onPress={goPortal} />
              <ActionPill palette={palette} label="Roster" icon="people-outline" onPress={goRoster} />
              <ActionPill
                palette={palette}
                label="Assignments"
                icon="create-outline"
                onPress={() => navigation.navigate('OrgElearnPortal', { tab: 'assign', from: 'profile' })}
              />
              <ActionPill
                palette={palette}
                label="Exam results"
                icon="school-outline"
                onPress={() => navigation.navigate('OrgElearnPortal', { tab: 'exam', from: 'profile' })}
              />
              <ActionPill palette={palette} label="Fees" icon="cash-outline" onPress={goFees} />
              <ActionPill
                palette={palette}
                label="Branding"
                icon="color-palette-outline"
                onPress={() => navigation.navigate('OrgElearnPortal', { tab: 'branding', from: 'profile' })}
              />
            </View>
          </Animated.View>
        </View>

        {/* Session + compact logout */}
        <View style={tw`px-4 mt-6 mb-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-row items-center`}>
              <View
                style={[
                  tw`h-8 w-8 rounded-2xl items-center justify-center mr-2`,
                  { backgroundColor: palette.divider },
                ]}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color={palette.text} />
              </View>

              <View>
                <Text
                  style={[
                    tw`text-[10px] font-semibold uppercase tracking-[1px]`,
                    { color: palette.textSubtle },
                  ]}
                >
                  Session
                </Text>
                <Text style={[tw`text-[11px] mt-0.5`, { color: palette.textMuted }]}>
                  Signed in as institution admin
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={logoutInstitution}
              activeOpacity={0.9}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[
                tw`h-8 px-3 rounded-full flex-row items-center justify-center`,
                {
                  backgroundColor: palette.isDark ? 'rgba(248,113,113,0.12)' : '#fef2f2',
                  borderColor: '#fb7185',
                  borderWidth: 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Logout of institution account"
            >
              <Ionicons name="log-out-outline" size={16} color="#fb7185" />
              <Text style={[tw`ml-1 text-[11px] font-semibold`, { color: '#fb7185' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

export default OrgProfileNative;

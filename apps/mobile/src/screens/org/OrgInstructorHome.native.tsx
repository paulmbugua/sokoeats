/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import tw from '../../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  getMyOrgOrBootstrap,
  getOrgUsage,
  createOrgAssignment,
  getOrgAssignments,
  updateOrgBranding,
} from '@mytutorapp/shared/api/orgApi';
import { uploadAsset } from '@mytutorapp/shared/api';

import ThemeToggle from '../ThemeToggle.native';
import { useThemePref } from '../../theme/ThemeContext';

/* ------------------------------------------------------------------ */
/* Theming                                                            */
/* ------------------------------------------------------------------ */

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
    text: isDark ? '#e5f0ff' : '#0d141c',
    textMuted: isDark ? 'rgba(148,163,184,0.95)' : '#49739c',
    textSubtle: isDark ? 'rgba(148,163,184,0.85)' : 'rgba(73,115,156,0.75)',
    chipBg: (c: string) => (isDark ? `${c}26` : '#e7edf4'),
    chipDot: (c: string) => c,
    surface(style?: any) {
      return [
        tw`rounded-3xl p-4`,
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
        tw`rounded-2xl p-3`,
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
        tw`rounded-3xl p-4`,
        {
          backgroundColor: this.softCard,
          borderColor: this.border,
          borderWidth: 1,
        },
        style,
      ];
    },
    input() {
      return [
        tw`px-3 py-2 rounded-xl text-xs`,
        {
          backgroundColor: this.bg,
          borderColor: this.border,
          borderWidth: 1,
          color: this.text,
        },
      ];
    },
  };
}

/* Press feedback for CTAs */
const usePressScale = () => {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
  }));
  const onIn = () => {
    s.value = withSpring(0.97, {
      damping: 20,
      stiffness: 260,
    });
  };
  const onOut = () => {
    s.value = withSpring(1, {
      damping: 16,
      stiffness: 200,
    });
  };
  return { style, onIn, onOut };
};

/* ------------------------------------------------------------------ */
/* Screen                                                             */
/* ------------------------------------------------------------------ */

const OrgInstructorHomeNative: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  const { backendUrl, orgToken, token: userToken, orgLogout, orgUser } = useShopContext() as any;

  const authToken = orgToken || userToken;

  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tier, setTier] = useState<string>('starter');
  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [seatsMax, setSeatsMax] = useState<number>(50);

  const [courseId, setCourseId] = useState<string>('');
  const [inviteUrl, setInviteUrl] = useState<string>('');

  // Signature state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localSigFile, setLocalSigFile] = useState<any | null>(null);
  const [savingSig, setSavingSig] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);
  const [sigSuccess, setSigSuccess] = useState<string | null>(null);
  const [classLabel, setClassLabel] = useState('');

  // Recent submissions state
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  // redirect if no orgToken
  useEffect(() => {
    if (!orgToken) {
      navigation.replace('InstitutionLogin', { next: 'OrgInstructorHome' });
    }
  }, [orgToken, navigation]);

  // load org + seats + instructor signature
  useEffect(() => {
    if (!orgToken) {
      setLoading(false);
      return;
    }
    let stop = false;

    (async () => {
      try {
        const org: any = await getMyOrgOrBootstrap(backendUrl, orgToken);
        if (stop) return;
        const name = org?.name || (org as any)?.org_name || 'Your Institution';
        setOrgName(name);
        setOrgId(org?.id ?? null);

        const t = (org?.tier || 'starter') as string;
        setTier(t);
        setSeatsMax(tierToSeatCap(t));

        try {
          const usage = await getOrgUsage(backendUrl, orgToken, org?.id);
          if (!stop) setSeatsUsed(Number(usage?.seats_used ?? 0));
        } catch {
          if (!stop) setSeatsUsed(Number(org?.seats_used ?? 0));
        }

        if (org?.instructor_signature_url) {
          setPreviewUrl(resolveAsset(org.instructor_signature_url, backendUrl));
        }
      } catch (e: any) {
        if (!stop) {
          Alert.alert('Error', e?.message || 'Failed to load organization.');
        }
      } finally {
        if (!stop) setLoading(false);
      }
    })();

    return () => {
      stop = true;
    };
  }, [backendUrl, orgToken]);

  // fetch recent assignments with submissions
  useEffect(() => {
    if (!backendUrl || !authToken || !orgId) return;

    let stop = false;
    setRecentLoading(true);
    setRecentError(null);

    (async () => {
      try {
        const resp: any = await getOrgAssignments(backendUrl, authToken, orgId, {
          view: 'instructor',
        } as any);

        const rows: any[] = (resp?.data ?? resp ?? []) as any[];

        const withSubs = rows.filter((row: any) => {
          const count = row.submission_count ?? row.submissions_count ?? row.answers_count ?? 0;
          return row.has_submission || row.hasSubmitted || count > 0;
        });

        withSubs.sort((a: any, b: any) => {
          const aDate = new Date(
            a.latest_submission_at ?? a.submitted_at ?? a.due_at ?? a.created_at ?? 0
          ).getTime();
          const bDate = new Date(
            b.latest_submission_at ?? b.submitted_at ?? b.due_at ?? b.created_at ?? 0
          ).getTime();
          return bDate - aDate;
        });

        if (!stop) setRecentAssignments(withSubs.slice(0, 5));
      } catch (err: any) {
        console.warn('[OrgInstructorHomeNative] recent submissions error', {
          message: err?.message,
          status: err?.response?.status,
          data: err?.response?.data,
        });
        if (!stop) setRecentError('Failed to load recent submissions.');
      } finally {
        if (!stop) setRecentLoading(false);
      }
    })();

    return () => {
      stop = true;
    };
  }, [backendUrl, authToken, orgId]);

  const title = useMemo(
    () => (orgName ? `${orgName} · Instructor` : 'Institution · Instructor'),
    [orgName]
  );

  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100));

  const roleLabel = useMemo(() => {
    if (orgUser?.role) return String(orgUser.role).toUpperCase();
    return 'INSTRUCTOR';
  }, [orgUser]);

  const tierLabel = useMemo(() => (tier ? String(tier).toUpperCase() : 'STARTER'), [tier]);

  const handleLogout = useCallback(async () => {
    try {
      if (orgLogout) await orgLogout();
    } catch {
      // ignore
    }
    navigation.replace('InstitutionLogin', { logoutOrg: true });
  }, [orgLogout, navigation]);

  const onCreateInvite = useCallback(async () => {
    if (!orgId || !orgToken) return;
    if (!courseId.trim()) {
      Alert.alert('Missing', 'Enter a courseId to create an assignment invite.');
      return;
    }
    try {
      const resp: any = await createOrgAssignment(backendUrl, orgToken, orgId, {
        courseId,
        title_override: null,
        pass_mark: null,
        timer_s: null,
        due_at: null,
      } as any);
      const base = backendUrl.replace(/\/$/, '');
      const code = resp?.invite_code || resp?.inviteCode || resp?.code;
      const link = `${base}/org/join/${code}`;
      setInviteUrl(link);
      try {
        await Share.share({
          message: `You're invited to a course: ${link}`,
        });
      } catch {
        // ignore
      }
    } catch (e: any) {
      Alert.alert(
        'Invite failed',
        e?.response?.data?.message || e?.message || 'Failed to create invite.'
      );
    }
  }, [backendUrl, orgId, orgToken, courseId]);

  const pickSignature = useCallback(async () => {
    setSigError(null);
    setSigSuccess(null);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'We need access to your photos to select a signature image.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;

    const uri = asset.uri;
    const name = (asset as any).fileName || 'signature.png';
    const type = (asset as any).mimeType || 'image/png';

    setLocalSigFile({ uri, name, type });
    setPreviewUrl(uri);
  }, []);

  const handleSaveSignature = useCallback(async () => {
    setSigError(null);
    setSigSuccess(null);

    if (!backendUrl || !authToken || !orgId) {
      setSigError('Missing organization context. Please refresh and try again.');
      return;
    }

    if (!localSigFile) {
      setSigError('Please choose a signature image first.');
      return;
    }

    setSavingSig(true);

    try {
      const res: any = await uploadAsset(backendUrl, authToken, localSigFile, 'image');

      const rawUrl =
        typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';

      if (!rawUrl) {
        console.warn('[OrgInstructorHomeNative] uploadAsset response with no url:', res);
        throw new Error('Upload completed but no URL was returned by the server.');
      }

      const finalUrl = resolveAsset(rawUrl, backendUrl);

      const payload = { instructor_signature_url: finalUrl };
      const updated: any = await updateOrgBranding(backendUrl, authToken, orgId, payload);

      const savedUrl = updated?.instructor_signature_url
        ? resolveAsset(updated.instructor_signature_url, backendUrl)
        : finalUrl;

      setPreviewUrl(savedUrl);
      setLocalSigFile(null);
      setSigSuccess(
        'Signature updated. New report cards will use this image in the “Class teacher / Instructor” section.'
      );
    } catch (err: any) {
      console.warn('[OrgInstructorHomeNative] save signature error', err);

      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.message;

      if (status === 403) {
        setSigError(
          'You do not have permission to change institution branding. Ask your institution owner/admin to upload this signature from the web portal.'
        );
      } else {
        setSigError(msg || 'Failed to upload or save signature.');
      }
    } finally {
      setSavingSig(false);
    }
  }, [backendUrl, authToken, orgId, localSigFile]);

  const handleSaveClassSignature = useCallback(async () => {
    setSigError(null);
    setSigSuccess(null);

    if (!previewUrl) {
      setSigError('Please upload or select a signature first.');
      return;
    }
    if (!classLabel.trim()) {
      setSigError('Please enter a class/grade label.');
      return;
    }
    if (!backendUrl || !orgId || !authToken) {
      setSigError('Missing organization context.');
      return;
    }

    try {
      const res = await fetch(
        `${backendUrl}/api/orgs/${orgId}/classes/${encodeURIComponent(
          classLabel.trim()
        )}/class-teacher-signature`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ signature_url: previewUrl }),
        }
      );
      if (!res.ok) {
        const j: any = await res.json().catch(() => ({}));
        throw new Error(j?.message || `Failed (${res.status})`);
      }
      setSigSuccess(
        `Signature applied to ${classLabel.trim()}. New report cards for this class will use it.`
      );
    } catch (e: any) {
      setSigError(e?.message || 'Failed to apply class teacher signature.');
    }
  }, [previewUrl, classLabel, backendUrl, orgId, authToken]);

  const handleOpenSubmissions = useCallback(
    (assignmentId: string | number) => {
      if (!orgId) return;
      navigation.navigate('OrgElearnPortal', {
        tab: 'assign',
        assignmentId: String(assignmentId),
        view: 'submissions',
      });
    },
    [navigation, orgId]
  );

  const bottomPad = Math.max(24, insets.bottom + 24);

  const logoutBtn = usePressScale();
  const btnCreateWithAi = usePressScale();
  const btnOpenPortal = usePressScale();

  /* ------------------------------------------------------------------ */
  /* Loading shell                                                      */
  /* ------------------------------------------------------------------ */

  if (!orgToken || loading) {
    return (
      <SafeAreaView
        style={[tw`flex-1`, { backgroundColor: palette.bg }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <View style={tw`px-4 pt-3 pb-1 flex-row justify-end`}>
          <ThemeToggle />
        </View>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <View style={palette.softSurface(tw`w-full max-w-xs`)}>
            <Text
              style={[tw`text-[10px] uppercase tracking-[1.6px]`, { color: palette.textSubtle }]}
            >
              {roleLabel} PORTAL
            </Text>
            <Text style={[tw`mt-2 text-lg font-semibold`, { color: palette.text }]}>
              Preparing your instructor dashboard…
            </Text>
            <Text style={[tw`mt-2 text-xs`, { color: palette.textMuted }]}>
              Please wait a moment while we load your institution and instructor account.
            </Text>

            <View style={tw`mt-4 flex-row items-center`}>
              <ActivityIndicator />
              <Text style={[tw`ml-2 text-[11px]`, { color: palette.textSubtle }]}>Loading…</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Main render                                                        */
  /* ------------------------------------------------------------------ */

  return (
    <SafeAreaView
      style={[tw`flex-1`, { backgroundColor: palette.bg }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <Animated.ScrollView
        entering={FadeIn.duration(220)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[tw`pb-0`, { paddingBottom: bottomPad }]}
      >
        {/* Top bar */}
        <View style={tw`px-4 pt-3 pb-1 flex-row justify-end`}>
          <ThemeToggle />
        </View>

        <View style={tw`px-4`}>
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(320)} style={palette.surface()}>
            <View style={tw`flex-row justify-between items-start`}>
              <View style={tw`flex-1 pr-2`}>
                <Text style={[tw`text-[10px] font-semibold tracking-[2px]`, { color: '#4ade80' }]}>
                  {roleLabel} PORTAL
                </Text>
                <Text style={[tw`mt-1 text-xl font-bold`, { color: palette.text }]}>
                  Welcome back, instructor
                </Text>
                <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                  You’re managing learning for <Text style={tw`font-semibold`}>{orgName}</Text>. Use
                  this space to create assignments, enter marks, and keep your classes organized.
                </Text>

                <View style={tw`flex-row mt-2`}>
                  <View
                    style={[
                      tw`mr-2 px-2 py-1 rounded-full border`,
                      {
                        backgroundColor: 'rgba(16,185,129,0.12)',
                        borderColor: 'rgba(52,211,153,0.6)',
                      },
                    ]}
                  >
                    <Text style={[tw`text-[10px] font-semibold`, { color: '#bbf7d0' }]}>
                      Plan: {tierLabel}
                    </Text>
                  </View>
                  <View
                    style={[
                      tw`px-2 py-1 rounded-full border`,
                      {
                        backgroundColor: 'rgba(56,189,248,0.12)',
                        borderColor: 'rgba(56,189,248,0.7)',
                      },
                    ]}
                  >
                    <Text style={[tw`text-[10px] font-semibold`, { color: '#bae6fd' }]}>
                      Role: {roleLabel}
                    </Text>
                  </View>
                </View>
              </View>

              <Animated.View style={logoutBtn.style}>
                <TouchableOpacity
                  onPress={handleLogout}
                  onPressIn={logoutBtn.onIn}
                  onPressOut={logoutBtn.onOut}
                  style={[
                    tw`px-3 py-2 rounded-2xl items-center justify-center`,
                    { backgroundColor: palette.divider },
                  ]}
                >
                  <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>
                    Sign out
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>

          {/* Quick actions */}
          <Animated.View
            entering={FadeInDown.delay(80).duration(320)}
            style={palette.surface(tw`mt-3`)}
          >
            <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>Quick actions</Text>
            <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
              Jump straight into the tools you use most often.
            </Text>

            <View style={tw`flex-row flex-wrap mt-3`}>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('OrgElearnPortal', {
                    tab: 'assign',
                    from: 'instructor',
                  })
                }
                style={[tw`mr-2 mb-2 px-3 py-2 rounded-full`, { backgroundColor: '#4f46e5' }]}
              >
                <Text style={tw`text-white text-[11px] font-semibold`}>Create assignment</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('OrgExamResultsPortal')}
                style={[tw`mr-2 mb-2 px-3 py-2 rounded-full`, { backgroundColor: '#0284c7' }]}
              >
                <Text style={tw`text-white text-[11px] font-semibold`}>Enter marks & reports</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('ClassVaultUpload')}
                style={[tw`mr-2 mb-2 px-3 py-2 rounded-full`, { backgroundColor: '#059669' }]}
              >
                <Text style={tw`text-white text-[11px] font-semibold`}>Upload recorded class</Text>
              </TouchableOpacity>
            </View>

            <Text style={[tw`mt-2 text-[11px]`, { color: palette.textSubtle }]}>
              Use the E-Learning portal for assignments and analytics. Use the Exams area to capture
              marks and generate report cards.
            </Text>
          </Animated.View>

          {/* Instructor signature */}
          <Animated.View
            entering={FadeInDown.delay(160).duration(320)}
            style={palette.surface(tw`mt-3`)}
          >
            <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>
              Instructor signature
            </Text>
            <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
              Upload a clear signature image to appear in the{' '}
              <Text style={tw`font-semibold`}>“Class teacher / Instructor”</Text> section of your
              report cards.
            </Text>

            <View style={tw`mt-3 flex-row items-center`}>
              <TouchableOpacity
                onPress={pickSignature}
                style={[tw`px-3 py-2 rounded-2xl`, { backgroundColor: palette.divider }]}
              >
                <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                  Choose image
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveSignature}
                disabled={savingSig || !localSigFile}
                style={[
                  tw`ml-2 px-3 py-2 rounded-2xl items-center justify-center`,
                  {
                    backgroundColor: '#059669',
                    opacity: savingSig || !localSigFile ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={tw`text-white text-xs font-semibold`}>
                  {savingSig ? 'Saving…' : 'Save signature'}
                </Text>
              </TouchableOpacity>
            </View>

            {previewUrl && (
              <View
                style={[
                  tw`mt-3 h-14 w-full rounded-xl items-center justify-center px-2`,
                  {
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: palette.border,
                    backgroundColor: palette.divider,
                  },
                ]}
              >
                <Image
                  source={{ uri: previewUrl }}
                  style={tw`h-10 w-full`}
                  contentFit="contain"
                  transition={200}
                />
              </View>
            )}

            <Text style={[tw`mt-2 text-[11px]`, { color: palette.textSubtle }]}>
              Tip: use a transparent PNG (around 600×200px). Future report cards and certificates
              will automatically use this signature.
            </Text>

            <View style={tw`mt-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Class / Grade this signature belongs to
              </Text>
              <TextInput
                value={classLabel}
                onChangeText={setClassLabel}
                placeholder="e.g. Grade 7 Blue"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
              <TouchableOpacity
                onPress={handleSaveClassSignature}
                disabled={!previewUrl || !classLabel || !orgId || !authToken}
                style={[
                  tw`mt-2 px-3 py-2 rounded-2xl items-center justify-center`,
                  {
                    backgroundColor: '#4f46e5',
                    opacity: !previewUrl || !classLabel || !orgId || !authToken ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={tw`text-white text-xs font-semibold`}>
                  Save as class teacher for this class
                </Text>
              </TouchableOpacity>
            </View>

            {!!sigError && (
              <Text style={[tw`mt-2 text-[11px]`, { color: '#fca5a5' }]}>{sigError}</Text>
            )}
            {!!sigSuccess && (
              <Text style={[tw`mt-2 text-[11px]`, { color: '#6ee7b7' }]}>{sigSuccess}</Text>
            )}
          </Animated.View>

          {/* Recent submissions */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(320)}
            style={palette.surface(tw`mt-3`)}
          >
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>
                Recent submissions
              </Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('OrgElearnPortal', {
                    tab: 'assign',
                    from: 'instructor',
                  })
                }
              >
                <Text style={[tw`text-[11px] underline`, { color: '#6ee7b7' }]}>Open portal →</Text>
              </TouchableOpacity>
            </View>

            {recentLoading && (
              <Text style={[tw`text-xs`, { color: palette.textMuted }]}>
                Loading recent submissions…
              </Text>
            )}

            {!recentLoading && !!recentError && (
              <Text style={[tw`text-xs`, { color: '#fca5a5' }]}>{recentError}</Text>
            )}

            {!recentLoading && !recentError && recentAssignments.length === 0 && (
              <Text style={[tw`text-xs`, { color: palette.textMuted }]}>
                No submissions yet. Once learners turn in work, their latest assignments will appear
                here.
              </Text>
            )}

            {!recentLoading && !recentError && recentAssignments.length > 0 && (
              <View style={tw`mt-1`}>
                {recentAssignments.map((a: any) => {
                  const count = a.submission_count ?? a.submissions_count ?? a.answers_count ?? 0;

                  const latest = a.latest_submission_at ?? a.submitted_at ?? null;

                  let latestLabel = '';
                  if (latest) {
                    try {
                      latestLabel = new Date(latest).toLocaleString();
                    } catch {
                      latestLabel = String(latest);
                    }
                  }

                  return (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() => handleOpenSubmissions(a.id)}
                      style={tw`flex-row justify-between items-start border-b border-slate-700/60 py-2`}
                    >
                      <View style={tw`flex-1 pr-2`}>
                        <Text
                          numberOfLines={1}
                          style={[tw`text-xs font-semibold`, { color: palette.text }]}
                        >
                          {a.title || a.course_title || 'Untitled assignment'}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[tw`mt-0.5 text-[11px]`, { color: palette.textSubtle }]}
                        >
                          {a.org_class_label || a.class_label || 'All classes'} •{' '}
                          {a.org_subject_key || a.subject_key || 'Subject'}
                        </Text>
                      </View>
                      <View style={tw`items-end`}>
                        <Text style={[tw`text-xs font-semibold`, { color: '#6ee7b7' }]}>
                          {count}{' '}
                          <Text
                            style={[tw`text-[11px] font-normal`, { color: palette.textSubtle }]}
                          >
                            subm.
                          </Text>
                        </Text>
                        {!!latestLabel && (
                          <Text style={[tw`mt-0.5 text-[10px]`, { color: palette.textSubtle }]}>
                            {latestLabel}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Animated.View>

          {/* Bottom shortcuts */}
          <Animated.View
            entering={FadeInDown.delay(240).duration(320)}
            style={tw`mt-3 mb-6 flex-row`}
          >
            <Animated.View style={[btnCreateWithAi.style, tw`flex-1 mr-2`]}>
              <TouchableOpacity
                onPress={() => navigation.navigate('RobotTutor', { flow: 'org' })}
                onPressIn={btnCreateWithAi.onIn}
                onPressOut={btnCreateWithAi.onOut}
                style={tw`h-11 px-4 rounded-2xl bg-indigo-600 items-center justify-center`}
              >
                <Text style={tw`text-white font-semibold text-sm`}>Create with AI 🤖</Text>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={[btnOpenPortal.style, tw`flex-1 ml-2`]}>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('OrgElearnPortal', {
                    from: 'instructor',
                  })
                }
                onPressIn={btnOpenPortal.onIn}
                onPressOut={btnOpenPortal.onOut}
                style={tw`h-11 px-4 rounded-2xl bg-sky-600 items-center justify-center`}
              >
                <Text style={tw`text-white font-semibold text-sm`}>Open Org Portal</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

export default OrgInstructorHomeNative;

/* Helpers */
function tierToSeatCap(tier?: string): number {
  switch ((tier || 'starter').toLowerCase()) {
    case 'enterprise':
      return 5000;
    case 'pro':
      return 500;
    default:
      return 50;
  }
}

function resolveAsset(url: string, backendUrl: string) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = backendUrl.replace(/\/$/, '');
  const path = url.replace(/^\//, '');
  return `${base}/${path}`;
}

/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { getMyOrgOrBootstrap, getOrgUsage, uploadAsset } from '@mytutorapp/shared/api';
import {
  getOrgRoster as apiRoster,
  createOrgMembershipInvite,
  removeOrgMember,
} from '@mytutorapp/shared/api/orgApi';
import { setOrgLearnerPhotoByAdmission } from '@mytutorapp/shared/api/orgLearnersApi';
import {
  createOrgInstructor as apiCreateOrgInstructor,
} from '@mytutorapp/shared/api/orgInstructorsApi';
import {
  createOrgLearner as apiCreateOrgLearner,
} from '@mytutorapp/shared/api/orgLearnersApi';

import ThemeToggle from '../ThemeToggle.native';
import { useThemePref } from '../../theme/ThemeContext';

// Shared native helpers + UI
import {
  MiniUser,
  resolveAsset,
  tierTone,
  Skeleton,
  PersonRow,
} from './OrgProfileShared.native';

// Native modals
import {
  InviteModal,
  AddInstructorModal,
  AddLearnerModal,
} from './OrgProfileModals.native';

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
    input() {
      return [
        tw`px-3 py-2 rounded-xl text-sm`,
        {
          backgroundColor: this.bg,
          borderColor: this.border,
          borderWidth: 1,
          color: this.text,
        },
      ];
    },
    button(kind: 'primary' | 'neutral' | 'danger' = 'primary') {
      if (kind === 'primary') {
        return tw`h-10 px-4 rounded-xl bg-emerald-600 items-center justify-center`;
      }
      if (kind === 'danger') {
        return tw`h-10 px-4 rounded-xl bg-rose-600 items-center justify-center`;
      }
      return [
        tw`h-10 px-4 rounded-xl items-center justify-center`,
        { backgroundColor: this.divider },
      ];
    },
  };
}

/* ---------------- helpers ---------------- */
async function tryFetchRoster(backendUrl: string, token: string, orgId: string) {
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
      if (r.ok) return await r.json();
    } catch {
      // ignore
    }
  }
  return { instructors: [] as MiniUser[], learners: [] as MiniUser[] };
}

/* ---------------- micro UI ---------------- */
const StatCard: React.FC<{
  label: string;
  value: string;
  palette: ReturnType<typeof usePalette>;
}> = ({ label, value, palette }) => (
  <View style={palette.smallSurface()}>
    <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>{label}</Text>
    <Text
      style={[
        tw`text-2xl font-extrabold mt-1`,
        { color: palette.text, letterSpacing: 0.2 },
      ]}
    >
      {value}
    </Text>
  </View>
);

const ProgressBar: React.FC<{
  pct: number;
  palette: ReturnType<typeof usePalette>;
}> = ({ pct, palette }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const bar =
    clamped >= 90 ? '#ef4444' : clamped >= 70 ? '#f59e0b' : '#10b981';
  return (
    <View
      style={[
        tw`h-2 rounded-full mt-2 overflow-hidden`,
        { backgroundColor: palette.divider },
      ]}
    >
      <View
        style={[
          tw`h-2 rounded-full`,
          { width: `${clamped}%`, backgroundColor: bar },
        ]}
      />
    </View>
  );
};

/* press feedback for CTAs */
const usePressScale = () => {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
  }));
  const onIn = () => {
    s.value = withSpring(0.97, { damping: 20, stiffness: 260 });
  };
  const onOut = () => {
    s.value = withSpring(1, { damping: 16, stiffness: 200 });
  };
  return { style, onIn, onOut };
};

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
  const [instructors, setInstructors] = useState<MiniUser[]>([]);
  const [learners, setLearners] = useState<MiniUser[]>([]);

  // invite sheet state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] =
    useState<'instructor' | 'learner'>('learner');

  // add-learner / add-instructor modals
  const [addInstructorOpen, setAddInstructorOpen] = useState(false);
  const [addLearnerOpen, setAddLearnerOpen] = useState(false);

  // learner photo mapping state
  const [photoAdmCode, setPhotoAdmCode] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
    const [bulkPhotoUploading, setBulkPhotoUploading] = useState(false);
  const [bulkPhotoProg, setBulkPhotoProg] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });


  
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

  const refreshRoster = useCallback(
    async (orgId: string) => {
      if (!orgToken || !orgId) return;
      try {
        const roster = await apiRoster(backendUrl, orgToken, orgId);
        setInstructors(
          Array.isArray(roster?.instructors) ? roster.instructors : [],
        );
        setLearners(
          Array.isArray(roster?.learners) ? roster.learners : [],
        );
      } catch {
        try {
          const roster = await tryFetchRoster(backendUrl, orgToken, orgId);
          setInstructors(
            Array.isArray(roster?.instructors) ? roster.instructors : [],
          );
          setLearners(
            Array.isArray(roster?.learners) ? roster.learners : [],
          );
        } catch {
          // ignore
        }
      }
    },
    [backendUrl, orgToken],
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
        const cap = seatCap(o?.tier);
        setSeatsMax(cap);

        try {
          const u = await getOrgUsage(backendUrl, orgToken, o.id);
          if (!stop) setSeatsUsed(Number(u?.seats_used ?? 0));
        } catch {
          if (!stop) setSeatsUsed(Number(o?.seats_used ?? 0));
        }

        if (!stop) {
          await refreshRoster(o.id);
        }
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load organization.');
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [backendUrl, orgToken, seatCap, refreshRoster]);

  const logo = useMemo(
    () => resolveAsset(org?.logo_url, backendUrl, org?.name),
    [org?.logo_url, backendUrl, org?.name],
  );

  const seatPct = Math.min(
    100,
    Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100),
  );

  // 🔧 tierTone fix: it returns { bg, text, ring }, not { color }
  const tierColors = tierTone(org?.tier);

  const hasGroupingLabels =
    !!org?.house_label?.trim() ||
    !!org?.dorm_label?.trim() ||
    !!org?.club_label?.trim();

  const exitOrgMode = async () => {
    try {
      await AsyncStorage.multiRemove([
        'auth:mode',
        'auth:orgId',
        'auth:returnTo:org',
        'auth:returnTo', // parity with web
      ]);
    } catch {
      // ignore
    }
    navigation.replace('ProfileSelf');
  };

  // Full org logout (context + storage) → go to InstitutionLogin
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
    } catch {
      // ignore
    }
    navigation.replace('InstitutionLogin', { logoutOrg: true });
  };

    const basenameFromFilename = (filename?: string | null) => {
  if (typeof filename !== 'string' || filename.trim().length === 0) return '';

  // remove query/hash
  const clean = filename.split('?')[0]?.split('#')[0] ?? '';
  if (!clean) return '';

  // take last path segment
  const last = (clean.split('/').pop() ?? clean).trim();
  if (!last) return '';

  // strip extension
  const noExt = last.replace(/\.[^/.]+$/, '').trim();
  return noExt;
};


  const inferAdmissionCodeFromAsset = (asset: any) => {
    // expo-image-picker asset usually has fileName on iOS; on Android often not.
    // fallback to the URI last segment.
    return (
      basenameFromFilename(asset?.fileName) ||
      basenameFromFilename(asset?.uri) ||
      ''
    );
  };

  const mimeFromAsset = (asset: any) => {
    const mt = asset?.mimeType;
    if (typeof mt === 'string' && mt.includes('/')) return mt;
    // best effort from extension
    const uri = String(asset?.uri || '');
    if (/\.(png)$/i.test(uri)) return 'image/png';
    if (/\.(webp)$/i.test(uri)) return 'image/webp';
    return 'image/jpeg';
  };
const handleBulkUploadLearnerPhotos = useCallback(async () => {
  const orgId = org?.id;
  if (!orgId || !orgToken) {
    Alert.alert('Learner photos', 'Organization is not loaded yet.');
    return;
  }
    // Multi-select where supported
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: true,
      // selectionLimit is not available in all expo versions; omit to avoid TS issues
    });

    if (result.canceled || !result.assets?.length) return;

    const assets = result.assets || [];
    setBulkPhotoUploading(true);
    setBulkPhotoProg({ done: 0, total: assets.length });

    const successes: string[] = [];
    const failures: string[] = [];

    try {
      for (let i = 0; i < assets.length; i++) {
        const a: any = assets[i];
        const code = inferAdmissionCodeFromAsset(a);

        setBulkPhotoProg({ done: i + 1, total: assets.length });


        if (!code) {
          failures.push(`${a?.fileName || a?.uri || `Image #${i + 1}`} (no admission code in filename)`);
          continue;
        }

        try {
          const file: any = {
            uri: a.uri,
            name: a.fileName || `${code}.jpg`,
            type: mimeFromAsset(a),
          };

          const res: any = await uploadAsset(backendUrl, orgToken, file, 'image');
          const photoUrl =
            typeof res === 'string'
              ? res
              : res?.url || res?.secure_url || res?.data?.url || '';

          if (!photoUrl) throw new Error('Upload completed but no URL was returned.');

          await setOrgLearnerPhotoByAdmission(backendUrl, orgToken, org.id, {
            admission_code: code,
            photo_url: photoUrl,
          });

          successes.push(code);
        } catch (err: any) {
          const msg =
            err?.response?.data?.message ||
            err?.message ||
            'Failed to map this photo.';
          failures.push(`${a?.fileName || a?.uri || `${code}`} (${msg})`);
        }
      }
    } finally {
      setBulkPhotoProg({ done: assets.length, total: assets.length });
      setBulkPhotoUploading(false);
    }

    let alertMsg = '';
    if (successes.length) {
      alertMsg += `Mapped ${successes.length} photo(s):\n${successes.join(', ')}`;
    }
    if (failures.length) {
      alertMsg += `${successes.length ? '\n\n' : ''}Failed for ${failures.length} file(s):\n${failures.join('\n')}`;
    }
    if (alertMsg) Alert.alert('Bulk photo upload', alertMsg);

    // refresh roster is optional here; mapping doesn't change roster list,
    // but if your UI shows photos later you may want it.
  }, [backendUrl, org?.id, orgToken]);


  // Create membership invite (normalize to {url})
  const handleCreateMembershipInvite = useCallback(
    async (role: 'instructor' | 'learner', email?: string) => {
      if (!org?.id) throw new Error('Organization is not loaded yet.');
      if (!orgToken)
        throw new Error('You are not authenticated for this organization.');
      const resp = (await createOrgMembershipInvite(
        backendUrl,
        orgToken,
        org.id,
        { role, email },
      )) as any;
      const url = resp?.invite_url;
      if (!url) throw new Error('Invite created but no URL was returned.');

      // best-effort roster refresh
      try {
        await refreshRoster(org.id);
      } catch {
        // ignore
      }
      return { url };
    },
    [backendUrl, org?.id, orgToken, refreshRoster],
  );

  // Remove member (optimistic updates)
  const handleRemoveMember = useCallback(
    async (u: MiniUser) => {
      if (!org?.id || !orgToken) return;
      try {
        await removeOrgMember(backendUrl, orgToken, org.id, u.id);

        // Optimistic UI updates
        setInstructors((prev) =>
          prev.filter((x) => String(x.id) !== String(u.id)),
        );
        const wasLearner = learners.some(
          (x) => String(x.id) === String(u.id),
        );
        setLearners((prev) =>
          prev.filter((x) => String(x.id) !== String(u.id)),
        );
        if (wasLearner)
          setSeatsUsed((s) => Math.max(0, (s || 0) - 1));
      } catch (e: any) {
        const msg =
          e?.response?.data?.message ||
          e?.message ||
          'Failed to remove member.';
        Alert.alert('Remove member', msg);
      }
    },
    [backendUrl, org?.id, orgToken, learners],
  );

  // create instructor (no CSV, native)
  const handleCreateInstructor = useCallback(
    async (payload: {
      name: string;
      email?: string;
      subject?: string;
      staff_code?: string;
    }) => {
      if (!org?.id || !orgToken) {
        throw new Error('Organization or token missing.');
      }
      const resp = await apiCreateOrgInstructor(
        backendUrl,
        orgToken,
        org.id,
        payload,
      );
      await refreshRoster(org.id);
      return { tempPassword: (resp as any)?.tempPassword ?? null };
    },
    [backendUrl, org?.id, orgToken, refreshRoster],
  );

  // create learner (native, no CSV)
  const handleCreateLearner = useCallback(
    async (payload: {
      name: string;
      email?: string;
      class_label?: string;
      guardian_email?: string;
      admission_code?: string;
      house?: string;
      dormitory?: string;
      club?: string;
    }) => {
      if (!org?.id || !orgToken) {
        throw new Error('Organization or token missing.');
      }
      const resp = await apiCreateOrgLearner(
        backendUrl,
        orgToken,
        org.id,
        payload,
      );
      await refreshRoster(org.id);
      return { tempPassword: (resp as any)?.tempPassword ?? null };
    },
    [backendUrl, org?.id, orgToken, refreshRoster],
  );

  // press feedback
  const portalBtn = usePressScale();
  const exitBtn = usePressScale();
  const logoutBtn = usePressScale();

  const bottomPad = Math.max(24, insets.bottom + 24);

  // Single learner photo upload (manual mapping)
  const handleUploadLearnerPhoto = useCallback(async () => {
    if (!org?.id || !orgToken) {
      Alert.alert('Learner photo', 'Organization is not loaded yet.');
      return;
    }
    const code = photoAdmCode.trim();
    if (!code) {
      Alert.alert('Learner photo', 'Enter the Admission No/Code first.');
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access to upload learner photos.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled || !result.assets || !result.assets.length) return;

    const picked = result.assets[0];
    if (!picked || !picked.uri) {
      Alert.alert('Learner photo', 'No image selected.');
      return;
    }

    try {
      setPhotoUploading(true);

      const file: any = {
        uri: picked.uri,
        name:
          (picked as any).fileName ||
          `learner-${code}.jpg`,
        type: picked.mimeType || 'image/jpeg',
      };

      const res: any = await uploadAsset(backendUrl, orgToken, file, 'image');
      const photoUrl =
        typeof res === 'string'
          ? res
          : res?.url || res?.secure_url || res?.data?.url || '';

      if (!photoUrl) {
        throw new Error('Upload completed but no URL was returned.');
      }

      await setOrgLearnerPhotoByAdmission(backendUrl, orgToken, org.id, {
        admission_code: code,
        photo_url: photoUrl,
      });

      Alert.alert('Learner photo', 'Photo mapped to learner. Future report cards will use it.');
    } catch (e: any) {
      Alert.alert(
        'Learner photo',
        e?.response?.data?.message ||
          e?.message ||
          'Failed to upload learner photo.',
      );
    } finally {
      setPhotoUploading(false);
    }
  }, [backendUrl, org?.id, orgToken, photoAdmCode]);

  /* ---------------- render ---------------- */

  if (!orgToken) {
    return (
      <SafeAreaView
        style={[tw`flex-1`, { backgroundColor: palette.card }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <View style={tw`px-4 pt-3 pb-1 flex-row justify-end`}>
          <ThemeToggle />
        </View>

        <View style={tw`flex-1 items-center justify-center p-6`}>
          <View style={palette.softSurface()}>
            <Text
              style={[tw`text-xl font-bold`, { color: palette.text }]}
            >
              Institution Profile
            </Text>
            <Text
              style={[tw`text-sm mt-2`, { color: palette.textMuted }]}
            >
              Please sign in as an institution to continue.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('InstitutionLogin')}
              style={tw`mt-4 h-10 px-4 rounded-xl bg-emerald-600 items-center justify-center`}
              accessibilityRole="button"
              accessibilityLabel="Open institution login"
            >
              <Text style={tw`text-white font-semibold`}>
                Institution Login
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[tw`flex-1`, { backgroundColor: palette.bg }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
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
                      style={[
                        tw`h-16 w-16 rounded-2xl`,
                        { backgroundColor: palette.divider },
                      ]}
                      contentFit="cover"
                      transition={250}
                      accessibilityLabel="Organization logo"
                    />
                  )}
                  <View style={tw`ml-3 flex-1 min-w-0`}>
                    <View
                      style={tw`flex-row items-center flex-wrap min-w-0`}
                    >
                      {loading ? (
                        <Skeleton style={tw`h-6 w-40 rounded`} />
                      ) : (
                        <Text
                          numberOfLines={1}
                          style={[
                            tw`text-[20px] font-extrabold`,
                            { color: palette.text },
                          ]}
                        >
                          {org?.name || 'Institution'}
                        </Text>
                      )}
                      {!loading && (
                        <View
                          style={[
                            tw`ml-2 px-2 py-0.5 rounded-full flex-row items-center`,
                            {
                              // 🔧 use tierColors.bg instead of tier.color
                              backgroundColor: palette.chipBg(
                                tierColors.bg,
                              ),
                            },
                          ]}
                        >
                          <View
                            style={[
                              tw`h-1.5 w-1.5 rounded-full mr-1`,
                              {
                                backgroundColor: palette.chipDot(
                                  tierColors.bg,
                                ),
                              },
                            ]}
                          />
                          <Text
                            style={[
                              tw`text-[10px] font-semibold`,
                              { color: palette.text },
                            ]}
                          >
                            {(org?.tier || 'starter').toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        tw`text-xs mt-0.5`,
                        { color: palette.textMuted },
                      ]}
                    >
                      {loading
                        ? ' '
                        : org?.slug
                        ? `@${org.slug}`
                        : '—'}
                    </Text>
                  </View>
                </View>

                {/* Right: actions */}
                <View style={tw`ml-3 items-end`}>
                  <Animated.View style={portalBtn.style}>
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('OrgElearnPortal', {
                          tab: 'branding',
                          from: 'profile',
                        })
                      }
                      onPressIn={portalBtn.onIn}
                      onPressOut={portalBtn.onOut}
                      style={tw`h-9 px-3 rounded-2xl bg-indigo-600 items-center justify-center flex-row`}
                      accessibilityRole="button"
                      accessibilityLabel="Open organization portal"
                    >
                      <Ionicons
                        name="play-circle-outline"
                        size={16}
                        color="#fff"
                      />
                      <Text
                        style={tw`text-white text-xs font-semibold ml-1`}
                      >
                        Portal
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>

                  <Animated.View style={[exitBtn.style, tw`mt-2`]}>
                    <TouchableOpacity
                      onPress={exitOrgMode}
                      onPressIn={exitBtn.onIn}
                      onPressOut={exitBtn.onOut}
                      style={[
                        tw`h-8 px-3 rounded-2xl items-center justify-center flex-row`,
                        { backgroundColor: palette.divider },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Exit organization mode"
                    >
                      <Ionicons
                        name="swap-horizontal-outline"
                        size={14}
                        color={palette.text}
                      />
                      <Text
                        style={[
                          tw`text-[11px] font-medium ml-1`,
                          { color: palette.text },
                        ]}
                      >
                        Exit org
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>

              {/* Stats */}
              <View style={tw`mt-4 gap-3`}>
                <StatCard
                  label="Seats used"
                  value={
                    loading ? ' ' : `${seatsUsed}/${seatsMax}`
                  }
                  palette={palette}
                />
                <View style={palette.smallSurface()}>
                  <Text
                    style={[tw`text-[10px]`, { color: palette.textMuted }]}
                  >
                    Usage
                  </Text>
                  {loading ? (
                    <>
                      <Skeleton style={tw`h-6 w-24 mt-2 rounded`} />
                      <Skeleton style={tw`h-2 w-full mt-2 rounded`} />
                    </>
                  ) : (
                    <>
                      <Text
                        style={[
                          tw`text-2xl font-extrabold mt-1`,
                          { color: palette.text },
                        ]}
                      >
                        {seatPct}%
                      </Text>
                      <ProgressBar pct={seatPct} palette={palette} />
                    </>
                  )}
                </View>

                <View style={palette.smallSurface()}>
                  <Text
                    style={[tw`text-[10px]`, { color: palette.textMuted }]}
                  >
                    Plan
                  </Text>
                  <Text
                    style={[
                      tw`text-2xl font-extrabold mt-1`,
                      { color: palette.text },
                    ]}
                  >
                    {loading ? ' ' : (org?.tier || 'starter').toUpperCase()}
                  </Text>
                  {!loading && (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('OrgElearnPortal', {
                          tab: 'branding',
                          from: 'profile',
                        })
                      }
                      style={[
                        tw`mt-2 h-8 px-3 rounded-2xl items-center justify-center`,
                        { backgroundColor: palette.divider },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Manage plan in branding"
                    >
                      <Text
                        style={[
                          tw`text-[11px] font-semibold`,
                          { color: palette.text },
                        ]}
                      >
                        Manage plan
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={palette.smallSurface()}>
                  <Text
                    style={[tw`text-[10px]`, { color: palette.textMuted }]}
                  >
                    Certificates
                  </Text>
                  {loading ? (
                    <Skeleton style={tw`h-4 w-40 mt-2 rounded`} />
                  ) : (
                    <>
                      <Text
                        numberOfLines={2}
                        style={[
                          tw`mt-1 text-xs font-semibold`,
                          { color: palette.text },
                        ]}
                      >
                        {org?.certificate_title || 'Certificate of Completion'}
                      </Text>
                      <Text
                        style={[
                          tw`mt-1 text-[11px]`,
                          { color: palette.textSubtle },
                        ]}
                      >
                        Signature & pass marks live in Branding.
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* People */}
        <View style={tw`px-4 mt-4`}>
          {/* Instructors */}
          <Animated.View
            entering={FadeInDown.delay(60).duration(380)}
            style={palette.surface(tw`mb-4`)}
          >
            <View style={tw`flex-row items-center justify-between`}>
              <Text
                style={[tw`text-lg font-bold`, { color: palette.text }]}
              >
                Instructors
              </Text>
              <View style={tw`flex-row items-center`}>
                <TouchableOpacity
                  onPress={() => setAddInstructorOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add instructor"
                >
                  <Text
                    style={[
                      tw`underline text-xs mr-3`,
                      { color: palette.textMuted },
                    ]}
                  >
                    Add instructor
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setInviteRole('instructor');
                    setInviteOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Invite instructor"
                >
                  <Text
                    style={[
                      tw`underline text-xs mr-3`,
                      { color: palette.textMuted },
                    ]}
                  >
                    Invite instructor
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('OrgElearnPortal', {
                      tab: 'assign',
                      from: 'profile',
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Assign courses in portal"
                >
                  <Text
                    style={[
                      tw`underline text-xs`,
                      { color: palette.textMuted },
                    ]}
                  >
                    Assign in portal
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {loading ? (
              <View style={tw`mt-3`}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    style={tw`h-10 w-full mb-2 rounded-2xl`}
                  />
                ))}
              </View>
            ) : instructors.length ? (
              <View style={tw`mt-3`}>
                {instructors.slice(0, 8).map((u) => (
                  <PersonRow
                    key={String(u.id)}
                    u={u}
                    // 🔧 palette prop removed – PersonRow doesn’t accept it
                    onRemove={() => handleRemoveMember(u)}
                  />
                ))}
                {instructors.length > 8 && (
                  <Text
                    style={[
                      tw`text-[10px] mt-2`,
                      { color: palette.textSubtle },
                    ]}
                  >
                    Showing 8 of {instructors.length}
                  </Text>
                )}
              </View>
            ) : (
              <View
                style={[
                  tw`mt-4 rounded-3xl p-6 items-center`,
                  {
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: palette.dashed,
                  },
                ]}
              >
                <Text style={tw`text-2xl`}>👩🏽‍🏫</Text>
                <Text
                  style={[tw`text-sm mt-2`, { color: palette.text }]}
                >
                  No instructors yet.
                </Text>
                <Text
                  style={[
                    tw`text-[11px] mt-1 text-center`,
                    { color: palette.textSubtle },
                  ]}
                >
                  Use invites or the web portal to add instructors and share login details.
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Learners */}
          <Animated.View
            entering={FadeInDown.delay(120).duration(380)}
            style={palette.surface()}
          >
            <View style={tw`flex-row items-center justify-between`}>
              <Text
                style={[tw`text-lg font-bold`, { color: palette.text }]}
              >
                Learners
              </Text>
              <View style={tw`flex-row items-center gap-3`}>
                <TouchableOpacity
                  onPress={() => setAddLearnerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add learner"
                >
                  <Text
                    style={[
                      tw`underline text-xs`,
                      { color: palette.textMuted },
                    ]}
                  >
                    Add learner
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setInviteRole('learner');
                    setInviteOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Invite learner"
                >
                  <Text
                    style={[
                      tw`underline text-xs`,
                      { color: palette.textMuted },
                    ]}
                  >
                    Invite learners
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {loading ? (
              <View style={tw`mt-3`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    style={tw`h-10 w-full mb-2 rounded-2xl`}
                  />
                ))}
              </View>
            ) : learners.length ? (
              <View style={tw`mt-3`}>
                {learners.slice(0, 12).map((u) => (
                  <PersonRow
                    key={String(u.id)}
                    u={u}
                    // 🔧 palette prop removed here as well
                    onRemove={() => handleRemoveMember(u)}
                  />
                ))}
                {learners.length > 12 && (
                  <Text
                    style={[
                      tw`text-[10px] mt-2`,
                      { color: palette.textSubtle },
                    ]}
                  >
                    Showing 12 of {learners.length}
                  </Text>
                )}
              </View>
            ) : (
              <View
                style={[
                  tw`mt-4 rounded-3xl p-6 items-center`,
                  {
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: palette.dashed,
                  },
                ]}
              >
                <Text style={tw`text-2xl`}>🎓</Text>
                <Text
                  style={[tw`text-sm mt-2`, { color: palette.text }]}
                >
                  No learners yet.
                </Text>
                <Text
                  style={[
                    tw`text-[11px] mt-1 text-center`,
                    { color: palette.textSubtle },
                  ]}
                >
                  Use invites, direct add, or CSV import from the web portal to enroll learners.
                </Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Learner photos (bulk + manual mapping) */}
        <View style={tw`px-4 mt-4`}>
          <Animated.View
            entering={FadeInDown.delay(160).duration(380)}
            style={palette.surface()}
          >
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>
                Learner photos
              </Text>
              <Text style={[tw`text-[10px]`, { color: palette.textSubtle }]}>
                Map profile photos to learners
              </Text>
            </View>

            {/* Bulk upload */}
            <View style={tw`mt-3`}>
              <TouchableOpacity
                onPress={handleBulkUploadLearnerPhotos}
                disabled={bulkPhotoUploading || photoUploading}
                style={[
                  tw`h-10 px-4 rounded-xl flex-row items-center justify-center`,
                  { backgroundColor: palette.divider },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Bulk upload photos by filename"
              >
                <Ionicons name="images-outline" size={16} color={palette.text} />
                <Text style={[tw`ml-2 text-[11px] font-semibold`, { color: palette.text }]}>
                  {bulkPhotoUploading
                    ? `Uploading… (${bulkPhotoProg.done}/${bulkPhotoProg.total})`
                    : 'Bulk upload photos by filename'}
                </Text>
              </TouchableOpacity>

              <Text style={[tw`mt-2 text-[10px]`, { color: palette.textSubtle }]}>
                Name each image as the learner Admission No/Code, e.g.{' '}
                <Text style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) }}>
                  ADM-2025-001.jpg
                </Text>
                . The app extracts the code (before the extension) and maps automatically.
              </Text>
              <Text style={[tw`mt-1 text-[10px]`, { color: palette.textSubtle }]}>
                Note: multi-select support depends on device/OS. If you can’t pick multiple, repeat the action.
              </Text>
            </View>

            {/* Single manual mapping */}
            <View
              style={[
                tw`mt-4 rounded-2xl p-3`,
                {
                  backgroundColor: palette.divider,
                  borderColor: palette.border,
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[tw`text-[10px] mb-1`, { color: palette.textMuted }]}>
                Admission No / Code
              </Text>

              <TextInput
                value={photoAdmCode}
                onChangeText={setPhotoAdmCode}
                placeholder="e.g. ADM-2025-001"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
                autoCapitalize="characters"
              />

              <TouchableOpacity
                onPress={handleUploadLearnerPhoto}
                disabled={photoUploading || bulkPhotoUploading}
                style={[
                  tw`mt-3 h-10 px-4 rounded-xl flex-row items-center justify-center`,
                  { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.06)' : '#ffffff' },
                ]}
              >
                <Ionicons name="cloud-upload-outline" size={16} color={palette.text} />
                <Text style={[tw`ml-2 text-[11px] font-semibold`, { color: palette.text }]}>
                  {photoUploading ? 'Uploading…' : 'Upload single photo'}
                </Text>
              </TouchableOpacity>

              <Text style={[tw`mt-2 text-[10px]`, { color: palette.textSubtle }]}>
                • Use clear passport-style photos. • If the admission code does not exist, the backend should return an error.
              </Text>
            </View>
          </Animated.View>
        </View>


        {/* Branding */}
        <View style={tw`px-4 mt-4`}>
          <Animated.View
            entering={FadeInDown.delay(200).duration(380)}
            style={palette.surface()}
          >
            <View style={tw`flex-row items-center justify-between`}>
              <Text
                style={[tw`text-lg font-bold`, { color: palette.text }]}
              >
                Branding
              </Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('OrgElearnPortal', {
                    tab: 'branding',
                    from: 'profile',
                  })
                }
                style={tw`h-8 px-3 rounded-2xl bg-emerald-600 items-center justify-center flex-row`}
                accessibilityRole="button"
                accessibilityLabel="Edit branding in portal"
              >
                <Ionicons
                  name="color-palette-outline"
                  size={14}
                  color="#fff"
                />
                <Text
                  style={tw`text-white text-xs font-semibold ml-1`}
                >
                  Edit
                </Text>
              </TouchableOpacity>
            </View>

            <View style={tw`mt-3`}>
              {/* Logo */}
              <View
                style={[
                  tw`rounded-2xl p-3 mb-2`,
                  {
                    backgroundColor: palette.divider,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[tw`text-[10px]`, { color: palette.textMuted }]}
                >
                  Logo
                </Text>
                {loading ? (
                  <Skeleton
                    style={tw`h-20 w-20 mt-2 rounded-2xl`}
                  />
                ) : (
                  <Image
                    source={{
                      uri: resolveAsset(org?.logo_url, backendUrl),
                    }}
                    style={[
                      tw`h-20 w-20 mt-2 rounded-2xl`,
                      { backgroundColor: palette.bg },
                    ]}
                    contentFit="contain"
                    transition={220}
                  />
                )}
              </View>

              {/* Signature */}
              <View
                style={[
                  tw`rounded-2xl p-3 mb-2`,
                  {
                    backgroundColor: palette.divider,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[tw`text-[10px]`, { color: palette.textMuted }]}
                >
                  Registrar Signature
                </Text>
                {loading ? (
                  <Skeleton
                    style={tw`h-16 w-40 mt-2 rounded-2xl`}
                  />
                ) : (
                  <Image
                    source={{
                      uri: resolveAsset(org?.signature_url, backendUrl),
                    }}
                    style={[
                      tw`h-16 mt-2 rounded-2xl`,
                      { backgroundColor: palette.bg },
                    ]}
                    contentFit="contain"
                    transition={220}
                  />
                )}
              </View>

              {/* Email domain */}
              <View
                style={[
                  tw`rounded-2xl p-3 mb-2`,
                  {
                    backgroundColor: palette.divider,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[tw`text-[10px]`, { color: palette.textMuted }]}
                >
                  Email domain
                </Text>
                {loading ? (
                  <Skeleton
                    style={tw`h-5 w-40 mt-2 rounded-xl`}
                  />
                ) : (
                  <Text
                    style={[
                      tw`mt-1 text-xs`,
                      { color: palette.text },
                    ]}
                  >
                    {org?.email_domain?.trim() || 'Not restricted'}
                  </Text>
                )}
              </View>

              {/* School contact */}
              <View
                style={[
                  tw`rounded-2xl p-3`,
                  {
                    backgroundColor: palette.divider,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[tw`text-[10px]`, { color: palette.textMuted }]}
                >
                  School contact
                </Text>
                {loading ? (
                  <Skeleton
                    style={tw`h-10 w-full mt-2 rounded-xl`}
                  />
                ) : (
                  <View style={tw`mt-2`}>
                    {!!org?.address_line1 && (
                      <Text
                        style={[
                          tw`text-xs`,
                          { color: palette.text },
                        ]}
                      >
                        {org.address_line1}
                      </Text>
                    )}
                    {!!org?.address_line2 && (
                      <Text
                        style={[
                          tw`text-xs`,
                          { color: palette.text },
                        ]}
                      >
                        {org.address_line2}
                      </Text>
                    )}
                    {!!org?.phone_number && (
                      <Text
                        style={[
                          tw`text-[11px] mt-1`,
                          { color: palette.textSubtle },
                        ]}
                      >
                        Tel: {org.phone_number}
                      </Text>
                    )}
                    {!!org?.contact_email && (
                      <Text
                        style={[
                          tw`text-[11px]`,
                          { color: palette.textSubtle },
                        ]}
                      >
                        Email: {org.contact_email}
                      </Text>
                    )}
                    {!!org?.website_url && (
                      <Text
                        style={[
                          tw`text-[11px]`,
                          { color: palette.textSubtle },
                        ]}
                      >
                        Website: {org.website_url}
                      </Text>
                    )}
                    {!org?.address_line1 &&
                      !org?.phone_number &&
                      !org?.contact_email &&
                      !org?.website_url && (
                        <Text
                          style={[
                            tw`text-[11px]`,
                            { color: palette.textSubtle },
                          ]}
                        >
                          Not set yet.
                        </Text>
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
                        {
                          backgroundColor: palette.divider,
                          borderColor: palette.border,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          tw`text-[10px] uppercase tracking-wide`,
                          { color: palette.textSubtle },
                        ]}
                      >
                        House label
                      </Text>
                      <Text
                        style={[
                          tw`mt-1 text-xs`,
                          { color: palette.text },
                        ]}
                      >
                        {org.house_label}
                      </Text>
                    </View>
                  )}
                  {!!org?.dorm_label?.trim() && (
                    <View
                      style={[
                        tw`rounded-2xl px-3 py-2 mb-2`,
                        {
                          backgroundColor: palette.divider,
                          borderColor: palette.border,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          tw`text-[10px] uppercase tracking-wide`,
                          { color: palette.textSubtle },
                        ]}
                      >
                        Dorm label
                      </Text>
                      <Text
                        style={[
                          tw`mt-1 text-xs`,
                          { color: palette.text },
                        ]}
                      >
                        {org.dorm_label}
                      </Text>
                    </View>
                  )}
                  {!!org?.club_label?.trim() && (
                    <View
                      style={[
                        tw`rounded-2xl px-3 py-2`,
                        {
                          backgroundColor: palette.divider,
                          borderColor: palette.border,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          tw`text-[10px] uppercase tracking-wide`,
                          { color: palette.textSubtle },
                        ]}
                      >
                        Club label
                      </Text>
                      <Text
                        style={[
                          tw`mt-1 text-xs`,
                          { color: palette.text },
                        ]}
                      >
                        {org.club_label}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </Animated.View>
        </View>

        {/* Quick actions - modern card */}
        <View style={tw`px-4 mt-4`}>
          <Animated.View
            entering={FadeInDown.delay(220).duration(380)}
            style={palette.softSurface()}
          >
            <View style={tw`flex-row items-center justify-between`}>
              <View>
                <Text
                  style={[
                    tw`text-lg font-bold`,
                    { color: palette.text },
                  ]}
                >
                  Quick actions
                </Text>
                <Text
                  style={[
                    tw`text-xs mt-1`,
                    { color: palette.textSubtle },
                  ]}
                >
                  Jump straight into your portal tools.
                </Text>
              </View>
              <View
                style={[
                  tw`px-2 py-1 rounded-full flex-row items-center`,
                  { backgroundColor: palette.divider },
                ]}
              >
                <View
                  style={[
                    tw`h-1.5 w-1.5 rounded-full mr-1`,
                    { backgroundColor: '#22c55e' },
                  ]}
                />
                <Text
                  style={[
                    tw`text-[10px] font-medium`,
                    { color: palette.textMuted },
                  ]}
                >
                  Live
                </Text>
              </View>
            </View>

            <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
              {/* Open portal – narrower width */}
              <Animated.View style={[portalBtn.style, tw`flex-[0.7]`]}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('OrgElearnPortal', {
                      tab: 'branding',
                      from: 'profile',
                    })
                  }
                  onPressIn={portalBtn.onIn}
                  onPressOut={portalBtn.onOut}
                  style={tw`flex-row items-center justify-center h-10 px-3 rounded-2xl bg-indigo-600`}
                  accessibilityRole="button"
                  accessibilityLabel="Open portal"
                >
                  <Ionicons
                    name="grid-outline"
                    size={16}
                    color="#fff"
                  />
                  <Text
                    style={tw`ml-2 text-[11px] font-semibold text-white text-center flex-shrink`}
                  >
                    Open portal
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Create assignment – wider */}
              <View style={tw`flex-[1.3]`}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('OrgElearnPortal', {
                      tab: 'assign',
                      from: 'profile',
                    })
                  }
                  style={tw`flex-row items-center justify-center h-11 px-4 rounded-2xl bg-transparent border border-indigo-500/50`}
                  accessibilityRole="button"
                  accessibilityLabel="Create assignment"
                >
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={palette.text}
                  />
                  <Text
                    style={[
                      tw`ml-2 text-[11px] font-semibold text-center flex-shrink`,
                      { color: palette.text },
                    ]}
                  >
                    Create assignment
                  </Text>
                </TouchableOpacity>
              </View>
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
                <Ionicons
                  name="shield-checkmark-outline"
                  size={16}
                  color={palette.text}
                />
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
                <Text
                  style={[
                    tw`text-[11px] mt-0.5`,
                    { color: palette.textMuted },
                  ]}
                >
                  Signed in as institution admin
                </Text>
              </View>
            </View>

            <Animated.View style={logoutBtn.style}>
              <TouchableOpacity
                onPress={logoutInstitution}
                onPressIn={logoutBtn.onIn}
                onPressOut={logoutBtn.onOut}
                activeOpacity={0.9}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[
                  tw`h-8 px-3 rounded-full flex-row items-center justify-center`,
                  {
                    backgroundColor: palette.isDark
                      ? 'rgba(248,113,113,0.12)'
                      : '#fef2f2',
                    borderColor: '#fb7185',
                    borderWidth: 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Logout of institution account"
              >
                <Ionicons
                  name="log-out-outline"
                  size={16}
                  color="#fb7185"
                />
                <Text
                  style={[
                    tw`ml-1 text-[11px] font-semibold`,
                    { color: '#fb7185' },
                  ]}
                >
                  Logout
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* Invite + Add modals */}
      <InviteModal
        open={inviteOpen}
        initialRole={inviteRole}
        onClose={() => setInviteOpen(false)}
        onCreate={handleCreateMembershipInvite}
      />

      <AddInstructorModal
        open={addInstructorOpen}
        onClose={() => setAddInstructorOpen(false)}
        onCreate={handleCreateInstructor}
      />

      <AddLearnerModal
        open={addLearnerOpen}
        onClose={() => setAddLearnerOpen(false)}
        onCreate={handleCreateLearner}
      />
    </SafeAreaView>
  );
};

export default OrgProfileNative;

/* eslint-disable no-console */
// apps/mobile/src/screens/Profile.native.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import { useNavigation, NavigationProp, StackActions } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses } from '@mytutorapp/shared/hooks';
import { useEnrollments } from '@mytutorapp/shared/hooks/useEnrollments';
import { useCourseProgress } from '@mytutorapp/shared/hooks/useCourseProgress';
import type {
  Course,
  Enrollment,
  CourseProgress,
  Transaction,
  EarningsSummary,
} from '@mytutorapp/shared/types';
import type { AxiosError } from 'axios';
import { fetchEarningsSummary } from '@mytutorapp/shared/api/accountApi';
import useAppQuery from '@mytutorapp/shared/hooks/useAppQuery';
import * as accountApi from '@mytutorapp/shared/api';
import { uploadAsset } from '@mytutorapp/shared/api/uploadAsset';

import PaymentWidget from './PaymentWidget.native';
import ThemeToggle from '../screens/ThemeToggle.native';
import DeleteAccount from '../screens/DeleteAccount.native';
import RefundCenter from '../screens/RefundCenter.native';

// ⬇️ Global refresh wrappers
import { RefreshableScrollView } from '../refresh/Refreshable';
import { useRegisterScreenRefresh } from '../refresh/GlobalRefreshProvider';

import type { MainStackParamList } from '../navigation/types';

/* ---------- utils ---------- */
const FALLBACK_AVATAR = (n = 'You') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=223649&color=ffffff`;

const resolveAsset = (raw?: string, backendUrl?: string, fallbackName?: string) => {
  if (!raw) return FALLBACK_AVATAR(fallbackName ?? 'You');
  if (raw.startsWith('/') && backendUrl) return `${backendUrl.replace(/\/+$/, '')}${raw}`;
  return raw;
};

const toNum = (v: unknown, fb = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Number(v) || fb : fb;

const isUuid = (s?: string | null): s is string =>
  !!s &&
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    s || ''
  );

const isValidCourseId = (id: unknown): id is string =>
  typeof id === 'string'
    ? isUuid(id) || /^\d+$/.test(id)
    : typeof id === 'number' && Number.isFinite(id);

const getCourseId = (row: unknown): string | null => {
  const o = (row ?? {}) as Record<string, unknown>;
  const v =
    typeof o.courseId === 'string' || typeof o.courseId === 'number'
      ? o.courseId
      : typeof o['course_id'] === 'string' || typeof o['course_id'] === 'number'
        ? o['course_id']
        : null;
  return v == null ? null : String(v);
};

const hasPayoutSetup = (prof?: any): boolean => {
  if (!prof) return false;
  const method = prof?.payout_method ?? prof?.payoutMethod;
  const currency = prof?.payout_currency ?? prof?.payoutCurrency;
  const wise = prof?.wise_email ?? prof?.wiseEmail;
  const mpesa = prof?.mpesa_phone_number ?? prof?.mpesaPhoneNumber;
  return Boolean(method || currency || wise || mpesa);
};

// 🔍 Shared helper: check if backend actually has a real profile
const fetchHasProfile = async (backendUrl?: string, token?: string): Promise<boolean> => {
  if (!backendUrl || !token) return false;

  const base = backendUrl.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${token}` };

  let res: Response;

  try {
    // Prefer /api/profile/me
    res = await fetch(`${base}/api/profile/me`, { headers });

    // If not 404 but also not OK, try legacy /api/profile
    if (!res.ok && res.status !== 404) {
      res = await fetch(`${base}/api/profile`, { headers });
    }
  } catch {
    return false;
  }

  if (!res.ok || res.status === 404) return false;

  try {
    const j = await res.json();
    const prof = (j as any)?.data ?? (j as any)?.profile ?? j;
    return looksLikeProfile(prof);
  } catch {
    return false;
  }
};

// ✅ Robust “looks like a profile” (parity with web)
const looksLikeProfile = (prof: any): boolean => {
  if (!prof || typeof prof !== 'object') return false;
  if (prof.id != null || prof.user_id != null || prof.profile_id != null) return true;
  if (typeof prof.name === 'string' && prof.name.trim()) return true;
  if (prof.avatar || prof.photoUrl || prof.avatar_url) return true;
  const meaningful = Object.keys(prof).filter((k) => {
    const v = (prof as any)[k];
    if (v == null) return false;
    if (typeof v === 'string') return !!v.trim();
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'boolean') return true;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return false;
  });
  return meaningful.length >= 3;
};

type ProfileLike = {
  id?: string | number;
  user_id?: string | number;
  name?: string;
  role?: string;
  avatar?: string;
  photoUrl?: string;
  avatar_url?: string;
  gallery?: string[];
};

type EarningsSummaryLocal = {
  total: number;
  pending: number;
  available: number;
  currency?: string;
};

/* ---------- image upload helpers (match ManageProfileForm) ---------- */

const guessExtFromUri = (uri: string): string => {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  if (match && match[1]) return match[1].toLowerCase();
  return 'jpg';
};

const guessMimeFromAsset = (asset: ImagePicker.ImagePickerAsset): string => {
  const raw = asset.mimeType ?? '';

  // If it looks like a real MIME (has slash), use it
  if (raw && raw.includes('/')) {
    return raw;
  }

  const ext = guessExtFromUri(asset.uri);
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'mp4':
      return 'video/mp4';
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
};

const uploadProfileImageNative = async (
  backendUrl: string,
  token: string,
  asset: ImagePicker.ImagePickerAsset
): Promise<string> => {
  const mimeType = guessMimeFromAsset(asset);
  const ext = mimeType.split('/')[1] || 'jpg';

  const fileLike: any = {
    uri: asset.uri,
    name: (asset as any).fileName || `profile-${Date.now()}.${ext}`,
    type: mimeType,
  };

  // Same signature as in ManageProfileForm.native.tsx
  const url = await uploadAsset(backendUrl, token, fileLike, 'image');
  return url;
};

/* ---------- student progress row (native) ---------- */
const StudentProgressRow: React.FC<{
  courseId: string | null;
  title: string;
  backendUrl: string;
  token: string;
  fallbackPct?: number;
  onOpenProgress: (courseId?: string) => void;
}> = ({ courseId, title, backendUrl, token, fallbackPct = 0, onOpenProgress }) => {
  const validId = isValidCourseId(courseId ?? '');
  const cid = validId ? String(courseId) : '';

  const { progress, loading } = useCourseProgress(backendUrl, cid, token);
  const { fetchCourseById } = useCourses({ backendUrl, token });
  const [totalWeeks, setTotalWeeks] = useState<number>(0);

  useEffect(() => {
    if (!validId) {
      setTotalWeeks(0);
      return;
    }
    let ignore = false;
    fetchCourseById(cid)
      .then((c: Course) => {
        if (!ignore) setTotalWeeks(Array.isArray(c?.syllabus) ? c.syllabus.length : 0);
      })
      .catch(() => setTotalWeeks(0));
    return () => {
      ignore = true;
    };
  }, [fetchCourseById, cid, validId]);

  const pct = useMemo(() => {
    if (!validId) return Math.max(0, Math.min(100, Math.round(fallbackPct)));
    if (loading) return 0;
    const items: CourseProgress[] = Array.isArray(progress) ? progress : [];
    const completed = items.filter((p) => p.status === 'Completed').length;
    if (totalWeeks > 0) return Math.round((completed / totalWeeks) * 100);
    return Math.max(0, Math.min(100, Math.round(fallbackPct)));
  }, [progress, loading, totalWeeks, fallbackPct, validId]);

  return (
    <View
      style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] px-4 py-3`}
    >
      <View style={tw`flex-row items-center justify-between`}>
        <Text numberOfLines={1} style={tw`text-base font-medium text-[#0d141c] dark:text-white`}>
          {title}
        </Text>
        <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>{pct}%</Text>
      </View>
      <View
        style={tw`mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#cedbe8] dark:bg-white/10`}
      >
        <View style={[tw`h-full bg-[#3d99f5]`, { width: `${pct}%` }]} />
      </View>
      <View style={tw`mt-2`}>
        <Pressable
          disabled={!validId}
          onPress={() => onOpenProgress(validId ? cid : undefined)}
          style={tw`${
            validId ? 'bg-[#e7edf4] dark:bg-[#172534]' : 'bg-gray-200 dark:bg-gray-700 opacity-60'
          } rounded-lg h-8 px-3 items-center justify-center`}
        >
          <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
            {validId ? 'Open progress' : 'Unavailable'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

/* ---------------------------------- Screen ---------------------------------- */
const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const FOOTER_OVERLAY_PX = 84;
  const NAV_SPACER_PX = 12;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  const {
    profile,
    backendUrl,
    userEmail,
    role: ctxRole,
    logout,
    language,
    tokens = 0,
    token,
    loadingProfile,
    refetchDetails,
    reftechDetails,
    refreshProfile,
    refreshWallet,
    setTokens: setCtxTokens,
  } = useShopContext() as any;

  // routing helpers
  const goHome = () => navigation.navigate('Home');
  const goLogin = () => navigation.dispatch(StackActions.replace('Login'));
  const goSettingsManage = () => navigation.navigate('SettingsManage');
  const goSettingsCreate = () => navigation.navigate('SettingsCreate');
  const goMessages = () => navigation.navigate('Messages' as any);
  const goCourses = () => navigation.navigate('Courses');
  const goEnrollments = () => navigation.navigate('MyEnrollments');
  const goClassVault = () => navigation.navigate('ClassVaultLibrary');
  const goCreateCourse = () => navigation.navigate('CreateCourse');
  const goAchievements = () => navigation.navigate('Achievements');
  const goAccountEarnings = () => navigation.navigate('Account', { tab: 'earnings' });
  const goAccountSessions = () => navigation.navigate('Account', { tab: 'sessions' });
  const goCourseProgress = (courseId: string) =>
    navigation.navigate('CourseProgress', { courseId });
  const goResults = () => navigation.navigate('Results' as any);
  const goAccount = () => navigation.navigate('Account', {});

  // /api/user/me fallback (email/role)
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const needEmail = !userEmail;
    const needRole = !ctxRole && !(profile as ProfileLike | undefined)?.role;

    if (token && (needEmail || needRole)) {
      (async () => {
        try {
          const r = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = (await r.json()) as {
            success?: boolean;
            email?: string;
            role?: string;
          };
          if (!cancelled && j?.success) {
            if (j.email) setMeEmail(j.email);
            if (j.role) setMeRole(j.role);
          }
        } catch {
          // ignore
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [backendUrl, token, userEmail, ctxRole, profile]);

  const hasCtxProfile = looksLikeProfile(profile);
  const [serverHasProfile, setServerHasProfile] = useState<boolean | null>(null);

  // 🔁 One-time server check (parity with web)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!token || !backendUrl) return;
      const exists = await fetchHasProfile(backendUrl, token);
      if (!cancelled) {
        setServerHasProfile(exists);
      }
    };

    if (!hasCtxProfile) run();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, token, hasCtxProfile]);

  // Try refresh if we *think* none exists (handles stale context)
  useEffect(() => {
    if (!hasCtxProfile && typeof refreshProfile === 'function' && token && backendUrl) {
      refreshProfile().catch(() => {});
    }
  }, [hasCtxProfile, refreshProfile, token, backendUrl]);

  // Unified “has profile” flag like web
  const hasAnyProfile = hasCtxProfile || serverHasProfile === true;

  const p = (profile ?? {}) as ProfileLike;

  // 🔹 Payout currency for tutor (USD/KES) – parity with web
  const payoutCurrency: 'USD' | 'KES' = useMemo(() => {
    const raw =
      (p as any)?.payoutCurrency ?? (p as any)?.payout_currency ?? (p as any)?.currency ?? 'USD';

    const upper = String(raw).toUpperCase();
    return upper === 'KES' ? 'KES' : 'USD';
  }, [p]);

  // Resolved identity
  const resolvedEmail = userEmail || meEmail || '';
  const resolvedRoleRaw = String(p.role || ctxRole || meRole || '').trim();
  const resolvedRole = resolvedRoleRaw || 'Member';

  const roleLower = resolvedRoleRaw.toLowerCase();
  const isStudent = roleLower === 'student' || roleLower === 'learner' || roleLower === 'pupil';
  const isTutor = roleLower === 'tutor';
  const isAdmin = roleLower === 'admin' || roleLower === 'superadmin';

  // Admin: send to Org section (mobile route name may differ in your stack)
  useEffect(() => {
    if (isAdmin) {
      try {
        navigation.navigate('OrgProfile' as any);
      } catch {
        // fallback if OrgProfile isn't registered:
        // navigation.navigate('InstitutionLogin' as any);
      }
    }
  }, [isAdmin, navigation]);

  const canSeeEarnings = useMemo(() => isTutor && hasPayoutSetup(p), [isTutor, p]);

  // local override for avatar while user just uploaded
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const avatarUrl = useMemo(
    () =>
      localAvatarUrl ||
      resolveAsset(
        p.avatar ?? p.photoUrl ?? p.avatar_url ?? p.gallery?.[0],
        backendUrl,
        p.name || 'You'
      ),
    [localAvatarUrl, p.avatar, p.photoUrl, p.avatar_url, p.gallery, backendUrl, p.name]
  );

  const [name, setName] = useState<string>(p.name || '');
  const [email, setEmail] = useState<string>(resolvedEmail);
  const [phone, setPhone] = useState<string>('');
  const [tz, setTz] = useState<string>('');
  const [notif, setNotif] = useState<boolean>(true);
  const [openPayment, setOpenPayment] = useState(false);
  const [refreshingTokens, setRefreshingTokens] = useState(false);

  useEffect(() => setName(p.name || ''), [p.name]);
  useEffect(() => setEmail(resolvedEmail), [resolvedEmail]);

  const onEditOrCreateProfile = useCallback(async () => {
    if (loadingProfile) return;

    // If we already know there is a profile (context or previous server check),
    // just go straight to Manage
    if (hasAnyProfile) {
      goSettingsManage();
      return;
    }

    // Final lightweight server check using the same logic as serverHasProfile
    try {
      const exists = await fetchHasProfile(backendUrl, token);
      if (exists) {
        setServerHasProfile(true);
        goSettingsManage();
      } else {
        setServerHasProfile(false);
        goSettingsCreate();
      }
    } catch {
      // On error, default to Create so the user isn't blocked
      goSettingsCreate();
    }
  }, [loadingProfile, hasAnyProfile, backendUrl, token, goSettingsManage, goSettingsCreate]);

  // 🔁 Change avatar using the same upload logic as ManageProfile
  const handleChangeAvatar = useCallback(async () => {
    if (!backendUrl || !token) {
      Alert.alert('Unavailable', 'Missing backend configuration. Please try again later.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'We need access to your photos to update your profile image.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    try {
      setAvatarUploading(true);
      const remoteUrl = await uploadProfileImageNative(backendUrl, token, result.assets[0]);
      // Update local preview immediately
      setLocalAvatarUrl(remoteUrl);
      // Ask backend for fresh profile with new gallery/avatar
      if (typeof refreshProfile === 'function') {
        await refreshProfile();
      }
    } catch (err: any) {
      console.error('[ProfileScreen] avatar upload failed', err);
      Alert.alert('Upload failed', err?.message || 'Could not upload image. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  }, [backendUrl, token, refreshProfile]);

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      goLogin();
    }
  };

  // ─────────────────────────────────────
  // Transactions → lifetime earnings math (parity with web)
  // ─────────────────────────────────────
  const { data: transactions = [] } = useAppQuery<Transaction[], Error>(
    ['profileTransactions', token],
    () => accountApi.fetchTransactions(backendUrl, token!),
    { enabled: Boolean(token), refetchOnWindowFocus: false }
  );

  const { lifetimeByCurrency, pendingWithdrawalsByCurrency } = useMemo(() => {
    const sums: Record<string, number> = {};
    const pending: Record<string, number> = {};

    for (const tx of transactions) {
      const curr = String(tx.currency ?? 'USD').toUpperCase();
      const amt = Math.max(0, Number(tx.amount) || 0);

      if (tx.type?.toLowerCase().includes('earning')) {
        sums[curr] = (sums[curr] || 0) + amt;
      }

      if (tx.type === 'Withdrawal Request' && (tx.status || 'Pending') === 'Pending') {
        pending[curr] = (pending[curr] || 0) + amt;
      }
    }

    return {
      lifetimeByCurrency: sums,
      pendingWithdrawalsByCurrency: pending,
    };
  }, [transactions]);

  const approxLifetime = lifetimeByCurrency[payoutCurrency] ?? 0;
  const approxPending = pendingWithdrawalsByCurrency[payoutCurrency] ?? 0;
  const approxAvailable = Math.max(0, approxLifetime - approxPending);

  // tutor earnings
  const [earn, setEarn] = useState<EarningsSummaryLocal>({
    total: 0,
    pending: 0,
    available: 0,
    currency: payoutCurrency,
  });
  const [earnLoading, setEarnLoading] = useState(false);
  const [earnErr, setEarnErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;

    const run = async () => {
      if (!canSeeEarnings || !backendUrl || !token) {
        if (!stop) {
          setEarn({
            total: 0,
            pending: 0,
            available: 0,
            currency: payoutCurrency,
          });
          setEarnErr(null);
          setEarnLoading(false);
        }
        return;
      }

      if (!stop) setEarnLoading(true);
      try {
        const summary: EarningsSummary = await fetchEarningsSummary(backendUrl, token);
        if (stop) return;

        const total =
          summary && summary.total && summary.total > 0 ? summary.total : approxLifetime;
        const pending =
          summary && summary.pending && summary.pending > 0 ? summary.pending : approxPending;
        const available =
          summary && summary.available && summary.available > 0
            ? summary.available
            : approxAvailable;

        setEarn({
          total,
          pending,
          available,
          // 🔹 Always display using tutor payout currency
          currency: payoutCurrency,
        });
        setEarnErr(null);
      } catch (err) {
        if (stop) return;
        const ax = err as AxiosError<{ message?: string }>;
        const status = ax.response?.status;
        if (status === 401) setEarnErr('Please log in again to view earnings.');
        else if (status === 403) setEarnErr('Earnings are restricted for your account.');
        else setEarnErr(ax.response?.data?.message || 'Failed to load earnings.');
      } finally {
        if (!stop) setEarnLoading(false);
      }
    };

    run();
    return () => {
      stop = true;
    };
  }, [
    canSeeEarnings,
    backendUrl,
    token,
    approxLifetime,
    approxPending,
    approxAvailable,
    payoutCurrency,
  ]);

  const fmtMoney = useCallback(
    (n: number, c?: string) =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: c || 'USD',
        maximumFractionDigits: 2,
      }).format(n),
    []
  );

  // enrollments (student)
  const meId = (p.user_id ?? p.id) as string | number | undefined;
  const {
    enrollments,
    loading: enrLoading,
    error: enrError,
    fetchMine,
  } = useEnrollments({
    backendUrl,
    token: token ?? '',
    studentId: (meId ?? 'me') as string | number,
  });

  useEffect(() => {
    if (isStudent) fetchMine().catch(() => {});
  }, [isStudent, fetchMine]);

  // refresh wallet after payment closes (and for global pull-to-refresh)
  const refreshAccountState = useCallback(async () => {
    setRefreshingTokens(true);
    try {
      if (typeof refetchDetails === 'function') {
        await refetchDetails();
      } else if (typeof reftechDetails === 'function') {
        await reftechDetails();
      }

      if (typeof refreshWallet === 'function') await refreshWallet();
      if (typeof refreshProfile === 'function') await refreshProfile();

      if (typeof setCtxTokens === 'function' && token && backendUrl) {
        try {
          const r = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/account/balance`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (r.ok) {
            const j = await r.json();
            const bal = Number(
              j?.balance ?? j?.tokens ?? j?.data?.balance ?? j?.data?.tokens ?? NaN
            );
            if (Number.isFinite(bal)) setCtxTokens(bal);
          }
        } catch {
          // ignore
        }
      }

      // Also refresh enrollments for students
      if (isStudent) {
        try {
          await fetchMine();
        } catch {
          // ignore
        }
      }
    } finally {
      setRefreshingTokens(false);
    }
  }, [
    refetchDetails,
    reftechDetails,
    refreshWallet,
    refreshProfile,
    setCtxTokens,
    token,
    backendUrl,
    isStudent,
    fetchMine,
  ]);

  // Register with GlobalRefreshProvider so pull-to-refresh on this screen
  // also refreshes profile, tokens, enrollments, etc.
  useRegisterScreenRefresh(refreshAccountState);

  const handlePaymentClose = useCallback(async () => {
    setOpenPayment(false);
    await refreshAccountState();
  }, [refreshAccountState]);

  const ctaLabel = loadingProfile ? 'Loading…' : hasAnyProfile ? 'Edit profile' : 'Create profile';
  const shouldEmphasizeCta = isTutor && !hasAnyProfile && !loadingProfile;

  // keep a ref to ScrollView if you want to scroll programmatically later
  const scrollRef = useRef<ScrollView | null>(null);

  // ------------------------------- UI -------------------------------
  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <RefreshableScrollView
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`px-4`,
          {
            paddingTop: insets.top + NAV_SPACER_PX,
            paddingBottom: bottomPad,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
      >
        {/* Header row */}
        <View style={tw`flex-row items-center justify-between mb-4`}>
          <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white`}>
            My profile
          </Text>
          <Pressable
            onPress={onEditOrCreateProfile}
            disabled={loadingProfile}
            style={tw`md:hidden rounded-xl h-10 px-4 items-center justify-center ${
              shouldEmphasizeCta ? 'bg-[#3d99f5] animate-pulse' : 'bg-[#e7edf4] dark:bg-[#172534]'
            } ${loadingProfile ? 'opacity-60' : ''}`}
          >
            <Text
              style={tw`font-bold ${
                shouldEmphasizeCta ? 'text-white' : 'text-[#0d141c] dark:text-white'
              }`}
            >
              {ctaLabel}
            </Text>
          </Pressable>
        </View>

        {/* Navigation shortcuts (card) */}
        <View
          style={tw`mt-4 mb-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
        >
          <Text style={tw`mb-3 text-sm font-semibold text-[#49739c] dark:text-white/70`}>
            Shortcuts
          </Text>

          <View style={tw`flex-row flex-wrap gap-2`}>
            <Pressable
              onPress={goHome}
              style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
            >
              <Text style={tw`text-sm font-medium text-[#0d141c] dark:text-white`}>Home</Text>
            </Pressable>
            <Pressable
              onPress={goAccount}
              style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
            >
              <Text style={tw`text-sm font-medium text-[#0d141c] dark:text-white`}>Account</Text>
            </Pressable>

            <Pressable
              onPress={goAccountSessions}
              style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
            >
              <Text style={tw`text-sm font-medium text-[#0d141c] dark:text-white`}>My lessons</Text>
            </Pressable>

            <Pressable
              onPress={goMessages}
              style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
            >
              <Text style={tw`text-sm font-medium text-[#0d141c] dark:text-white`}>Messages</Text>
            </Pressable>

            <Pressable
              onPress={goResults}
              style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
            >
              <Text style={tw`text-sm font-medium text-[#0d141c] dark:text-white`}>
                Certificate print
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tutor missing-profile alert */}
        {isTutor && !hasAnyProfile && !loadingProfile && (
          <View
            style={tw`mb-3 rounded-2xl border border-amber-300 bg-amber-50 dark:border-amber-600/40 dark:bg-[#241a06] p-4`}
          >
            <Text style={tw`font-semibold text-amber-900 dark:text-amber-200`}>
              No tutor profile found
            </Text>
            <Text style={tw`text-sm mt-0.5 text-amber-900/90 dark:text-amber-200/90`}>
              You’re signed in as a tutor. Create your profile so students can discover and book
              you.
            </Text>
            <View style={tw`mt-2`}>
              <Pressable
                onPress={onEditOrCreateProfile}
                disabled={loadingProfile}
                style={tw`hidden md:flex rounded-xl h-10 px-4 items-center justify-center ${
                  shouldEmphasizeCta ? 'bg-[#3d99f5]' : 'bg-[#e7edf4] dark:bg-[#172534]'
                } ${loadingProfile ? 'opacity-60' : ''}`}
              >
                <Text
                  style={tw`font-bold ${
                    shouldEmphasizeCta ? 'text-white' : 'text-[#0d141c] dark:text-white'
                  }`}
                >
                  {ctaLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Identity card */}
        <View
          style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
        >
          <View style={tw`flex-row items-start justify-between`}>
            {/* Left: Avatar + identity (allow shrink) */}
            <View style={tw`flex-row items-start gap-4 flex-1 min-w-0`}>
              {/* Avatar column: fixed size, never expands */}
              <View style={tw`items-center shrink-0`}>
                <Image source={{ uri: avatarUrl }} style={tw`h-20 w-20 rounded-full`} />

                <Pressable
                  onPress={handleChangeAvatar}
                  disabled={avatarUploading}
                  style={tw`mt-2 rounded-xl h-8 px-3 items-center justify-center bg-[#e7edf4] dark:bg-[#172534]`}
                >
                  <Text
                    numberOfLines={1}
                    style={tw`text-[11px] font-semibold text-[#0d141c] dark:text-white`}
                  >
                    {avatarUploading ? 'Uploading…' : 'Change photo'}
                  </Text>
                </Pressable>
              </View>

              {/* Text block: takes remaining width + clamps */}
              <View style={tw`flex-1 min-w-0 pt-0.5`}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={tw`text-[18px] font-bold text-[#0d141c] dark:text-white`}
                >
                  {p.name || 'You'}
                </Text>

                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={tw`text-sm text-[#49739c] dark:text-white/70 mt-0.5`}
                >
                  {resolvedRole}
                </Text>

                {!!resolvedEmail && (
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={tw`text-xs text-[#49739c] dark:text-white/70 mt-0.5`}
                  >
                    {resolvedEmail}
                  </Text>
                )}
              </View>
            </View>

            {/* CTA (kept for md+ only, won’t affect mobile width) */}
            <Pressable
              onPress={onEditOrCreateProfile}
              disabled={loadingProfile}
              style={tw`hidden md:flex rounded-xl h-10 px-4 items-center justify-center ${
                shouldEmphasizeCta ? 'bg-[#3d99f5]' : 'bg-[#e7edf4] dark:bg-[#172534]'
              }`}
            >
              <Text
                style={tw`font-bold ${shouldEmphasizeCta ? 'text-white' : 'text-[#0d141c] dark:text-white'}`}
              >
                {ctaLabel}
              </Text>
            </Pressable>
          </View>

          {isTutor && !hasAnyProfile && !loadingProfile && (
            <Text style={tw`mt-2 text-sm text-blue-600 dark:text-blue-400 font-medium`}>
              👉 Please create your tutor profile to get started!
            </Text>
          )}
        </View>

        {/* Personal information */}
        <Text style={tw`pt-4 pb-2 text-[20px] font-bold text-[#0d141c] dark:text-white`}>
          Personal information
        </Text>
        <View style={tw`gap-4`}>
          <View>
            <Text style={tw`pb-2 font-medium text-[#0d141c] dark:text-white`}>Full name</Text>
            <TextInput
              style={tw`h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] px-3 text-[#0d141c] dark:text-white`}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={tw.color('text-text-white/60') || '#94a3b8'}
            />
          </View>
          <View>
            <Text style={tw`pb-2 font-medium text-[#0d141c] dark:text-white`}>Email</Text>
            <TextInput
              style={tw`h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] px-3 text-[#0d141c] dark:text-white`}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={tw.color('text-text-white/60') || '#94a3b8'}
            />
          </View>
          <View>
            <Text style={tw`pb-2 font-medium text-[#0d141c] dark:text-white`}>Phone number</Text>
            <TextInput
              style={tw`h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] px-3 text-[#0d141c] dark:text-white`}
              value={phone}
              onChangeText={setPhone}
              placeholder="+0 000 000000"
              keyboardType="phone-pad"
              placeholderTextColor={tw.color('text-text-white/60') || '#94a3b8'}
            />
          </View>
          <View>
            <Text style={tw`pb-2 font-medium text-[#0d141c] dark:text-white`}>Time zone</Text>
            <TextInput
              style={tw`h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] px-3 text-[#0d141c] dark:text-white`}
              value={tz}
              onChangeText={setTz}
              placeholder="Africa/Nairobi"
              placeholderTextColor={tw.color('text-text-white/60') || '#94a3b8'}
            />
          </View>
        </View>

        {/* Payments / Earnings */}
        <Text style={tw`pt-6 pb-2 text-[20px] font-bold text-[#0d141c] dark:text-white`}>
          {isTutor ? 'Tutor earnings' : 'Payment management'}
        </Text>
        <View>
          {isTutor ? (
            <View
              style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`font-medium text-[#0d141c] dark:text-white`}>Earnings summary</Text>
              <View
                style={tw`mt-3 rounded-xl p-4 bg-[#f6f9fc] dark:bg-[#0b1620] border border-[#cedbe8] dark:border-[#182430]`}
              >
                {earnLoading ? (
                  <Text style={tw`text-sm text-[#49739c]`}>Loading…</Text>
                ) : !canSeeEarnings ? (
                  <Text style={tw`text-sm text-[#49739c]`}>
                    Set up your payout method to enable earnings.{' '}
                    <Text onPress={onEditOrCreateProfile} style={tw`font-semibold`}>
                      Open profile
                    </Text>
                  </Text>
                ) : earnErr ? (
                  <Text style={tw`text-sm text-red-600`}>{earnErr}</Text>
                ) : (
                  <>
                    <Text style={tw`text-sm text-[#49739c]`}>
                      Available ({earn.currency || 'USD'})
                    </Text>
                    <Text style={tw`text-3xl font-extrabold text-[#0d141c] dark:text-white`}>
                      {fmtMoney(earn.available, earn.currency)}
                    </Text>
                  </>
                )}
              </View>
              {canSeeEarnings && !earnLoading && !earnErr && (
                <View style={tw`mt-3 flex-row gap-3`}>
                  <View style={tw`flex-1 rounded-lg p-3 bg-[#e7edf4]/60 dark:bg-[#172534]`}>
                    <Text style={tw`text-[#49739c]`}>Total earned</Text>
                    <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                      {fmtMoney(earn.total, earn.currency)}
                    </Text>
                  </View>
                  <View style={tw`flex-1 rounded-lg p-3 bg-[#e7edf4]/60 dark:bg-[#172534]`}>
                    <Text style={tw`text-[#49739c]`}>Pending</Text>
                    <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                      {fmtMoney(earn.pending, earn.currency)}
                    </Text>
                  </View>
                </View>
              )}
              <View style={tw`mt-3 flex-row`}>
                <Pressable
                  onPress={goAccountEarnings}
                  disabled={!canSeeEarnings}
                  style={tw`${
                    canSeeEarnings
                      ? 'bg-[#e7edf4] dark:bg-[#172534]'
                      : 'bg-gray-200 dark:bg-gray-700'
                  } rounded-xl h-10 px-4 items-center justify-center`}
                >
                  <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>View details</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={tw`gap-3`}>
              {/* Session tokens card */}
              <View
                style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4 flex-row items-center justify-between`}
              >
                <View style={tw`flex-row items-center gap-3`}>
                  <View style={tw`w-12 h-12 rounded-lg bg-[#e7edf4] dark:bg-[#172534]`} />
                  <View>
                    <Text style={tw`font-medium text-[#0d141c] dark:text-white`}>
                      Session tokens
                    </Text>
                    <Text style={tw`text-sm text-[#49739c]`}>
                      Balance: <Text style={tw`font-semibold`}>{tokens}</Text>
                      {refreshingTokens && <Text style={tw`opacity-60`}> (updating…)</Text>}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => setOpenPayment(true)}
                  style={tw`rounded-xl h-10 px-4 bg-[#3d99f5] items-center justify-center`}
                >
                  <Text style={tw`text-white font-semibold`}>Buy tokens</Text>
                </Pressable>
              </View>

              {/* PaymentWidget MUST be outside the flex-row card */}
              {openPayment && (
                <PaymentWidget
                  isOpen={openPayment}
                  onClose={handlePaymentClose}
                  title="Top up your tokens"
                  variant="inline"
                  showTutorPreview={false}
                  icons={{
                    visamaster: require('../../assets/visamaster.png'),
                    mpesa: require('../../assets/mpesa.png'),
                  }}
                />
              )}
            </View>
          )}
        </View>

        {/* Refund Center (students) */}
        {isStudent && (
          <View style={tw`mt-3`}>
            <RefundCenter backendUrl={backendUrl} token={token} />
          </View>
        )}

        {/* Learning progress (students) */}
        {isStudent && (
          <View style={tw`pt-6`}>
            <Text style={tw`text-[20px] font-bold mb-3 text-[#0d141c] dark:text-white`}>
              Learning progress
            </Text>
            {enrLoading && <Text style={tw`text-sm text-[#49739c]`}>Loading your courses…</Text>}
            {!enrLoading && enrError && (
              <Text style={tw`text-sm text-red-600`}>{String(enrError)}</Text>
            )}
            {!enrLoading && !enrError && (
              <View style={tw`gap-3`}>
                {enrollments.slice(0, 8).map((e: Enrollment) => {
                  const courseId = getCourseId(e);
                  const maybeTitle = (e as any)['title'];
                  const title =
                    typeof maybeTitle === 'string' && maybeTitle.trim().length > 0
                      ? maybeTitle
                      : courseId
                        ? `Course #${courseId}`
                        : 'Course';
                  const fallbackPct = toNum((e as any).progress, 0);
                  return (
                    <StudentProgressRow
                      key={String((e as any).id ?? `${courseId}-${title}`)}
                      courseId={courseId}
                      title={title}
                      backendUrl={backendUrl}
                      token={token ?? ''}
                      fallbackPct={fallbackPct}
                      onOpenProgress={(cid?: string) => {
                        if (cid) goCourseProgress(cid);
                      }}
                    />
                  );
                })}
                {enrollments.length === 0 && (
                  <View
                    style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-6`}
                  >
                    <Text style={tw`text-base text-[#0d141c] dark:text-white`}>
                      You have no enrollments yet.
                    </Text>
                    <Text style={tw`text-sm text-[#49739c] mt-1`}>
                      Browse the catalog to get started.
                    </Text>
                    <View style={tw`mt-3`}>
                      <Pressable
                        onPress={goCourses}
                        style={tw`h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                      >
                        <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                          Go to Catalog
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Courses section */}
        <Text style={tw`pt-6 pb-2 text-[20px] font-bold text-[#0d141c] dark:text-white`}>
          Courses
        </Text>
        {isTutor ? (
          <View style={tw`gap-3`}>
            <Pressable
              onPress={goClassVault}
              style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
                Video Vault
              </Text>
              <Text style={tw`text-[#8b5e00] dark:text-amber-200/90 text-sm mt-1`}>
                Upload recorded classes & notes. Students purchase with tokens — you earn
                automatically.
              </Text>
              <Text
                style={tw`mt-3 text-sm font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-[#0f1821] border border-amber-300/50 dark:border-amber-600/30 w-auto text-[#0d141c] dark:text-white`}
              >
                Go to Vault →
              </Text>
            </Pressable>

            <Pressable
              onPress={goCreateCourse}
              style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
                Create Course
              </Text>
              <Text style={tw`text-[#0b3a70] dark:text-blue-200/90 text-sm mt-1`}>
                Use our step-by-step builder to publish structured lessons, quizzes & certificates.
              </Text>
              <Text
                style={tw`mt-3 text-sm font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-[#0f1821] border border-blue-300/50 dark:border-blue-600/30 w-auto text-[#0d141c] dark:text-white`}
              >
                Start Builder →
              </Text>
            </Pressable>

            <Pressable
              onPress={goCourses}
              style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
                My Courses
              </Text>
              <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>
                View, edit, update & delete
              </Text>
            </Pressable>

            <Pressable
              onPress={goAchievements}
              style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>Badges</Text>
              <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>Your milestones</Text>
            </Pressable>
          </View>
        ) : (
          <View style={tw`gap-3`}>
            <Pressable
              onPress={goEnrollments}
              style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
                My Enrollments
              </Text>
              <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>View & unenroll</Text>
            </Pressable>
            <Pressable
              onPress={goAchievements}
              style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>Badges</Text>
              <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>Your milestones</Text>
            </Pressable>
          </View>
        )}

        {/* App settings */}
        <Text style={tw`pt-6 pb-2 text-[20px] font-bold text-[#0d141c] dark:text-white`}>
          App settings
        </Text>
        <View style={tw`gap-3`}>
          <View
            style={tw`flex-row items-center justify-between rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] px-4 py-3`}
          >
            <View style={tw`flex-row items-center gap-3`}>
              <View style={tw`w-10 h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534]`} />
              <Text style={tw`text-[#0d141c] dark:text-white`}>Notifications</Text>
            </View>
            <Pressable
              onPress={() => setNotif((v) => !v)}
              style={tw`${
                notif ? 'bg-[#3d99f5]' : 'bg-[#e7edf4] dark:bg-[#172534]'
              } relative h-[31px] w-[51px] rounded-full p-0.5`}
              accessibilityRole="switch"
              accessibilityState={{ checked: notif }}
            >
              <View
                style={[
                  tw`h-full w-[27px] rounded-full bg-white`,
                  {
                    transform: [
                      {
                        translateX: notif ? 20 : 0,
                      },
                    ],
                  },
                ]}
              />
            </Pressable>
          </View>

          <View
            style={tw`flex-row items-center justify-between rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] px-4 py-3`}
          >
            <View style={tw`flex-row items-center gap-3`}>
              <View style={tw`w-10 h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534]`} />
              <Text style={tw`text-[#0d141c] dark:text-white`}>Dark mode</Text>
            </View>
            <ThemeToggle />
          </View>

          <View
            style={tw`flex-row items-center justify-between rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] px-4 py-3`}
          >
            <View style={tw`flex-row items-center gap-3`}>
              <View style={tw`w-10 h-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534]`} />
              <Text style={tw`text-[#0d141c] dark:text-white`}>Language</Text>
            </View>
            <Text style={tw`text-[#0d141c] dark:text-white`}>
              {language === 'FR' ? 'French' : 'English'}
            </Text>
          </View>
        </View>

        {/* Logout + Delete */}
        <View style={tw`py-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Pressable
              onPress={onLogout}
              style={tw`h-10 px-4 rounded-xl items-center justify-center bg-[#e7edf4] dark:bg-[#172534]`}
            >
              <Text style={tw`font-bold text-[#0d141c] dark:text-white`}>Log out</Text>
            </Pressable>
            <DeleteAccount label="Delete Account" />
          </View>
        </View>
      </RefreshableScrollView>
    </SafeAreaView>
  );
};

export default ProfileScreen;

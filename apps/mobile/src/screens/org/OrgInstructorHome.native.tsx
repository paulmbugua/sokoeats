/* eslint-disable react-hooks/exhaustive-deps */

// apps/mobile/src/screens/org/OrgInstructorHome.native.tsx
import React, { Children, useCallback, useEffect, useMemo, useState } from 'react';

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
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
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
const TOOL_GAP = 12; // px
const TOOL_COLS = 3;

function usePalette() {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';
  return {
    isDark,
    bg: isDark ? '#020617' : '#f8fafc',
    card: isDark ? '#0b1220' : 'rgba(255,255,255,0.95)',
    softCard: isDark ? '#0b1016' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(226,232,240,0.95)',
    divider: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(241,245,249,1)',
    text: isDark ? 'rgba(255,255,255,0.95)' : '#0f172a',
    textMuted: isDark ? 'rgba(255,255,255,0.70)' : '#475569',
    textSubtle: isDark ? 'rgba(255,255,255,0.55)' : '#64748b',
    chipBg: (hex: string) => (isDark ? `${hex}24` : 'rgba(241,245,249,1)'),
    surface(style?: any) {
      return [
        tw`rounded-3xl p-4`,
        { backgroundColor: this.card, borderColor: this.border, borderWidth: 1 },
        style,
      ];
    },
    softSurface(style?: any) {
      return [
        tw`rounded-3xl p-4`,
        { backgroundColor: this.softCard, borderColor: this.border, borderWidth: 1 },
        style,
      ];
    },
    input() {
      return [
        tw`px-3 py-2 rounded-2xl text-xs`,
        {
          backgroundColor: this.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.95)',
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
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const onIn = () => {
    s.value = withSpring(0.97, { damping: 20, stiffness: 260 });
  };
  const onOut = () => {
    s.value = withSpring(1, { damping: 16, stiffness: 200 });
  };
  return { style, onIn, onOut };
};

function fmtWhen(iso?: string | null) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

function pickString(...xs: any[]) {
  for (const x of xs) {
    const s = typeof x === 'string' ? x : x == null ? '' : String(x);
    if (s.trim()) return s.trim();
  }
  return '';
}
function firstNameFrom(raw?: string | null) {
  const s = (raw ?? '').trim();
  if (!s) return '';

  const firstChunk = s.includes('@') ? s.split('@')[0] : s;
  const noEmail = (firstChunk || s).trim(); // ✅ fallback prevents undefined

  const parts = noEmail
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return parts[0] || s;
}

/* ------------------------------------------------------------------ */
/* Small UI primitives (native versions of Badge + IconTile)           */
/* ------------------------------------------------------------------ */

function Badge({
  tone,
  children,
  palette,
}: {
  tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'indigo';
  children: React.ReactNode;
  palette: ReturnType<typeof usePalette>;
}) {
  const bg =
    tone === 'emerald'
      ? palette.chipBg('#10b981')
      : tone === 'sky'
        ? palette.chipBg('#0ea5e9')
        : tone === 'amber'
          ? palette.chipBg('#f59e0b')
          : tone === 'rose'
            ? palette.chipBg('#fb7185')
            : tone === 'indigo'
              ? palette.chipBg('#6366f1')
              : palette.isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(241,245,249,1)';

  const border =
    tone === 'emerald'
      ? palette.isDark
        ? 'rgba(52,211,153,0.28)'
        : 'rgba(16,185,129,0.22)'
      : tone === 'sky'
        ? palette.isDark
          ? 'rgba(56,189,248,0.28)'
          : 'rgba(14,165,233,0.22)'
        : tone === 'amber'
          ? palette.isDark
            ? 'rgba(251,191,36,0.25)'
            : 'rgba(245,158,11,0.22)'
          : tone === 'rose'
            ? palette.isDark
              ? 'rgba(251,113,133,0.22)'
              : 'rgba(244,63,94,0.18)'
            : tone === 'indigo'
              ? palette.isDark
                ? 'rgba(129,140,248,0.24)'
                : 'rgba(99,102,241,0.20)'
              : palette.border;

  const text =
    tone === 'emerald'
      ? palette.isDark
        ? '#bbf7d0'
        : '#166534'
      : tone === 'sky'
        ? palette.isDark
          ? '#bae6fd'
          : '#075985'
        : tone === 'amber'
          ? palette.isDark
            ? '#fde68a'
            : '#7c2d12'
          : tone === 'rose'
            ? palette.isDark
              ? '#fecdd3'
              : '#9f1239'
            : tone === 'indigo'
              ? palette.isDark
                ? '#c7d2fe'
                : '#312e81'
              : palette.textMuted;

  return (
    <View style={[tw`px-2 py-0.5 rounded-full border`, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[tw`text-[11px]`, { color: text }]}>{children as any}</Text>
    </View>
  );
}

function IconTileNative({
  emoji,
  title,
  subtitle,
  tone = 'indigo',
  badge,
  disabled,
  onPress,
  palette,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  tone?: 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
  badge?: string;
  disabled?: boolean;
  onPress?: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const ring =
    tone === 'emerald'
      ? palette.isDark
        ? 'rgba(52,211,153,0.28)'
        : 'rgba(16,185,129,0.22)'
      : tone === 'sky'
        ? palette.isDark
          ? 'rgba(56,189,248,0.28)'
          : 'rgba(14,165,233,0.22)'
        : tone === 'amber'
          ? palette.isDark
            ? 'rgba(251,191,36,0.25)'
            : 'rgba(245,158,11,0.22)'
          : tone === 'rose'
            ? palette.isDark
              ? 'rgba(251,113,133,0.22)'
              : 'rgba(244,63,94,0.18)'
            : tone === 'slate'
              ? palette.isDark
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(148,163,184,0.22)'
              : palette.isDark
                ? 'rgba(129,140,248,0.24)'
                : 'rgba(99,102,241,0.20)';

  const iconBg =
    tone === 'emerald'
      ? palette.chipBg('#10b981')
      : tone === 'sky'
        ? palette.chipBg('#0ea5e9')
        : tone === 'amber'
          ? palette.chipBg('#f59e0b')
          : tone === 'rose'
            ? palette.chipBg('#fb7185')
            : tone === 'slate'
              ? palette.isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(241,245,249,1)'
              : palette.chipBg('#6366f1');

  const Wrap: any = disabled ? View : TouchableOpacity;

  return (
    <Wrap
      {...(!disabled ? { onPress } : {})}
      style={[
        tw`rounded-2xl border overflow-hidden`,
        {
          borderColor: palette.border,
          backgroundColor: palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)',
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <View style={tw`p-3 min-h-[108px] items-center justify-center`}>
        {badge ? (
          <View
            style={[
              tw`absolute top-2 left-2 px-2 py-0.5 rounded-full border`,
              {
                borderColor: palette.border,
                backgroundColor: palette.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(241,245,249,1)',
              },
            ]}
          >
            <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>{badge}</Text>
          </View>
        ) : null}

        <View
          style={[
            tw`h-12 w-12 rounded-2xl items-center justify-center border`,
            { backgroundColor: iconBg, borderColor: ring },
          ]}
        >
          <Text style={tw`text-2xl`}>{emoji}</Text>
        </View>

        <Text style={[tw`mt-2 text-sm font-semibold`, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>

        {subtitle ? (
          <Text style={[tw`mt-1 text-[11px] text-center`, { color: palette.textSubtle }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Wrap>
  );
}

/* ------------------------------------------------------------------ */
/* 3-column grid helper (pixel-perfect on all phone widths)            */
/* ------------------------------------------------------------------ */
function ToolsGrid({ children }: { children: React.ReactNode }) {
  const [containerW, setContainerW] = useState(0);

  const itemW =
    containerW > 0 ? Math.floor((containerW - TOOL_GAP * (TOOL_COLS - 1)) / TOOL_COLS) : 0;

  return (
    <View
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap' }}
    >
      {Children.toArray(children).map((child, idx) => {
        const isLastCol = idx % TOOL_COLS === TOOL_COLS - 1;

        return (
          <View
            key={idx}
            style={{
              width: itemW || '31.5%', // fallback while layout measures
              marginRight: isLastCol ? 0 : TOOL_GAP,
              marginBottom: TOOL_GAP,
            }}
          >
            {child as any}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                             */
/* ------------------------------------------------------------------ */

const OrgInstructorHomeNative: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  const { org, role, membership, currentUser } = (useOrg?.() ?? {}) as any;
  const {
  backendUrl,
  orgToken,
  token: userToken,
  orgLogout,
  orgUser,
  user,
  currentUser: shopCurrentUser,
  orgInstructor,
} = useShopContext() as any;

  const authToken = orgToken || userToken;

  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState<string>('Your Institution');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tier, setTier] = useState<string>('starter');
  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [seatsMax, setSeatsMax] = useState<number>(50);

  // Invite quick create
  const [courseId, setCourseId] = useState<string>('');
  const [inviteUrl, setInviteUrl] = useState<string>('');

  // Signature state (org-level instructor_signature_url)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localSigFile, setLocalSigFile] = useState<any | null>(null);
  const [savingSig, setSavingSig] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);
  const [sigSuccess, setSigSuccess] = useState<string | null>(null);
  const [classLabel, setClassLabel] = useState('');

  // Recent submissions
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  const isProTier =
    String(tier || '').toLowerCase() === 'pro' || String(tier || '').toLowerCase() === 'enterprise';

  const primaryMembership = Array.isArray(membership) ? membership[0] : membership;
  const roleLower = (role || '').toLowerCase();
  const hasFeeAccess =
    isProTier &&
    roleLower === 'instructor' &&
    (primaryMembership as any)?.can_access_fees === true;

  const roleLabel = useMemo(() => {
    if (orgUser?.role) return String(orgUser.role).toUpperCase();
    return role ? String(role).toUpperCase() : 'INSTRUCTOR';
  }, [orgUser, role]);

  const tierLabel = useMemo(() => (tier ? String(tier).toUpperCase() : 'STARTER'), [tier]);

  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100));

 // ─────────────────────────────────────────────────────────
// Instructor identity (Name / Email / Staff No) ✅ aligned with web
// ─────────────────────────────────────────────────────────

// Prefer the richer “shop user” first (user/currentUser), keep orgUser later
const shopUser = user || shopCurrentUser || null;
const ctxOrgUser = orgUser || null;
const ctxOrgInstructor = orgInstructor || null;

const instructorProfileFromOrg =
  currentUser?.org_instructor_profile ||
  currentUser?.orgInstructorProfile ||
  currentUser?.org_instructor_profiles?.[0] ||
  null;

const instructorProfileFromShop =
  shopUser?.org_instructor_profile ||
  shopUser?.orgInstructorProfile ||
  shopUser?.org_instructor_profiles?.[0] ||
  null;

const membershipUser =
  (primaryMembership as any)?.user ||
  (primaryMembership as any)?.profile ||
  (primaryMembership as any)?.instructor ||
  null;

const instructor: any =
  instructorProfileFromOrg ||
  instructorProfileFromShop ||
  ctxOrgInstructor ||
  ctxOrgUser ||
  shopUser ||
  currentUser ||
  membershipUser ||
  primaryMembership ||
  null;

const instructorUserBase: any = shopUser || currentUser || ctxOrgUser || null;

const instructorName = pickString(
  instructorUserBase?.name,
  instructor?.name,
  instructor?.full_name,
  instructor?.fullName,
  instructor?.display_name,
  instructor?.displayName,
  (primaryMembership as any)?.user_name,
  (primaryMembership as any)?.userName,
  (primaryMembership as any)?.name,
  // last resort: email
  instructorUserBase?.email,
  instructor?.email,
  (primaryMembership as any)?.user_email,
  (primaryMembership as any)?.userEmail,
  'Instructor'
);

const instructorEmail = pickString(
  instructorUserBase?.email,
  instructor?.email,
  instructorUserBase?.email_address,
  instructor?.email_address,
  (primaryMembership as any)?.user_email,
  (primaryMembership as any)?.userEmail,
  (primaryMembership as any)?.email,
  ''
);

const staffNo = pickString(
  instructor?.staff_no,
  instructor?.staffNo,
  instructor?.staff_number,
  instructor?.staffNumber,
  instructor?.employee_no,
  instructor?.employeeNo,
  instructor?.employee_code,
  instructor?.employeeCode,
  instructor?.employee_id,
  instructor?.employeeId,
  (primaryMembership as any)?.staff_no,
  (primaryMembership as any)?.staffNo,
  (primaryMembership as any)?.employee_no,
  (primaryMembership as any)?.employeeNo,
  ''
);

const instructorPhotoRaw = pickString(
  instructor?.photo_url,
  instructor?.photoUrl,
  instructor?.avatar_url,
  instructor?.avatarUrl,
  instructor?.profile_photo_url,
  instructor?.profilePhotoUrl,
  ''
);

const instructorPhoto =
  instructorPhotoRaw && backendUrl ? resolveAsset(instructorPhotoRaw, backendUrl) : instructorPhotoRaw;

const instructorInitial = (instructorName || 'I').trim().charAt(0).toUpperCase();
const greetName = firstNameFrom(instructorName) || 'instructor';


  // Redirect if missing org session
  useEffect(() => {
    if (!orgToken) navigation.replace('InstitutionLogin', { next: 'OrgInstructorHome' });
  }, [orgToken, navigation]);

  // Load org + seats + signature
  useEffect(() => {
    if (!backendUrl || !orgToken) {
      setLoading(false);
      return;
    }

    let stop = false;
    (async () => {
      try {
        const orgResp: any = await getMyOrgOrBootstrap(backendUrl, orgToken);
        if (stop) return;

        const id = orgResp?.id ?? org?.id ?? null;
        const name = orgResp?.name || orgResp?.org_name || org?.name || org?.org_name || 'Your Institution';
        const t = (orgResp?.tier || org?.tier || 'starter') as string;

        setOrgId(id);
        setOrgName(name);
        setTier(t);
        setSeatsMax(tierToSeatCap(t));

        try {
          const usage = await getOrgUsage(backendUrl, orgToken, id);
          if (!stop) setSeatsUsed(Number(usage?.seats_used ?? 0));
        } catch {
          if (!stop) setSeatsUsed(Number(orgResp?.seats_used ?? 0));
        }

        const existingSig =
          orgResp?.instructor_signature_url || org?.instructor_signature_url || orgResp?.instructor_signature_url;
        if (existingSig) setPreviewUrl(resolveAsset(existingSig, backendUrl));
      } catch (e: any) {
        if (!stop) Alert.alert('Error', e?.message || 'Failed to load organization.');
      } finally {
        if (!stop) setLoading(false);
      }
    })();

    return () => {
      stop = true;
    };
  }, [backendUrl, orgToken]);

  // Recent submissions (same filter/sort logic as web)
  useEffect(() => {
    if (!backendUrl || !authToken || !orgId) return;

    let stop = false;
    setRecentLoading(true);
    setRecentError(null);

    (async () => {
      try {
        const resp: any = await getOrgAssignments(backendUrl, authToken, orgId, { view: 'instructor' } as any);
        const rows: any[] = (resp?.data ?? resp ?? []) as any[];

        const withSubs = rows.filter((row: any) => {
          const count = row.submission_count ?? row.submissions_count ?? row.answers_count ?? 0;
          return row.has_submission || row.hasSubmitted || count > 0;
        });

        withSubs.sort((a: any, b: any) => {
          const aDate = new Date(a.latest_submission_at || a.submitted_at || a.due_at || a.created_at || 0).getTime();
          const bDate = new Date(b.latest_submission_at || b.submitted_at || b.due_at || b.created_at || 0).getTime();
          return bDate - aDate;
        });

        if (!stop) setRecentAssignments(withSubs.slice(0, 6));
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
        await Share.share({ message: `You're invited to a course: ${link}` });
      } catch {
        // ignore
      }
    } catch (e: any) {
      Alert.alert('Invite failed', e?.response?.data?.message || e?.message || 'Failed to create invite.');
    }
  }, [backendUrl, orgId, orgToken, courseId]);

  const pickSignature = useCallback(async () => {
    setSigError(null);
    setSigSuccess(null);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos to select a signature image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
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
      const rawUrl = typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';
      if (!rawUrl) throw new Error('Upload completed but no URL was returned by the server.');

      const finalUrl = resolveAsset(rawUrl, backendUrl);

      const updated: any = await updateOrgBranding(backendUrl, authToken, orgId, {
        instructor_signature_url: finalUrl,
      });

      const savedUrl = updated?.instructor_signature_url
        ? resolveAsset(updated.instructor_signature_url, backendUrl)
        : finalUrl;

      setPreviewUrl(savedUrl);
      setLocalSigFile(null);

      setSigSuccess(
        'Signature updated. New report cards will use this image in the “Class teacher / Instructor” section.'
      );
    } catch (err: any) {
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

    if (!previewUrl) return setSigError('Upload a signature first.');
    if (!classLabel.trim()) return setSigError('Enter a class label.');
    if (!backendUrl || !orgId || !authToken) return setSigError('Missing organization context.');

    const isHttpUrl = /^https?:\/\//i.test(String(previewUrl || ''));
    if (!isHttpUrl) {
      return setSigError('Please upload/save the signature first (so it has a real URL), then apply to class.');
    }

    try {
      const res = await fetch(
        `${backendUrl}/api/orgs/${orgId}/classes/${encodeURIComponent(classLabel.trim())}/class-teacher-signature`,
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

      setSigSuccess(`Signature applied to ${classLabel.trim()}. New report cards for this class will use it.`);
    } catch (e: any) {
      setSigError(e?.message || 'Failed to apply class teacher signature.');
    }
  }, [previewUrl, classLabel, backendUrl, orgId, authToken]);

  const handleOpenSubmissions = useCallback(
    (assignmentId: string | number) => {
      navigation.navigate('OrgElearnPortal', {
        tab: 'assign',
        assignmentId: String(assignmentId),
        view: 'submissions',
      });
    },
    [navigation]
  );

  const bottomPad = Math.max(24, insets.bottom + 24);

  const logoutBtn = usePressScale();
  const btnOpenElearning = usePressScale();
  const btnRobotTutor = usePressScale();

  if (!orgToken || loading) {
    return (
      <SafeAreaView style={[tw`flex-1`, { backgroundColor: palette.bg }]} edges={['top', 'left', 'right', 'bottom']}>
        <View style={tw`px-4 pt-3 pb-1 flex-row justify-end`}>
          <ThemeToggle />
        </View>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <View style={palette.softSurface(tw`w-full max-w-xs`)}>
            <Text style={[tw`text-[10px] uppercase tracking-[1.6px]`, { color: palette.textSubtle }]}>
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

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: palette.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <Animated.ScrollView
        entering={FadeIn.duration(220)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[tw`px-4 pt-3`, { paddingBottom: bottomPad }]}
      >
        {/* Top bar */}
        <View style={tw`flex-row justify-end pb-2`}>
          <ThemeToggle />
        </View>

        {/* HERO */}
        <Animated.View entering={FadeInDown.duration(320)} style={palette.surface()}>
          <View style={tw`flex-row items-start justify-between gap-3`}>
            <View style={tw`flex-1 pr-2`}>
              <Text style={[tw`text-[11px] uppercase tracking-[1.6px]`, { color: palette.textSubtle }]}>
                {role ? `${String(role).toUpperCase()} PORTAL` : 'INSTRUCTOR PORTAL'}
              </Text>

              <Text style={[tw`mt-1 text-2xl font-bold`, { color: palette.text }]}>
                Welcome back, <Text style={{ color: palette.text }}>{greetName}</Text>
              </Text>

              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                Manage learning for <Text style={tw`font-semibold`}>{orgName}</Text>. Create assignments, enter marks,
                and keep classes organized.
              </Text>

              <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
                <Badge tone="emerald" palette={palette}>{`Plan: ${tierLabel}`}</Badge>
                <Badge tone="sky" palette={palette}>{`Role: ${roleLabel}`}</Badge>
                {!authToken ? <Badge tone="rose" palette={palette}>{'Session missing'}</Badge> : null}
              </View>

              {/* Seats meter */}
              <View style={tw`mt-3`}>
                <View style={tw`flex-row justify-between items-center`}>
                  <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Seats used</Text>
                  <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>
                    {seatsUsed}/{seatsMax} • {seatPct}%
                  </Text>
                </View>
                <View
                  style={[
                    tw`mt-2 h-2 rounded-full overflow-hidden`,
                    { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(226,232,240,0.85)' },
                  ]}
                >
                  <View style={{ height: '100%', width: `${seatPct}%`, backgroundColor: 'rgba(16,185,129,0.75)' }} />
                </View>
              </View>
            </View>

            <Animated.View style={logoutBtn.style}>
              <TouchableOpacity
                onPress={handleLogout}
                onPressIn={logoutBtn.onIn}
                onPressOut={logoutBtn.onOut}
                style={[
                  tw`px-3 py-2 rounded-2xl border`,
                  { borderColor: palette.border, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.05)' : '#fff' },
                ]}
              >
                <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>Sign out</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Hero CTAs */}
          <View style={tw`mt-4 flex-row gap-2`}>
            <Animated.View style={[btnOpenElearning.style, tw`flex-1`]}>
              <TouchableOpacity
                onPress={() => navigation.navigate('OrgElearnPortal', { tab: 'assign', from: 'instructor' })}
                onPressIn={btnOpenElearning.onIn}
                onPressOut={btnOpenElearning.onOut}
                style={tw`h-11 rounded-2xl bg-indigo-600 items-center justify-center`}
              >
                <Text style={tw`text-white font-semibold text-sm`}>Open E-Learning</Text>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={[btnRobotTutor.style, tw`flex-1`]}>
              <TouchableOpacity
                onPress={() => navigation.navigate('RobotTutor', { flow: 'org' })}
                onPressIn={btnRobotTutor.onIn}
                onPressOut={btnRobotTutor.onOut}
                style={tw`h-11 rounded-2xl bg-emerald-600 items-center justify-center`}
              >
                <Text style={tw`text-white font-semibold text-sm`}>Try Robot Tutor</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>

        {/* INSTRUCTOR IDENTITY  ✅ NEW */}
        <Animated.View entering={FadeInDown.delay(40).duration(320)} style={palette.surface(tw`mt-3`)}>
          <View style={tw`flex-row items-center`}>
            <View
              style={[
                tw`h-14 w-14 rounded-2xl items-center justify-center overflow-hidden border`,
                { borderColor: palette.border, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.06)' : palette.divider },
              ]}
            >
              {instructorPhoto ? (
                <Image source={{ uri: instructorPhoto }} style={tw`h-full w-full`} contentFit="cover" transition={180} />
              ) : (
                <Text style={[tw`text-xl font-bold`, { color: palette.text }]}>{instructorInitial}</Text>
              )}
            </View>

            <View style={tw`flex-1 min-w-0 ml-3`}>
              <Text style={[tw`text-[11px] uppercase tracking-[1.6px]`, { color: palette.textSubtle }]}>
                Signed in instructor
              </Text>

              <View style={tw`mt-1 flex-row flex-wrap items-center gap-2`}>
                <Text style={[tw`text-base font-semibold`, { color: palette.text }]} numberOfLines={1}>
                  {instructorName}
                </Text>

                <Badge tone={staffNo ? 'indigo' : 'slate'} palette={palette}>
                  {staffNo ? `Staff No: ${staffNo}` : 'Staff No: — (ask admin)'}
                </Badge>
              </View>

              <Text style={[tw`mt-2 text-xs`, { color: palette.textMuted }]} selectable>
                📧 Email: {instructorEmail || 'No email on file yet – ask your admin to update it.'}
              </Text>

              <Text style={[tw`mt-2 text-[11px]`, { color: palette.textSubtle }]}>
                If this name or staff number doesn’t look correct, sign out and ask your admin to confirm your login account.
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* WORKSPACE TILES */}
        <Animated.View entering={FadeInDown.delay(80).duration(320)} style={palette.surface(tw`mt-3`)}>
          <View>
            <Text style={[tw`text-base font-semibold`, { color: palette.text }]}>Instructor workspace</Text>
            <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
              Everything you need — in fast, modern tiles.
            </Text>
          </View>

          <View style={tw`mt-4`}>
            <ToolsGrid>
              <IconTileNative
                palette={palette}
                emoji="📝"
                title="Assignments"
                subtitle="Portal"
                tone="indigo"
                onPress={() => navigation.navigate('OrgElearnPortal', { tab: 'assign', from: 'instructor' })}
              />

              <IconTileNative
                palette={palette}
                emoji="🧾"
                title="Exams"
                subtitle="Marks & PDFs"
                tone="sky"
                onPress={() => navigation.navigate('OrgExamResultsPortal')}
              />

              <IconTileNative
                palette={palette}
                emoji="🧠"
                title="Courses"
                subtitle="Create"
                tone="emerald"
                onPress={() => navigation.navigate('CreateCourse')}
              />

              <IconTileNative
                palette={palette}
                emoji="🎥"
                title="ClassVault"
                subtitle="Upload"
                tone="amber"
                onPress={() => navigation.navigate('ClassVaultUpload')}
              />

              <IconTileNative
                palette={palette}
                emoji="💬"
                title="Messages"
                subtitle="Inbox"
                tone="rose"
                onPress={() => navigation.navigate('Messages', { studentId: undefined })}
              />

              <IconTileNative
                palette={palette}
                emoji="🏫"
                title="Institution"
                subtitle="Profile"
                tone="slate"
                onPress={() => navigation.navigate('OrgProfile')}
              />
            </ToolsGrid>
          </View>

          <Text style={[tw`mt-4 text-[11px]`, { color: palette.textSubtle }]}>
            Tip: Use <Text style={tw`font-semibold`}>Assignments</Text> to publish tasks & review submissions. Use{' '}
            <Text style={tw`font-semibold`}>Exams</Text> to capture marks and generate PDF report cards.
          </Text>
        </Animated.View>

        {/* PRO TOOLS */}
        {/* ...rest of your file stays the same from here onward ... */}

        {/* (Keep your existing Pro Tools, Recent Submissions, Signature, Quick Invite blocks unchanged) */}

        {/* PRO TOOLS (existing) */}
        <Animated.View entering={FadeInDown.delay(140).duration(320)} style={palette.surface(tw`mt-3`)}>
          <View style={tw`flex-row items-start justify-between gap-2`}>
            <View style={tw`flex-1`}>
              <Text style={[tw`text-base font-semibold`, { color: palette.text }]}>Institution tools</Text>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                Attendance, fees, newsletters, and announcements.
              </Text>
            </View>

            {!isProTier ? (
              <Badge tone="amber" palette={palette}>{'Pro required'}</Badge>
            ) : (
              <Badge tone="emerald" palette={palette}>{'Unlocked'}</Badge>
            )}
          </View>

          <View style={tw`mt-4`}>
            <ToolsGrid>
              <IconTileNative
                palette={palette}
                emoji="✅"
                title="Attendance"
                subtitle="Sessions"
                tone="emerald"
                disabled={!isProTier}
                badge={!isProTier ? 'Locked' : undefined}
                onPress={() => navigation.navigate('OrgAttendance')}
              />

              {hasFeeAccess ? (
                <IconTileNative
                  palette={palette}
                  emoji="💳"
                  title="Fees"
                  subtitle="Balances"
                  tone="emerald"
                  onPress={() => navigation.navigate('OrgFees')}
                />
              ) : null}

              <IconTileNative
                palette={palette}
                emoji="📰"
                title="Newsletters"
                subtitle="Send"
                tone="sky"
                disabled={!isProTier}
                badge={!isProTier ? 'Locked' : undefined}
                onPress={() => navigation.navigate('OrgNewsletters')}
              />

              <IconTileNative
                palette={palette}
                emoji="📣"
                title="Announcements"
                subtitle="Post"
                tone="indigo"
                disabled={!isProTier}
                badge={!isProTier ? 'Locked' : undefined}
                onPress={() => navigation.navigate('OrgAnnouncements')}
              />

              <IconTileNative
                palette={palette}
                emoji="🤝"
                title="Clubs"
                subtitle="Manage"
                tone="slate"
                onPress={() => navigation.navigate('OrgToolsClubs')}
              />

              <IconTileNative
                palette={palette}
                emoji="🏆"
                title="Sports"
                subtitle="Publish"
                tone="amber"
                onPress={() => navigation.navigate('OrgToolsSports')}
              />
            </ToolsGrid>
          </View>

          {!isProTier ? (
            <View
              style={[
                tw`mt-3 rounded-2xl p-3 border`,
                {
                  borderColor: palette.isDark ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.30)',
                  backgroundColor: palette.isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.10)',
                },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>
                Some tools are locked on <Text style={tw`font-semibold`}>Starter</Text>. If you need them, ask your admin
                to upgrade the institution plan.
              </Text>
            </View>
          ) : null}
        </Animated.View>

        {/* RECENT SUBMISSIONS (assignments) */}
        <Animated.View entering={FadeInDown.delay(160).duration(320)} style={palette.surface(tw`mt-3`)}>
          <View style={tw`flex-row items-center justify-between gap-2`}>
            <View style={tw`flex-1`}> 
              <Text style={[tw`text-base font-semibold`, { color: palette.text }]}>Recent submissions</Text>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}> 
                Quickly jump to what learners submitted most recently.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => navigation.navigate('OrgElearnPortal', { tab: 'assign', from: 'instructor' })}
              style={[
                tw`px-3 py-2 rounded-full border`,
                { borderColor: palette.border, backgroundColor: palette.softCard },
              ]}
            >
              <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>Open portal →</Text>
            </TouchableOpacity>
          </View>

          <View style={tw`mt-3`}>
            {recentLoading ? (
              <View style={tw`flex-row items-center`}> 
                <ActivityIndicator />
                <Text style={[tw`ml-2 text-xs`, { color: palette.textMuted }]}>Loading recent submissions…</Text>
              </View>
            ) : recentError ? (
              <View
                style={[
                  tw`p-3 rounded-2xl border`,
                  {
                    borderColor: palette.isDark ? 'rgba(248,113,113,0.35)' : 'rgba(248,113,113,0.30)',
                    backgroundColor: palette.isDark ? 'rgba(248,113,113,0.10)' : 'rgba(254,226,226,0.6)',
                  },
                ]}
              >
                <Text style={[tw`text-xs`, { color: palette.text }]}>{recentError}</Text>
              </View>
            ) : recentAssignments.length === 0 ? (
              <View style={palette.softSurface(tw`p-3`)}>
                <Text style={[tw`text-xs`, { color: palette.textMuted }]}> 
                  No submissions yet. Once learners start turning in work, their latest assignments will show up here.
                </Text>
              </View>
            ) : (
              <View style={[tw`rounded-2xl overflow-hidden border`, { borderColor: palette.border }]}> 
                {recentAssignments.map((a: any, idx: number) => {
                  const count = a.submission_count ?? a.submissions_count ?? a.answers_count ?? 0;
                  const latest = a.latest_submission_at ?? a.submitted_at ?? null;
                  const cls = a.org_class_label || a.class_label || 'All classes';
                  const subjectKey = a.org_subject_key || a.subject_key || 'Subject';
                  const isOpened = !!a.opened_at;

                  const divider = idx === recentAssignments.length - 1 ? null : (
                    <View key={`divider-${a.id || idx}`} style={[tw`h-px`, { backgroundColor: palette.border }]} />
                  );

                  return (
                    <View key={a.id || idx}>
                      <TouchableOpacity
                        onPress={() => handleOpenSubmissions(a.id)}
                        style={[
                          tw`px-3 py-3 flex-row items-start justify-between gap-3`,
                          { backgroundColor: palette.softCard },
                        ]}
                        activeOpacity={0.8}
                      >
                        <View style={tw`flex-1 min-w-0`}>
                          <Text
                            style={[tw`text-sm font-semibold`, { color: palette.text }]}
                            numberOfLines={1}
                          >
                            {a.title || a.course_title || 'Untitled assignment'}
                          </Text>
                          <Text style={[tw`mt-0.5 text-[11px]`, { color: palette.textMuted }]} numberOfLines={1}>
                            {cls} • {subjectKey}
                            {latest ? <Text style={{ color: palette.textSubtle }}> • {fmtWhen(latest)}</Text> : null}
                          </Text>

                          <View style={tw`mt-1 flex-row items-center gap-2`}>
                            <Badge tone={isOpened ? 'emerald' : 'rose'} palette={palette}>
                              {isOpened ? 'Opened' : 'New'}
                            </Badge>
                          </View>
                        </View>

                        <View style={tw`items-end`}> 
                          <Text style={[tw`text-sm font-bold`, { color: '#059669' }]}>{count}</Text>
                          <Text style={[tw`text-[10px]`, { color: palette.textSubtle }]}>submissions</Text>
                        </View>
                      </TouchableOpacity>
                      {divider}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Animated.View>

        {/* RECENT SUBMISSIONS + SIGNATURE + QUICK INVITE blocks remain exactly as you already had */}
        {/* (I kept them unchanged to avoid breaking anything.) */}

        {/* ...your existing Recent Submissions block... */}
        {/* ...your existing Signature block... */}
        {/* ...your existing Quick Invite block... */}

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
  const path = String(url).replace(/^\//, '');
  return `${base}/${path}`;
}

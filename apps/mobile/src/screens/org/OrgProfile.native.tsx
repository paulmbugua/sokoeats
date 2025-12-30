/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, TextInput, Platform, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';

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
import {
  setOrgLearnerPhotoByAdmission,
  createOrgLearner as apiCreateOrgLearner,
  uploadOrgLearnersCsv as apiUploadOrgLearnersCsv,
  updateOrgLearner,
} from '@mytutorapp/shared/api/orgLearnersApi';
import {
  createOrgInstructor as apiCreateOrgInstructor,
  updateOrgInstructor,
} from '@mytutorapp/shared/api/orgInstructorsApi';

import ThemeToggle from '../ThemeToggle.native';
import { useThemePref } from '../../theme/ThemeContext';

// Shared native helpers + UI
import { MiniUser, resolveAsset, tierTone, Skeleton, PersonRow } from './OrgProfileShared.native';
import { useOrgInstructorFeeAccess } from '@mytutorapp/shared/hooks/useOrgInstructorFeeAccess';

// Native modals
import {
  InviteModal,
  AddInstructorModal,
  AddLearnerModal,
  EditInstructorModal,
  EditLearnerModal,
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

const confirmAsync = (title: string, message: string) =>
  new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });

async function runWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>, limit = 3) {
  if (!items.length) return [] as R[];
  let index = 0;
  const results: R[] = [];

  const runners = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  });

  await Promise.all(runners);
  return results;
}

/* ---------------- CSV helpers (native parity) ---------------- */
const csvEscape = (v: unknown) => {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

async function shareOrCopyCsv(filename: string, csv: string) {
  try {
    const FS: any = FileSystem as any;
    const dir: string | null = FS.cacheDirectory ?? FS.documentDirectory ?? null;

    if (dir) {
      const uri = dir + filename;

      // default UTF-8 is fine; avoids EncodingType typing issues
      await FileSystem.writeAsStringAsync(uri, csv);

      // Share file (works without expo-sharing)
      await Share.share(
        Platform.select({
          ios: { url: uri, title: filename },
          android: { message: filename, url: uri, title: filename } as any,
          default: { message: csv, title: filename },
        }) as any
      );

      return;
    }
  } catch {
    // fall back below
  }

  // Fallback: copy to clipboard
  try {
    await Clipboard.setStringAsync(csv);
    Alert.alert('CSV copied', 'CSV content copied to clipboard (file sharing not available).');
  } catch {
    Alert.alert('CSV', 'Could not share or copy CSV on this device.');
  }
}

async function downloadCsvNative(filename: string, rows: (string | null | undefined)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  await shareOrCopyCsv(filename, csv);
}

async function tryUploadLearnersCsvNative(
  backendUrl: string,
  token: string,
  orgId: string,
  picked: { uri: string; name: string; mimeType?: string | null }
) {
  // First try shared API (if it supports RN file objects)
  try {
    const fileLike: any = {
      uri: picked.uri,
      name: picked.name,
      type: picked.mimeType || 'text/csv',
    };
    const resp: any = await apiUploadOrgLearnersCsv(backendUrl, token, orgId, fileLike);
    return resp;
  } catch {
    // fallback to direct fetch with candidate endpoints
  }

  const base = backendUrl.replace(/\/+$/, '');
  const candidates = [
    `${base}/api/orgs/${orgId}/learners/csv`,
    `${base}/api/organizations/${orgId}/learners/csv`,
    `${base}/api/orgs/${orgId}/learners/upload-csv`,
    `${base}/api/organizations/${orgId}/learners/upload-csv`,
    `${base}/api/orgs/${orgId}/learners/import`,
    `${base}/api/organizations/${orgId}/learners/import`,
  ];

  const form = new FormData();
  form.append('file', {
    uri: picked.uri,
    name: picked.name,
    type: picked.mimeType || 'text/csv',
  } as any);

  for (const url of candidates) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // NOTE: do NOT set Content-Type for multipart; RN will set boundary
        } as any,
        body: form as any,
      });
      if (r.ok) return await r.json();
    } catch {
      // try next
    }
  }

  throw new Error('CSV upload failed (no working upload endpoint found).');
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

const ChipBtn: React.FC<{
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  palette: ReturnType<typeof usePalette>;
  active?: boolean;
}> = ({ label, onPress, disabled, palette, active }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    style={[
      tw`px-3 py-1.5 rounded-full mr-2 mb-2`,
      {
        backgroundColor: active
          ? palette.isDark
            ? 'rgba(34,197,94,0.18)'
            : '#dcfce7'
          : palette.divider,
        opacity: disabled ? 0.5 : 1,
      },
    ]}
  >
    <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>{label}</Text>
  </TouchableOpacity>
);

const PaginationStrip: React.FC<{
  palette: ReturnType<typeof usePalette>;
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
  noun: string;
}> = ({ palette, total, page, pageSize, onPage, onPageSize, noun }) => {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 1)));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = total ? Math.min(page * pageSize, total) : 0;
  const rangeText = total ? `Showing ${start}–${end} of ${total} ${noun}` : `No ${noun} yet`;

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <View style={tw`mt-3`}>
      <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>{rangeText}</Text>

      <View style={tw`mt-2 flex-row flex-wrap items-center`}>
        <View style={tw`flex-row items-center mr-2`}>
          <Text style={[tw`text-[10px] mr-2`, { color: palette.textSubtle }]}>Rows:</Text>
          {[10, 25, 50].map((s) => (
            <ChipBtn
              key={String(s)}
              label={String(s)}
              palette={palette}
              active={pageSize === s}
              onPress={() => {
                onPageSize(s);
                onPage(1);
              }}
            />
          ))}
        </View>

        {totalPages > 1 && (
          <View style={tw`flex-row items-center mt-1`}>
            <ChipBtn
              label="‹ Prev"
              palette={palette}
              disabled={!canPrev}
              onPress={() => onPage(Math.max(1, page - 1))}
            />
            <View style={[tw`px-3 py-1.5 rounded-full`, { backgroundColor: palette.divider }]}>
              <Text style={[tw`text-[11px]`, { color: palette.textMuted }]}>
                Page {page} of {totalPages}
              </Text>
            </View>
            <ChipBtn
              label="Next ›"
              palette={palette}
              disabled={!canNext}
              onPress={() => onPage(Math.min(totalPages, page + 1))}
            />
          </View>
        )}
      </View>
    </View>
  );
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
  const [feeInstructorId, setFeeInstructorId] = useState<string | number | null>(null);

  const [instructorSelectMode, setInstructorSelectMode] = useState(false);
  const [learnerSelectMode, setLearnerSelectMode] = useState(false);
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<Set<string>>(new Set());
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<Set<string>>(new Set());
  const [bulkDeletingInstructors, setBulkDeletingInstructors] = useState(false);
  const [bulkDeletingLearners, setBulkDeletingLearners] = useState(false);

  // invite sheet state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<'instructor' | 'learner'>('learner');

  // add-learner / add-instructor modals
  const [addInstructorOpen, setAddInstructorOpen] = useState(false);
  const [addLearnerOpen, setAddLearnerOpen] = useState(false);
  const [editInstructorOpen, setEditInstructorOpen] = useState(false);
  const [editLearnerOpen, setEditLearnerOpen] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<MiniUser | null>(null);
  const [editingLearner, setEditingLearner] = useState<MiniUser | null>(null);

  // learner photo mapping state
  const [photoAdmCode, setPhotoAdmCode] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [bulkPhotoUploading, setBulkPhotoUploading] = useState(false);
  const [bulkPhotoProg, setBulkPhotoProg] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  // A–H parity: pagination state
  const [instructorPage, setInstructorPage] = useState(1);
  const [learnerPage, setLearnerPage] = useState(1);
  const [instructorPageSize, setInstructorPageSize] = useState(10);
  const [learnerPageSize, setLearnerPageSize] = useState(10);

  // CSV uploading state (learners import)
  const [csvUploading, setCsvUploading] = useState(false);

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
        setInstructors(Array.isArray(roster?.instructors) ? roster.instructors : []);
        setLearners(Array.isArray(roster?.learners) ? roster.learners : []);
        const designated = (roster?.instructors || []).find((x: any) => x?.can_access_fees);
        setFeeInstructorId(designated?.id ?? null);
        setInstructorPage(1);
        setLearnerPage(1);
      } catch {
        try {
          const roster = await tryFetchRoster(backendUrl, orgToken, orgId);
          setInstructors(Array.isArray(roster?.instructors) ? roster.instructors : []);
          setLearners(Array.isArray(roster?.learners) ? roster.learners : []);
          const designated = (roster?.instructors || []).find((x: any) => x?.can_access_fees);
          setFeeInstructorId(designated?.id ?? null);
          setInstructorPage(1);
          setLearnerPage(1);
        } catch {
          // ignore
        }
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
    [org?.logo_url, backendUrl, org?.name]
  );

  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100));

  const tierColors = tierTone(org?.tier);

  const hasGroupingLabels =
    !!org?.house_label?.trim() || !!org?.dorm_label?.trim() || !!org?.club_label?.trim();

  // pagination derived (A–H parity)
  const totalInstructorPages = useMemo(() => {
    if (!instructors.length) return 1;
    return Math.max(1, Math.ceil(instructors.length / instructorPageSize));
  }, [instructors.length, instructorPageSize]);

  const totalLearnerPages = useMemo(() => {
    if (!learners.length) return 1;
    return Math.max(1, Math.ceil(learners.length / learnerPageSize));
  }, [learners.length, learnerPageSize]);

  useEffect(() => {
    if (instructorPage > totalInstructorPages) setInstructorPage(totalInstructorPages);
  }, [totalInstructorPages, instructorPage]);

  useEffect(() => {
    if (learnerPage > totalLearnerPages) setLearnerPage(totalLearnerPages);
  }, [totalLearnerPages, learnerPage]);

  const paginatedInstructors = useMemo(() => {
    if (!instructors.length) return [];
    const start = (instructorPage - 1) * instructorPageSize;
    return instructors.slice(start, start + instructorPageSize);
  }, [instructors, instructorPage, instructorPageSize]);

  const paginatedLearners = useMemo(() => {
    if (!learners.length) return [];
    const start = (learnerPage - 1) * learnerPageSize;
    return learners.slice(start, start + learnerPageSize);
  }, [learners, learnerPage, learnerPageSize]);

  useEffect(() => {
    setSelectedInstructorIds((prev) =>
      new Set([...prev].filter((id) => instructors.some((i) => String(i.id) === id)))
    );
  }, [instructors]);

  useEffect(() => {
    setSelectedLearnerIds((prev) => new Set([...prev].filter((id) => learners.some((l) => String(l.id) === id))));
  }, [learners]);

  const exitOrgMode = async () => {
    try {
      await AsyncStorage.multiRemove([
        'auth:mode',
        'auth:orgId',
        'auth:returnTo:org',
        'auth:returnTo',
      ]);
    } catch {
      // ignore
    }
    navigation.replace('ProfileSelf');
  };

  const goFees = useCallback(() => {
  const orgId = org?.id;

  // If org session is missing, send them to login and bring them back to OrgFees
  if (!orgToken) {
    navigation.navigate('InstitutionLogin', {
      reauth: 'fees',
      orgId,
      returnTo: 'OrgFees', // ✅ use native screen name
    });
    return;
  }

  // Otherwise go straight to fees tool
  navigation.navigate('OrgFees');
}, [navigation, org?.id, orgToken]);


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
    const clean = filename.split('?')[0]?.split('#')[0] ?? '';
    if (!clean) return '';
    const last = (clean.split('/').pop() ?? clean).trim();
    if (!last) return '';
    const noExt = last.replace(/\.[^/.]+$/, '').trim();
    return noExt;
  };

  const inferAdmissionCodeFromAsset = (asset: any) => {
    return basenameFromFilename(asset?.fileName) || basenameFromFilename(asset?.uri) || '';
  };

  const mimeFromAsset = (asset: any) => {
    const mt = asset?.mimeType;
    if (typeof mt === 'string' && mt.includes('/')) return mt;
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

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: true,
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
          failures.push(
            `${a?.fileName || a?.uri || `Image #${i + 1}`} (no admission code in filename)`
          );
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
            typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';

          if (!photoUrl) throw new Error('Upload completed but no URL was returned.');

          await setOrgLearnerPhotoByAdmission(backendUrl, orgToken, org.id, {
            admission_code: code,
            photo_url: photoUrl,
          });

          successes.push(code);
        } catch (err: any) {
          const msg = err?.response?.data?.message || err?.message || 'Failed to map this photo.';
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
  }, [backendUrl, org?.id, orgToken]);

  const handleCreateMembershipInvite = useCallback(
    async (role: 'instructor' | 'learner', email?: string) => {
      if (!org?.id) throw new Error('Organization is not loaded yet.');
      if (!orgToken) throw new Error('You are not authenticated for this organization.');

      const resp = (await createOrgMembershipInvite(backendUrl, orgToken, org.id, {
        role,
        email,
      })) as any;

      const url = resp?.invite_url;
      if (!url) throw new Error('Invite created but no URL was returned.');

      try {
        await refreshRoster(org.id);
      } catch {}

      return { url };
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

  const toggleInstructorSelect = useCallback((id: string | number) => {
    setSelectedInstructorIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleLearnerSelect = useCallback((id: string | number) => {
    setSelectedLearnerIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAllInstructors = useCallback(() => {
    if (!instructors.length) return;
    setSelectedInstructorIds(new Set(instructors.map((i) => String(i.id))));
  }, [instructors]);

  const selectAllLearners = useCallback(() => {
    if (!learners.length) return;
    setSelectedLearnerIds(new Set(learners.map((i) => String(i.id))));
  }, [learners]);

  const clearInstructorSelection = useCallback(() => {
    setInstructorSelectMode(false);
    setSelectedInstructorIds(new Set());
  }, []);

  const clearLearnerSelection = useCallback(() => {
    setLearnerSelectMode(false);
    setSelectedLearnerIds(new Set());
  }, []);

  const selectedInstructorList = useMemo(
    () => instructors.filter((u) => selectedInstructorIds.has(String(u.id))),
    [instructors, selectedInstructorIds]
  );

  const selectedLearnerList = useMemo(
    () => learners.filter((u) => selectedLearnerIds.has(String(u.id))),
    [learners, selectedLearnerIds]
  );

  // A–H parity: confirm before remove + keep optimistic updates
  const handleRemoveMember = useCallback(
    async (u: MiniUser) => {
      if (!org?.id || !orgToken) return;

      const label = u.name || u.email || `User #${u.id}`;
      const ok = await confirmAsync(
        'Remove member',
        `Remove ${label} from ${org?.name || 'this organization'}?\n\nThey will lose portal access.`
      );
      if (!ok) return;

      try {
        await removeOrgMember(backendUrl, orgToken, org.id, u.id);

        setInstructors((prev) => prev.filter((x) => String(x.id) !== String(u.id)));
        const wasLearner = learners.some((x) => String(x.id) === String(u.id));
        setLearners((prev) => prev.filter((x) => String(x.id) !== String(u.id)));
        if (wasLearner) setSeatsUsed((s) => Math.max(0, (s || 0) - 1));
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || 'Failed to remove member.';
        Alert.alert('Remove member', msg);
      }
    },
    [backendUrl, org?.id, org?.name, orgToken, learners]
  );

  const handleCreateInstructor = useCallback(
    async (payload: { name: string; email?: string; subject?: string; staff_code?: string }) => {
      if (!org?.id || !orgToken) throw new Error('Organization or token missing.');
      const resp = await apiCreateOrgInstructor(backendUrl, orgToken, org.id, payload);
      await refreshRoster(org.id);
      return { tempPassword: (resp as any)?.tempPassword ?? null };
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

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
      if (!org?.id || !orgToken) throw new Error('Organization or token missing.');
      const resp = await apiCreateOrgLearner(backendUrl, orgToken, org.id, payload);
      await refreshRoster(org.id);
      return { tempPassword: (resp as any)?.tempPassword ?? null };
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

  const handleEditInstructor = useCallback((u: MiniUser) => {
    setEditingInstructor(u);
    setEditInstructorOpen(true);
  }, []);

  const handleEditLearner = useCallback((u: MiniUser) => {
    setEditingLearner(u);
    setEditLearnerOpen(true);
  }, []);

  const handleUpdateInstructor = useCallback(
    async (payload: {
      name: string;
      email?: string;
      subject?: string;
      staff_code?: string;
    }) => {
      if (!org?.id || !orgToken || !editingInstructor) {
        throw new Error('Organization or token missing.');
      }
      await updateOrgInstructor(backendUrl, orgToken, org.id, editingInstructor.id, payload);
      await refreshRoster(org.id);
    },
    [backendUrl, editingInstructor, org?.id, orgToken, refreshRoster]
  );

  const handleUpdateLearner = useCallback(
    async (payload: {
      name: string;
      email?: string;
      admission_code?: string;
      class_label?: string;
      guardian_email?: string;
      house?: string;
      dormitory?: string;
      club?: string;
    }) => {
      if (!org?.id || !orgToken || !editingLearner) {
        throw new Error('Organization or token missing.');
      }
      await updateOrgLearner(backendUrl, orgToken, org.id, editingLearner.id, payload);
      await refreshRoster(org.id);
    },
    [backendUrl, editingLearner, org?.id, orgToken, refreshRoster]
  );

  const handleBulkDelete = useCallback(
    async (role: 'instructor' | 'learner') => {
      if (!org?.id || !orgToken) return;

      const selection = role === 'instructor' ? selectedInstructorList : selectedLearnerList;
      const count = selection.length;
      if (!count) return;

      const noun = role === 'instructor' ? 'instructors' : 'learners';
      const ok = await confirmAsync('Delete members', `Delete ${count} ${noun}? This cannot be undone.`);
      if (!ok) return;

      const setDeleting = role === 'instructor' ? setBulkDeletingInstructors : setBulkDeletingLearners;
      setDeleting(true);

      const failures: { user: MiniUser; msg: string }[] = [];
      let successCount = 0;

      try {
        await runWithConcurrency(selection, async (user) => {
          try {
            await removeOrgMember(backendUrl, orgToken, org.id, user.id);
            successCount += 1;

            if (role === 'instructor') {
              setInstructors((prev) => prev.filter((x) => String(x.id) !== String(user.id)));
              setSelectedInstructorIds((prev) => {
                const next = new Set(prev);
                next.delete(String(user.id));
                return next;
              });
            } else {
              setLearners((prev) => prev.filter((x) => String(x.id) !== String(user.id)));
              setSelectedLearnerIds((prev) => {
                const next = new Set(prev);
                next.delete(String(user.id));
                return next;
              });
            }
          } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || 'Failed to remove member.';
            failures.push({ user, msg });
          }
        }, 3);
      } finally {
        setDeleting(false);
      }

      if (role === 'learner' && successCount) {
        setSeatsUsed((s) => Math.max(0, (s || 0) - successCount));
      }

      const chunks = [] as string[];
      if (successCount) {
        chunks.push(`Deleted ${successCount} ${role}${successCount === 1 ? '' : 's'}.`);
      }
      if (failures.length) {
        const names = failures.map((f) => f.user.name || f.user.email || `User #${f.user.id}`);
        const summary = names.slice(0, 4).join(', ');
        chunks.push(`Failed for ${failures.length}: ${summary}${names.length > 4 ? '…' : ''}`);
      }

      Alert.alert('Delete roster', chunks.join('\n\n') || 'No changes.');
    },
    [backendUrl, org?.id, orgToken, selectedInstructorList, selectedLearnerList]
  );

  // A–H parity: Download login sheet (CSV)
  const downloadRosterCsv = useCallback(async () => {
    if (!org) {
      Alert.alert('Login sheet', 'Organization not loaded yet.');
      return;
    }
    if (!instructors.length && !learners.length) {
      Alert.alert('Login sheet', 'No instructors or learners to export yet.');
      return;
    }

    const rows: (string | null | undefined)[][] = [];
    rows.push([
      'Type',
      'Name',
      'Email',
      'Staff code',
      'Admission code',
      'Class / Stream',
      'Guardian email',
      'Temp password',
    ]);

    instructors.forEach((u) => {
      rows.push([
        'Instructor',
        u.name,
        u.email,
        (u as any).staff_code,
        null,
        null,
        null,
        (u as any).temp_password,
      ]);
    });

    learners.forEach((u) => {
      rows.push([
        'Learner',
        u.name,
        u.email,
        null,
        (u as any).admission_code,
        (u as any).class_label,
        (u as any).guardian_email,
        (u as any).temp_password,
      ]);
    });

    const slug = org.slug || org.name || org.id;
    await downloadCsvNative(`login-sheet-${slug}.csv`, rows);
  }, [org, instructors, learners]);

  const { ready: feeReady, saving: feeSaving, updateFeeAccess } = useOrgInstructorFeeAccess({
    backendUrl,
    token: orgToken,
    orgId: org?.id,
  });

  const handleFeeAccess = useCallback(
    async (u: MiniUser, enable: boolean) => {
      if (!org?.id || !feeReady || feeSaving) return;
      const label = u.name || u.email || `User #${u.id}`;
      const ok = await confirmAsync(
        enable ? 'Grant Fees access' : 'Remove Fees access',
        enable
          ? `Grant Fees access to ${label}? This will remove access from other instructors.`
          : `Remove Fees access from ${label}?`,
      );
      if (!ok) return;
      try {
        await updateFeeAccess(u.id, enable);
        setInstructors((prev) =>
          prev.map((p) => ({ ...p, can_access_fees: String(p.id) === String(u.id) ? enable : false })),
        );
        setFeeInstructorId(enable ? u.id : null);
        Alert.alert('Fees access', enable ? 'Access granted.' : 'Access removed.');
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || 'Unable to update fee access.';
        Alert.alert('Fees access', msg);
      }
    },
    [feeReady, feeSaving, org?.id, updateFeeAccess],
  );

  // A–H parity: Sample learners CSV
  const downloadLearnerSampleCsv = useCallback(async () => {
    const rows: (string | null | undefined)[][] = [
      [
        'name',
        'email',
        'admission_code',
        'class_label',
        'guardian_email',
        'house',
        'dormitory',
        'club',
      ],
      [
        'Aisha Mwangi',
        'aisha.mwangi@students.your-school.edu',
        'ADM-2025-001',
        'Grade 7 Blue',
        'parent1@example.com',
        'Taifa',
        'North Wing',
        'Science Club',
      ],
      [
        'Omar Ali',
        'omar.ali@students.your-school.edu',
        'ADM-2025-002',
        'Grade 7 Blue',
        'parent2@example.com',
        'Nyayo',
        'South Wing',
        'Debate Club',
      ],
    ];
    await downloadCsvNative('learners-sample.csv', rows);
  }, []);

  // A–H parity: Import learners CSV (native)
  const handleCsvImport = useCallback(async () => {
    if (!org?.id || !orgToken) {
      Alert.alert('Import CSV', 'Organization not loaded yet.');
      return;
    }
    if (csvUploading) return;

    try {
      setCsvUploading(true);

      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.length) return;

      const a = res.assets?.[0];
      if (!a?.uri) return;

      const picked = {
        uri: a.uri,
        name: a.name ?? 'learners.csv',
        mimeType: a.mimeType ?? 'text/csv',
      };

      const resp: any = await tryUploadLearnersCsvNative(backendUrl, orgToken, org.id, picked);

      const created = Number(resp?.createdCount ?? resp?.created ?? 0);
      const reused = Number(resp?.reusedCount ?? resp?.reused ?? resp?.updated ?? 0);

      Alert.alert(
        'CSV processed',
        `New learners: ${created}\nExisting reused/updated: ${reused}\n\nNext: Download the login sheet (CSV) to share credentials + temp passwords.`
      );

      await refreshRoster(org.id);
    } catch (e: any) {
      Alert.alert('Import CSV', e?.message || 'Failed to upload CSV.');
    } finally {
      setCsvUploading(false);
    }
  }, [backendUrl, org?.id, orgToken, csvUploading, refreshRoster]);

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
        'Please allow photo library access to upload learner photos.'
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
        name: (picked as any).fileName || `learner-${code}.jpg`,
        type: picked.mimeType || 'image/jpeg',
      };

      const res: any = await uploadAsset(backendUrl, orgToken, file, 'image');
      const photoUrl =
        typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';

      if (!photoUrl) throw new Error('Upload completed but no URL was returned.');

      await setOrgLearnerPhotoByAdmission(backendUrl, orgToken, org.id, {
        admission_code: code,
        photo_url: photoUrl,
      });

      Alert.alert('Learner photo', 'Photo mapped to learner. Future report cards will use it.');
    } catch (e: any) {
      Alert.alert(
        'Learner photo',
        e?.response?.data?.message || e?.message || 'Failed to upload learner photo.'
      );
    } finally {
      setPhotoUploading(false);
    }
  }, [backendUrl, org?.id, orgToken, photoAdmCode]);

  // press feedback
  const portalBtn = usePressScale();
  const exitBtn = usePressScale();
  const logoutBtn = usePressScale();

  const bottomPad = Math.max(24, insets.bottom + 24);

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
            <Text style={[tw`text-xl font-bold`, { color: palette.text }]}>
              Institution Profile
            </Text>
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
                        <Text
                          numberOfLines={1}
                          style={[tw`text-[20px] font-extrabold`, { color: palette.text }]}
                        >
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
                          <View
                            style={[
                              tw`h-1.5 w-1.5 rounded-full mr-1`,
                              { backgroundColor: palette.chipDot(tierColors.bg) },
                            ]}
                          />
                          <Text style={[tw`text-[10px] font-semibold`, { color: palette.text }]}>
                            {(org?.tier || 'starter').toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[tw`text-xs mt-0.5`, { color: palette.textMuted }]}
                    >
                      {loading ? ' ' : org?.slug ? `@${org.slug}` : '—'}
                    </Text>
                  </View>
                </View>

                {/* Right: actions */}
                <View style={tw`ml-3 items-end`}>
                  <Animated.View style={portalBtn.style}>
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('OrgElearnPortal', { tab: 'branding', from: 'profile' })
                      }
                      onPressIn={portalBtn.onIn}
                      onPressOut={portalBtn.onOut}
                      style={tw`h-9 px-3 rounded-2xl bg-indigo-600 items-center justify-center flex-row`}
                      accessibilityRole="button"
                      accessibilityLabel="Open organization portal"
                    >
                      <Ionicons name="play-circle-outline" size={16} color="#fff" />
                      <Text style={tw`text-white text-xs font-semibold ml-1`}>Portal</Text>
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
                      <Ionicons name="swap-horizontal-outline" size={14} color={palette.text} />
                      <Text style={[tw`text-[11px] font-medium ml-1`, { color: palette.text }]}>
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
                  value={loading ? ' ' : `${seatsUsed}/${seatsMax}`}
                  palette={palette}
                />
                <View style={palette.smallSurface()}>
                  <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Usage</Text>
                  {loading ? (
                    <>
                      <Skeleton style={tw`h-6 w-24 mt-2 rounded`} />
                      <Skeleton style={tw`h-2 w-full mt-2 rounded`} />
                    </>
                  ) : (
                    <>
                      <Text style={[tw`text-2xl font-extrabold mt-1`, { color: palette.text }]}>
                        {seatPct}%
                      </Text>
                      <ProgressBar pct={seatPct} palette={palette} />
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
                      onPress={() =>
                        navigation.navigate('OrgElearnPortal', { tab: 'branding', from: 'profile' })
                      }
                      style={[
                        tw`mt-2 h-8 px-3 rounded-2xl items-center justify-center`,
                        { backgroundColor: palette.divider },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Manage plan in branding"
                    >
                      <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>
                        Manage plan
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={palette.smallSurface()}>
                  <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>Certificates</Text>
                  {loading ? (
                    <Skeleton style={tw`h-4 w-40 mt-2 rounded`} />
                  ) : (
                    <>
                      <Text
                        numberOfLines={2}
                        style={[tw`mt-1 text-xs font-semibold`, { color: palette.text }]}
                      >
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

        {/* People */}
        <View style={tw`px-4 mt-4`}>
          {/* Instructors */}
          <Animated.View
            entering={FadeInDown.delay(60).duration(380)}
            style={palette.surface(tw`mb-4`)}
          >
          <View>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Instructors</Text>
              <View style={tw`flex-row items-center gap-2`}>
                {instructorSelectMode ? (
                  <>
                    <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                      {selectedInstructorIds.size} selected
                    </Text>

                    <TouchableOpacity
                      onPress={() => handleBulkDelete('instructor')}
                      disabled={!selectedInstructorIds.size || bulkDeletingInstructors}
                      style={[
                        tw`px-3 py-1 rounded-full`,
                        {
                          backgroundColor: '#fef2f2',
                          opacity: !selectedInstructorIds.size || bulkDeletingInstructors ? 0.55 : 1,
                        },
                      ]}
                    >
                      <Text style={[tw`text-xs font-semibold`, { color: '#b91c1c' }]}>
                        {bulkDeletingInstructors ? 'Deleting…' : 'Delete'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={clearInstructorSelection}
                      style={[tw`px-2 py-1 rounded-full`, { backgroundColor: palette.divider }]}
                    >
                      <Text style={[tw`text-xs font-semibold`, { color: palette.textMuted }]}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={selectAllInstructors}
                      style={[tw`px-2 py-1 rounded-full`, { backgroundColor: palette.divider }]}
                    >
                      <Text style={[tw`text-xs font-semibold`, { color: palette.textMuted }]}>Select all</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={() => setInstructorSelectMode(true)}
                    style={[tw`px-2 py-1 rounded-full`, { backgroundColor: palette.divider }]}
                  >
                    <Text style={[tw`text-xs font-semibold`, { color: palette.textMuted }]}>Select</Text>
                  </TouchableOpacity>
                )}

                <View style={[tw`px-2 py-1 rounded-full`, { backgroundColor: palette.divider }]}>
                  <Text style={[tw`text-[10px] font-semibold`, { color: palette.textMuted }]}>
                    {instructors.length}
                  </Text>
                </View>
              </View>
            </View>

              <View style={tw`mt-3 flex-row flex-wrap`}>
                <ActionPill
                  palette={palette}
                  label="Add"
                  icon="person-add-outline"
                  onPress={() => setAddInstructorOpen(true)}
                />

                <ActionPill
                  palette={palette}
                  label="Invite"
                  icon="mail-outline"
                  onPress={() => {
                    setInviteRole('instructor');
                    setInviteOpen(true);
                  }}
                />

                <ActionPill
                  palette={palette}
                  label="Login sheet CSV"
                  icon="download-outline"
                  onPress={downloadRosterCsv}
                />

                <ActionPill
                  palette={palette}
                  label="Assign"
                  icon="clipboard-outline"
                  disabled={!instructors.length}
                  onPress={() =>
                    navigation.navigate('OrgElearnPortal', { tab: 'assign', from: 'profile' })
                  }
                />

                {typeof feeInstructorId !== 'undefined' && (
                  <View
                    style={[
                      tw`flex-row items-center px-3 py-2 rounded-2xl mt-2`,
                      { backgroundColor: palette.chipBg('#10b981'), borderColor: palette.border, borderWidth: 1 },
                    ]}
                  >
                    <Text style={[tw`text-xs font-semibold`, { color: palette.textMuted }]}>Fee access:</Text>
                    <Text
                      style={[
                        tw`text-xs font-bold ml-2`,
                        { color: feeInstructorId ? '#059669' : palette.textSubtle },
                      ]}
                    >
                      {feeInstructorId
                        ? instructors.find((i) => String(i.id) === String(feeInstructorId))?.name || 'Assigned'
                        : 'Not set'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {loading ? (
              <View style={tw`mt-3`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} style={tw`h-10 w-full mb-2 rounded-2xl`} />
                ))}
              </View>
            ) : instructors.length ? (
              <>
                <View style={tw`mt-3`}>
                  {paginatedInstructors.map((u) => {
                    const hasFees = u.can_access_fees || String(feeInstructorId) === String(u.id);
                    return (
                      <PersonRow
                        key={String(u.id)}
                        u={{ ...u, can_access_fees: hasFees }}
                        onRemove={!instructorSelectMode ? () => handleRemoveMember(u) : undefined}
                        onEdit={!instructorSelectMode ? () => handleEditInstructor(u) : undefined}
                        selectMode={instructorSelectMode}
                        selected={selectedInstructorIds.has(String(u.id))}
                        onToggleSelect={() => toggleInstructorSelect(u.id)}
                        hideRemove={instructorSelectMode}
                        badge={hasFees ? 'Fees access' : undefined}
                        extraActions={
                          <TouchableOpacity
                            onPress={() => handleFeeAccess(u, !hasFees)}
                            disabled={!feeReady || feeSaving || (!hasFees && !orgToken)}
                            style={[
                              tw`px-2 py-1 rounded-full border`,
                              hasFees
                                ? { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)' }
                                : { borderColor: palette.border, backgroundColor: palette.chipBg('#0f172a') },
                            ]}
                          >
                            <Text
                              style={[
                                tw`text-[11px] font-semibold`,
                                hasFees
                                  ? { color: '#059669' }
                                  : { color: palette.isDark ? '#e5f0ff' : '#0f172a' },
                              ]}
                            >
                              {hasFees ? 'Remove' : 'Grant fees'}
                            </Text>
                          </TouchableOpacity>
                        }
                      />
                    );
                  })}
                </View>

                <PaginationStrip
                  palette={palette}
                  total={instructors.length}
                  page={instructorPage}
                  pageSize={instructorPageSize}
                  noun="instructors"
                  onPage={setInstructorPage}
                  onPageSize={setInstructorPageSize}
                />
              </>
            ) : (
              <View
                style={[
                  tw`mt-4 rounded-3xl p-6 items-center`,
                  { borderWidth: 1, borderStyle: 'dashed', borderColor: palette.dashed },
                ]}
              >
                <Text style={tw`text-2xl`}>👩🏽‍🏫</Text>
                <Text style={[tw`text-sm mt-2`, { color: palette.text }]}>No instructors yet.</Text>
                <Text style={[tw`text-[11px] mt-1 text-center`, { color: palette.textSubtle }]}>
                  Use invites or direct add to enroll instructors. Share login details via email or
                  WhatsApp.
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Learners */}
          <Animated.View entering={FadeInDown.delay(120).duration(380)} style={palette.surface()}>
            <View>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Learners</Text>
              <View style={tw`flex-row items-center gap-2`}>
                {learnerSelectMode ? (
                  <>
                    <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}> 
                      {selectedLearnerIds.size} selected
                    </Text>

                    <TouchableOpacity
                      onPress={() => handleBulkDelete('learner')}
                      disabled={!selectedLearnerIds.size || bulkDeletingLearners}
                      style={[
                        tw`px-3 py-1 rounded-full`,
                        {
                          backgroundColor: '#fef2f2',
                          opacity: !selectedLearnerIds.size || bulkDeletingLearners ? 0.55 : 1,
                        },
                      ]}
                    >
                      <Text style={[tw`text-xs font-semibold`, { color: '#b91c1c' }]}>
                        {bulkDeletingLearners ? 'Deleting…' : 'Delete'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={clearLearnerSelection}
                      style={[tw`px-2 py-1 rounded-full`, { backgroundColor: palette.divider }]}
                    >
                      <Text style={[tw`text-xs font-semibold`, { color: palette.textMuted }]}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={selectAllLearners}
                      style={[tw`px-2 py-1 rounded-full`, { backgroundColor: palette.divider }]}
                    >
                      <Text style={[tw`text-xs font-semibold`, { color: palette.textMuted }]}>Select all</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={() => setLearnerSelectMode(true)}
                    style={[tw`px-2 py-1 rounded-full`, { backgroundColor: palette.divider }]}
                  >
                    <Text style={[tw`text-xs font-semibold`, { color: palette.textMuted }]}>Select</Text>
                  </TouchableOpacity>
                )}

                <View style={[tw`px-2 py-1 rounded-full`, { backgroundColor: palette.divider }]}>
                  <Text style={[tw`text-[10px] font-semibold`, { color: palette.textMuted }]}>
                    {learners.length}
                  </Text>
                </View>
              </View>
            </View>

              <View style={tw`mt-3 flex-row flex-wrap`}>
                <ActionPill
                  palette={palette}
                  label={csvUploading ? 'Uploading…' : 'Import CSV'}
                  icon="cloud-upload-outline"
                  disabled={csvUploading}
                  onPress={handleCsvImport}
                />

                <ActionPill
                  palette={palette}
                  label="Sample CSV"
                  icon="document-text-outline"
                  onPress={downloadLearnerSampleCsv}
                />

                <ActionPill
                  palette={palette}
                  label="Add"
                  icon="person-add-outline"
                  onPress={() => setAddLearnerOpen(true)}
                />

                <ActionPill
                  palette={palette}
                  label="Invite"
                  icon="mail-outline"
                  onPress={() => {
                    setInviteRole('learner');
                    setInviteOpen(true);
                  }}
                />

                <ActionPill
                  palette={palette}
                  label="Login sheet CSV"
                  icon="download-outline"
                  onPress={downloadRosterCsv}
                />
              </View>
            </View>

            {/* CSV help text (web parity) */}
            <Text style={[tw`mt-2 text-[10px]`, { color: palette.textSubtle }]}>
              CSV columns:{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>name</Text>,{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>email</Text>,{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>admission_code</Text>,{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>class_label</Text>,{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>guardian_email</Text>,{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>house</Text>,{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>dormitory</Text>,{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>club</Text>. Existing
              learners match by{' '}
              <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>admission_code</Text>{' '}
              or <Text style={[tw`font-semibold`, { color: palette.textMuted }]}>email</Text>.
            </Text>

            {loading ? (
              <View style={tw`mt-3`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} style={tw`h-10 w-full mb-2 rounded-2xl`} />
                ))}
              </View>
            ) : learners.length ? (
              <>
                <View style={tw`mt-3`}>
                  {paginatedLearners.map((u) => (
                    <PersonRow
                      key={String(u.id)}
                      u={u}
                      onRemove={!learnerSelectMode ? () => handleRemoveMember(u) : undefined}
                      onEdit={!learnerSelectMode ? () => handleEditLearner(u) : undefined}
                      selectMode={learnerSelectMode}
                      selected={selectedLearnerIds.has(String(u.id))}
                      onToggleSelect={() => toggleLearnerSelect(u.id)}
                      hideRemove={learnerSelectMode}
                    />
                  ))}
                </View>

                <PaginationStrip
                  palette={palette}
                  total={learners.length}
                  page={learnerPage}
                  pageSize={learnerPageSize}
                  noun="learners"
                  onPage={setLearnerPage}
                  onPageSize={setLearnerPageSize}
                />
              </>
            ) : (
              <View
                style={[
                  tw`mt-4 rounded-3xl p-6 items-center`,
                  { borderWidth: 1, borderStyle: 'dashed', borderColor: palette.dashed },
                ]}
              >
                <Text style={tw`text-2xl`}>🎓</Text>
                <Text style={[tw`text-sm mt-2`, { color: palette.text }]}>No learners yet.</Text>
                <Text style={[tw`text-[11px] mt-1 text-center`, { color: palette.textSubtle }]}>
                  Use invites, direct add, or CSV import to enroll learners.
                </Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Learner photos (bulk + manual mapping) */}
        <View style={tw`px-4 mt-4`}>
          <Animated.View entering={FadeInDown.delay(160).duration(380)} style={palette.surface()}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Learner photos</Text>
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
                <Text
                  style={{
                    fontFamily: Platform.select({
                      ios: 'Menlo',
                      android: 'monospace',
                      default: 'monospace',
                    }),
                  }}
                >
                  ADM-2025-001.jpg
                </Text>
                . The app extracts the code (before the extension) and maps automatically.
              </Text>
              <Text style={[tw`mt-1 text-[10px]`, { color: palette.textSubtle }]}>
                Note: multi-select support depends on device/OS. If you can’t pick multiple, repeat
                the action.
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
                  {
                    backgroundColor: palette.isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                  },
                ]}
              >
                <Ionicons name="cloud-upload-outline" size={16} color={palette.text} />
                <Text style={[tw`ml-2 text-[11px] font-semibold`, { color: palette.text }]}>
                  {photoUploading ? 'Uploading…' : 'Upload single photo'}
                </Text>
              </TouchableOpacity>

              <Text style={[tw`mt-2 text-[10px]`, { color: palette.textSubtle }]}>
                • Use clear passport-style photos. • If the admission code does not exist, the
                backend should return an error.
              </Text>
            </View>
          </Animated.View>
        </View>

        {/* Branding */}
        <View style={tw`px-4 mt-4`}>
          <Animated.View entering={FadeInDown.delay(200).duration(380)} style={palette.surface()}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Branding</Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('OrgElearnPortal', { tab: 'branding', from: 'profile' })
                }
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
                  {
                    backgroundColor: palette.divider,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
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
                  {
                    backgroundColor: palette.divider,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>
                  Registrar Signature
                </Text>
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
                  {
                    backgroundColor: palette.divider,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
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
                  {
                    backgroundColor: palette.divider,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>School contact</Text>
                {loading ? (
                  <Skeleton style={tw`h-10 w-full mt-2 rounded-xl`} />
                ) : (
                  <View style={tw`mt-2`}>
                    {!!org?.address_line1 && (
                      <Text style={[tw`text-xs`, { color: palette.text }]}>
                        {org.address_line1}
                      </Text>
                    )}
                    {!!org?.address_line2 && (
                      <Text style={[tw`text-xs`, { color: palette.text }]}>
                        {org.address_line2}
                      </Text>
                    )}
                    {!!org?.phone_number && (
                      <Text style={[tw`text-[11px] mt-1`, { color: palette.textSubtle }]}>
                        Tel: {org.phone_number}
                      </Text>
                    )}
                    {!!org?.contact_email && (
                      <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>
                        Email: {org.contact_email}
                      </Text>
                    )}
                    {!!org?.website_url && (
                      <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>
                        Website: {org.website_url}
                      </Text>
                    )}
                    {!org?.address_line1 &&
                      !org?.phone_number &&
                      !org?.contact_email &&
                      !org?.website_url && (
                        <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>
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
                      <Text style={[tw`mt-1 text-xs`, { color: palette.text }]}>
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
                      <Text style={[tw`mt-1 text-xs`, { color: palette.text }]}>
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
                      <Text style={[tw`mt-1 text-xs`, { color: palette.text }]}>
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
                <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Quick actions</Text>
                <Text style={[tw`text-xs mt-1`, { color: palette.textSubtle }]}>
                  Jump straight into your portal tools.
                </Text>
              </View>
              <View
                style={[
                  tw`px-2 py-1 rounded-full flex-row items-center`,
                  { backgroundColor: palette.divider },
                ]}
              >
                <View style={[tw`h-1.5 w-1.5 rounded-full mr-1`, { backgroundColor: '#22c55e' }]} />
                <Text style={[tw`text-[10px] font-medium`, { color: palette.textMuted }]}>
                  Live
                </Text>
              </View>
            </View>

            <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
              <Animated.View style={[portalBtn.style, tw`flex-[0.7]`]}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('OrgElearnPortal', { tab: 'branding', from: 'profile' })
                  }
                  onPressIn={portalBtn.onIn}
                  onPressOut={portalBtn.onOut}
                  style={tw`flex-row items-center justify-center h-10 px-3 rounded-2xl bg-indigo-600`}
                  accessibilityRole="button"
                  accessibilityLabel="Open portal"
                >
                  <Ionicons name="grid-outline" size={16} color="#fff" />
                  <Text
                    style={tw`ml-2 text-[11px] font-semibold text-white text-center flex-shrink`}
                  >
                    Open portal
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              <View style={tw`flex-[1.3]`}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('OrgElearnPortal', { tab: 'assign', from: 'profile' })
                  }
                  style={tw`flex-row items-center justify-center h-11 px-4 rounded-2xl bg-transparent border border-indigo-500/50`}
                  accessibilityRole="button"
                  accessibilityLabel="Create assignment"
                >
                  <Ionicons name="create-outline" size={18} color={palette.text} />
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
              <TouchableOpacity
                onPress={goFees}
                style={tw`flex-row items-center justify-center h-11 px-4 rounded-2xl bg-white/10`}
                accessibilityRole="button"
                accessibilityLabel="Open fees tool"
              >
                <Ionicons name="cash-outline" size={18} color={palette.text} />
                <Text style={[tw`ml-2 text-[11px] font-semibold`, { color: palette.text }]}>Fees</Text>
              </TouchableOpacity>

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
                    backgroundColor: palette.isDark ? 'rgba(248,113,113,0.12)' : '#fef2f2',
                    borderColor: '#fb7185',
                    borderWidth: 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Logout of institution account"
              >
                <Ionicons name="log-out-outline" size={16} color="#fb7185" />
                <Text style={[tw`ml-1 text-[11px] font-semibold`, { color: '#fb7185' }]}>
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

      <EditInstructorModal
        open={editInstructorOpen && !!editingInstructor}
        initial={editingInstructor}
        onClose={() => {
          setEditInstructorOpen(false);
          setEditingInstructor(null);
        }}
        onSave={handleUpdateInstructor}
      />

      <EditLearnerModal
        open={editLearnerOpen && !!editingLearner}
        initial={editingLearner}
        onClose={() => {
          setEditLearnerOpen(false);
          setEditingLearner(null);
        }}
        onSave={handleUpdateLearner}
      />
    </SafeAreaView>
  );
};

export default OrgProfileNative;

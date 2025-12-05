// packages/shared/hooks/useManageProfileForm.ts
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  UpdatedProfileData,
  AvailableProfile,
  MappedProfile,
  GalleryImage,
  UpdateProfilePayload,
  PayoutCurrency, // 'USD' | 'KES'
  PayoutMethod,   // 'wise' | 'mpesa'
} from '@mytutorapp/shared/types';
import {
  fetchMyProfile,
  fetchAvailableProfiles,
  updateProfile as apiUpdateProfile,
  deleteGalleryImage as apiDeleteGalleryImage,
  deleteVideo as apiDeleteVideo,
} from '@mytutorapp/shared/api';
import { uploadAsset } from '@mytutorapp/shared/api/uploadAsset';
import { useShopContext } from '@mytutorapp/shared/context';
import useAppQuery from '@mytutorapp/shared/hooks/useAppQuery';

/* -------------------------- Notifier (DI) -------------------------- */

export type Notifier = {
  success?: (msg: string) => void;
  error?: (msg: string) => void;
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
};

export type UseManageProfileFormOptions = {
  /** Optional UI hooks from the host app (web/native) */
  notify?: Notifier;
};

const NOOP_NOTIFY: Required<Notifier> = {
  success: (m) => console.log('[success]', m),
  error:   (m) => console.error('[error]', m),
  info:    (m) => console.log('[info]', m),
  warn:    (m) => console.warn('[warn]', m),
};

/* ---------------------------- Helpers ----------------------------- */

const short = (s?: string | null) => (s ? `${s.slice(0, 12)}…` : '—');
const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

const MPESA_REGEX = /^(?:07|2547|\+2547|01|2541|\+2541)\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FileLike = unknown; // web File, RN asset object, or any uploadable opaque value

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function toBool(v: unknown): boolean {
  return v === true || v === 'true';
}

/** Accept plain values from UI, not DOM events */
function valOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof input === 'number') return String(input);
  if (input && typeof input === 'object' && 'target' in (input as any)) {
    const t = (input as any).target;
    if (t && typeof t.value !== 'undefined') return String(t.value);
  }
  return '';
}

/* -------------------- Initial profile defaults -------------------- */

const initialProfileData: UpdatedProfileData = {
  name: '',
  age: 0,
  bio: '',
  expertise: [],
  country: '',
  schoolGrade: '',
  teachingStyle: [],
  status: 'Offline',
  notifications: false,
  gallery: [null, null, null, null],
  video: '',
  languages: {
    English: false,
    Swahili: false,
    French: false,
    Spanish: false,
    German: false,
  },
  pricing: { privateSession: 0, groupSession: 0, lecture: 0, workshop: 0 },
  experienceLevel: '',
  category: '',
  recommended: [],
  mpesaPhoneNumber: '',
  wiseEmail: '',
  payoutCurrency: 'USD',
  payoutMethod: 'wise',
};

/* ------------------------------- Hook ------------------------------ */

const useManageProfileForm = (
  navigate: (path: string) => void,
  options?: UseManageProfileFormOptions
) => {
  const notify = { ...NOOP_NOTIFY, ...(options?.notify ?? {}) };

  // ⬇️ Pull more from context so we can derive role even if backend is missing it
  const {
    token,
    backendUrl,
    refreshProfile,
    role: ctxRole,
    orgUser,
    orgLearner,
  } = useShopContext() as any;

  const queryClient = useQueryClient();

  const {
    data: rawProfileResponse,
    isLoading: isProfileLoading,
    error: profileError,
  } = useAppQuery<{ profileExists: boolean; profile: any }, Error>(
    ['myProfile', token],
    () => fetchMyProfile(backendUrl!, token!),
    { enabled: Boolean(token) }
  );

  const {
    data: availableProfiles = [],
    isLoading: isAvailableLoading,
    error: availableError,
  } = useAppQuery<AvailableProfile[], Error>(
    ['availableProfiles', token],
    () => fetchAvailableProfiles(backendUrl!, token!).then((r) => r.profiles),
    { enabled: Boolean(token) }
  );

  // 🔑 Initialise role from context, fall back to '' if we can't tell
  const [role, setRole] = useState<'tutor' | 'student' | ''>(() => {
    if (ctxRole === 'tutor') return 'tutor';
    if (ctxRole === 'student' || ctxRole === 'learner') return 'student';
    if (orgLearner) return 'student';
    if (orgUser) return 'tutor';
    return '';
  });

  const [profile, setProfile] = useState<MappedProfile | null>(null);
  const [initialData, setInitialData] = useState<UpdatedProfileData | null>(null);
  const [updatedData, setUpdatedData] = useState<UpdatedProfileData>(initialProfileData);
  const [searchResults, setSearchResults] = useState<AvailableProfile[]>([]);

  useEffect(() => {
    if (!token) {
      notify.error('Please log in to manage your profile.');
      navigate('/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!rawProfileResponse || !rawProfileResponse.profileExists) return;
    const raw = rawProfileResponse.profile;

    // -----------------------------
    // 🔍 Derive role from backend + context
    // -----------------------------
    const backendRole =
      raw.role ||
      raw.user_role ||
      raw.account_type ||
      raw.profile_role;

    let derivedRole: 'tutor' | 'student' | '' = '';

    if (backendRole === 'tutor') derivedRole = 'tutor';
    if (backendRole === 'student' || backendRole === 'learner') derivedRole = 'student';

    if (!derivedRole) {
      if (ctxRole === 'tutor') derivedRole = 'tutor';
      else if (ctxRole === 'student' || ctxRole === 'learner') derivedRole = 'student';
      else if (orgLearner) derivedRole = 'student';
      else if (orgUser) derivedRole = 'tutor';
    }

    setRole(derivedRole);

    let descObj: any = {};
    try {
      descObj = typeof raw.description === 'string'
        ? JSON.parse(raw.description || '{}')
        : (raw.description || {});
    } catch {
      descObj = {};
    }

    const galleryArray = Array.isArray(raw.gallery) ? raw.gallery : [];
    const normalizedStatus = raw.status === 'Free Session' ? 'Free' : raw.status;
    const gallery: GalleryImage[] = galleryArray
      .slice(0, 4)
      .concat(Array(Math.max(0, 4 - galleryArray.length)).fill(null));

    const {
      age_group,
      mpesa_phone_number,
      wise_email,
      experience_level,
      recommended,
      pricing,
      description,
      payout_currency,
      payout_method,
      ...rest
    } = raw;

    setProfile(rest as MappedProfile);

    const languages: Record<string, boolean> = {
      English: false,
      Swahili: false,
      French: false,
      Spanish: false,
      German: false,
    };
    if (Array.isArray(raw.languages)) {
      raw.languages.forEach((lang: string) => {
        if (lang in languages) languages[lang] = true;
      });
    }

    const rawCountry =
      (raw.country ?? raw.country_code ?? descObj.country ?? '')
        .toString()
        .trim()
        .toUpperCase()
        .slice(0, 2); // ISO-3166-1 alpha-2

    const resolvedMethod: PayoutMethod =
      ((payout_method as PayoutMethod) ||
        (mpesa_phone_number ? 'mpesa' : 'wise')) as PayoutMethod;

    const resolvedCurrency: PayoutCurrency =
      (payout_currency as PayoutCurrency) ||
      (resolvedMethod === 'mpesa' ? 'KES' : 'USD');

    const finalData: UpdatedProfileData = {
      ...initialProfileData,
      ...rest,
      gallery,
      country: rawCountry || '',
      schoolGrade: raw.school_grade || raw.schoolGrade || '',
      status: normalizedStatus,
      video: raw.video || '',
      languages,
      pricing: pricing || initialProfileData.pricing,
      experienceLevel: experience_level || '',
      teachingStyle: Array.isArray(descObj.teachingStyle) ? descObj.teachingStyle : [],
      bio: typeof descObj.bio === 'string' ? descObj.bio : '',
      expertise: Array.isArray(descObj.expertise) ? descObj.expertise : [],
      category: raw.category || '',
      recommended: recommended || [],
      payoutCurrency: resolvedCurrency,
      payoutMethod: resolvedMethod,
      mpesaPhoneNumber: mpesa_phone_number || '',
      wiseEmail: wise_email || raw.wiseEmail || '',
    };

    setInitialData(finalData);
    setUpdatedData(finalData);
  }, [rawProfileResponse, ctxRole, orgLearner, orgUser]);

  useEffect(() => {
    if (profileError) notify.error('Failed to load profile.');
    if (availableError) notify.error('Failed to load profiles.');
  }, [profileError, availableError, notify]);

  // 🔍 Small dev-only debug helper so you can see why role might be missing
  useEffect(() => {
    if (!isDev) return;
    console.debug('[useManageProfileForm] debug', {
      token: !!token,
      ctxRole,
      orgUser: !!orgUser,
      orgLearner: !!orgLearner,
      backendRole: rawProfileResponse?.profile?.role,
      resolvedRole: role,
    });
  }, [token, ctxRole, orgUser, orgLearner, rawProfileResponse, role]);

  const isDataChanged = (a: UpdatedProfileData, b: UpdatedProfileData | null) =>
    JSON.stringify(a) !== JSON.stringify(b);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!initialData) throw new Error('No initial data');

      // Payout validation (tutor-only)
      if (role === 'tutor') {
        if (updatedData.payoutMethod === 'mpesa') {
          if (!updatedData.mpesaPhoneNumber || !MPESA_REGEX.test(updatedData.mpesaPhoneNumber)) {
            throw new Error('Valid M-Pesa phone number is required for KES payouts.');
          }
        } else if (updatedData.payoutMethod === 'wise') {
          if (!updatedData.wiseEmail || !EMAIL_REGEX.test(updatedData.wiseEmail)) {
            throw new Error('A valid Wise account email is required for USD payouts.');
          }
        } else {
          throw new Error('Choose Wise or M-Pesa as your payout method.');
        }
      }

      // Uploads
      if (isDev) {
        console.debug('🧩 useManageProfileForm → starting upload prep', {
          hasToken: !!token,
          backendUrl,
          gallerySlots: updatedData.gallery.length,
          hasVideoFile: !isString(updatedData.video) && !!updatedData.video,
          hasVideoUrl: isString(updatedData.video) && !!updatedData.video,
        });
      }

      const rawGalleryResults = await Promise.all(
        updatedData.gallery.map(async (img, idx) => {
          if (!img) return null;
          if (isString(img)) {
            if (/^https?:\/\//i.test(img)) {
              if (isDev) console.debug(`📸 gallery[${idx}] kept as URL`, img);
              return img;
            }
            if (isDev) console.debug(`⬆️ gallery[${idx}] uploading dataURL/string…`);
            return uploadAsset(backendUrl!, token!, img, 'image');
          }
          if (isDev) console.debug(`⬆️ gallery[${idx}] uploading file-like…`);
          return uploadAsset(backendUrl!, token!, img as any, 'image');
        })
      );

      const finalGallery = rawGalleryResults.filter((u): u is string => !!u);
      if (isDev) console.debug('📦 gallery upload done → count:', finalGallery.length);

      // Prefer undefined (not null) when no video
      let finalVideo: string | undefined;
      if (!updatedData.video) {
        finalVideo = undefined;
      } else if (isString(updatedData.video)) {
        finalVideo = updatedData.video || undefined;
      } else {
        // file-like object; upload directly
        finalVideo = await uploadAsset(backendUrl!, token!, updatedData.video as any, 'video');
      }

      const computedCurrency: PayoutCurrency =
        updatedData.payoutMethod === 'mpesa' ? 'KES' : 'USD';

      // 🔑 Age is now *optional* – only send if > 0
      const payload: UpdateProfilePayload = {
        name: updatedData.name ?? '',
        country: updatedData.country,
        schoolGrade: updatedData.schoolGrade,
        languages: Object.keys(updatedData.languages).filter(
          (l) => updatedData.languages[l as keyof typeof updatedData.languages]
        ),
        pricing: updatedData.pricing,
        recommended: updatedData.recommended,
        ...(updatedData.age && updatedData.age > 0
          ? { age: String(updatedData.age) }
          : {}),
        ...(role === 'tutor'
          ? {
              gallery: finalGallery,
              video: finalVideo,
              status: updatedData.status,
              notifications: updatedData.notifications,
              experienceLevel: updatedData.experienceLevel,
              category: updatedData.category,
              payoutCurrency: computedCurrency,
              payoutMethod: updatedData.payoutMethod,
              mpesaPhoneNumber:
                updatedData.payoutMethod === 'mpesa' ? updatedData.mpesaPhoneNumber : undefined,
              wiseEmail:
                updatedData.payoutMethod === 'wise' ? updatedData.wiseEmail?.trim() : undefined,
              description: {
                bio: updatedData.bio ?? '',
                expertise: updatedData.expertise,
                teachingStyle: updatedData.teachingStyle,
              },
            }
          : {}),
      };

      if (isDev) {
        console.debug('🔗 useManageProfileForm → backendUrl:', backendUrl);
        console.debug('🔐 useManageProfileForm → token(short):', short(token));
        console.debug('📤 useManageProfileForm → payload being sent:', JSON.stringify(payload, null, 2));
      }

      const res = await apiUpdateProfile(backendUrl!, token!, payload);

      if (isDev) {
        console.debug('📥 response status:', res?.status);
        try {
          console.debug('📥 response data keys:', Object.keys(res?.data ?? {}));
        } catch {}
      }

      if (res.status !== 200) throw new Error('Failed to update profile');
      return res.data;
    },
    onSuccess: async (data: any) => {
      const serverMsg = (data && (data.message || data.msg)) || 'Profile updated successfully!';
      notify.success(serverMsg);

      setInitialData(updatedData);
      refreshProfile?.();

      await queryClient.invalidateQueries({ queryKey: ['myProfile', token] });
      await queryClient.refetchQueries({ queryKey: ['myProfile', token] });

      navigate('/profile/me');
    },
    onError: (err: unknown) => {
      const anyErr = err as { response?: { status?: number; data?: any }; message?: string };
      const msg =
        anyErr?.response?.data?.message ||
        anyErr?.response?.data?.error ||
        anyErr?.message ||
        'Failed to update profile.';
      if (isDev) {
        console.error('❌ useManageProfileForm → API error:', {
          status: anyErr?.response?.status,
          data: anyErr?.response?.data,
        });
      }
      notify.error(msg);
    },
  });

  /* ----------------------------- Handlers ---------------------------- */

  const handleInputChange = (
    field: keyof UpdatedProfileData,
    input: string | number | boolean | { target?: { value?: unknown } } | undefined
  ) => {
    const valueRaw = valOf(input);
    const next =
      typeof (updatedData as any)[field] === 'boolean'
        ? toBool(valueRaw)
        : typeof (updatedData as any)[field] === 'number'
        ? Number(valueRaw) || 0
        : valueRaw;

    setUpdatedData((prev) => ({ ...prev, [field]: next as any }));
  };

  const handleSearch = (input: string | { target?: { value?: unknown } }) => {
    const term = valOf(input).toLowerCase();
    setSearchResults(availableProfiles.filter((p) => p.name.toLowerCase().includes(term)));
  };

  const handlePricingChange = (
    field: keyof UpdatedProfileData['pricing'],
    value: string | number
  ) => {
    const num = typeof value === 'number' ? value : Number(valOf(value));
    setUpdatedData((prev) => ({ ...prev, pricing: { ...prev.pricing, [field]: num || 0 } }));
  };

  const handleLanguageSelect = (language: string) => {
    setUpdatedData((prev) => ({
      ...prev,
      languages: { ...prev.languages, [language]: !prev.languages[language] },
    }));
  };

  const handleAddRecommendation = (id: string) => {
    setUpdatedData((prev) => ({ ...prev, recommended: [...prev.recommended, id] }));
  };

  const handleRemoveRecommendation = (id: string) => {
    setUpdatedData((prev) => ({
      ...prev,
      recommended: prev.recommended.filter((pid) => pid !== id),
    }));
  };

  const handleExpertiseSelect = (opt: string) => {
    setUpdatedData((prev) => ({
      ...prev,
      expertise: prev.expertise.includes(opt)
        ? prev.expertise.filter((e) => e !== opt)
        : [...prev.expertise, opt],
    }));
  };

  const handleTeachingStyleSelect = (style: string) => {
    setUpdatedData((prev) => ({
      ...prev,
      teachingStyle: prev.teachingStyle.includes(style)
        ? prev.teachingStyle.filter((s) => s !== style)
        : [...prev.teachingStyle, style],
    }));
  };

  /**
   * Set a gallery slot to a value:
   * - string URL (existing)
   * - base64/dataURL string (will be uploaded)
   * - file-like object (web File or RN asset)
   */
  const setGalleryItem = (index: number, value: string | FileLike | null) => {
    setUpdatedData((prev) => {
      const g = [...prev.gallery];
      g[index] = value as any;
      return { ...prev, gallery: g };
    });
  };

  /**
   * Set the profile video.
   * On web, if you want duration validation, call with { value, maxSeconds }.
   * On native, pass the file-like directly (validation skipped).
   */
  const setVideo = async (
    value: string | FileLike | null,
    opts?: { maxSeconds?: number }
  ) => {
    if (!value) {
      setUpdatedData((prev) => ({ ...prev, video: '' }));
      return;
    }

    const maxSeconds = opts?.maxSeconds ?? 30;

    // Optional web-only duration check
    const canCheckDuration =
      typeof document !== 'undefined' &&
      typeof URL !== 'undefined' &&
      !!(document as any).createElement;

    if (canCheckDuration && value && typeof value !== 'string') {
      try {
        const blob = value as Blob;
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          const vid = document.createElement('video');
          vid.preload = 'metadata';
          vid.onloadedmetadata = () => {
            const dur = Number.isFinite(vid.duration) ? vid.duration : 0;
            URL.revokeObjectURL(url);
            if (dur > maxSeconds)
              reject(new Error(`Video too long (${dur.toFixed(1)}s). Must be ≤${maxSeconds}s.`));
            else resolve();
          };
          vid.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(); // ignore length if we can't read metadata
          };
          vid.src = url;
        });
      } catch (e) {
        notify.error((e as Error).message);
        return;
      }
    }

    setUpdatedData((prev) => ({ ...prev, video: value as any }));
  };

  const handleDeleteImage = (index: number) => {
    if (!profile?.id) return;
    const url = updatedData.gallery[index];
    if (typeof url !== 'string') return;
    apiDeleteGalleryImage(backendUrl!, token!, profile.id, url)
      .then(() => {
        setUpdatedData((prev) => {
          const g = [...prev.gallery];
          g[index] = null;
          return { ...prev, gallery: g };
        });
        notify.success('Image deleted successfully.');
      })
      .catch(() => notify.error('Failed to delete image.'));
  };

  const handleDeleteVideo = () => {
    if (!profile?.id || typeof updatedData.video !== 'string') return;
    apiDeleteVideo(backendUrl!, token!, profile.id, updatedData.video)
      .then(() => {
        setUpdatedData((prev) => ({ ...prev, video: '' }));
        notify.success('Video deleted successfully.');
      })
      .catch(() => notify.error('Failed to delete video.'));
  };

  const handleToggleNotifications = () => {
    setUpdatedData((prev) => ({ ...prev, notifications: !prev.notifications }));
  };

  const handleSubmit = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (!isDataChanged(updatedData, initialData)) {
      notify.info('No changes detected');
      return;
    }
    updateMutation.mutate();
  };

  return {
    role,
    updatedData,
    setUpdatedData,
    availableProfiles,
    searchResults,

    // helpful flags for UI
    isProfileLoading,
    isAvailableLoading,
    isUploading: updateMutation.isPending,

    // field handlers (agnostic)
    handleInputChange,
    handleExpertiseSelect,
    handleLanguageSelect,
    handleSearch,
    handleAddRecommendation,
    handleRemoveRecommendation,
    handlePricingChange,
    handleToggleNotifications,
    handleTeachingStyleSelect,

    // media handlers (agnostic)
    setGalleryItem, // (index, string|fileLike|null)
    setVideo,       // (value, { maxSeconds? })

    // destructive ops
    handleDeleteImage,
    handleDeleteVideo,

    handleSubmit,
  };
};

export default useManageProfileForm;

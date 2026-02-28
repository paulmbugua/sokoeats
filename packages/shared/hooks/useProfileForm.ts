// packages/shared/hooks/useProfileForm.ts
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import useAppQuery from './useAppQuery';
import axios from 'axios';
import {
  ProfilePayload,
  Role,
  UploadAsset,
  PayoutCurrency,
  PayoutMethod,
} from '@myhandymanapp/shared/types';
import { fetchUserRole, createProfileJson } from '@myhandymanapp/shared/api/profileApi';
import { uploadAsset } from '@myhandymanapp/shared/api/uploadAsset';
import { requestUploadPresign, completeUpload } from '@myhandymanapp/shared/api/uploadApi';
import { useShopContext } from '@myhandymanapp/shared/context';

export interface UseProfileFormOptions {
  onSuccess?: () => void;
  token?: string;
  /** Provide a notifier to keep this hook UI-agnostic */
  notify?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const MPESA_REGEX = /^(?:07|2547|\+2547|01|2541|\+2541)\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

const useProfileForm = (options?: UseProfileFormOptions) => {
  const { onSuccess, token: tokenProp, notify } = options ?? {};

  const {
    token: contextToken,
    refreshProfile,
    backendUrl,
    role: ctxRole,
    orgUser,
    orgLearner,
  } = useShopContext() as any;

  const token = tokenProp ?? contextToken ?? '';

  // ───────────────────────── Role: backend + context ─────────────────────────
  const {
    data: backendRole,
    isLoading: isRoleLoadingRaw,
    error: roleError,
  } = useAppQuery<Role, Error>(
    ['userRole', token],
    async () => {
      const r = await fetchUserRole(backendUrl, token);
      return r as Role;
    },
    { enabled: Boolean(token && backendUrl) }
  );

  // Local derived role used by the UI + payloads
  const [role, setRole] = useState<'tutor' | 'student' | ''>(() => {
    if (ctxRole === 'tutor') return 'tutor';
    if (ctxRole === 'student' || ctxRole === 'learner') return 'student';
    if (orgLearner) return 'student';
    if (orgUser) return 'tutor';
    return '';
  });

  // Recompute role whenever backend or context change
  useEffect(() => {
    let resolved: 'tutor' | 'student' | '' = '';

    // 1) Prefer what the backend explicitly says
    if (backendRole === 'tutor') resolved = 'tutor';
    else if (backendRole === 'student' || backendRole === 'learner') resolved = 'student';

    // 2) Fallbacks: context role + org-user/learner hints
    if (!resolved) {
      if (ctxRole === 'tutor') resolved = 'tutor';
      else if (ctxRole === 'student' || ctxRole === 'learner') resolved = 'student';
      else if (orgLearner) resolved = 'student';
      else if (orgUser) resolved = 'tutor';
    }

    if (resolved && resolved !== role) {
      setRole(resolved);
    }
  }, [backendRole, ctxRole, orgLearner, orgUser, role]);

  // Only "loading" if we still don't have a resolved role
  const isRoleLoading = !role && isRoleLoadingRaw;

  useEffect(() => {
    if (roleError) {
      console.error('useProfileForm → roleError:', roleError);
      notify?.('Error fetching user role', 'error');
    }
  }, [roleError, notify]);

  // Small dev-only debug helper so you can see why role might be missing
  useEffect(() => {
    if (!isDev) return;
    console.debug('[useProfileForm] role-debug', {
      token: !!token,
      backendRole,
      ctxRole,
      orgUser: !!orgUser,
      orgLearner: !!orgLearner,
      resolvedRole: role,
    });
  }, [token, backendRole, ctxRole, orgUser, orgLearner, role]);

  // ───────────────────────────── Form state ─────────────────────────────
  const [name, setName] = useState('');
  const [age, setAge] = useState(''); // now optional, purely for UI
  const [languages, setLanguages] = useState<Record<string, boolean>>({
    English: false,
    Swahili: false,
    French: false,
    Spanish: false,
    German: false,
  });

  const [category, setCategory] = useState('');
  const [bio, setBio] = useState('');
  const [expertise, setExpertise] = useState<string[]>([]);
  const [teachingStyle, setTeachingStyle] = useState<string[]>([]);
  const [country, setCountry] = useState(''); // ISO-3166 alpha-2, e.g. 'KE'
  const [schoolGrade, setSchoolGrade] = useState(''); // free text like "Grade 7 / Form 2"
  const [pricing, setPricing] = useState({
    privateSession: '',
    groupSession: '',
    lecture: '',
    workshop: '',
  });

  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('wise');
  const payoutCurrency: PayoutCurrency = payoutMethod === 'mpesa' ? 'KES' : 'USD';

  const [images, setImages] = useState<(UploadAsset | File | null)[]>([null, null, null, null]);
  const [video, setVideo] = useState<UploadAsset | File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);

  const [step, setStep] = useState<'idle' | 'uploading' | 'creating' | 'done' | 'bg-video'>('idle');

  const handleLanguageSelect = (language: string) =>
    setLanguages((prev) => ({ ...prev, [language]: !prev[language] }));

  const handlePricingChange = (field: keyof typeof pricing, value: string) =>
    setPricing((prev) => ({ ...prev, [field]: value }));

  const handleVideoChange = (asset: UploadAsset | File) => {
    if ('duration' in asset && asset.duration != null) {
      const raw = asset.duration as number;
      const durSec = raw > 1000 ? raw / 1000 : raw;
      if (durSec > 30) throw new Error('Video must be 30 seconds or shorter');
    }
    setVideo(asset);
    if ('uri' in asset) setVideoPreview((asset as any).uri);
    else if (typeof window !== 'undefined' && 'createObjectURL' in URL) {
      setVideoPreview(URL.createObjectURL(asset as File));
    } else {
      setVideoPreview(null);
    }
  };

  const handleRemoveVideo = () => {
    setVideo(null);
    setVideoPreview(null);
  };

  const [wiseEmail, setWiseEmail] = useState('');
  const [mpesaPhoneNumber, setMpesaPhoneNumber] = useState('');

  // ───────────────────────────── Mutation ─────────────────────────────
  const mutation = useMutation<any, Error, void>({
    mutationFn: async () => {
      if (!role) throw new Error('Role not loaded');

      const selectedLanguages = Object.keys(languages).filter((l) => languages[l]);

      // packages/shared/hooks/useProfileForm.ts

      const uploadImages = async (): Promise<string[]> => {
        if (role !== 'tutor') return [];

        const valid = images.filter((i): i is UploadAsset | File => i !== null);
        if (valid.length === 0) {
          throw new Error('At least one profile image is required.');
        }

        return Promise.all(
          valid.map(async (file) => {
            let input: any;

            if (file instanceof File) {
              // Web: keep File as-is
              input = file;
            } else if ((file as any).uri) {
              // Native UploadAsset: KEEP uri + name + type so mimetype is correct
              const ua = file as UploadAsset;
              input = {
                uri: ua.uri,
                name: ua.name || `profile-${Date.now()}.jpg`,
                type: ua.type || 'image/jpeg',
              };
            } else if ((file as any).url) {
              // In case we ever store a remote URL
              input = (file as any).url;
            } else {
              throw new Error('Invalid image asset.');
            }

            // Cast to any to keep TS happy with the web shim (string | File)
            return uploadAsset(backendUrl, token, input as any, 'image');
          })
        );
      };

      setStep('uploading');
      const gallery = await uploadImages();

      if (role === 'tutor') {
        if (payoutMethod === 'mpesa') {
          if (!MPESA_REGEX.test(mpesaPhoneNumber)) {
            throw new Error('Valid M-Pesa phone number is required for KES payouts.');
          }
        } else if (payoutMethod === 'wise') {
          if (!EMAIL_REGEX.test(wiseEmail)) {
            throw new Error('A valid Wise account email is required for USD payouts.');
          }
        }
      }

      const toNumber = (v: string) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      // 🔑 Age is now *optional* in the payload
      const payload: ProfilePayload = {
        role: role as Role,
        name: name.trim(),
        languages: selectedLanguages,
        country,
        schoolGrade,
        ...(age && age.trim() ? { age: Number(age) } : {}),
        ...(role === 'tutor' && {
          category,
          description: { bio, expertise, teachingStyle },
          pricing: {
            privateSession: toNumber(pricing.privateSession),
            groupSession: toNumber(pricing.groupSession),
            lecture: toNumber(pricing.lecture),
            workshop: toNumber(pricing.workshop),
          },
          payoutCurrency,
          payoutMethod,
          ...(payoutMethod === 'mpesa' && { mpesaPhoneNumber }),
          ...(payoutMethod === 'wise' && { wiseEmail: wiseEmail.trim() }),
          gallery,
        }),
      };

      if (isDev) {
        try {
          console.log('🔎 useProfileForm → payload (no video):', JSON.stringify(payload, null, 2));
        } catch {}
      }

      setStep('creating');
      let res;
      try {
        res = await createProfileJson(backendUrl, token, payload);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
          if (isDev) {
            console.error('❌ useProfileForm → error response:', err.response.data);
          }
          throw new Error(err.response.data.message);
        }
        throw err;
      }

      if (res.status !== 201) throw new Error(`Unexpected status: ${res.status}`);

      // Background video upload for tutors
      if (role === 'tutor' && video) {
        setStep('bg-video');
        (async () => {
          try {
            let blobOrFile: File | Blob | null = null;
            if (video instanceof File) blobOrFile = video;
            else {
              const src = (video as any).uri || (video as any).url;
              if (src) {
                const resp = await fetch(src);
                blobOrFile = await resp.blob();
              }
            }
            if (!blobOrFile) return;

            const sizeBytes =
              blobOrFile instanceof File ? blobOrFile.size : (blobOrFile as Blob).size;
            const presign = await requestUploadPresign(backendUrl, token, 'video', {
              filename: blobOrFile instanceof File ? blobOrFile.name : 'intro.mp4',
              contentType: blobOrFile instanceof File ? blobOrFile.type : 'video/mp4',
              sizeBytes,
            });

            const putRes = await fetch(presign.uploadUrl, {
              method: 'PUT',
              headers: { ...(presign.headers || {}) },
              body: blobOrFile,
            });
            if (!putRes.ok) {
              throw new Error(`Upload failed (${putRes.status})`);
            }

            const { url: videoUrl } = await completeUpload(backendUrl, token, {
              provider: 'r2',
              bucket: presign.bucket,
              objectPath: presign.objectPath,
              kind: 'video',
            });

            await axios.patch(
              `${backendUrl}/api/profile/video`,
              { video: videoUrl },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            notify?.('Your intro video has been processed.', 'success');
          } catch (bgErr: any) {
            console.error('Background video upload failed:', bgErr);
            notify?.(
              'Video upload failed in background. You can re-upload from your profile.',
              'error'
            );
          } finally {
            setStep('done');
          }
        })();
      } else {
        setStep('done');
      }

      return res.data;
    },

    onSuccess: () => {
      notify?.('Profile created successfully!', 'success');
      refreshProfile?.();
      onSuccess?.();
      setTimeout(() => {
        if (step !== 'bg-video') setStep('idle');
      }, 600);
    },

    onError: (err: Error) => {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message || err.message
        : err.message;
      console.error('useProfileForm error:', msg);
      notify?.(msg, 'error');
      setStep('idle');
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault?.();
    mutation.mutate();
  };

  return {
    role,
    isRoleLoading,
    roleError,
    name,
    setName,
    age,
    setAge,
    languages,
    handleLanguageSelect,
    country,
    setCountry,
    schoolGrade,
    setSchoolGrade,
    category,
    setCategory,
    bio,
    setBio,
    expertise,
    setExpertise,
    teachingStyle,
    setTeachingStyle,
    pricing,
    handlePricingChange,
    payoutCurrency,
    payoutMethod,
    setPayoutMethod,
    wiseEmail,
    setWiseEmail,
    mpesaPhoneNumber,
    setMpesaPhoneNumber,
    images,
    setImages,
    video,
    videoPreview,
    handleVideoChange,
    handleRemoveVideo,
    loading: mutation.isPending,
    step,
    submitError: mutation.error,
    handleSubmit,
  };
};

export default useProfileForm;
export { useProfileForm };

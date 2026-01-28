import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  StatusBar,
  findNodeHandle,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfileForm } from '@mytutorapp/shared/hooks';
import type { UploadAsset } from '@mytutorapp/shared/types';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';

import tw from '../../tailwind';
import { useThemePref } from '../theme/ThemeContext';
import SelectField from './SelectField.native';

type RootStackParamList = { Home: undefined };
type ViewRef = React.MutableRefObject<View | null>;

type PricingKeys = 'privateSession' | 'groupSession' | 'workshop' | 'lecture';
const pricingFields: PricingKeys[] = ['privateSession', 'groupSession', 'workshop', 'lecture'];

/** Match web min/max ranges (tokens == USD) */
const tokenRanges: Record<PricingKeys, { min: number; max: number }> = {
  privateSession: { min: 5, max: 50 },
  groupSession: { min: 5, max: 50 },
  workshop: { min: 5, max: 100 },
  lecture: { min: 5, max: 100 },
};

function isUploadAsset(obj: unknown): obj is UploadAsset {
  return !!obj && typeof (obj as UploadAsset).uri === 'string';
}

/** Category options to mirror web (while keeping native styling) */
const CATEGORIES: string[] = [
  'Mathematics',
  'Sciences',
  'Languages',
  'Arts',
  'Social Studies',
  'Technology & Computing',
  'Business & Economics',
  'Wellness & PE',
];


// Try to get a proper image MIME (like image/jpeg) from the asset
const guessImageMime = (asset: ImagePicker.ImagePickerAsset): string => {
  const raw = (asset as any).mimeType as string | undefined;

  if (raw && raw.includes('/')) {
    return raw; // e.g. image/jpeg, image/png
  }

  // Fallback: guess from URI extension
  const match = asset.uri.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  const ext = match?.[1]?.toLowerCase() ?? 'jpg';

  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
};

// Same idea for video (for future safety)
const guessVideoMime = (asset: ImagePicker.ImagePickerAsset): string => {
  const raw = (asset as any).mimeType as string | undefined;
  if (raw && raw.includes('/')) return raw;
  return 'video/mp4';
};

/* ───────────────────────────── helpers ───────────────────────────── */
const toSeconds = (raw?: number | null) => {
  const n = Number(raw ?? 0);
  return n > 1000 ? n / 1000 : n;
};
const isEmail = (s: string) => /\S+@\S+\.\S+/.test(s);
const isMpesaLike = (s: string) => /^\+?2547\d{8}$/.test(s) || /^07\d{8}$/.test(s);

/** Error labels to build banner exactly like web */
type Errors = Record<string, string>;
const labelFor: Record<string, string> = {
  role: 'Your Role',
  name: 'Name',
  // age removed
  country: 'Country',
  schoolGrade: 'School Grade / Year / Level',
  languages: 'Languages',
  category: 'Subject/Skill Category',
  payoutMethod: 'Payout Method',
  payoutCurrency: 'Payout Currency',
  wiseEmail: 'Wise Email',
  mpesaPhoneNumber: 'M-Pesa Phone Number',
  privateSession: 'Private session rate',
  groupSession: 'Group session rate',
  workshop: 'Workshop rate',
  lecture: 'Lecture rate',
};

export default function CreateProfileFormNative() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useThemePref();

  const placeholderColor = resolvedScheme === 'dark' ? '#9CA3AF' : '#64748B';

  // ScrollView + section refs (for scroll-to-error behavior)
  const scrollRef = useRef<ScrollView>(null);

  const nameWrapRef = useRef<View>(null);
  const countryWrapRef = useRef<View>(null);
  const schoolGradeWrapRef = useRef<View>(null);
  const languagesWrapRef = useRef<View>(null);
  const categoryWrapRef = useRef<View>(null);
  const wiseWrapRef = useRef<View>(null);
  const mpesaWrapRef = useRef<View>(null);

  const pricingRefs: Record<PricingKeys, ViewRef> = {
    privateSession: useRef<View>(null),
    groupSession: useRef<View>(null),
    workshop: useRef<View>(null),
    lecture: useRef<View>(null),
  };

  const refsMap: Record<string, ViewRef> = {
    name: nameWrapRef,
    // age removed
    country: countryWrapRef,
    schoolGrade: schoolGradeWrapRef,
    languages: languagesWrapRef,
    category: categoryWrapRef,
    wiseEmail: wiseWrapRef,
    mpesaPhoneNumber: mpesaWrapRef,
    privateSession: pricingRefs.privateSession,
    groupSession: pricingRefs.groupSession,
    workshop: pricingRefs.workshop,
    lecture: pricingRefs.lecture,
  };

  // Core form hook (shared with web)
  const {
    role,

    // basics
    name,
    setName,
    // age removed from UI
    languages,
    handleLanguageSelect,

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

    // media
    images,
    setImages,
    videoPreview,
    handleVideoChange,
    handleRemoveVideo,

    // payout (currency comes from the hook)
    payoutCurrency,
    payoutMethod,
    setPayoutMethod,
    wiseEmail,
    setWiseEmail,
    mpesaPhoneNumber,
    setMpesaPhoneNumber,

    // geo + grade
    country,
    setCountry,
    schoolGrade,
    setSchoolGrade,

    // submit + step
    loading,
    handleSubmit,
    step,
  } = useProfileForm({
    onSuccess: () => navigation.navigate('Home'),
  });

  // Banner + inline error state (parity with web)
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string>('');

  const setFieldError = (key: string, message: string) => {
    setErrors((prev) => ({ ...prev, [key]: message }));
  };
  const clearFieldError = (key: string) => {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };
  const buildBannerFromErrors = (errs: Errors) => {
    const keys = Object.keys(errs);
    if (!keys.length) return '';
    const items = keys.map((k) => labelFor[k] || k);
    return `Please complete: ${items.join(' • ')}.`;
  };

  useEffect(() => {
  if (role === 'tutor' && Array.isArray(expertise) && expertise.length === 0) {
    setExpertise(['Homework Help']); // soft default (parity with web)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [role]);


  // Ask once for perms (camera + library)
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (cam.status !== 'granted' || lib.status !== 'granted') {
          Alert.alert(
            'Permissions required',
            'Camera and media library access are needed for photos & video.'
          );
        }
      }
    })();
  }, []);

  /* ---------------------- Media pickers (images) ---------------------- */
  const pickImage = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission required', 'We need access to your photos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (res.canceled) return;
    const a = Array.isArray(res.assets) && res.assets.length > 0 ? res.assets[0] : undefined;
    if (!a) return;

    const mimeType = guessImageMime(a);
    const ext = mimeType.split('/')[1] || 'jpg';
    const fileName = a.fileName ?? `profile-${Date.now()}.${ext}`;

    const upload: UploadAsset = {
      uri: a.uri,
      name: fileName,
      type: mimeType, // ✅ real MIME like image/jpeg
    };

    setImages([upload]);
  };

  /* ---------------------- Media pickers (video) ---------------------- */
  const pickVideo = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission required', 'We need access to your videos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 30,
    });
    if (res.canceled) return;

    const a = Array.isArray(res.assets) && res.assets.length > 0 ? res.assets[0] : undefined;
    if (!a) return;

    const durSec = toSeconds(a.duration ?? undefined);
    if (durSec > 30) {
      Alert.alert('Too long', `Your clip is ${durSec.toFixed(1)}s. Please select ≤ 30s.`);
      return;
    }

    const upload: UploadAsset = {
      uri: a.uri,
      name: a.fileName ?? undefined,
      type: guessVideoMime(a),
      duration: typeof a.duration === 'number' ? a.duration : undefined,
    };
    try {
      handleVideoChange(upload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', msg);
    }
  };

  const recordVideo = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission required', 'We need access to your camera.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 30,
      quality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (res.canceled) return;

    const a = Array.isArray(res.assets) && res.assets.length > 0 ? res.assets[0] : undefined;
    if (!a) return;

    const durSec = toSeconds(a.duration ?? undefined);
    if (durSec > 30) {
      Alert.alert('Too long', `Your recording is ${durSec.toFixed(1)}s. Please record ≤ 30s.`);
      return;
    }

    const upload: UploadAsset = {
      uri: a.uri,
      name: a.fileName ?? undefined,
      type: guessVideoMime(a),
      duration: typeof a.duration === 'number' ? a.duration : undefined,
    };
    try {
      handleVideoChange(upload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', msg);
    }
  };

  /* ---------------------- Derived & validation ---------------------- */
  const languagesSelected = useMemo(() => Object.values(languages).some(Boolean), [languages]);

  // Pricing: do not clamp while typing; validate on submit
  const onPriceChange = useCallback(
    (field: PricingKeys, raw: string) => {
      const clean = raw.replace(/[^\d]/g, '');
      handlePricingChange(field, clean);
      clearFieldError(field);
    },
    [handlePricingChange]
  );

  const scrollToField = (key: string | undefined) => {
    if (!key) return;
    const ref = refsMap[key];
    const view = ref?.current;
    const scrollNode = findNodeHandle(scrollRef.current as any);
    if (!view || !scrollNode) {
      // fallback: show banner at top
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    // Measure relative to the ScrollView and scroll slightly above the field
    (view as any).measureLayout(
      scrollNode,
      (_x: number, y: number) => {
        const offset = Math.max(y - 24, 0);
        scrollRef.current?.scrollTo({ y: offset, animated: true });
      },
      () => {
        // measurement failed — just go to top so the banner is visible
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    );
  };

  const validateForm = (): { ok: boolean; firstKey?: string } => {
    const next: Errors = {};

    // Basic requireds
    if (!name?.trim()) next.name = 'Name is required.';

    // Country
    if (!country) next.country = 'Select your country.';

    // School grade
    if (!schoolGrade?.trim()) {
      next.schoolGrade = 'Enter your grade / year / level.';
    }

    // Languages
    if (!languagesSelected) {
      next.languages = 'Select at least one language.';
    }

    if (role === 'tutor') {
      // Category
      if (!category) {
        next.category = 'Select a subject/skill category.';
      }

      // Payout
      if (payoutMethod === 'mpesa') {
        if (!mpesaPhoneNumber?.trim()) {
          next.mpesaPhoneNumber = 'Enter your M-Pesa phone number.';
        } else if (!isMpesaLike(mpesaPhoneNumber.trim())) {
          next.mpesaPhoneNumber = 'Use format +2547XXXXXXXX or 07XXXXXXXX.';
        }
      } else if (payoutMethod === 'wise') {
        if (!wiseEmail?.trim()) {
          next.wiseEmail = 'Enter your Wise account email.';
        } else if (!isEmail(wiseEmail.trim())) {
          next.wiseEmail = 'Enter a valid email address.';
        }
      }

      // Pricing
      pricingFields.forEach((field) => {
        const raw = (pricing as Record<PricingKeys, string>)[field];
        const { min, max } = tokenRanges[field];
        const n = Number(raw);
        if (raw == null || raw === '') {
          next[field] = `Enter ${labelFor[field]}.`;
        } else if (!Number.isFinite(n)) {
          next[field] = `${labelFor[field]} must be a number.`;
        } else if (n < min || n > max) {
          next[field] = `${labelFor[field]} must be between ${min} and ${max}.`;
        }
      });
    }

    setErrors(next);
    const bannerText = buildBannerFromErrors(next);
    setBanner(bannerText);

    const order: string[] = [
      'name',
      // 'age' removed from validation order
      'country',
      'schoolGrade',
      'languages',
      ...(role === 'tutor'
        ? [
            'category',
            ...(payoutMethod === 'wise' ? ['wiseEmail'] : ['mpesaPhoneNumber']),
            'privateSession',
            'groupSession',
            'workshop',
            'lecture',
          ]
        : []),
    ];
    const firstKey = order.find((k) => k in next);

    // Always reveal the banner; if a field exists, jump to it.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (firstKey) setTimeout(() => scrollToField(firstKey), 60);

    return { ok: Object.keys(next).length === 0, firstKey };
  };

  const onSubmitPress = () => {
    setErrors({});
    setBanner('');
    const { ok } = validateForm();
    if (!ok) return;
    // shared hook expects a synthetic FormEvent on web; on native we just pass an empty object
    handleSubmit({} as React.FormEvent);
  };

  /* ---------------------- Intro video preview (expo-video) ---------------------- */
  const previewPlayer = useVideoPlayer(null, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    (async () => {
      try {
        await previewPlayer.pause();
        await previewPlayer.replace(videoPreview || null);
      } catch {
        // ignore
      }
    })();
  }, [videoPreview, previewPlayer]);

  /* ------------------------------- UI styles ------------------------------- */

  const card = tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4 gap-6`;
  const label = tw`text-base text-[#49739c] dark:text-gray-200`;
  const smallLabel = tw`text-sm text-[#49739c] dark:text-gray-300`;

  const inputBase = tw`w-full p-3 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] text-[#0d141c] dark:text-white text-base`;
  const invalidBorder = tw`border-red-500`;

  const chipOn = tw`px-3 py-1 rounded-full bg-pink-500 border border-pink-500`;
  const chipOff = tw`px-3 py-1 rounded-full bg-[#e7edf4] dark:bg-[#172534] border border-transparent`;

  return (
    <SafeAreaView
      style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <StatusBar
        barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={resolvedScheme === 'dark' ? '#0b1016' : '#f8fafc'}
      />
      <ScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        contentContainerStyle={[tw`px-4 py-4`, { paddingBottom: Math.max(insets.bottom + 32, 32) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={card}>
          <Text style={tw`text-2xl font-bold text-center text-[#0d141c] dark:text-white`}>
            Create Your Profile
          </Text>

          {/* Top error banner (parity with web) */}
          {!!banner && (
            <View
              style={tw`rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 p-3`}
            >
              <Text style={tw`text-red-800 dark:text-red-200`}>{banner}</Text>
            </View>
          )}

          {step === 'bg-video' && (
            <Text style={tw`text-sm text-[#49739c] dark:text-gray-300`}>
              Uploading your intro video in the background… you can continue using the app.
            </Text>
          )}

          {/* Role display */}
          {role ? (
            <View style={tw`gap-2`}>
              <Text style={label}>Your Role</Text>
              <Text style={inputBase}>{role}</Text>
            </View>
          ) : (
            <Text style={tw`text-[#49739c] dark:text-gray-300`}>Fetching your role…</Text>
          )}

          {/* Name */}
          <View ref={nameWrapRef} style={tw`gap-2`}>
            <Text style={label}>Name</Text>
            <TextInput
              placeholder="Your Name"
              value={name}
              onChangeText={(v) => {
                setName(v);
                clearFieldError('name');
              }}
              placeholderTextColor={placeholderColor}
              style={[inputBase, errors.name ? invalidBorder : null]}
            />
            {!!errors.name && (
              <Text style={tw`text-sm text-red-600 dark:text-red-400`}>{errors.name}</Text>
            )}
          </View>

          {/* Age section removed */}

          {/* Country */}
          <View ref={countryWrapRef}>
            <SelectField
              label="Country"
              value={country || ''}
              placeholder="Select your country"
              options={COUNTRIES.map((c) => ({
                label: c.name,
                value: c.code,
              }))}
              onChange={(v) => {
                setCountry(v);
                clearFieldError('country');
              }}
              error={errors.country}
            />
          </View>

          {/* School Grade / Year / Level */}
          <View ref={schoolGradeWrapRef} style={tw`gap-2`}>
            <Text style={label}>School Grade / Year / Level - You Teach</Text>
            <TextInput
              placeholder="e.g., Grade 7, Form 2, Year 10, Freshman …"
              value={schoolGrade}
              onChangeText={(v) => {
                setSchoolGrade(v);
                clearFieldError('schoolGrade');
              }}
              placeholderTextColor={placeholderColor}
              style={[inputBase, errors.schoolGrade ? invalidBorder : null]}
            />
            {!!errors.schoolGrade && (
              <Text style={tw`text-sm text-red-600 dark:text-red-400`}>{errors.schoolGrade}</Text>
            )}
          </View>

          {/* Language chips */}
          <View ref={languagesWrapRef} style={tw`gap-2`}>
            <Text style={label}>Select Languages You Speak</Text>
            <View
              style={[
                tw`flex-row flex-wrap gap-2 rounded-xl p-2`,
                errors.languages ? tw`border border-red-500` : null,
              ]}
            >
              {Object.keys(languages).map((lang) => {
                const on = languages[lang];
                return (
                  <TouchableOpacity
                    key={lang}
                    onPress={() => {
                      handleLanguageSelect(lang);
                      clearFieldError('languages');
                    }}
                    style={on ? chipOn : chipOff}
                  >
                    <Text style={on ? tw`text-white` : tw`text-[#49739c] dark:text-gray-300`}>
                      {lang}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!errors.languages && (
              <Text style={tw`text-sm text-red-600 dark:text-red-400`}>{errors.languages}</Text>
            )}
          </View>

          {/* Tutor-only extras */}
          {role === 'tutor' && (
            <View style={tw`gap-4 mt-2`}>
              {/* Category */}
              <View ref={categoryWrapRef}>
                <SelectField
                  label="Select Subject or Skill Category"
                  value={category || ''}
                  placeholder="Select a category…"
                  options={CATEGORIES.map((c) => ({
                    label: c,
                    value: c,
                  }))}
                  onChange={(v) => {
                    setCategory(v);
                    clearFieldError('category');
                  }}
                  error={errors.category}
                />
              </View>

              {/* Payout Preferences */}
              <View style={tw`gap-3 border-t border-slate-200 dark:border-white/10 pt-4`}>
                <Text style={tw`text-base font-semibold text-[#49739c] dark:text-gray-200`}>
                  Payout Preferences
                </Text>

                {/* Payout Method */}
                <View>
                  <SelectField
                    label="Payout Method"
                    value={payoutMethod || 'wise'}
                    options={[
                      { label: 'Wise (USD)', value: 'wise' },
                      { label: 'M-Pesa (KES)', value: 'mpesa' },
                    ]}
                    onChange={(v) => {
                      setPayoutMethod(v as 'wise' | 'mpesa');
                      clearFieldError('wiseEmail');
                      clearFieldError('mpesaPhoneNumber');
                    }}
                  />
                </View>

                {/* Payout Currency */}
                <View>
                  <Text style={[smallLabel, tw`mb-1`]}>Payout Currency</Text>
                  <Text style={inputBase}>{payoutCurrency}</Text>
                  <Text style={tw`text-xs mt-1 text-[#49739c] dark:text-gray-300`}>
                    Wise pays in USD to your Wise account. M-Pesa payouts settle in KES.
                  </Text>
                </View>

                {/* Wise / M-Pesa details */}
                {payoutMethod === 'wise' && (
                  <View ref={wiseWrapRef}>
                    <Text style={[smallLabel, tw`mb-1`]}>Wise account email</Text>
                    <TextInput
                      placeholder="you@yourdomain.com"
                      value={wiseEmail}
                      onChangeText={(v) => {
                        setWiseEmail(v);
                        clearFieldError('wiseEmail');
                      }}
                      placeholderTextColor={placeholderColor}
                      style={[inputBase, errors.wiseEmail ? invalidBorder : null]}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    {!!errors.wiseEmail && (
                      <Text style={tw`text-sm text-red-600 dark:text-red-400 mt-1`}>
                        {errors.wiseEmail}
                      </Text>
                    )}
                  </View>
                )}

                {payoutMethod === 'mpesa' && (
                  <View ref={mpesaWrapRef} style={tw`gap-1`}>
                    <Text style={label}>M-Pesa Phone Number</Text>
                    <TextInput
                      placeholder="+2547XXXXXXXX"
                      value={mpesaPhoneNumber}
                      onChangeText={(v) => {
                        setMpesaPhoneNumber(v);
                        clearFieldError('mpesaPhoneNumber');
                      }}
                      placeholderTextColor={placeholderColor}
                      style={[inputBase, errors.mpesaPhoneNumber ? invalidBorder : null]}
                      keyboardType="phone-pad"
                    />
                    {!!errors.mpesaPhoneNumber && (
                      <Text style={tw`text-sm text-red-600 dark:text-red-400`}>
                        {errors.mpesaPhoneNumber}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              {/* Teaching styles */}
              <View style={tw`gap-2`}>
                <Text style={tw`text-base font-semibold text-[#49739c] dark:text-gray-200`}>
                  Teaching Styles
                </Text>
                <View style={tw`flex-row flex-wrap gap-2`}>
                  {['One-on-One', 'Group', 'Workshop', 'Lecture'].map((s) => {
                    const on = teachingStyle.includes(s);
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() =>
                          setTeachingStyle((prev) =>
                            on ? prev.filter((i) => i !== s) : [...prev, s]
                          )
                        }
                        style={on ? chipOn : chipOff}
                      >
                        <Text style={on ? tw`text-white` : tw`text-[#49739c] dark:text-gray-300`}>
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Bio */}
              <View style={tw`gap-2`}>
                <Text style={label}>Bio</Text>
                <TextInput
                  placeholder="A short bio about yourself…"
                  value={bio}
                  onChangeText={setBio}
                  placeholderTextColor={placeholderColor}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={tw`w-full h-24 p-3 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0f1821] text-[#0d141c] dark:text-white text-base`}
                />
              </View>

{/* Expertise */}
<View style={tw`gap-2`}>
  <Text style={label}>Expertise (optional)</Text>

  <View style={tw`flex-row flex-wrap gap-2`}>
    {['Exam Prep', 'Skill Building', 'Homework Help', 'Career Guidance'].map((opt) => {
      const on = expertise.includes(opt);
      return (
        <TouchableOpacity
          key={opt}
          onPress={() =>
            setExpertise((prev) => (on ? prev.filter((x) => x !== opt) : [...prev, opt]))
          }
          style={on ? chipOn : chipOff}
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
        >
          <Text style={on ? tw`text-white` : tw`text-[#49739c] dark:text-gray-300`}>
            {opt}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>

  <Text style={tw`text-xs text-[#49739c] dark:text-gray-300`}>
    This helps learners find you faster. You can skip it for now.
  </Text>
</View>


              {/* Pricing */}
              <View style={tw`gap-4`}>
                <Text style={label}>Set Your Rates (1 token = $1 USD)</Text>
                <View style={tw`flex-row flex-wrap -mx-2`}>
                  {pricingFields.map((field) => {
                    const { min, max } = tokenRanges[field];
                    const value = (pricing as Record<PricingKeys, string>)[field] || '';
                    return (
                      <View ref={pricingRefs[field]} key={field} style={tw`w-1/2 px-2 mb-4`}>
                        <Text style={tw`text-sm text-[#49739c] dark:text-gray-300`}>
                          {field.replace(/([A-Z])/g, ' $1')} (Min: {min} | Max: {max})
                        </Text>
                        <TextInput
                          placeholder={`Enter ${field.replace(/([A-Z])/g, ' $1')} Tokens`}
                          value={value}
                          onChangeText={(t) => onPriceChange(field, t)}
                          keyboardType="numeric"
                          placeholderTextColor={placeholderColor}
                          style={[
                            tw`w-full p-2 rounded-lg bg-slate-50 dark:bg-[#0f1821] text-[#0d141c] dark:text-gray-200 border text-sm border-[#cedbe8] dark:border-white/10`,
                            errors[field] ? tw`border-red-500` : null,
                          ]}
                        />
                        {!!errors[field] && (
                          <Text style={tw`text-xs text-red-600 dark:text-red-400 mt-1`}>
                            {errors[field]}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                <Text style={tw`text-xs text-[#49739c] dark:text-gray-300`}>
                  Tip: For group pricing, enter the price{' '}
                  <Text style={tw`font-bold`}>per learner</Text>.
                </Text>
              </View>

              {/* Profile image */}
              <View style={tw`gap-2`}>
                <Text style={label}>Upload Profile Image</Text>
                <TouchableOpacity
                  onPress={pickImage}
                  style={tw`w-24 h-24 border border-[#cedbe8] dark:border-white/10 items-center justify-center rounded-xl bg-slate-50 dark:bg-[#0f1821] overflow-hidden`}
                >
                  {images[0] && isUploadAsset(images[0]) ? (
                    <Image source={{ uri: images[0].uri }} style={tw`w-full h-full rounded-xl`} />
                  ) : (
                    <Text style={tw`text-xs text-[#49739c] dark:text-gray-300`}>Upload</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Video record/upload + preview */}
              <View style={tw`gap-2`}>
                <Text style={label}>Introduction Video (30s max)</Text>
                <View style={tw`flex-row gap-2`}>
                  <TouchableOpacity
                    onPress={recordVideo}
                    style={tw`bg-pink-500 px-4 py-2 rounded-xl`}
                  >
                    <Text style={tw`text-white`}>Record</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={pickVideo}
                    style={tw`bg-slate-200 dark:bg-[#172534] px-4 py-2 rounded-xl`}
                  >
                    <Text style={tw`text-[#0d141c] dark:text-gray-200`}>Upload</Text>
                  </TouchableOpacity>
                </View>

                {videoPreview && (
                  <View style={tw`gap-2 mt-2`}>
                    <Text style={label}>Preview</Text>
                    <View
                      style={tw`w-28 h-28 border border-[#cedbe8] dark:border-white/10 items-center justify-center rounded-xl bg-slate-50 dark:bg-[#0f1821] overflow-hidden`}
                    >
                      <VideoView
                        player={previewPlayer}
                        style={tw`w-full h-full rounded-xl`}
                        nativeControls
                        contentFit="cover"
                        allowsFullscreen
                        allowsPictureInPicture
                      />
                      <TouchableOpacity
                        onPress={handleRemoveVideo}
                        style={tw`absolute top-1 right-1 bg-red-500 rounded-full px-1`}
                      >
                        <Text style={tw`text-white text-xs`}>X</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            onPress={onSubmitPress}
            disabled={loading}
            style={tw`w-full bg-[#3d99f5] py-3 rounded-lg ${loading ? 'opacity-70' : ''}`}
          >
            <Text style={tw`text-white text-center text-base`}>
              {loading
                ? step === 'uploading'
                  ? 'Uploading images…'
                  : step === 'creating'
                    ? 'Creating profile…'
                    : 'Creating profile…'
                : 'Create Profile'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

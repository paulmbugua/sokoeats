/* eslint-disable prettier/prettier */
// apps/mobile/src/screens/ManageProfileForm.native.tsx

import React, {
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import tw from '../../tailwind';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useShopContext } from '@mytutorapp/shared/context';
import useManageProfileForm from '@mytutorapp/shared/hooks/useManageProfileForm';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';
import type { ChangeEvent } from 'react';
import type { MainStackParamList } from '../navigation/types';
import { uploadAsset } from '@mytutorapp/shared/api/uploadAsset';
import { useThemePref } from '../theme/ThemeContext';

// ⬇️ Shared SelectField
import SelectField, { type Option as SelectOption } from './SelectField.native';

const SUBJECT_CATEGORIES = [
  'Mathematics',
  'Sciences',
  'Languages',
  'Arts',
  'Social Studies',
  'Technology & Computing',
  'Business & Economics',
  'Wellness & PE',
] as const;

const STATUS_OPTIONS = ['Online', 'Offline', 'Busy', 'Free', 'New'] as const;
const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'] as const;

// event shim so we can reuse handleInputChange from the hook
const makeEvent = (value: string): ChangeEvent<any> =>
  ({ target: { value } } as ChangeEvent<any>);

const hasUri = (obj: unknown): obj is { uri: string } =>
  typeof obj === 'object' &&
  obj !== null &&
  'uri' in (obj as any) &&
  typeof (obj as any).uri === 'string';

const resolveAssetUri = (raw: string, backendUrl: string): string => {
  if (!raw) return '';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:')
  ) {
    return raw;
  }
  return raw.startsWith('/') ? `${backendUrl}${raw}` : raw;
};

// token ranges = web
const TOKEN_RANGES = {
  privateSession: { min: 5, max: 50 },
  groupSession: { min: 5, max: 50 },
  lecture: { min: 5, max: 100 },
  workshop: { min: 5, max: 100 },
} as const;
type TokenField = keyof typeof TOKEN_RANGES;

// Sections we can scroll/highlight
type SectionKey =
  | 'personal'
  | 'country'
  | 'school'
  | 'languages'
  | 'category'
  | 'pricing'
  | 'payout';

type ValidationResult =
  | { ok: true }
  | { ok: false; msg: string; focus: SectionKey };

export default function ManageProfileFormNative() {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { backendUrl, token } = useShopContext();
  const { resolvedScheme } = useThemePref();

  // map web-style paths from the hook to native screen names
  const mappedNavigate = useCallback(
    (to: any) => {
      const path =
        typeof to === 'string'
          ? to
          : (to && typeof to === 'object' && (to.pathname || to.path)) || '/';

      switch (path) {
        case '/profile/me':
          navigation.navigate('ProfileSelf');
          break;
        case '/account':
          navigation.navigate('Account', {});
          break;
        case '/':
        case '/home':
          navigation.navigate('Home');
          break;
        default:
          console.warn(
            '[ManageProfileFormNative] Unknown path from useManageProfileForm:',
            path,
          );
          navigation.navigate('Home');
      }
    },
    [navigation],
  );

  const insets = useSafeAreaInsets();
  const FOOTER_OVERLAY_PX = 84;
  const bottomPad = Math.max(24, FOOTER_OVERLAY_PX + insets.bottom);

  const {
    role,
    updatedData,
    setUpdatedData,
    availableProfiles,
    searchResults,
    isUploading,

    // generic inputs
    handleInputChange,

    // toggles / multi-selects
    handleLanguageSelect,
    handleTeachingStyleSelect,
    handleExpertiseSelect,

    // pricing
    handlePricingChange,

    // search + recommendations
    handleSearch,
    handleAddRecommendation,
    handleRemoveRecommendation,

    // media (server-side delete)
    handleDeleteImage,
    handleDeleteVideo,

    // notifications
    handleToggleNotifications,

    // final submit
    handleSubmit,
  } = useManageProfileForm(mappedNavigate as any);

  /* ──────────────────────────────────────────────
     Scroll to section on validation error
  ─────────────────────────────────────────────── */

  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsets = useRef<Partial<Record<SectionKey, number>>>({});
  const [focusSection, setFocusSection] = useState<SectionKey | null>(null);

  const registerSection =
    (key: SectionKey) =>
    (e: any): void => {
      sectionOffsets.current[key] = e.nativeEvent.layout.y;
    };

  const scrollToSection = (key: SectionKey) => {
    const y = sectionOffsets.current[key];
    if (scrollRef.current && typeof y === 'number') {
      scrollRef.current.scrollTo({
        y: Math.max(0, y - 24),
        animated: true,
      });
    }
  };

  // Auto-clear highlight after a short delay
  useEffect(() => {
    if (!focusSection) return;
    const t = setTimeout(() => setFocusSection(null), 2500);
    return () => clearTimeout(t);
  }, [focusSection]);

  /* ──────────────────────────────────────────────
     Native image upload (Option B – pre-upload)
  ─────────────────────────────────────────────── */

  const uploadProfileImageNative = async (
    asset: ImagePicker.ImagePickerAsset,
  ): Promise<string> => {
    if (!backendUrl || !token) {
      throw new Error('Missing backend configuration.');
    }

    const fileLike = {
      uri: asset.uri,
      name:
        (asset as any).fileName ||
        `profile-${Date.now()}.${
          (asset.mimeType || 'image/jpeg').split('/')[1] || 'jpg'
        }`,
      type: asset.mimeType || 'image/jpeg',
    };

    // 👇 Cast fixes TS, runtime still uses uploadAsset.native.ts correctly
    const url = await uploadAsset(backendUrl, token, fileLike as any, 'image');

    return url;
  };

  // image picker with pre-upload
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    try {
      const remoteUrl = await uploadProfileImageNative(asset);
      // store only final URL so the hook skips uploadAsset
      setUpdatedData((prev) => {
        const g = [...prev.gallery];
        g[0] = remoteUrl as any;
        return { ...prev, gallery: g };
      });
    } catch (err: any) {
      console.error('[ManageProfileFormNative] image upload failed', err);
      Alert.alert(
        'Upload failed',
        err?.message || 'Could not upload image. Please try again.',
      );
    }
  };

  const replaceVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 30,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setUpdatedData((prev) => ({ ...prev, video: uri as any }));
  };

  // computed asset URIs
  const gallery0 = updatedData.gallery?.[0];
  const imageUri = useMemo(() => {
    if (typeof gallery0 === 'string')
      return resolveAssetUri(gallery0, backendUrl || '');
    if (hasUri(gallery0)) return gallery0.uri;
    return '';
  }, [gallery0, backendUrl]);

  const videoUri = useMemo(() => {
    if (typeof updatedData.video === 'string')
      return resolveAssetUri(updatedData.video, backendUrl || '');
    if (hasUri(updatedData.video)) return updatedData.video.uri;
    return '';
  }, [updatedData.video, backendUrl]);

  /* ──────────────────────────────────────────────
     Styles (theme-aware, similar to HomePageNative)
  ─────────────────────────────────────────────── */

  const sectionBase = tw`rounded-2xl p-4 mb-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`;
  const sectionError = tw`border-pink-500 shadow-lg shadow-pink-500/20`;
  const inputBase = tw`w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 text-[#0d141c] dark:text-white border border-slate-200 dark:border-white/10 mb-3`;
  const pillOn = tw`px-3 py-1 mr-2 mb-2 rounded-full bg-pink-600`;
  const pillOff = tw`px-3 py-1 mr-2 mb-2 rounded-full bg-slate-200 dark:bg-white/5`;
  const labelText = tw`text-sm font-semibold text-[#0d141c] dark:text-white mb-2`;
  const helperText = tw`text-xs text-slate-600 dark:text-slate-400 mb-2`;

  const placeholderColor =
    resolvedScheme === 'dark' ? '#64748B' : '#94A3B8';
  const selectedColor =
    resolvedScheme === 'dark' ? '#E5E7EB' : '#0F172A';

  /* ──────────────────────────────────────────────
     Select options (for SelectField)
  ─────────────────────────────────────────────── */

  const countryOptions: SelectOption[] = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        value: c.code,
        label: c.name,
      })),
    [],
  );

  const categoryOptions: SelectOption[] = useMemo(
    () =>
      SUBJECT_CATEGORIES.map((cat) => ({
        value: cat,
        label: cat,
      })),
    [],
  );

  const statusOptions: SelectOption[] = useMemo(
    () =>
      STATUS_OPTIONS.map((opt) => ({
        value: opt,
        label: opt === 'Free' ? 'Free Session' : opt,
      })),
    [],
  );

  const experienceOptions: SelectOption[] = useMemo(
    () =>
      EXPERIENCE_LEVELS.map((opt) => ({
        value: opt,
        label: opt,
      })),
    [],
  );

  const payoutMethodOptions: SelectOption[] = useMemo(
    () => [
      { value: 'wise', label: 'Wise (USD)' },
      { value: 'mpesa', label: 'M-Pesa (KES)' },
    ],
    [],
  );

  /* ──────────────────────────────────────────────
     Validation (returns section to focus)
  ─────────────────────────────────────────────── */

  const validateBeforeSubmit = (): ValidationResult => {
    if (!updatedData.name?.trim()) {
      return { ok: false, msg: 'Please enter your name.', focus: 'personal' };
    }

    // age is no longer required / validated

    const hasLanguage = Object.values(updatedData.languages || {}).some(Boolean);
    if (!hasLanguage) {
      return {
        ok: false,
        msg: 'Select at least one language.',
        focus: 'languages',
      };
    }

    if (!updatedData.country) {
      return {
        ok: false,
        msg: 'Please select your country.',
        focus: 'country',
      };
    }

    if (!updatedData.schoolGrade?.trim()) {
      return {
        ok: false,
        msg: 'Please enter your school grade / year / level.',
        focus: 'school',
      };
    }

    if (role === 'tutor') {
      if (!updatedData.category) {
        return {
          ok: false,
          msg: 'Please select a category.',
          focus: 'category',
        };
      }

      for (const key of Object.keys(TOKEN_RANGES) as TokenField[]) {
        const val = updatedData.pricing[key];
        const { min, max } = TOKEN_RANGES[key];
        if (
          !Number.isFinite(val) ||
          (val as number) < min ||
          (val as number) > max
        ) {
          return {
            ok: false,
            msg: `Set a valid rate for ${key} (${min}–${max}).`,
            focus: 'pricing',
          };
        }
      }

      if (updatedData.payoutMethod === 'wise') {
        if (!updatedData.wiseEmail?.trim()) {
          return {
            ok: false,
            msg: 'Enter a valid Wise account email.',
            focus: 'payout',
          };
        }
      } else if (updatedData.payoutMethod === 'mpesa') {
        if (!updatedData.mpesaPhoneNumber?.trim()) {
          return {
            ok: false,
            msg: 'Enter a valid M-Pesa phone number.',
            focus: 'payout',
          };
        }
      } else {
        return {
          ok: false,
          msg: 'Choose Wise or M-Pesa as payout method.',
          focus: 'payout',
        };
      }
    }

    return { ok: true };
  };

  // derived currency (same behavior as web)
  const payoutCurrency = updatedData.payoutMethod === 'mpesa' ? 'KES' : 'USD';

  // intro video preview
  const previewPlayer = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    (async () => {
      try {
        await previewPlayer.pause();
        await previewPlayer.replace(videoUri || null);
      } catch {
        // ignore preview errors
      }
    })();
  }, [videoUri, previewPlayer]);

  return (
    <SafeAreaView
      style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        contentContainerStyle={[tw`px-4 pb-6`, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={tw`mt-2 mb-3`}>
          <Text style={tw`text-xs text-slate-600 dark:text-slate-400`}>
            Role: {role || 'Loading…'}
          </Text>
          <Text
            style={tw`mt-1 text-xl font-bold text-[#0d141c] dark:text-white`}
          >
            Manage your profile
          </Text>
          <Text style={helperText}>
            Keep this up to date so we can match you with the right learners.
          </Text>
        </View>

        {/* Personal Info */}
        <View
          style={[sectionBase, focusSection === 'personal' && sectionError]}
          onLayout={registerSection('personal')}
        >
          <Text style={labelText}>Personal details</Text>
          <TextInput
            placeholder="Name"
            value={updatedData.name}
            onChangeText={(t) => handleInputChange('name', makeEvent(t))}
            placeholderTextColor={placeholderColor}
            style={inputBase}
          />
          {/* Age field removed */}
        </View>

        {/* Country */}
        <View
          style={[sectionBase, focusSection === 'country' && sectionError]}
          onLayout={registerSection('country')}
        >
          <Text style={labelText}>Country</Text>
          <SelectField
            value={updatedData.country || ''}
            onChange={(v) => handleInputChange('country', v)}
            options={countryOptions}
            placeholder="Select your country"
            modalTitle="Select your country"
            placeholderColor={placeholderColor}
            selectedTextColor={selectedColor}
          />
        </View>

        {/* School Grade / Year / Level */}
        <View
          style={[sectionBase, focusSection === 'school' && sectionError]}
          onLayout={registerSection('school')}
        >
          <Text style={labelText}>School Grade / Year / Level</Text>
          <TextInput
            placeholder="e.g., Grade 7, Form 2, Year 10, Freshman …"
            value={updatedData.schoolGrade || ''}
            onChangeText={(t) =>
              handleInputChange('schoolGrade', makeEvent(t))
            }
            placeholderTextColor={placeholderColor}
            style={inputBase}
          />
        </View>

        {/* Languages */}
        <View
          style={[sectionBase, focusSection === 'languages' && sectionError]}
          onLayout={registerSection('languages')}
        >
          <Text
            style={tw`text-lg mb-1 font-semibold text-[#0d141c] dark:text-white`}
          >
            Languages
          </Text>
          <Text style={helperText}>
            Choose at least one language you speak or teach in.
          </Text>
          <View style={tw`flex-row flex-wrap mt-1`}>
            {Object.keys(updatedData.languages).map((lang) => {
              const on = !!updatedData.languages[lang];
              return (
                <TouchableOpacity
                  key={lang}
                  onPress={() => handleLanguageSelect(lang)}
                  style={on ? pillOn : pillOff}
                  activeOpacity={0.9}
                >
                  <Text
                    style={
                      on
                        ? tw`text-white`
                        : tw`text-[#0d141c] dark:text-slate-200`
                    }
                  >
                    {lang}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Tutor-only sections */}
        {role === 'tutor' && (
          <>
            {/* Category */}
            <View
              style={[sectionBase, focusSection === 'category' && sectionError]}
              onLayout={registerSection('category')}
            >
              <Text style={labelText}>Category</Text>
              <Text style={helperText}>
                This helps learners quickly understand what you teach.
              </Text>
              <SelectField
                value={updatedData.category || ''}
                onChange={(val) =>
                  handleInputChange('category', makeEvent(val))
                }
                options={categoryOptions}
                placeholder="Select a category…"
                modalTitle="Select a category"
                placeholderColor={placeholderColor}
                selectedTextColor={selectedColor}
              />
            </View>

            {/* Status */}
            <View style={sectionBase}>
              <Text style={labelText}>Status</Text>
              <SelectField
                value={updatedData.status || ''}
                onChange={(val) =>
                  handleInputChange('status', makeEvent(val))
                }
                options={statusOptions}
                placeholder="Select your status…"
                modalTitle="Select your status"
                placeholderColor={placeholderColor}
                selectedTextColor={selectedColor}
              />
            </View>

            {/* Notifications */}
            <View
              style={[
                sectionBase,
                tw`flex-row items-center justify-between`,
              ]}
            >
              <Text style={tw`text-[#0d141c] dark:text-white`}>
                Notifications
              </Text>
              <Switch
                value={!!updatedData.notifications}
                onValueChange={handleToggleNotifications}
                trackColor={{
                  false: resolvedScheme === 'dark' ? '#1F2933' : '#E5E7EB',
                  true: '#ec4899',
                }}
                thumbColor={resolvedScheme === 'dark' ? '#F9FAFB' : '#FFFFFF'}
              />
            </View>

            {/* Bio */}
            <View style={sectionBase}>
              <Text style={labelText}>Bio</Text>
              <Text style={helperText}>
                Write a short, friendly introduction for your future learners.
              </Text>
              <TextInput
                placeholder="Write a brief introduction…"
                multiline
                value={updatedData.bio}
                onChangeText={(t) => handleInputChange('bio', makeEvent(t))}
                placeholderTextColor={placeholderColor}
                style={[inputBase, tw`h-24`]}
              />
            </View>

            {/* Pricing */}
            <View
              style={[sectionBase, focusSection === 'pricing' && sectionError]}
              onLayout={registerSection('pricing')}
            >
              <Text
                style={tw`text-lg font-semibold text-[#0d141c] dark:text-white mb-1`}
              >
                Rates (1 token = $1 USD)
              </Text>
              <Text style={helperText}>
                Set your rates within the allowed ranges so learners can book
                confidently.
              </Text>
              <View style={tw`flex-row flex-wrap -mx-2 mt-1`}>
                {(Object.keys(TOKEN_RANGES) as TokenField[]).map((field) => {
                  const { min, max } = TOKEN_RANGES[field];
                  const label = field.replace(/([A-Z])/g, ' $1');
                  return (
                    <View key={field} style={tw`w-1/2 px-2 mb-3`}>
                      <Text
                        style={tw`text-xs text-slate-600 dark:text-slate-400 mb-1`}
                      >
                        {label} (Min {min}, Max {max})
                      </Text>
                      <TextInput
                        keyboardType="numeric"
                        value={String(updatedData.pricing[field] ?? '')}
                        onChangeText={(t) => handlePricingChange(field, t)}
                        placeholderTextColor={placeholderColor}
                        style={tw`w-full px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 text-[#0d141c] dark:text-white border border-slate-200 dark:border-white/10`}
                      />
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Expertise */}
            <View style={sectionBase}>
              <Text
                style={tw`text-lg text-[#0d141c] dark:text-white mb-1 font-semibold`}
              >
                Expertise
              </Text>
              <Text style={helperText}>
                What do you enjoy helping learners with most?
              </Text>
              <View style={tw`flex-row flex-wrap mt-1`}>
                {[
                  'Exam Prep',
                  'Skill Building',
                  'Homework Help',
                  'Career Guidance',
                ].map((opt) => {
                  const on = updatedData.expertise.includes(opt);
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => handleExpertiseSelect(opt)}
                      style={on ? pillOn : pillOff}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={
                          on
                            ? tw`text-white`
                            : tw`text-[#0d141c] dark:text-slate-200`
                        }
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Experience Level */}
            <View style={sectionBase}>
              <Text style={labelText}>Experience Level</Text>
              <SelectField
                value={updatedData.experienceLevel || ''}
                onChange={(val) =>
                  handleInputChange('experienceLevel', val as any)
                }
                options={experienceOptions}
                placeholder="Select experience level…"
                modalTitle="Select experience level"
                placeholderColor={placeholderColor}
                selectedTextColor={selectedColor}
              />
            </View>

            {/* Teaching Styles */}
            <View style={sectionBase}>
              <Text
                style={tw`text-lg text-[#0d141c] dark:text-white mb-1 font-semibold`}
              >
                Teaching Styles
              </Text>
              <Text style={helperText}>
                How do you prefer to run your sessions?
              </Text>
              <View style={tw`flex-row flex-wrap mt-1`}>
                {['One-on-One', 'Group', 'Workshop', 'Lecture'].map((s) => {
                  const on = updatedData.teachingStyle.includes(s);
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => handleTeachingStyleSelect(s)}
                      style={on ? pillOn : pillOff}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={
                          on
                            ? tw`text-white`
                            : tw`text-[#0d141c] dark:text-slate-200`
                        }
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Payout Preferences */}
            <View
              style={[sectionBase, focusSection === 'payout' && sectionError]}
              onLayout={registerSection('payout')}
            >
              <Text
                style={tw`text-lg text-[#0d141c] dark:text-white mb-1 font-semibold`}
              >
                Payout Preferences
              </Text>
              <Text style={helperText}>
                Choose how you’d like to receive your earnings.
              </Text>

              <Text
                style={tw`text-sm text-[#0d141c] dark:text-white mb-2`}
              >
                Payout Method
              </Text>
              <SelectField
                value={updatedData.payoutMethod ?? 'wise'}
                onChange={(method) =>
                  setUpdatedData((prev) => ({
                    ...prev,
                    payoutMethod: method as 'wise' | 'mpesa',
                    payoutCurrency: method === 'mpesa' ? 'KES' : 'USD',
                  }))
                }
                options={payoutMethodOptions}
                placeholder="Select payout method"
                modalTitle="Select payout method"
                placeholderColor={placeholderColor}
                selectedTextColor={selectedColor}
              />

              <Text
                style={tw`text-xs text-slate-600 dark:text-slate-400 mb-1`}
              >
                Payout Currency
              </Text>
              <View
                style={tw`flex-row items-center justify-between bg-slate-100 dark:bg-slate-900/60 rounded-xl px-3 py-3 mb-3 border border-slate-200 dark:border-white/10`}
              >
                <Text style={tw`text-[#0d141c] dark:text-white`}>
                  {payoutCurrency}
                </Text>
                <Text
                  style={tw`text-slate-600 dark:text-slate-400 text-xs`}
                >
                  Wise → USD • M-Pesa → KES
                </Text>
              </View>

              {updatedData.payoutMethod !== 'mpesa' && (
                <TextInput
                  placeholder="Wise account email"
                  value={updatedData.wiseEmail || ''}
                  onChangeText={(t) =>
                    setUpdatedData((prev) => ({ ...prev, wiseEmail: t }))
                  }
                  placeholderTextColor={placeholderColor}
                  style={inputBase}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}

              {updatedData.payoutMethod === 'mpesa' && (
                <TextInput
                  placeholder="+2547XXXXXXXX"
                  value={updatedData.mpesaPhoneNumber || ''}
                  onChangeText={(t) =>
                    setUpdatedData((prev) => ({
                      ...prev,
                      mpesaPhoneNumber: t,
                    }))
                  }
                  placeholderTextColor={placeholderColor}
                  style={inputBase}
                  keyboardType="phone-pad"
                />
              )}
            </View>

            {/* Profile Image */}
            <View style={sectionBase}>
              <Text style={labelText}>Profile image</Text>
              <Text style={helperText}>
                A clear, friendly photo builds trust with learners.
              </Text>
              <View
                style={tw`w-40 h-40 rounded-2xl overflow-hidden bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/10`}
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={tw`w-full h-full`}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={tw`flex-1 items-center justify-center`}>
                    <Text
                      style={tw`text-slate-500 dark:text-slate-400`}
                    >
                      No image
                    </Text>
                  </View>
                )}
              </View>
              <View style={tw`flex-row mt-3`}>
                {imageUri ? (
                  <>
                    <TouchableOpacity
                      onPress={pickImage}
                      style={tw`bg-pink-600 px-3 py-2 rounded-xl mr-2`}
                      activeOpacity={0.9}
                    >
                      <Text style={tw`text-white`}>Replace</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteImage(0)}
                      style={tw`bg-slate-200 dark:bg-slate-800 px-3 py-2 rounded-xl`}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={tw`text-[#0d141c] dark:text-white`}
                      >
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={pickImage}
                    style={tw`bg-pink-600 px-3 py-2 rounded-xl`}
                    activeOpacity={0.9}
                  >
                    <Text style={tw`text-white`}>Upload</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Video */}
            <View style={sectionBase}>
              <Text style={labelText}>Intro video (optional)</Text>
              <Text style={helperText}>
                A short intro video can greatly improve your chances of being
                booked.
              </Text>
              <View style={tw`rounded-2xl overflow-hidden bg-black`}>
                {videoUri ? (
                  <VideoView
                    player={previewPlayer}
                    style={tw`w-full h-40`}
                    nativeControls
                    contentFit="contain"
                    allowsFullscreen
                    allowsPictureInPicture
                  />
                ) : (
                  <View
                    style={tw`w-full h-40 items-center justify-center bg-slate-200 dark:bg-white/5`}
                  >
                    <Text
                      style={tw`text-slate-600 dark:text-slate-300`}
                    >
                      No video uploaded
                    </Text>
                  </View>
                )}
              </View>
              <View style={tw`flex-row mt-3`}>
                {videoUri ? (
                  <>
                    <TouchableOpacity
                      onPress={replaceVideo}
                      style={tw`bg-pink-600 px-3 py-2 rounded-xl mr-2`}
                      activeOpacity={0.9}
                    >
                      <Text style={tw`text-white`}>Replace</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleDeleteVideo}
                      style={tw`bg-slate-200 dark:bg-slate-800 px-3 py-2 rounded-xl`}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={tw`text-[#0d141c] dark:text-white`}
                      >
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={replaceVideo}
                    style={tw`bg-pink-600 px-3 py-2 rounded-xl`}
                    activeOpacity={0.9}
                  >
                    <Text style={tw`text-white`}>Upload</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Recommendations */}
            <View style={sectionBase}>
              <Text style={labelText}>Recommendations</Text>
              <Text style={helperText}>
                Add other tutors you’d personally recommend to your learners.
              </Text>
              <TextInput
                placeholder="Search profiles…"
                onChangeText={(t) => handleSearch(makeEvent(t))}
                placeholderTextColor={placeholderColor}
                style={inputBase}
              />
              {searchResults.length > 0 && (
                <View
                  style={tw`bg-slate-100 dark:bg-slate-900/60 rounded-xl p-2 mt-2 border border-slate-200 dark:border-white/10`}
                >
                  {searchResults.map((p) => (
                    <View
                      key={p._id}
                      style={tw`flex-row items-center justify-between p-2 border-b border-slate-200 dark:border-white/10 last:border-b-0`}
                    >
                      <Text
                        style={tw`text-[#0d141c] dark:text-white`}
                      >
                        {p.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleAddRecommendation(p._id)}
                        style={tw`bg-pink-600 px-3 py-1 rounded-xl`}
                        activeOpacity={0.9}
                      >
                        <Text
                          style={tw`text-white text-sm`}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text
                style={tw`text-sm font-semibold text-[#0d141c] dark:text-white mt-3 mb-2`}
              >
                Selected
              </Text>
              {updatedData.recommended.length > 0 ? (
                updatedData.recommended.map((id) => {
                  const prof = availableProfiles.find(
                    (x: { _id: string; name?: string }) => x._id === id,
                  );
                  if (!prof) return null;
                  return (
                    <View
                      key={id}
                      style={tw`flex-row items-center justify-between bg-slate-100 dark:bg-slate-900/60 p-3 rounded-xl mb-2 border border-slate-200 dark:border-white/10`}
                    >
                      <Text
                        style={tw`text-[#0d141c] dark:text-white flex-1`}
                      >
                        {prof.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveRecommendation(id)}
                      >
                        <Text
                          style={tw`text-red-500 text-lg`}
                        >
                          ✕
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              ) : (
                <Text
                  style={tw`text-slate-500 dark:text-slate-400`}
                >
                  No recommendations.
                </Text>
              )}
            </View>
          </>
        )}

        {/* Submit */}
        <TouchableOpacity
          disabled={isUploading}
          onPress={() => {
            const v = validateBeforeSubmit();
            if (!v.ok) {
              setFocusSection(v.focus);
              scrollToSection(v.focus);
              Alert.alert('Fix required', v.msg);
              return;
            }
            handleSubmit();
          }}
          style={tw`mt-2 mb-6 bg-pink-600 py-3 rounded-2xl items-center opacity-100 ${
            isUploading ? 'opacity-80' : ''
          }`}
          activeOpacity={0.9}
        >
          <Text style={tw`text-white font-semibold`}>
            {isUploading ? 'Updating…' : 'Update Profile'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

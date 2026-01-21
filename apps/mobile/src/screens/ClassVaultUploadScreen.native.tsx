// apps/mobile/src/screens/ClassVaultUploadScreen.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import tw from '../../tailwind';
import useUploadClassVault, {
  CreateRecordedVideoPayload,
} from '@mytutorapp/shared/hooks/useUploadClassVault';
import { useClassVault } from '@mytutorapp/shared/hooks/useClassVault';
import type { RecordedVideo } from '@mytutorapp/shared/types';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';
import type { MainStackParamList } from '../navigation/types';
import { useThemePref } from '../theme/ThemeContext';
import SelectField from './SelectField.native';

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

type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];
type FileKind = 'video' | 'pdf';

const COUNTRY_KEY = 'classvault:country';

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message as string;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const norm = (s?: string) => String(s ?? '').toLowerCase().trim();

function findTagValue(tags: unknown, key: string): string | null {
  if (!Array.isArray(tags)) return null;
  const want = norm(key);
  for (const t of tags) {
    const s = String(t || '');
    const [k, ...rest] = s.split(':');
    if (norm(k) === want) return rest.join(':').trim() || null;
  }
  return null;
}

function stripAutoTags(userTags: string[]) {
  const bannedKeys = new Set(['country', 'subject', 'grade']);
  return userTags.filter((t) => {
    const [k] = String(t || '').split(':');
    return !bannedKeys.has(norm(k));
  });
}

function deriveAutoTags(country: string, subject: string, gradeLevel: string): string[] {
  const tags: string[] = [];
  if (country) tags.push(`country:${country}`);
  if (subject) tags.push(`subject:${subject}`);
  if (gradeLevel.trim()) {
    const g = slugify(gradeLevel);
    if (g) tags.push(`grade:${g}`);
  }
  return tags;
}

const ClassVaultUploadScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'ClassVaultUpload'>>();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useThemePref();

  const {
    role,
    uploading: uploadingMeta,
    handleFileUpload,
    handleSubmitMetadata,
  } = useUploadClassVault();

  const { videos, loading: libraryLoading, error: libraryError, update } = useClassVault();

  const editId = useMemo(() => {
    const raw = route.params?.editId;
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [route.params]);

  const isEdit = Boolean(editId);

  const editItem = useMemo<RecordedVideo | null>(() => {
    if (!isEdit || !editId) return null;
    return (videos || []).find((v) => Number((v as any).id) === Number(editId)) ?? null;
  }, [videos, isEdit, editId]);

  // file upload
  const [fileType, setFileType] = useState<FileKind>('video');
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [replacingFile, setReplacingFile] = useState<boolean>(false);

  // thumbnail upload
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [thumbProgress, setThumbProgress] = useState<number>(0);
  const [uploadingThumb, setUploadingThumb] = useState<boolean>(false);

  // metadata
  const [country, setCountry] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [subject, setSubject] = useState<SubjectCategory | ''>('');
  const [gradeLevel, setGradeLevel] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const [tags, setTags] = useState<string>('');

  const [prefilled, setPrefilled] = useState(false);

  const placeholderColor = resolvedScheme === 'dark' ? '#64748b' : '#9ca3af';

  const countryOptions = useMemo(() => {
    const arr = Array.isArray(COUNTRIES) ? COUNTRIES : [];
    return arr
      .map((c: any) => {
        const code = String(c?.code ?? c?.iso2 ?? c?.alpha2 ?? '').trim().toLowerCase();
        const label = String(c?.name ?? c?.label ?? c?.country ?? c?.title ?? '').trim();
        return code && label ? { label, value: code } : null;
      })
      .filter(Boolean) as { label: string; value: string }[];
  }, []);

  const subjectOptions = useMemo(() => SUBJECT_CATEGORIES.map((s) => ({ label: s, value: s })), []);

  // Load saved country
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(COUNTRY_KEY);
        if (saved && !country) setCountry(String(saved).toLowerCase());
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist country
  useEffect(() => {
    if (!country) return;
    AsyncStorage.setItem(COUNTRY_KEY, country).catch(() => {});
  }, [country]);

  // Prefill edit mode from local library (like web)
  useEffect(() => {
    if (!isEdit || !editItem || prefilled) return;

    const itemTitle = String((editItem as any).title ?? '');
    const itemSubject = String((editItem as any).subject ?? '');
    const itemGrade = String((editItem as any).grade_level ?? '');
    const itemPrice = (editItem as any).price != null ? String((editItem as any).price) : '';
    const itemDuration = (editItem as any).duration != null ? String((editItem as any).duration) : '';
    const itemTagsArr = Array.isArray((editItem as any).tags) ? (editItem as any).tags : [];
    const itemTagsStr = itemTagsArr.map((t: any) => String(t)).join(', ');

    const tagCountry = findTagValue(itemTagsArr, 'country');
    const resolvedCountry = (tagCountry && tagCountry.toLowerCase()) || '';

    const videoUrl = String((editItem as any).video_url ?? '');
    const pdfUrl = String((editItem as any).pdf_url ?? '');

    const inferredType: FileKind = pdfUrl ? 'pdf' : videoUrl ? 'video' : 'video';
    const inferredUrl = inferredType === 'pdf' ? pdfUrl : videoUrl;

    const turl = String((editItem as any).thumbnail_url ?? '');

    setTitle(itemTitle);

    const asCat = SUBJECT_CATEGORIES.includes(itemSubject as any) ? (itemSubject as SubjectCategory) : '';
    setSubject(asCat);

    setGradeLevel(itemGrade);
    setPrice(itemPrice);
    setDuration(itemDuration);
    setTags(itemTagsStr);

    setFileType(inferredType);
    setUploadedUrl(inferredUrl);
    setProgress(inferredUrl ? 100 : 0);

    setThumbnailUrl(turl);
    setThumbProgress(turl ? 100 : 0);

    if (resolvedCountry) setCountry(resolvedCountry);

    setPrefilled(true);
  }, [isEdit, editItem, prefilled]);

  /* ────────────────────── Role gates ────────────────────── */
  if (role === null) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 items-center justify-center px-4`}>
          <ActivityIndicator size="large" color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'} />
          <Text style={tw`mt-3 text-slate-700 dark:text-slate-200`}>Checking permissions…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'tutor') {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <View style={tw`rounded-2xl p-5 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}>
            <Text style={tw`text-xl font-semibold text-center text-[#0d141c] dark:text-white`}>
              Access Denied
            </Text>
            <Text style={tw`mt-2 text-center text-slate-700 dark:text-slate-300`}>
              Only tutors can upload ClassVault content.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const requiresThumb = fileType === 'pdf';

  const showEditLoading = isEdit && (libraryLoading || (!editItem && !libraryError));
  const showEditMissing = isEdit && !libraryLoading && !editItem;

  const disableSubmit =
    uploadingMeta || uploadingFile || uploadingThumb || showEditLoading || showEditMissing;

  const goBack = () => navigation.goBack();

  const replaceFile = () => {
    setReplacingFile(true);
    setUploadedUrl('');
    setProgress(0);
  };

  const replaceThumb = () => {
    setThumbnailUrl('');
    setThumbProgress(0);
  };

  const setFileTypeSmart = (next: FileKind) => {
    setFileType(next);

    // In create mode (or when user is replacing), clear selection
    if (!isEdit || replacingFile) {
      setUploadedUrl('');
      setProgress(0);
      return;
    }

    // In edit mode, show the existing asset for that kind
    const existingVideoUrl = String((editItem as any)?.video_url ?? '');
    const existingPdfUrl = String((editItem as any)?.pdf_url ?? '');
    const nextUrl = next === 'pdf' ? existingPdfUrl : existingVideoUrl;

    setUploadedUrl(nextUrl);
    setProgress(nextUrl ? 100 : 0);
  };

  const pickFile = async (): Promise<void> => {
    try {
      const typeFilter = fileType === 'video' ? ['video/*'] : ['application/pdf'];
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: typeFilter,
        multiple: false,
      });
      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset) {
        Alert.alert('Upload failed', 'No file selected');
        return;
      }

      const { uri, name, mimeType } = asset;

      setProgress(0);
      setUploadedUrl('');
      setUploadingFile(true);

      const { url } = await handleFileUpload({
        fileType,
        file: {
          uri,
          name,
          type: mimeType ?? (fileType === 'video' ? 'video/*' : 'application/pdf'),
        },
        onProgress: (pct: number) => setProgress(Math.max(1, Math.min(99, Math.floor(pct)))),
      });

      setUploadedUrl(url);
      setProgress(100);
      setReplacingFile(false);
    } catch (err: unknown) {
      Alert.alert('Upload failed', getErrorMessage(err));
      setProgress(0);
      setUploadedUrl('');
    } finally {
      setUploadingFile(false);
    }
  };

  const pickThumbnail = async (): Promise<void> => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['image/*'],
        multiple: false,
      });
      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset) {
        Alert.alert('Upload failed', 'No image selected');
        return;
      }

      const { uri, name, mimeType } = asset;

      setThumbProgress(0);
      setThumbnailUrl('');
      setUploadingThumb(true);

      const { url } = await handleFileUpload({
        fileType: 'thumbnail' as any,
        file: {
          uri,
          name,
          type: mimeType ?? 'image/*',
        },
        onProgress: (pct: number) =>
          setThumbProgress(Math.max(1, Math.min(99, Math.floor(pct)))),
      });

      setThumbnailUrl(url);
      setThumbProgress(100);
    } catch (err: unknown) {
      Alert.alert('Thumbnail upload failed', getErrorMessage(err));
      setThumbProgress(0);
      setThumbnailUrl('');
    } finally {
      setUploadingThumb(false);
    }
  };

  const onSubmit = async (): Promise<void> => {
    if (!country || !title || !subject || !gradeLevel.trim() || !price) {
      Alert.alert('Incomplete', 'Please fill all required fields.');
      return;
    }

    // In edit mode: require a file ONLY if they clicked "Replace file"
    if (!uploadedUrl) {
      if (!isEdit || replacingFile) {
        Alert.alert('Incomplete', 'Please select a file (or keep the existing one).');
        return;
      }
    }

    // PDF requires thumbnail
    if (fileType === 'pdf' && !thumbnailUrl) {
      Alert.alert('Thumbnail required', 'Please upload a thumbnail image for your Notes (required).');
      return;
    }

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 1) {
      Alert.alert('Invalid price', 'Price should be a positive number (tokens).');
      return;
    }

    const durationNum = duration ? Number(duration) : undefined;
    if (duration && (!Number.isFinite(durationNum!) || durationNum! < 0)) {
      Alert.alert('Invalid duration', 'Duration must be a non-negative number of minutes.');
      return;
    }

    const userTagsRaw = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const userTagsClean = stripAutoTags(userTagsRaw);
    const auto = deriveAutoTags(country, subject || '', gradeLevel);
    const allTags = Array.from(new Set([...userTagsClean, ...auto]));

    // ✅ Edit mode PATCH
    if (isEdit && editId) {
      const patch: Partial<CreateRecordedVideoPayload & { thumbnail_url?: string }> = {
        title,
        subject,
        grade_level: gradeLevel,
        price: priceNum,
        duration: durationNum,
        tags: allTags,
      };

      const existingVideoUrl = String((editItem as any)?.video_url ?? '');
      const existingPdfUrl = String((editItem as any)?.pdf_url ?? '');

      if (fileType === 'video') {
        if (uploadedUrl) (patch as any).video_url = uploadedUrl;
        else if (existingVideoUrl) (patch as any).video_url = existingVideoUrl;
      }

      if (fileType === 'pdf') {
        if (uploadedUrl) (patch as any).pdf_url = uploadedUrl;
        else if (existingPdfUrl) (patch as any).pdf_url = existingPdfUrl;
      }

      if (thumbnailUrl) (patch as any).thumbnail_url = thumbnailUrl;

      try {
        await update(Number(editId), patch as any);
        Alert.alert('Saved', 'Your changes were updated.', [{ text: 'OK', onPress: goBack }]);
      } catch (err: unknown) {
        Alert.alert('Update failed', getErrorMessage(err));
      }
      return;
    }

    // ✅ Create mode
    if (!uploadedUrl) {
      Alert.alert('Incomplete', 'Please select a file.');
      return;
    }

    const payload: CreateRecordedVideoPayload & { thumbnail_url?: string } = {
      title,
      subject,
      grade_level: gradeLevel,
      price: priceNum,
      duration: durationNum,
      tags: allTags,
      video_url: fileType === 'video' ? uploadedUrl : '',
      pdf_url: fileType === 'pdf' ? uploadedUrl : '',
      thumbnail_url: thumbnailUrl || undefined,
    };

    try {
      await handleSubmitMetadata(payload as any);
      Alert.alert('Success', 'Content uploaded!', [{ text: 'OK', onPress: goBack }]);
      setProgress(0);
      setUploadedUrl('');
      setThumbProgress(0);
      setThumbnailUrl('');
    } catch (err: unknown) {
      Alert.alert('Submission failed', getErrorMessage(err));
    }
  };

  const headerLabel = isEdit ? 'Edit ClassVault Item' : 'Upload to ClassVault';
  const submitLabel = isEdit ? 'Save Changes' : 'Submit to ClassVault';

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`px-4 pt-4`,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.select({ ios: 'on-drag', android: 'none' })}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={tw`mb-4 items-center`}>
          <Text style={tw`text-2xl font-extrabold text-[#0d141c] dark:text-white text-center`}>
            {headerLabel}
          </Text>
          <Text style={tw`mt-1 text-sm text-slate-700 dark:text-slate-300 text-center`}>
            {isEdit ? `Editing item #${editId ?? ''}` : 'Share your best lessons and earn tokens.'}
          </Text>
        </View>

        {isEdit && (
          <View
            style={tw`mb-4 rounded-2xl p-3 bg-[#f0f7ff] dark:bg-[#0b2238] border border-[#cedbe8] dark:border-white/10`}
          >
            <View style={tw`flex-row`}>
              <TouchableOpacity
                onPress={goBack}
                activeOpacity={0.9}
                style={tw`mr-2 rounded-xl px-4 py-2 bg-slate-200 dark:bg-white/10`}
              >
                <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={replaceFile}
                activeOpacity={0.9}
                style={tw`mr-2 rounded-xl px-4 py-2 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
              >
                <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Replace file</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={replaceThumb}
                activeOpacity={0.9}
                style={tw`rounded-xl px-4 py-2 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
              >
                <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Replace thumbnail</Text>
              </TouchableOpacity>
            </View>

            {showEditLoading ? (
              <Text style={tw`mt-2 text-xs text-slate-600 dark:text-slate-300`}>Loading item…</Text>
            ) : null}
            {libraryError ? (
              <Text style={tw`mt-2 text-xs text-red-600 dark:text-red-400`}>{String(libraryError)}</Text>
            ) : null}
            {showEditMissing ? (
              <Text style={tw`mt-2 text-xs text-red-600 dark:text-red-400`}>
                Could not find that ClassVault item. It may have been deleted.
              </Text>
            ) : null}
          </View>
        )}

        {progress > 0 && progress < 100 && (
          <View style={tw`flex-row items-center justify-center mb-3`}>
            <ActivityIndicator size="small" color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'} />
            <Text style={tw`ml-2 text-slate-700 dark:text-slate-200`}>Uploading… {progress}%</Text>
          </View>
        )}

        {/* Country */}
        <View style={tw`mb-3`}>
          <SelectField
            label="Country *"
            value={country}
            placeholder="Select your country"
            options={countryOptions}
            onChange={(v) => setCountry(String(v).toLowerCase())}
          />
        </View>

        {/* Title */}
        <TextInput
          placeholder="Title *"
          placeholderTextColor={placeholderColor}
          value={title}
          onChangeText={setTitle}
          style={tw`rounded-2xl mb-3 px-3 py-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`}
        />

        {/* Subject */}
        <View style={tw`mb-3`}>
          <SelectField
            label="Subject Category *"
            value={subject}
            placeholder="Select a subject category"
            options={subjectOptions}
            onChange={(v) => setSubject(v as any)}
          />
        </View>

        {/* Grade */}
        <TextInput
          placeholder="Grade / Level *"
          placeholderTextColor={placeholderColor}
          value={gradeLevel}
          onChangeText={setGradeLevel}
          style={tw`rounded-2xl mb-3 px-3 py-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`}
        />

        {/* Price */}
        <TextInput
          placeholder="Price in Tokens (1 Token = $1) *"
          placeholderTextColor={placeholderColor}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          style={tw`rounded-2xl mb-3 px-3 py-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`}
        />

        {/* Duration */}
        <TextInput
          placeholder="Duration (mins) — optional"
          placeholderTextColor={placeholderColor}
          value={duration}
          onChangeText={setDuration}
          keyboardType="numeric"
          style={tw`rounded-2xl mb-3 px-3 py-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`}
        />

        {/* Tags */}
        <TextInput
          placeholder="Tags (comma-separated)"
          placeholderTextColor={placeholderColor}
          value={tags}
          onChangeText={setTags}
          style={tw`rounded-2xl mb-4 px-3 py-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`}
        />

        {/* Type toggle */}
        <View style={tw`flex-row items-center justify-center mb-4`}>
          <TouchableOpacity
            onPress={() => setFileTypeSmart('video')}
            activeOpacity={0.9}
            style={tw.style(
              'px-4 py-2 rounded-xl border',
              fileType === 'video'
                ? 'bg-pink-600 border-pink-600'
                : 'bg-slate-200 dark:bg-white/5 border-slate-300 dark:border-white/10'
            )}
          >
            <Text style={tw.style('font-medium', fileType === 'video' ? 'text-white' : 'text-[#0d141c] dark:text-slate-100')}>
              Video
            </Text>
          </TouchableOpacity>

          <Text style={tw`mx-3 font-medium text-slate-600 dark:text-slate-300`}>or</Text>

          <TouchableOpacity
            onPress={() => setFileTypeSmart('pdf')}
            activeOpacity={0.9}
            style={tw.style(
              'px-4 py-2 rounded-xl border',
              fileType === 'pdf'
                ? 'bg-pink-600 border-pink-600'
                : 'bg-slate-200 dark:bg-white/5 border-slate-300 dark:border-white/10'
            )}
          >
            <Text style={tw.style('font-medium', fileType === 'pdf' ? 'text-white' : 'text-[#0d141c] dark:text-slate-100')}>
              Class Notes
            </Text>
          </TouchableOpacity>
        </View>

        {/* Current file */}
        {uploadedUrl ? (
          <View style={tw`mb-4 rounded-2xl p-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}>
            <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>Current file</Text>
            <Text style={tw`mt-1 text-xs text-slate-600 dark:text-slate-300`} numberOfLines={3}>
              {uploadedUrl}
            </Text>
          </View>
        ) : null}

        {/* Pick file */}
        <TouchableOpacity
          onPress={pickFile}
          disabled={uploadingMeta || uploadingFile}
          activeOpacity={0.9}
          style={tw`rounded-2xl mb-4 px-3 py-3 flex-row items-center bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
        >
          <FontAwesome5
            name="cloud-upload-alt"
            size={18}
            color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'}
            style={tw`mr-3`}
          />
          <Text style={tw`text-[#0d141c] dark:text-white font-medium`}>
            {uploadingFile
              ? 'Uploading…'
              : uploadedUrl
              ? `✅ ${fileType === 'video' ? 'Video selected' : 'PDF selected'}`
              : `Select ${fileType === 'video' ? 'Video' : 'PDF'}${isEdit && !replacingFile ? '' : ' *'}`}
          </Text>
        </TouchableOpacity>

        {/* Thumbnail */}
        <View style={tw`mb-4 rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}>
          <View style={tw`flex-row items-start justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                Thumbnail image{requiresThumb ? ' *' : ''}
              </Text>
              <Text style={tw`mt-1 text-xs text-slate-600 dark:text-slate-300`}>
                {requiresThumb
                  ? 'Required for Notes so learners can preview the card without opening the gated PDF.'
                  : 'Optional but recommended.'}
              </Text>
            </View>
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={tw`w-20 h-14 rounded-lg`} resizeMode="cover" />
            ) : null}
          </View>

          {thumbProgress > 0 && thumbProgress < 100 ? (
            <View style={tw`mt-3 flex-row items-center`}>
              <ActivityIndicator size="small" color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'} />
              <Text style={tw`ml-2 text-slate-700 dark:text-slate-200`}>Uploading thumbnail… {thumbProgress}%</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={pickThumbnail}
            disabled={uploadingMeta || uploadingThumb}
            activeOpacity={0.9}
            style={tw`mt-3 rounded-2xl px-3 py-3 flex-row items-center bg-slate-50 dark:bg-white/5 border border-[#cedbe8] dark:border-white/10`}
          >
            <FontAwesome5
              name="cloud-upload-alt"
              size={18}
              color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'}
              style={tw`mr-3`}
            />
            <Text style={tw`text-[#0d141c] dark:text-white font-medium`}>
              {uploadingThumb
                ? 'Uploading thumbnail…'
                : thumbnailUrl
                ? '✅ Thumbnail uploaded'
                : requiresThumb
                ? 'Upload thumbnail image *'
                : 'Upload thumbnail image'}
            </Text>
          </TouchableOpacity>

          {requiresThumb && !thumbnailUrl ? (
            <Text style={tw`mt-2 text-xs text-red-600 dark:text-red-400`}>
              Notes require a thumbnail.
            </Text>
          ) : null}
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={onSubmit}
          disabled={disableSubmit}
          activeOpacity={0.9}
          style={tw.style('rounded-2xl mb-2 px-4 py-3 bg-pink-600', disableSubmit && 'opacity-60')}
        >
          {uploadingMeta ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={tw`text-white text-center font-semibold`}>{submitLabel}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: Math.max(insets.bottom, 16) }} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default ClassVaultUploadScreen;

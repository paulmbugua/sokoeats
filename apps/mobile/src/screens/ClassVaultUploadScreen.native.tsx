// apps/mobile/src/screens/ClassVaultUploadScreen.native.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import tw from '../../tailwind';
import useUploadClassVault, {
  CreateRecordedVideoPayload,
} from '@mytutorapp/shared/hooks/useUploadClassVault';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';
import type { MainStackParamList } from '../navigation/types';
import { useThemePref } from '../theme/ThemeContext';

// ✅ use the same selector as CreateProfile
import SelectField from './SelectField.native';

/* ────────────────────── Subject categories (minimal) ────────────────────── */
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

type FileKind = 'video' | 'pdf';

function getErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as any).message === 'string'
  ) {
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
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useThemePref();

  const {
    role,
    uploading: uploadingMeta,
    handleFileUpload,
    handleSubmitMetadata,
  } = useUploadClassVault();

  // file-upload
  const [fileType, setFileType] = useState<FileKind>('video');
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  // metadata
  const [country, setCountry] = useState<string>(''); // iso2 lower-case
  const [title, setTitle] = useState<string>('');
  const [subject, setSubject] = useState<(typeof SUBJECT_CATEGORIES)[number] | ''>('');
  const [gradeLevel, setGradeLevel] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const [tags, setTags] = useState<string>('');

  const placeholderColor = resolvedScheme === 'dark' ? '#64748b' : '#9ca3af';

  // ✅ SelectField options
  const countryOptions = useMemo(() => {
    const arr = Array.isArray(COUNTRIES) ? COUNTRIES : [];
    return arr
      .map((c: any) => {
        const code = String(c?.code ?? c?.iso2 ?? c?.alpha2 ?? '')
          .trim()
          .toLowerCase();
        const label = String(c?.name ?? c?.label ?? c?.country ?? c?.title ?? '').trim();
        return code && label ? { label, value: code } : null;
      })
      .filter(Boolean) as { label: string; value: string }[];
  }, []);

  const subjectOptions = useMemo(() => SUBJECT_CATEGORIES.map((s) => ({ label: s, value: s })), []);

  /* ────────────────────── Role gates ────────────────────── */
  if (role === null) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 items-center justify-center px-4`}>
          <ActivityIndicator
            size="large"
            color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'}
          />
          <Text style={tw`mt-3 text-slate-700 dark:text-slate-200`}>Checking permissions…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'tutor') {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <View
            style={tw`rounded-2xl p-5 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
          >
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

  /* ────────────────────── File picker ────────────────────── */
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

      setProgress(1);

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
    } catch (err: unknown) {
      Alert.alert('Upload failed', getErrorMessage(err));
      setProgress(0);
      setUploadedUrl('');
    }
  };

  /* ────────────────────── Submit ────────────────────── */
  const onSubmit = async (): Promise<void> => {
    if (!country || !title || !subject || !gradeLevel.trim() || !price || !uploadedUrl) {
      Alert.alert(
        'Incomplete',
        'Fill all required fields (Country, Title, Subject, Grade/Level, Price, File).'
      );
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

    const userTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const auto = deriveAutoTags(country, subject || '', gradeLevel);
    const tagSet = Array.from(new Set([...userTags, ...auto]));

    const payload: CreateRecordedVideoPayload = {
      title,
      subject,
      grade_level: gradeLevel,
      price: priceNum,
      duration: durationNum,
      tags: tagSet,
      video_url: fileType === 'video' ? uploadedUrl : '',
      pdf_url: fileType === 'pdf' ? uploadedUrl : '',
    };

    try {
      await handleSubmitMetadata(payload);
      Alert.alert('Success', 'Content uploaded!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setProgress(0);
      setUploadedUrl('');
    } catch (err: unknown) {
      Alert.alert('Submission failed', getErrorMessage(err));
    }
  };

  /* ────────────────────── UI ────────────────────── */
  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[tw`px-4 pt-4`, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.select({ ios: 'on-drag', android: 'none' })}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Header */}
        <View style={tw`mb-4 items-center`}>
          <Text style={tw`text-2xl font-extrabold text-[#0d141c] dark:text-white text-center`}>
            Upload to ClassVault
          </Text>
          <Text style={tw`mt-1 text-sm text-slate-700 dark:text-slate-300 text-center`}>
            Share your best lessons and earn tokens when students purchase.
          </Text>
        </View>

        {/* Uploading indicator */}
        {progress > 0 && progress < 100 && (
          <View style={tw`flex-row items-center justify-center mb-3`}>
            <ActivityIndicator
              size="small"
              color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'}
            />
            <Text style={tw`ml-2 text-slate-700 dark:text-slate-200`}>Uploading… {progress}%</Text>
          </View>
        )}

        {/* ✅ Country (SelectField) */}
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

        {/* ✅ Subject Category (SelectField) */}
        <View style={tw`mb-3`}>
          <SelectField
            label="Subject Category *"
            value={subject}
            placeholder="Select a subject category"
            options={subjectOptions}
            onChange={(v) => setSubject(v as any)}
          />
        </View>

        {/* Grade / Level */}
        <TextInput
          placeholder="Grade / Level *  (e.g., Primary 5, Year 10, A-Levels, University)"
          placeholderTextColor={placeholderColor}
          value={gradeLevel}
          onChangeText={setGradeLevel}
          style={tw`rounded-2xl mb-1 px-3 py-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`}
        />
        <Text style={tw`text-xs mb-3 text-slate-600 dark:text-slate-400`}>
          We’ll auto-add a tag like{' '}
          <Text style={tw`text-pink-600 dark:text-pink-400`}>
            grade:{slugify(gradeLevel) || '…'}
          </Text>
        </Text>

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
        <View style={tw`mb-3`}>
          <TextInput
            placeholder="Tags (comma-separated)"
            placeholderTextColor={placeholderColor}
            value={tags}
            onChangeText={setTags}
            style={tw`rounded-2xl px-3 py-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`}
          />
          <Text style={tw`text-xs mt-1 text-slate-600 dark:text-slate-400`}>
            Auto-tags:{' '}
            <Text style={tw`text-pink-600 dark:text-pink-400`}>country:{country || '…'}</Text>
            {subject ? (
              <Text style={tw`text-pink-600 dark:text-pink-400`}> , subject:{subject}</Text>
            ) : null}
            {gradeLevel.trim() ? (
              <Text style={tw`text-pink-600 dark:text-pink-400`}>
                {' '}
                , grade:{slugify(gradeLevel)}
              </Text>
            ) : null}
          </Text>
        </View>

        {/* File kind toggle */}
        <View style={tw`flex-row items-center justify-center mb-4`}>
          <TouchableOpacity
            onPress={() => {
              setFileType('video');
              setUploadedUrl('');
              setProgress(0);
            }}
            activeOpacity={0.9}
            style={tw.style(
              'px-4 py-2 rounded-xl border',
              fileType === 'video'
                ? 'bg-pink-600 border-pink-600'
                : 'bg-slate-200 dark:bg-white/5 border-slate-300 dark:border-white/10'
            )}
          >
            <Text
              style={tw.style(
                'font-medium',
                fileType === 'video' ? 'text-white' : 'text-[#0d141c] dark:text-slate-100'
              )}
            >
              Video
            </Text>
          </TouchableOpacity>

          <Text style={tw`mx-3 font-medium text-slate-600 dark:text-slate-300`}>or</Text>

          <TouchableOpacity
            onPress={() => {
              setFileType('pdf');
              setUploadedUrl('');
              setProgress(0);
            }}
            activeOpacity={0.9}
            style={tw.style(
              'px-4 py-2 rounded-xl border',
              fileType === 'pdf'
                ? 'bg-pink-600 border-pink-600'
                : 'bg-slate-200 dark:bg-white/5 border-slate-300 dark:border-white/10'
            )}
          >
            <Text
              style={tw.style(
                'font-medium',
                fileType === 'pdf' ? 'text-white' : 'text-[#0d141c] dark:text-slate-100'
              )}
            >
              Class Notes
            </Text>
          </TouchableOpacity>
        </View>

        {/* Upload Button */}
        <TouchableOpacity
          onPress={pickFile}
          disabled={uploadingMeta}
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
            {uploadedUrl
              ? `✅ ${fileType === 'video' ? 'Video Selected' : 'PDF Selected'}`
              : `Select ${fileType === 'video' ? 'Video' : 'PDF'}`}
          </Text>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          onPress={onSubmit}
          disabled={uploadingMeta}
          activeOpacity={0.9}
          style={tw.style('rounded-2xl mb-2 px-4 py-3 bg-pink-600', uploadingMeta && 'opacity-60')}
        >
          {uploadingMeta ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={tw`text-white text-center font-semibold`}>Submit to ClassVault</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: Math.max(insets.bottom, 16) }} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default ClassVaultUploadScreen;

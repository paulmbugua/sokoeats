// apps/mobile/src/screens/CreateCourse.native.tsx
/* eslint-disable prettier/prettier */
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses } from '@mytutorapp/shared/hooks/useCourses';
import type { CoursePayload, SyllabusItem } from '@mytutorapp/shared/types';
import { uploadClassVaultAsset } from '@mytutorapp/shared/api/classVaultUploadApi';
import SelectField, { type Option } from './SelectField.native';

/* ───────── Constants / helpers ───────── */

const steps = ['Basic Info', 'Details', 'Syllabus', 'Review'] as const;

// Parse "8 weeks", "8w", "8" → clamp 1..52
function parseWeeks(input: string): number {
  const m = String(input || '').match(/(\d{1,2})/);
  const n = m ? Number(m[1]) : 0;
  return Math.max(1, Math.min(52, Number.isFinite(n) ? n : 1));
}

// Safe extractor for tutorId from profile
function deriveTutorId(profile: unknown): number {
  if (profile && typeof profile === 'object') {
    const p = profile as { user_id?: unknown; userId?: unknown; id?: unknown };
    const tryNum = (v: unknown) => (typeof v === 'number' ? v : undefined);
    const tryStr = (v: unknown) =>
      typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined;

    return (
      tryNum(p.user_id) ??
      tryNum(p.userId) ??
      tryNum(p.id) ??
      tryStr(p.user_id) ??
      tryStr(p.userId) ??
      tryStr(p.id) ??
      0
    );
  }
  return 0;
}

const DRAFT_KEY = 'mt_create_course_draft_v1';

type CreateCourseDraft = {
  step: number;
  priceInput: string; // tokens as string input
  formData: CoursePayload;
  freeCourse?: boolean;
};

function isDraft(obj: unknown): obj is CreateCourseDraft {
  if (!obj || typeof obj !== 'object') return false;
  const d = obj as Partial<CreateCourseDraft>;
  return (
    typeof d.step === 'number' &&
    typeof d.priceInput === 'string' &&
    typeof d.formData === 'object' &&
    d.formData !== null
  );
}

type EditableSyllabusField = 'topic' | 'assignment' | 'videoUrl' | 'notesUrl';
type FieldName = 'title' | 'description' | 'level' | 'duration' | 'prerequisites';

const LEVEL_OPTIONS: Option[] = [
  { label: 'Beginner', value: 'Beginner' },
  { label: 'Intermediate', value: 'Intermediate' },
  { label: 'Advanced', value: 'Advanced' },
  { label: 'All Levels', value: 'All Levels' },
];

/* ───────── Screen ───────── */

const CreateCourseScreen: React.FC = () => {
  const { backendUrl, token, profile } = useShopContext() as any;
  const { addCourse, loading, error } = useCourses({ backendUrl, token });

  const insets = useSafeAreaInsets();
  const FOOTER_OFFSET = 80; // height reserved for global footer
  const ACTION_BAR_HEIGHT = 60; // internal action bar
  const bottomPad = Math.max(insets.bottom, 16);
  const topPad = Math.max(insets.top, 12);

  const [uploadPct, setUploadPct] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);

  const [priceInput, setPriceInput] = useState<string>('');
  const [freeCourse, setFreeCourse] = useState<boolean>(false);

  const [formData, setFormData] = useState<CoursePayload>({
    tutorId: deriveTutorId(profile),
    title: '',
    description: '',
    level: 'Beginner',
    duration: '',
    price: 0, // tokens
    prerequisites: '',
    syllabus: [],
  });

  // which weeks are expanded
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({});

  const setCappedPct = (key: string, pct: number) =>
    setUploadPct((prev) => ({
      ...prev,
      [key]: Math.min(95, Math.max(prev[key] ?? 0, Math.round(pct))),
    }));

  const markUploadDone = (key: string) => {
    setUploadPct((prev) => ({ ...prev, [key]: 100 }));
    setTimeout(() => {
      setUploadPct((prev) => ({ ...prev, [key]: 0 }));
    }, 600);
  };

  const updateField = (field: FieldName, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /* ───────── Load draft (AsyncStorage) ───────── */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (!isDraft(parsed)) return;

        const resolvedTutorId = deriveTutorId(profile);
        const fd = parsed.formData;
        const mergedForm: CoursePayload = {
          ...fd,
          tutorId: resolvedTutorId || fd.tutorId || 0,
          syllabus: Array.isArray(fd.syllabus) ? fd.syllabus : [],
        };

        if (!cancelled) {
          setFormData(mergedForm);
          setPriceInput(parsed.priceInput);
          setStep(Number.isFinite(parsed.step) ? parsed.step : 0);
          setFreeCourse(Boolean((parsed as any).freeCourse));
        }
      } catch {
        // ignore corrupt draft
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  /* ───────── Keep tutorId in sync ───────── */

  useEffect(() => {
    const tid = deriveTutorId(profile);
    if (tid && tid !== formData.tutorId) {
      setFormData((prev) => ({ ...prev, tutorId: tid }));
    }
  }, [profile, formData.tutorId]);

  /* ───────── Auto-size syllabus from duration ───────── */

  useEffect(() => {
    const weeks = parseWeeks(formData.duration ?? '');
    setFormData((prev) => {
      const current = prev.syllabus ?? [];
      const trimmed = current
        .slice(0, weeks)
        .map((s, i) => ({ ...s, week: i + 1 }));
      const next: SyllabusItem[] = [...trimmed];
      for (let i = trimmed.length; i < weeks; i++) {
        next.push({ week: i + 1, topic: '', assignment: '' });
      }
      return { ...prev, syllabus: next };
    });
  }, [formData.duration]);

  /* ───────── Persist draft ───────── */

  useEffect(() => {
    const draft: CreateCourseDraft = { step, priceInput, formData, freeCourse };
    (async () => {
      try {
        await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // storage may be full or blocked
      }
    })();
  }, [step, priceInput, formData, freeCourse]);

  /* ───────── Syllabus change ───────── */

  const handleSyllabusChange = (
    index: number,
    field: EditableSyllabusField,
    value: string,
  ) => {
    setFormData((prev) => {
      const base = prev.syllabus ?? [];
      const next = base.map((w, i) =>
        i === index ? { ...w, [field]: value } : w,
      );
      return { ...prev, syllabus: next };
    });
  };

  const toggleWeekOpen = useCallback((index: number) => {
    setOpenWeeks((prev) => {
      const current = prev[index] ?? index < 2; // default open first two
      return { ...prev, [index]: !current };
    });
  }, []);

  /* ───────── Upload helpers ───────── */

  const guardUpload = () => {
    if (!backendUrl || !token) {
      Alert.alert('Upload not available', 'Missing backend URL or auth token.');
      return false;
    }
    return true;
  };

  const handleVideoFileUpload = async (
    index: number,
    asset: DocumentPicker.DocumentPickerAsset | null,
  ) => {
    if (!asset) return;
    if (!guardUpload()) return;
    const key = `v-${index}`;
    try {
      const onProgress = (p: number) => setCappedPct(key, p);

      const file: any = {
        uri: asset.uri,
        name: asset.name || `video-${Date.now()}.mp4`,
        type: asset.mimeType || 'video/mp4',
      };

      const { url } = await uploadClassVaultAsset(
        backendUrl!,
        token!,
        file,
        'video',
        onProgress,
        { folder: 'courses' },
      );

      setFormData((prev) => {
        const base = prev.syllabus ?? [];
        const next = base.map((w, i) =>
          i === index ? { ...w, videoUrl: url } : w,
        );
        return { ...prev, syllabus: next };
      });

      markUploadDone(key);
    } catch (e) {
      console.error('[CreateCourse.native] video upload failed', e);
      Alert.alert('Video upload failed', 'Please try again.');
      setUploadPct((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  const handleNotesPdfUpload = async (
    index: number,
    asset: DocumentPicker.DocumentPickerAsset | null,
  ) => {
    if (!asset) return;
    if (!guardUpload()) return;
    const key = `n-${index}`;
    try {
      const onProgress = (p: number) => setCappedPct(key, p);

      const file: any = {
        uri: asset.uri,
        name: asset.name || `notes-${Date.now()}.pdf`,
        type: asset.mimeType || 'application/pdf',
      };

      const { url } = await uploadClassVaultAsset(
        backendUrl!,
        token!,
        file,
        'pdf',
        onProgress,
        { folder: 'courses' },
      );

      setFormData((prev) => {
        const base = prev.syllabus ?? [];
        const next = base.map((w, i) =>
          i === index ? { ...w, notesUrl: url } : w,
        );
        return { ...prev, syllabus: next };
      });

      markUploadDone(key);
    } catch (e) {
      console.error('[CreateCourse.native] PDF upload failed', e);
      Alert.alert('Notes upload failed', 'Please try again.');
      setUploadPct((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  const fileUploading = useMemo(
    () =>
      Object.values(uploadPct).some(
        (p) => (p ?? 0) > 0 && (p ?? 0) < 100,
      ),
    [uploadPct],
  );

  const overallUploadPct = useMemo(() => {
    const vals = Object.values(uploadPct)
      .map((p) => p ?? 0)
      .filter((p) => p > 0 && p <= 100);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [uploadPct]);

  /* ───────── Submit ───────── */

  const handleSubmit = async () => {
    if (!formData.tutorId) {
      Alert.alert('Missing tutor', 'Missing tutor id. Please sign in again.');
      return;
    }

    let tokensToSend = 0;
    if (!freeCourse) {
      const trimmed = priceInput.trim();
      const parsed = trimmed === '' ? NaN : Number(trimmed);
      if (
        !Number.isFinite(parsed) ||
        parsed < 0 ||
        !Number.isInteger(parsed)
      ) {
        Alert.alert(
          'Invalid price',
          'Please enter a valid non-negative whole number of tokens, or mark the course as Free.',
        );
        return;
      }
      tokensToSend = parsed;
    }

    const cleanSyllabus = (formData.syllabus ?? [])
      .filter(
        (s) =>
          (s.topic?.trim().length ?? 0) > 0 ||
          (s.assignment?.trim().length ?? 0) > 0 ||
          (s.videoUrl?.trim().length ?? 0) > 0 ||
          (s.notesUrl?.trim().length ?? 0) > 0,
      )
      .map((s, i) => ({ ...s, week: i + 1 }));

    const payload: CoursePayload = {
      ...formData,
      price: tokensToSend,
      syllabus: cleanSyllabus,
    };

    try {
      await addCourse(payload);
      try {
        await AsyncStorage.removeItem(DRAFT_KEY);
      } catch {}

      setFormData({
        tutorId: deriveTutorId(profile),
        title: '',
        description: '',
        level: 'Beginner',
        duration: '',
        price: 0,
        prerequisites: '',
        syllabus: [],
      });
      setFreeCourse(false);
      setPriceInput('');
      setUploadPct({});
      setStep(0);

      Alert.alert('Success', 'Course created successfully!');
    } catch (err: any) {
      const e = err as {
        message?: string;
        response?: { data?: { error?: string; message?: string } };
      };
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        'Failed to create course.';
      console.error('[CreateCourse.native] submit error', err);
      Alert.alert('Error', msg);
    }
  };

  /* ───────── Validation ───────── */

  const canNext = useMemo(() => {
    if (step === 0) {
      return (
        formData.title.trim().length > 3 &&
        !!formData.description?.trim()
      );
    }
    if (step === 1) {
      const weeksOk = parseWeeks(formData.duration ?? '') >= 1;
      if (freeCourse) return weeksOk;
      const trimmed = priceInput.trim();
      const parsed = trimmed === '' ? NaN : Number(trimmed);
      const priceOk =
        Number.isFinite(parsed) &&
        parsed >= 0 &&
        Number.isInteger(parsed);
      return weeksOk && priceOk;
    }
    if (step === 2) {
      return (formData.syllabus ?? []).some(
        (w) =>
          (w.topic?.trim().length ?? 0) > 0 ||
          (w.assignment?.trim().length ?? 0) > 0 ||
          (w.videoUrl?.trim().length ?? 0) > 0 ||
          (w.notesUrl?.trim().length ?? 0) > 0,
      );
    }
    return true;
  }, [step, formData, priceInput, freeCourse]);

  const tokensForDisplay =
    freeCourse
      ? 0
      : priceInput.trim() !== '' &&
        Number.isFinite(Number(priceInput))
      ? Number(priceInput)
      : formData.price;

  const priceFmtTokens = `${Number(
    tokensForDisplay || 0,
  )} Tokens (≈ $${Number(tokensForDisplay || 0)} USD)`;

  const progressPct = ((step + 1) / steps.length) * 100;

  const clearDraft = () => {
    (async () => {
      try {
        await AsyncStorage.removeItem(DRAFT_KEY);
      } catch {}
    })();
    setPriceInput('');
    setFreeCourse(false);
    setFormData((prev) => ({
      ...prev,
      title: '',
      description: '',
      level: 'Beginner',
      duration: '',
      prerequisites: '',
      syllabus: [],
    }));
    setStep(0);
  };

  /* ───────── UI ───────── */

  const cleanSyllabusReview = useMemo(
    () =>
      (formData.syllabus ?? [])
        .filter(
          (s) =>
            (s.topic?.trim().length ?? 0) > 0 ||
            (s.assignment?.trim().length ?? 0) > 0 ||
            (s.videoUrl?.trim().length ?? 0) > 0 ||
            (s.notesUrl?.trim().length ?? 0) > 0,
        )
        .map((s, i) => ({ ...s, week: i + 1 })),
    [formData.syllabus],
  );

  return (
    <SafeAreaView
      style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
      edges={['top', 'bottom']}
    >
      {/* Soft background blobs (like FindTutor) */}
      <View style={tw`absolute inset-0`}>
        <View
          style={tw`absolute -top-16 -right-10 h-36 w-36 rounded-full bg-blue-500/10 dark:bg-blue-500/15`}
        />
        <View
          style={tw`absolute -bottom-24 -left-20 h-44 w-44 rounded-full bg-indigo-500/10 dark:bg-indigo-500/15`}
        />
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`pb-6`,
          {
            paddingTop: topPad + 4,
            paddingBottom:
              bottomPad + FOOTER_OFFSET + ACTION_BAR_HEIGHT + 12,
            paddingHorizontal: 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={tw`flex-row items-center justify-between mb-3 mt-2`}
        >
          <View style={tw`flex-row items-center flex-1 pr-2`}>
            <View
              style={tw`h-9 w-9 rounded-xl bg-blue-600 items-center justify-center shadow-sm`}
            >
              <Text style={tw`text-white text-lg`}>📘</Text>
            </View>
            <View style={tw`ml-3 flex-1`}>
              <Text
                style={tw`text-[18px] font-extrabold text-slate-900 dark:text-white`}
              >
                Create a New Course
              </Text>
              <View style={tw`flex-row items-center mt-1`}>
                <Text
                  style={tw`text-[11px] text-slate-500 dark:text-slate-400`}
                >
                  Autosaves locally •{' '}
                </Text>
                <Pressable onPress={clearDraft}>
                  <Text
                    style={tw`text-[11px] underline text-slate-700 dark:text-slate-200`}
                  >
                    Clear draft
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Stepper summary */}
          <View style={tw`flex-row items-center`}>
            {steps.map((label, idx) => {
              const active = idx === step;
              const done = idx < step;
              return (
                <View key={label} style={tw`flex-row items-center`}>
                  <View
                    style={tw.style(
                      'h-8 w-8 rounded-full items-center justify-center',
                      done
                        ? 'bg-emerald-600'
                        : active
                        ? 'bg-blue-600'
                        : 'bg-slate-200 dark:bg-slate-700',
                    )}
                  >
                    <Text
                      style={tw.style(
                        'text-xs font-semibold',
                        done || active
                          ? 'text-white'
                          : 'text-slate-700 dark:text-slate-300',
                      )}
                    >
                      {idx + 1}
                    </Text>
                  </View>
                  {idx < steps.length - 1 && (
                    <View
                      style={tw`mx-1 h-[2px] w-6 rounded bg-slate-200 dark:bg-slate-700`}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Progress bar */}
        <View
          style={tw`h-1 rounded-full bg-slate-200/70 dark:bg-white/10 mb-4`}
        >
          <View
            style={[
              tw`h-full rounded-full bg-blue-600`,
              { width: `${progressPct}%` },
            ]}
          />
        </View>

        {/* Step label for small view */}
        <Text
          style={tw`text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2`}
        >
          Step {step + 1} of {steps.length} · {steps[step]}
        </Text>

        {/* Main card */}
        <View
          style={tw`rounded-2xl bg-white dark:bg-[#0f1821] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden`}
        >
          <View style={tw`p-4`}>
            {/* Step 0: Basic Info */}
            {step === 0 && (
              <View style={tw`gap-y-4`}>
                {/* Title */}
                <View>
                  <Text
                    style={tw`text-sm font-medium text-slate-700 dark:text-slate-200 mb-1`}
                  >
                    Course Title
                  </Text>
                  <TextInput
                    value={formData.title}
                    onChangeText={(t) => updateField('title', t)}
                    placeholder="e.g., Calculus I: Limits to Derivatives"
                    placeholderTextColor="#64748b"
                    style={tw`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-white`}
                  />
                </View>

                {/* Description */}
                <View>
                  <Text
                    style={tw`text-sm font-medium text-slate-700 dark:text-slate-200 mb-1`}
                  >
                    Description
                  </Text>
                  <TextInput
                    value={formData.description ?? ''}
                    onChangeText={(t) => updateField('description', t)}
                    placeholder="What will learners achieve? Who is it for?"
                    placeholderTextColor="#64748b"
                    style={tw`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-white`}
                    multiline
                    textAlignVertical="top"
                    numberOfLines={5}
                  />
                </View>

                {/* Level */}
                <View>
                  <Text
                    style={tw`text-sm font-medium text-slate-700 dark:text-slate-200 mb-1`}
                  >
                    Level
                  </Text>
                  <View
                    style={tw`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-1 py-1`}
                  >
                    <SelectField
                      value={formData.level || 'Beginner'}
                      onChange={(val) => updateField('level', String(val))}
                      options={LEVEL_OPTIONS}
                      placeholder="Select level…"
                      modalTitle="Select course level"
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Step 1: Details */}
            {step === 1 && (
              <View style={tw`gap-y-4`}>
                {/* Duration */}
                <View>
                  <Text
                    style={tw`text-sm font-medium text-slate-700 dark:text-slate-200 mb-1`}
                  >
                    Duration
                  </Text>
                  <TextInput
                    value={formData.duration ?? ''}
                    onChangeText={(t) => updateField('duration', t)}
                    placeholder="e.g., 8 weeks"
                    placeholderTextColor="#64748b"
                    style={tw`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-white`}
                  />
                  <Text
                    style={tw`mt-1 text-[11px] text-slate-500 dark:text-slate-400`}
                  >
                    Tip: type "8 weeks", "8weeks", or "8w". We’ll size the
                    syllabus automatically.
                  </Text>
                </View>

                {/* Free course toggle */}
                <Pressable
                  onPress={() => {
                    const next = !freeCourse;
                    setFreeCourse(next);
                    if (next) setPriceInput('');
                  }}
                  style={tw`flex-row items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3`}
                >
                  <View
                    style={tw`mt-0.5 h-4 w-4 rounded border border-slate-400 dark:border-slate-500 items-center justify-center bg-white dark:bg-[#0f1821]`}
                  >
                    {freeCourse && (
                      <View
                        style={tw`h-3 w-3 rounded bg-emerald-500`}
                      />
                    )}
                  </View>
                  <View style={tw`flex-1`}>
                    <Text
                      style={tw`text-sm font-medium text-slate-800 dark:text-slate-100`}
                    >
                      This is a free course
                    </Text>
                    <Text
                      style={tw`text-xs text-slate-600 dark:text-slate-300 mt-0.5`}
                    >
                      Learners will enroll at no cost. The price field will
                      be disabled and saved as 0 Tokens.
                    </Text>
                  </View>
                </Pressable>

                {/* Price */}
                <View>
                  <View style={tw`flex-row items-baseline mb-1`}>
                    <Text
                      style={tw`text-sm font-medium text-slate-700 dark:text-slate-200`}
                    >
                      Price (Tokens)
                    </Text>
                    {freeCourse && (
                      <Text
                        style={tw`ml-2 text-xs text-slate-500 dark:text-slate-400`}
                      >
                        (disabled for Free)
                      </Text>
                    )}
                  </View>
                  <TextInput
                    value={freeCourse ? '' : priceInput}
                    onChangeText={setPriceInput}
                    editable={!freeCourse}
                    keyboardType="number-pad"
                    placeholder={
                      freeCourse
                        ? 'Free course selected'
                        : 'e.g., 5 (Tokens)'
                    }
                    placeholderTextColor="#64748b"
                    style={tw.style(
                      'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-white',
                      freeCourse ? 'opacity-60' : '',
                    )}
                  />
                  <Text
                    style={tw`mt-1 text-[11px] text-slate-500 dark:text-slate-400`}
                  >
                    1 Token = 1 USD (charged in tokens, shown here as whole
                    numbers).
                  </Text>
                </View>

                {/* Prerequisites */}
                <View>
                  <Text
                    style={tw`text-sm font-medium text-slate-700 dark:text-slate-200 mb-1`}
                  >
                    Prerequisites (optional)
                  </Text>
                  <TextInput
                    value={formData.prerequisites ?? ''}
                    onChangeText={(t) =>
                      updateField('prerequisites', t)
                    }
                    placeholder="e.g., Basic algebra, comfort with functions"
                    placeholderTextColor="#64748b"
                    style={tw`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-white`}
                    multiline
                    textAlignVertical="top"
                    numberOfLines={4}
                  />
                </View>
              </View>
            )}

            {/* Step 2: Syllabus */}
            {step === 2 && (
              <View style={tw`gap-y-4`}>
                <View
                  style={tw`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3`}
                >
                  <Text
                    style={tw`text-sm text-slate-600 dark:text-slate-300`}
                  >
                    Syllabus for{' '}
                    <Text style={tw`font-semibold`}>
                      {parseWeeks(formData.duration ?? '')}
                    </Text>{' '}
                    week
                    {parseWeeks(formData.duration ?? '') === 1 ? '' : 's'}{' '}
                    (auto-sized from duration)
                  </Text>
                </View>

                <View style={tw`gap-y-3`}>
                  {(formData.syllabus ?? []).map((item, index) => {
                    const isOpen =
                      openWeeks[index] ?? index < 2; // default open first 2
                    return (
                      <View
                        key={index}
                        style={tw`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1821] overflow-hidden`}
                      >
                        {/* Summary / header */}
                        <Pressable
                          onPress={() => toggleWeekOpen(index)}
                          style={tw`flex-row items-center justify-between px-4 py-3`}
                        >
                          <View style={tw`flex-row items-center gap-2`}>
                            <View
                              style={tw`h-6 w-6 rounded-lg bg-blue-600/10 items-center justify-center`}
                            >
                              <Text
                                style={tw`text-xs font-semibold text-blue-700 dark:text-blue-300`}
                              >
                                {item.week}
                              </Text>
                            </View>
                            <Text
                              style={tw`text-sm font-semibold text-slate-800 dark:text-slate-100`}
                            >
                              {item.topic?.trim()
                                ? item.topic
                                : `Week ${item.week}`}
                            </Text>
                          </View>
                          <Text
                            style={tw`text-base text-slate-500`}
                          >
                            {isOpen ? '⌃' : '⌄'}
                          </Text>
                        </Pressable>

                        {/* Body */}
                        {isOpen && (
                          <View style={tw`px-4 pb-4 gap-y-3`}>
                            <TextInput
                              value={item.topic ?? ''}
                              onChangeText={(t) =>
                                handleSyllabusChange(
                                  index,
                                  'topic',
                                  t,
                                )
                              }
                              placeholder="Topic (e.g., Limits & Continuity)"
                              placeholderTextColor="#64748b"
                              style={tw`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 text-slate-900 dark:text-white`}
                            />

                            <TextInput
                              value={item.assignment ?? ''}
                              onChangeText={(t) =>
                                handleSyllabusChange(
                                  index,
                                  'assignment',
                                  t,
                                )
                              }
                              placeholder="Notes/Assignment"
                              placeholderTextColor="#64748b"
                              style={tw`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-3 text-slate-900 dark:text-white`}
                              multiline
                              textAlignVertical="top"
                              numberOfLines={4}
                            />

                            <View
                              style={tw`flex-col sm:flex-row gap-3`}
                            >
                              {/* Video URL + upload */}
                              <View style={tw`flex-1 gap-y-2`}>
                                <TextInput
                                  value={item.videoUrl ?? ''}
                                  onChangeText={(t) =>
                                    handleSyllabusChange(
                                      index,
                                      'videoUrl',
                                      t,
                                    )
                                  }
                                  placeholder="Optional: Video URL (YouTube/Vimeo/MP4)"
                                  placeholderTextColor="#64748b"
                                  style={tw`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 text-slate-900 dark:text-white`}
                                />
                                <View>
                                  <View
                                    style={tw`flex-row items-center justify-between`}
                                  >
                                    <Text
                                      style={tw`text-xs text-slate-600 dark:text-slate-300`}
                                    >
                                      Or upload video file
                                    </Text>
                                    {(uploadPct[`n-${index}`] ?? 0) > 0 && (
                                      <Text style={tw`text-xs text-slate-500`}>
                                        Uploading… {Math.round(uploadPct[`n-${index}`] ?? 0)}%
                                      </Text>
                                    )}
                                  </View>
                                  <Pressable
                                    onPress={async () => {
                                      try {
                                        const res =
                                          await DocumentPicker.getDocumentAsync(
                                            {
                                              type: 'video/*',
                                              multiple: false,
                                              copyToCacheDirectory: true,
                                            },
                                          );
                                        if (res.canceled) return;
                                        const asset =
                                          res.assets?.[0] ?? null;
                                        await handleVideoFileUpload(
                                          index,
                                          asset,
                                        );
                                      } catch (e) {
                                        console.error(
                                          '[CreateCourse.native] pick video error',
                                          e,
                                        );
                                      }
                                    }}
                                    style={tw`mt-1 w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-[#132133] px-3 py-2 items-center justify-center`}
                                  >
                                    <Text
                                      style={tw`text-xs font-semibold text-blue-700 dark:text-blue-300`}
                                    >
                                      Choose video file
                                    </Text>
                                  </Pressable>
                                  {item.videoUrl &&
                                    item.videoUrl.length > 0 && (
                                      <Text
                                        numberOfLines={2}
                                        ellipsizeMode="tail"
                                        style={tw`mt-1 text-xs text-blue-600`}
                                      >
                                        {item.videoUrl}
                                      </Text>
                                    )}
                                </View>
                              </View>

                              {/* Notes URL + upload */}
                              <View style={tw`flex-1 gap-y-2`}>
                                <TextInput
                                  value={item.notesUrl ?? ''}
                                  onChangeText={(t) =>
                                    handleSyllabusChange(
                                      index,
                                      'notesUrl',
                                      t,
                                    )
                                  }
                                  placeholder="Optional: Notes URL (PDF/Doc)"
                                  placeholderTextColor="#64748b"
                                  style={tw`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] px-3 py-2 text-slate-900 dark:text-white`}
                                />
                                <View>
                                  <View
                                    style={tw`flex-row items-center justify-between`}
                                  >
                                    <Text
                                      style={tw`text-xs text-slate-600 dark:text-slate-300`}
                                    >
                                      Or upload notes (PDF)
                                    </Text>
                                    {(uploadPct[`v-${index}`] ?? 0) > 0 && (
                                      <Text style={tw`text-xs text-slate-500`}>
                                        Uploading… {Math.round(uploadPct[`v-${index}`] ?? 0)}%
                                      </Text>
                                    )}
                                  </View>
                                  <Pressable
                                    onPress={async () => {
                                      try {
                                        const res =
                                          await DocumentPicker.getDocumentAsync(
                                            {
                                              type: 'application/pdf',
                                              multiple: false,
                                              copyToCacheDirectory: true,
                                            },
                                          );
                                        if (res.canceled) return;
                                        const asset =
                                          res.assets?.[0] ?? null;
                                        await handleNotesPdfUpload(
                                          index,
                                          asset,
                                        );
                                      } catch (e) {
                                        console.error(
                                          '[CreateCourse.native] pick pdf error',
                                          e,
                                        );
                                      }
                                    }}
                                    style={tw`mt-1 w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-[#132133] px-3 py-2 items-center justify-center`}
                                  >
                                    <Text
                                      style={tw`text-xs font-semibold text-indigo-700 dark:text-indigo-300`}
                                    >
                                      Choose PDF file
                                    </Text>
                                  </Pressable>
                                  {item.notesUrl &&
                                    item.notesUrl.length > 0 && (
                                      <Text
                                        numberOfLines={2}
                                        ellipsizeMode="tail"
                                        style={tw`mt-1 text-xs text-blue-600`}
                                      >
                                        {item.notesUrl}
                                      </Text>
                                    )}
                                </View>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <View style={tw`gap-y-4`}>
                <View
                  style={tw`flex-row flex-wrap gap-3`}
                >
                  {/* Title */}
                  <View
                    style={tw`flex-1 min-w-[48%] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3`}
                  >
                    <Text
                      style={tw`text-[11px] text-slate-500 dark:text-slate-400 mb-1`}
                    >
                      Title
                    </Text>
                    <Text
                      style={tw`font-semibold text-slate-900 dark:text-white`}
                    >
                      {formData.title || '—'}
                    </Text>
                  </View>

                  {/* Level */}
                  <View
                    style={tw`flex-1 min-w-[48%] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3`}
                  >
                    <Text
                      style={tw`text-[11px] text-slate-500 dark:text-slate-400 mb-1`}
                    >
                      Level
                    </Text>
                    <Text
                      style={tw`font-semibold text-slate-900 dark:text-white`}
                    >
                      {formData.level}
                    </Text>
                  </View>

                  {/* Duration */}
                  <View
                    style={tw`flex-1 min-w-[48%] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3`}
                  >
                    <Text
                      style={tw`text-[11px] text-slate-500 dark:text-slate-400 mb-1`}
                    >
                      Duration
                    </Text>
                    <Text
                      style={tw`font-semibold text-slate-900 dark:text-white`}
                    >
                      {formData.duration || '—'}
                    </Text>
                  </View>

                  {/* Price */}
                  <View
                    style={tw`flex-1 min-w-[48%] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3`}
                  >
                    <Text
                      style={tw`text-[11px] text-slate-500 dark:text-slate-400 mb-1`}
                    >
                      Price
                    </Text>
                    {freeCourse ? (
                      <View style={tw`flex-row items-center gap-2`}>
                        <View
                          style={tw`px-2 py-1 rounded-lg bg-emerald-600/10`}
                        >
                          <Text
                            style={tw`text-xs font-semibold text-emerald-700 dark:text-emerald-300`}
                          >
                            Free
                          </Text>
                        </View>
                        <Text
                          style={tw`text-xs text-slate-500 dark:text-slate-400`}
                        >
                          (saved as 0 Tokens)
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={tw`font-semibold text-slate-900 dark:text-white`}
                      >
                        {priceFmtTokens}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Prereqs */}
                <View
                  style={tw`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3`}
                >
                  <Text
                    style={tw`text-[11px] text-slate-500 dark:text-slate-400 mb-1`}
                  >
                    Prerequisites
                  </Text>
                  <Text
                    style={tw`text-sm text-slate-900 dark:text-white`}
                  >
                    {formData.prerequisites || '—'}
                  </Text>
                </View>

                {/* Syllabus */}
                <View
                  style={tw`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#172534] p-3`}
                >
                  <Text
                    style={tw`text-[11px] text-slate-500 dark:text-slate-400 mb-2`}
                  >
                    Syllabus ({cleanSyllabusReview.length} week
                    {cleanSyllabusReview.length === 1 ? '' : 's'})
                  </Text>
                  {cleanSyllabusReview.length === 0 ? (
                    <Text
                      style={tw`text-sm text-slate-700 dark:text-slate-300`}
                    >
                      —
                    </Text>
                  ) : (
                    <View style={tw`pl-4`}>
                      {cleanSyllabusReview.map((w) => (
                        <View
                          key={w.week}
                          style={tw`mb-2`}
                        >
                          <Text
                            style={tw`font-medium text-slate-900 dark:text-white`}
                          >
                            {w.week}. {w.topic || 'Untitled topic'}
                          </Text>

                          {w.assignment ? (
                            <Text
                              style={tw`text-xs text-slate-700 dark:text-slate-300 mt-1`}
                            >
                              <Text style={tw`font-semibold`}>
                                Assignment:{' '}
                              </Text>
                              {w.assignment}
                            </Text>
                          ) : null}

                          {w.videoUrl ? (
                            <Text
                              style={tw`text-xs text-slate-700 dark:text-slate-300 mt-1`}
                            >
                              <Text style={tw`font-semibold`}>
                                Video:{' '}
                              </Text>
                              {w.videoUrl}
                            </Text>
                          ) : null}

                          {w.notesUrl ? (
                            <Text
                              style={tw`text-xs text-slate-700 dark:text-slate-300 mt-1`}
                            >
                              <Text style={tw`font-semibold`}>
                                Notes:{' '}
                              </Text>
                              {w.notesUrl}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Global upload banner */}
          {fileUploading && (
            <View
              style={tw`mx-4 mb-4 rounded-xl border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50 dark:bg-[#1b2a3a] p-3`}
            >
              <Text
                style={tw`text-sm text-yellow-900 dark:text-yellow-100 mb-2`}
              >
                Uploading files… {overallUploadPct}%
              </Text>
              <View
                style={tw`w-full h-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden`}
              >
                <View
                  style={[
                    tw`h-full bg-blue-600`,
                    { width: `${overallUploadPct}%` },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        {error ? (
          <Text
            style={tw`mt-3 text-sm text-red-600 dark:text-red-400`}
          >
            {String(error)}
          </Text>
        ) : null}
      </ScrollView>

      {/* Sticky action bar – lifted above global footer */}
      <View
        style={[
          tw`border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1016]/95`,
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: bottomPad + FOOTER_OFFSET,
            paddingHorizontal: 16,
            paddingVertical: 8,
          },
        ]}
      >
        <View style={tw`flex-row items-center justify-between`}>
          <Text
            style={tw`text-[11px] text-slate-500 dark:text-slate-400`}
          >
            Step {step + 1} of {steps.length} • {steps[step]}
          </Text>
          <View style={tw`flex-row items-center gap-3`}>
            {step > 0 && (
              <Pressable
                onPress={() => setStep(step - 1)}
                style={tw`flex-row items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/0 dark:bg-white/0 px-4 py-2`}
              >
                <Text style={tw`text-sm text-slate-700 dark:text-slate-200`}>
                  ← Back
                </Text>
              </Pressable>
            )}

            {step < steps.length - 1 ? (
              <Pressable
                onPress={() =>
                  canNext && !fileUploading && setStep(step + 1)
                }
                disabled={!canNext || fileUploading}
                style={tw.style(
                  'flex-row items-center gap-1 rounded-xl px-4 py-2 shadow-sm',
                  canNext && !fileUploading
                    ? 'bg-blue-600'
                    : 'bg-slate-400',
                )}
              >
                <Text style={tw`text-sm text-white`}>
                  {fileUploading ? 'Uploading…' : 'Next →'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmit}
                disabled={loading || fileUploading || !formData.tutorId}
                style={tw.style(
                  'flex-row items-center gap-1 rounded-xl px-4 py-2 shadow-sm',
                  loading || fileUploading || !formData.tutorId
                    ? 'bg-slate-400'
                    : 'bg-emerald-600',
                )}
              >
                <Text style={tw`text-sm text-white`}>
                  {fileUploading
                    ? 'Uploading…'
                    : loading
                    ? 'Saving…'
                    : 'Create Course'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default CreateCourseScreen;

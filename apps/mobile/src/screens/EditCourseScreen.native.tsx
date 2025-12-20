// apps/mobile/src/screens/EditCourse.native.tsx

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import tw from '../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses } from '@mytutorapp/shared/hooks/useCourses';
import type { Course, CoursePayload, SyllabusItem } from '@mytutorapp/shared/types';
import SelectField, { type Option } from './SelectField.native';

/* ---------- helpers ---------- */
const levels = ['Beginner', 'Intermediate', 'Advanced', 'All Levels'] as const;
const LEVEL_OPTIONS: Option[] = levels.map((l) => ({
  label: l,
  value: l,
}));

const clampPrice = (n: number) => (Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0);

const parseWeeks = (input: string): number => {
  const m = String(input || '').match(/(\d{1,2})/);
  const n = m ? Number(m[1]) : 0;
  return Math.max(1, Math.min(52, Number.isFinite(n) ? n : 1));
};

const normalizeSyllabus = (list: SyllabusItem[] = []): SyllabusItem[] =>
  list
    .filter(
      (w) =>
        w.topic?.trim() ||
        '' ||
        w.assignment?.trim() ||
        '' ||
        w.videoUrl?.trim() ||
        '' ||
        w.notesUrl?.trim() ||
        ''
    )
    .map((w, i) => ({ ...w, week: i + 1 }));

/* ---------- reusable list (drawer content) ---------- */
function CoursesList({
  courses,
  q,
  setQ,
  selectedId,
  setSelectedId,
  onDelete,
  loading,
  error,
  onClose,
}: {
  courses: Course[];
  q: string;
  setQ: (s: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
  error: string | null;
  onClose?: () => void;
}) {
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return courses;
    return courses.filter((c) => {
      const title = (c.title ?? '').toLowerCase();
      const level = (c.level ?? '').toLowerCase();
      const duration = (c.duration ?? '').toLowerCase();
      return title.includes(qq) || level.includes(qq) || duration.includes(qq);
    });
  }, [q, courses]);

  return (
    <View style={tw`flex-1`}>
      <View style={tw`mb-3`}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by title, level, duration…"
          style={tw`rounded-xl border border-slate-200 px-3 py-2 bg-slate-50`}
        />
      </View>

      {loading && <Text style={tw`text-sm text-[#49739c]`}>Loading your courses…</Text>}
      {!loading && !!error && <Text style={tw`text-sm text-red-600`}>{error}</Text>}

      {!loading && !error && filtered.length === 0 && (
        <View style={tw`rounded-xl border border-slate-200 p-4`}>
          <Text style={tw`font-medium`}>No courses yet.</Text>
          <Text style={tw`text-sm text-[#49739c] mt-1`}>Create your first course.</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={tw`gap-2 pb-16`}>
        {filtered.map((c) => {
          const active = c.id === selectedId;
          return (
            <View
              key={c.id}
              style={tw.style(
                'rounded-xl border px-3 py-2 flex-row items-start gap-3',
                active ? 'border-blue-300 bg-[#e7edf4]' : 'border-slate-200 bg-white'
              )}
            >
              <TouchableOpacity
                style={tw`flex-1`}
                onPress={() => {
                  setSelectedId(c.id);
                  onClose?.();
                }}
              >
                <Text style={tw`font-semibold`} numberOfLines={2}>
                  {c.title || 'Untitled course'}
                </Text>
                <Text style={tw`text-xs text-[#49739c]`}>
                  {c.level ?? 'All Levels'} • {c.duration || '—'}
                </Text>
              </TouchableOpacity>

              <View style={tw`gap-2`}>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedId(c.id);
                    onClose?.();
                  }}
                  style={tw`h-9 px-3 rounded-lg bg-[#e7edf4] justify-center`}
                >
                  <Text style={tw`text-xs font-semibold`}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDelete(c.id)}
                  style={tw`h-9 px-3 rounded-lg bg-red-600/90 justify-center`}
                >
                  <Text style={tw`text-white text-xs`}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ---------- screen ---------- */
const EditCourseScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { backendUrl, token } = useShopContext();

  const {
    courses,
    selectedCourse,
    fetchMyCourses,
    fetchCourseById,
    editCourse,
    removeCourse,
    loading,
    error,
  } = useCourses({ backendUrl, token });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CoursePayload>>({
    title: '',
    description: '',
    level: 'Beginner',
    duration: '',
    price: 0,
    prerequisites: '',
    syllabus: [],
  });
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);

  // syllabus panel open/close states
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({});

  /* load tutor courses, then select first */
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const list = await fetchMyCourses();
        if (!ignore) setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      } catch {
        // ignore
      }
    })();
    return () => {
      ignore = true;
    };
  }, [fetchMyCourses]);

  /* when selectedId changes, fetch that course */
  useEffect(() => {
    if (!selectedId) return;
    fetchCourseById(selectedId).catch(() => {});
  }, [selectedId, fetchCourseById]);

  /* seed the editor when selectedCourse arrives */
  useEffect(() => {
    if (!selectedCourse) return;
    const c = selectedCourse as Course;
    setForm({
      title: c.title ?? '',
      description: c.description ?? '',
      level: (levels as unknown as string[]).includes(c.level as string)
        ? (c.level as any)
        : 'Beginner',
      duration: c.duration ?? '',
      price: Number(c.price ?? 0),
      prerequisites: c.prerequisites ?? '',
      syllabus: Array.isArray(c.syllabus) ? c.syllabus : [],
    });
    // default-expand first 2 weeks
    const ow: Record<number, boolean> = {};
    (c.syllabus || []).forEach((_, i) => {
      if (i < 2) ow[i] = true;
    });
    setOpenWeeks(ow);
  }, [selectedCourse]);

  const syllabusWeeks = useMemo(() => parseWeeks(String(form.duration || '')), [form.duration]);

  /* keep syllabus array length in sync if duration changes */
  useEffect(() => {
    setForm((prev) => {
      const current = Array.isArray(prev.syllabus) ? prev.syllabus : [];
      const trimmed = current.slice(0, syllabusWeeks).map((w, i) => ({ ...w, week: i + 1 }));
      const next = [...trimmed];
      for (let i = trimmed.length; i < syllabusWeeks; i++) {
        next.push({ week: i + 1, topic: '', assignment: '' });
      }
      return { ...prev, syllabus: next };
    });
  }, [syllabusWeeks]);

  const onChange = (name: keyof CoursePayload, value: string) => {
    setForm((p) => ({
      ...p,
      [name]: name === 'price' ? Number(value) : value,
    }));
  };

  const onSyllabusChange = (i: number, field: keyof SyllabusItem, value: string) => {
    setForm((prev) => {
      const base = Array.isArray(prev.syllabus) ? prev.syllabus : [];
      const next = base.map((w, idx) => (idx === i ? { ...w, [field]: value } : w));
      return { ...prev, syllabus: next };
    });
  };

  const canSave =
    !!selectedId &&
    (form.title ?? '').trim().length >= 3 &&
    (form.level ?? '').length > 0 &&
    Number.isFinite(Number(form.price)) &&
    Number(form.price) >= 0;

  const doSave = async () => {
    if (!canSave || !selectedId) return;
    setSaving(true);
    try {
      const patch = {
        title: (form.title ?? '').trim(),
        description: (form.description ?? '').trim(),
        level: form.level,
        duration: (form.duration ?? '').trim(),
        price: clampPrice(Number(form.price ?? 0)),
        prerequisites: (form.prerequisites ?? '').trim(),
        syllabus: normalizeSyllabus((form.syllabus as SyllabusItem[]) ?? []),
      };
      await editCourse(selectedId, patch);
      Alert.alert('Saved', 'Your changes have been saved.');
    } catch {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (id: string) => {
    Alert.alert('Delete course?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeCourse(id);
            Alert.alert('Deleted', 'Course removed.');
            if (id === selectedId) {
              const remaining = courses.filter((c) => c.id !== id);
              setSelectedId(remaining[0]?.id ?? null);
            }
          } catch {
            Alert.alert('Error', 'Failed to delete course.');
          }
        },
      },
    ]);
  };

  const editorScrollRef = useRef<ScrollView | null>(null);

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50`}>
      {/* Header */}
      <View style={tw`border-b border-slate-200 bg-white`}>
        <View style={tw`px-4 py-3 flex-row items-center justify-between`}>
          <View style={tw`flex-row items-center`}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={tw`rounded-xl border border-slate-200 bg-white h-10 px-3 justify-center mr-2`}
            >
              <Text>{'←'} Profile</Text>
            </TouchableOpacity>
            <View>
              <Text style={tw`text-lg font-extrabold`}>My Courses</Text>
              <Text style={tw`text-xs text-slate-500`}>
                Edit details, update syllabus, or delete
              </Text>
            </View>
          </View>

          <View style={tw`flex-row items-center`}>
            <TouchableOpacity
              onPress={() => setShowDrawer(true)}
              style={tw`md:hidden rounded-xl border border-slate-300 bg-white px-3 h-10 justify-center mr-2`}
            >
              <Text>Courses</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={doSave}
              disabled={!canSave || loading || saving}
              style={tw.style(
                'hidden',
                'sm:inline-flex',
                'rounded-xl px-4 h-10 justify-center',
                canSave && !saving ? 'bg-blue-600' : 'bg-slate-400'
              )}
            >
              <Text style={tw`text-white font-semibold`}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Body */}
      <KeyboardAvoidingKeyboardWrapper>
        <ScrollView ref={editorScrollRef} contentContainerStyle={tw`px-4 py-4 gap-y-4`}>
          {!selectedId && (
            <View style={tw`rounded-2xl border border-slate-200 bg-white p-6`}>
              <Text>Select a course to edit.</Text>
              <View style={tw`mt-3`}>
                <TouchableOpacity
                  onPress={() => setShowDrawer(true)}
                  style={tw`h-10 px-3 rounded-xl border border-slate-300 justify-center self-start`}
                >
                  <Text>Open my courses</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {selectedId && (
            <>
              {/* Basics */}
              <View style={tw`rounded-2xl border border-slate-200 bg-white p-4`}>
                <View style={tw`flex-row items-center justify-between mb-3`}>
                  <Text style={tw`text-lg font-bold`}>Basics</Text>
                  <View style={tw`flex-row items-center`}>
                    <TouchableOpacity
                      onPress={() => doDelete(selectedId)}
                      disabled={loading || saving}
                      style={tw`rounded-xl bg-red-600/90 px-3 h-10 justify-center mr-2`}
                    >
                      <Text style={tw`text-white text-sm font-semibold`}>Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={doSave}
                      disabled={!canSave || loading || saving}
                      style={tw.style(
                        'rounded-xl px-4 h-10 justify-center',
                        canSave && !saving ? 'bg-blue-600' : 'bg-slate-400'
                      )}
                    >
                      <Text style={tw`text-white text-sm font-semibold`}>
                        {saving ? 'Saving…' : 'Save changes'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={tw`gap-4`}>
                  <View>
                    <Text style={tw`text-sm font-medium`}>Title</Text>
                    <TextInput
                      value={form.title ?? ''}
                      onChangeText={(t) => onChange('title', t)}
                      placeholder="Course title"
                      style={tw`mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3`}
                    />
                  </View>

                  <View>
                    <Text style={tw`text-sm font-medium`}>Description</Text>
                    <TextInput
                      value={form.description ?? ''}
                      onChangeText={(t) => onChange('description', t)}
                      placeholder="What will learners achieve?"
                      multiline
                      style={tw`mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 min-h-28`}
                    />
                  </View>

                  <View style={tw`sm:flex-row sm:gap-4`}>
                    {/* Level */}
                    <View style={tw`mb-4`}>
                      <Text style={tw`text-sm font-medium`}>Level</Text>
                      <View
                        style={tw`mt-2 rounded-xl border border-slate-200 bg-slate-50 px-1 py-1`}
                      >
                        <SelectField
                          value={(form.level as string) || 'Beginner'}
                          onChange={(v) => onChange('level', String(v))}
                          options={LEVEL_OPTIONS}
                          placeholder="Select level…"
                          modalTitle="Select course level"
                        />
                      </View>
                    </View>

                    {/* Duration */}
                    <View style={tw`mb-4`}>
                      <Text style={tw`text-sm font-medium`}>Duration</Text>
                      <TextInput
                        value={String(form.duration ?? '')}
                        onChangeText={(t) => onChange('duration', t)}
                        placeholder="e.g., 8 weeks"
                        style={tw`mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3`}
                      />
                      <Text style={tw`text-xs text-slate-500 mt-1`}>
                        Weeks auto-size syllabus. Currently:{' '}
                        <Text style={tw`font-bold`}>{syllabusWeeks}</Text>
                      </Text>
                    </View>

                    {/* Price */}
                    <View>
                      <Text style={tw`text-sm font-medium`}>Price (USD)</Text>
                      <TextInput
                        value={String(form.price ?? 0)}
                        onChangeText={(t) => onChange('price', t)}
                        keyboardType="decimal-pad"
                        style={tw`mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3`}
                      />
                    </View>
                  </View>

                  <View>
                    <Text style={tw`text-sm font-medium`}>Prerequisites (optional)</Text>
                    <TextInput
                      value={form.prerequisites ?? ''}
                      onChangeText={(t) => onChange('prerequisites', t)}
                      placeholder="What should learners know first?"
                      multiline
                      style={tw`mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 min-h-20`}
                    />
                  </View>
                </View>
              </View>

              {/* Syllabus */}
              <View style={tw`rounded-2xl border border-slate-200 bg-white p-4`}>
                <View style={tw`flex-row items-center justify-between mb-2`}>
                  <Text style={tw`text-lg font-bold`}>Syllabus</Text>
                  <Text style={tw`text-sm text-slate-500`}>
                    Showing {syllabusWeeks} week
                    {syllabusWeeks === 1 ? '' : 's'}
                  </Text>
                </View>

                <View style={tw`gap-3`}>
                  {(form.syllabus ?? []).map((w, i) => {
                    const isOpen = !!openWeeks[i];
                    return (
                      <View key={i} style={tw`rounded-xl border border-slate-200 bg-white`}>
                        <TouchableOpacity
                          onPress={() =>
                            setOpenWeeks((s) => ({
                              ...s,
                              [i]: !s[i],
                            }))
                          }
                          style={tw`px-4 py-3 flex-row items-center justify-between`}
                        >
                          <View style={tw`flex-row items-center gap-2`}>
                            <View
                              style={tw`h-6 w-6 rounded-lg bg-blue-600/10 items-center justify-center`}
                            >
                              <Text style={tw`text-blue-700 text-xs font-semibold`}>{i + 1}</Text>
                            </View>
                            <Text style={tw`text-sm font-semibold`} numberOfLines={1}>
                              {w.topic?.trim() || `Week ${i + 1}`}
                            </Text>
                          </View>
                          <Text style={tw`text-slate-500`}>{isOpen ? '▴' : '▾'}</Text>
                        </TouchableOpacity>

                        {isOpen && (
                          <View style={tw`px-4 pb-4 gap-3`}>
                            <TextInput
                              value={w.topic ?? ''}
                              onChangeText={(t) => onSyllabusChange(i, 'topic', t)}
                              placeholder="Topic"
                              style={tw`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2`}
                            />
                            <TextInput
                              value={w.assignment ?? ''}
                              onChangeText={(t) => onSyllabusChange(i, 'assignment', t)}
                              placeholder="Notes / Assignment"
                              multiline
                              style={tw`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 min-h-20`}
                            />
                            <View style={tw`gap-2`}>
                              <TextInput
                                value={w.videoUrl ?? ''}
                                onChangeText={(t) => onSyllabusChange(i, 'videoUrl', t)}
                                placeholder="Video URL (optional)"
                                style={tw`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2`}
                              />
                              <TextInput
                                value={w.notesUrl ?? ''}
                                onChangeText={(t) => onSyllabusChange(i, 'notesUrl', t)}
                                placeholder="Notes URL (optional)"
                                style={tw`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2`}
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Sticky save (mobile) */}
                <View style={tw`mt-4`}>
                  <TouchableOpacity
                    onPress={doSave}
                    disabled={!canSave || loading || saving}
                    style={tw.style(
                      'rounded-xl px-4 h-10 justify-center self-end',
                      canSave && !saving ? 'bg-blue-600' : 'bg-slate-400'
                    )}
                  >
                    <Text style={tw`text-white text-sm font-semibold`}>
                      {saving ? 'Saving…' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingKeyboardWrapper>

      {/* Drawer (mobile) */}
      <Modal
        visible={showDrawer}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDrawer(false)}
      >
        <View style={tw`flex-1 bg-black/40`}>
          <SafeAreaView style={tw`flex-1`}>
            <View style={tw`absolute inset-y-0 left-0 w-5/6 max-w-[340px] bg-white p-4`}>
              <View style={tw`flex-row items-center justify-between mb-2`}>
                <Text style={tw`text-base font-semibold`}>My Courses</Text>
                <TouchableOpacity
                  onPress={() => setShowDrawer(false)}
                  style={tw`rounded-lg border border-slate-200 h-9 px-3 justify-center`}
                >
                  <Text>Close</Text>
                </TouchableOpacity>
              </View>
              <View style={tw`flex-1`}>
                <CoursesList
                  courses={courses}
                  q={q}
                  setQ={setQ}
                  selectedId={selectedId}
                  setSelectedId={(id) => {
                    setSelectedId(id);
                    setShowDrawer(false);
                    setTimeout(() => {
                      editorScrollRef.current?.scrollTo({
                        y: 0,
                        animated: true,
                      });
                    }, 0);
                  }}
                  onDelete={(id) => {
                    doDelete(id);
                    if (id === selectedId) setShowDrawer(false);
                  }}
                  loading={loading}
                  error={error}
                  onClose={() => setShowDrawer(false)}
                />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

/* helper: keyboard avoiding wrapper */
function KeyboardAvoidingKeyboardWrapper({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={tw`flex-1`} behavior="padding" keyboardVerticalOffset={0}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <View style={tw`flex-1`}>{children}</View>;
}

export default EditCourseScreen;

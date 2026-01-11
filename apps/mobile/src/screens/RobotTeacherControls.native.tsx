// apps/mobile/src/screens/RobotTeacherControls.native.tsx
import React, { memo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, TouchableOpacity } from 'react-native';

import tw from '../../tailwind';
import { MaterialIcons } from '@expo/vector-icons';

export type SizePresetKey = 'quick' | 'standard' | 'extended' | 'intensive' | 'marathon';
export type TrackKey = 'module' | 'certificate' | 'diploma' | 'degree';
type CourseOption = { id: string; title: string };

// ⬇️ Option A: global pull-to-refresh hooks/components
import { RefreshableScrollView } from '../refresh/Refreshable';
import { useRegisterScreenRefresh } from '../refresh/GlobalRefreshProvider';

// ⬇️ New: SelectField import
import SelectField, { type Option as SelectOption } from './SelectField.native';

/* ───────────────────────── CourseSelect (native) ───────────────────────── */
const CourseSelect = memo(function CourseSelect({

  options,
  value,
  onChange,
  placeholder = 'Select a course…',
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const hasOptions = options && options.length > 0;
  const effectivePlaceholder = hasOptions ? placeholder : 'No courses available';

  return (
    <SelectField
      value={value}
      onChange={(v) => {
        if (!hasOptions && !v) return;
        onChange(String(v));
      }}
      options={options}
      placeholder={effectivePlaceholder}
      modalTitle={effectivePlaceholder}
    />
  );
});

/* ─────────────────────────── Types for panel ─────────────────────────── */
interface ControlsPanelProps {
  showMinimalControls: boolean;
  isLockedLearner: boolean;
  programTrackLocked: boolean;
  canShareUi: boolean;
  restrictStarter: boolean;
  knobsDisabled: boolean;
displayCourseTitle?: string;

  topCourses: CourseOption[];
  selectedCourse: CourseOption | null;
  onSelectCourse: (id: string) => void;

  PRESETS: ReadonlyArray<{ key: SizePresetKey; label: string; min: number }>;
  TRACKS: ReadonlyArray<{ key: TrackKey; label: string; lessons: number }>;
  trackLessons: number;

  sizePreset: SizePresetKey;
  setSizePreset: (k: SizePresetKey) => void;

  minutes: number;
  setMinutes: (n: number) => void;

  classLevel: 'beginner' | 'intermediate' | 'advanced';
  setClassLevel: (lv: 'beginner' | 'intermediate' | 'advanced') => void;

  programTrack: TrackKey;
  setProgramTrack: (k: TrackKey) => void;

  capMinutes: (m?: number) => number;

  customTitle: string;
  setCustomTitle: (s: string) => void;

  busy: boolean;
  hasAIContent: boolean;

  onStart: () => Promise<void> | void;
  onRefreshSelectedAI: () => Promise<void> | void;
  onOpenShare: () => void;

  totalLessons: number;
  setTotalLessons: (n: number) => void;

  quizCount: number;
  setQuizCount: (n: number) => void;

  overrideLessons: boolean;
  setOverrideLessons: (b: boolean) => void;

  overrideQuiz: boolean;
  setOverrideQuiz: (b: boolean) => void;

  // ✅ only define once
  onOpenOverlay?: () => void;
  overlayAvailable?: boolean;
}

/* ───────────────────────────── Panel (native) ───────────────────────────── */
const ControlsPanel: React.FC<ControlsPanelProps> = memo((props) => {

  const {
    showMinimalControls,
    isLockedLearner,
    programTrackLocked,
    canShareUi,
    restrictStarter, // eslint-disable-line @typescript-eslint/no-unused-vars
    knobsDisabled,
    topCourses,
    selectedCourse,
    onSelectCourse,
    PRESETS,
    TRACKS,
    trackLessons,
    sizePreset,
    setSizePreset,
    minutes,
    setMinutes,
    classLevel,
    setClassLevel,
    programTrack,
    setProgramTrack,
    capMinutes,
    customTitle,
    setCustomTitle,
    busy,
    hasAIContent,
    onStart,
    onRefreshSelectedAI,
    onOpenShare,
    totalLessons,
    setTotalLessons,
    quizCount,
    setQuizCount,
    overrideLessons,
    setOverrideLessons,
    overrideQuiz,
    setOverrideQuiz,
    onOpenOverlay,
    displayCourseTitle,
    overlayAvailable, // ✅ FIX: destructure it
  } = props;

  // ⬇️ Contribute to the screen’s global pull-to-refresh:
 useRegisterScreenRefresh(
  useCallback(async () => {
    if (!isLockedLearner && selectedCourse?.id) {
      await onRefreshSelectedAI();
    }
  }, [isLockedLearner, selectedCourse?.id, onRefreshSelectedAI])
);


  const canStartMinimal = !busy;
  const canStartMain = !busy;
  const canTeach = !busy && !!customTitle.trim();
  const defaultPresetKey: SizePresetKey = PRESETS[0]?.key ?? 'standard';

  return (
    <View
      style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-3 md:p-4`}
    >
      {showMinimalControls ? (
        <View style={tw`gap-3`}>
          <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>
            This lesson was assigned by your organization. Settings are fixed.
          </Text>

          <View>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Course</Text>
            <View
              style={tw`mt-1 h-11 rounded-xl px-3 justify-center bg-[#e7edf4] dark:bg-[#172534]`}
            >
              <Text style={tw`text-[#0d141c] dark:text-white`}>
               {displayCourseTitle || selectedCourse?.title || 'Assigned course'}

              </Text>
            </View>
          </View>

          <View style={tw`flex-row items-end gap-2`}>
            <StartWithAiButton busy={busy} hasAIContent={hasAIContent} onStart={onStart} fullWidth />

          </View>
        </View>
      ) : (
        <RefreshableScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={tw`gap-3`}
        >
          {/* Course */}
          <View>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Course</Text>
            <View style={tw`mt-1`}>
              {isLockedLearner ? (
                <View
                  style={tw`h-11 rounded-xl px-3 justify-center bg-[#e7edf4] dark:bg-[#172534]`}
                >
                  <Text style={tw`text-[#0d141c] dark:text-white`}>
                   {displayCourseTitle || selectedCourse?.title || 'Assigned course'}

                  </Text>
                </View>
              ) : (
                <CourseSelect
                  value={selectedCourse?.id || ''}
                  onChange={(id) => onSelectCourse(id)}
                  options={(topCourses || []).map((c) => ({
                    value: c.id,
                    label: c.title,
                  }))}
                  placeholder={(topCourses || []).length ? 'Select a course…' : 'Loading…'}
                />
              )}
            </View>
          </View>

          {/* Program track */}
          <View>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Program track</Text>
            <View style={tw`mt-1 flex-row flex-wrap gap-2`}>
              {TRACKS.map((t) => {
                const active = programTrack === t.key;
                const disabled = isLockedLearner || programTrackLocked;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => !disabled && setProgramTrack(t.key)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled }}
                    accessibilityLabel={`${t.label} (${t.lessons})`}
                    style={tw.style(
                      `px-3 py-1.5 rounded-full border`,
                      active
                        ? `bg-indigo-600 border-indigo-600`
                        : `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`,
                      disabled && `opacity-50`
                    )}
                  >
                    <Text style={tw`${active ? 'text-white' : 'text-[#0d141c] dark:text-white'}`}>
                      {t.label} ({t.lessons})
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={tw`mt-1 text-[11px] text-[#49739c] dark:text-white/60`}>
              Track controls lesson count. We generate ~{trackLessons} lessons for this course.
            </Text>
          </View>

          {/* Lesson size + minutes */}
          <View>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Lesson size</Text>
            <View style={tw`mt-1 gap-2`}>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {PRESETS.map((p) => {
                  const active = sizePreset === p.key;
                  const disabled = isLockedLearner;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        if (disabled) return;
                        setSizePreset(p.key);
                        setMinutes(capMinutes(minutes < p.min ? p.min : minutes));
                      }}
                      disabled={disabled}
                      accessibilityLabel={`${p.label} (~${p.min} min)`}
                      accessibilityState={{ selected: active, disabled }}
                      style={tw.style(
                        `px-3 py-1.5 rounded-full border`,
                        active
                          ? `bg-indigo-600 border-indigo-600`
                          : `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`,
                        disabled && `opacity-50`
                      )}
                    >
                      <Text style={tw`${active ? 'text-white' : 'text-[#0d141c] dark:text-white'}`}>
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={tw`flex-row items-center gap-2`}>
                <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Minutes</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={String(minutes)}
                  onChangeText={(txt) => {
                    if (knobsDisabled) return;
                    const n = Math.max(8, Math.min(600, Number(txt.replace(/[^\d]/g, '')) || 0));
                    setMinutes(n);
                    const found = [...PRESETS].reverse().find((x) => n >= x.min);
                    const key: SizePresetKey = found?.key ?? defaultPresetKey;
                    setSizePreset(key);
                  }}
                  editable={!knobsDisabled}
                  placeholderTextColor="rgba(148,163,184,0.8)"
                  style={tw.style(
                    `h-9 w-20 rounded-xl px-2 border text-[12px] bg-slate-50 dark:bg-[#172534] text-[#0d141c] dark:text-white`,
                    knobsDisabled
                      ? `opacity-50 border-[#cedbe8] dark:border-white/15`
                      : `border-[#cedbe8] dark:border-white/15`
                  )}
                />
              </View>
            </View>
          </View>

          {/* Level */}
          <View>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Level</Text>
            <View
              style={tw`mt-1 flex-row rounded-lg overflow-hidden border border-[#cedbe8] dark:border-white/15`}
            >
              {(['beginner', 'intermediate', 'advanced'] as const).map((lv) => {
                const active = classLevel === lv;
                const disabled = isLockedLearner;
                return (
                  <Pressable
                    key={lv}
                    onPress={() => !disabled && setClassLevel(lv)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled }}
                    accessibilityLabel={lv}
                    style={tw.style(
                      `flex-1 px-3 py-2`,
                      active ? `bg-indigo-50 dark:bg-white/10` : `bg-white dark:bg-[#172534]`,
                      disabled && `opacity-50`
                    )}
                  >
                    <Text
                      style={tw`capitalize text-[11px] ${
                        active
                          ? 'text-indigo-700 dark:text-white'
                          : 'text-[#0d141c] dark:text-white/80'
                      }`}
                    >
                      {lv}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Start / Refresh / Share */}
          <View style={tw`flex-row items-end gap-2`}>
          <StartWithAiButton busy={busy} hasAIContent={hasAIContent} onStart={onStart} />


            {selectedCourse && !isLockedLearner ? (
              <Pressable
                onPress={() => onRefreshSelectedAI()}
                accessibilityRole="button"
                accessibilityLabel="Refresh AI"
                style={tw`h-10 px-3 rounded-xl items-center justify-center border bg-slate-50 dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`}
              >
                <Text style={tw`text-[#0d141c] dark:text-white`}>Refresh AI</Text>
              </Pressable>
            ) : null}

            {canShareUi && !isLockedLearner ? (
              <Pressable
                onPress={onOpenShare}
                disabled={!selectedCourse?.id && !customTitle.trim()}
                accessibilityRole="button"
                accessibilityLabel="Share with learners"
                style={tw.style(
                  `h-10 px-3 rounded-xl items-center justify-center border`,
                  selectedCourse?.id
                    ? `bg-indigo-600 border-indigo-600`
                    : `bg-slate-50 dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`,
                  !selectedCourse?.id && !customTitle.trim() && `opacity-60`
                )}
              >
                <Text
                  style={tw`${
                    selectedCourse?.id ? 'text-white' : 'text-[#0d141c] dark:text-white'
                  }`}
                >
                  Share with learners
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Extra knobs (minutes/lessons/quizzes) */}
          <View style={tw`gap-2`}>
            <LabeledNumber
              label="Minutes"
              value={minutes}
              min={3}
              max={5000}
              disabled={knobsDisabled}
              onChange={(v) => {
                const vv = Math.max(3, v);
                setMinutes(vv);
                const found = [...PRESETS].reverse().find((x) => vv >= x.min);
                const key: SizePresetKey = found?.key ?? defaultPresetKey;
                setSizePreset(key);
              }}
            />
            <LabeledNumber
              label="Lessons"
              value={totalLessons}
              min={1}
              max={500}
              disabled={knobsDisabled}
              onChange={(v) => {
                setOverrideLessons(true);
                setTotalLessons(Math.max(1, v));
              }}
            />
            <LabeledNumber
              label="Quiz questions"
              value={quizCount}
              min={4}
              max={400}
              disabled={knobsDisabled}
              onChange={(v) => {
                setOverrideQuiz(true);
                setQuizCount(Math.max(4, v));
              }}
            />
          </View>

          <View style={tw`mt-1 flex-row flex-wrap items-center gap-2`}>
            {(overrideLessons || overrideQuiz) && (
              <Pressable
                onPress={() => {
                  setOverrideLessons(false);
                  setOverrideQuiz(false);
                  setTotalLessons(trackLessons);
                  setQuizCount(Math.max(4, Math.floor(trackLessons * 2)));
                }}
                style={tw`px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#172534] border border-[#cedbe8] dark:border-white/15`}
              >
                <Text style={tw`text-[#0d141c] dark:text-white text-xs`}>Use track defaults</Text>
              </Pressable>
            )}
          </View>

          {/* Custom topic */}
          {!isLockedLearner && (
            <View style={tw`mt-1`}>
              <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                Or type any topic
              </Text>
              <TextInput
                value={customTitle}
                onChangeText={setCustomTitle}
                placeholder="e.g., Linear Algebra crash course"
                placeholderTextColor="rgba(148,163,184,0.8)"
                style={tw`mt-1 h-11 rounded-xl px-3 border border-[#cedbe8] dark:border-white/15 bg-slate-50 dark:bg-[#172534] text-[#0d141c] dark:text-white`}
              />

              <View style={tw`mt-2 items-start`}>
                <Pressable
                  disabled={!canTeach}
                  onPress={() => {
                    if (canTeach) onStart();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Teach me"
                  style={tw.style(
                    `h-10 px-4 rounded-xl items-center justify-center border`,
                    canTeach
                      ? `bg-indigo-600 border-indigo-600`
                      : `opacity-60 bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`
                  )}
                >
                  <Text
                    style={tw`${
                      canTeach ? 'text-white' : 'text-[#0d141c] dark:text-white'
                    } text-sm font-semibold`}
                  >
                    Teach me
                  </Text>
                </Pressable>
              </View>

              {/* ✅ SINGLE OVERLAY ICON — fixed right after Teach me */}
              <View style={tw`mt-2 flex-row items-center`}>
                <Pressable
                  onPress={() => {
                    if (overlayAvailable && onOpenOverlay) onOpenOverlay();
                  }}
                  disabled={!overlayAvailable || !onOpenOverlay}
                  accessibilityRole="button"
                  accessibilityLabel="Open lesson overlay"
                  style={tw.style(
                    `h-10 w-10 rounded-xl items-center justify-center border`,
                    overlayAvailable
                      ? `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`
                      : `bg-slate-100 dark:bg-[#172534] border-[#cedbe8] dark:border-white/10 opacity-50`
                  )}
                >
                  <MaterialIcons
                    name="layers"
                    size={20}
                    color={overlayAvailable ? '#49739c' : '#94a3b8'}
                  />
                </Pressable>

                <Text style={tw`ml-2 text-[12px] text-[#49739c] dark:text-white/70`}>
                  {overlayAvailable ? 'Overlay' : 'No overlay for this lesson'}
                </Text>
              </View>
            </View>
          )}
        </RefreshableScrollView>
      )}
    </View>
  );
});

ControlsPanel.displayName = 'RobotTeacherControls';
export default ControlsPanel;

function StartWithAiButton({
  busy,
  hasAIContent,
  onStart,
  fullWidth = false,
}: {
  busy: boolean;
  hasAIContent: boolean;
  onStart: () => Promise<void> | void;
  fullWidth?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={() => {
        if (!busy) onStart();
      }}
      disabled={busy}
      activeOpacity={0.85}
      style={tw.style(
        `${fullWidth ? 'w-full' : 'flex-1'} rounded-xl py-3 items-center justify-center border`,
        busy ? 'bg-indigo-600/60 border-indigo-600/60' : 'bg-indigo-600 border-indigo-600'
      )}
    >
      <Text style={tw`text-white font-semibold`}>
        {busy ? 'Preparing…' : hasAIContent ? 'Continue lesson' : 'Start with A.I'}
      </Text>
    </TouchableOpacity>
  );
}


/* ────────────────────────── Small helper input ────────────────────────── */
function LabeledNumber({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <View>
      <Text style={tw`text-sm text-[#0d141c] dark:text-white mb-1`}>{label}</Text>
      <TextInput
        keyboardType="number-pad"
        value={String(value)}
        onChangeText={(txt) => {
          if (disabled) return;
          const n = Math.max(min, Math.min(max, Number(txt.replace(/[^\d]/g, '')) || 0));
          onChange(n);
        }}
        editable={!disabled}
        placeholderTextColor="rgba(148,163,184,0.8)"
        style={tw.style(
          `h-11 rounded-xl px-3 border text-sm bg-slate-50 dark:bg-[#172534] text-[#0d141c] dark:text-white`,
          disabled
            ? `opacity-50 border-[#cedbe8] dark:border-white/15`
            : `border-[#cedbe8] dark:border-white/15`
        )}
      />
    </View>
  );
}

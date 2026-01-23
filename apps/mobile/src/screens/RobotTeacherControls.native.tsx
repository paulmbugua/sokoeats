// apps/mobile/src/screens/RobotTeacherControls.native.tsx
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import tw from '../../tailwind';
import { MaterialIcons } from '@expo/vector-icons';
import type { ProgramTrack } from '@mytutorapp/shared/types';

export type SizePresetKey = 'quick' | 'standard' | 'extended' | 'intensive' | 'marathon';
export type TrackKey = ProgramTrack;
type CourseOption = { id: string; title: string };

// ⬇️ Option A: global pull-to-refresh hooks/components
import { RefreshableScrollView } from '../refresh/Refreshable';
import { useRegisterScreenRefresh } from '../refresh/GlobalRefreshProvider';

type SelectOption = { value: string; label: string };

type MIName = React.ComponentProps<typeof MaterialIcons>['name'];

const ADVANCED_STORAGE_KEY = 'robotTutor:advancedOpen:v1';

const TRACK_UI: Partial<
  Record<
    TrackKey,
    {
      icon: MIName;
      blurb: string;
      outcome: string;
    }
  >
> = {
  module: {
    icon: 'view-module',
    blurb: 'Focused unit. Great for quick revision or one topic.',
    outcome: 'Best for: targeted learning & practice.',
  },
  certificate: {
    icon: 'verified',
    blurb: 'Structured short program with clear outcomes.',
    outcome: 'Best for: finishing a skill and getting certified.',
  },
  diploma: {
    icon: 'school',
    blurb: 'Career-oriented pathway covering multiple modules.',
    outcome: 'Best for: depth + real-world readiness.',
  },
  degree: {
    icon: 'account-balance',
    blurb: 'Full curriculum-style path with broad coverage.',
    outcome: 'Best for: comprehensive mastery over time.',
  },
};

/* ───────────────────────── CourseSelect (native, web-parity) ─────────────────────────
   - Shows selected course label if in options
   - If value is NOT in options (e.g. "__custom__"), show fallbackLabel (custom/synthetic title)
   - Still only allows choosing from real options
-------------------------------------------------------------------------------------- */
const CourseSelect = memo(function CourseSelect({
  options,
  value,
  onChange,
  placeholder = 'Select a course…',
  fallbackLabel,
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fallbackLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const displayLabel = useMemo(() => {
    const fb = String(fallbackLabel || '').trim();
    return selected?.label || (fb ? fb : '');
  }, [selected?.label, fallbackLabel]);

  const hasOptions = (options || []).length > 0;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Select course"
        style={tw.style(
          `h-11 rounded-xl px-3 pr-10 justify-center border`,
          `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`,
          !hasOptions && `opacity-60`
        )}
        disabled={!hasOptions}
      >
        <Text style={tw.style(`text-sm`, displayLabel ? `text-[#0d141c] dark:text-white` : `text-slate-500 dark:text-white/60`)}>
          {displayLabel ? displayLabel : placeholder}
        </Text>

        <View style={tw`absolute right-3 top-1/2 -mt-2`}>
          <MaterialIcons name="arrow-drop-down" size={20} color="rgba(148,163,184,0.9)" />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={tw`flex-1 bg-black/40 items-center justify-center px-4`}>
          {/* backdrop */}
          <Pressable style={tw`absolute inset-0`} onPress={() => setOpen(false)} />

          {/* panel */}
          <View
            style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 overflow-hidden`}
          >
            <View style={tw`px-4 py-3 flex-row items-center justify-between border-b border-[#cedbe8] dark:border-white/10`}>
              <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                {placeholder}
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={tw`h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-[#172534]`}
              >
                <MaterialIcons name="close" size={18} color="rgba(148,163,184,0.9)" />
              </Pressable>
            </View>

            <ScrollView style={tw`max-h-80`} contentContainerStyle={tw`py-1`}>
              {hasOptions ? (
                options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        // ⚠️ do not allow selecting the synthetic "__custom__" (display-only)
                        if (String(opt.value) === '__custom__') return;
                        onChange(String(opt.value));
                        setOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={tw.style(
                        `px-4 py-3`,
                        active
                          ? `bg-indigo-50 dark:bg-indigo-600/30`
                          : `bg-white dark:bg-[#0f1821]`
                      )}
                    >
                      <Text
                        style={tw.style(
                          `text-sm`,
                          active
                            ? `text-indigo-700 dark:text-white font-semibold`
                            : `text-[#0d141c] dark:text-white`
                        )}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <View style={tw`px-4 py-3`}>
                  <Text style={tw`text-sm text-slate-500 dark:text-white/60`}>No courses available</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
});
CourseSelect.displayName = 'CourseSelect';

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

  // ✅ parity gate from web
  canStartNow: boolean;

  // overlay
  onOpenOverlay?: () => void;
  overlayAvailable?: boolean;
}




/* ───────────────────────────── Panel (native) ───────────────────────────── */
const ControlsPanel: React.FC<ControlsPanelProps> = memo((props) => {
  const [trackInfoOpen, setTrackInfoOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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

    displayCourseTitle,

    canStartNow,

    onOpenOverlay,
    overlayAvailable,
  } = props;

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(ADVANCED_STORAGE_KEY).then((value) => {
      if (!mounted) return;
      if (value === 'true') setAdvancedOpen(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(ADVANCED_STORAGE_KEY, String(advancedOpen));
  }, [advancedOpen]);

  // ⬇️ Contribute to the screen’s global pull-to-refresh:
  useRegisterScreenRefresh(
    useCallback(async () => {
      if (!isLockedLearner && selectedCourse?.id) {
        await onRefreshSelectedAI();
      }
    }, [isLockedLearner, selectedCourse?.id, onRefreshSelectedAI])
  );

  const defaultPresetKey: SizePresetKey = PRESETS[0]?.key ?? 'standard';

  const courseOptions: SelectOption[] = useMemo(
    () => (topCourses || []).map((c) => ({ value: c.id, label: c.title })),
    [topCourses]
  );

  // ✅ Web parity: show custom/synthetic title even when not in options
  const custom = customTitle.trim();
  const courseSelectValue = selectedCourse?.id || (custom ? '__custom__' : '');

  const fallbackCourseLabel =
    selectedCourse?.title || custom || displayCourseTitle || '';

  const showCourseOrCustomError = !selectedCourse?.id && !custom;
  const trackLabel = TRACKS.find((t) => t.key === programTrack)?.label || 'Plan';
  const defaultQuizForLessons = (n: number) => Math.max(4, n * 2);
  const advancedDisabled = isLockedLearner || programTrackLocked;

  useEffect(() => {
    if (advancedDisabled && advancedOpen) setAdvancedOpen(false);
  }, [advancedDisabled, advancedOpen]);

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
                {selectedCourse?.title || displayCourseTitle || 'Assigned course'}
              </Text>
            </View>
          </View>

          <View style={tw`flex-row items-end gap-2`}>
  <View style={tw`flex-1`}>
    <StartWithAiButton
      busy={busy}
      hasAIContent={hasAIContent}
      onStart={onStart}
      canStartNow={canStartNow}
      fullWidth
    />
  </View>

  {/* ✅ Lesson overlay доступ for org/locked learners too */}
  <Pressable
    onPress={() => {
      if (onOpenOverlay) onOpenOverlay();
    }}
    disabled={!onOpenOverlay || !overlayAvailable}

    accessibilityRole="button"
    accessibilityLabel="Open lesson overlay"
    style={tw.style(
      `h-11 w-11 rounded-xl items-center justify-center border`,
      overlayAvailable
        ? `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`
        : `bg-slate-100 dark:bg-[#172534] border-[#cedbe8] dark:border-white/10 opacity-60`
    )}
  >
    <MaterialIcons name="layers" size={18} color={overlayAvailable ? '#49739c' : '#94a3b8'} />
  </Pressable>
</View>

        </View>
      ) : (
        <RefreshableScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={tw`gap-2`}>
          <QuickSetupSection
            courseOptions={courseOptions}
            courseSelectValue={courseSelectValue}
            fallbackCourseLabel={fallbackCourseLabel}
            topCourses={topCourses}
            selectedCourse={selectedCourse}
            displayCourseTitle={displayCourseTitle}
            isLockedLearner={isLockedLearner}
            restrictStarter={restrictStarter}
            onSelectCourse={onSelectCourse}
            TRACKS={TRACKS}
            programTrack={programTrack}
            setProgramTrack={setProgramTrack}
            trackLessons={trackLessons}
            overrideLessons={overrideLessons}
            overrideQuiz={overrideQuiz}
            trackInfoOpen={trackInfoOpen}
            setTrackInfoOpen={setTrackInfoOpen}
            onStart={onStart}
            busy={busy}
            hasAIContent={hasAIContent}
            canStartNow={canStartNow}
            selectedCourseId={selectedCourse?.id}
            customTitle={customTitle}
            onRefreshSelectedAI={onRefreshSelectedAI}
            onOpenShare={onOpenShare}
            canShareUi={canShareUi}
            programTrackLocked={programTrackLocked}
            trackLabel={trackLabel}
            defaultQuizCount={defaultQuizForLessons(trackLessons)}
          />

          <TeachMeSection
            isLockedLearner={isLockedLearner}
            customTitle={customTitle}
            setCustomTitle={setCustomTitle}
            busy={busy}
            canStartNow={canStartNow}
            onStart={onStart}
            showCourseOrCustomError={showCourseOrCustomError}
            overlayAvailable={overlayAvailable}
            onOpenOverlay={onOpenOverlay}
          />

          <AdvancedSection
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            advancedDisabled={advancedDisabled}
            knobsDisabled={knobsDisabled}
            PRESETS={PRESETS}
            sizePreset={sizePreset}
            setSizePreset={setSizePreset}
            minutes={minutes}
            setMinutes={setMinutes}
            defaultPresetKey={defaultPresetKey}
            capMinutes={capMinutes}
            classLevel={classLevel}
            setClassLevel={setClassLevel}
            totalLessons={totalLessons}
            setTotalLessons={setTotalLessons}
            quizCount={quizCount}
            setQuizCount={setQuizCount}
            overrideLessons={overrideLessons}
            setOverrideLessons={setOverrideLessons}
            overrideQuiz={overrideQuiz}
            setOverrideQuiz={setOverrideQuiz}
            trackLessons={trackLessons}
          />
        </RefreshableScrollView>
      )}
    </View>
  );
});

ControlsPanel.displayName = 'RobotTeacherControls';
export default ControlsPanel;

function QuickSetupSection({
  courseOptions,
  courseSelectValue,
  fallbackCourseLabel,
  topCourses,
  selectedCourse,
  displayCourseTitle,
  isLockedLearner,
  restrictStarter,
  onSelectCourse,
  TRACKS,
  programTrack,
  setProgramTrack,
  trackLessons,
  overrideLessons,
  overrideQuiz,
  trackInfoOpen,
  setTrackInfoOpen,
  onStart,
  busy,
  hasAIContent,
  canStartNow,
  selectedCourseId,
  customTitle,
  onRefreshSelectedAI,
  onOpenShare,
  canShareUi,
  programTrackLocked,
  trackLabel,
  defaultQuizCount,
}: {
  courseOptions: SelectOption[];
  courseSelectValue: string;
  fallbackCourseLabel: string;
  topCourses: CourseOption[];
  selectedCourse: CourseOption | null;
  displayCourseTitle?: string;
  isLockedLearner: boolean;
  restrictStarter: boolean;
  onSelectCourse: (id: string) => void;
  TRACKS: ReadonlyArray<{ key: TrackKey; label: string; lessons: number }>;
  programTrack: TrackKey;
  setProgramTrack: (k: TrackKey) => void;
  trackLessons: number;
  overrideLessons: boolean;
  overrideQuiz: boolean;
  trackInfoOpen: boolean;
  setTrackInfoOpen: (open: boolean) => void;
  onStart: () => Promise<void> | void;
  busy: boolean;
  hasAIContent: boolean;
  canStartNow: boolean;
  selectedCourseId?: string;
  customTitle: string;
  onRefreshSelectedAI: () => Promise<void> | void;
  onOpenShare: () => void;
  canShareUi: boolean;
  programTrackLocked: boolean;
  trackLabel: string;
  defaultQuizCount: number;
}) {
  const canShare = !!selectedCourseId || !!customTitle.trim();

  return (
    <View style={tw`gap-2 pb-3 border-b border-[#cedbe8] dark:border-white/10`}>
      <View style={tw`gap-2`}>
        <View>
          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Course</Text>
          <View style={tw`mt-1`}>
            {isLockedLearner ? (
              <View
                style={tw`h-11 rounded-xl px-3 justify-center bg-[#e7edf4] dark:bg-[#172534]`}
              >
                <Text style={tw`text-[#0d141c] dark:text-white`}>
                  {selectedCourse?.title || displayCourseTitle || 'Assigned course'}
                </Text>
              </View>
            ) : (
              <CourseSelect
                value={courseSelectValue}
                onChange={(id) => onSelectCourse(id)}
                options={courseOptions}
                placeholder={(topCourses || []).length ? 'Select a course…' : 'Loading…'}
                fallbackLabel={fallbackCourseLabel}
              />
            )}
          </View>

          {restrictStarter ? (
            <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/60`}>
              Some options may be limited on Starter.
            </Text>
          ) : null}
        </View>

        <View>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Program track</Text>
            <Pressable
              onPress={() => setTrackInfoOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="What are program tracks?"
              style={tw`h-7 w-7 rounded-lg items-center justify-center bg-slate-100 dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10`}
            >
              <MaterialIcons name="info-outline" size={16} color="rgba(148,163,184,0.95)" />
            </Pressable>
          </View>

          <View style={tw`mt-2 gap-2`}>
            {TRACKS.map((t) => {
              const active = programTrack === t.key;
              const disabled = isLockedLearner || programTrackLocked;

              const meta = TRACK_UI[t.key] ?? {
                icon: 'school' as MIName,
                blurb: 'Structured learning track.',
                outcome: 'Choose what fits your goal.',
              };

              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    if (!disabled) setProgramTrack(t.key);
                  }}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled }}
                  accessibilityLabel={`${t.label}. Approximately ${t.lessons} lessons.`}
                  style={tw.style(
                    `rounded-2xl border p-2.5`,
                    active
                      ? `bg-indigo-50 dark:bg-indigo-600/25 border-indigo-300 dark:border-indigo-500/40`
                      : `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`,
                    disabled && `opacity-50`
                  )}
                >
                  <View style={tw`flex-row items-center justify-between`}>
                    <View style={tw`flex-row items-center gap-2`}>
                      <View
                        style={tw.style(
                          `h-7 w-7 rounded-lg items-center justify-center`,
                          active
                            ? `bg-indigo-600`
                            : `bg-slate-100 dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`
                        )}
                      >
                        <MaterialIcons
                          name={meta.icon}
                          size={16}
                          color={active ? '#fff' : 'rgba(73,115,156,0.95)'}
                        />
                      </View>

                      <View>
                        <Text
                          style={tw.style(
                            `text-sm font-semibold`,
                            active ? `text-indigo-700 dark:text-white` : `text-[#0d141c] dark:text-white`
                          )}
                        >
                          {t.label}
                        </Text>
                        <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60`}>
                          {meta.outcome}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={tw`px-2 py-1 rounded-full bg-slate-100 dark:bg-white/10 border border-[#cedbe8] dark:border-white/10`}
                    >
                      <Text style={tw`text-[11px] text-[#0d141c] dark:text-white`}>
                        {t.lessons} lessons
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/60`}>
            Plan: {trackLabel} • {trackLessons} lessons • {defaultQuizCount} questions
          </Text>

          {overrideLessons || overrideQuiz ? (
            <Text style={tw`mt-1 text-[11px] text-amber-700 dark:text-amber-200`}>
              You’re using custom lessons/quiz settings. Tap “Use track defaults” below to sync with this track.
            </Text>
          ) : null}

          <Modal
            visible={trackInfoOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setTrackInfoOpen(false)}
          >
            <View style={tw`flex-1 bg-black/40 items-center justify-center px-4`}>
              <Pressable style={tw`absolute inset-0`} onPress={() => setTrackInfoOpen(false)} />

              <View
                style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 overflow-hidden`}
              >
                <View
                  style={tw`px-4 py-3 flex-row items-center justify-between border-b border-[#cedbe8] dark:border-white/10`}
                >
                  <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                    What are program tracks?
                  </Text>
                  <Pressable
                    onPress={() => setTrackInfoOpen(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={tw`h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-[#172534]`}
                  >
                    <MaterialIcons name="close" size={18} color="rgba(148,163,184,0.9)" />
                  </Pressable>
                </View>

                <ScrollView style={tw`max-h-96`} contentContainerStyle={tw`p-4 gap-3`}>
                  {TRACKS.map((t) => {
                    const meta = TRACK_UI[t.key] ?? {
                      icon: 'school' as MIName,
                      blurb: 'Structured learning track.',
                      outcome: 'Choose what fits your goal.',
                    };

                    return (
                      <View
                        key={t.key}
                        style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#172534] p-3`}
                      >
                        <View style={tw`flex-row items-center justify-between`}>
                          <View style={tw`flex-row items-center gap-2`}>
                            <MaterialIcons
                              name={meta.icon}
                              size={18}
                              color="rgba(73,115,156,0.95)"
                            />
                            <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                              {t.label}
                            </Text>
                          </View>
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60`}>
                            ~{t.lessons} lessons
                          </Text>
                        </View>

                        <Text style={tw`mt-1 text-[11px] text-[#49739c] dark:text-white/60`}>
                          {meta.outcome}
                        </Text>
                        <Text style={tw`mt-1 text-[11px] text-[#49739c] dark:text-white/60`}>
                          {meta.blurb}
                        </Text>
                      </View>
                    );
                  })}

                  <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60`}>
                    Tip: If you override Lessons/Quiz, you’re no longer using track defaults until
                    you tap “Use track defaults”.
                  </Text>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      </View>

      <View style={tw`flex-row items-center gap-2`}>
        <View style={tw`flex-1`}>
          <StartWithAiButton
            busy={busy}
            hasAIContent={hasAIContent}
            onStart={onStart}
            canStartNow={canStartNow}
            fullWidth
          />
        </View>

        {selectedCourseId && !isLockedLearner ? (
          <Pressable
            onPress={() => onRefreshSelectedAI()}
            accessibilityRole="button"
            accessibilityLabel="Refresh AI"
            style={tw`h-11 w-11 rounded-xl items-center justify-center border bg-slate-50 dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`}
          >
            <MaterialIcons name="refresh" size={18} color="rgba(73,115,156,0.95)" />
          </Pressable>
        ) : null}

        {canShareUi && !isLockedLearner ? (
          <Pressable
            onPress={onOpenShare}
            disabled={!canShare}
            accessibilityRole="button"
            accessibilityLabel="Share with learners"
            style={tw.style(
              `h-11 w-11 rounded-xl items-center justify-center border`,
              canShare
                ? `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`
                : `bg-slate-100 dark:bg-[#172534] border-[#cedbe8] dark:border-white/10 opacity-50`
            )}
          >
            <MaterialIcons name="share" size={18} color="rgba(73,115,156,0.95)" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TeachMeSection({
  isLockedLearner,
  customTitle,
  setCustomTitle,
  busy,
  canStartNow,
  onStart,
  showCourseOrCustomError,
  overlayAvailable,
  onOpenOverlay,
}: {
  isLockedLearner: boolean;
  customTitle: string;
  setCustomTitle: (s: string) => void;
  busy: boolean;
  canStartNow: boolean;
  onStart: () => Promise<void> | void;
  showCourseOrCustomError: boolean;
  overlayAvailable?: boolean;
  onOpenOverlay?: () => void;
}) {
  if (isLockedLearner) return null;

  const teachDisabled = busy || !canStartNow || !customTitle.trim();

  return (
    <View style={tw`gap-2 pb-3 border-b border-[#cedbe8] dark:border-white/10`}>
      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Teach me anything</Text>
      <View style={tw`flex-row items-center gap-2`}>
        <TextInput
          value={customTitle}
          onChangeText={setCustomTitle}
          placeholder="Teach me Plants"
          placeholderTextColor="rgba(6, 13, 24, 0.8)"
          style={tw`flex-1 h-11 rounded-xl px-3 border border-[#cedbe8] dark:border-white/15 bg-slate-50 dark:bg-[#172534] text-[#0d141c] dark:text-white`}
        />

        <Pressable
          disabled={teachDisabled}
          onPress={() => {
            if (!teachDisabled) onStart();
          }}
          accessibilityRole="button"
          accessibilityLabel="Teach me"
          style={tw.style(
            `h-11 px-4 rounded-xl items-center justify-center border flex-row gap-2`,
            busy
              ? `bg-indigo-600/60 border-indigo-600/60`
              : !teachDisabled
              ? `bg-indigo-600 border-indigo-600`
              : `opacity-60 bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`
          )}
        >
          {busy ? <ActivityIndicator size={12} color="#fff" /> : null}
          <Text
            style={tw`${
              busy || !teachDisabled ? 'text-white' : 'text-[#0d141c] dark:text-white'
            } text-sm font-semibold`}
          >
            {busy ? 'Preparing…' : 'Teach me'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (overlayAvailable && onOpenOverlay) onOpenOverlay();
          }}
          disabled={!overlayAvailable || !onOpenOverlay}
          accessibilityRole="button"
          accessibilityLabel="Open lesson overlay"
          style={tw.style(
            `h-11 w-11 rounded-xl items-center justify-center border`,
            overlayAvailable
              ? `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`
              : `bg-slate-100 dark:bg-[#172534] border-[#cedbe8] dark:border-white/10 opacity-50`
          )}
        >
          <MaterialIcons name="layers" size={18} color={overlayAvailable ? '#49739c' : '#94a3b8'} />
        </Pressable>
      </View>

      {showCourseOrCustomError && (
        <Text style={tw`text-xs text-red-500`}>
          Pick a course or enter a custom topic first.
        </Text>
      )}
    </View>
  );
}

function AdvancedSection({
  advancedOpen,
  setAdvancedOpen,
  advancedDisabled,
  knobsDisabled,
  PRESETS,
  sizePreset,
  setSizePreset,
  minutes,
  setMinutes,
  defaultPresetKey,
  capMinutes,
  classLevel,
  setClassLevel,
  totalLessons,
  setTotalLessons,
  quizCount,
  setQuizCount,
  overrideLessons,
  setOverrideLessons,
  overrideQuiz,
  setOverrideQuiz,
  trackLessons,
}: {
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  advancedDisabled: boolean;
  knobsDisabled: boolean;
  PRESETS: ReadonlyArray<{ key: SizePresetKey; label: string; min: number }>;
  sizePreset: SizePresetKey;
  setSizePreset: (k: SizePresetKey) => void;
  minutes: number;
  setMinutes: (n: number) => void;
  defaultPresetKey: SizePresetKey;
  capMinutes: (m?: number) => number;
  classLevel: 'beginner' | 'intermediate' | 'advanced';
  setClassLevel: (lv: 'beginner' | 'intermediate' | 'advanced') => void;
  totalLessons: number;
  setTotalLessons: (n: number) => void;
  quizCount: number;
  setQuizCount: (n: number) => void;
  overrideLessons: boolean;
  setOverrideLessons: (b: boolean) => void;
  overrideQuiz: boolean;
  setOverrideQuiz: (b: boolean) => void;
  trackLessons: number;
}) {
  const inputsDisabled = knobsDisabled || advancedDisabled;

  return (
    <View style={tw`gap-2`}>
      <Pressable
        onPress={() => {
          if (!advancedDisabled) setAdvancedOpen(!advancedOpen);
        }}
        accessibilityRole="button"
        accessibilityLabel="Advanced settings"
        accessibilityState={{ expanded: advancedOpen, disabled: advancedDisabled }}
        disabled={advancedDisabled}
        style={tw.style(
          `flex-row items-center justify-between rounded-xl border px-3 py-2`,
          `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/10`,
          advancedDisabled && `opacity-50`
        )}
      >
        <View>
          <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
            Advanced settings
          </Text>
          {!advancedOpen && (
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60`}>
              Minutes, level, lesson size, manual overrides
            </Text>
          )}
        </View>
        <MaterialIcons
          name={advancedOpen ? 'expand-less' : 'expand-more'}
          size={20}
          color="rgba(148,163,184,0.95)"
        />
      </Pressable>

      {advancedOpen && (
        <View style={tw`gap-3 rounded-xl border px-3 py-3 bg-slate-50 dark:bg-[#0f1821] border-[#cedbe8] dark:border-white/10`}>
          <View>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Lesson size</Text>
            <View style={tw`mt-2 gap-2`}>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {PRESETS.map((p) => {
                  const active = sizePreset === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        if (inputsDisabled) return;
                        setSizePreset(p.key);
                        setMinutes(capMinutes(minutes < p.min ? p.min : minutes));
                      }}
                      disabled={inputsDisabled}
                      accessibilityLabel={`${p.label} (~${p.min} min)`}
                      accessibilityState={{ selected: active, disabled: inputsDisabled }}
                      style={tw.style(
                        `px-3 py-1.5 rounded-full border`,
                        active
                          ? `bg-indigo-600 border-indigo-600`
                          : `bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15`,
                        inputsDisabled && `opacity-50`
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
                    if (inputsDisabled) return;
                    const n = Math.max(8, Math.min(600, Number(txt.replace(/[^\d]/g, '')) || 0));
                    setMinutes(n);
                    const found = [...PRESETS].reverse().find((x) => n >= x.min);
                    const key: SizePresetKey = found?.key ?? defaultPresetKey;
                    setSizePreset(key);
                  }}
                  editable={!inputsDisabled}
                  placeholderTextColor="rgba(148,163,184,0.8)"
                  style={tw.style(
                    `h-9 w-20 rounded-xl px-2 border text-[12px] bg-white dark:bg-[#172534] text-[#0d141c] dark:text-white`,
                    inputsDisabled
                      ? `opacity-50 border-[#cedbe8] dark:border-white/15`
                      : `border-[#cedbe8] dark:border-white/15`
                  )}
                />
              </View>
            </View>
          </View>

          <View>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Level</Text>
            <View
              style={tw`mt-1 flex-row rounded-lg overflow-hidden border border-[#cedbe8] dark:border-white/15`}
            >
              {(['beginner', 'intermediate', 'advanced'] as const).map((lv) => {
                const active = classLevel === lv;
                return (
                  <Pressable
                    key={lv}
                    onPress={() => !inputsDisabled && setClassLevel(lv)}
                    disabled={inputsDisabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: inputsDisabled }}
                    accessibilityLabel={lv}
                    style={tw.style(
                      `flex-1 px-3 py-2`,
                      active ? `bg-indigo-50 dark:bg-white/10` : `bg-white dark:bg-[#172534]`,
                      inputsDisabled && `opacity-50`
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

          <View style={tw`gap-2`}>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Manual overrides</Text>
            <LabeledNumber
              label="Lessons"
              value={totalLessons}
              min={1}
              max={500}
              disabled={inputsDisabled}
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
              disabled={inputsDisabled}
              onChange={(v) => {
                setOverrideQuiz(true);
                setQuizCount(Math.max(4, v));
              }}
            />
          </View>

          {(overrideLessons || overrideQuiz) && (
            <Pressable
              onPress={() => {
                if (inputsDisabled) return;
                setOverrideLessons(false);
                setOverrideQuiz(false);
                setTotalLessons(trackLessons);
                setQuizCount(Math.max(4, Math.floor(trackLessons * 2)));
              }}
              disabled={inputsDisabled}
              style={tw.style(
                `self-start px-3 py-1.5 rounded-full bg-white dark:bg-[#172534] border border-[#cedbe8] dark:border-white/15`,
                inputsDisabled && `opacity-50`
              )}
            >
              <Text style={tw`text-[#0d141c] dark:text-white text-xs`}>Use track defaults</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function StartWithAiButton({
  busy,
  hasAIContent,
  onStart,
  canStartNow,
  fullWidth = false,
}: {
  busy: boolean;
  hasAIContent: boolean;
  onStart: () => Promise<void> | void;
  canStartNow: boolean;
  fullWidth?: boolean;
}) {
  const disabled = busy || !canStartNow;

  return (
    <TouchableOpacity
      onPress={() => {
        if (!disabled) onStart();
      }}
      disabled={disabled}
      activeOpacity={0.85}
      style={tw.style(
        `${fullWidth ? 'w-full' : 'flex-1'} rounded-xl py-3 items-center justify-center border flex-row gap-2`,
        disabled ? 'bg-indigo-600/60 border-indigo-600/60' : 'bg-indigo-600 border-indigo-600'
      )}
    >
      {busy ? <ActivityIndicator size={12} color="#fff" /> : null}

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

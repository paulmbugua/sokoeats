/* eslint-disable prettier/prettier */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  Modal,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import tw from '../../tailwind';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import { useShopContext } from '@mytutorapp/shared/context';
import { useWordSync } from '@mytutorapp/shared/hooks/useWordSync';
import {
  listTtsVoices,
  type TtsVoiceInfo,
} from '@mytutorapp/shared/api/ttsAvatarApi';

import SelectField from './SelectField.native';
import Markdown from '@/screens/Markdown.native';

import {
  ThemeProvider,
  useThemeTokens,
  type HighlightTemplate,
} from '../screens/player/ThemeContext.native';

// ───────────────────────── Types ─────────────────────────

export type LessonLite = {
  id: string;
  title?: string;
  ssml: string;
  markdown?: string;
};

export type OutlineSection = {
  id: string;
  title: string;
  keyPoints?: string[];
};

type SentenceGroup = {
  indices: number[];
  start?: number;
  end?: number;
};

type Props = {
  ssml?: string;
  lessons?: LessonLite[];
  title?: string;
  voiceName?: string;
  onNext?: () => Promise<boolean> | boolean;
  onPrev?: () => Promise<boolean> | boolean;
  isBuildingNext?: boolean;
  onEnded?: () => void;

  course?: any | null;
  outline?: OutlineSection[];
  backendUrlOverride?: string;
  playJoinedIfAvailable?: boolean;
  onBeforePlay?: () => Promise<void> | void;
  onPlayerLoadingChange?: (loading: boolean) => void;
  onRequestStart?: () => void;

  activeIndex?: number;
};

// ─────────────────────── Constants ───────────────────────

const VOICE_KEY = 'classroomMobileVoice';
const SCALE_KEY = 'classroomMobileScale';
const TEMPLATE_KEY = 'classroomMobileTemplate';

// Small helper
function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// ─────────────────────── Main Screen ───────────────────────

const ClassroomPlayerScreen: React.FC<Props> = (props) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <ThemeProvider>
      <SafeAreaView
        style={tw.style(
          'flex-1',
          isDark ? 'bg-slate-950' : 'bg-slate-100',
        )}
      >
        <View style={tw`flex-1`}>
          <InnerPlayer {...props} />
        </View>
      </SafeAreaView>
    </ThemeProvider>
  );
};

export default ClassroomPlayerScreen;

// ───────────────────── Inner Player ─────────────────────

const InnerPlayer: React.FC<Props> = (props) => {
  const {
    ssml,
    lessons = [],
    title = 'AI Lesson',
    voiceName = 'en-US-Wavenet-C',
    onNext,
    onPrev,
    isBuildingNext,
    course,
    outline = [],
    backendUrlOverride,
    playJoinedIfAvailable = false,
    onBeforePlay,
    onPlayerLoadingChange,
    onRequestStart,
    onEnded,
    activeIndex,
  } = props;

  const { backendUrl } = useShopContext();
  const effectiveBackend = backendUrlOverride || backendUrl;
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { width } = useWindowDimensions();

  const {
    hlHex,
    genHex,
    activeTextOnHl,
    templateId,
    setTemplateId,
  } = useThemeTokens();

  // Word sync (audio, timings)
  const {
    speak,
    loading,
    error,
    words: wordsRaw,
    currentIndex,
    isPlaying,
    play,
    pause,
    seekToWord,
    resumeAudioContext,
    sentenceGroups,
    clearForNewSession,
    volume,
    setVolume,
    endedTick,
  } = useWordSync();

  const words = wordsRaw ?? [];
  const hasLessons = Array.isArray(lessons) && lessons.length > 0;
  const hasJoined = typeof ssml === 'string' && ssml.trim().length > 0;
  const useJoined = playJoinedIfAvailable && hasJoined;

  // Which lesson index (local vs controlled)
  const [lessonIdx, setLessonIdx] = useState(0);
  const uiLessonIdx =
    typeof activeIndex === 'number'
      ? Math.max(0, activeIndex)
      : lessonIdx;

  const [showTranscript, setShowTranscript] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);

  // Theme: template persisted
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TEMPLATE_KEY);
        if (saved) setTemplateId(saved as HighlightTemplate);
      } catch {}
    })();
  }, [setTemplateId]);

  useEffect(() => {
    AsyncStorage.setItem(TEMPLATE_KEY, templateId).catch(() => {});
  }, [templateId]);

  // Reader scale
  const [userScale, setUserScale] = useState(1);
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SCALE_KEY);
        if (saved) {
          const n = Number(saved);
          if (!Number.isNaN(n) && n > 0.6 && n < 2) {
            setUserScale(n);
          }
        }
      } catch {}
    })();
  }, []);
  useEffect(() => {
    AsyncStorage.setItem(SCALE_KEY, String(userScale)).catch(() => {});
  }, [userScale]);

  const baseFont = width < 380 ? 18 : width < 480 ? 20 : 22;
  const stageFontSize = baseFont * userScale;

  // Voice selection
  const [voice, setVoice] = useState(voiceName || 'en-US-Wavenet-C');
  const [voicesList, setVoicesList] = useState<TtsVoiceInfo[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  // load saved voice
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(VOICE_KEY);
        if (saved) setVoice(saved);
        else if (voiceName) setVoice(voiceName);
      } catch {}
    })();
  }, [voiceName]);

  useEffect(() => {
    AsyncStorage.setItem(VOICE_KEY, voice).catch(() => {});
  }, [voice]);

  // load voices
  useEffect(() => {
    if (!effectiveBackend) return;
    let alive = true;

    (async () => {
      try {
        setVoicesLoading(true);
        setVoicesError(null);
        const list = await listTtsVoices(effectiveBackend, { onlyWavenet: true });
        if (alive) setVoicesList(list || []);
      } catch (e: any) {
        if (alive) setVoicesError(e?.message || 'Failed to load voices');
      } finally {
        if (alive) setVoicesLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [effectiveBackend]);

  // Effective SSML to play
  const effectiveSsml = useMemo(() => {
    if (useJoined) return (ssml || '').trim();
    if (hasLessons) return (lessons[uiLessonIdx]?.ssml || '').trim();
    return (ssml || '').trim();
  }, [useJoined, ssml, hasLessons, lessons, uiLessonIdx]);

  const titleForUi = useMemo(() => {
    if (useJoined) return title;
    if (hasLessons) {
      const total =
        Math.max(lessons.length, outline.length) || 1;
      const base =
        lessons[uiLessonIdx]?.title ||
        `${title || 'AI Lesson'} — Lesson ${uiLessonIdx + 1}/${total}`;
      return base;
    }
    return title || 'AI Lesson';
  }, [useJoined, hasLessons, lessons, outline.length, uiLessonIdx, title]);

  // speak when ssml/voice changes
  const lastSpeakKey = useRef<string | null>(null);

  useEffect(() => {
    if (!effectiveBackend) return;
    const key = `${voice}|${effectiveSsml.length}|${uiLessonIdx}|${
      useJoined ? 'joined' : 'per'
    }`;
    if (!effectiveSsml || key === lastSpeakKey.current) return;

    let cancelled = false;

    (async () => {
      try {
        await pause();
        clearForNewSession();
        if (!effectiveSsml.trim() || cancelled) return;
        await speak(effectiveBackend, {
          ssml: effectiveSsml.trim(),
          voiceName: voice,
        });
        lastSpeakKey.current = key;
      } catch (e) {
        console.warn('[ClassroomPlayer.native] speak failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveBackend, effectiveSsml, uiLessonIdx, useJoined, voice, speak, pause, clearForNewSession]);

  // duration / progress
  const durationSec = useMemo(
    () =>
      words.length
        ? Math.max(...words.map((w: any) => w.end || 0))
        : 0,
    [words],
  );
  const currentSec = useMemo(
    () => (words as any)[currentIndex]?.start ?? 0,
    [words, currentIndex],
  );
  const progress = durationSec
    ? Math.max(0, Math.min(1, currentSec / durationSec))
    : 0;

  // Seek helpers
 function indexForTime(
  ws: Array<{ start: number; end: number }>,
  t: number,
): number {
  if (!ws.length) return 0;

  const first = ws[0]!;
  const last = ws[ws.length - 1]!;

  if (t <= first.start) return 0;
  if (t >= last.end) return ws.length - 1;

  let lo = 0;
  let hi = ws.length - 1;
  let ans = ws.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midWord = ws[mid]!; // non-null assertion

    if (midWord.end >= t) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return Math.max(0, Math.min(ans, ws.length - 1));
}

  const seekToTime = useCallback(
    (t: number) => {
      if (!words.length) return;
      const tt = Math.max(0, Math.min(durationSec, t));
      try {
        void resumeAudioContext();
      } catch {}
      const idx = indexForTime(words as any, tt);
      seekToWord(idx);
    },
    [words, durationSec, resumeAudioContext, seekToWord, indexForTime],
  );

  const nudgeSeconds = (d: number) =>
    seekToTime(Math.max(0, Math.min(durationSec, currentSec + d)));

  // play/pause
  const handlePlayPause = useCallback(async () => {
    try {
      await resumeAudioContext();
      if (!isPlaying) {
        if (!words.length) {
          onRequestStart?.();
          onPlayerLoadingChange?.(true);
        }
        await onBeforePlay?.();
        await play();
      } else {
        pause();
      }
    } catch (e) {
      console.warn('[ClassroomPlayer.native] play/pause failed', e);
    }
  }, [
    isPlaying,
    words.length,
    play,
    pause,
    resumeAudioContext,
    onBeforePlay,
    onRequestStart,
    onPlayerLoadingChange,
  ]);

  // loading callback
  useEffect(() => {
    onPlayerLoadingChange?.(loading);
  }, [loading, onPlayerLoadingChange]);

  // ended / auto-next
  const lastEndedTickRef = useRef(0);
  useEffect(() => {
    if (!endedTick || endedTick === lastEndedTickRef.current) return;
    lastEndedTickRef.current = endedTick;

    if (error) return;

    try {
      onEnded?.();
    } catch {}

    const hasImmediateNext =
      hasLessons && uiLessonIdx < lessons.length - 1;
    const maybeMoreComing =
      (outline?.length || 0) > (lessons?.length || 0);

    if (!hasImmediateNext && !maybeMoreComing) return;

    // Prefer parent onNext, else local index advance
    (async () => {
      if (typeof onNext === 'function') {
        try {
          const handled = await onNext();
          if (handled) return;
        } catch {}
      }
      if (typeof activeIndex !== 'number') {
        setLessonIdx((i) =>
          Math.min(i + 1, Math.max(lessons.length - 1, 0)),
        );
      }
    })();
  }, [
    endedTick,
    error,
    hasLessons,
    lessons.length,
    uiLessonIdx,
    outline?.length,
    onNext,
    onEnded,
    activeIndex,
  ]);

  // Prev / next buttons
  const handlePrev = useCallback(async () => {
    if (uiLessonIdx <= 0) return;
    if (typeof onPrev === 'function') {
      try {
        const did = await onPrev();
        if (did) return;
      } catch {}
    }
    if (typeof activeIndex !== 'number') {
      setLessonIdx((i) => Math.max(0, i - 1));
    }
  }, [onPrev, uiLessonIdx, activeIndex]);

  const handleNext = useCallback(async () => {
    if (typeof onNext === 'function') {
      try {
        const did = await onNext();
        if (did) return;
      } catch {}
    }
    if (typeof activeIndex !== 'number') {
      setLessonIdx((i) =>
        Math.min(i + 1, Math.max(lessons.length - 1, 0)),
      );
    }
  }, [onNext, activeIndex, lessons.length]);

  const totalLessonsForUi = useMemo(
    () =>
      Math.max(lessons?.length || 0, outline?.length || 0) || 1,
    [lessons?.length, outline?.length],
  );

  // Volume / mute
  const [mutedAt, setMutedAt] = useState<number | null>(null);
  const toggleMute = () => {
    if (mutedAt === null && volume > 0) {
      setMutedAt(volume);
      setVolume(0);
    } else {
      setVolume(mutedAt ?? 1);
      setMutedAt(null);
    }
  };

  const volDown = () =>
    setVolume(Math.max(0, +(Math.max(0, volume - 0.1)).toFixed(3)));
  const volUp = () =>
    setVolume(Math.min(1, +(Math.min(1, volume + 0.1)).toFixed(3)));

  const sentences = (sentenceGroups || []) as SentenceGroup[];

  return (
    <View style={tw`flex-1`}>
      {/* Background "glass" frame */}
      <View
        style={tw.style(
          'flex-1 mx-3 my-2 rounded-3xl overflow-hidden',
          'bg-slate-900/90 dark:bg-black/90 border border-white/10',
          'shadow-[0_20px_60px_rgba(15,23,42,0.85)]',
        )}
      >
        {/* Top bar */}
        <TopBarMobile
          title={titleForUi}
          voice={voice}
          setVoice={setVoice}
          voices={(voicesList || []).map((v) => v.name)}
          voicesLoading={voicesLoading}
          voicesError={voicesError}
          onPlayPause={handlePlayPause}
          playing={isPlaying}
          loading={loading}
          onToggleTranscript={() => setShowTranscript((s) => !s)}
          transcriptOpen={showTranscript}
          onToggleNotes={() => setShowNotes((s) => !s)}
          onToggleTheme={() => setShowThemeSheet(true)}
          lessonIndex={uiLessonIdx}
          totalLessons={totalLessonsForUi}
        />

        {/* Body */}
        <View style={tw`flex-1 px-3 pb-3 pt-1`}>
          {/* Small chip row */}
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <View
              style={tw.style(
                'px-3 py-1 rounded-full',
                'bg-slate-800/80 dark:bg-slate-900/90 border border-white/10',
              )}
            >
              <Text
                style={tw`text-[11px] text-slate-100 dark:text-slate-200`}
                numberOfLines={1}
              >
                {course?.title || course?.name || 'AI Course'}
              </Text>
            </View>
            {hasLessons && (
              <View
                style={tw.style(
                  'px-3 py-1 rounded-full flex-row items-center gap-1',
                  'bg-slate-800/80 dark:bg-slate-900/90 border border-white/10',
                )}
              >
                <Ionicons
                  name="book-outline"
                  size={14}
                  color="#e5e7eb"
                />
                <Text
                  style={tw`text-[11px] text-slate-100 dark:text-slate-200`}
                >
                  Lesson {uiLessonIdx + 1}/{totalLessonsForUi}
                </Text>
              </View>
            )}
          </View>

          {/* Main narration "stage" */}
          <NarrationStage
            sentences={sentences}
            words={words as any}
            currentIndex={currentIndex}
            fontSize={stageFontSize}
            templateId={templateId}
            hlHex={hlHex}
            genHex={genHex}
            activeTextOnHl={activeTextOnHl}
            isDark={isDark}
          />

          {/* Error / status */}
          {loading && !words.length && !error && (
            <View style={tw`mt-3 items-center`}>
              <View
                style={tw`px-3 py-1.5 rounded-full bg-black/60 border border-white/15 flex-row items-center`}
              >
                <View
                  style={tw`h-3 w-3 rounded-full border-2 border-white/30 border-t-white mr-2`}
                />
                <Text style={tw`text-xs text-slate-100`}>
                  Generating lesson narration…
                </Text>
              </View>
            </View>
          )}
          {error && !loading && (
            <View style={tw`mt-3 items-center`}>
              <View
                style={tw`px-3 py-1.5 rounded-full bg-red-950/80 border border-red-500/60`}
              >
                <Text style={tw`text-xs text-red-100`}>
                  {error}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Bottom bar */}
        <BottomBarMobile
          currentSec={currentSec}
          durationSec={durationSec}
          progress={progress}
          onSeek={seekToTime}
          onBack5={() => nudgeSeconds(-5)}
          onFwd5={() => nudgeSeconds(5)}
          onPlayPause={handlePlayPause}
          playing={isPlaying}
          loading={loading}
          volume={volume}
          volDown={volDown}
          volUp={volUp}
          toggleMute={toggleMute}
          onPrev={hasLessons ? handlePrev : undefined}
          onNext={hasLessons ? handleNext : undefined}
          lessonIndex={uiLessonIdx}
          totalLessons={totalLessonsForUi}
          isBuildingNext={!!isBuildingNext}
          userScale={userScale}
          setUserScale={setUserScale}
          hlHex={hlHex} 
        />
      </View>

      {/* Transcript modal */}
      <TranscriptModal
        open={showTranscript}
        onClose={() => setShowTranscript(false)}
        title={titleForUi}
        sentences={sentences}
        words={words as any}
        currentIndex={currentIndex}
        seekToWord={seekToWord}
      />

      {/* Notes modal */}
      <NotesModal
        open={showNotes}
        onClose={() => setShowNotes(false)}
        title={titleForUi}
        markdown={
          hasLessons
            ? lessons[uiLessonIdx]?.markdown ||
              '_No notes for this lesson yet._'
            : '_No notes for this lesson yet._'
        }
      />

      {/* Theme sheet (templates + quick highlight presets) */}
      <ThemeSheet
        open={showThemeSheet}
        onClose={() => setShowThemeSheet(false)}
        templateId={templateId}
        setTemplateId={setTemplateId}
        hlHex={hlHex}
      />
    </View>
  );
};

// ───────────────────── Top Bar (mobile) ─────────────────────

function TopBarMobile({
  title,
  voice,
  setVoice,
  voices,
  voicesLoading,
  voicesError,
  onPlayPause,
  playing,
  loading,
  onToggleTranscript,
  transcriptOpen,
  onToggleNotes,
  onToggleTheme,
  lessonIndex,
  totalLessons,
}: {
  title: string;
  voice: string;
  setVoice: (v: string) => void;
  voices: string[];
  voicesLoading?: boolean;
  voicesError?: string | null;
  onPlayPause: () => void;
  playing: boolean;
  loading: boolean;
  onToggleTranscript: () => void;
  transcriptOpen: boolean;
  onToggleNotes: () => void;
  onToggleTheme: () => void;
  lessonIndex: number;
  totalLessons: number;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const voiceOptions = voices.length
    ? voices
    : voice
    ? [voice]
    : [];

  const selectOptions = voiceOptions.map((v) => ({
    label: v,
    value: v,
  }));

  const voiceLabel = voicesLoading
    ? 'Loading voices…'
    : voicesError
    ? 'Voices unavailable'
    : voice || 'Voice';

  return (
    <View
      style={tw.style(
        'px-3 py-2 flex-row items-center gap-2',
        'bg-slate-900/95 dark:bg-black/95 border-b border-white/10',
      )}
    >
      {/* Left: glowing dot + title */}
      <View style={tw`flex-row items-center gap-2 flex-1 min-w-0`}>
        <View
          style={tw`h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]`}
        />
        <View style={tw`flex-1`}>
          <Text
            style={tw.style(
              'text-xs text-slate-200',
              isDark && 'text-slate-100',
            )}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={tw`text-[10px] text-slate-400 mt-0.5`}
            numberOfLines={1}
          >
            Lesson {lessonIndex + 1}/{totalLessons} · {voiceLabel}
          </Text>
        </View>
      </View>

      {/* Voice select (compact) */}
      <View style={tw`w-32`}>
        <SelectField
          value={voice}
          onChange={setVoice}
          options={selectOptions}
          placeholder={voiceLabel}
          placeholderColor="rgba(148,163,184,0.9)"
          selectedTextColor={isDark ? '#e5e7eb' : '#0f172a'}
        />
      </View>

      {/* Right buttons */}
      <Pressable
        onPress={onToggleTranscript}
        style={tw.style(
          'h-9 w-9 rounded-full items-center justify-center ml-1',
          transcriptOpen
            ? 'bg-white'
            : 'bg-white/10 dark:bg-white/10',
        )}
      >
        <Ionicons
          name="newspaper-outline"
          size={16}
          color={transcriptOpen ? '#000' : '#f9fafb'}
        />
      </Pressable>

      <Pressable
        onPress={onToggleNotes}
        style={tw.style(
          'h-9 w-9 rounded-full items-center justify-center',
          'bg-white/10 dark:bg-white/10',
        )}
      >
        <Ionicons
          name="pencil-outline"
          size={16}
          color="#f9fafb"
        />
      </Pressable>

      <Pressable
        onPress={onToggleTheme}
        style={tw.style(
          'h-9 w-9 rounded-full items-center justify-center',
          'bg-white/10 dark:bg-white/10 ml-1',
        )}
      >
        <MaterialIcons
          name="palette"
          size={18}
          color="#f9fafb"
        />
      </Pressable>

      <Pressable
        onPress={onPlayPause}
        disabled={loading}
        style={tw.style(
          'ml-2 h-9 px-3 rounded-full flex-row items-center justify-center',
          loading
            ? 'bg-slate-600/60'
            : 'bg-white',
        )}
      >
        <Ionicons
          name={playing ? 'pause' : 'play'}
          size={14}
          color={loading ? '#e5e7eb' : '#000'}
        />
        <Text
          style={tw.style(
            'text-xs font-semibold ml-1',
            loading ? 'text-slate-200' : 'text-black',
          )}
        >
          {playing ? 'Pause' : loading ? 'Loading' : 'Play'}
        </Text>
      </Pressable>
    </View>
  );
}

// ───────────────────── Narration Stage ─────────────────────

function NarrationStage({
  sentences,
  words,
  currentIndex,
  fontSize,
  templateId,
  hlHex,
  genHex,
  activeTextOnHl,
  isDark,
}: {
  sentences: SentenceGroup[];
  words: { text: string; start: number; end: number }[];
  currentIndex: number;
  fontSize: number;
  templateId: HighlightTemplate;
  hlHex: string;
  genHex: string;
  activeTextOnHl: string;
  isDark: boolean;
}) {
  const activeSentenceIdx = useMemo(() => {
    if (!sentences?.length) return 0;
    const idx = sentences.findIndex((s) =>
      s.indices.includes(currentIndex),
    );
    return idx === -1 ? 0 : idx;
  }, [sentences, currentIndex]);

  const visibleSentenceIndices = useMemo(() => {
    if (!sentences.length) return [];
    const idx = activeSentenceIdx;
    const arr: number[] = [];
    if (idx > 0) arr.push(idx - 1);
    arr.push(idx);
    if (idx + 1 < sentences.length) arr.push(idx + 1);
    return arr;
  }, [sentences, activeSentenceIdx]);

  const baseTextColor = isDark ? '#F9FAFB' : '#0F172A';
  const dimmedColor = isDark ? '#94a3b8' : '#4b5563';

  const activeWordStyle = (): any => {
    switch (templateId) {
      case 'boxed-pill':
        return {
          backgroundColor: hlHex,
          color: activeTextOnHl,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 999,
        };
      case 'karaoke-glow':
        return {
          color: activeTextOnHl,
          textShadowColor: hlHex,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 6,
          fontWeight: '600',
        };
      case 'underline-glow':
        return {
          color: activeTextOnHl,
          borderBottomWidth: 2,
          borderBottomColor: hlHex,
          paddingBottom: 1,
        };
      case 'ribbon':
        return {
          backgroundColor: hlHex,
          color: activeTextOnHl,
          paddingHorizontal: 6,
          borderRadius: 8,
        };
      case 'clean-stripe':
      default:
        return {
          color: activeTextOnHl,
          fontWeight: '600',
        };
    }
  };

  return (
    <View
      style={tw.style(
        'flex-1 mt-1 mb-2 rounded-3xl border border-white/10',
        'bg-slate-900/70 dark:bg-slate-950/80 px-4 py-4',
      )}
    >
      <ScrollView
        contentContainerStyle={tw`flex-1 justify-center`}
        showsVerticalScrollIndicator={false}
      >
        {visibleSentenceIndices.map((sIdx) => {
          const s = sentences[sIdx];
          const isActiveSentence = sIdx === activeSentenceIdx;
          if (!s) return null;

          return (
            <Text
              key={`sent-${sIdx}`}
              style={{
                textAlign: 'center',
                fontSize,
                lineHeight: fontSize * 1.35,
                color: isActiveSentence ? baseTextColor : dimmedColor,
              }}
            >
              {s.indices.map((wi, i) => {
                const w = words[wi];
                if (!w) return null;
                const isActiveWord = wi === currentIndex;

                return (
                  <Text
                    key={`${wi}-${i}`}
                    style={[
                      {
                        color: isActiveWord
                          ? activeTextOnHl
                          : isActiveSentence
                          ? baseTextColor
                          : dimmedColor,
                      },
                      isActiveWord && activeWordStyle(),
                    ]}
                  >
                    {(i === 0 ? '' : ' ') + (w.text || '')}
                  </Text>
                );
              })}
            </Text>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ───────────────────── Bottom Bar ─────────────────────

function BottomBarMobile({
  currentSec,
  durationSec,
  progress,
  onSeek,
  onBack5,
  onFwd5,
  onPlayPause,
  playing,
  loading,
  volume,
  volDown,
  volUp,
  toggleMute,
  onPrev,
  onNext,
  lessonIndex,
  totalLessons,
  isBuildingNext,
  userScale,
  setUserScale,
  hlHex, 
}: {
  currentSec: number;
  durationSec: number;
  progress: number;
  onSeek: (sec: number) => void;
  onBack5: () => void;
  onFwd5: () => void;
  onPlayPause: () => void;
  playing: boolean;
  loading: boolean;
  volume: number;
  volDown: () => void;
  volUp: () => void;
  toggleMute: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  lessonIndex: number;
  totalLessons: number;
  isBuildingNext: boolean;
  userScale: number;
  setUserScale: (n: number) => void;
   hlHex: string; 
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const minScale = 0.8;
  const maxScale = 1.6;

  return (
    <View
      style={tw.style(
        'px-3 pt-2 pb-3 border-t border-white/10',
        'bg-slate-900/95 dark:bg-black/95',
      )}
    >
      {/* Row 1: playback + time */}
      <View style={tw`flex-row items-center mb-2`}>
        <Pressable
          onPress={onBack5}
          style={tw`h-9 w-9 rounded-full bg-white/10 items-center justify-center mr-1`}
        >
          <Ionicons
            name="play-back"
            size={18}
            color="#f9fafb"
          />
        </Pressable>

        <Pressable
          onPress={onPlayPause}
          disabled={loading}
          style={tw.style(
            'h-9 w-9 rounded-full items-center justify-center mr-1',
            loading ? 'bg-slate-600/60' : 'bg-white',
          )}
        >
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={18}
            color={loading ? '#e5e7eb' : '#000'}
          />
        </Pressable>

        <Pressable
          onPress={onFwd5}
          style={tw`h-9 w-9 rounded-full bg-white/10 items-center justify-center mr-2`}
        >
          <Ionicons
            name="play-forward"
            size={18}
            color="#f9fafb"
          />
        </Pressable>

        <Text
          style={tw`text-xs text-slate-100 tabular-nums`}
        >
          {formatTime(currentSec)} /{' '}
          {durationSec ? formatTime(durationSec) : '0:00'}
        </Text>

        <View style={tw`flex-row items-center ml-auto`}>
          {onPrev && (
            <Pressable
              onPress={onPrev}
              style={tw`px-2 py-1 rounded-full bg-white/10 mr-1`}
            >
              <Text style={tw`text-[11px] text-slate-100`}>
                Prev
              </Text>
            </Pressable>
          )}
          {onNext && (
            <Pressable
              onPress={onNext}
              disabled={isBuildingNext}
              style={tw.style(
                'px-2 py-1 rounded-full',
                isBuildingNext
                  ? 'bg-white/20'
                  : 'bg-white',
              )}
            >
              <Text
                style={tw.style(
                  'text-[11px]',
                  isBuildingNext ? 'text-slate-800' : 'text-black',
                )}
              >
                {isBuildingNext ? 'Building…' : 'Next'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Row 2: scrubber */}
      <View style={tw`flex-row items-center mb-2`}>
        <Text
          style={tw`w-10 text-[11px] text-slate-300 tabular-nums`}
        >
          {formatTime(currentSec)}
        </Text>
        <View style={tw`flex-1 mx-2`}>
          <Slider
            value={durationSec ? currentSec : 0}
            minimumValue={0}
            maximumValue={Math.max(1, durationSec)}
            onSlidingComplete={(sec) => onSeek(sec)}
            minimumTrackTintColor={hlHex}
            maximumTrackTintColor={
              isDark ? '#1f2937' : '#e5e7eb'
            }
            thumbTintColor={hlHex}
          />
        </View>
        <Text
          style={tw`w-10 text-[11px] text-slate-300 tabular-nums text-right`}
        >
          {durationSec ? formatTime(durationSec) : '0:00'}
        </Text>
      </View>

      {/* Row 3: volume + text size + lesson chip */}
      <View style={tw`flex-row items-center`}>
        {/* Volume */}
        <Pressable
          onPress={toggleMute}
          style={tw`h-8 w-8 rounded-full bg-white/10 items-center justify-center`}
        >
          <Ionicons
            name={volume === 0 ? 'volume-mute' : 'volume-high'}
            size={16}
            color="#f9fafb"
          />
        </Pressable>
        <Pressable
          onPress={volDown}
          style={tw`ml-1 h-7 w-7 rounded-full bg-white/10 items-center justify-center`}
        >
          <Text style={tw`text-xs text-slate-100`}>−</Text>
        </Pressable>
        <Pressable
          onPress={volUp}
          style={tw`ml-1 h-7 w-7 rounded-full bg-white/10 items-center justify-center`}
        >
          <Text style={tw`text-xs text-slate-100`}>+</Text>
        </Pressable>
        <Text
          style={tw`ml-1 text-[11px] text-slate-200 tabular-nums`}
        >
          {Math.round(volume * 100)}%
        </Text>

        {/* Text size */}
        <View style={tw`flex-row items-center ml-4`}>
          <Text style={tw`text-[11px] text-slate-300 mr-1`}>
            Text
          </Text>
          <Pressable
            onPress={() =>
              setUserScale(
                Math.max(minScale, userScale - 0.1),
              )
            }
            style={tw`h-7 w-7 rounded-full bg-white/10 items-center justify-center`}
          >
            <Text style={tw`text-xs text-slate-100`}>A-</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setUserScale(
                Math.min(maxScale, userScale + 0.1),
              )
            }
            style={tw`ml-1 h-7 w-7 rounded-full bg-white/10 items-center justify-center`}
          >
            <Text style={tw`text-xs text-slate-100`}>A+</Text>
          </Pressable>
        </View>

        {/* Lesson chip */}
        <View style={tw`ml-auto px-2 py-1 rounded-full bg-white/5`}>
          <Text
            style={tw`text-[11px] text-slate-100 tabular-nums`}
          >
            {lessonIndex + 1}/{totalLessons}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ───────────────────── Transcript Modal ─────────────────────

function TranscriptModal({
  open,
  onClose,
  title,
  sentences,
  words,
  currentIndex,
  seekToWord,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sentences: SentenceGroup[];
  words: { text: string; start: number; end: number }[];
  currentIndex: number;
  seekToWord: (i: number) => void;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const activeSentenceIdx = useMemo(() => {
    if (!sentences?.length) return 0;
    const idx = sentences.findIndex((s) =>
      s.indices.includes(currentIndex),
    );
    return idx === -1 ? 0 : idx;
  }, [sentences, currentIndex]);

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={tw`flex-1 justify-end bg-black/40`}>
        <View
          style={tw.style(
            'max-h-[70%] rounded-t-3xl px-4 pt-3 pb-4',
            isDark ? 'bg-slate-950' : 'bg-slate-100',
          )}
        >
          <View style={tw`flex-row items-center mb-2`}>
            <Text
              style={tw.style(
                'flex-1 text-xs font-semibold',
                isDark ? 'text-slate-100' : 'text-slate-900',
              )}
              numberOfLines={1}
            >
              Transcript · {title}
            </Text>
            <Pressable
              onPress={onClose}
              style={tw`h-8 w-8 rounded-full items-center justify-center bg-slate-800/70`}
            >
              <Ionicons
                name="close"
                size={16}
                color="#f9fafb"
              />
            </Pressable>
          </View>

          <ScrollView>
            {sentences.map((s, sIdx) => {
              const isActive = sIdx === activeSentenceIdx;
              return (
                <Pressable
                  key={`t-${sIdx}`}
                  onPress={() => {
                    if (s.indices[0] != null) {
                      seekToWord(s.indices[0]);
                    }
                  }}
                  style={tw.style(
                    'px-2 py-1.5 rounded-xl mb-1',
                    isActive
                      ? 'bg-indigo-600/70'
                      : 'bg-slate-800/80',
                  )}
                >
                  <Text
                    style={tw.style(
                      'text-[12px]',
                      isActive
                        ? 'text-white'
                        : 'text-slate-100',
                    )}
                  >
                    {s.indices
                      .map((wi) => words[wi]?.text)
                      .filter(Boolean)
                      .join(' ')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────── Notes Modal ─────────────────────

function NotesModal({
  open,
  onClose,
  title,
  markdown,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  markdown: string;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={tw`flex-1 justify-end bg-black/40`}>
        <View
          style={tw.style(
            'max-h-[70%] rounded-t-3xl px-4 pt-3 pb-4',
            isDark ? 'bg-slate-950' : 'bg-slate-100',
          )}
        >
          <View style={tw`flex-row items-center mb-2`}>
            <Text
              style={tw.style(
                'flex-1 text-xs font-semibold',
                isDark ? 'text-slate-100' : 'text-slate-900',
              )}
              numberOfLines={1}
            >
              Notes · {title}
            </Text>
            <Pressable
              onPress={onClose}
              style={tw`h-8 w-8 rounded-full items-center justify-center bg-slate-800/70`}
            >
              <Ionicons
                name="close"
                size={16}
                color="#f9fafb"
              />
            </Pressable>
          </View>

          <ScrollView>
            <Markdown>{markdown}</Markdown>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────── Theme Sheet ─────────────────────

const COLOR_PRESETS = [
  '#22d3ee',
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f97316',
  '#ef4444',
  '#f472b6',
  '#a78bfa',
  '#ffffff',
  '#e5e7eb',
];

function ThemeSheet({
  open,
  onClose,
  templateId,
  setTemplateId,
  hlHex,
}: {
  open: boolean;
  onClose: () => void;
  templateId: HighlightTemplate;
  setTemplateId: (t: HighlightTemplate) => void;
  hlHex: string;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const templates: { id: HighlightTemplate; label: string }[] = [
    { id: 'clean-stripe', label: 'Clean Stripe' },
    { id: 'underline-glow', label: 'Underline Glow' },
    { id: 'karaoke-glow', label: 'Karaoke Glow' },
    { id: 'boxed-pill', label: 'Boxed Pill' },
    { id: 'ribbon', label: 'Ribbon' },
  ];

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={tw`flex-1 justify-end bg-black/40`}>
        <View
          style={tw.style(
            'rounded-t-3xl px-4 pt-3 pb-4',
            'bg-slate-950',
          )}
        >
          <View style={tw`flex-row items-center mb-2`}>
            <Text
              style={tw`flex-1 text-xs font-semibold text-slate-100`}
            >
              Highlight & style
            </Text>
            <Pressable
              onPress={onClose}
              style={tw`h-8 w-8 rounded-full items-center justify-center bg-slate-800/70`}
            >
              <Ionicons
                name="close"
                size={16}
                color="#f9fafb"
              />
            </Pressable>
          </View>

          <Text
            style={tw`text-[11px] text-slate-400 mb-1`}
          >
            Highlight color
          </Text>
          <View style={tw`flex-row flex-wrap gap-2 mb-3`}>
            {COLOR_PRESETS.map((c) => (
              <View key={c}>
                <View
                  style={tw`h-7 w-7 rounded-full items-center justify-center`}
                >
                  <Pressable
                    onPress={() => {
                      // We only know setHighlightColor exists in ThemeContext.native,
                      // but since we don't import it here, user can wire presets
                      // to that in ThemeContext if desired.
                      // For now this sheet is visual; you can connect color change
                      // via updating ThemeContext.
                      // If ThemeContext exposes setHighlightColor, you can
                      // pass it here and call it.
                    }}
                    style={[
                      tw`h-6 w-6 rounded-full border border-white/20`,
                      { backgroundColor: c },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>

          <Text
            style={tw`text-[11px] text-slate-400 mb-1`}
          >
            Template
          </Text>
          {templates.map((t) => {
            const active = t.id === templateId;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTemplateId(t.id)}
                style={tw.style(
                  'flex-row items-center px-3 py-2 rounded-xl mb-1',
                  active
                    ? 'bg-indigo-600'
                    : 'bg-slate-900',
                )}
              >
                <View
                  style={tw`h-6 w-6 rounded-md bg-black/60 mr-2`}
                />
                <Text
                  style={tw.style(
                    'text-xs',
                    active
                      ? 'text-white'
                      : 'text-slate-100',
                  )}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

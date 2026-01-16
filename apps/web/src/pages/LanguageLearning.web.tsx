import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ClassroomPlayer from '@/components/ClassroomPlayer.web';
import { useShopContext } from '@mytutorapp/shared/context';
import { useLanguageLearning } from '@mytutorapp/shared/hooks';
import { buildGradePayload } from '@mytutorapp/shared/utils/buildGradePayload';
import {
  downloadCertificateFile,
  downloadTranscriptFile,
  generateCertificate,
  generateTranscript,
  gradeQuizApi,
} from '@mytutorapp/shared/api';
import type {
  LanguageLearningMessage,
  PlaybackPayload,
  PlaybackQueueItem,
} from '@mytutorapp/shared/types';

// Modified for Language Learning UX upgrade (active line, autoplay, themed voice panel).
const extractInitMessages = (
  preview: LanguageLearningMessage[] = [],
  playback?: PlaybackPayload | null
) => {
  if (!preview.length) return [];
  const mapped = preview.map((msg) => ({ ...msg }));
  if (playback && mapped[mapped.length - 1]?.role === 'assistant') {
    mapped[mapped.length - 1].playback = playback;
  }
  return mapped;
};

const VOICES = [
  { id: 'calm', label: 'Calm' },
  { id: 'bright', label: 'Bright' },
  { id: 'deep', label: 'Deep' },
  { id: 'storyteller', label: 'Storyteller' },
  { id: 'teacher', label: 'Teacher' },
  { id: 'kid', label: 'Kid-friendly' },
  { id: 'sunny', label: 'Sunny' },
  { id: 'focus', label: 'Focus' },
];

const TOPICS = [
  {
    id: 'travel',
    label: 'Travel',
    prompts: [
      'Teach me travel phrases in {language}. Start with a short dialogue and explain new words.',
      'Give me airport and hotel phrases in {language}, with pronunciation tips.',
      'Role-play a traveler asking for help in {language}.',
    ],
  },
  {
    id: 'food',
    label: 'Food',
    prompts: [
      'Teach me restaurant phrases in {language}. Start with a short dialogue.',
      'Give me a food vocabulary mini-lesson in {language}.',
      'Role-play ordering food in {language} with polite phrases.',
    ],
  },
  {
    id: 'work',
    label: 'Work',
    prompts: [
      'Teach me workplace phrases in {language}. Provide a short dialogue.',
      'Give me office small-talk phrases in {language}.',
      'Role-play a meeting introduction in {language}.',
    ],
  },
  {
    id: 'school',
    label: 'School',
    prompts: [
      'Teach me school-related phrases in {language}.',
      'Role-play asking a teacher for help in {language}.',
      'Give me classroom vocabulary in {language}.',
    ],
  },
  {
    id: 'friends',
    label: 'Friends',
    prompts: [
      'Teach me friendly greetings in {language} with a short dialogue.',
      'Give me casual phrases to make plans in {language}.',
      'Role-play meeting a new friend in {language}.',
    ],
  },
  {
    id: 'shopping',
    label: 'Shopping',
    prompts: [
      'Teach me shopping phrases in {language}.',
      'Role-play buying clothes in {language}.',
      'Give me pricing and bargaining phrases in {language}.',
    ],
  },
  {
    id: 'directions',
    label: 'Directions',
    prompts: [
      'Teach me directions and navigation phrases in {language}.',
      'Role-play asking for directions in {language}.',
      'Give me transit phrases in {language} for buses and trains.',
    ],
  },
  {
    id: 'doctor',
    label: 'Doctor',
    prompts: [
      'Teach me health and doctor visit phrases in {language}.',
      'Role-play explaining symptoms in {language}.',
      'Give me pharmacy phrases in {language}.',
    ],
  },
  {
    id: 'hobbies',
    label: 'Hobbies',
    prompts: [
      'Teach me hobby-related phrases in {language}.',
      'Role-play talking about hobbies in {language}.',
      'Give me sports and leisure phrases in {language}.',
    ],
  },
  {
    id: 'weather',
    label: 'Weather',
    prompts: [
      'Teach me weather phrases in {language}.',
      'Role-play a weather forecast in {language}.',
      'Give me seasonal vocabulary in {language}.',
    ],
  },
  {
    id: 'interviews',
    label: 'Interviews',
    prompts: [
      'Teach me interview phrases in {language}.',
      'Role-play a short job interview in {language}.',
      'Give me polite professional phrases in {language}.',
    ],
  },
  {
    id: 'small-talk',
    label: 'Small talk',
    prompts: [
      'Teach me small-talk phrases in {language}.',
      'Role-play a casual conversation in {language}.',
      'Give me ice-breaker questions in {language}.',
    ],
  },
];

const DEFAULT_VOICE = {
  voiceId: VOICES[0].id,
  rate: 1,
  pitch: 1,
};

const buildSegmentsFromQueue = (items: PlaybackQueueItem[]) => {
  const map = new Map<number, { en?: string; tr?: string }>();
  for (const item of items) {
    const entry = map.get(item.segmentIdx) || {};
    if (item.kind === 'en') entry.en = item.text;
    if (item.kind === 'tr') entry.tr = item.text;
    map.set(item.segmentIdx, entry);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([idx, seg]) => ({
      segmentIdx: idx,
      en: seg.en || '',
      tr: seg.tr || '',
    }));
};

const LanguageLearningPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { state } = useLocation() as { state?: any };
  const navigate = useNavigate();
  const { backendUrl, token } = useShopContext();

  const languageStart = state?.languageStart;
  const targetLanguage = languageStart?.targetLanguage || 'your target language';
  const voiceStorageKey = `ll_voice_settings_v1_${targetLanguage}`;

  const initMessages = useMemo(
    () => extractInitMessages(languageStart?.messagesPreview, languageStart?.playback),
    [languageStart]
  );

  const {
    messages,
    headerLabel,
    playbackQueue,
    promptsUsed,
    promptsLimit,
    loading,
    error,
    bundleBlocked,
    setPlaybackQueue,
    setInitialState,
    sendPrompt,
    purchaseBundle,
    completeCourse,
  } = useLanguageLearning(backendUrl, token || '', courseId || '', {
    messages: initMessages,
    entitlement: languageStart?.entitlement,
    targetLanguage: languageStart?.targetLanguage,
  });

  const [input, setInput] = useState('');
  const [quiz, setQuiz] = useState<any | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [grade, setGrade] = useState<any | null>(null);
  const [certId, setCertId] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [showTopicPanel, setShowTopicPanel] = useState(false);
  const [topicFilter, setTopicFilter] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<(typeof TOPICS)[number] | null>(null);
  const [voiceSettings, setVoiceSettings] = useState(DEFAULT_VOICE);

  const [activeMessageKey, setActiveMessageKey] = useState<string | null>(null);
  const [inlinePlayback, setInlinePlayback] = useState<PlaybackPayload | null>(null);
  const [inlineIndex, setInlineIndex] = useState(0);
  const [inlinePlaying, setInlinePlaying] = useState(false);
  const [inlineAutoPlayNext, setInlineAutoPlayNext] = useState(false);
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  const [activeLineIsTarget, setActiveLineIsTarget] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const lineRefs = useRef(new Map<string, HTMLDivElement>());
  const lastUserScrollRef = useRef(0);
  const inlinePlayingRef = useRef(inlinePlaying);
  const prevVoiceIdRef = useRef(voiceSettings.voiceId);

  const inlineItems = inlinePlayback?.items || [];
  const inlineSegments = useMemo(() => buildSegmentsFromQueue(inlineItems), [inlineItems]);
  const inlineCurrentItem = inlineItems[inlineIndex];
  const inlineSegmentIdx = inlineCurrentItem?.segmentIdx ?? 0;
  const inlineSegment = inlineSegments.find((seg) => seg.segmentIdx === inlineSegmentIdx);

  useEffect(() => {
    inlinePlayingRef.current = inlinePlaying;
  }, [inlinePlaying]);

  const playInlineCurrent = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
      setInlinePlaying(true);
    } catch {
      setInlinePlaying(false);
    }
  }, []);
  

  useEffect(() => {
    const prevVoiceId = prevVoiceIdRef.current;
    if (prevVoiceId === voiceSettings.voiceId) return;
    prevVoiceIdRef.current = voiceSettings.voiceId;
    if (!inlinePlaying || !audioRef.current || !inlineCurrentItem?.audioUrl) return;
    // Voice identity change: restart current line with new voice while preserving index.
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current.src = inlineCurrentItem.audioUrl;
    audioRef.current.playbackRate = voiceSettings.rate;
    void playInlineCurrent();
  }, [inlineCurrentItem, inlinePlaying, playInlineCurrent, voiceSettings.rate, voiceSettings.voiceId]);

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
    }
  }, [token, navigate]);

  useEffect(() => {
    if (languageStart) {
      setInitialState({
        messages: initMessages,
        entitlement: languageStart.entitlement,
        targetLanguage: languageStart.targetLanguage,
      });
      if (languageStart?.playback) {
        setPlaybackQueue(languageStart.playback);
      }
    }
  }, [languageStart, initMessages, setInitialState, setPlaybackQueue]);

  useEffect(() => {
    const stored = localStorage.getItem(voiceStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.voiceId && typeof parsed?.rate === 'number') {
        setVoiceSettings({
          voiceId: parsed.voiceId,
          rate: parsed.rate,
          pitch: typeof parsed.pitch === 'number' ? parsed.pitch : 1,
        });
      }
    } catch {
      localStorage.removeItem(voiceStorageKey);
    }
  }, [voiceStorageKey]);

  useEffect(() => {
    localStorage.setItem(voiceStorageKey, JSON.stringify(voiceSettings));
  }, [voiceSettings, voiceStorageKey]);

  useEffect(() => {
    const onScroll = () => {
      lastUserScrollRef.current = Date.now();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const clearInlineTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
 

  useEffect(() => {
    clearInlineTimer();
    if (!audioRef.current) return;
    if (!inlineCurrentItem?.audioUrl) {
      setInlinePlaying(false);
      return;
    }
    audioRef.current.src = inlineCurrentItem.audioUrl;
    audioRef.current.playbackRate = voiceSettings.rate;
    if (inlineAutoPlayNext || inlinePlaying) {
      const delay = inlineCurrentItem.kind === 'en' ? 300 : 220;
      timerRef.current = window.setTimeout(() => {
        playInlineCurrent();
        setInlineAutoPlayNext(false);
      }, delay);
    }
  }, [
    clearInlineTimer,
    inlineAutoPlayNext,
    inlineCurrentItem,
    inlinePlaying,
    playInlineCurrent,
    voiceSettings.rate,
  ]);

  useEffect(() => {
    setInlineIndex(0);
    setInlinePlaying(false);
    setInlineAutoPlayNext(false);
  }, [inlinePlayback?.items]);

  useEffect(() => {
    if (!inlinePlaying || !activeMessageKey || !inlineCurrentItem) {
      setActiveLineKey(null);
      setActiveLineIsTarget(false);
      return;
    }
    // Active-line logic lives here: map the narrated segment to a UI line.
    setActiveLineKey(`${activeMessageKey}-${inlineCurrentItem.segmentIdx}`);
    setActiveLineIsTarget(inlineCurrentItem.kind === 'tr');
  }, [activeMessageKey, inlineCurrentItem, inlinePlaying]);

  useEffect(() => {
    if (!activeLineKey) return;
    if (Date.now() - lastUserScrollRef.current < 1200) return;
    const node = lineRefs.current.get(activeLineKey);
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeLineKey]);

  const handleInlineEnded = useCallback(() => {
    // Play-loop logic lives here: advance automatically until paused.
    if (inlinePlayingRef.current && inlineIndex + 1 < inlineItems.length) {
      setInlineAutoPlayNext(true);
      setInlineIndex((idx) => idx + 1);
      return;
    }
    setInlinePlaying(false);
  }, [inlineIndex, inlineItems.length]);

  const handleInlinePlayPause = useCallback(
    async (messageKey: string, playback: PlaybackPayload | null | undefined) => {
      if (!playback?.items?.length) return;
      if (activeMessageKey !== messageKey) {
        setActiveMessageKey(messageKey);
        setInlinePlayback(playback);
        setInlineIndex(0);
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
        setPlaybackQueue(playback);
        return;
      }
      if (!audioRef.current) {
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
        return;
      }
      if (inlinePlaying) {
        audioRef.current.pause();
        setInlinePlaying(false);
      } else {
        if (inlineIndex >= inlineItems.length - 1) {
          setInlineIndex(0);
          setInlineAutoPlayNext(true);
          setInlinePlaying(true);
          return;
        }
        await playInlineCurrent();
      }
    },
    [activeMessageKey, inlineIndex, inlineItems.length, inlinePlaying, playInlineCurrent, setPlaybackQueue]
  );

  const handleInlineReplay = useCallback(
    (messageKey: string, playback: PlaybackPayload | null | undefined) => {
      if (!playback?.items?.length) return;
      if (activeMessageKey !== messageKey) {
        setActiveMessageKey(messageKey);
        setInlinePlayback(playback);
        setInlineIndex(0);
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
        setPlaybackQueue(playback);
        return;
      }
      const idx = inlineItems.findIndex(
        (item) => item.segmentIdx === inlineSegmentIdx && item.kind === 'en'
      );
      if (idx >= 0) {
        setInlineIndex(idx);
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
      }
    },
    [
      activeMessageKey,
      inlineItems,
      inlineSegmentIdx,
      setPlaybackQueue,
    ]
  );

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    await sendPrompt(input.trim());
    setInput('');
  }, [input, sendPrompt]);

  const handleComplete = useCallback(async () => {
    const q = await completeCourse();
    if (q) {
      setQuiz(q);
      setAnswers({});
      setGrade(null);
    }
  }, [completeCourse]);

  const handleGrade = useCallback(async () => {
    if (!quiz || !courseId) return;
    const payload = buildGradePayload(quiz, answers, { courseId });
    const g = await gradeQuizApi(backendUrl, token || '', payload);
    setGrade(g);
  }, [quiz, answers, courseId, backendUrl, token]);

  const allAnswered = useMemo(() => {
    if (!quiz?.questions?.length) return false;
    return quiz.questions.every((q: any) => answers[q.id] !== undefined);
  }, [quiz, answers]);

  const handleCertificate = useCallback(async () => {
    if (!courseId || !token) return;
    setDownloading(true);
    try {
      const cert = await generateCertificate(backendUrl, token, courseId);
      setCertId(cert?.id || null);
      if (cert?.id) {
        await downloadCertificateFile(backendUrl, token, cert.id);
      }
    } finally {
      setDownloading(false);
    }
  }, [backendUrl, token, courseId]);

  const handleTranscript = useCallback(async () => {
    if (!courseId || !token) return;
    setDownloading(true);
    try {
      const transcript = await generateTranscript(backendUrl, token, courseId);
      const id = transcript?.id || null;
      setTranscriptId(id);
      if (id) {
        await downloadTranscriptFile(backendUrl, token, id);
      }
    } finally {
      setDownloading(false);
    }
  }, [backendUrl, token, courseId]);

  const title = headerLabel ? `Language Learning: English → ${headerLabel}` : 'Language Learning';

  const progressPct = useMemo(() => {
    if (!promptsLimit) return 0;
    return Math.min(100, Math.round((promptsUsed / promptsLimit) * 100));
  }, [promptsLimit, promptsUsed]);

  const statusChip = useMemo(() => {
    if (bundleBlocked || (promptsLimit && promptsUsed >= promptsLimit)) {
      return { label: 'Prompt limit reached', tone: 'bg-rose-500/20 text-rose-200' };
    }
    return { label: 'Unlocked', tone: 'bg-emerald-500/20 text-emerald-200' };
  }, [bundleBlocked, promptsLimit, promptsUsed]);

  const filteredTopics = useMemo(() => {
    const term = topicFilter.trim().toLowerCase();
    if (!term) return TOPICS;
    return TOPICS.filter((topic) => topic.label.toLowerCase().includes(term));
  }, [topicFilter]);

  const applyPrompt = useCallback(
    (prompt: string) => {
      setInput(prompt.replace('{language}', headerLabel || targetLanguage));
    },
    [headerLabel, targetLanguage]
  );

  const handleTopicSelect = useCallback(
    (topic: (typeof TOPICS)[number]) => {
      setSelectedTopic(topic);
      applyPrompt(topic.prompts[0]);
    },
    [applyPrompt]
  );

  const handleSurprise = useCallback(() => {
    const random = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    setSelectedTopic(random);
    applyPrompt(random.prompts[0]);
  }, [applyPrompt]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 pb-28">
        <header className="mb-6">
          <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  Prompts used <span className="font-semibold">{promptsUsed}</span> / {promptsLimit}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusChip.tone}`}
              >
                {statusChip.label}
              </span>
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-2 rounded-full bg-emerald-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-5 space-y-4 shadow-sm">
              {messages.length === 0 && (
                <div className="text-sm text-slate-500">Start chatting to build your course.</div>
              )}
              {messages.map((msg, idx) => {
                const messageKey = `${msg.role}-${idx}`;
                const isAssistant = msg.role === 'assistant';
                const isActive = activeMessageKey === messageKey;
                return (
                  <div
                    key={messageKey}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm shadow-md transition-all ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white'
                          : 'bg-white/90 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-100/70 dark:border-slate-700/70'
                      } ${isActive ? 'ring-2 ring-emerald-300/60' : ''}`}
                    >
                      {isAssistant && msg.segments ? (
                        <div className="space-y-3">
                          {msg.segments.map((seg, segIdx) => {
                            const lineKey = `${messageKey}-${segIdx}`;
                            const isActiveLine = isActive && activeLineKey === lineKey;
                            return (
                              <div
                                key={`${seg.en}-${segIdx}`}
                                ref={(node) => {
                                  if (node) lineRefs.current.set(lineKey, node);
                                  else lineRefs.current.delete(lineKey);
                                }}
                                className={`rounded-2xl px-2 py-1 transition-all duration-300 ${
                                  isActiveLine ? 'bg-emerald-500/10' : ''
                                }`}
                              >
                                <div className="text-sm text-slate-800 dark:text-slate-100">
                                  {seg.en}
                                </div>
                                <div
                                  className={`mt-0.5 text-xs text-slate-500 dark:text-slate-400 transition-all duration-300 ${
                                    isActiveLine && activeLineIsTarget
                                      ? 'text-base sm:text-lg font-semibold text-slate-900 dark:text-white'
                                      : ''
                                  }`}
                                >
                                  {seg.tr}
                                </div>
                              </div>
                            );
                          })}
                          {msg.playback && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <button
                                  className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-200 transition hover:bg-emerald-500/20"
                                  onClick={() =>
                                    handleInlinePlayPause(messageKey, msg.playback as PlaybackPayload)
                                  }
                                >
                                  {isActive && inlinePlaying ? 'Pause' : 'Play'} narration
                                </button>
                                <button
                                  className="rounded-full bg-slate-100/70 dark:bg-slate-700/60 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200 transition hover:bg-slate-200/80"
                                  onClick={() =>
                                    handleInlineReplay(messageKey, msg.playback as PlaybackPayload)
                                  }
                                >
                                  Replay
                                </button>
                                {isActive && (
                                  <span className="text-[11px] text-slate-400">
                                    {inlineIndex + 1} / {inlineItems.length || 0}
                                  </span>
                                )}
                              </div>
                              {isActive && inlineSegment && (
                                <div className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs text-slate-600 dark:text-slate-200">
                                  <div className="font-semibold text-emerald-600 dark:text-emerald-200">
                                    Now playing
                                  </div>
                                  <div>{inlineSegment.en}</div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {inlineSegment.tr}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>{msg.content}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Tutor is typing…
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-5 shadow-sm">
              <button
                onClick={handleComplete}
                className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold transition hover:bg-emerald-500"
              >
                Course Complete
              </button>
            </div>

            {quiz && (
              <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-5 space-y-4 shadow-sm">
                <h2 className="text-lg font-semibold">Final Quiz</h2>
                {quiz.questions.map((q: any, idx: number) => (
                  <div key={q.id} className="space-y-2">
                    <div className="text-sm font-semibold">
                      {idx + 1}. {q.prompt}
                    </div>
                    <div className="space-y-2">
                      {q.choices.map((choice: string, cIdx: number) => (
                        <label
                          key={choice}
                          className={`flex items-center gap-2 text-sm cursor-pointer rounded-2xl border px-3 py-2 transition-colors ${
                            answers[q.id] === cIdx
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-slate-200/70 dark:border-slate-700/70 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            checked={answers[q.id] === cIdx}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: cIdx }))}
                          />
                          {choice}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleGrade}
                  disabled={!allAnswered}
                  className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Submit Quiz
                </button>

                {grade && (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Score: <span className="font-semibold">{grade.scorePct}%</span>
                  </div>
                )}

                {grade?.scorePct >= 70 && (
                  <div className="space-y-2">
                    <button
                      onClick={handleCertificate}
                      disabled={downloading}
                      className="w-full rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      {downloading ? 'Preparing…' : certId ? 'Download Certificate' : 'Generate Certificate'}
                    </button>
                    <button
                      onClick={handleTranscript}
                      disabled={downloading}
                      className="w-full rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      {downloading ? 'Preparing…' : transcriptId ? 'Download Transcript' : 'Generate Transcript'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3 shadow-sm">
              <ClassroomPlayer
                mode="language"
                playback={playbackQueue || undefined}
                title={title}
                rate={voiceSettings.rate}
                pitch={voiceSettings.pitch}
                voiceId={voiceSettings.voiceId}
              />
            </div>
          </aside>
        </div>
      </div>

      <div className="sticky bottom-0 z-30 border-t border-slate-200/70 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
          {selectedTopic && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Suggested: <span className="font-semibold text-emerald-500">{selectedTopic.label}</span>
              <button
                className="ml-2 text-emerald-600 dark:text-emerald-300 hover:underline"
                onClick={() => applyPrompt(selectedTopic.prompts[0])}
              >
                Use prompt
              </button>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200 transition hover:border-emerald-300"
                onClick={() => {
                  setShowTopicPanel((prev) => !prev);
                  setShowVoicePanel(false);
                }}
              >
                ✨ Topics
              </button>
              <button
                className="rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200 transition hover:border-blue-300"
                onClick={() => {
                  setShowVoicePanel((prev) => !prev);
                  setShowTopicPanel(false);
                }}
              >
                🎙 Voice
              </button>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={bundleBlocked ? 'Unlock more prompts to continue.' : 'Ask your tutor...'}
                disabled={bundleBlocked || loading}
                className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <button
                onClick={handleSend}
                disabled={bundleBlocked || loading || !input.trim()}
                className="rounded-2xl bg-emerald-500 text-white px-5 py-3 text-sm font-semibold shadow-sm transition hover:bg-emerald-400 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>

          {bundleBlocked && (
            <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200/70 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-200">
                <span className="text-lg">🔒</span>
                <span className="font-semibold">You’ve used your 5 free prompts.</span>
              </div>
              <button
                onClick={purchaseBundle}
                className="w-full rounded-2xl bg-emerald-500 text-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-emerald-400"
              >
                Unlock 300 prompts (20 tokens)
              </button>
            </div>
          )}

          {error && <div className="text-xs text-rose-500">{error}</div>}

          {showTopicPanel && (
            <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 shadow-xl space-y-4 ll-panel-animate">
              <div className="flex items-center gap-2">
                <input
                  value={topicFilter}
                  onChange={(e) => setTopicFilter(e.target.value)}
                  placeholder="Search topics"
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                />
                <button
                  className="rounded-full bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600"
                  onClick={handleSurprise}
                >
                  Surprise me
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredTopics.map((topic) => (
                  <button
                    key={topic.id}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      selectedTopic?.id === topic.id
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200/70'
                    }`}
                    onClick={() => handleTopicSelect(topic)}
                  >
                    {topic.label}
                  </button>
                ))}
              </div>
              {selectedTopic && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Suggested prompts
                  </div>
                  <div className="space-y-2">
                    {selectedTopic.prompts.map((prompt) => (
                      <button
                        key={prompt}
                        className="w-full rounded-2xl border border-slate-200/70 dark:border-slate-700/70 px-3 py-2 text-left text-xs text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        onClick={() => applyPrompt(prompt)}
                      >
                        {prompt.replace('{language}', headerLabel || targetLanguage)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {showVoicePanel && (
            <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 shadow-xl space-y-4 ll-panel-animate">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Voice style
                </label>
                <select
                  value={voiceSettings.voiceId}
                  onChange={(e) =>
                    setVoiceSettings((prev) => ({ ...prev, voiceId: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-500/40"
                >
                  {VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Speed ({voiceSettings.rate.toFixed(2)}x)
                </label>
                <input
                  type="range"
                  min={0.6}
                  max={1.2}
                  step={0.05}
                  value={voiceSettings.rate}
                  onChange={(e) =>
                    setVoiceSettings((prev) => ({ ...prev, rate: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Pitch ({voiceSettings.pitch.toFixed(2)}x)
                </label>
                <input
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={voiceSettings.pitch}
                  onChange={(e) =>
                    setVoiceSettings((prev) => ({ ...prev, pitch: Number(e.target.value) }))
                  }
                  className="w-full"
                />
                <p className="text-[11px] text-slate-400">
                  Pitch may vary by device. Voice controls affect playback; regeneration coming soon.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <button
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  onClick={() => setVoiceSettings(DEFAULT_VOICE)}
                >
                  Reset
                </button>
                <div className="text-xs text-slate-400">Saved for {headerLabel || targetLanguage}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <audio ref={audioRef} onEnded={handleInlineEnded} />
    </div>
  );
};

export default LanguageLearningPage;

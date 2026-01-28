import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ClassroomPlayer from '@/components/ClassroomPlayer.web';
import { useShopContext } from '@mytutorapp/shared/context';
import { useLanguageLearning, useOrg } from '@mytutorapp/shared/hooks';
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
import SeoHead from '../components/seo/SeoHead';

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

const FONT_SIZE_KEY = 'll_font_size_v1';
const MUTE_EN_KEY = 'll_mute_en_v1';
const MUTE_TR_KEY = 'll_mute_tr_v1';



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

  const { activeOrgId } = useOrg();

  const {
    messages,
    headerLabel,
    playbackQueue,
    promptsUsed,
    promptsLimit,
    resetAt,
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
    orgId: activeOrgId ?? null,
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
  const [fontSize, setFontSize] = useState(16);
  const [muteEn, setMuteEn] = useState(false);
  const [muteTr, setMuteTr] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

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
  const inlineIndexRef = useRef(0);
  const inlineItemsRef = useRef<PlaybackQueueItem[]>([]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  type RepeatPanelState = {
  messageKey: string;
  msg: any;
  idx: number;
};

const getMsgId = (msg: any) => msg?.id ?? msg?.messageId ?? null;
const cacheKeyFor = (messageKey: string, voiceId: string) => `${messageKey}::${voiceId}`;

const [playbackByKey, setPlaybackByKey] = useState<Record<string, PlaybackPayload>>({});
const [playbackLoadingKey, setPlaybackLoadingKey] = useState<string | null>(null);
const [repeatPanel, setRepeatPanel] = useState<RepeatPanelState | null>(null);

// Track which message is “active” so switching voice can refetch playback correctly
const activeMsgMetaRef = useRef<{ messageKey: string; idx: number; msg: any } | null>(null);

// Avoid dependency loops: store current playing item in a ref
const inlineCurrentRef = useRef<PlaybackQueueItem | null>(null);


  const inlineItems = inlinePlayback?.items || [];
  const inlineSegments = useMemo(() => buildSegmentsFromQueue(inlineItems), [inlineItems]);
  const inlineCurrentItem = inlineItems[inlineIndex];
  const inlineSegmentIdx = inlineCurrentItem?.segmentIdx ?? 0;
  const inlineSegment = inlineSegments.find((seg) => seg.segmentIdx === inlineSegmentIdx);

  useEffect(() => {
    inlinePlayingRef.current = inlinePlaying;
  }, [inlinePlaying]);

  useEffect(() => {
    inlineIndexRef.current = inlineIndex;
  }, [inlineIndex]);

  useEffect(() => {
    inlineItemsRef.current = inlineItems;
  }, [inlineItems]);

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
  inlineCurrentRef.current = inlineCurrentItem || null;
}, [inlineCurrentItem]);


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
  if (!repeatPanel) return;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setRepeatPanel(null);
  };

  window.addEventListener('keydown', onKeyDown);

  // Optional: lock background scroll while sheet open
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    document.body.style.overflow = prevOverflow;
  };
}, [repeatPanel]);


  useEffect(() => {
    localStorage.setItem(voiceStorageKey, JSON.stringify(voiceSettings));
  }, [voiceSettings, voiceStorageKey]);

  useEffect(() => {
    const storedFont = localStorage.getItem(FONT_SIZE_KEY);
    const storedMuteEn = localStorage.getItem(MUTE_EN_KEY);
    const storedMuteTr = localStorage.getItem(MUTE_TR_KEY);
    const parsedFont = Number(storedFont);
    if (!Number.isNaN(parsedFont)) {
      setFontSize(Math.min(22, Math.max(12, parsedFont)));
    }
    if (storedMuteEn != null) setMuteEn(storedMuteEn === 'true');
    if (storedMuteTr != null) setMuteTr(storedMuteTr === 'true');
  }, []);

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem(MUTE_EN_KEY, String(muteEn));
  }, [muteEn]);

  useEffect(() => {
    localStorage.setItem(MUTE_TR_KEY, String(muteTr));
  }, [muteTr]);

  useEffect(() => {
    if (!resetAt) return;
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resetAt]);

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

  const isItemMuted = useCallback(
    (item?: PlaybackQueueItem | null) => {
      if (!item) return false;
      if (item.kind === 'en') return muteEn;
      if (item.kind === 'tr') return muteTr;
      return false;
    },
    [muteEn, muteTr]
  );

  const findNextPlayableIndex = useCallback(
    (startIdx: number, items?: PlaybackQueueItem[]) => {
      const list = items ?? inlineItemsRef.current;
      for (let i = startIdx; i < list.length; i += 1) {
        const item = list[i];
        if (!isItemMuted(item)) return i;
      }
      return null;
    },
    [isItemMuted]
  );
 

 useEffect(() => {
  clearInlineTimer();
  const audio = audioRef.current;
  if (!audio) return;

  const url = inlineCurrentItem?.audioUrl;
  if (!url) {
    setInlinePlaying(false);
    return;
  }

  if (isItemMuted(inlineCurrentItem)) {
    const nextIdx = findNextPlayableIndex(inlineIndex + 1, inlineItems);
    if (nextIdx === null) {
      setInlinePlaying(false);
      setInlineAutoPlayNext(false);
    } else {
      setInlineAutoPlayNext(true);
      setInlineIndex(nextIdx);
      setInlinePlaying(true);
    }
    return;
  }

  // Only swap src if different (prevents restart glitches)
  if (audio.src !== url) {
    audio.pause();
    audio.currentTime = 0;
    audio.src = url;
  }

  audio.playbackRate = voiceSettings.rate;

  // ✅ Only autoplay when explicitly requested (first play / replay / next index set)
  if (inlineAutoPlayNext) {
    void playInlineCurrent();
    setInlineAutoPlayNext(false);
  }
}, [
  clearInlineTimer,
  inlineAutoPlayNext,
  inlineCurrentItem?.audioUrl,
  inlineCurrentItem,
  inlineIndex,
  inlineItems,
  findNextPlayableIndex,
  isItemMuted,
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
  // ✅ If user paused, don't continue
  if (!inlinePlayingRef.current) {
    setInlinePlaying(false);
    return;
  }

  const nextIndex = inlineIndex + 1;

  // ✅ Reached the end
  if (nextIndex >= inlineItems.length) {
    setInlinePlaying(false);
    return;
  }

  const nextPlayable = findNextPlayableIndex(nextIndex, inlineItems);
  if (nextPlayable === null) {
    setInlinePlaying(false);
    return;
  }

  const nextItem = inlineItems[nextPlayable];

  // Update UI progress immediately
  setInlineIndex(nextPlayable);

  const audio = audioRef.current;
  if (!audio || !nextItem?.audioUrl) {
    // Fallback: let the effect try
    setInlineAutoPlayNext(true);
    return;
  }

  // ✅ KEY: play next segment *inside onEnded* (browser-friendly autoplay chain)
  audio.pause();
  audio.currentTime = 0;
  audio.src = nextItem.audioUrl;
  audio.playbackRate = voiceSettings.rate;

  const p = audio.play();
  if (p && typeof (p as any).catch === 'function') {
    (p as Promise<void>).catch(() => setInlinePlaying(false));
  }

  setInlinePlaying(true);
}, [findNextPlayableIndex, inlineIndex, inlineItems, voiceSettings.rate]);


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
        const playableIdx = isItemMuted(inlineItems[idx])
          ? findNextPlayableIndex(idx, inlineItems)
          : idx;
        if (playableIdx === null) {
          setInlinePlaying(false);
          return;
        }
        setInlineIndex(playableIdx);
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
      }
    },
    [
      activeMessageKey,
      findNextPlayableIndex,
      inlineItems,
      inlineSegmentIdx,
      isItemMuted,
      setPlaybackQueue,
    ]
  );

const fetchPlaybackForMessage = useCallback(
  async (msg: any, idx: number) => {
    const base = backendUrl.replace(/\/$/, '');
    const url = `${base}/api/ai/courses/language/playback`;

    const messageId = getMsgId(msg);
    const payload: any = {
      courseId,
      voiceId: voiceSettings.voiceId,
    };

    // Only send one valid locator (prefer id, fallback to index)
    if (messageId !== null && messageId !== undefined && messageId !== '') {
      payload.messageId = messageId;
    } else {
      payload.messageIndex = idx;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 404) {
      console.error('[LL playback] 404 endpoint not found', { url });
      throw new Error(`PLAYBACK_ENDPOINT_404: ${url}`);
    }

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      console.error('[LL playback] request failed', {
        status: res.status,
        url,
        payload,
        response: json,
      });
      throw new Error(json?.error || json?.message || 'PLAYBACK_FETCH_FAILED');
    }

    return json as PlaybackPayload;
  },
  [backendUrl, token, courseId, voiceSettings.voiceId]
);




const ensurePlaybackFor = useCallback(
  async (messageKey: string, msg: any, idx: number) => {
    const ck = cacheKeyFor(messageKey, voiceSettings.voiceId);

   const perVoice = playbackByKey[ck];
if (perVoice?.items?.length) return perVoice;

// only use embedded playback when it matches the current voice (or as last fallback)
const embedded = msg?.playback as PlaybackPayload | undefined;
if (embedded?.items?.length) return embedded;

    setPlaybackLoadingKey(ck);
    try {
      const pb = await fetchPlaybackForMessage(msg, idx);
      if (pb?.items?.length) {
        setPlaybackByKey((prev) => ({ ...prev, [ck]: pb }));
        return pb;
      }
      return null;
    } catch (e: any) {
      console.error(e);
      // show something meaningful
      // You can also surface server details if present (see next section)
      return null;
    } finally {
      setPlaybackLoadingKey((cur) => (cur === ck ? null : cur));
    }
  },
  [voiceSettings.voiceId, playbackByKey, fetchPlaybackForMessage]
);

const startPlaybackAt = useCallback(
  async (
    messageKey: string,
    msg: any,
    idx: number,
    segmentIdx: number,
    kind: 'en' | 'tr'
  ) => {
    const pb = await ensurePlaybackFor(messageKey, msg, idx);
    if (!pb?.items?.length) return;

    activeMsgMetaRef.current = { messageKey, idx, msg };

    const startIdx = pb.items.findIndex(
      (it) => it.segmentIdx === segmentIdx && it.kind === kind
    );
    const desiredIdx = startIdx >= 0 ? startIdx : 0;
    if (isItemMuted(pb.items[desiredIdx])) {
      setInlinePlaying(false);
      return;
    }

    setActiveMessageKey(messageKey);
    setInlinePlayback(pb);
    setPlaybackQueue(pb);
    setInlineIndex(desiredIdx);
    setInlineAutoPlayNext(true);
    setInlinePlaying(true);
  },
  [ensurePlaybackFor, isItemMuted, setPlaybackQueue]
);
 
const promptLocked =
    bundleBlocked || (typeof promptsLimit === 'number' && promptsUsed >= promptsLimit);



  const handleSend = useCallback(async () => {
    if (!input.trim() || promptLocked || loading) return;
    await sendPrompt(input.trim());
    setInput('');
  }, [input, loading, promptLocked, sendPrompt]);

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
 

  const formatCountdown = useCallback((ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, []);

  const resetLabel = useMemo(() => {
    if (!resetAt) return null;
    const ts = new Date(resetAt).getTime();
    if (Number.isNaN(ts)) return null;
    const remaining = ts - nowTs;
    if (remaining <= 0) {
      return `Resets at ${new Date(ts).toLocaleString()}`;
    }
    return `Resets in ${formatCountdown(remaining)}`;
  }, [resetAt, nowTs, formatCountdown]);

  const baseFontSize = Math.min(22, Math.max(12, fontSize));
  const targetFontSize = Math.max(12, baseFontSize - 2);
  const targetActiveFontSize = Math.min(26, baseFontSize + 2);

  const progressPct = useMemo(() => {
    if (!promptsLimit) return 0;
    return Math.min(100, Math.round((promptsUsed / promptsLimit) * 100));
  }, [promptsLimit, promptsUsed]);

  const statusChip = useMemo(() => {
    if (promptLocked) {
      return {
        label: 'Prompt limit reached',
        tone:
          'bg-rose-50 text-rose-700 border border-rose-200 ' +
          'dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/30',
      };
    }
    return {
      label: 'Unlocked',
      tone:
        'bg-emerald-50 text-emerald-700 border border-emerald-200 ' +
        'dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/30',
    };
  }, [promptLocked]);

  const filteredTopics = useMemo(() => {
    const term = topicFilter.trim().toLowerCase();
    if (!term) return TOPICS;
    return TOPICS.filter((topic) => topic.label.toLowerCase().includes(term));
  }, [topicFilter]);

  const applyPrompt = useCallback(
    (prompt: string) => {
      setInput(prompt.replace('{language}', headerLabel || targetLanguage));
      setShowTopicPanel(false);
      setShowVoicePanel(false);
      requestAnimationFrame(() => composerRef.current?.focus());
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

  useEffect(() => {
  if (languageStart?.playback) {
    const mk = `assistant-${initMessages.length - 1}`; // or whichever message it belongs to
    const ck = cacheKeyFor(mk, DEFAULT_VOICE.voiceId);
    setPlaybackByKey((p) => ({ ...p, [ck]: languageStart.playback }));
  }
}, [languageStart, initMessages.length]);



  useEffect(() => {
  const prev = prevVoiceIdRef.current;
  if (prev === voiceSettings.voiceId) return;
  prevVoiceIdRef.current = voiceSettings.voiceId;

  const meta = activeMsgMetaRef.current;
  if (!meta) return;

  (async () => {
    try {
      const pb = await ensurePlaybackFor(meta.messageKey, meta.msg, meta.idx);
      if (!pb?.items?.length) return;

      const cur = inlineCurrentRef.current;
      const wantedIdx = cur
        ? pb.items.findIndex((it) => it.segmentIdx === cur.segmentIdx && it.kind === cur.kind)
        : 0;

      setInlinePlayback(pb);
      setPlaybackQueue(pb);
      setInlineIndex(wantedIdx >= 0 ? wantedIdx : 0);

      // If user was listening, restart current line in the new voice
      if (inlinePlayingRef.current) {
        setInlineAutoPlayNext(true);
        setInlinePlaying(true);
      }
    } catch {
      // ignore
    }
  })();
}, [voiceSettings.voiceId, ensurePlaybackFor, setPlaybackQueue]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <SeoHead
        title={`${title} | DayBreak`}
        description="Practice language learning with guided prompts and feedback."
        canonicalPath={location.pathname}
        noindex
      />
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
                        <div className="space-y-2">
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
                                className={`rounded-2xl px-2 py-1 break-words transition-all duration-300 ${
                                  isActiveLine ? 'bg-emerald-500/10' : ''
                                }`}
                              >
                                <div
                                  className="text-slate-800 dark:text-slate-100"
                                  style={{ fontSize: baseFontSize }}
                                >
                                  {seg.en}
                                </div>
                                <div
                                  className={`mt-0.5 text-slate-500 dark:text-slate-400 transition-all duration-300 ${
                                    isActiveLine && activeLineIsTarget
                                      ? 'font-semibold text-slate-900 dark:text-white'
                                      : ''
                                  }`}
                                  style={{
                                    fontSize: isActiveLine && activeLineIsTarget
                                      ? targetActiveFontSize
                                      : targetFontSize,
                                  }}
                                >
                                  {seg.tr}
                                </div>
                              </div>
                            );
                          })}
<div className="space-y-2">
  {(() => {
    const ck = cacheKeyFor(messageKey, voiceSettings.voiceId);
    const pb = (msg.playback as PlaybackPayload) || playbackByKey[ck] || null;
    const hasPb = !!pb?.items?.length;
    const isPbLoading = playbackLoadingKey === ck;

    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
         <button
  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
    hasPb
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-200 hover:bg-emerald-500/20'
      : 'bg-slate-100/70 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80'
  }`}
  onClick={async () => {
    try {
      const ensured = await ensurePlaybackFor(messageKey, msg, idx);
      if (!ensured) return;

      activeMsgMetaRef.current = { messageKey, idx, msg };
      await handleInlinePlayPause(messageKey, ensured);
    } catch (e) {
      console.error(e);
    }
  }}
>
  {isPbLoading
    ? 'Loading…'
    : hasPb
      ? isActive && inlinePlaying
        ? 'Pause'
        : 'Play'
      : 'Load narration'}
</button>

          <button
            className={`rounded-full bg-slate-100/70 dark:bg-slate-700/60 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200 transition hover:bg-slate-200/80 ${
              !hasPb || isPbLoading ? 'opacity-50 pointer-events-none' : ''
            }`}
            onClick={async () => {
              const ensured = await ensurePlaybackFor(messageKey, msg, idx);
              if (!ensured) return;

              activeMsgMetaRef.current = { messageKey, idx, msg };
              handleInlineReplay(messageKey, ensured);
            }}
          >
            Replay
          </button>

          <button
            className="rounded-full bg-slate-100/70 dark:bg-slate-700/60 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200 transition hover:bg-slate-200/80"
            onClick={() => setRepeatPanel({ messageKey, msg, idx })}
          >
            Repeat section
          </button>

          {isActive && (
            <span className="text-[11px] text-slate-400">
              {inlineIndex + 1} / {inlineItems.length || 0}
            </span>
          )}
        </div>

        {isActive && inlineSegment && (
          <div className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs text-slate-600 dark:text-slate-200">
            <div className="font-semibold text-emerald-600 dark:text-emerald-200">Now playing</div>
            <div>{inlineSegment.en}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {inlineSegment.tr}
            </div>
          </div>
        )}
      </>
    );
  })()}
</div>

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
              <textarea
                ref={composerRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!promptLocked && !loading && input.trim()) {
                      void handleSend();
                    }
                  }
                }}
                placeholder={promptLocked ? 'Unlock more prompts to continue.' : 'Ask your tutor...'}
                disabled={promptLocked || loading}
                rows={1}
                className="flex-1 resize-none rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <button
                onClick={handleSend}
                disabled={promptLocked || loading || !input.trim()}
                className="rounded-2xl bg-emerald-500 text-white px-5 py-3 text-sm font-semibold shadow-sm transition hover:bg-emerald-400 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>

          {promptLocked && (
            <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200/70 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-200">
                <span className="text-lg">🔒</span>
                <span className="font-semibold">You’ve hit your free prompt limit.</span>
              </div>
              {resetLabel && <div className="text-xs text-emerald-700 dark:text-emerald-200">{resetLabel}</div>}
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
                  className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-200/70 dark:hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-500/40"
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
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Text size ({baseFontSize}px)
                </label>
                <input
                  type="range"
                  min={12}
                  max={22}
                  step={1}
                  value={baseFontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Mute voices
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      muteEn
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200'
                    }`}
                    onClick={() => setMuteEn((prev) => !prev)}
                  >
                    Mute English voice
                  </button>
                  <button
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      muteTr
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200'
                    }`}
                    onClick={() => setMuteTr((prev) => !prev)}
                  >
                    Mute Target voice
                  </button>
                </div>
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
      {repeatPanel && (
  <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
    {/* Backdrop */}
    <button
      aria-label="Close repeat section"
      className="absolute inset-0 bg-black/40"
      onClick={() => setRepeatPanel(null)}
    />

    {/* Sheet */}
    <div className="relative w-full sm:max-w-xl max-h-[78vh] overflow-hidden rounded-t-3xl sm:rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-2xl ll-panel-animate">
      <div className="p-4 border-b border-slate-200/70 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Repeat a section
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {headerLabel || targetLanguage}
            </div>
          </div>

          <button
            className="rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setRepeatPanel(null)}
          >
            Close
          </button>
        </div>
      </div>

      <div className="p-4 overflow-y-auto max-h-[62vh] space-y-2">
        {(repeatPanel.msg?.segments?.length ? repeatPanel.msg.segments : []).map(
          (seg: any, segIdx: number) => (
            <div
              key={`${seg.en}-${segIdx}`}
              className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/60 p-3"
            >
              <button
                className="w-full flex items-center justify-between gap-3 text-left"
                onClick={() => {
                  const panel = repeatPanel;
                  setRepeatPanel(null);
                  startPlaybackAt(panel.messageKey, panel.msg, panel.idx, segIdx, 'en');
                }}
              >
                <div className="text-xs sm:text-sm text-slate-900 dark:text-slate-100 flex-1">
                  {seg.en}
                </div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-300 whitespace-nowrap">
                  Play EN
                </div>
              </button>

              <button
                className="mt-2 w-full flex items-center justify-between gap-3 text-left"
                onClick={() => {
                  const panel = repeatPanel;
                  setRepeatPanel(null);
                  startPlaybackAt(panel.messageKey, panel.msg, panel.idx, segIdx, 'tr');
                }}
              >
                <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex-1">
                  {seg.tr}
                </div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-300 whitespace-nowrap">
                  Play TR
                </div>
              </button>
            </div>
          )
        )}

        {!repeatPanel.msg?.segments?.length && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            No segments available for this message.
          </div>
        )}

        <div className="pt-2 text-[11px] text-slate-400">
          Tip: Tap any line to replay from exactly there.
        </div>
      </div>
    </div>
  </div>
)}


     <audio ref={audioRef} onEnded={handleInlineEnded} preload="auto" />

    </div>
  );
};

export default LanguageLearningPage;

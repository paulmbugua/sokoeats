// apps/mobile/src/screens/CourseProgress.native.tsx
/* eslint-disable prettier/prettier */
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import debounce from 'lodash.debounce';
import {
  useNavigation,
  useRoute,
  type RouteProp,
  type NavigationProp,
} from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';

import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses, useOerMeta } from '@mytutorapp/shared/hooks';
import { useCourseProgress } from '@mytutorapp/shared/hooks/useCourseProgress';
import { useCourseReviews } from '@mytutorapp/shared/hooks/useCourseReviews';
import { downloadCertificateFile, downloadTranscriptFile } from '@mytutorapp/shared/api';
import { useWatchProgress } from '@mytutorapp/shared/hooks/useWatchProgress';
import { useReadProgress } from '@mytutorapp/shared/hooks/useReadProgress';

import type {
  Course as CourseType,
  CourseProgress as CourseProgressItem,
  UpdateProgressPayload,
  SyllabusItem,
} from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';

type Status = 'Not Started' | 'In Progress' | 'Completed';

/* ───────── Helpers ───────── */

const slug = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document';

const extractCertId = (doc: any): string | null => {
  if (!doc) return null;
  const direct = doc?.certId || doc?.certificateId || doc?.id;
  if (typeof direct === 'string' && direct) return direct;
  const u = String(doc?.download_url || doc?.downloadUrl || doc?.url || '');
  const m =
    u.match(/\/certificates\/([^/]+)\/(?:download|view|raw)?/i) ||
    u.match(/[?&]certId=([^&]+)/i);
  return m?.[1] ?? null;
};

const extractTranscriptId = (doc: any): string | null => {
  if (!doc) return null;
  const direct = doc?.transcriptId || doc?.id;
  if (typeof direct === 'string' && direct) return direct;
  const u = String(doc?.download_url || doc?.url || '');
  const m = u.match(/\/transcripts\/([^/]+)\/(?:download|view|raw)?/i);
  return m?.[1] ?? null;
};

// normalize videos for a week (supports string or array)
const getWeekVideos = (w?: any): { provider: 'youtube'; url: string }[] => {
  const urls: string[] = [];
  if (Array.isArray(w?.videoUrls))
    urls.push(...(w.videoUrls as string[]).filter(Boolean));
  if (typeof w?.videoUrl === 'string' && w.videoUrl)
    urls.push(w.videoUrl as string);
  return urls.map((u) => ({ provider: 'youtube', url: u }));
};

const getYoutubeId = (input = ''): string => {
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/'))
        return u.pathname.split('/').pop() || '';
      return u.searchParams.get('v') || '';
    }
  } catch {}
  return input;
};

/* ───────── Types ───────── */

type CourseProgressRoute = RouteProp<MainStackParamList, 'CourseProgress'>;

type WatchPayload = {
  watchedSeconds: number;
  durationSeconds: number;
  videoId: string;
};

/* ───────── Tiny internal components ───────── */

const ChipButton: React.FC<{
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  disabled?: boolean;
}> = ({ label, onPress, variant = 'primary', disabled }) => {
  const base = 'h-9 px-3 rounded-xl justify-center items-center';
  let style = 'bg-[#3d99f5]';
  let text = 'text-white';
  if (variant === 'outline') {
    style = 'bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-slate-700';
    text = 'text-slate-900 dark:text-white';
  }
  if (variant === 'ghost') {
    style = 'bg-[#e7edf4] dark:bg-[#172534]';
    text = 'text-slate-900 dark:text-white';
  }
  if (disabled) {
    style += ' opacity-60';
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={tw.style(base, style)}
    >
      <Text style={tw.style('text-xs font-semibold', text)}>{label}</Text>
    </Pressable>
  );
};

const StarRow: React.FC<{
  rating: number;
  setRating: (n: number) => void;
}> = ({ rating, setRating }) => (
  <View style={tw`flex-row items-center mb-3`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Pressable
        key={n}
        onPress={() => setRating(n)}
        style={tw`mr-1`}
        accessibilityLabel={`${n} star`}
      >
        <Text
          style={tw.style(
            'text-2xl',
            n <= rating ? 'text-yellow-400' : 'text-[#49739c]',
          )}
        >
          ★
        </Text>
      </Pressable>
    ))}
  </View>
);

/**
 * Simple watch dialog:
 * - Opens the YouTube link in browser
 * - Lets user manually mark as watched (sends event)
 */
const WatchDialog: React.FC<{
  open: boolean;
  title?: string;
  url: string;
  week: number;
  onClose: () => void;
  onWatched: (payload: WatchPayload) => void;
}> = ({ open, title, url, week, onClose, onWatched }) => {
  if (!open) return null;
  const videoId = getYoutubeId(url);

  const handleMarkWatched = () => {
    // We don’t know exact duration, but backend only cares that completed=true
    onWatched({
      watchedSeconds: 1,
      durationSeconds: 1,
      videoId,
    });
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={tw`flex-1 bg-black/50 items-center justify-center px-4`}
      >
        <View
          style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-4 border border-[#cedbe8] dark:border-slate-700`}
        >
          <Text
            style={tw`text-base font-bold text-slate-900 dark:text-white mb-1`}
          >
            Watch video
          </Text>
          <Text
            style={tw`text-xs text-slate-600 dark:text-slate-300 mb-3`}
          >
            Week {week} • {title || 'Course video'}
          </Text>

          <Text
            style={tw`text-xs text-slate-700 dark:text-slate-200 mb-4`}
          >
            We’ll open the video in your browser or YouTube app. When
            you’re done, tap <Text style={tw`font-semibold`}>“Mark as watched”</Text>{' '}
            so we can update your progress.
          </Text>

          <View style={tw`flex-row flex-wrap gap-2 mt-1`}>
            <ChipButton
              label="Open video"
              variant="primary"
              onPress={() => {
                if (!url) return;
                Linking.openURL(url).catch((e) => {
                  console.error('[WatchDialog] openURL failed', e);
                  Alert.alert(
                    'Could not open link',
                    'Please try again or copy the URL.',
                  );
                });
              }}
            />
            <ChipButton
              label="Mark as watched"
              variant="ghost"
              onPress={handleMarkWatched}
            />
            <ChipButton
              label="Close"
              variant="outline"
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* ───────── Very simple reading panel ───────── */
/* (The real read-tracking is handled by useReadProgress + other viewers) */
const CourseReadingPanelInline: React.FC<{
  week: number;
  item: SyllabusItem;
  status: Status;
  onSetStatus: (s: Status) => void;
}> = ({ week, item, status, onSetStatus }) => {
  const hasAssignment = !!(item.assignment || '').trim();
  const hasNotes = !!(item as any).notesUrl || Array.isArray((item as any).notesUrls);

  return (
    <View
      style={tw`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1821] p-4 mb-3`}
    >
      <Text
        style={tw`text-sm font-semibold text-slate-900 dark:text-white`}
      >
        Week {week}: {item.topic || 'TBA'}
      </Text>
      {hasAssignment && (
        <Text
          style={tw`mt-2 text-xs text-slate-700 dark:text-slate-300`}
        >
          {item.assignment}
        </Text>
      )}
      {hasNotes && (
        <Text
          style={tw`mt-2 text-xs text-slate-600 dark:text-slate-400`}
        >
          This week has reading/notes attached. Make sure you go through
          them to complete this week.
        </Text>
      )}

      <View style={tw`flex-row flex-wrap gap-2 mt-3`}>
        <ChipButton
          label="Not Started"
          variant={status === 'Not Started' ? 'primary' : 'outline'}
          onPress={() => onSetStatus('Not Started')}
        />
        <ChipButton
          label="In Progress"
          variant={status === 'In Progress' ? 'primary' : 'outline'}
          onPress={() => onSetStatus('In Progress')}
        />
        <ChipButton
          label="Completed"
          variant={status === 'Completed' ? 'primary' : 'outline'}
          onPress={() => onSetStatus('Completed')}
        />
      </View>
    </View>
  );
};

/* ───────── Main Screen ───────── */

const CourseProgressScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<CourseProgressRoute>();
  const rawCourseId = route.params?.courseId;
  const courseId = rawCourseId ?? '';

  const insets = useSafeAreaInsets();
  const FOOTER_OFFSET = 80; // for global footer
  const bottomPad = Math.max(insets.bottom, 16);
  const topPad = Math.max(insets.top, 12);

  const { backendUrl, token, profile } = useShopContext() as any;
  const myId = String(profile?.id ?? '');

  /* ───────── Load course ───────── */

  const {
    selectedCourse,
    loading: coursesLoading,
    error: coursesError,
    fetchCourseById,
  } = useCourses({ backendUrl, token });

  useEffect(() => {
    if (courseId) {
      void fetchCourseById(courseId);
    }
  }, [courseId, fetchCourseById]);

  /* ───────── Progress ───────── */

  const {
    progress = [],
    loading: progressLoading,
    update,
  } = useCourseProgress(backendUrl, courseId, token);

  const syllabus: SyllabusItem[] =
    (selectedCourse as CourseType | null | undefined)?.syllabus ?? [];

  const isLoading = coursesLoading || progressLoading;

  /* ───────── Reviews ───────── */

  const {
    hasMyReview,
    submit,
    posting,
  } = useCourseReviews(backendUrl, courseId, {
    myStudentId: myId,
    token: token ?? '',
  });

  const [openReview, setOpenReview] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const onSubmitReview = useCallback(async () => {
    if (rating < 1) return;
    await submit(rating, comment);
    setOpenReview(false);
    setRating(0);
    setComment('');
  }, [submit, rating, comment]);

  const promptReview = useCallback(() => {
    if (!hasMyReview) setOpenReview(true);
  }, [hasMyReview]);

  const debouncedPrompt = useMemo(
    () => debounce(promptReview, 200),
    [promptReview],
  );

  useEffect(
    () => () => {
      debouncedPrompt.cancel();
    },
    [debouncedPrompt],
  );

  /* ───────── Progress by week ───────── */

  const progressByWeek = useMemo(() => {
    const map = new Map<number, Status>();
    (progress as CourseProgressItem[]).forEach((p) =>
      map.set(p.week, p.status as Status),
    );
    return map;
  }, [progress]);

  const counts = useMemo(() => {
    let notStarted = 0;
    let inProgress = 0;
    let completed = 0;
    syllabus.forEach((s) => {
      const st = (progressByWeek.get(s.week) ?? 'Not Started') as Status;
      if (st === 'Completed') completed++;
      else if (st === 'In Progress') inProgress++;
      else notStarted++;
    });
    const total = syllabus.length || 0;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    return { notStarted, inProgress, completed, total, pct };
  }, [syllabus, progressByWeek]);

  const suggestedWeek = useMemo(() => {
  const inProg = syllabus.find(
    (w) => (progressByWeek.get(w.week) ?? 'Not Started') === 'In Progress',
  );
  if (inProg) return inProg.week;

  const notSt = syllabus.find(
    (w) => (progressByWeek.get(w.week) ?? 'Not Started') === 'Not Started',
  );
  if (notSt) return notSt.week;

  if (!syllabus.length) return undefined;

  const last = syllabus[syllabus.length - 1];
  if (!last) return undefined;

  return last.week;
}, [syllabus, progressByWeek]);


  const [activeWeek, setActiveWeek] = useState<number | null>(null);

  /* ───────── Active item / status ───────── */

  const activeItem =
    activeWeek == null
      ? null
      : syllabus.find((w) => w.week === activeWeek) ?? null;

  const activeStatus: Status =
    activeWeek == null
      ? 'Not Started'
      : (progressByWeek.get(activeWeek) ?? 'Not Started');

  /* ───────── Watch progress ───────── */

  const {
    rows: watchRows,
    sendEvent,
    reload: reloadWatch,
  } = useWatchProgress(courseId);

  const weekVideos = useMemo(
    () => getWeekVideos(activeItem),
    [activeItem],
  );

  const watchedAllForWeek = useCallback(
    (week?: number | null) => {
      if (!week && week !== 0) return true;
      const item = syllabus.find((s) => s.week === week);
      const vids = getWeekVideos(item);
      if (!vids.length) return true;
      const done = new Set(
        watchRows
          .filter((r: any) => r.week === week && r.completed)
          .map((r: any) => r.video_id),
      );
      return vids.every((v) => done.has(getYoutubeId(v.url)));
    },
    [syllabus, watchRows],
  );

  const watchedAll = useMemo(
    () => watchedAllForWeek(activeWeek),
    [watchedAllForWeek, activeWeek],
  );

  /* ───────── Read progress ───────── */

  const { rows: readRows } = useReadProgress(courseId);

  const readAllForWeek = useCallback(
    (week?: number | null) => {
      if (week == null) return true;
      const item = syllabus.find((s) => s.week === week);
      const urls: string[] = [];
      if (Array.isArray((item as any)?.notesUrls)) {
        urls.push(
          ...(((item as any).notesUrls as string[]) || []).filter(Boolean),
        );
      }
      if (
        typeof (item as any)?.notesUrl === 'string' &&
        (item as any).notesUrl
      ) {
        urls.push((item as any).notesUrl);
      }
      if (!urls.length) return true;
      const done = new Set(
        readRows
          .filter(
            (r: any) => r.week === week && (r as any).completed,
          )
          .map((r: any) => (r as any).source_url),
      );
      return urls.every((u) => done.has(u));
    },
    [syllabus, readRows],
  );

  /* ───────── Course-wide watch completion ───────── */

  const courseWatchedAll = useMemo(() => {
    const requiredIds = syllabus
      .flatMap((s) => getWeekVideos(s).map((v) => getYoutubeId(v.url)))
      .filter(Boolean);
    if (requiredIds.length === 0) return true;
    const done = new Set(
      watchRows.filter((r: any) => r.completed).map((r: any) => r.video_id),
    );
    return requiredIds.every((id) => done.has(id));
  }, [syllabus, watchRows]);

  const remainingCount = useMemo(() => {
    const requiredIds = syllabus
      .flatMap((s) => getWeekVideos(s).map((v) => getYoutubeId(v.url)))
      .filter(Boolean);
    const done = new Set(
      watchRows.filter((r: any) => r.completed).map((r: any) => r.video_id),
    );
    return requiredIds.filter((id) => !done.has(id)).length;
  }, [syllabus, watchRows]);

  /* ───────── Watch dialog state ───────── */

  const [watchOpen, setWatchOpen] = useState(false);
  const [watchTarget, setWatchTarget] = useState<{
    title?: string;
    url: string;
  } | null>(null);

  const openWatch = (v: { title?: string; url: string }) => {
    setWatchTarget(v);
    setWatchOpen(true);
  };

  const handleWatched = async (payload: WatchPayload) => {
    if (activeWeek == null) return;
    await sendEvent({
      week: activeWeek,
      provider: 'youtube',
      videoId: payload.videoId,
      watchedSeconds: payload.watchedSeconds,
      durationSeconds: payload.durationSeconds,
    });
    reloadWatch();
    setWatchOpen(false);
  };

  /* ───────── OER meta ───────── */

  const oerMeta = useOerMeta(courseId);

  /* ───────── Transcript (OER) ───────── */

  const [downloadingTranscript, setDownloadingTranscript] = useState(false);

  const downloadOerTranscript = useCallback(async () => {
    if (!courseId) return;
    if (!courseWatchedAll) {
      Alert.alert(
        'Transcript locked',
        remainingCount
          ? `Please watch all course videos to unlock the transcript. ${remainingCount} remaining.`
          : 'Please watch all course videos before downloading the transcript.',
      );
      return;
    }
    try {
      setDownloadingTranscript(true);

      const lessons = (syllabus || [])
        .map((s) =>
          String(
            s.topic || (s as any)?.title || `Week ${s.week}`,
          ).trim(),
        )
        .filter(Boolean);

      const payload: any = { courseId, lessonsLearnt: lessons };

      let r = await fetch(
        `${backendUrl}/api/transcripts/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        },
      );

      if (r.status === 404) {
        const rr = await fetch(
          `${backendUrl}/api/oer/transcript/${encodeURIComponent(
            courseId,
          )}`,
          {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        );
        const t2 = await rr.json().catch(() => ({}));
        const trId2 = extractTranscriptId(t2);
        const anyUrl2 = t2?.download_url || t2?.url || null;
        const name2 = `${slug(
          selectedCourse?.title || 'transcript',
        )}-${trId2 || 'oer-transcript'}.pdf`;
        if (trId2) {
          await downloadTranscriptFile(backendUrl, token, trId2, name2);
        } else if (anyUrl2) {
          Linking.openURL(anyUrl2).catch(() => {
            Alert.alert(
              'Download failed',
              'Could not open transcript link.',
            );
          });
        } else {
          Alert.alert(
            'No transcript link',
            'Transcript generated, but no download link was returned.',
          );
        }
        return;
      }

      const t = await r.json().catch(() => ({}));
      const trId = extractTranscriptId(t);
      const anyUrl = t?.download_url || t?.url || null;
      const fileName = `${slug(
        selectedCourse?.title || 'transcript',
      )}-${trId || 'transcript'}.pdf`;

      if (trId) {
        await downloadTranscriptFile(
          backendUrl,
          token,
          trId,
          fileName,
        );
      } else if (anyUrl) {
        Linking.openURL(anyUrl).catch(() => {
          Alert.alert(
            'Download failed',
            'Could not open transcript link.',
          );
        });
      } else {
        Alert.alert(
          'No transcript link',
          'Transcript generated, but no download link was returned.',
        );
      }
    } catch (e) {
      console.error('[oer transcript] failed', e);
      Alert.alert(
        'Error',
        'Could not generate/download transcript. Please try again.',
      );
    } finally {
      setDownloadingTranscript(false);
    }
  }, [
    backendUrl,
    token,
    courseId,
    syllabus,
    selectedCourse?.title,
    courseWatchedAll,
    remainingCount,
  ]);

  /* ───────── Certificate (OER) ───────── */

  const [issuingCert, setIssuingCert] = useState(false);

  const allWatched = useCallback(async () => {
    try {
      const r = await fetch(
        `${backendUrl}/api/progress/watch/${courseId}`,
        {
          headers: token
            ? ({ Authorization: `Bearer ${token}` } as any)
            : undefined,
        },
      );
      const rows: any[] = await r.json().catch(() => []);
      const reqs = syllabus.flatMap((s) =>
        getWeekVideos(s).map((v) => v.url),
      );
      const done = new Set(
        (rows || [])
          .filter((x: any) => x.completed)
          .map((x: any) => x.video_id),
      );
      return reqs.every((u: string) => done.has(getYoutubeId(u)));
    } catch {
      return false;
    }
  }, [backendUrl, token, courseId, syllabus]);

  const generateFreeOerCertificate = useCallback(async () => {
    if (!courseId) return;
    try {
      if (!(await allWatched())) {
        Alert.alert(
          'Certificate locked',
          'Please watch all course videos before generating a certificate.',
        );
        return;
      }

      setIssuingCert(true);

      let r = await fetch(
        `${backendUrl}/api/oer/certificates/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ courseId }),
        },
      );

      if (r.status === 404) {
        r = await fetch(`${backendUrl}/api/certificates/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            courseId,
            free: true,
            tier: 'oer',
          }),
        });
      }

      const d = await r.json().catch(() => ({}));
      const certId = extractCertId(d);
      const anyUrl =
        d?.download_url || d?.downloadUrl || d?.url || null;
      const fileName = `${slug(
        selectedCourse?.title || 'certificate',
      )}-${certId || 'certificate'}.pdf`;

      if (certId) {
        await downloadCertificateFile(
          backendUrl,
          token,
          certId,
          fileName,
        );
      } else if (anyUrl) {
        Linking.openURL(anyUrl).catch(() => {
          Alert.alert(
            'Download failed',
            'Could not open certificate link.',
          );
        });
      } else {
        Alert.alert(
          'No certificate link',
          'Certificate generated, but no download link was returned.',
        );
      }
    } catch (e) {
      console.error('[oer certificate] failed', e);
      Alert.alert(
        'Error',
        'Could not generate your certificate. Please try again.',
      );
    } finally {
      setIssuingCert(false);
    }
  }, [allWatched, backendUrl, token, courseId, selectedCourse?.title]);

  /* ───────── Course-level helpers ───────── */

  const setStatus = async (week: number, status: Status) => {
    const payload: UpdateProgressPayload = { courseId, week, status };
    try {
      await update(payload);
      if (status === 'Completed') debouncedPrompt();
    } catch (e) {
      console.error('[CourseProgress.native] setStatus failed', e);
    }
  };
const startCourse = async () => {
  if (!syllabus.length) return;

  const firstItem = syllabus[0];
  if (!firstItem) return;

  const first = firstItem.week;
  const st = (progressByWeek.get(first) ?? 'Not Started') as Status;
  if (st === 'Not Started') await setStatus(first, 'In Progress');
  setActiveWeek(first);
};


  const continueCourse = async () => {
    if (!suggestedWeek) return;
    const st = (progressByWeek.get(suggestedWeek) ?? 'Not Started') as Status;
    if (st === 'Not Started')
      await setStatus(suggestedWeek, 'In Progress');
    setActiveWeek(suggestedWeek);
  };

  const completeCurrent = async () => {
    if (suggestedWeek == null) return;
    if (!watchedAllForWeek(suggestedWeek)) {
      Alert.alert(
        'Videos not complete',
        'Please watch all required videos for this week first.',
      );
      return;
    }
    if (!readAllForWeek(suggestedWeek)) {
      Alert.alert(
        'Reading not complete',
        'Please finish the required reading for this week first.',
      );
      return;
    }
    await setStatus(suggestedWeek, 'Completed');
  };

  const allCompleted =
    counts.total > 0 && counts.completed === counts.total;

  const goPrev = () => {
  if (activeWeek == null) return;
  const idx = syllabus.findIndex((w) => w.week === activeWeek);
  if (idx > 0) {
    const prev = syllabus[idx - 1];
    if (prev) setActiveWeek(prev.week);
  }
};


  const goNext = () => {
  if (activeWeek == null) return;
  const idx = syllabus.findIndex((w) => w.week === activeWeek);
  if (idx < syllabus.length - 1) {
    const next = syllabus[idx + 1];
    if (next) setActiveWeek(next.week);
  }
};


  /* ───────── Early UI states (after hooks) ───────── */

  if (!courseId) {
    return (
      <SafeAreaView
        style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016] items-center justify-center`}
      >
        <Text
          style={tw`text-sm text-red-600 dark:text-red-400 px-4 text-center`}
        >
          Missing course id.
        </Text>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView
        style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016] items-center justify-center`}
      >
        <ActivityIndicator />
        <Text
          style={tw`mt-2 text-sm text-slate-700 dark:text-slate-300`}
        >
          Loading progress…
        </Text>
      </SafeAreaView>
    );
  }

  if (coursesError) {
    return (
      <SafeAreaView
        style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016] items-center justify-center`}
      >
        <Text
          style={tw`text-sm text-red-600 dark:text-red-400 px-4 text-center`}
        >
          Failed to load course.
        </Text>
      </SafeAreaView>
    );
  }

  if (!selectedCourse) {
    return (
      <SafeAreaView
        style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016] items-center justify-center`}
      >
        <Text
          style={tw`text-sm text-slate-700 dark:text-slate-300 px-4 text-center`}
        >
          Course not found.
        </Text>
      </SafeAreaView>
    );
  }

  if (!Array.isArray(syllabus) || syllabus.length === 0) {
    return (
      <SafeAreaView
        style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
        edges={['top', 'bottom']}
      >
        <ScrollView
          contentContainerStyle={[
            tw`flex-1 justify-center`,
            {
              paddingTop: topPad,
              paddingBottom: bottomPad + FOOTER_OFFSET,
              paddingHorizontal: 16,
            },
          ]}
        >
          <View>
            <Text
              style={tw`text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2`}
            >
              {selectedCourse.title}
            </Text>
            <Text
              style={tw`text-sm text-slate-600 dark:text-slate-400`}
            >
              This course doesn’t have a syllabus yet.
            </Text>
            <View style={tw`mt-4 flex-row`}>
              <ChipButton
                label="Back to course"
                variant="ghost"
                onPress={() =>
                  navigation.navigate('CourseDetails', { courseId })
                }
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* ───────── Main render ───────── */

  return (
    <SafeAreaView
      style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
      edges={['top', 'bottom']}
    >
      {/* Soft background orbs */}
      <View style={tw`absolute inset-0`}>
        <View
          style={tw`absolute -top-16 -right-10 h-36 w-36 rounded-full bg-sky-500/10 dark:bg-sky-500/20`}
        />
        <View
          style={tw`absolute -bottom-24 -left-20 h-44 w-44 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20`}
        />
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[
          {
            paddingTop: topPad + 8,
            paddingBottom: bottomPad + FOOTER_OFFSET + 8,
            paddingHorizontal: 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={tw`w-full max-w-md self-center`}>
          {/* Header */}
          <View style={tw`mb-5`}>
            <Text
              style={tw`text-2xl font-extrabold text-slate-900 dark:text-slate-100`}
            >
              {selectedCourse.title}
            </Text>
            {selectedCourse.description ? (
              <Text
                style={tw`mt-1 text-sm text-slate-700 dark:text-slate-300`}
              >
                {selectedCourse.description}
              </Text>
            ) : null}

            {/* Overall progress */}
            <View style={tw`mt-3`}>
              <View
                style={tw`flex-row items-center justify-between mb-1`}
              >
                <Text
                  style={tw`text-xs text-slate-600 dark:text-slate-400`}
                >
                  Overall progress
                </Text>
                <Text
                  style={tw`text-xs text-slate-600 dark:text-slate-400`}
                >
                  {counts.pct}% ({counts.completed}/{counts.total})
                </Text>
              </View>
              <View
                style={tw`h-2 w-full rounded-full bg-[#e5eef7] dark:bg-[#192635] overflow-hidden`}
              >
                <View
                  style={[
                    tw`h-2 bg-[#3d99f5]`,
                    { width: `${counts.pct}%` },
                  ]}
                />
              </View>
              <View
                style={tw`flex-row flex-wrap gap-x-2 mt-2`}
              >
                <Text
                  style={tw`text-[11px] text-slate-500 dark:text-slate-400`}
                >
                  Not started: {counts.notStarted}
                </Text>
                <Text
                  style={tw`text-[11px] text-slate-500 dark:text-slate-400`}
                >
                  • In progress: {counts.inProgress}
                </Text>
                <Text
                  style={tw`text-[11px] text-slate-500 dark:text-slate-400`}
                >
                  • Completed: {counts.completed}
                </Text>
              </View>
            </View>

            {/* Primary actions */}
            <View
              style={tw`flex-row flex-wrap gap-2 mt-4`}
            >
              {counts.completed === 0 && counts.inProgress === 0 ? (
                <ChipButton
                  label="Start course"
                  onPress={startCourse}
                />
              ) : (
                <ChipButton
                  label="Continue where I left off"
                  onPress={continueCourse}
                />
              )}

              {counts.inProgress + counts.notStarted > 0 && (
                <ChipButton
                  label="Mark current week completed"
                  variant="outline"
                  disabled={
                    suggestedWeek == null ||
                    !watchedAllForWeek(suggestedWeek)
                  }
                  onPress={completeCurrent}
                />
              )}

              <ChipButton
                label="Back to course"
                variant="ghost"
                onPress={() =>
                  navigation.navigate('CourseDetails', { courseId })
                }
              />

              {oerMeta && (
                <ChipButton
                  label={
                    downloadingTranscript
                      ? 'Preparing…'
                      : 'Transcript (Free)'
                  }
                  variant="outline"
                  disabled={downloadingTranscript || !courseWatchedAll}
                  onPress={downloadOerTranscript}
                />
              )}

              {allCompleted && !hasMyReview && (
                <ChipButton
                  label="Rate this course"
                  variant="ghost"
                  onPress={() => setOpenReview(true)}
                />
              )}
            </View>
          </View>

          {/* Reading mode & current week */}
          {activeWeek != null && (
            <View style={tw`mb-5`}>
              {activeItem ? (
                <>
                  <CourseReadingPanelInline
                    week={activeWeek}
                    item={activeItem}
                    status={activeStatus}
                    onSetStatus={(next) => {
                      if (
                        next === 'Completed' &&
                        !watchedAllForWeek(activeWeek)
                      ) {
                        Alert.alert(
                          'Videos not complete',
                          'Please watch all required videos for this week first.',
                        );
                        return;
                      }
                      if (
                        next === 'Completed' &&
                        !readAllForWeek(activeWeek)
                      ) {
                        Alert.alert(
                          'Reading not complete',
                          'Please finish the required reading for this week first.',
                        );
                        return;
                      }
                      setStatus(activeWeek, next);
                    }}
                  />

                  {/* Required videos */}
                  {weekVideos.length > 0 && (
                    <View
                      style={tw`rounded-2xl border border-[#cedbe8] dark:border-slate-700 bg-white dark:bg-[#0f1821] p-3 mb-3`}
                    >
                      <Text
                        style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2`}
                      >
                        Required videos for this week
                      </Text>
                      {weekVideos.map((v, i) => {
                        const id = getYoutubeId(v.url);
                        const row = watchRows.find(
                          (r: any) =>
                            r.week === activeWeek && r.video_id === id,
                        );
                        const done = !!row?.completed;
                        return (
                          <View
                            key={i}
                            style={tw`flex-row items-center justify-between mb-2`}
                          >
                            <Text
                              style={tw`text-xs text-slate-800 dark:text-slate-200`}
                            >
                              Video {i + 1}
                            </Text>
                            <View
                              style={tw`flex-row items-center gap-2`}
                            >
                              <Text
                                style={tw.style(
                                  'text-[11px]',
                                  done
                                    ? 'text-emerald-600'
                                    : 'text-[#49739c]',
                                )}
                              >
                                {done ? 'Watched' : 'Not watched'}
                              </Text>
                              <ChipButton
                                label="Watch now"
                                variant="outline"
                                onPress={() =>
                                  openWatch({
                                    title: `Video ${i + 1}`,
                                    url: v.url,
                                  })
                                }
                              />
                            </View>
                          </View>
                        );
                      })}
                      {!watchedAll && (
                        <Text
                          style={tw`mt-1 text-[11px] text-[#49739c]`}
                        >
                          You must watch all videos to complete this week.
                        </Text>
                      )}
                    </View>
                  )}

                  <View
                    style={tw`flex-row flex-wrap gap-2 mt-1`}
                  >
                    <ChipButton
                      label="← Previous week"
                      variant="outline"
                      disabled={
                        syllabus.findIndex(
                          (w) => w.week === activeWeek,
                        ) === 0
                      }
                      onPress={goPrev}
                    />
                    <ChipButton
                      label="Exit reading"
                      variant="ghost"
                      onPress={() => setActiveWeek(null)}
                    />
                    <ChipButton
                      label="Next week →"
                      variant="outline"
                      disabled={
                        syllabus.findIndex(
                          (w) => w.week === activeWeek,
                        ) ===
                        syllabus.length - 1
                      }
                      onPress={goNext}
                    />
                  </View>
                </>
              ) : (
                <View
                  style={tw`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1821] p-4`}
                >
                  <Text
                    style={tw`text-sm text-slate-700 dark:text-slate-300`}
                  >
                    Week {activeWeek} isn’t available. Choose another week
                    below.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Weeks list */}
          <View style={tw`mb-6`}>
            {syllabus.map((item) => {
              const current: Status = (progressByWeek.get(
                item.week,
              ) ?? 'Not Started') as Status;
              const isSuggested = item.week === suggestedWeek;
              const canComplete =
                watchedAllForWeek(item.week) &&
                readAllForWeek(item.week);

              const quickStart = async () => {
                await setStatus(item.week, 'In Progress');
                setActiveWeek(item.week);
              };

              return (
                <View
                  key={item.week}
                  style={tw.style(
                    'mb-3 p-4 rounded-2xl bg-white dark:bg-[#0f1821] border',
                    isSuggested
                      ? 'border-[#3d99f5]'
                      : 'border-[#cedbe8] dark:border-slate-700',
                  )}
                >
                  <View
                    style={tw`flex-row items-center justify-between mb-1`}
                  >
                    <View style={tw`flex-1 pr-2`}>
                      <Text
                        style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}
                      >
                        Week {item.week}:{' '}
                        {item.topic || 'TBA'}
                      </Text>
                      <Text
                        style={tw`mt-1 text-xs text-slate-500 dark:text-slate-400`}
                      >
                        Status: {current}
                        {isSuggested ? ' • current' : ''}
                      </Text>
                    </View>
                    <ChipButton
                      label="Open"
                      variant="ghost"
                      onPress={() => setActiveWeek(item.week)}
                    />
                  </View>

                  <View
                    style={tw`mt-2 flex-row flex-wrap gap-2 items-center`}
                  >
                    {current === 'Not Started' && (
                      <ChipButton
                        label="Start week"
                        variant="ghost"
                        onPress={quickStart}
                      />
                    )}
                    {current !== 'Completed' && (
                      <ChipButton
                        label="Complete week"
                        disabled={!canComplete}
                        onPress={() => {
                          if (!canComplete) {
                            Alert.alert(
                              'Cannot complete yet',
                              'Please watch all required videos and finish reading for this week first.',
                            );
                            return;
                          }
                          setStatus(item.week, 'Completed');
                        }}
                      />
                    )}

                    {/* Status picker */}
                    <View
                      style={tw`mt-1 rounded-xl border border-[#cedbe8] dark:border-slate-700 bg-white dark:bg-[#0f1821] px-1`}
                    >
                      <Picker
                        selectedValue={current}
                        onValueChange={(val) => {
                          const next = val as Status;
                          if (next === 'Completed' && !canComplete) {
                            Alert.alert(
                              'Cannot complete yet',
                              'Please watch all required videos and finish reading for this week first.',
                            );
                            return;
                          }
                          setStatus(item.week, next);
                        }}
                        style={tw`w-40 h-8 text-xs text-slate-900 dark:text-white`}
                        dropdownIconColor={
                          Platform.OS === 'android'
                            ? '#0f172a'
                            : undefined
                        }
                      >
                        <Picker.Item
                          label="Not Started"
                          value="Not Started"
                        />
                        <Picker.Item
                          label="In Progress"
                          value="In Progress"
                        />
                        <Picker.Item
                          label="Completed"
                          value="Completed"
                        />
                      </Picker>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Congrats / certificates & transcript */}
          {allCompleted && (
            <View
              style={tw`mb-6 p-4 rounded-2xl bg-[#eef7ff] dark:bg-[#122032]`}
            >
              <Text
                style={tw`text-sm text-[#0d141c] dark:text-slate-100`}
              >
                🎉 Nice work! You’ve completed every week. Check the{' '}
                <Text
                  style={tw`underline font-semibold`}
                  onPress={() => navigation.navigate('Achievements')}
                >
                  Achievements
                </Text>{' '}
                page for badges.
              </Text>

              <View
                style={tw`flex-row flex-wrap gap-2 mt-3`}
              >
                {oerMeta ? (
                  <>
                    <ChipButton
                      label={
                        issuingCert
                          ? 'Generating…'
                          : 'Free Certificate'
                      }
                      onPress={generateFreeOerCertificate}
                      disabled={issuingCert}
                    />
                    <ChipButton
                      label={
                        downloadingTranscript
                          ? 'Preparing…'
                          : 'Transcript (Free)'
                      }
                      variant="outline"
                      disabled={
                        downloadingTranscript || !courseWatchedAll
                      }
                      onPress={downloadOerTranscript}
                    />
                  </>
                ) : (
                  <ChipButton
                    label="View certificates"
                    variant="outline"
                    onPress={() =>
                      navigation.navigate('Achievements')
                    }
                  />
                )}

                {!oerMeta && !hasMyReview && (
                  <ChipButton
                    label="Rate this course"
                    variant="ghost"
                    onPress={() => setOpenReview(true)}
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Review modal */}
      {openReview && (
        <Modal
          visible={openReview}
          transparent
          animationType="fade"
          onRequestClose={() => setOpenReview(false)}
        >
          <View
            style={tw`flex-1 bg-black/40 items-center justify-center px-4`}
          >
            <View
              style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-4 border border-[#cedbe8] dark:border-slate-700`}
            >
              <Text
                style={tw`text-lg font-bold text-slate-900 dark:text-white mb-2`}
              >
                Rate this course
              </Text>
              <StarRow rating={rating} setRating={setRating} />
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Optional comment (max 500 chars)"
                placeholderTextColor="#64748b"
                maxLength={500}
                multiline
                textAlignVertical="top"
                numberOfLines={4}
                style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white`}
              />
              <View
                style={tw`flex-row flex-wrap gap-2 mt-4`}
              >
                <ChipButton
                  label={posting ? 'Saving…' : 'Submit'}
                  disabled={posting || rating < 1}
                  onPress={onSubmitReview}
                />
                <ChipButton
                  label="Cancel"
                  variant="outline"
                  onPress={() => setOpenReview(false)}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Watch dialog */}
      <WatchDialog
        open={watchOpen}
        onClose={() => setWatchOpen(false)}
        title={watchTarget?.title}
        url={watchTarget?.url || ''}
        week={activeWeek ?? 0}
        onWatched={handleWatched}
      />
    </SafeAreaView>
  );
};

export default CourseProgressScreen;

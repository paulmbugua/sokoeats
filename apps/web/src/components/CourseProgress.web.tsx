import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import debounce from 'lodash.debounce';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses, useOerMeta } from '@mytutorapp/shared/hooks';
import { useCourseProgress } from '@mytutorapp/shared/hooks/useCourseProgress';
import { useCourseReviews } from '@mytutorapp/shared/hooks/useCourseReviews';
import { getRequiredQuestions, getRequiredWeeks, normalizeProgramTrack } from '@mytutorapp/shared/utils/programTrackRequirements';
import CertificateButton from './CertificateButton.web';
import { downloadCertificateFile, downloadTranscriptFile } from '@mytutorapp/shared/api';
import { useWatchProgress } from '@mytutorapp/shared/hooks/useWatchProgress';
import VideoWatchDialog from '../components/VideoWatchDialog.web';
import { useReadProgress } from '@mytutorapp/shared/hooks/useReadProgress';
import SeoHead from './seo/SeoHead';

import type {
  Course as CourseType,
  CourseProgress as CourseProgressItem,
  UpdateProgressPayload,
  SyllabusItem,
  ProgramTrack,
} from '@mytutorapp/shared/types';
import CourseReadingPanel from './CourseReadingPanel.web';

type Status = 'Not Started' | 'In Progress' | 'Completed';

const TRACK_LABELS: Record<ProgramTrack, string> = {
  module: 'Module',
  certificate: 'Certificate',
  diploma: 'Professional',     // ✅ display name
  degree: 'Comprehensive',     // ✅ display name
};

const getTrackLabel = (t: ProgramTrack | null | undefined) =>
  (t && TRACK_LABELS[t]) || 'Certificate';


// ---------- helpers ----------
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
    u.match(/\/certificates\/([^/]+)\/(?:download|view|raw)?/i) || u.match(/[?&]certId=([^&]+)/i);
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
  if (Array.isArray(w?.videoUrls)) urls.push(...(w.videoUrls as string[]).filter(Boolean));
  if (typeof w?.videoUrl === 'string' && w.videoUrl) urls.push(w.videoUrl as string);
  return urls.map((u) => ({ provider: 'youtube', url: u }));
};

const getYoutubeId = (input = ''): string => {
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/').pop() || '';
      return u.searchParams.get('v') || '';
    }
  } catch {}
  return input;
};
// ----------------------------------------------------------------------

const CourseProgress: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const oerMeta = useOerMeta(courseId);
  const { backendUrl, token, profile } = useShopContext();
  const myId = String(profile?.id ?? '');
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const sourceParam = searchParams.get('source');
  const programTrackParam = searchParams.get('programTrack') || searchParams.get('program_track');
  const isSandboxSource = sourceParam === 'sandbox' || Boolean(programTrackParam);
  const dbgSandbox = searchParams.get('dbg') === '1';

  const [storedTrack, setStoredTrack] = useState<ProgramTrack | null>(null);
  useEffect(() => {
    if (!courseId) return;
    try {
      const stored = localStorage.getItem(`sandbox_track:${courseId}`);
      if (stored) setStoredTrack(normalizeProgramTrack(stored));
    } catch {}
  }, [courseId]);

  // Load course
  const { fetchCourseById } = useCourses({ backendUrl, token });

const [selectedCourse, setSelectedCourse] = useState<CourseType | null>(null);
const [coursesLoading, setCoursesLoading] = useState(false);
const [coursesError, setCoursesError] = useState<string | null>(null);

useEffect(() => {
  if (!courseId) return;

  let alive = true;

  setCoursesLoading(true);
  setCoursesError(null);

  (async () => {
    try {
      const c = await fetchCourseById(courseId);
      if (!alive) return;
      setSelectedCourse((c ?? null) as any);
    } catch (e: any) {
      if (!alive) return;
      setCoursesError(e?.message ?? 'Failed to load course.');
      setSelectedCourse(null);
    } finally {
      // ✅ no return in finally
      if (alive) setCoursesLoading(false);
    }
  })();

  return () => {
    alive = false;
  };
}, [courseId, fetchCourseById]);

  // Progress
  const {
    progress = [],
    loading: progressLoading,
    update,
  } = useCourseProgress(backendUrl, courseId!, token);

  const syllabus: SyllabusItem[] =
    (selectedCourse as CourseType | null | undefined)?.syllabus ?? [];
  const courseTrackRaw =
    (selectedCourse as any)?.programTrack ??
    (selectedCourse as any)?.program_track ??
    (selectedCourse as any)?.track ??
    (selectedCourse as any)?.track_key ??
    (selectedCourse as any)?.program_track_key;
  const effectiveTrack = useMemo<ProgramTrack>(() => {
    if (programTrackParam) return normalizeProgramTrack(programTrackParam);
    if (courseTrackRaw) return normalizeProgramTrack(courseTrackRaw);
    if (storedTrack) return storedTrack;
    return 'certificate';
  }, [programTrackParam, courseTrackRaw, storedTrack]);

  const totalWeeks = isSandboxSource ? getRequiredWeeks(effectiveTrack) : syllabus.length || 0;
  const totalQuestions = isSandboxSource ? getRequiredQuestions(effectiveTrack) : 0;
  const effectiveSyllabus: SyllabusItem[] = useMemo(() => {
    if (!isSandboxSource) return syllabus;
    if (!totalWeeks) return syllabus;
    const byWeek = new Map<number, SyllabusItem>();
    syllabus.forEach((item) => {
      byWeek.set(item.week, item);
    });
    return Array.from({ length: totalWeeks }, (_, idx) => {
      const weekNum = idx + 1;
      return (
        byWeek.get(weekNum) ?? {
          week: weekNum,
          topic: `Week ${weekNum}`,
        }
      );
    });
  }, [isSandboxSource, syllabus, totalWeeks]);

  const isLoading = coursesLoading || progressLoading;
  const syllabusList = effectiveSyllabus;

  // Reviews
  const { hasMyReview, submit, posting } = useCourseReviews(backendUrl, courseId, {
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

  const debouncedPrompt = useMemo(() => debounce(promptReview, 200), [promptReview]);
  useEffect(() => () => debouncedPrompt.cancel(), [debouncedPrompt]);

  const progressByWeek = useMemo(() => {
    const map = new Map<number, Status>();
    (progress as CourseProgressItem[]).forEach((p) => map.set(p.week, p.status as Status));
    return map;
  }, [progress]);

  const counts = useMemo(() => {
    let notStarted = 0,
      inProgress = 0,
      completed = 0;
    syllabusList.forEach((s) => {
      const st = (progressByWeek.get(s.week) ?? 'Not Started') as Status;
      if (st === 'Completed') completed++;
      else if (st === 'In Progress') inProgress++;
      else notStarted++;
    });
    const total = syllabusList.length || 0;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    return { notStarted, inProgress, completed, total, pct };
  }, [syllabusList, progressByWeek]);

  const trackLabel = useMemo(() => getTrackLabel(effectiveTrack), [effectiveTrack]);


  const quizEligible = isSandboxSource && totalWeeks > 0 && counts.completed >= totalWeeks;
  const needsOutline = isSandboxSource && totalWeeks > 0 && syllabus.length < totalWeeks;

  const suggestedWeek = useMemo(() => {
    const inProg = syllabusList.find(
      (w) => (progressByWeek.get(w.week) ?? 'Not Started') === 'In Progress'
    );
    if (inProg) return inProg.week;
    const notSt = syllabusList.find(
      (w) => (progressByWeek.get(w.week) ?? 'Not Started') === 'Not Started'
    );
    if (notSt) return notSt.week;
    return syllabusList.length ? syllabusList[syllabusList.length - 1].week : undefined;
  }, [syllabusList, progressByWeek]);

  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const weekRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (activeWeek == null && suggestedWeek && weekRefs.current[suggestedWeek]) {
      weekRefs.current[suggestedWeek]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeWeek, suggestedWeek]);

  // Compute activeItem BEFORE any hooks that depend on it
  const activeItem = activeWeek == null ? null : syllabusList.find((w) => w.week === activeWeek);

  // ---- Watch progress (client) ----
  const { rows: watchRows, sendEvent, reload: reloadWatch } = useWatchProgress(courseId);

  // ---- Read progress (client) ----
  const { rows: readRows } = useReadProgress(courseId);

  const readAllForWeek = useCallback(
    (week?: number | null) => {
      if (week == null) return true;
      const item = syllabusList.find((s) => s.week === week);
      const urls: string[] = [];
      if (Array.isArray((item as any)?.notesUrls)) {
        urls.push(...(((item as any).notesUrls as string[]) || []).filter(Boolean));
      }
      if (typeof (item as any)?.notesUrl === 'string' && (item as any).notesUrl) {
        urls.push((item as any).notesUrl);
      }
      if (!urls.length) return true;

      const done = new Set(
        readRows.filter((r: any) => r.week === week && r.completed).map((r: any) => r.source_url)
      );
      return urls.every((u) => done.has(u));
    },
    [syllabusList, readRows]
  );

  // utilities to compute watched for a given week
  const watchedAllForWeek = useCallback(
    (week?: number | null) => {
      if (!week && week !== 0) return true;
      const item = syllabusList.find((s) => s.week === week);
      const vids = getWeekVideos(item);
      if (!vids.length) return true;
      const done = new Set(
        watchRows.filter((r) => r.week === week && r.completed).map((r) => r.video_id)
      );
      return vids.every((v) => done.has(getYoutubeId(v.url)));
    },
    [syllabusList, watchRows]
  );

  // For currently active week
  const weekVideos = useMemo(() => getWeekVideos(activeItem), [activeItem]);
  const watchedAll = useMemo(() => watchedAllForWeek(activeWeek), [watchedAllForWeek, activeWeek]);

  // ---------- NEW: Course-level watched-all + remaining count ----------
  const courseWatchedAll = useMemo(() => {
    const requiredIds = syllabusList
      .flatMap((s) => getWeekVideos(s).map((v) => getYoutubeId(v.url)))
      .filter(Boolean);
    if (requiredIds.length === 0) return true;
    const done = new Set(watchRows.filter((r) => r.completed).map((r) => r.video_id));
    return requiredIds.every((id) => done.has(id));
  }, [syllabusList, watchRows]);

  const remainingCount = useMemo(() => {
    const requiredIds = syllabusList
      .flatMap((s) => getWeekVideos(s).map((v) => getYoutubeId(v.url)))
      .filter(Boolean);
    const done = new Set(watchRows.filter((r) => r.completed).map((r) => r.video_id));
    return requiredIds.filter((id) => !done.has(id)).length;
  }, [syllabusList, watchRows]);

  // watch dialog state
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchTarget, setWatchTarget] = useState<{ title?: string; url: string } | null>(null);

  const openWatch = (v: { title?: string; url: string }) => {
    setWatchTarget(v);
    setWatchOpen(true);
  };
  const onWatched = async ({
    watchedSeconds,
    durationSeconds,
    videoId,
  }: {
    watchedSeconds: number;
    durationSeconds: number;
    videoId: string;
  }) => {
    if (activeWeek == null) return;
    await sendEvent({
      week: activeWeek,
      provider: 'youtube',
      videoId,
      watchedSeconds,
      durationSeconds,
    });
    reloadWatch();
    setWatchOpen(false);
  };

  // ---------------------- Transcript (OER) ----------------------
  const [downloadingTranscript, setDownloadingTranscript] = useState(false);
  const downloadOerTranscript = useCallback(async () => {
    if (!courseId) return;
    // Gate transcript by full-course watch completion
    if (!courseWatchedAll) {
      alert('Please watch all course videos before downloading the transcript.');
      return;
    }
    try {
      setDownloadingTranscript(true);

      const lessons = (syllabusList || [])
        .map((s) => String(s.topic || (s as any)?.title || `Week ${s.week}`).trim())
        .filter(Boolean);

      const payload: any = { courseId, lessonsLearnt: lessons };

      const r = await fetch(`${backendUrl}/api/transcripts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (r.status === 404) {
        const rr = await fetch(`${backendUrl}/api/oer/transcript/${encodeURIComponent(courseId)}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const t2 = await rr.json().catch(() => ({}));
        const trId2 = extractTranscriptId(t2);
        const anyUrl2 = t2?.download_url || t2?.url || null;
        const name2 = `${slug(selectedCourse?.title || 'transcript')}-${trId2 || 'oer-transcript'}.pdf`;
        if (trId2) {
          await downloadTranscriptFile(backendUrl, token, trId2, name2);
        } else if (anyUrl2) {
          window.location.href = anyUrl2;
        } else {
          alert('Transcript generated, but no download link was returned.');
        }
        return;
      }

      const t = await r.json().catch(() => ({}));
      const trId = extractTranscriptId(t);
      const anyUrl = t?.download_url || t?.url || null;
      const fileName = `${slug(selectedCourse?.title || 'transcript')}-${trId || 'transcript'}.pdf`;

      if (trId) {
        await downloadTranscriptFile(backendUrl, token, trId, fileName);
      } else if (anyUrl) {
        window.location.href = anyUrl;
      } else {
        alert('Transcript generated, but no download link was returned.');
      }
    } catch (e) {
      console.error('[oer transcript] failed', e);
      alert('Could not generate/download transcript. Please try again.');
    } finally {
      setDownloadingTranscript(false);
    }
  }, [backendUrl, token, courseId, syllabusList, selectedCourse?.title, courseWatchedAll]);

  // ---------------------- Certificate (OER) ---------------------
  const [issuingCert, setIssuingCert] = useState(false);

  // course-wide gate before generating certificate
  const allWatched = useCallback(async () => {
    try {
      const r = await fetch(`${backendUrl}/api/progress/watch/${courseId}`, {
        headers: token ? ({ Authorization: `Bearer ${token}` } as any) : undefined,
      });
      const rows = await r.json().catch(() => []);
      const reqs = syllabusList.flatMap((s) => getWeekVideos(s).map((v) => v.url));
      const done = new Set(
        (rows || []).filter((x: any) => x.completed).map((x: any) => x.video_id)
      );
      return reqs.every((u: string) => done.has(getYoutubeId(u)));
    } catch {
      return false;
    }
  }, [backendUrl, token, courseId, syllabusList]);

  const generateFreeOerCertificate = useCallback(async () => {
    if (!courseId) return;
    try {
      // ⛔ gate: must watch all course videos
      if (!(await allWatched())) {
        alert('Please watch all course videos before generating a certificate.');
        return;
      }

      setIssuingCert(true);

      // Prefer a dedicated OER endpoint if available
      let r = await fetch(`${backendUrl}/api/oer/certificates/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ courseId }),
      });

      // Fallback to general generator (free tier)
      if (r.status === 404) {
        r = await fetch(`${backendUrl}/api/certificates/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ courseId, free: true, tier: 'oer' }),
        });
      }

      const d = await r.json().catch(() => ({}));
      const certId = extractCertId(d);
      const anyUrl = d?.download_url || d?.downloadUrl || d?.url || null;
      const fileName = `${slug(selectedCourse?.title || 'certificate')}-${certId || 'certificate'}.pdf`;

      if (certId) {
        await downloadCertificateFile(backendUrl, token, certId, fileName);
      } else if (anyUrl) {
        window.location.href = anyUrl;
      } else {
        alert('Certificate generated, but no download link was returned.');
      }
    } catch (e) {
      console.error('[oer certificate] failed', e);
      alert('Could not generate your certificate. Please try again.');
    } finally {
      setIssuingCert(false);
    }
  }, [allWatched, backendUrl, token, courseId, selectedCourse?.title]);


    // ---------------------- Certificate / Quiz status (Sandbox) ----------------------
  const [certStatus, setCertStatus] = useState<any>(null);
  const [certStatusLoading, setCertStatusLoading] = useState(false);

  const refreshCertStatus = useCallback(async () => {
    if (!backendUrl || !courseId) return;
    try {
      setCertStatusLoading(true);
      const r = await fetch(
        `${backendUrl}/api/certificates/status?courseId=${encodeURIComponent(courseId)}&includeQuiz=1`,
        {
          headers: token ? ({ Authorization: `Bearer ${token}` } as any) : undefined,
        }
      );
      const d = await r.json().catch(() => null);
      setCertStatus(d);
    } catch {
      // fail soft
    } finally {
      setCertStatusLoading(false);
    }
  }, [backendUrl, token, courseId]);

  useEffect(() => {
    if (isSandboxSource) refreshCertStatus();
  }, [isSandboxSource, refreshCertStatus]);

  // When user returns from RobotTeacher/Quiz tab, refresh automatically
  useEffect(() => {
    if (!isSandboxSource) return;
    const onFocus = () => refreshCertStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isSandboxSource, refreshCertStatus]);

  const quizInfo = certStatus?.quiz || null;
  const quizPassed = quizInfo?.passed === true;
  const quizAttempted = quizInfo?.attempted === true;
  const quizScore =
    quizInfo?.scorePct != null ? Math.round(Number(quizInfo.scorePct)) : null;
  const quizPassMark =
    quizInfo?.passMark != null ? Math.round(Number(quizInfo.passMark)) : null;

  const goToQuiz = useCallback(() => {
    navigate(
      `/robot-teach?courseId=${encodeURIComponent(courseId || '')}&programTrack=${effectiveTrack}&tab=quiz&source=sandbox`
    );
  }, [navigate, courseId, effectiveTrack]);


  // ---------------------- EARLY RETURNS (after ALL hooks) ----------------------
  if (!courseId) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-red-600 dark:text-red-400">Missing course id.</div>
    );
  }
  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-gray-700 dark:text-gray-300">
        Loading progress…
      </div>
    );
  }
  if (coursesError) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-red-600 dark:text-red-400">
        Failed to load course.
      </div>
    );
  }
  if (!selectedCourse) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-gray-700 dark:text-gray-300">
        Course not found.
      </div>
    );
  }
  if (!Array.isArray(syllabusList) || syllabusList.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {selectedCourse.title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">This course doesn’t have a syllabus yet.</p>
        <div className="mt-4">
          <Link
            to={`/courses/${courseId}`}
            className="inline-flex rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
          >
            Back to course
          </Link>
        </div>
      </div>
    );
  }

  const setStatus = async (week: number, status: Status) => {
    const payload: UpdateProgressPayload = { courseId, week, status };
    try {
      await update(payload);
      if (status === 'Completed') debouncedPrompt();
    } catch {}
  };

  const startCourse = async () => {
    if (!syllabusList.length) return;
    const first = syllabusList[0].week;
    const st = (progressByWeek.get(first) ?? 'Not Started') as Status;
    if (st === 'Not Started') await setStatus(first, 'In Progress');
    if (isSandboxSource) {
      navigate(
        `/robot-teach?courseId=${encodeURIComponent(
          courseId || ''
        )}&programTrack=${effectiveTrack}&startWeek=${first}&source=sandbox`
      );
      return;
    }
    setActiveWeek(first);
  };

  const continueCourse = async () => {
    if (!suggestedWeek) return;
    const st = (progressByWeek.get(suggestedWeek) ?? 'Not Started') as Status;
    if (st === 'Not Started') await setStatus(suggestedWeek, 'In Progress');
    if (isSandboxSource) {
      navigate(
        `/robot-teach?courseId=${encodeURIComponent(
          courseId || ''
        )}&programTrack=${effectiveTrack}&startWeek=${suggestedWeek}&source=sandbox`
      );
      return;
    }
    setActiveWeek(suggestedWeek);
  };

  const completeCurrent = async () => {
    if (suggestedWeek == null) return;
    if (!watchedAllForWeek(suggestedWeek)) {
      alert('Please watch all required videos for this week first.');
      return;
    }
    await setStatus(suggestedWeek, 'Completed');
  };

  const allCompleted = counts.total > 0 && counts.completed === counts.total;

  const goPrev = () => {
    if (activeWeek == null) return;
    const idx = syllabusList.findIndex((w) => w.week === activeWeek);
    if (idx > 0) setActiveWeek(syllabusList[idx - 1].week);
  };
  const goNext = () => {
    if (activeWeek == null) return;
    const idx = syllabusList.findIndex((w) => w.week === activeWeek);
    if (idx < syllabusList.length - 1) setActiveWeek(syllabusList[idx + 1].week);
  };

  const activeStatus: Status =
    activeWeek == null ? 'Not Started' : (progressByWeek.get(activeWeek) ?? 'Not Started');

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
      <SeoHead
        title={`${selectedCourse.title} Progress | DayBreak`}
        description="Track your learning progress and course milestones."
        canonicalPath={location.pathname}
        noindex
      />
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          {selectedCourse.title}
        </h1>
        {selectedCourse.description && (
          <p className="text-gray-700 dark:text-gray-300">{selectedCourse.description}</p>
        )}

        {/* Overall progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
            <span>Overall progress</span>
            <span>
              {counts.pct}% ({counts.completed}/{counts.total})
            </span>
          </div>
          <div className="h-2 w-full rounded bg-[#e5eef7] dark:bg-[#192635] overflow-hidden">
            <div className="h-2 bg-[#3d99f5] transition-all" style={{ width: `${counts.pct}%` }} />
          </div>
          <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Not started: {counts.notStarted}</span>
            <span>• In progress: {counts.inProgress}</span>
            <span>• Completed: {counts.completed}</span>
          </div>
        </div>

        {isSandboxSource && (
          <div className="mt-3 text-xs text-[#49739c] dark:text-darkTextSecondary">
            Track: <span className="font-semibold">{trackLabel}</span> • {totalWeeks} weeks •{' '}
            {totalQuestions} questions
          </div>
        )}

        {needsOutline && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs px-3 py-2">
            This course outline has {syllabus.length} weeks, but the {trackLabel} track requires{' '}
            {totalWeeks}. Please regenerate the outline in RobotTeacher.
            <button
              onClick={() =>
                navigate(
                  `/robot-teach?courseId=${encodeURIComponent(
                    courseId || ''
                  )}&programTrack=${effectiveTrack}&source=sandbox`
                )
              }
              className="ml-2 underline underline-offset-2 font-semibold"
            >
              Open RobotTeacher
            </button>
          </div>
        )}

        {dbgSandbox && (
          <div className="mt-2 text-[11px] text-[#7a94ad] dark:text-darkTextSecondary">
            dbg: track={effectiveTrack} • totalWeeks={totalWeeks} • completed={counts.completed} •
            quizEligible={String(quizEligible)}
          </div>
        )}

        {/* Primary actions */}
        <div className="flex flex-wrap gap-2 mt-3">
          {counts.completed === 0 && counts.inProgress === 0 ? (
            <button
              onClick={startCourse}
              className="rounded-xl h-10 px-4 bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110"
            >
              Start course
            </button>
          ) : (
            <button
              onClick={continueCourse}
              className="rounded-xl h-10 px-4 bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110"
            >
              Continue where I left off
            </button>
          )}

          {counts.inProgress + counts.notStarted > 0 && (
            <button
              onClick={completeCurrent}
              disabled={suggestedWeek == null || !watchedAllForWeek(suggestedWeek)}
              className="rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold disabled:opacity-60"
              title="Mark the suggested week as completed"
            >
              Mark current week completed
            </button>
          )}

          {isSandboxSource && (
            <button
              onClick={() => {
                if (!quizEligible) {
                  alert(`Complete ${totalWeeks} weeks to unlock the quiz.`);
                  return;
                }
                goToQuiz();
              }}
              disabled={!quizEligible}
              title={
                quizEligible
                  ? quizPassed
                    ? 'Quiz passed — you can retake anytime'
                    : 'Take the quiz to unlock certificate'
                  : `Finish ${totalWeeks} weeks to unlock the quiz`
              }
              className={`rounded-xl h-10 px-4 text-sm font-semibold ${
                quizEligible
                  ? 'bg-[#3d99f5] text-white hover:brightness-110'
                  : 'bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-gray-500 dark:text-gray-400 disabled:opacity-60'
              }`}
            >
              {quizPassed ? 'Quiz passed ✓' : quizAttempted ? 'Retake quiz' : 'Generate quiz'}
            </button>
          )}

          <Link
            to={`/courses/${courseId}`}
            className="rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
          >
            Back to course
          </Link>

          {/* Transcript (OER) — gated by full-course watch */}
          {oerMeta && (
            <button
              onClick={downloadOerTranscript}
              disabled={downloadingTranscript || !courseWatchedAll}
              title={
                courseWatchedAll
                  ? 'Download a transcript that lists ALL videos in this course'
                  : `Watch all videos to unlock transcript${remainingCount ? ` (${remainingCount} remaining)` : ''}`
              }
              className="rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold disabled:opacity-60"
            >
              {downloadingTranscript ? 'Preparing…' : 'Download Transcript (Free)'}
            </button>
          )}

          {allCompleted && !hasMyReview && (
            <button
              onClick={() => setOpenReview(true)}
              className="rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
            >
              Rate this course
            </button>
          )}
        </div>

        {isSandboxSource && (
  <div className="mt-4 rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Certificate checklist
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
          Pass the quiz to unlock certificate generation
          {quizPassMark != null ? ` (pass mark: ${quizPassMark}%)` : ''}.
          {quizAttempted && !quizPassed && quizScore != null
            ? ` Last score: ${quizScore}%.`
            : ''}
        </p>
      </div>
      {certStatusLoading && (
        <span className="text-xs text-gray-500 dark:text-gray-400">Checking…</span>
      )}
    </div>

    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
      <div
        className={`rounded-xl px-3 py-2 ring-1 ${
          counts.completed >= totalWeeks
            ? 'ring-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
            : 'ring-[#cedbe8] dark:ring-darkCard text-gray-700 dark:text-gray-300'
        }`}
      >
        <div className="font-semibold">1) Finish lessons</div>
        <div className="opacity-80">
          {counts.completed}/{totalWeeks} weeks completed
        </div>
      </div>

      <div
        className={`rounded-xl px-3 py-2 ring-1 ${
          quizPassed
            ? 'ring-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
            : quizEligible
            ? 'ring-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
            : 'ring-[#cedbe8] dark:ring-darkCard text-gray-500 dark:text-gray-400'
        }`}
      >
        <div className="font-semibold">2) Pass the quiz</div>
        <div className="opacity-80">
          {quizPassed
            ? 'Passed'
            : quizEligible
            ? quizAttempted
              ? `Last score: ${quizScore ?? '—'}%`
              : 'Ready to take'
            : 'Locked'}
        </div>
      </div>

      <div
        className={`rounded-xl px-3 py-2 ring-1 ${
          quizPassed
            ? 'ring-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
            : 'ring-[#cedbe8] dark:ring-darkCard text-gray-500 dark:text-gray-400'
        }`}
      >
        <div className="font-semibold">3) Generate certificate</div>
        <div className="opacity-80">{quizPassed ? 'Unlocked' : 'Locked'}</div>
      </div>
    </div>

    {quizEligible && !quizPassed && (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={goToQuiz}
          className="rounded-xl h-9 px-3 bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
        >
          Take quiz now
        </button>
        <span className="text-xs text-gray-600 dark:text-gray-400">
          Once you pass, “Generate certificate” will appear automatically.
        </span>
      </div>
    )}
  </div>
)}

      </header>

      {/* Reading Mode */}
      {activeWeek != null && (
        <div className="space-y-4">
          {activeItem ? (
            <>
              <CourseReadingPanel
                courseId={courseId!}
                week={activeWeek}
                item={activeItem}
                status={activeStatus}
                onSetStatus={(next) => {
                  if (next === 'Completed' && !watchedAllForWeek(activeWeek)) {
                    alert('Please watch all required videos for this week first.');
                    return;
                  }
                  if (next === 'Completed' && !readAllForWeek(activeWeek)) {
                    alert('Please finish the required reading for this week first.');
                    return;
                  }
                  setStatus(activeWeek, next);
                }}
              />

              {weekVideos.length > 0 && (
                <div className="rounded-xl border border-[#cedbe8] dark:border-darkCard p-3">
                  <p className="text-sm font-semibold mb-2">Required videos for this week</p>
                  <ul className="space-y-2">
                    {weekVideos.map((v, i) => {
                      const id = getYoutubeId(v.url);
                      const row = watchRows.find((r) => r.week === activeWeek && r.video_id === id);
                      const done = !!row?.completed;
                      return (
                        <li key={i} className="flex items-center justify-between">
                          <span className="text-sm">{`Video ${i + 1}`}</span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs ${done ? 'text-emerald-600' : 'text-[#49739c]'}`}
                            >
                              {done ? 'Watched' : 'Not watched'}
                            </span>
                            <button
                              className="h-8 px-3 rounded-lg ring-1 ring-[#cedbe8] dark:ring-darkCard text-xs font-semibold"
                              onClick={() => openWatch({ title: `Video ${i + 1}`, url: v.url })}
                            >
                              Watch now
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {!watchedAll && (
                    <p className="mt-2 text-xs text-[#49739c]">
                      You must watch all videos to complete this week.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={goPrev}
                  disabled={syllabusList.findIndex((w) => w.week === activeWeek) === 0}
                  className={`rounded-xl h-10 px-4 text-sm font-semibold ${
                    syllabusList.findIndex((w) => w.week === activeWeek) === 0
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                      : 'bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard'
                  }`}
                >
                  ← Previous week
                </button>

                <button
                  onClick={() => setActiveWeek(null)}
                  className="rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
                >
                  Exit reading
                </button>

                <button
                  onClick={goNext}
                  disabled={
                    syllabusList.findIndex((w) => w.week === activeWeek) ===
                    syllabusList.length - 1
                  }
                  className={`rounded-xl h-10 px-4 text-sm font-semibold ${
                    syllabusList.findIndex((w) => w.week === activeWeek) ===
                    syllabusList.length - 1
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                      : 'bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard'
                  }`}
                >
                  Next week →
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-gray-200 dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 sm:p-5">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Week {activeWeek} isn’t available. Choose another week below.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Weeks list */}
      <section className="space-y-3">
        {syllabusList.map((item) => {
          const current: Status = (progressByWeek.get(item.week) ?? 'Not Started') as Status;
          const isSuggested = item.week === suggestedWeek;
          const canComplete = watchedAllForWeek(item.week) && readAllForWeek(item.week);

      const quickStart = async () => {
        await setStatus(item.week, 'In Progress');
        if (isSandboxSource) {
          navigate(
            `/robot-teach?courseId=${encodeURIComponent(
              courseId || ''
            )}&programTrack=${effectiveTrack}&startWeek=${item.week}&source=sandbox`
          );
          return;
        }
        setActiveWeek(item.week);
      };

          return (
            <div
              key={item.week}
              ref={(el) => {
                weekRefs.current[item.week] = el;
              }}
              className={`p-4 border rounded-xl bg-white dark:bg-[#0f1821] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                isSuggested ? 'border-[#3d99f5]' : 'border-[#cedbe8] dark:border-darkCard'
              }`}
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Week {item.week}: {item.topic || 'TBA'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Status: {current}
                  {isSuggested ? ' • current' : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {current === 'Not Started' && (
                  <button
                    onClick={quickStart}
                    className="rounded-lg h-9 px-3 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
                  >
                    Start week
                  </button>
                )}
                {current !== 'Completed' && (
                  <button
                    onClick={() => {
                      if (!canComplete) {
                        alert('Please watch all required videos for this week first.');
                        return;
                      }
                      setStatus(item.week, 'Completed');
                    }}
                    disabled={!canComplete}
                    className="rounded-lg h-9 px-3 bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
                  >
                    Complete week
                  </button>
                )}

                <select
                  value={current}
                  onChange={(e) => {
                    const next = e.target.value as Status;
                    if (next === 'Completed' && !canComplete) {
                      alert('Please watch all required videos for this week first.');
                      // reset the select to previous value visually
                      e.currentTarget.value = current;
                      return;
                    }
                    setStatus(item.week, next);
                  }}
                  className="border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-gray-900 dark:text-gray-100 px-2 py-1 rounded text-sm"
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>
          );
        })}
      </section>

      {/* Congrats + docs */}
      {allCompleted && (
        <div className="p-4 rounded-xl bg-[#eef7ff] dark:bg-[#122032] text-[#0d141c] dark:text-gray-100">
          🎉 Nice work! You’ve completed every week. Check the{' '}
          <Link to="/achievements" className="underline font-semibold">
            Achievements
          </Link>{' '}
          page for badges.
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {oerMeta ? (
              <>
                <button
                  onClick={generateFreeOerCertificate}
                  disabled={issuingCert}
                  className="rounded-xl h-10 px-4 bg-emerald-600 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
                >
                  {issuingCert ? 'Generating…' : 'Generate Free Certificate'}
                </button>

                <button
                  onClick={downloadOerTranscript}
                  disabled={downloadingTranscript || !courseWatchedAll}
                  title={
                    courseWatchedAll
                      ? 'Download a transcript that lists ALL videos in this course'
                      : `Watch all videos to unlock transcript${remainingCount ? ` (${remainingCount} remaining)` : ''}`
                  }
                  className="rounded-xl h-10 px-4 bg-indigo-600 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
                >
                  {downloadingTranscript ? 'Preparing…' : 'Download Transcript (Free)'}
                </button>
              </>
              ) : isSandboxSource && !quizPassed ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={goToQuiz}
                        className="rounded-xl h-10 px-4 bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110"
                      >
                        Generate quiz (required)
                      </button>
                      <div className="text-xs text-gray-700 dark:text-gray-300">
                        Pass the quiz{quizPassMark != null ? ` (≥ ${quizPassMark}%)` : ''} to unlock your certificate.
                        {quizAttempted && quizScore != null ? ` Last score: ${quizScore}%.` : ''}
                      </div>
                    </div>
                  ) : (
                    <CertificateButton courseId={courseId!} />
                  )}

          </div>
          {!oerMeta && !hasMyReview && (
            <button
              className="ml-3 rounded-xl h-8 px-3 bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
              onClick={() => setOpenReview(true)}
            >
              Rate this course
            </button>
          )}
        </div>
      )}

      {/* Review modal */}
      {openReview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-4 ring-1 ring-[#cedbe8] dark:ring-darkCard">
            <h3 className="text-lg font-bold mb-2">Rate this course</h3>
            <div className="flex items-center gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={n <= rating ? 'text-yellow-500 text-2xl' : 'text-[#49739c] text-2xl'}
                  aria-label={`${n} star`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional comment (max 500 chars)"
              maxLength={500}
              className="w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534]"
            />
            <div className="mt-4 flex items-center gap-2">
              <button
                disabled={posting || rating < 1}
                onClick={onSubmitReview}
                className="px-4 h-10 rounded-xl bg-[#3d99f5] text-white text-sm font-semibold disabled:opacity-60"
              >
                {posting ? 'Saving…' : 'Submit'}
              </button>
              <button
                onClick={() => setOpenReview(false)}
                className="px-4 h-10 rounded-xl bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Watch dialog */}
      <VideoWatchDialog
        open={watchOpen}
        onClose={() => setWatchOpen(false)}
        title={watchTarget?.title}
        week={activeWeek ?? 0}
        embedUrl={watchTarget?.url || ''}
        onWatched={onWatched}
      />
    </div>
  );
};

export default CourseProgress;

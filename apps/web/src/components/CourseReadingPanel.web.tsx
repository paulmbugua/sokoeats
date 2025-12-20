// apps/web/src/components/CourseReadingPanel.web.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

type Status = 'Not Started' | 'In Progress' | 'Completed';

type SyllabusItem = {
  week: number;
  topic?: string;
  assignment?: string;
  videoUrl?: string;
  notesUrl?: string;
};

type Props = {
  courseId: string;
  week?: number | null;
  item?: SyllabusItem | null;
  status?: Status | null;
  onSetStatus?: (next: Status) => Promise<void> | void;
};

/** --- Helpers ----------------------------------------------------------- */
const isMp4 = (url?: string) => !!url && /\.mp4(\?|$)/i.test(url);
const isYouTube = (url?: string) => !!url && /(youtube\.com|youtu\.be)/i.test(url || '');
const isVimeo = (url?: string) => !!url && /vimeo\.com/i.test(url || '');

function ytIdFromUrl(input = ''): string {
  if (!input) return '';
  try {
    const u = new URL(input);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) return u.pathname.slice(1);
    if (host.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/').pop() || '';
      return u.searchParams.get('v') || '';
    }
  } catch {
    // not a URL — assume already an ID
    return input;
  }
  return '';
}

/** Normalize video URLs to embeddable src (fallback when not using APIs) */
function toEmbedSrc(url: string): string {
  if (isYouTube(url)) {
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) {
        const id = u.pathname.replace(/^\//, '');
        return `https://www.youtube.com/embed/${id}`;
      }
      if (u.hostname.includes('youtube.com')) {
        const id = u.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
    } catch {}
  }
  if (isVimeo(url)) {
    const match = url.match(/vimeo\.com\/(\d+)/i);
    if (match?.[1]) return `https://player.vimeo.com/video/${match[1]}`;
  }
  return url;
}

/** Small, theme-aware card wrapper */
const Card: React.FC<{ title?: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl border border-gray-200 dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 sm:p-5">
    {title && <h3 className="text-base sm:text-lg font-semibold mb-3">{title}</h3>}
    {children}
  </div>
);

/** --- Video Gate (MP4 precise, YouTube via IFrame API, Vimeo fallback) --- */
const VideoGate: React.FC<{
  url: string;
  onSatisfied: () => void;
}> = ({ url, onSatisfied }) => {
  const [watchedPct, setWatchedPct] = useState(0);
  const satisfiedRef = useRef(false);

  const requiredPct = 80;

  // MP4
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration || Number.isNaN(v.duration)) return;
    const pct = Math.min(100, Math.round((v.currentTime / v.duration) * 100));
    setWatchedPct(pct);
    if (!satisfiedRef.current && pct >= requiredPct) {
      satisfiedRef.current = true;
      onSatisfied();
    }
  };

  // YouTube (IFrame API)
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytId = useMemo(() => (isYouTube(url) ? ytIdFromUrl(url) : ''), [url]);

  useEffect(() => {
    if (!isYouTube(url)) return;
    let interval: any;
    let lastTime = 0;

    const ensureYT = () =>
      new Promise<void>((resolve) => {
        const w = window as any;
        if (w.YT?.Player) return resolve();

        // add script once
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
          const s = document.createElement('script');
          s.src = 'https://www.youtube.com/iframe_api';
          document.body.appendChild(s);
        }

        // chain existing callback if present
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => {
          try {
            prev?.();
          } catch {}
          resolve();
        };
        // If script was already loaded and callback fired earlier, poll for YT
        const tryFast = setInterval(() => {
          if (w.YT?.Player) {
            clearInterval(tryFast);
            resolve();
          }
        }, 50);
        setTimeout(() => clearInterval(tryFast), 3000);
      });

    (async () => {
      await ensureYT();
      if (!ytHostRef.current) return;
      const YT = (window as any).YT;

      ytPlayerRef.current = new YT.Player(ytHostRef.current, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: (e: any) => {
            interval = setInterval(() => {
              try {
                const cur = Math.round(e.target.getCurrentTime() || 0);
                const dur = Math.round(e.target.getDuration() || 0);
                lastTime = cur;
                if (dur > 0) {
                  const pct = Math.min(100, Math.round((cur / dur) * 100));
                  setWatchedPct(pct);
                  if (!satisfiedRef.current && pct >= requiredPct) {
                    satisfiedRef.current = true;
                    onSatisfied();
                  }
                }
              } catch {
                /* noop */
              }
            }, 1000);
          },
          onStateChange: (e: any) => {
            // ENDED === 0
            if (e?.data === 0) {
              const dur = Math.round(e.target.getDuration() || 0);
              const cur = Math.max(lastTime, dur);
              const pct = dur > 0 ? Math.min(100, Math.round((cur / dur) * 100)) : 100;
              setWatchedPct(pct);
              if (!satisfiedRef.current && pct >= requiredPct) {
                satisfiedRef.current = true;
                onSatisfied();
              }
            }
          },
        },
      });
    })();

    return () => {
      clearInterval(interval);
      try {
        ytPlayerRef.current?.destroy?.();
      } catch {}
    };
  }, [url, ytId, requiredPct, onSatisfied]);

  const embedSrc = !isMp4(url) && !isYouTube(url) ? toEmbedSrc(url) : null;

  return (
    <Card title="Video">
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-darkCard">
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            {isMp4(url) ? (
              <video
                ref={videoRef}
                onTimeUpdate={onTimeUpdate}
                className="absolute inset-0 w-full h-full"
                controls
                preload="metadata"
              >
                <source src={url} type="video/mp4" />
              </video>
            ) : isYouTube(url) ? (
              <div ref={ytHostRef} className="absolute inset-0 w-full h-full" />
            ) : (
              <iframe
                title="Course video"
                src={embedSrc || url}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="h-2 w-full rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-2 bg-[#3d99f5] transition-all" style={{ width: `${watchedPct}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            Watched: {watchedPct}% • need {requiredPct}% to unlock completion
            {isVimeo(url) && ' (Vimeo progress not tracked precisely)'}
          </p>
        </div>
      </div>
    </Card>
  );
};

/** --- Notes Gate -------------------------------------------------------- */
const NotesGate: React.FC<{
  url: string;
  onSatisfied: () => void;
}> = ({ url, onSatisfied }) => {
  const [downloaded, setDownloaded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const requiredSeconds = 30;

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (downloaded && elapsed >= requiredSeconds) onSatisfied();
  }, [downloaded, elapsed, onSatisfied]);

  const onDownload = () => {
    setDownloaded(true);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card title="Notes / PDF">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Please download and review the notes.
        </p>
        <button
          onClick={onDownload}
          className="inline-flex justify-center rounded-xl h-9 px-3 bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
        >
          Download notes
        </button>
      </div>

      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        Time on step: {elapsed}s / {requiredSeconds}s{' '}
        {downloaded ? '• downloaded ✔' : '• not downloaded'}
      </div>
    </Card>
  );
};

/** --- Assignment Gate --------------------------------------------------- */
const AssignmentGate: React.FC<{
  text?: string;
  onSatisfied: () => void;
}> = ({ text, onSatisfied }) => {
  const [elapsed, setElapsed] = useState(0);
  const requiredSeconds = 60;

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (elapsed >= requiredSeconds) onSatisfied();
  }, [elapsed, onSatisfied]);

  return (
    <Card title="Assignment">
      <p className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">
        {text?.trim() || 'Work through this week’s task before marking complete.'}
      </p>
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        Spend at least {requiredSeconds}s on this step. Time on step: {elapsed}s
      </p>
    </Card>
  );
};

/** --- Main Panel -------------------------------------------------------- */
const CourseReadingPanel: React.FC<Props> = ({ courseId, week, item, status, onSetStatus }) => {
  const safeStatus: Status = status ?? 'Not Started';
  const safeItem: SyllabusItem | null = item ?? null;
  const weekLabel = safeItem?.week ?? week ?? 0;

  const [videoOk, setVideoOk] = useState(false);
  const [notesOk, setNotesOk] = useState(false);
  const [assignmentOk, setAssignmentOk] = useState(false);

  useEffect(() => {
    if (safeStatus === 'Not Started' && onSetStatus) {
      void onSetStatus('In Progress');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { needVideo, needNotes, needAssign } = useMemo(() => {
    return {
      needVideo: !!safeItem?.videoUrl,
      needNotes: !!safeItem?.notesUrl,
      needAssign: !!(safeItem?.assignment && safeItem.assignment.trim().length > 0),
    };
  }, [safeItem]);

  const canComplete = useMemo(() => {
    return (
      (needVideo ? videoOk : true) &&
      (needNotes ? notesOk : true) &&
      (needAssign ? assignmentOk : true)
    );
  }, [needVideo, needNotes, needAssign, videoOk, notesOk, assignmentOk]);

  const onMarkComplete = async () => {
    if (!canComplete || !onSetStatus) return;
    await onSetStatus('Completed');
  };

  if (!safeItem) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-bold">Week {weekLabel}: Loading…</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              We’re fetching this week’s resources.
            </p>
          </div>
          <span className="inline-flex items-center rounded-lg h-8 px-3 bg-gray-200 dark:bg-gray-700 text-xs font-semibold">
            {safeStatus}
          </span>
        </div>

        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No week data yet. If this persists, check your progress API route or the enrollment/Week
            ID.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold">
            Week {weekLabel}: {safeItem.topic || 'Untitled'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Work through the resources below.
          </p>
        </div>

        <div className="flex gap-2">
          <span className="inline-flex items-center rounded-lg h-8 px-3 bg-gray-200 dark:bg-gray-700 text-xs font-semibold">
            {safeStatus}
          </span>
          <button
            disabled={!canComplete || safeStatus === 'Completed' || !onSetStatus}
            onClick={onMarkComplete}
            className={`rounded-xl h-9 px-4 text-sm font-semibold ${
              !canComplete || safeStatus === 'Completed' || !onSetStatus
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                : 'bg-[#3d99f5] text-white hover:brightness-110'
            }`}
            title={
              !onSetStatus
                ? 'Action unavailable'
                : !canComplete
                  ? 'Finish all required steps first'
                  : 'Mark this week as completed'
            }
          >
            {safeStatus === 'Completed' ? 'Completed' : 'Mark week as complete'}
          </button>
        </div>
      </div>

      {/* Resources */}
      {!!safeItem.videoUrl && (
        <VideoGate url={safeItem.videoUrl} onSatisfied={() => setVideoOk(true)} />
      )}

      {!!safeItem.notesUrl && (
        <NotesGate url={safeItem.notesUrl} onSatisfied={() => setNotesOk(true)} />
      )}

      {!!(safeItem.assignment && safeItem.assignment.trim().length > 0) && (
        <AssignmentGate text={safeItem.assignment} onSatisfied={() => setAssignmentOk(true)} />
      )}

      {/* Empty state */}
      {!safeItem.videoUrl &&
        !safeItem.notesUrl &&
        !(safeItem.assignment && safeItem.assignment.trim().length > 0) && (
          <Card>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No resources were added for this week. You can still mark it complete when ready.
            </p>
          </Card>
        )}
    </div>
  );
};

export default CourseReadingPanel;

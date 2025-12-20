import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  week: number;
  embedUrl: string; // pass '' if unknown; parent already does `watchTarget?.url || ''`
  onWatched: (stats: { watchedSeconds: number; durationSeconds: number; videoId: string }) => void;
};

const ytIdFromUrl = (input: string): string => {
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
    return input; // not a URL; assume ID
  }
  return '';
};

const storageKey = (id: string) => `yt-allowMax-${id}`;

const VideoWatchDialog: React.FC<Props> = ({ open, onClose, title, week, embedUrl, onWatched }) => {
  const playerHostRef = useRef<HTMLDivElement | null>(null); // element YT will replace
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const videoId = useMemo<string>(() => ytIdFromUrl(embedUrl || ''), [embedUrl]);

  // anti-seek state
  const allowMaxRef = useRef<number>(0); // furthest allowed position
  const lastTimeRef = useRef<number>(0); // last observed time
  const reportedRef = useRef<boolean>(false); // prevent duplicate onWatched
  const jumpGrace = 1.0; // seconds allowed forward jump
  const pollMs = 400; // progress polling interval

  // restore persisted allowMax per video
  useEffect(() => {
    allowMaxRef.current = Number(localStorage.getItem(storageKey(videoId)) || 0) || 0;
    reportedRef.current = false;
  }, [videoId]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Build player responsively
  useEffect(() => {
    if (!open || !videoId) return;

    let interval: any;

    const ensureYT = () =>
      new Promise<void>((resolve) => {
        const w = window as any;
        if (w.YT?.Player) return resolve();

        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
          const s = document.createElement('script');
          s.src = 'https://www.youtube.com/iframe_api';
          document.body.appendChild(s);
        }
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => {
          try {
            prev?.();
          } catch {}
          resolve();
        };
        const h = setInterval(() => {
          if (w.YT?.Player) {
            clearInterval(h);
            resolve();
          }
        }, 50);
        setTimeout(() => clearInterval(h), 3000);
      });

    (async () => {
      await ensureYT();
      if (!playerHostRef.current) return;
      const YT = (window as any).YT;

      playerRef.current = new YT.Player(playerHostRef.current, {
        videoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          controls: 0, // hide controls (no progress bar)
          disablekb: 1, // disable keyboard shortcuts
          fs: 0, // hide fullscreen button (keeps users in app flow)
          playsinline: 1, // iOS: keep inline instead of forced fullscreen
        },
        events: {
          onReady: (e: any) => {
            setReady(true);
            try {
              // Make iframe fill its container for perfect responsiveness
              const iframe: HTMLIFrameElement | null = e?.target?.getIframe?.() || null;
              if (iframe) {
                iframe.style.position = 'absolute';
                iframe.style.inset = '0';
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.setAttribute(
                  'allow',
                  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                );
              }
              e.target.setPlaybackRate(1);
            } catch {}

            interval = setInterval(() => {
              try {
                const cur = Number(e.target.getCurrentTime() || 0);
                const dur = Number(e.target.getDuration() || 0);
                // anti-seek: pull back if cur jumped beyond allowed
                const allowed = allowMaxRef.current + jumpGrace;
                if (cur > allowed) {
                  e.target.seekTo(allowMaxRef.current, true);
                  return;
                }
                // advance allowed window only forward
                if (cur > allowMaxRef.current) {
                  allowMaxRef.current = cur;
                  localStorage.setItem(storageKey(videoId), String(allowMaxRef.current));
                }
                lastTimeRef.current = cur;

                // send completion when reaching very end (once)
                if (!reportedRef.current && dur > 0 && cur >= dur - 0.5) {
                  reportedRef.current = true;
                  const watchedSeconds = Math.round(allowMaxRef.current);
                  const durationSeconds = Math.round(dur);
                  onWatched({ watchedSeconds, durationSeconds, videoId });
                }
              } catch {
                /* noop */
              }
            }, pollMs);
          },
          onPlaybackRateChange: (ev: any) => {
            // lock to 1×
            if (ev?.data && ev.data !== 1) {
              try {
                playerRef.current?.setPlaybackRate(1);
              } catch {}
            }
          },
          onStateChange: (ev: any) => {
            // If user somehow ends early, compute once
            if (ev?.data === 0 /* ENDED */ && !reportedRef.current) {
              reportedRef.current = true;
              try {
                const dur = Math.round(playerRef.current.getDuration() || 0);
                const watched = Math.round(Math.max(allowMaxRef.current, lastTimeRef.current));
                onWatched({ watchedSeconds: watched, durationSeconds: dur, videoId });
              } catch {
                /* noop */
              }
            }
          },
        },
      });
    })();

    return () => {
      clearInterval(interval);
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
      setReady(false);
    };
  }, [open, videoId, onWatched]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onMouseDown={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`video-dialog-title-${week}`}
      style={{
        // play nice with mobile safe areas
        paddingTop: 'max(env(safe-area-inset-top), 0.5rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)',
      }}
    >
      <div
        className="
          w-full max-w-full sm:max-w-3xl lg:max-w-4xl
          bg-white dark:bg-[#0f1821]
          rounded-md sm:rounded-xl shadow-lg
          ring-1 ring-[#e7edf4] dark:ring-darkCard
          max-h-[100dvh] sm:max-h-[90dvh]
          overflow-hidden flex flex-col
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sticky top-0 bg-white/90 dark:bg-[#0f1821]/90 backdrop-blur">
          <h3
            id={`video-dialog-title-${week}`}
            className="font-semibold text-sm sm:text-base truncate"
          >
            {title || 'Watch'}
          </h3>
          <button
            onClick={onClose}
            className="text-xs sm:text-sm px-2 sm:px-3 py-1 rounded bg-[#e7edf4] dark:bg-[#172534] hover:opacity-90"
          >
            Close
          </button>
        </div>

        {/* Responsive video area */}
        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="relative w-full aspect-video rounded overflow-hidden bg-black">
            {/* Absolute fill container; YT iframe is forced to 100% via onReady */}
            <div className="absolute inset-0">
              <div ref={playerHostRef} id={`yt-host-${week}`} className="w-full h-full" />
            </div>
          </div>
          {!ready && <p className="mt-2 text-xs sm:text-sm text-[#49739c]">Loading player…</p>}
          {!videoId && (
            <p className="mt-2 text-xs sm:text-sm text-red-600">
              This video can’t be loaded. Missing or invalid YouTube URL/ID.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoWatchDialog;

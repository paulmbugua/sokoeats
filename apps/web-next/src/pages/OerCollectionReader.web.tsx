// apps/web/src/pages/OerCollectionReader.web.tsx
'use client';
import React, { useCallback, useEffect, useRef, useState, useMemo, lazy, Suspense } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useShopContext } from '@mytutorapp/shared/context';
import { useWrapOerBook } from '@mytutorapp/shared/hooks';

import {
  BookOpenText,
  Video,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  PanelRight,
  PanelLeft,
  Search,
  Loader2,
  Sun,
  Moon,
  Share2,
  Bookmark,
  ArrowLeft,
  Copy,
} from 'lucide-react';

import { Document, Page, pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// IMPORTANT: react-pdf v7 CSS paths. If on another major, adjust imports.

/* -------------------------------------------------------------------------- */
/* Debug helper */
/* -------------------------------------------------------------------------- */
const DEBUG = false;
const dlog = (...args: any[]) => DEBUG && console.log('[OerCollectionReader]', ...args);

/* -------------------------------------------------------------------------- */
/* react-player lazy import with widened props */
/* -------------------------------------------------------------------------- */
type ReactPlayerProps = {
  url?: string | string[];
  width?: string | number;
  height?: string | number;
  playing?: boolean;
  loop?: boolean;
  controls?: boolean;
  config?: any;
  onReady?: () => void;
  onStart?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (e: any) => void;
};

const Player = lazy(async () => {
  const m = await import('react-player');
  return { default: (m.default || (m as any)) as React.ComponentType<ReactPlayerProps> };
});

/* -------------------------------------------------------------------------- */
/* Types / utils */
/* -------------------------------------------------------------------------- */
type CollectionItemKind = 'video' | 'book' | 'pdf' | 'text' | 'collection' | 'audio';

export type CollectionItem = {
  id?: string | number;
  title: string;
  kind?: CollectionItemKind;
  slug?: string;
  source_url?: string;
  file_url?: string;
  web_url?: string | null;
  cover_url?: string | null;
  video_url?: string;
  url?: string;
  provider?: string;
  embed_url?: string;
  duration?: string;
  pages?: number;
  [key: string]: any;
};

const cx = (...parts: (false | null | undefined | string)[]) => parts.filter(Boolean).join(' ');

const isProbablyPdfUrl = (u?: string) => !!u && /\.pdf($|\?)/i.test(u);
const isProbablyVideoUrl = (u?: string) =>
  !!u &&
  /(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|\.m3u8($|\?)|\.mp4($|\?)|\.webm($|\?)|\/playlist\?list=)/i.test(
    u
  );

const toWatchLikeYouTube = (raw?: string) => {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    const sp = u.searchParams;

    const isYT =
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'youtu.be' ||
      host.endsWith('.youtube.com');
    if (!isYT) return raw;

    if (u.pathname.startsWith('/channel/') || u.pathname.startsWith('/@')) return '';

    if (u.pathname.startsWith('/shorts/')) {
      const id = u.pathname.split('/')[2];
      return `https://www.youtube.com/watch?v=${id}`;
    }

    if (u.pathname === '/watch' || u.pathname === '/playlist') return raw;
    if (host === 'youtu.be') return raw;

    if (u.pathname.startsWith('/embed/')) {
      const id = u.pathname.split('/')[2];
      const list = sp.get('list');
      return list
        ? `https://www.youtube.com/watch?v=${id}&list=${list}`
        : `https://www.youtube.com/watch?v=${id}`;
    }

    return raw;
  } catch (e) {
    dlog('toWatchLikeYouTube error', e, raw);
    return raw;
  }
};

// Build nocookie iframe src (playlist-only or video+playlist)
const toYouTubeIframeSrc = (raw?: string) => {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    const sp = u.searchParams;

    const params =
      `modestbranding=1&playsinline=1&rel=0` +
      (typeof window !== 'undefined'
        ? `&origin=${encodeURIComponent(window.location.origin)}`
        : '');

    const list = sp.get('list');
    const v = sp.get('v');

    if ((u.pathname === '/playlist' || list) && !v) {
      return `https://www.youtube.com/embed/videoseries?list=${list ?? ''}&${params}`;
    }

    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2];
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2];
    else if (v) id = v;

    if (id) {
      return `https://www.youtube-nocookie.com/embed/${id}?${params}${list ? `&list=${list}` : ''}`;
    }
    return raw;
  } catch (e) {
    dlog('toYouTubeIframeSrc error', e, raw);
    return raw;
  }
};

// Prefer embed_url > video_url > source_url > url, then normalize
const getPlayableUrl = (it?: CollectionItem) => {
  if (!it) return '';
  const raw = it.embed_url || it.video_url || it.source_url || (it as any).url || '';
  return toWatchLikeYouTube(raw);
};

const normalizeKind = (it: CollectionItem): CollectionItemKind => {
  const raw = String(it.kind || (it as any).type || (it as any).category || '').toLowerCase();
  const s = it.source_url || '';
  const f = it.file_url || (it as any).pdf_url || '';
  const e = it.embed_url || '';
  const v = it.video_url || '';
  const u = (it as any).url || '';

  if (raw.includes('video') || [e, s, v, u].some(isProbablyVideoUrl)) return 'video';
  if (raw.includes('pdf') || isProbablyPdfUrl(f) || isProbablyPdfUrl(s)) return 'pdf';
  if (raw.includes('book')) return 'book';
  if (raw.includes('text')) {
    if (isProbablyPdfUrl(s) || isProbablyPdfUrl(f)) return 'pdf';
    return 'text';
  }
  if ([s, e, v, u].some(isProbablyVideoUrl)) return 'video';
  if ([s, f].some(isProbablyPdfUrl)) return 'pdf';
  return 'collection';
};

const getPdfUrl = (it: CollectionItem) => it.file_url || (it as any).pdf_url || it.source_url || '';
const getVideoUrl = (it: CollectionItem) =>
  it.video_url || it.embed_url || it.source_url || (it as any).url || '';
const itemKey = (it: CollectionItem, idx: number) =>
  String(it.id ?? it.slug ?? it.source_url ?? `idx-${idx}`);

// ✅ FIXED: added missing `}` and backtick
const lsKey = (collectionId: string | number, suffix: string) =>
  `oer.collection.${collectionId}.${suffix}`;

const toYouTubeWatch = (raw?: string) => {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com'
    ) {
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2];
        const list = u.searchParams.get('list');
        return list
          ? `https://www.youtube.com/watch?v=${id}&list=${list}`
          : `https://www.youtube.com/watch?v=${id}`;
      }
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      const list = u.searchParams.get('list');
      return list
        ? `https://www.youtube.com/watch?v=${id}&list=${list}`
        : `https://www.youtube.com/watch?v=${id}`;
    }
    return raw;
  } catch (e) {
    dlog('toYouTubeWatch error', e, raw);
    return raw;
  }
};

/* Helpers for resilient fetching */
const sanitizeId = (routeId?: string) => {
  let s = routeId ?? '';
  try {
    s = decodeURIComponent(s);
  } catch {}
  if (s.startsWith(':id')) s = s.slice(3);
  if (s.startsWith(':')) s = s.slice(1);
  return s;
};

async function tryJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  dlog('HTTP', res.status, url, 'preview:', text.slice(0, 320));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function coerceItemsFromPayload(payload: any, slugOrId: string): CollectionItem[] {
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload)) return payload;

  const html = payload?.web_url || payload?.html_url;
  if (html) {
    return [
      {
        id: payload?.id ?? slugOrId,
        slug: payload?.slug ?? slugOrId,
        title: payload?.title || payload?.name || 'Untitled Book',
        kind: 'text', // not 'pdf' -> we’ll render as HTML
        web_url: html,
        cover_url: payload?.cover_url || null,
        provider: payload?.provider || payload?.origin || 'OER',
        pages: payload?.pages,
      },
    ];
  }

  // (optional) fallback if some legacy rows only have pdf_url – you can drop this if you never store PDFs anymore
  const file = payload?.file_url || payload?.pdf_url || payload?.source_url || payload?.url || '';
  if (file) {
    return [
      {
        id: payload?.id ?? slugOrId,
        slug: payload?.slug ?? slugOrId,
        title: payload?.title || payload?.name || 'Untitled Book',
        kind: 'text',
        web_url: file, // try to open even if it’s a PDF URL (OpenStax will redirect to HTML in many cases)
        cover_url: payload?.cover_url || null,
        provider: payload?.provider || payload?.origin || 'OER',
      },
    ];
  }

  if (payload?.data && Array.isArray(payload.data.items)) return payload.data.items;
  return [];
}

/* -------------------------------------------------------------------------- */
/* Page */
/* -------------------------------------------------------------------------- */
const OerCollectionReader: React.FC = () => {
  const params = useParams<{ id?: string }>();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const id = sanitizeId(rawId);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { backendUrl, token } = useShopContext();
  const { wrapBook } = useWrapOerBook();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [items, setItems] = useState<CollectionItem[]>([]);

  const initialIndexParam = searchParams.get('item');
  const [activeIndex, setActiveIndex] = useState<number>(
    initialIndexParam ? Number(initialIndexParam) : 0
  );

  const [pdfPage, setPdfPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.1);
  const [spread, setSpread] = useState(false); // two-page
  const [darkPaper, setDarkPaper] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [htmlZoom, setHtmlZoom] = useState(1); // 0.5x .. 2.5x
  const htmlViewportRef = useRef<HTMLDivElement | null>(null);
  const [showHtmlTip, setShowHtmlTip] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [forceIframe, setForceIframe] = useState(false);

  // Mobile drawers
  const [mobileTOCOpen, setMobileTOCOpen] = useState(false);
  const [mobileNotesOpen, setMobileNotesOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Active item first
  const activeItem = items[activeIndex];

  // Must be above any effects/handlers that reference them
  const activeItemKey = useMemo(
    () => String(activeItem?.id ?? activeItem?.slug ?? activeIndex),
    [activeItem, activeIndex]
  );

  // Compute early so `isHtml` can be derived before handlers/effects
  const reactPlayerUrl = useMemo(() => getPlayableUrl(activeItem), [activeItem]);

  // Kind detection (used by wheel/tip handlers)
  const guessedKind = activeItem ? normalizeKind(activeItem) : undefined;
  const isVideo = !!reactPlayerUrl && isProbablyVideoUrl(reactPlayerUrl);
  const isHtml = !!activeItem?.web_url && !isVideo;

  // Ctrl + wheel to zoom HTML pages
  const onHtmlWheelZoom = useCallback(
    (e: WheelEvent) => {
      if (!isHtml) return;
      if (e.ctrlKey) {
        e.preventDefault();
        setHtmlZoom((z) => Math.min(2.5, Math.max(0.5, +(z - e.deltaY * 0.0015).toFixed(2))));
      }
    },
    [isHtml]
  );

  useEffect(() => {
    const el = htmlViewportRef.current;
    if (!el) return;
    const handler = (ev: any) => onHtmlWheelZoom(ev as WheelEvent);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [onHtmlWheelZoom]);

  useEffect(() => {
    if (!isHtml) return;
    setShowHtmlTip(true);
    const t = setTimeout(() => setShowHtmlTip(false), 4000);
    return () => clearTimeout(t);
  }, [isHtml, activeItemKey]);

  const highlightsKey = useMemo(
    () => lsKey(id || 'x', `item.${activeItemKey}.highlights`),
    [id, activeItemKey]
  );

  // --- PDF doc + outline + highlights ---
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [outline, setOutline] = useState<any[]>([]);

  // highlights are stored per-page as normalized rects (0..1)
  type HL = { id: string; x: number; y: number; w: number; h: number };
  const [highlights, setHighlights] = useState<Record<number, HL[]>>({});

  // load/save highlights to localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(highlightsKey);
      setHighlights(raw ? JSON.parse(raw) : {});
    } catch {
      setHighlights({});
    }
  }, [highlightsKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(highlightsKey, JSON.stringify(highlights));
    }, 200);
    return () => clearTimeout(t);
  }, [highlights, highlightsKey]);

  useEffect(() => {
    const el = htmlViewportRef.current;
    if (!el) return;
    const handler = (ev: any) => onHtmlWheelZoom(ev as WheelEvent);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [onHtmlWheelZoom]);

  // CREATE HIGHLIGHTS on Alt/Option + mouseup (so normal selection remains for copy)
  const onMouseUpPage = useCallback(
    (pageNo: number) => (e: React.MouseEvent<HTMLDivElement>) => {
      if (!(e.altKey || e.ctrlKey || e.metaKey)) return;

      const sel = window.getSelection?.();
      if (!sel || sel.isCollapsed) return;

      const range = sel.getRangeAt(0);
      const rects = Array.from(range.getClientRects());
      if (!rects.length) return;

      const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect();

      const toStore: HL[] = rects.map((r) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: (r.left - bounds.left) / bounds.width,
        y: (r.top - bounds.top) / bounds.height,
        w: r.width / bounds.width,
        h: r.height / bounds.height,
      }));

      setHighlights((prev) => ({
        ...prev,
        [pageNo]: [...(prev[pageNo] || []), ...toStore],
      }));
    },
    []
  );

  // selection detector to show "Copy selection" button
  const [hasSelection, setHasSelection] = useState(false);
  useEffect(() => {
    const onSel = () => setHasSelection(Boolean(window.getSelection()?.toString()));
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);
  const copySelection = useCallback(() => {
    const t = window.getSelection()?.toString();
    if (t) navigator.clipboard?.writeText(t);
  }, []);

  useEffect(() => {
    dlog('mount', { id, backendUrl });
    return () => {
      dlog('unmount');
    };
  }, [id, backendUrl]);

  /* Fetch items (with resilient fallbacks) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const base = (backendUrl || '').replace(/\/+$/, '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const candidates = [
          `${base}/api/oer/collections/${encodeURIComponent(id)}/items`,
          `${base}/api/oer/collections/by-slug/${encodeURIComponent(id)}/items`,
          `${base}/api/oer/books/${encodeURIComponent(id)}`,
          `${base}/api/oer/books/by-slug/${encodeURIComponent(id)}`,
          `${base}/api/oer/items?collection=${encodeURIComponent(id)}`,
          `${base}/oer/collections/${encodeURIComponent(id)}/items`,
        ];

        let found: CollectionItem[] = [];
        for (const url of candidates) {
          try {
            dlog('fetching items', url);
            const payload = await tryJson(url, headers);
            const coerced = coerceItemsFromPayload(payload, id);
            if (Array.isArray(coerced) && coerced.length > 0) {
              found = coerced;
              break;
            }
          } catch {
            // continue to next candidate
          }
        }

        if (!cancelled) {
          if (found.length === 0) {
            setItems([]);
            setError('No items found for this collection/book.');
          } else {
            setItems(found);
          }
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load collection');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true; // NOTE: do not `return (cancelled = true)` which returns boolean
    };
  }, [backendUrl, id, token]);

  /* Restore per-item page from localStorage */
  useEffect(() => {
    if (!items.length) return;
    const idx = Math.min(Math.max(activeIndex, 0), items.length - 1);
    const it = items[idx];
    const key = lsKey(id || 'x', `item.${String(it.id ?? it.slug ?? idx)}.page`);
    const saved = Number(localStorage.getItem(key) || '1');
    setPdfPage(Number.isFinite(saved) && saved > 0 ? saved : 1);
  }, [items, activeIndex, id]);

  /* Persist URL param for deep-linking */
  useEffect(() => {
    if (!items.length) return;
    const idx = Math.min(Math.max(activeIndex, 0), items.length - 1);
    const itemValue = String(idx);
    if (searchParams.get('item') === itemValue) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('item', itemValue);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [activeIndex, items.length, pathname, router, searchParams]);

  // Compute URLs

  const iframeSrc = useMemo(
    () =>
      toYouTubeIframeSrc(
        reactPlayerUrl ||
          activeItem?.embed_url ||
          activeItem?.source_url ||
          (activeItem as any)?.url ||
          ''
      ),
    [reactPlayerUrl, activeItem]
  );
  const externalUrl = useMemo(
    () =>
      activeItem
        ? activeItem.source_url || toYouTubeWatch(activeItem.embed_url) || getVideoUrl(activeItem)
        : '',
    [activeItem]
  );

  // PDF file + headers
  const pdfFile = useMemo(
    () => (activeItem ? { url: getPdfUrl(activeItem) } : undefined),
    [activeItem]
  );
  const pdfOptions = useMemo(
    () => (token ? { httpHeaders: { Authorization: `Bearer ${token}` } } : undefined),
    [token]
  );

  // ✅ Add this block:
  const isPdf = useMemo(() => {
    if (!activeItem) return false;
    if (guessedKind === 'pdf') return true;

    // fallbacks based on url or mime-type
    const url = getPdfUrl(activeItem) || activeItem.source_url || (activeItem as any).url || '';
    const mime = (activeItem as any).mime_type || (activeItem as any).content_type || '';

    return isProbablyPdfUrl(url) || String(mime).toLowerCase().includes('application/pdf');
  }, [activeItem, guessedKind]);

  // Used by "Learn with RobotTeacher"
  const canRobot = isPdf && Boolean(activeItem?.slug || activeItem?.id);

  // Reset on item change
  useEffect(() => {
    setPlayerError(null);
    setPlayerReady(false);
    setForceIframe(false);
  }, [activeItem, reactPlayerUrl]);

  // Watchdog: if react-player never becomes ready, fallback to iframe
  useEffect(() => {
    if (!isVideo) return;
    const t = setTimeout(() => {
      if (!playerReady) setForceIframe(true);
    }, 3500);
    return () => clearTimeout(t);
  }, [isVideo, playerReady, reactPlayerUrl]);

  /* PDF load (outline) */
  const onDocumentLoad = useCallback(async (doc: any) => {
    setNumPages(doc.numPages);
    setPdfDoc(doc);
    try {
      const o = await doc.getOutline();
      setOutline(o || []);
    } catch {
      setOutline([]);
    }
  }, []);

  const goToOutlineItem = useCallback(
    async (item: any) => {
      if (!pdfDoc) return;

      try {
        let dest = item?.dest;
        if (!dest && item?.url) {
          window.open(item.url, '_blank');
          return;
        }
        if (typeof dest === 'string') {
          dest = await pdfDoc.getDestination(dest);
        }
        if (Array.isArray(dest)) {
          const [refOrNum] = dest;
          const pageIndex =
            typeof refOrNum === 'object'
              ? await pdfDoc.getPageIndex(refOrNum)
              : (refOrNum as number);
          goToPage((pageIndex | 0) + 1);
        }
      } catch (e) {
        dlog('outline nav error', e, item);
      }
    },
    [pdfDoc]
  );

  const goPrevItem = useCallback(() => setActiveIndex((i) => Math.max(0, i - 1)), []);
  const goNextItem = useCallback(
    () => setActiveIndex((i) => Math.min(items.length - 1, i + 1)),
    [items.length]
  );

  const zoomIn = () => setScale((s) => Math.min(3, +(s + 0.15).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)));

  const goToPage = (p: number) =>
    setPdfPage((_) => {
      const next = Math.max(1, Math.min(numPages || 1, p));
      if (activeItem) {
        const key = lsKey(
          id || 'x',
          `item.${String(activeItem.id ?? activeItem.slug ?? activeIndex)}.page`
        );
        localStorage.setItem(key, String(next));
      }
      return next;
    });

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === '+') {
        isHtml ? setHtmlZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2))) : zoomIn();
      } else if (e.key === '-') {
        isHtml ? setHtmlZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2))) : zoomOut();
      } else if (e.key === 'ArrowRight') goToPage(pdfPage + 1);
      else if (e.key === 'ArrowLeft') goToPage(pdfPage - 1);
      else if (e.key.toLowerCase() === 'f') setSpread((s) => !s);
    },
    [pdfPage, numPages]
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e) {
      dlog('fullscreen error', e);
    }
  };

  const openRobotTeacher = async () => {
    if (!canRobot) return;
    try {
      const idOrSlug = String(activeItem!.slug ?? activeItem!.id);
      const { courseId } = await wrapBook(idOrSlug);
      router.push(`/progress/${courseId}`);
    } catch (e: any) {
      alert(e?.message || 'Failed to start guided reading');
    }
  };

  // Overlay zoom: when not fullscreen and zoomed beyond threshold, float the book over side panels
  const zoomOverlayActive = isPdf && !isFullscreen && scale > 1.1;

  /* Render */
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0a0f15] text-[#0d141c] dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/70 dark:bg-[#0a0f15]/70 border-b border-slate-200/70 dark:border-white/10">
        <div className="mx-auto max-w-[1400px] px-3 sm:px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-2 h-9 hover:bg-slate-100/80 dark:hover:bg-white/10"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {/* Mobile toggles */}
          <div className="flex md:hidden items-center gap-2 ml-1">
            <button
              onClick={() => setMobileTOCOpen(true)}
              className="h-9 w-9 rounded-xl ring-1 ring-slate-200/80 dark:ring-white/15 bg-white dark:bg-white/5 flex items-center justify-center"
              title="Playlist"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobileNotesOpen(true)}
              className="h-9 w-9 rounded-xl ring-1 ring-slate-200/80 dark:ring-white/15 bg-white dark:bg-white/5 flex items-center justify-center"
              title="Notes"
            >
              <Bookmark className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => setDarkPaper((s) => !s)}
              className="h-9 px-3 rounded-xl ring-1 ring-slate-200/80 dark:ring-white/15 bg-white dark:bg-white/5 font-semibold text-xs flex items-center gap-2"
            >
              {darkPaper ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {darkPaper ? 'Light Page' : 'Dark Page'}
            </button>
            {isPdf && (activeItem?.slug || activeItem?.id) && (
              <button
                onClick={openRobotTeacher}
                className="h-9 px-3 rounded-xl bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
              >
                Learn with RobotTeacher
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 mx-auto w-full max-w-[1400px] grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)_340px] gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-4">
        {/* Left: Playlist / TOC */}
        <aside
          className={cx(
            'rounded-2xl ring-1 ring-slate-200/80 dark:ring-white/10 bg-white dark:bg-[#0f1821] overflow-hidden flex-col',
            'hidden md:flex'
          )}
        >
          <div className="p-2 flex items-center gap-2 border-b border-slate-200/70 dark:border-white/10">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              placeholder="Search title..."
              className="flex-1 bg-transparent text-sm outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-auto">
            {loading && (
              <div className="p-4 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            )}
            {error && !loading && <div className="p-4 text-sm text-red-600">{error}</div>}

            {/* If single PDF, show PDF Outline. Else, items list. */}
            {!loading && !error && isPdf && outline.length > 0 ? (
              <OutlineList items={outline} onClick={goToOutlineItem} filter={searchQuery} />
            ) : (
              !loading &&
              !error &&
              items
                .map((it, idx) => ({ it, idx }))
                .filter(({ it }) =>
                  searchQuery
                    ? String(it.title || '')
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                    : true
                )
                .map(({ it, idx }) => {
                  const k = normalizeKind(it);
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={itemKey(it, idx)}
                      onClick={() => setActiveIndex(idx)}
                      className={cx(
                        'w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50/80 dark:hover:bg-white/5 border-b border-slate-200/60 dark:border-white/5',
                        active && 'bg-[#e7edf4] dark:bg-white/10'
                      )}
                      title={it.title}
                    >
                      {k === 'video' ? (
                        <Video className="w-4 h-4" />
                      ) : (
                        <BookOpenText className="w-4 h-4" />
                      )}
                      <span className="text-sm line-clamp-2">{it.title}</span>
                    </button>
                  );
                })
            )}
          </div>

          <div className="p-2 flex items-center justify-between text-xs text-slate-500">
            <span>
              {isPdf && outline.length > 0 ? `${outline.length} headings` : `${items.length} items`}
            </span>
            <span className="inline-flex items-center gap-1 px-2 h-8 rounded-lg ring-1 ring-slate-200/80 dark:ring-white/10">
              <PanelLeft className="w-4 h-4" /> TOC
            </span>
          </div>
        </aside>

        {/* Center: Viewer */}
        <section
          ref={containerRef}
          className={cx(
            'relative rounded-2xl ring-1 ring-slate-200/80 dark:ring-white/10 bg-white dark:bg-[#0f1821] overflow-hidden flex flex-col min-w-0'
          )}
        >
          {/* Toolbar */}
          <div className="px-2 sm:px-3 py-2 border-b border-slate-200/70 dark:border-white/10 flex items-center gap-2">
            <button
              className="hidden md:inline-flex h-9 px-3 rounded-xl ring-1 ring-slate-200/80 dark:ring-white/10 hover:bg-slate-50/70 dark:hover:bg-white/5"
              onClick={() => {}}
              title="Outline"
            >
              <PanelRight className="w-4 h-4" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{activeItem?.title || '—'}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {activeItem?.provider || (isPdf ? 'PDF' : isVideo ? 'Video' : 'Item')}
              </div>
            </div>

            {/* PDF controls */}
            {isPdf && (
              <div className="hidden sm:flex items-center gap-2">
                <button
                  className="h-9 w-9 rounded-lg hover:bg-slate-100/80 dark:hover:bg-white/10 flex items-center justify-center"
                  onClick={zoomOut}
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
                <button
                  className="h-9 w-9 rounded-lg hover:bg-slate-100/80 dark:hover:bg-white/10 flex items-center justify-center"
                  onClick={zoomIn}
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <div className="mx-2 inline-flex items-center gap-2">
                  <button
                    className="h-9 w-9 rounded-lg hover:bg-slate-100/80 dark:hover:bg-white/10 flex items-center justify-center"
                    onClick={() => goToPage(pdfPage - 1)}
                    disabled={!numPages || pdfPage <= 1}
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={numPages || undefined}
                    className="h-9 w-20 text-sm text-center rounded-lg bg-slate-50 dark:bg-white/5 ring-1 ring-slate-200/80 dark:ring-white/10"
                    value={String(pdfPage)}
                    onChange={(e) => goToPage(Number(e.target.value || '1'))}
                  />
                  <span className="text-xs">/ {numPages ?? '—'}</span>
                  <button
                    className="h-9 w-9 rounded-lg hover:bg-slate-100/80 dark:hover:bg-white/10 flex items-center justify-center"
                    onClick={() => goToPage(pdfPage + 1)}
                    disabled={!numPages || (numPages ? pdfPage >= numPages : true)}
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  className={cx(
                    'h-9 px-3 rounded-lg text-xs font-semibold ring-1 ring-slate-200/80 dark:ring-white/10',
                    spread ? 'bg-slate-100/80 dark:bg-white/10' : 'bg-transparent'
                  )}
                  onClick={() => setSpread((s) => !s)}
                  title="Toggle two-page view (F)"
                >
                  Two-page
                </button>

                <button
                  className="h-9 w-9 rounded-lg hover:bg-slate-100/80 dark:hover:bg-white/10 flex items-center justify-center"
                  onClick={toggleFullscreen}
                  title="Fullscreen"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>

                {hasSelection && (
                  <button
                    onClick={copySelection}
                    className="ml-1 h-9 px-3 rounded-lg text-xs font-semibold bg-[#e8f1ff] dark:bg-[#132033] text-[#0a56c2] dark:text-[#8cb4ff] inline-flex items-center gap-2"
                    title="Copy selected text"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy selection
                  </button>
                )}
              </div>
            )}

            {isHtml && (
              <div className="flex-1 min-h-0 flex flex-col">
                {/* Hero header (unchanged) */}
                <div className="px-3 sm:px-6 py-4 sm:py-6 w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
                  <div className="max-w-[1100px] mx-auto flex items-center gap-4 sm:gap-6">
                    <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-lg overflow-hidden ring-1 ring-white/20 bg-white/5 flex-shrink-0">
                      {activeItem?.cover_url ? (
                        <img
                          src={activeItem.cover_url}
                          alt="Cover"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-xs opacity-80">
                          {String(activeItem?.title || 'Book')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm uppercase tracking-wide text-white/70">
                        Free OER course
                      </div>
                      <h1 className="text-base sm:text-xl font-semibold truncate">
                        {activeItem?.title || '—'}
                      </h1>
                      <div className="text-[12px] sm:text-xs text-white/70">
                        {activeItem?.provider || 'OpenStax'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Zoomable viewport */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <div
                    ref={htmlViewportRef}
                    className="relative h-full w-full overflow-auto"
                    onMouseEnter={() => setShowHtmlTip(true)}
                  >
                    {/* tooltip */}
                    <AnimatePresence>
                      {showHtmlTip && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="pointer-events-none absolute right-3 top-3 z-10"
                        >
                          <div className="rounded-lg bg-black/70 text-white text-xs px-3 py-2 shadow">
                            Hold{' '}
                            <kbd className="px-1.5 py-0.5 rounded border border-white/20 bg-white/10">
                              Ctrl
                            </kbd>{' '}
                            + mouse wheel to zoom
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* scaled content */}
                    <div
                      style={{
                        transform: `scale(${htmlZoom})`,
                        transformOrigin: '0 0',
                        width: `${100 / htmlZoom}%`,
                        height: `${100 / htmlZoom}%`,
                      }}
                    >
                      <iframe
                        key={activeItem!.web_url}
                        src={activeItem!.web_url!}
                        className="w-full h-full block"
                        style={{ border: 0 }}
                        referrerPolicy="strict-origin-when-cross-origin"
                        allow="clipboard-write"
                        title={activeItem?.title || 'OpenStax Book'}
                        onError={() =>
                          window.open(activeItem!.web_url!, '_blank', 'noopener,noreferrer')
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Canvas */}
          <div
            className={cx(
              'flex-1',
              isHtml
                ? 'overflow-hidden flex flex-col'
                : 'overflow-auto flex items-center justify-center',
              darkPaper ? 'bg-[#0e1722]' : 'bg-slate-100'
            )}
          >
            {/* Video */}
            {isVideo && (
              <div className="w-full max-w-[1100px] aspect-video rounded-xl overflow-hidden shadow-lg ring-1 ring-slate-200/60 dark:ring-white/10">
                {!forceIframe && reactPlayerUrl && !playerError ? (
                  <Suspense
                    fallback={
                      <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
                        Loading player...
                      </div>
                    }
                  >
                    <Player
                      key={reactPlayerUrl}
                      url={reactPlayerUrl}
                      width="100%"
                      height="100%"
                      controls
                      onReady={() => {
                        setPlayerReady(true);
                      }}
                      onError={() => {
                        setPlayerError('blocked');
                        setForceIframe(true);
                      }}
                      config={{
                        youtube: {
                          playerVars: {
                            modestbranding: 1,
                            playsinline: 1,
                            rel: 0,
                            origin:
                              typeof window !== 'undefined' ? window.location.origin : undefined,
                          },
                        },
                      }}
                    />
                  </Suspense>
                ) : iframeSrc ? (
                  <iframe
                    key={iframeSrc}
                    src={iframeSrc}
                    width="100%"
                    height="100%"
                    onLoad={() => dlog('iframe onLoad', iframeSrc)}
                    onError={(e) => dlog('iframe onError', e, iframeSrc)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    style={{ border: 0, display: 'block' }}
                    title={activeItem?.title || 'YouTube Video'}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4 text-sm text-slate-300 text-center">
                    This video can't be embedded here.
                    {externalUrl && (
                      <a
                        className="ml-2 underline text-white"
                        href={externalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open on YouTube
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* HTML (OpenStax View Online) */}
            {isHtml && (
              <div className="flex-1 min-h-0 flex flex-col">
                {/* Hero header */}
                <div className="px-3 sm:px-6 py-4 sm:py-6 w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
                  <div className="max-w-[1100px] mx-auto flex items-center gap-4 sm:gap-6">
                    <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-lg overflow-hidden ring-1 ring-white/20 bg-white/5 flex-shrink-0">
                      {activeItem?.cover_url ? (
                        <img
                          src={activeItem.cover_url}
                          alt="Cover"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-xs opacity-80">
                          {String(activeItem?.title || 'Book')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm uppercase tracking-wide text-white/70">
                        Free OER course
                      </div>
                      <h1 className="text-base sm:text-xl font-semibold truncate">
                        {activeItem?.title || '—'}
                      </h1>
                      <div className="text-[12px] sm:text-xs text-white/70">
                        {activeItem?.provider || 'OpenStax'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Zoomable viewport */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <div ref={htmlViewportRef} className="h-full w-full overflow-auto">
                    <div
                      style={{
                        transform: `scale(${htmlZoom})`,
                        transformOrigin: '0 0',
                        width: `${100 / htmlZoom}%`,
                        height: `${100 / htmlZoom}%`,
                      }}
                    >
                      <iframe
                        key={activeItem!.web_url}
                        src={activeItem!.web_url!}
                        className="w-full h-full block"
                        style={{ border: 0 }}
                        referrerPolicy="strict-origin-when-cross-origin"
                        allow="clipboard-write"
                        title={activeItem?.title || 'OpenStax Book'}
                        onError={() =>
                          window.open(activeItem!.web_url!, '_blank', 'noopener,noreferrer')
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fallback */}
            {!isPdf && !isVideo && (
              <div className="p-6 text-center text-sm text-slate-500">
                <p>Item type not recognized. You can open the source link:</p>
                {activeItem?.source_url && (
                  <a
                    className="underline"
                    href={activeItem.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open source
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Floating overlay when zoomed-in and not fullscreen — keeps the book above side panels */}
          <AnimatePresence>
            {zoomOverlayActive && (
              <motion.div
                className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setScale(1.1); // click backdrop to close overlay (reset a bit)
                }}
              >
                <div className="m-auto max-h-[92vh] max-w-[92vw] overflow-auto rounded-xl ring-1 ring-white/15 bg-[#0b1117] p-4 pointer-events-auto">
                  <Document
                    file={pdfFile}
                    options={pdfOptions}
                    loading={
                      <div className="text-sm text-slate-300 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading PDF...
                      </div>
                    }
                    onLoadSuccess={onDocumentLoad}
                    onLoadError={(e) => console.error('PDF error', e)}
                    className={cx(
                      'transition-colors duration-200',
                      darkPaper ? '[&_.react-pdf__Page__canvas]:!bg-[#0f1621]' : '',
                      'select-text'
                    )}
                  >
                    <div
                      className={cx(
                        'flex items-start justify-center',
                        spread ? 'flex-row gap-4 sm:gap-6' : 'flex-col gap-4 sm:gap-6'
                      )}
                    >
                      <div className="relative">
                        <Page
                          pageNumber={pdfPage}
                          scale={scale}
                          renderTextLayer
                          renderAnnotationLayer
                          className="select-text"
                        />
                      </div>
                      {spread && pdfPage + 1 <= (numPages || 0) && (
                        <div className="relative">
                          <Page
                            pageNumber={pdfPage + 1}
                            scale={scale}
                            renderTextLayer
                            renderAnnotationLayer
                            className="select-text"
                          />
                        </div>
                      )}
                    </div>
                  </Document>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom nav */}
          <div className="px-3 py-2 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between">
            <button
              onClick={goPrevItem}
              disabled={activeIndex <= 0}
              className="h-9 px-3 rounded-lg text-xs sm:text-[13px] font-semibold ring-1 ring-slate-200/80 dark:ring-white/10 disabled:opacity-50"
            >
              ‹ Previous
            </button>
            <div className="text-xs text-slate-500">
              {activeIndex + 1} / {items.length}
            </div>
            <button
              onClick={goNextItem}
              disabled={activeIndex >= items.length - 1}
              className="h-9 px-3 rounded-lg text-xs sm:text-[13px] font-semibold ring-1 ring-slate-200/80 dark:ring-white/10 disabled:opacity-50"
            >
              Next ›
            </button>
          </div>
        </section>

        {/* Right: Notes / Actions */}
        <aside
          className={cx(
            'rounded-2xl ring-1 ring-slate-200/80 dark:ring-white/10 bg-white dark:bg-[#0f1821] overflow-hidden flex-col',
            'hidden lg:flex'
          )}
        >
          <div className="p-3 border-b border-slate-200/70 dark:border-white/10 flex items-center justify-between">
            <div className="text-sm font-semibold">Notes & Highlights</div>
            <span className="inline-flex items-center gap-1 px-2 h-8 rounded-lg ring-1 ring-slate-200/80 dark:ring-white/10">
              <Bookmark className="w-4 h-4" /> Notes
            </span>
          </div>

          <div className="p-3 flex flex-wrap gap-2">
            {isPdf && (activeItem?.slug || activeItem?.id) && (
              <button
                onClick={openRobotTeacher}
                className="h-9 px-3 rounded-xl bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
              >
                Learn with RobotTeacher
              </button>
            )}
            {activeItem?.source_url && (
              <a
                href={activeItem.source_url}
                target="_blank"
                rel="noreferrer"
                className="h-9 px-3 rounded-xl ring-1 ring-slate-200/80 dark:ring-white/10 text-xs font-semibold flex items-center gap-2"
                title="Open source"
              >
                <Share2 className="w-4 h-4" /> Source
              </a>
            )}
          </div>

          <NotesArea
            key={`notes-${id}-${String(activeItem?.id ?? activeItem?.slug ?? activeIndex)}`}
            collectionId={id || 'x'}
            itemId={String(activeItem?.id ?? activeItem?.slug ?? activeIndex)}
          />
        </aside>
      </div>

      {/* Mobile sticky actions */}
      <div className="md:hidden sticky bottom-3 z-30 px-3">
        <div className="mx-auto max-w-[700px] bg-white/90 dark:bg-[#0f1821]/90 backdrop-blur rounded-2xl ring-1 ring-slate-200/80 dark:ring-white/10 shadow-xl p-2 flex items-center justify-between">
          <button
            className="h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-slate-200/80 dark:ring-white/10"
            onClick={() => setMobileTOCOpen(true)}
            title="Playlist"
          >
            <PanelRight className="w-4 h-4" />
          </button>

          {isPdf && (
            <div className="flex items-center gap-1">
              <button
                className="h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-slate-200/80 dark:ring-white/10"
                onClick={() => goToPage(pdfPage - 1)}
                disabled={pdfPage <= 1}
              >
                ‹
              </button>
              <div className="px-2 text-sm">
                {pdfPage} / {numPages ?? '—'}
              </div>
              <button
                className="h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-slate-200/80 dark:ring-white/10"
                onClick={() => goToPage(pdfPage + 1)}
                disabled={!!numPages && pdfPage >= (numPages || 1)}
              >
                ›
              </button>
            </div>
          )}

          {isHtml && (
            <div className="flex items-center gap-2">
              <button
                className="h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-slate-200/80 dark:ring-white/10"
                onClick={() => setHtmlZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
                aria-label="Zoom out"
              >
                −
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={htmlZoom}
                  onChange={(e) => setHtmlZoom(Number(e.target.value))}
                  className="w-36"
                />
                <span className="text-xs w-10 text-right">{Math.round(htmlZoom * 100)}%</span>
              </div>
              <button
                className="h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-slate-200/80 dark:ring-white/10"
                onClick={() => setHtmlZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              className="h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-slate-200/80 dark:ring-white/10"
              onClick={() => setMobileNotesOpen(true)}
              title="Notes"
            >
              <Bookmark className="w-5 h-5" />
            </button>
            <button
              className="h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-slate-200/80 dark:ring-white/10"
              onClick={toggleFullscreen}
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawers */}
      <AnimatePresence>
        {mobileTOCOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileTOCOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 bottom-0 z-50 bg-white dark:bg-[#0f1821] w-[88vw] max-w-[320px] shadow-2xl ring-1 ring-slate-200/80 dark:ring-white/10 flex flex-col"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              role="dialog"
              aria-modal="true"
            >
              <div className="p-3 border-b border-slate-200/70 dark:border-white/10 flex items-center gap-2">
                <PanelLeft className="w-4 h-4" />
                <div className="text-sm font-semibold">Playlist</div>
                <div className="flex-1" />
                <button
                  className="h-8 px-3 rounded-lg ring-1 ring-slate-200/80 dark:ring-white/10 text-xs"
                  onClick={() => setMobileTOCOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="p-2 flex items-center gap-2 border-b border-slate-200/70 dark:border-white/10">
                <Search className="w-4 h-4 text-slate-500" />
                <input
                  placeholder="Search title..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex-1 overflow-auto">
                {items
                  .map((it, idx) => ({ it, idx }))
                  .filter(({ it }) =>
                    searchQuery
                      ? String(it.title || '')
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase())
                      : true
                  )
                  .map(({ it, idx }) => {
                    const k = normalizeKind(it);
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={itemKey(it, idx)}
                        onClick={() => {
                          setActiveIndex(idx);
                          setMobileTOCOpen(false);
                        }}
                        className={cx(
                          'w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50/80 dark:hover:bg-white/5 border-b border-slate-200/60 dark:border-white/5',
                          active && 'bg-[#e7edf4] dark:bg-white/10'
                        )}
                        title={it.title}
                      >
                        {k === 'video' ? (
                          <Video className="w-4 h-4" />
                        ) : (
                          <BookOpenText className="w-4 h-4" />
                        )}
                        <span className="text-sm line-clamp-2">{it.title}</span>
                      </button>
                    );
                  })}
              </div>
            </motion.aside>
          </>
        )}

        {mobileNotesOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNotesOpen(false)}
            />
            <motion.aside
              className="fixed right-0 top-0 bottom-0 z-50 bg-white dark:bg-[#0f1821] w-[88vw] max-w-[360px] shadow-2xl ring-1 ring-slate-200/80 dark:ring-white/10 flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              role="dialog"
              aria-modal="true"
            >
              <div className="p-3 border-b border-slate-200/70 dark:border-white/10 flex items-center gap-2">
                <Bookmark className="w-4 h-4" />
                <div className="text-sm font-semibold">Notes & Highlights</div>
                <div className="flex-1" />
                <button
                  className="h-8 px-3 rounded-lg ring-1 ring-slate-200/80 dark:ring-white/10 text-xs"
                  onClick={() => setMobileNotesOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="p-3 flex flex-wrap gap-2">
                {isPdf && (activeItem?.slug || activeItem?.id) && (
                  <button
                    onClick={() => {
                      setMobileNotesOpen(false);
                      void openRobotTeacher();
                    }}
                    className="h-9 px-3 rounded-xl bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
                  >
                    Learn with RobotTeacher
                  </button>
                )}
                {activeItem?.source_url && (
                  <a
                    href={activeItem.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 px-3 rounded-xl ring-1 ring-slate-200/80 dark:ring-white/10 text-xs font-semibold flex items-center gap-2"
                    title="Open source"
                  >
                    <Share2 className="w-4 h-4" /> Source
                  </a>
                )}
              </div>

              <NotesArea
                key={`notes-m-${id}-${String(activeItem?.id ?? activeItem?.slug ?? activeIndex)}`}
                collectionId={id || 'x'}
                itemId={String(activeItem?.id ?? activeItem?.slug ?? activeIndex)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const OutlineList: React.FC<{
  items: any[];
  level?: number;
  onClick: (item: any) => void;
  filter: string;
}> = ({ items, level = 0, onClick, filter }) => {
  if (!items?.length) return null;

  return (
    <ul className={cx(level ? 'pl-3 border-l border-slate-200/60 dark:border-white/10' : '')}>
      {items.map((it, i) => {
        const title = String(it.title || '').trim();
        const showSelf = !filter || title.toLowerCase().includes(filter.toLowerCase());
        const children = it.items || [];
        if (!showSelf && filter && !children.length) return null;

        return (
          <li key={`${level}-${i}`}>
            <button
              className={cx(
                'w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50/80 dark:hover:bg-white/5 truncate'
              )}
              title={title || '(Untitled)'}
              onClick={() => onClick(it)}
            >
              {title || '(Untitled)'}
            </button>
            {!!children.length && (
              <OutlineList items={children} level={level + 1} onClick={onClick} filter={filter} />
            )}
          </li>
        );
      })}
    </ul>
  );
};

/* -------------------------------------------------------------------------- */
/* Notes widget (localStorage-backed) */
/* -------------------------------------------------------------------------- */
const NotesArea: React.FC<{ collectionId: string | number; itemId: string }> = ({
  collectionId,
  itemId,
}) => {
  const key = lsKey(collectionId, `item.${itemId}.notes`);
  const [text, setText] = useState<string>('');

  useEffect(() => {
    setText(localStorage.getItem(key) || '');
  }, [key]);

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(key, text), 250);
    return () => clearTimeout(t);
  }, [key, text]);

  return (
    <div className="p-3 flex-1 flex flex-col gap-2">
      <div className="text-xs text-slate-500">
        Your notes are saved automatically on this device.
      </div>
      <textarea
        className="flex-1 min-h-[220px] rounded-xl p-3 bg-slate-50 dark:bg-white/5 ring-1 ring-slate-200/80 dark:ring-white/10 text-sm"
        placeholder="Type notes, highlights, or questions..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="inline-flex items-center gap-1">
          <Bookmark className="w-4 h-4" /> Local only
        </div>
        <div>{text.length} / 4000</div>
      </div>
    </div>
  );
};

export default OerCollectionReader;

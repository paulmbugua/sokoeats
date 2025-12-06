// LessonOverlay.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/* ─────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────── */
type Word = { text: string; start: number; end: number };

type Formula = {
  id: string;
  latex: string;
  title?: string;
  speakAs?: 'math' | 'spell-out' | 'characters' | 'none';
  variables?: { symbol: string; meaning: string }[];
  announceAtSentence?: number; // 1-based
};

type Table = {
  id?: string;
  title: string;
  columns: string[];
  rows: (string | number | boolean)[][];
  caption?: string;
  announceAtSentence?: number; // 1-based
};

type ImageItem = {
  id: string;
  title?: string;
  alt?: string;
  url?: string; // can also be data: URL
  caption?: string;
  announceAtSentence?: number;
};

type ChartItem = {
  id: string;
  title?: string;
  kind?: 'bar' | 'line' | 'pie' | 'histogram' | 'scatter' | 'box' | 'heatmap' | 'other';
  alt?: string;
  url?: string; // may be data:image/svg+xml;utf8,<svg...> or https://
  svg?: string; // raw SVG fallback
  caption?: string;
  announceAtSentence?: number;
};

type SnippetItem = {
  id: string;
  title?: string;
  language?: string;
  code: string;
  explanation?: string;
  announceAtSentence?: number;
};

type LessonLike = {
  id: string;
  title?: string;
  markdown?: string;
  formulas?: Formula[];
  tables?: Table[];
  images?: ImageItem[];
  snippets?: SnippetItem[];
  charts?: ChartItem[];
};

export interface LessonOverlayProps {
  words: Word[];
  currentIndex: number;
  lesson?: LessonLike | null;
  topOffset?: number;
  lingerMs?: number;
  defaultPinned?: boolean;
  rememberKey?: string;
  portal?: boolean; // default: true
  zIndex?: number; // default: 10000
  freeMove?: boolean; // default: true
  fullOnMaximize?: boolean; // default: true
  allowMarkdownFallback?: boolean;
}

/* ─────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────── */

type OverlayItem =
  | { kind: 'formula'; at: number; key: string; md: string; title?: string; speakAs?: string }
  | { kind: 'table'; at: number; key: string; md: string; title?: string }
  | { kind: 'image'; at: number; key: string; md: string; title?: string }
  | { kind: 'snippet'; at: number; key: string; md: string; title?: string; language?: string }
  | { kind: 'chart'; at: number; key: string; md: string; title?: string };

const SENTENCE_END = /[.!?…]+["')\]]?$/;

// ─────────────────────────────────────────────────────────
// Lightweight debug logging for overlay
// ─────────────────────────────────────────────────────────
function overlayDebugEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const qs = new URLSearchParams(window.location.search);
    // enable via ?dbgOverlay=1 or ?dbg=1 or localStorage("DBG_OVERLAY" = "1")
    if (qs.has('dbgOverlay') || qs.get('dbg') === '1') return true;
    return localStorage.getItem('DBG_OVERLAY') === '1';
  } catch {
    return false;
  }
}

const olog = (...args: unknown[]) => {
  if (!overlayDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[LessonOverlay]', ...args);
};


function groupSignature(arr: OverlayItem[]): string {
  return arr.map((it) => `${it.key}:${it.md.length}`).sort().join('|');
}

function renderGfmTable(t: {
  title?: string;
  caption?: string;
  columns: string[];
  rows: (string | number | boolean)[][];
}) {
  const head = `| ${t.columns.join(' | ')} |\n| ${t.columns.map(() => '---').join(' | ')} |`;
  const body = (t.rows || [])
    .map((r) => `| ${r.map((x) => String(x)).join(' | ')} |`)
    .join('\n');
  return `\n**${t.title || 'Table'}**${t.caption ? ` — _${t.caption}_` : ''}\n\n${head}\n${body}\n`;
}

/* Kind labels + utility-class accents */
const KIND_LABEL: Record<OverlayItem['kind'], string> = {
  formula: 'Formula',
  table: 'Table',
  image: 'Illustration',
  snippet: 'Code',
  chart: 'Chart',
};

const KIND_CLASSES: Record<OverlayItem['kind'], { ring: string; grad: string }> = {
  formula: { ring: 'ring-accent-formula', grad: 'grad-formula' },
  table: { ring: 'ring-accent-table', grad: 'grad-table' },
  image: { ring: 'ring-accent-image', grad: 'grad-image' },
  snippet: { ring: 'ring-accent-snippet', grad: 'grad-snippet' },
  chart: { ring: 'ring-accent-chart', grad: 'grad-chart' },
};

/* ─────────────────────────────────────────────────────────
   Responsive utils
   ───────────────────────────────────────────────────────── */
function vp() {
  if (typeof window === 'undefined') return { vw: 1280, vh: 720 };
  return { vw: window.innerWidth, vh: window.innerHeight }; // visual viewport
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/* ─────────────────────────────────────────────────────────
   Markdown renderer (theme-aware + readable everything)
   ───────────────────────────────────────────────────────── */
function Markdown({
  children,
  className = '',
  zoom = 1,
  size = 'base', // 'base' | 'lg'
}: {
  children: string;
  className?: string;
  zoom?: number;
  size?: 'base' | 'lg';
}) {
  const katexOptions = { throwOnError: false, strict: false };

  const components = {
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        className="mt-1 mb-2 text-xl font-semibold bg-clip-text text-transparent
                   bg-gradient-to-r from-softPink via-indigo-300 to-softPink"
        {...props}
      />
    ),
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 className="mt-1 mb-1 text-lg font-semibold text-plum dark:text-white" {...props} />
    ),

    // Paragraph: unwrap image-only paragraphs to avoid <div> inside <p>
    // react-markdown "props" includes "node" at runtime. Use any to access it safely.
    p: (props: any) => {
  const { node, children, ...rest } = props;

  const isImageNode = (n: any) => n && n.type === 'image';
  const isLinkWithImage = (n: any) =>
    n && n.type === 'link' && Array.isArray(n.children) && n.children.length === 1 && isImageNode(n.children[0]);

  const kids = node?.children;
  const imgOnly =
    Array.isArray(kids) &&
    kids.length === 1 &&
    (isImageNode(kids[0]) || isLinkWithImage(kids[0]));

  if (imgOnly) {
    // Image-only paragraph → use a block wrapper for styling
    return (
      <div className="not-prose overflow-hidden rounded-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-md bg-white/80 dark:bg-slate-900/80 backdrop-blur my-2">
        {children}
      </div>
    );
  }

  return (
    <p className="leading-relaxed text-slate-700 dark:text-slate-200" {...rest}>
      {children}
    </p>
  );
},
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        className="font-medium underline decoration-2 underline-offset-2 text-indigo-700 dark:text-indigo-300 hover:opacity-90"
        target={props.href?.startsWith('http') ? '_blank' : undefined}
        rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        {...props}
      />
    ),
    blockquote: (props: React.HTMLAttributes<HTMLElement>) => (
      <blockquote
        className="my-2 pl-3 border-l-4 border-indigo-300 dark:border-indigo-500 text-slate-700 dark:text-slate-200 italic"
        {...props}
      />
    ),
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className="my-2 space-y-1 text-slate-700 dark:text-slate-200" {...props} />
    ),
    ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
      <ol className="my-2 space-y-1 text-slate-700 dark:text-slate-200" {...props} />
    ),

    /* Make the wrapper neutral; we style the block via <code> below */
    pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
      <pre className="not-prose m-0 p-0 bg-transparent" {...props} />
    ),

    /* Inline & block code — theme-aware backgrounds + ring */
    code: (
      props: (React.HTMLAttributes<HTMLElement> & { inline?: boolean; className?: string }) & {
        children?: React.ReactNode;
      }
    ) => {
      const { inline, className, children, ...rest } = props;
      if (inline) {
        return (
          <code className={`px-1 py-0.5 rounded bg-zinc-900/5 dark:bg-white/10 ${className || ''}`} {...rest}>
            {children}
          </code>
        );
      }
      return (
        <code
          className={`block p-3 rounded-xl ring-1 ring-black/10 dark:ring-white/10 shadow-sm
                      bg-white/80 dark:bg-slate-900/80 backdrop-blur overflow-x-auto text-[13px] ${className || ''}`}
          {...rest}
        >
          {children}
        </code>
      );
    },

    /* Table already had a good wrapper — keep it */
    table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
      <div className="not-prose overflow-x-auto rounded-2xl ring-1 ring-black/10 dark:ring-slate-700 shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <table className="w-full table-auto border-separate border-spacing-0 text-sm" {...props} />
      </div>
    ),
    thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="text-left" {...props} />,
    th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
      <th
        className="px-3 py-2 font-semibold border-b border-black/10 dark:border-slate-700 bg-slate-100 text-slate-900
                     dark:bg-slate-800 dark:text-slate-100"
        {...props}
      />
    ),
    td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
      <td
        className="px-3 py-2 align-top border-b border-black/5 dark:border-slate-800
                     text-slate-800 dark:text-slate-100"
        {...props}
      />
    ),

    /* Images (incl. charts rendered as images) get the same wrapper treatment as tables/code */
    img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
      const cls = props.className ?? '';
      return (
        <img
      {...props}
      className={`w-full h-auto object-contain max-h-[60svh] ${cls}`}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
},

    hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
      <hr className="my-3 border-black/10 dark:border-slate-700" {...props} />
    ),
    em: (props: React.HTMLAttributes<HTMLElement>) => (
      <em className="text-indigo-500 dark:text-indigo-300 not-italic font-medium" {...props} />
    ),
    strong: (props: React.HTMLAttributes<HTMLElement>) => (
      <strong className="text-slate-900 dark:text-white font-semibold" {...props} />
    ),
  };

  // Zoom: scale content but keep layout width
  const zoomStyle: React.CSSProperties = {
    transform: `scale(${zoom})`,
    transformOrigin: 'top left',
    width: `${100 / zoom}%`,
  };

  const sizeClasses = size === 'lg' ? 'prose-lg lg:prose-xl' : 'prose-sm sm:prose-base';

  return (
    <div className={`prose max-w-none dark:prose-invert ${sizeClasses} ${className}`}>
      <div style={zoomStyle}>
        <ReactMarkdown
          // @ts-ignore
          remarkPlugins={[remarkGfm, remarkMath]}
          // @ts-ignore
          rehypePlugins={[[rehypeKatex, katexOptions]]}
          components={components as any}
        >
          {children}
        </ReactMarkdown>
      </div>
    </div>
  );
}


// Defer mounting heavy children (Markdown/KaTeX) to idle so we don't block audio stream
function DeferMount({ sig, children }: { sig: string; children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    setReady(false);
    let cancelled = false;

    const run = () => { if (!cancelled) setReady(true); };

    // Prefer requestIdleCallback, fall back to a tiny timeout
    const w = typeof window !== 'undefined' ? (window as any) : undefined;
    const id = w?.requestIdleCallback
      ? w.requestIdleCallback(run, { timeout: 120 })
      : setTimeout(run, 0);

    return () => {
      cancelled = true;
      if (w?.cancelIdleCallback && typeof id === 'number') w.cancelIdleCallback(id);
      else clearTimeout(id as any);
    };
  }, [sig]);

  return ready ? <>{children}</> : null;
}

// Memoize Markdown so we only re-render if the MD string itself changes
const MemoMarkdown = React.memo(Markdown);
/* ─────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────── */
export default function LessonOverlay({
  words,
  currentIndex,
  lesson,
  topOffset = 72,
  lingerMs = 6000,
  defaultPinned = true,
  rememberKey,
  portal = true,
  zIndex = 10000,
  freeMove = true,
  fullOnMaximize = true,
  allowMarkdownFallback = false,
}: LessonOverlayProps) {

    // Log raw props whenever lesson or word stream changes
  useEffect(() => {
    olog('props', {
      wordsLen: words.length,
      currentIndex,
      lessonId: lesson?.id,
      lessonTitle: lesson?.title,
      hasLesson: !!lesson,
      hasMarkdown: typeof lesson?.markdown === 'string' && lesson.markdown.length > 0,
      formulas: lesson?.formulas?.length ?? 0,
      tables: lesson?.tables?.length ?? 0,
      images: lesson?.images?.length ?? 0,
      snippets: lesson?.snippets?.length ?? 0,
      charts: lesson?.charts?.length ?? 0,
      allowMarkdownFallback,
    });
  }, [words.length, currentIndex, lesson, allowMarkdownFallback]);


  const portaled = portal && typeof document !== 'undefined';
  const positionClass = portaled ? 'fixed' : 'absolute';

  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;

  // 1) Sentence ranges
  const sentences = useMemo(() => {
    if (!words.length) return [] as { startWi: number; endWi: number; index: number }[];
    const spans: { startWi: number; endWi: number; index: number }[] = [];
    let start = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i]?.text || '';
      if (SENTENCE_END.test(w)) {
        spans.push({ startWi: start, endWi: i, index: spans.length });
        start = i + 1;
      }
    }
    if (start < words.length) spans.push({ startWi: start, endWi: words.length - 1, index: spans.length });
    return spans;
  }, [words]);

  const currentSentenceIndex = useMemo(() => {
    if (!sentences.length) return 0;
    const idx = sentences.findIndex((s) => currentIndex >= s.startWi && currentIndex <= s.endWi);
    return idx === -1 ? 0 : idx;
  }, [sentences, currentIndex]);

  // 2) Items to show
  const items = useMemo<OverlayItem[]>(() => {
    if (!lesson) return [];

    const normalizeAt = (n?: number) =>
      typeof n === 'number' && Number.isFinite(n)
        ? Math.max(0, Math.round(n - 1))
        : undefined;

    const onlyOneSentence = sentences.length <= 1;

    const atFor = (n?: number) => {
      if (onlyOneSentence) return 0;
      const v = normalizeAt(typeof n === 'number' ? n : 1);
      return typeof v === 'number' ? v : 0;
    };

    const out: OverlayItem[] = [];

    (lesson.formulas || []).forEach((f, i) => {
      const at0 = atFor(f.announceAtSentence);
      if (typeof at0 === 'number') {
        const varsMd =
          Array.isArray(f.variables) && f.variables.length
            ? `\n\n**Variables**\n${f.variables.map((v) => `- **${v.symbol}** — ${v.meaning}`).join('\n')}`
            : '';
        const readLine = f.speakAs ? `\n\n_Read as_: ${f.speakAs}` : '';
        const md = `**${f.title || f.id || 'Formula'}**\n\n$$\n${f.latex || ''}\n$$${varsMd}${readLine}`;
        out.push({
          kind: 'formula',
          at: at0,
          key: `F${i}:${f.id || i}`,
          md,
          title: f.title || f.id,
          speakAs: f.speakAs,
        });
      }
    });

    (lesson.charts || []).forEach((ch, i) => {
      const at0 = atFor(ch.announceAtSentence);
      if (typeof at0 === 'number') {
        const alt = (ch.alt || ch.title || ch.kind || 'Chart').replace(/\|/g, '-');
        const url = ch.url || (ch.svg ? `data:image/svg+xml;utf8,${encodeURIComponent(ch.svg)}` : '');
        const caption = ch.caption ? `\n\n_${ch.caption}_` : '';
        const md = url
          ? `**${ch.title || (ch.kind ? ch.kind[0].toUpperCase() + ch.kind.slice(1) : 'Chart')}**${caption}\n\n![${alt}](${url})`
          : `**${ch.title || 'Chart'}**${caption}`;
        out.push({ kind: 'chart', at: at0, key: `H${i}:${ch.id || i}`, md, title: ch.title });
      }
    });

    (lesson.tables || []).forEach((t, i) => {
      const at0 = atFor(t.announceAtSentence);
      if (typeof at0 === 'number' && (t.columns?.length || 0) && (t.rows?.length || 0)) {
        out.push({ kind: 'table', at: at0, key: `T${i}:${t.title || i}`, md: renderGfmTable(t), title: t.title });
      }
    });

    (lesson.snippets || []).forEach((sn, i) => {
      const at0 = atFor(sn.announceAtSentence);
      if (typeof at0 === 'number' && (sn.code || '').trim()) {
        const head = `**${sn.title || 'Code snippet'}**${sn.explanation ? ` — _${sn.explanation}_` : ''}\n\n`;
        const lang = (sn.language || '').toLowerCase();
        const md = `${head}\`\`\`${lang}\n${sn.code}\n\`\`\``;
        out.push({
          kind: 'snippet',
          at: at0,
          key: `C${i}:${sn.id || i}`,
          md,
          title: sn.title,
          language: sn.language,
        });
      }
    });

    // ⬅️ No markdown fallback here anymore. If backend sends nothing, we show nothing.
    return out.sort((a, b) => a.at - b.at);
  }, [lesson, sentences.length]);


  const latestIdx = useMemo(() => {
    if (!items.length) return -1;
    let idx = -1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].at <= currentSentenceIndex) idx = i;
      else break;
    }
    return idx;
  }, [items, currentSentenceIndex]);

  /* ───────────────────────────────────────────────────────
     3) Responsive initial size/position with persistence
     ─────────────────────────────────────────────────────── */
  type Saved = {
    x: number;
    y: number;
    w: number;
    h: number;
    pinned: boolean;
    maximized: boolean;
    minimized: boolean;
    zoom: number;
  };

  function initialWH(): { w: number; h: number } {
    const { vw, vh } = vp();
    if (vw < 640) {
      // phones
      const w = Math.round(Math.min(vw - 16, 560));
      const h = Math.round(Math.min(vh * 0.6, vh - 24));
      return { w, h };
    } else if (vw < 1024) {
      // tablets
      const w = Math.round(Math.min(vw * 0.66, 720));
      const h = Math.round(Math.min(vh * 0.62, 600));
      return { w, h };
    }
    return { w: 540, h: 400 };
  }

  const defaultSaved: Saved = {
    x: 12,
    y: (topOffset || 0) + 12,
    ...initialWH(),
    pinned: defaultPinned,
    maximized: false,
    minimized: false,
    zoom: 1,
  };

  const loadSaved = (): Saved => {
    try {
      if (!rememberKey) return defaultSaved;
      const raw = localStorage.getItem(`overlay:${rememberKey}`);
      if (!raw) return defaultSaved;
      const o = JSON.parse(raw);
      return {
        x: Number.isFinite(o.x) ? o.x : defaultSaved.x,
        y: Number.isFinite(o.y) ? o.y : defaultSaved.y,
        w: Number.isFinite(o.w) ? o.w : defaultSaved.w,
        h: Number.isFinite(o.h) ? o.h : defaultSaved.h,
        pinned: !!o.pinned,
        maximized: !!o.maximized,
        minimized: !!o.minimized,
        zoom: Number.isFinite(o.zoom) ? o.zoom : defaultSaved.zoom,
      } as Saved;
    } catch {
      return defaultSaved;
    }
  };

  const saved = loadSaved();

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const { vw, vh } = vp();
    return {
      x: clamp(saved.x, 8, Math.max(8, vw - saved.w - 8)),
      y: clamp(saved.y, topOffset, Math.max(8, vh - saved.h - 8)),
    };
  });
  const [{ w, h }, setSize] = useState<{ w: number; h: number }>(() => {
    const { vw, vh } = vp();
    return {
      w: clamp(saved.w, 320, Math.min(1400, vw - 16)),
      h: clamp(saved.h, 220, Math.min(900, vh - 16)),
    };
  });
  const [zoom, setZoom] = useState<number>(saved.zoom);

  const [pinned, setPinned] = useState<boolean>(saved.pinned);
  const [maximized, setMaximized] = useState<boolean>(saved.maximized);
  const [minimized, setMinimized] = useState<boolean>(saved.minimized);

  // Persist
  useEffect(() => {
    if (!rememberKey) return;
    try {
      const payload: Saved = { x: pos.x, y: pos.y, w, h, pinned, maximized, minimized, zoom };
      localStorage.setItem(`overlay:${rememberKey}`, JSON.stringify(payload));
    } catch {}
  }, [rememberKey, pos, pinned, maximized, minimized, w, h, zoom]);

  // Re-clamp on viewport changes (rotation / resize / keyboard shown)
  useEffect(() => {
    const onResize = () => {
      const { vw, vh } = vp();
      const maxW = Math.min(1400, vw - 16);
      const maxH = Math.min(900, vh - 16);
      setSize((s) => ({
        w: clamp(s.w, 320, maxW),
        h: clamp(s.h, 220, maxH),
      }));
      setPos((p) => {
        const nx = clamp(p.x, 8, Math.max(8, vw - w - 8));
        const ny = clamp(p.y, topOffset, Math.max(8, vh - h - 8));
        return { x: nx, y: ny };
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize as any);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize as any);
    };
  }, [topOffset, w, h]);

  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [lastSeenAt, setLastSeenAt] = useState<number>(0);
  useEffect(() => {
    if (latestIdx >= 0 && latestIdx !== activeIdx) {
      setActiveIdx(latestIdx);
      setLastSeenAt(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestIdx]);

  // 4) Items grouped by the last triggered sentence
  const group = useMemo(() => {
    if (activeIdx < 0) return [] as OverlayItem[];
    const at = items[activeIdx]?.at;
    return items.filter((it) => it.at === at);
  }, [activeIdx, items]);

  const currentGroupSig = useMemo(() => groupSignature(group), [group]);

  const [dismissedSig, setDismissedSig] = useState<string | null>(null);
    const hasNonImageInGroup = useMemo(
    () => group.some((it) => it.kind !== 'image'),
    [group]
  );


   const visible = useMemo(() => {
    if (minimized || activeIdx < 0) return false;
    if (!hasNonImageInGroup) return false; // 🚫 Never show for image-only overlays
    if (dismissedSig && currentGroupSig === dismissedSig) return false;
    if (pinned || maximized) return true;
    const justTriggeredOrCurrent = items[activeIdx]?.at === currentSentenceIndex;
    if (justTriggeredOrCurrent) return true;
    return Date.now() - lastSeenAt < lingerMs;
  }, [
    minimized,
    activeIdx,
    pinned,
    maximized,
    currentSentenceIndex,
    lastSeenAt,
    lingerMs,
    items,
    dismissedSig,
    currentGroupSig,
    hasNonImageInGroup,
  ]);


    useEffect(() => {
    olog('visibility', {
      latestIdx,
      activeIdx,
      currentSentenceIndex,
      groupLen: group.length,
      currentGroupSig,
      dismissedSig,
      visible,
      minimized,
      pinned,
      maximized,
      lastSeenAt,
      lingerMs,
    });
  }, [
    latestIdx,
    activeIdx,
    currentSentenceIndex,
    group,
    currentGroupSig,
    dismissedSig,
    visible,
    minimized,
    pinned,
    maximized,
    lastSeenAt,
    lingerMs,
  ]);


  // 5) Dragging (move)
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (maximized) return;
    const el = cardRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragState.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || maximized) return;
    e.preventDefault();
    const { dx, dy } = dragState.current;
    const { vw, vh } = vp();
    const el = cardRef.current;
    const rect = el ? (el.getBoundingClientRect() as DOMRect) : ({ width: w, height: h } as DOMRect);
    const loX = 8,
      hiX = vw - rect.width - 8;
    const loY = freeMove ? 8 : topOffset || 0;
    const hiY = vh - rect.height - 8;
    setPos({ x: clamp(e.clientX - dx, loX, Math.max(loX, hiX)), y: clamp(e.clientY - dy, loY, Math.max(loY, hiY)) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragState.current = null;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // 5b) Resizing (drag corner)
  const resizeState = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const onResizeDown = (e: React.PointerEvent) => {
    if (maximized) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    resizeState.current = { startX: e.clientX, startY: e.clientY, startW: w, startH: h };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizeState.current || maximized) return;
    e.preventDefault();
    const { vw, vh } = vp();
    const dx = e.clientX - resizeState.current.startX;
    const dy = e.clientY - resizeState.current.startY;
    const maxW = Math.min(1400, vw - 16);
    const maxH = Math.min(900, vh - 16);
    const W = clamp(resizeState.current.startW + dx, Math.min(320, vw - 24), maxW);
    const H = clamp(resizeState.current.startH + dy, Math.min(220, vh - 24), maxH);
    setSize({ w: W, h: H });
  };
  const onResizeUp = (e: React.PointerEvent) => {
    resizeState.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // 6) Keyboard shortcuts
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ['=', '+'].includes(ev.key)) {
        ev.preventDefault();
        setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)));
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === '-') {
        ev.preventDefault();
        setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)));
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === '0') {
        ev.preventDefault();
        setZoom(1);
      } else if (ev.key === 'Escape') {
        if (maximized) setMaximized(false);
        else {
          setPinned(false);
          setMinimized(false);
          setDismissedSig(currentGroupSig || '');
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, currentGroupSig]);

  // 7) Minimized chip
  if (minimized) {
    const chip = (
      <button
        className={`${positionClass} right-3 bottom-3 px-3 py-2 rounded-full bg-black/60 text-white text-sm ring-1 ring-white/15 shadow-lg`}
        style={{ zIndex }}
        onClick={() => setMinimized(false)}
        title="Show notes"
        aria-label="Show notes"
      >
        Notes
      </button>
    );
    return portaled ? ReactDOM.createPortal(chip, document.body) : chip;
  }

    if (!group.length || !visible) {
    olog('hidden', {
      reason: !group.length ? 'no-items-for-current-sentence' : 'visible=false',
      groupLen: group.length,
      visible,
      activeIdx,
      latestIdx,
      sentencesLen: sentences.length,
      currentSentenceIndex,
      itemsLen: items.length,
      minimized,
      pinned,
      maximized,
      dismissedSig,
      currentGroupSig,
      lastSeenAt,
      lingerMs,
    });
  }

  if (!group.length || !visible) return null;

  // Zoom controls
  const ZoomControls = (
    <>
      <div className="ml-2 hidden sm:inline-flex items-center gap-1">
        <button
          className="chip"
          onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)))}
          title="Zoom out (Ctrl/Cmd -)"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="px-2 text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          className="chip"
          onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
          title="Zoom in (Ctrl/Cmd +)"
          aria-label="Zoom in"
        >
          +
        </button>
        <button className="chip chip-active" onClick={() => setZoom(1)} title="Reset zoom" aria-label="Reset zoom">
          Reset
        </button>
      </div>
      <div className="ml-auto sm:hidden inline-flex items-center gap-1">
        <button className="chip" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">
          −
        </button>
        <button className="chip" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">
          +
        </button>
      </div>
    </>
  );

  const HeaderButtons = (
    <div className="ml-auto flex items-center gap-1.5 flex-wrap">
      {ZoomControls}
      <button
        className="chip"
        onClick={() => setPinned((p) => !p)}
        title={pinned ? 'Unpin' : 'Pin'}
        aria-label={pinned ? 'Unpin' : 'Pin'}
      >
        {pinned ? 'Unpin' : 'Pin'}
      </button>
      <button className="chip" onClick={() => setMinimized(true)} title="Minimize" aria-label="Minimize">
        Minimize
      </button>
      {maximized ? (
        <button className="chip" onClick={() => setMaximized(false)} title="Restore" aria-label="Restore">
          Restore
        </button>
      ) : (
        <button className="chip" onClick={() => setMaximized(true)} title="Maximize" aria-label="Maximize">
          Maximize
        </button>
      )}
      <button
        className="chip"
        title="Close"
        aria-label="Close"
        onClick={() => {
          setPinned(false);
          setMaximized(false);
          setMinimized(false);
          setDismissedSig(currentGroupSig || '');
        }}
      >
        ✕
      </button>
    </div>
  );

  /* ───────────────────────────────────────────────────────
     8) Full-screen Maximize
     - Desktop/Tablet: true fullscreen
     - Phone: bottom-sheet style for better ergonomics
     ─────────────────────────────────────────────────────── */
  if (maximized && fullOnMaximize) {
    const sheetClass = isMobile
      ? `${positionClass} inset-x-0 bottom-0 top-[6svh] rounded-t-2xl overflow-hidden`
      : `${positionClass} inset-0`;

    const panel = (
      <AnimatePresence>
        <motion.div
          key="overlay-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={`${sheetClass} flex flex-col bg-slate-950/85 backdrop-blur-xl`}
          style={{ zIndex }}
          aria-modal="true"
          role="dialog"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 overlay-header ring-1 ring-white/10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="text-sm font-semibold truncate bg-clip-text text-transparent bg-gradient-to-r from-softPink via-indigo-300 to-softPink">
              {lesson?.title || 'Lesson notes'}
            </div>
            {HeaderButtons}
          </div>

          {/* Content: responsive grid */}
          <div
            className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 w-full max-w-[min(1600px,96vw)] mx-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)', contain: 'content'}}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
              {group.map((it) => {
                const c = KIND_CLASSES[it.kind];
                return (
                  <div
                    key={it.key}
                    data-kind={it.kind}
                    className={`overlay-grid-card ${c.ring} bg-white/90 dark:bg-slate-900/90 text-darkText dark:text-white`}
                  >
                    <div className={`overlay-kind-label ${c.grad}`}>{KIND_LABEL[it.kind]}</div>
                    <DeferMount sig={currentGroupSig}>
                      <MemoMarkdown zoom={zoom} size="lg">
                        {it.md}
                      </MemoMarkdown>
                    </DeferMount>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
    return portaled ? ReactDOM.createPortal(panel, document.body) : panel;
  }

  /* ───────────────────────────────────────────────────────
     9) Floating draggable + resizable card
     ─────────────────────────────────────────────────────── */
  const card = (
    <AnimatePresence>
      <motion.div
        key={`overlay-float-${activeIdx}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.18 }}
        className={`${positionClass}`}
        style={{
          left: pos.x,
          top: pos.y,
          zIndex,
          touchAction: 'none' as any,
          maxWidth: 'min(calc(100vw - 16px), 1400px)',
          maxHeight: 'min(calc(100svh - 16px), 900px)',
        }}
       
      >
         <div
          ref={cardRef}
          className="overlay-panel flex flex-col overflow-hidden"
          style={{ width: w, height: h, contain: 'content', willChange: 'transform' }}
        >
          {/* Drag header */}
          <div
            className={`overlay-header ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="text-xs sm:text-sm font-semibold truncate bg-clip-text text-transparent bg-gradient-to-r from-softPink via-indigo-300 to-softPink">
              {lesson?.title || 'Lesson notes'}
            </div>
            {HeaderButtons}
          </div>

          {/* Content fills card; scrolls as needed */}
          <div className="flex-1 min-h-0 overflow-auto p-2.5 sm:p-3 md:p-4 overscroll-contain">
            {group.map((it) => {
              const c = KIND_CLASSES[it.kind];
              return (
                <div
                  key={it.key}
                  data-kind={it.kind}
                  className={`overlay-float-card ${c.ring} bg-white/90 dark:bg-slate-900/90 text-darkText dark:text-white`}
                >
                  <div className={`overlay-kind-label--float ${c.grad}`}>{KIND_LABEL[it.kind]}</div>
                  <DeferMount sig={currentGroupSig}>
                    <MemoMarkdown zoom={zoom}>{it.md}</MemoMarkdown>
                 </DeferMount>
                </div>
              );
            })}
          </div>

          {/* Resize handle (bottom-right) */}
          <div
            className="resize-handle"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            title="Drag to resize"
            aria-label="Resize"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return portaled ? ReactDOM.createPortal(card, document.body) : card;
}

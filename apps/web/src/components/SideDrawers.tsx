// src/components/SideDrawers.tsx
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Optional Markdown + LaTeX support (same pattern as LessonOverlay)
let ReactMarkdown: any, remarkGfm: any, remarkMath: any, rehypeKatex: any;
try {
  ReactMarkdown = require('react-markdown').default;
  remarkGfm = require('remark-gfm');
  remarkMath = require('remark-math');
  rehypeKatex = require('rehype-katex');
} catch {
  /* optional */
}

/* ─────────────────────────────────────────────────────────
   Shared Markdown renderer — matches LessonOverlay styling
   ───────────────────────────────────────────────────────── */
export const MarkdownPro: React.FC<{
  children: string;
  zoom?: number;
  size?: 'base' | 'lg';
  className?: string;
}> = ({ children, zoom = 1, size = 'base', className = '' }) => {
  if (!ReactMarkdown) return <pre className="whitespace-pre-wrap text-sm">{children}</pre>;

  const katexOptions = { throwOnError: false, strict: false };

  const components = {
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        className="mt-1 mb-2 text-xl font-semibold bg-clip-text text-transparent
                   bg-gradient-to-r from-softPink via-indigo-300 to-primary"
        {...props}
      />
    ),
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 className="mt-1 mb-1 text-lg font-semibold text-plum dark:text-white" {...props} />
    ),
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className="leading-relaxed text-slate-700 dark:text-slate-200" {...props} />
    ),
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className="my-2 space-y-1 text-slate-700 dark:text-slate-200" {...props} />
    ),
    ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
      <ol className="my-2 space-y-1 text-slate-700 dark:text-slate-200" {...props} />
    ),
    code: (
      props: (React.HTMLAttributes<HTMLElement> & { inline?: boolean; className?: string }) & {
        children?: React.ReactNode;
      }
    ) => {
      const { inline, className, children, ...rest } = props;
      if (inline) {
        return (
          <code
            className={`px-1 py-0.5 rounded bg-zinc-900/5 dark:bg-white/10 ${className || ''}`}
            {...rest}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          className={`block p-3 rounded-lg bg-zinc-900/5 dark:bg-white/10 overflow-x-auto text-[13px] ${className || ''}`}
          {...rest}
        >
          {children}
        </code>
      );
    },
    table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
      <div className="not-prose overflow-x-auto rounded-xl ring-1 ring-black/10 dark:ring-slate-700 bg-white dark:bg-slate-900">
        <table className="w-full table-auto border-separate border-spacing-0 text-sm" {...props} />
      </div>
    ),
    thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
      <thead className="text-left" {...props} />
    ),
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
          remarkPlugins={[remarkGfm, remarkMath].filter(Boolean)}
          // @ts-ignore
          rehypePlugins={[[rehypeKatex, katexOptions]].filter(Boolean)}
          components={components as any}
        >
          {children}
        </ReactMarkdown>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Transcript Drawer
   ───────────────────────────────────────────────────────── */
type Word = { text: string; start: number; end: number };
type Line = { text: string; start: number; end: number; indices: number[] };

export interface TranscriptDrawerProps {
  open: boolean;
  title: string;
  lines: Line[];
  words: Word[];
  activeLine: number;
  currentIndex: number;
  top: number;
  bottom: number;
  readerScale: number;
  loading?: boolean;
  error?: string;
  onSeekToWord: (wordIndex: number) => void;
}
export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({
  open,
  title,
  lines,
  words,
  activeLine,
  currentIndex,
  top,
  bottom,
  readerScale,
  loading,
  error,
  onSeekToWord,
}) => (
  <AnimatePresence>
    {open && (
      <motion.div
        key="transcript"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="absolute right-0 w-full sm:w-[56%] lg:w-[45%] xl:w-[40%]
                   z-40 rounded-l-2xl overflow-hidden
                   bg-white text-darkText ring-1 ring-black/10
                   dark:bg-slate-900 dark:text-white dark:ring-slate-700"
        style={{ top, bottom, scrollbarWidth: 'thin' as any }}
      >
        <div className="h-full flex flex-col">
          <div className="px-4 py-3 border-b border-black/10 dark:border-slate-700">
            <div
              className="font-semibold text-base sm:text-lg truncate
                            bg-clip-text text-transparent bg-gradient-to-r from-softPink via-indigo-300 to-primary"
            >
              {title}
            </div>
            <div className="mt-0.5 text-slate-600 dark:text-slate-300 text-[12px] sm:text-xs">
              Transcript (tap a line to seek)
            </div>
          </div>

          <div className="flex-1 overflow-auto px-2 sm:px-3 py-2 space-y-2 sm:space-y-2.5">
            {lines.map((ln, i) => {
              const active = i === activeLine;
              return (
                <div
                  key={i}
                  className={`rounded-md px-3 sm:px-3.5 py-2 sm:py-2.5 leading-7 cursor-pointer transition
                    ${
                      active
                        ? 'bg-slate-100 text-slate-900 ring-1 ring-black/10 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
                        : 'text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60'
                    }`}
                  style={{ fontSize: `calc(1rem * ${readerScale})` }}
                  onClick={() => ln.indices.length && onSeekToWord(ln.indices[0])}
                  title="Seek to this line"
                >
                  {ln.indices.map((wi, j) => {
                    const w = words[wi];
                    const isActiveWord = wi === currentIndex;
                    return (
                      <motion.span
                        key={wi}
                        layout
                        initial={false}
                        animate={isActiveWord ? { scale: 1.08 } : { scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.3 }}
                        className={isActiveWord ? 'bg-white text-black px-1.5 rounded' : ''}
                      >
                        {(j ? ' ' : '') + w.text}
                      </motion.span>
                    );
                  })}
                </div>
              );
            })}
            {loading && (
              <div className="text-[12px] sm:text-xs text-slate-600 dark:text-slate-300 px-3">
                Generating TTS…
              </div>
            )}
            {error && !loading && (
              <div className="text-[12px] sm:text-xs text-red-600 dark:text-red-300 px-3">
                {error}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

/* ─────────────────────────────────────────────────────────
   Notes Drawer (Markdown)
   ───────────────────────────────────────────────────────── */
export interface NotesDrawerProps {
  open: boolean;
  title: string;
  markdown: string;
  top: number;
  bottom: number;
  readerScale: number;
  isMax?: boolean;
}
export const NotesDrawer: React.FC<NotesDrawerProps> = ({
  open,
  title,
  markdown,
  top,
  bottom,
  readerScale,
  isMax = false,
}) => (
  <AnimatePresence>
    {open && (
      <motion.div
        key="notes"
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="absolute left-0 w-full sm:w-[56%] lg:w-[45%] xl:w-[40%]
                   z-40 rounded-r-2xl overflow-auto
                   bg-white text-darkText ring-1 ring-black/10
                   dark:bg-slate-900 dark:text-white dark:ring-slate-700"
        style={{ top, bottom, scrollbarWidth: 'thin' as any }}
      >
        <div className="px-4 py-3 border-b border-black/10 dark:border-slate-700">
          <div
            className="font-semibold text-base sm:text-lg truncate
                          bg-clip-text text-transparent bg-gradient-to-r from-softPink via-indigo-300 to-primary"
          >
            {title}
          </div>
          <div className="mt-0.5 text-slate-600 dark:text-slate-300 text-[12px] sm:text-xs">
            Formulas & tables render here. Audio sticks with narration.
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <MarkdownPro zoom={readerScale} size={isMax ? 'lg' : 'base'}>
            {markdown || '_No notes for this lesson yet._'}
          </MarkdownPro>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

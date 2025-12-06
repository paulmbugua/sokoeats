// apps/web/src/components/player/Narration.tsx
import React from 'react';
import { motion, AnimatePresence, type Transition } from 'framer-motion';

// === SSML tokenization helpers/types ===
import {
  ssmlToDisplayTokens,
  type WordTiming as TxWordTiming, // { i, t, w }
} from '@mytutorapp/shared/utils/transcript';
import type {
  WordTiming as ApiWordTiming, // backend timing shape (e.g., { start, end, text })
} from '@mytutorapp/shared/api/ttsAvatarApi';

// === Template type from the new menu ===
import type { HighlightTemplate } from './TemplateMenu';

// ----- Local presentation types -----
type Sentence = { indices: number[]; start?: number; end?: number };
type Word = { text: string; start: number; end: number };

type Paragraph = {
  sentStart: number;
  sentEnd: number;
  wordIndices: number[];
};

type DisplayToken =
  | { kind: 'word'; text: string; index: number }
  | { kind: 'punct'; text: string };

// Optional loose timing seen in some pipes
type LooseTiming = { start: number; end: number; index: number; text?: string };

// ----- Paragraph builder (groups 1–3 sentences based on viewport) -----
function buildParagraphs(sentences: Sentence[], words: Word[], target: number): Paragraph[] {
  const paras: Paragraph[] = [];
  let i = 0;
  while (i < sentences.length) {
    const start = i;
    let count = 0;
    const wordIndices: number[] = [];
    while (i < sentences.length && count < target) {
      const s = sentences[i];
      wordIndices.push(...s.indices);
      count++;

      const lastWordIdx = s.indices[s.indices.length - 1];
      const lastToken = words[lastWordIdx]?.text ?? '';
      const endsHard = /[.!?…)]["”']?$/.test(lastToken);
      if (count >= 2 && endsHard) {
        i++;
        break;
      }
      i++;
    }
    paras.push({ sentStart: start, sentEnd: start + count - 1, wordIndices });
  }
  return paras;
}

// ======================================================================

export default function Narration({
  sentences,
  words,
  currentIndex,
  lessonIdx,
  useLessons,
  stageFontSize,
  ssml,
  timings,
  reducedMotion = false,
  highlightStyle = 'stripe',
  scrubbing = false,
  lang = 'en',
  templateId = 'clean-stripe',
}: {
  sentences: Sentence[];
  words: Word[];
  currentIndex: number;
  lessonIdx: number;
  useLessons: boolean;
  stageFontSize: string;
  ssml?: string;
  timings?: ApiWordTiming[] | LooseTiming[] | TxWordTiming[];
  reducedMotion?: boolean;
  highlightStyle?: 'stripe' | 'underline' | 'boxed';
  scrubbing?: boolean;
  lang?: string;
  templateId?: HighlightTemplate;
}) {
  // Which sentence contains the active word?
  const activeSentenceIdx = React.useMemo(() => {
    const idx = sentences.findIndex((s) => s.indices.includes(currentIndex));
    return idx === -1 ? 0 : idx;
  }, [sentences, currentIndex]);

  // Freeze highlight while scrubbing
  const frozenAtRef = React.useRef<number>(currentIndex);
  React.useEffect(() => {
    if (scrubbing) frozenAtRef.current = currentIndex;
  }, [scrubbing, currentIndex]);
  const effectiveIndex = scrubbing ? frozenAtRef.current : currentIndex;

  // Responsive paragraph size
  const [targetSentencesPerPara, setTargetSentencesPerPara] = React.useState(3);
  React.useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const verySmall = w < 380 || h < 520;
      const small = w < 640 || h < 640;
      setTargetSentencesPerPara(verySmall ? 1 : small ? 2 : 3);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const paragraphs = React.useMemo(
    () => buildParagraphs(sentences, words, Math.max(1, targetSentencesPerPara)),
    [sentences, words, targetSentencesPerPara]
  );

  const activeParagraphIdx = React.useMemo(() => {
    return Math.max(
      0,
      paragraphs.findIndex(
        (p) => activeSentenceIdx >= p.sentStart && activeSentenceIdx <= p.sentEnd
      )
    );
  }, [paragraphs, activeSentenceIdx]);

  const activePara = paragraphs[activeParagraphIdx];

  // Screen-reader: announce the active paragraph
  const srText = React.useMemo(() => {
    if (!activePara) return '';
    return activePara.wordIndices.map((i) => words[i]?.text).filter(Boolean).join(' ');
  }, [activePara, words]);

  // Transitions
  const transition: Transition = reducedMotion
    ? { duration: 0 }
    : { type: 'tween', ease: 'easeOut', duration: 0.22 };
  const paragraphKey = `para-${useLessons ? `l${lessonIdx}` : 'single'}-${activeParagraphIdx}`;

  // Soft top/bottom fade to avoid scrollbars and keep fit
  const maskFade: React.CSSProperties = {
    WebkitMaskImage:
      'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
    maskImage:
      'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
  };

  // ====== SSML TIMINGS NORMALIZATION ======
  const normalizedTimings = React.useMemo<TxWordTiming[] | null>(() => {
    if (!timings || !timings.length) return null;
    const out: TxWordTiming[] = [];
    const toMs = (v: number) => (v < 1000 ? Math.round(v * 1000) : Math.round(v));

    for (const x of timings as any[]) {
      // Already TxWordTiming?
      if (x && typeof x.i === 'number' && typeof x.t === 'number') {
        out.push({ i: x.i, t: toMs(x.t), w: String(x.w ?? '') });
        continue;
      }
      // LooseTiming { index, start, text? }
      if (x && typeof x.index === 'number' && typeof x.start === 'number') {
        out.push({
          i: x.index,
          t: toMs(x.start),
          w: String(x.text ?? ''),
        });
        continue;
      }
      // ApiWordTiming best-effort
      if (x && typeof x.start === 'number') {
        out.push({
          i: out.length, // fallback index (keeps order)
          t: toMs(x.start),
          w: String(x.text ?? ''),
        });
      }
    }
    return out;
  }, [timings]);

  // Tokenize SSML when available – BUT bail out if counts don’t match timings/words
  const tokens: DisplayToken[] | null = React.useMemo(() => {
    if (!ssml || !normalizedTimings?.length) return null;
    try {
      const tks = ssmlToDisplayTokens(ssml, normalizedTimings) as DisplayToken[];

      const wordTokCount = tks.filter((t) => t.kind === 'word').length;
      const timingCount = normalizedTimings.length;
      const wordsCount = words.length;

      const ref = timingCount || wordsCount || wordTokCount || 1;
      const mismatch =
        Math.abs(wordTokCount - timingCount) / ref > 0.1 ||
        Math.abs(wordsCount - timingCount) / ref > 0.1;

      if (mismatch) {
        // Too much drift between SSML tokens, backend timings, and useWordSync.words → fallback
        if (process.env.NODE_ENV !== 'production') {
          // optional debug
          console.warn('[Narration] token/timing mismatch, falling back to simple transcript', {
            wordTokCount,
            timingCount,
            wordsCount,
          });
        }
        return null;
      }

      return tks;
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Narration] ssmlToDisplayTokens failed, falling back', e);
      }
      return null;
    }
  }, [ssml, normalizedTimings, words.length]);

  // Only render tokens that belong to the active paragraph (+ surrounding punctuation)
  const visibleTokens: DisplayToken[] | null = React.useMemo(() => {
    if (!tokens || !activePara) return tokens;
    const allowed = new Set(activePara.wordIndices);
    let firstWordPos = -1;
    let lastWordPos = -1;
    tokens.forEach((t, i) => {
      if (t.kind === 'word' && allowed.has(t.index)) {
        if (firstWordPos === -1) firstWordPos = i;
        lastWordPos = i;
      }
    });
    if (firstWordPos === -1) return [];

    let L = firstWordPos;
    while (L > 0 && tokens[L - 1].kind === 'punct') L--;
    let R = lastWordPos;
    while (R + 1 < tokens.length && tokens[R + 1].kind === 'punct') R++;
    return tokens.slice(L, R + 1);
  }, [tokens, activePara]);

  // ====== TEMPLATE RESOLVERS ======

  // base sentence stripe (used for 'clean-stripe' and when highlightStyle === 'stripe')
  const baseSentenceStripe: React.CSSProperties = {
    backgroundImage: 'linear-gradient(transparent 68%, rgb(var(--hl-rgb) / 0.18) 0)',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 1.08em',
    backgroundPosition: '0 0.22em',
    borderRadius: '0.28em',
    padding: '0 0.02em',
  };

  function sentenceStyleFor(isActiveSentence: boolean): React.CSSProperties | undefined {
    if (!isActiveSentence) return undefined;
    switch (templateId) {
      case 'ribbon':
        return {
          background:
            'linear-gradient(90deg, rgb(var(--hl-rgb) / 0.12), rgb(var(--hl-rgb) / 0.55), rgb(var(--hl-rgb) / 0.12))',
          borderRadius: '0.35em',
          padding: '0 0.08em',
        };
      case 'clean-stripe':
      case 'underline-glow':
      case 'karaoke-glow':
      case 'boxed-pill':
      default:
        // respect highlightStyle for sentence-level look
        return highlightStyle === 'stripe'
          ? baseSentenceStripe
          : highlightStyle === 'underline'
          ? {
              textDecoration: 'underline',
              textDecorationThickness: '0.14em',
              textUnderlineOffset: '0.2em',
              textDecorationColor: 'rgb(var(--hl-rgb) / 0.85)',
            }
          : undefined;
    }
  }

  function activeWordStyle(): React.CSSProperties {
    switch (templateId) {
      case 'boxed-pill':
        return {
          boxShadow: 'inset 0 -0.84em 0 0 rgb(var(--hl-rgb) / 0.92)',
          color: 'var(--hl-text)' as any,
          borderRadius: '0.22em',
          transition: reducedMotion ? 'none' : 'box-shadow 140ms ease, color 140ms ease',
        };
      case 'karaoke-glow':
        return {
          color: 'var(--hl-text)' as any,
          textShadow: '0 0 0.45em rgb(var(--hl-rgb) / 0.95)',
          transition: reducedMotion ? 'none' : 'color 140ms ease, text-shadow 140ms ease',
        };
      case 'underline-glow':
        return {
          color: 'rgba(255,255,255,0.98)',
          boxShadow: 'inset 0 -0.22em 0 0 rgb(var(--hl-rgb) / 0.95)',
          borderRadius: '0.16em',
          transition: reducedMotion ? 'none' : 'box-shadow 140ms ease',
        };
      case 'ribbon':
        return {
          color: 'rgba(255,255,255,1)',
          textShadow: '0 0 0.3em rgba(0,0,0,0.35), 0 0 0.5em rgb(var(--hl-rgb) / 0.45)',
          transition: reducedMotion ? 'none' : 'text-shadow 140ms ease',
        };
      case 'clean-stripe':
      default:
        return {
          color: 'var(--hl-text)' as any,
          textShadow: '0 0 0.35em rgb(var(--hl-rgb) / 0.85)',
          transition: reducedMotion ? 'none' : 'color 140ms ease, text-shadow 140ms ease',
        };
    }
  }

  // Default for all non-active words: solid white — NO dimming of future words
  const defaultWordStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.98)' };

  // Helpers
  const isWordInActiveSentence = React.useCallback(
    (wi: number | undefined) =>
      typeof wi === 'number' && sentences[activeSentenceIdx]?.indices.includes(wi),
    [sentences, activeSentenceIdx]
  );

  // ======================================================================

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center px-3 md:px-8 text-white"
      dir="auto"
      lang={lang}
    >
      {/* SR current paragraph */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {srText}
      </div>

      <div className="w-[96%] md:w-[92%] max-w-[1200px] pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={paragraphKey}
            initial={reducedMotion ? false : { y: 12, opacity: 0.98 }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0.98 } : { y: -10, opacity: 0.98 }}
            transition={transition}
            className="relative p-4 md:p-8"
            role="group"
            aria-label="Narrated paragraph"
          >
            <div
              className="leading-[1.45] font-medium whitespace-pre-wrap break-words select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
              style={{
                fontSize: stageFontSize,
                fontVariantLigatures: 'none',
                textRendering: 'optimizeLegibility',
                ...maskFade,
              } as React.CSSProperties}
            >
              {(() => {
                // Prefer SSML token path when available
                if (visibleTokens) {
                  // ——————————— Accurate sentence wrapping for SSML tokens ———————————
                  // Find active sentence slice (within *visibleTokens*), include adjacent punctuation,
                  // then render left | ACTIVE SENTENCE (wrapped) | right. Per-word active style still applies.
                  const activeSent = sentences[activeSentenceIdx];
                  const activeSet = new Set<number>(activeSent?.indices ?? []);
                  let L = -1,
                    R = -1;

                  visibleTokens.forEach((tok, i) => {
                    if (tok.kind === 'word' && activeSet.has(tok.index)) {
                      if (L === -1) L = i;
                      R = i;
                    }
                  });

                  // Token renderer (no sentence style here)
                  const renderTok = (tok: DisplayToken, i: number) => {
                    if (tok.kind === 'punct') return <span key={`p-${i}`}>{tok.text}</span>;
                    const wi = tok.index;
                    const isActive = wi === effectiveIndex;
                    const perWord = isActive ? activeWordStyle() : defaultWordStyle;
                    return (
                      <span
                        key={`w-${wi}-${i}`}
                        data-wi={wi}
                        aria-current={isActive ? 'true' : undefined}
                        style={perWord}
                      >
                        {tok.text}
                      </span>
                    );
                  };

                  // If the active sentence isn't inside this slice, render flat
                  if (L === -1) {
                    return (
                      <p
                        className="pointer-events-none"
                        style={{ ['textWrap' as any]: 'pretty', letterSpacing: '0.005em' } as React.CSSProperties}
                      >
                        {visibleTokens.map(renderTok)}
                      </p>
                    );
                  }

                  // Extend to include adjacent punctuation for clean ribbon edges
                  while (L > 0 && visibleTokens[L - 1].kind === 'punct') L--;
                  while (R + 1 < visibleTokens.length && visibleTokens[R + 1].kind === 'punct') R++;

                  const left = visibleTokens.slice(0, L);
                  const mid = visibleTokens.slice(L, R + 1);
                  const right = visibleTokens.slice(R + 1);

                  return (
                    <p
                      className="pointer-events-none"
                      style={{ ['textWrap' as any]: 'pretty', letterSpacing: '0.005em' } as React.CSSProperties}
                    >
                      {left.map(renderTok)}
                      <span style={sentenceStyleFor(true)} data-sentence-active="">
                        {mid.map(renderTok)}
                      </span>
                      {right.map(renderTok)}
                    </p>
                  );
                }

                // Fallback: render from sentence/word arrays (no SSML tokens)
                if (activePara) {
                  return (
                    <div
                      className="pointer-events-none"
                      style={{ ['textWrap' as any]: 'pretty', letterSpacing: '0.005em' } as React.CSSProperties}
                    >
                      {Array.from(
                        { length: activePara.sentEnd - activePara.sentStart + 1 },
                        (_, k) => activePara.sentStart + k
                      ).map((sIdx, blockI) => {
                        const s = sentences[sIdx];
                        const isActiveSentence = sIdx === activeSentenceIdx;
                        const sentStyle = sentenceStyleFor(isActiveSentence);

                        return (
                          <span key={`sent-${sIdx}`} style={sentStyle}>
                            {s.indices.map((wi, j) => {
                              const w = words[wi];
                              const isActive = wi === effectiveIndex;
                              const style = isActive ? activeWordStyle() : defaultWordStyle;
                              return (
                                <span
                                  key={wi}
                                  className="inline"
                                  style={style}
                                  aria-current={isActive ? 'true' : undefined}
                                >
                                  {(j || blockI ? ' ' : '') + (w?.text ?? '')}
                                </span>
                              );
                            })}
                          </span>
                        );
                      })}
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

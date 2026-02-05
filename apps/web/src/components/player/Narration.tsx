// apps/web/src/components/player/Narration.tsx
import React from 'react';
import { motion, AnimatePresence, type Transition } from 'framer-motion';

// === SSML tokenization helpers/types ===
import {
  ssmlToDisplayTokens,
  type WordTiming as TxWordTiming, // { i, t, w }
} from '@mytutorapp/shared/utils/transcript';
import {
  buildWordDisplayTokens,
  joinWordsForDisplay,
  shouldInsertSpace,
} from '@mytutorapp/shared/hooks/useWordSync';
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

const NS = '[Narration]';

// Detect punct that contains 2+ sentence terminators (even with spaces), e.g. ". . ", "! !", "… …"
function hasMultiTerminatorsInPunct(s: string) {
  // any of . ! ? … repeated with optional whitespace between
  return /[.!?…](?:\s*[.!?…]){1,}/.test(s);
}

// Optional: collapse ". . " -> ". " (or "… " if you prefer)
function normalizePunctForRender(s: string) {
  // collapse repeated dots (or other terminators) inside a single token
  // ". . " -> ". ", "! ! " -> "! ", "… …" -> "… "
  if (!hasMultiTerminatorsInPunct(s)) return s;

  // Keep the first terminator character we find, then one trailing space if original had any
  const first = s.match(/[.!?…]/)?.[0] ?? '.';
  const hasTrailingSpace = /\s$/.test(s);
  return first + (hasTrailingSpace ? ' ' : '');
}

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
  const dev = process.env.NODE_ENV !== 'production';

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
      paragraphs.findIndex((p) => activeSentenceIdx >= p.sentStart && activeSentenceIdx <= p.sentEnd)
    );
  }, [paragraphs, activeSentenceIdx]);

  const activePara = paragraphs[activeParagraphIdx];

  // Screen-reader: announce the active paragraph
  const srText = React.useMemo(() => {
    if (!activePara) return '';
    return joinWordsForDisplay(words, activePara.wordIndices);
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
    maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
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

    if (dev) {
      console.log(`${NS} normalizedTimings`, {
        timingsInLen: timings.length,
        outLen: out.length,
        sample0: out[0],
        sampleLast: out[out.length - 1],
      });
    }

    return out;
  }, [timings, dev]);

  // Tokenize SSML when available – BUT bail out if counts don’t match timings/words
  const tokens: DisplayToken[] | null = React.useMemo(() => {
    if (!ssml || !normalizedTimings?.length) {
      if (dev) {
        console.log(`${NS} tokens: skip`, {
          hasSsml: !!ssml,
          ssmlLen: ssml ? ssml.length : 0,
          normalizedTimingsLen: normalizedTimings?.length ?? 0,
        });
      }
      return null;
    }

    try {
      const tks = ssmlToDisplayTokens(ssml, normalizedTimings) as DisplayToken[];

      // ---- Debug: check for doubled terminators inside SSML-derived tokens (ALWAYS before mismatch return) ----
      if (dev) {
        const isTerm = (s: string) => /[.!?…]/.test(s);

        const hit = tks.findIndex((tok, i) => {
          const prev = tks[i - 1];

          // NEW: single punct token that contains multiple terminators (". . ")
          if (tok?.kind === 'punct' && hasMultiTerminatorsInPunct(tok.text)) return true;

          // Case A: punct + punct terminators
          if (prev?.kind === 'punct' && tok?.kind === 'punct') {
            return isTerm(prev.text) && isTerm(tok.text);
          }

          // Case B: word ends with terminator + next punct terminator
          if (prev?.kind === 'word' && tok?.kind === 'punct') {
            return isTerm(prev.text?.slice(-1) || '') && isTerm(tok.text || '');
          }

          // Case C: word itself contains ".." or "..."
          if (tok?.kind === 'word') {
            return /[.!?]{2,}/.test(tok.text);
          }

          return false;
        });

        if (hit !== -1) {
          console.log(`${NS} DOUBLE-TERM near index`, hit, {
            prev2: tks[hit - 2],
            prev1: tks[hit - 1],
            cur: tks[hit],
            next1: tks[hit + 1],
            next2: tks[hit + 2],
          });
        }
      }

      const wordTokCount = tks.filter((t) => t.kind === 'word').length;
      const timingCount = normalizedTimings.length;
      const wordsCount = words.length;

      const ref = timingCount || wordsCount || wordTokCount || 1;
      const mismatch =
        Math.abs(wordTokCount - timingCount) / ref > 0.1 ||
        Math.abs(wordsCount - timingCount) / ref > 0.1;

      if (dev) {
        console.log(`${NS} token counts`, {
          wordTokCount,
          timingCount,
          wordsCount,
          mismatch,
          ssmlLen: ssml.length,
          head: tks.slice(0, 12).map((t) => ({
            kind: t.kind,
            text: t.text,
            index: (t as any).index,
          })),
        });
      }

      if (mismatch) {
        if (dev) {
          console.warn(`${NS} token/timing mismatch → fallback`, {
            wordTokCount,
            timingCount,
            wordsCount,
          });
        }
        return null;
      }

      return tks;
    } catch (e) {
      if (dev) {
        console.warn(`${NS} ssmlToDisplayTokens failed → fallback`, e);
      }
      return null;
    }
  }, [ssml, normalizedTimings, words.length, dev]);

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

    // Only pull true "opening punctuation" to the left (avoid dragging sentence terminators)
    const isOpeningPunct = (s: string) => /^[("“”'‘’\[\{]+$/.test(s);
    const isSentenceEndPunct = (s: string) => /^[.!?…]+$/.test(s);

    let L = firstWordPos;
    while (L > 0 && tokens[L - 1].kind === 'punct') {
      const p = (tokens[L - 1] as any).text || '';
      if (isSentenceEndPunct(p)) break;
      if (!isOpeningPunct(p)) break;
      L--;
    }

    let R = lastWordPos;
    while (R + 1 < tokens.length && tokens[R + 1].kind === 'punct') R++;

    const slice = tokens.slice(L, R + 1);

    if (dev) {
      const head = slice.slice(0, 16).map((t) => ({
        kind: t.kind,
        text: t.text,
        index: (t as any).index,
      }));

      const isTermAny = (s: string) => /[.!?…]/.test(s);
      const hit = slice.findIndex((tok, i) => {
        const prev = slice[i - 1];
        if (!prev) return false;

        // NEW: single punct token with multiple terminators in the VISIBLE slice
        if (tok.kind === 'punct' && hasMultiTerminatorsInPunct(tok.text)) return true;

        if (prev.kind === 'punct' && tok.kind === 'punct') return isTermAny(prev.text) && isTermAny(tok.text);
        if (prev.kind === 'word' && tok.kind === 'punct')
          return isTermAny(prev.text?.slice(-1) || '') && isTermAny(tok.text || '');
        if (tok.kind === 'word') return /[.!?]{2,}/.test(tok.text);
        return false;
      });

      console.log(`${NS} visibleTokens slice`, {
        activeParagraphIdx,
        L,
        R,
        sliceLen: slice.length,
        head,
        doubleTermHit: hit,
        hitContext:
          hit !== -1
            ? {
                prev2: slice[hit - 2],
                prev1: slice[hit - 1],
                cur: slice[hit],
                next1: slice[hit + 1],
                next2: slice[hit + 2],
              }
            : null,
      });
    }

    return slice;
  }, [tokens, activePara, activeParagraphIdx, dev]);

  React.useEffect(() => {
    if (!dev) return;
    const head = (visibleTokens || []).slice(0, 12).map((t) => ({
      kind: t.kind,
      text: t.text,
      index: (t as any).index,
    }));
    console.log(`${NS} head tokens`, head);
  }, [visibleTokens, dev]);

  // ====== TEMPLATE RESOLVERS ======

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

  const defaultWordStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.98)' };

  // (kept for compatibility; not used directly in this version)
  const isWordInActiveSentence = React.useCallback(
    (wi: number | undefined) =>
      typeof wi === 'number' && sentences[activeSentenceIdx]?.indices.includes(wi),
    [sentences, activeSentenceIdx]
  );

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center px-3 md:px-8 text-white"
      dir="auto"
      lang={lang}
    >
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
              style={
                {
                  fontSize: stageFontSize,
                  fontVariantLigatures: 'none',
                  textRendering: 'optimizeLegibility',
                  ...maskFade,
                } as React.CSSProperties
              }
            >
              {(() => {
                // Prefer SSML token path when available
                if (visibleTokens) {
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

const renderTok = (tok: DisplayToken, i: number) => {
  if (tok.kind === 'punct') {
    const raw = tok.text;
    const txt = normalizePunctForRender(raw);

    // Keep logs based on RAW text (so you still catch the bad tokens)
    if (dev && raw !== txt) {
      console.log(`${NS} normalize punct`, { raw, txt, at: i });
    }

    return <span key={`p-${i}`}>{txt}</span>;
  }

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
                        style={
                          {
                            ['textWrap' as any]: 'pretty',
                            letterSpacing: '0.005em',
                          } as React.CSSProperties
                        }
                      >
                        {visibleTokens.map(renderTok)}
                      </p>
                    );
                  }

                  // Extend to include adjacent punctuation for clean ribbon edges (inside visibleTokens)
                  while (L > 0 && visibleTokens[L - 1].kind === 'punct') L--;
                  while (R + 1 < visibleTokens.length && visibleTokens[R + 1].kind === 'punct') R++;

                  const left = visibleTokens.slice(0, L);
                  const mid = visibleTokens.slice(L, R + 1);
                  const right = visibleTokens.slice(R + 1);

                  return (
                    <p
                      className="pointer-events-none"
                      style={
                        {
                          ['textWrap' as any]: 'pretty',
                          letterSpacing: '0.005em',
                        } as React.CSSProperties
                      }
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
                  let prevSentenceLastText = '';
                  return (
                    <div
                      className="pointer-events-none"
                      style={
                        {
                          ['textWrap' as any]: 'pretty',
                          letterSpacing: '0.005em',
                        } as React.CSSProperties
                      }
                    >
                      {Array.from(
                        { length: activePara.sentEnd - activePara.sentStart + 1 },
                        (_, k) => activePara.sentStart + k
                      ).map((sIdx) => {
                        const s = sentences[sIdx];
                        const isActiveSentence = sIdx === activeSentenceIdx;
                        const sentStyle = sentenceStyleFor(isActiveSentence);
                        const firstWordText = words[s.indices[0]]?.text ?? '';
                        const needsLeadingSpace = shouldInsertSpace(prevSentenceLastText, firstWordText);
                        const toks = buildWordDisplayTokens(words, s.indices);
                        const lastIndex = s.indices[s.indices.length - 1];
                        const lastTokenText = lastIndex != null ? words[lastIndex]?.text ?? '' : '';
                        prevSentenceLastText = lastTokenText;

                        return (
                          <span key={`sent-${sIdx}`} style={sentStyle}>
                            {needsLeadingSpace ? ' ' : ''}
                            {toks.map((tok) => {
                              if (!tok.text) return null;
                              const isActive = tok.index === effectiveIndex;
                              const style = isActive ? activeWordStyle() : defaultWordStyle;
                              return (
                                <span
                                  key={tok.index}
                                  className="inline"
                                  style={style}
                                  aria-current={isActive ? 'true' : undefined}
                                >
                                  {tok.text}
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

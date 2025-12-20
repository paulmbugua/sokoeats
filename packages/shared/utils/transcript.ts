export type WordTiming = { i: number; t: number; w: string }; // from SpeakResp
export type DisplayToken =
  | { kind: 'word'; text: string; start: number | undefined; index: number }
  | { kind: 'punct'; text: string }; // punctuation/spaces

/** Turn SSML into display tokens by interleaving timing-mapped words with punctuation. */
export function ssmlToDisplayTokens(ssml: string, timings: WordTiming[]): DisplayToken[] {
  const text = String(ssml || '')
    // strip outer SSML but keep punctuation
    .replace(/<speak[^>]*>/gi, '')
    .replace(/<\/speak>/gi, '')
    .replace(/<[^>]+>/g, ' ') // drop tags, keep spacing
    .replace(/\s+/g, ' ')
    .trim();

  // MUST match backend's word definition (googleTtsService -> injectMarksIntoSsml)
  const wordRe = /([A-Za-z0-9]+(?:[’'\-][A-Za-z0-9]+)*)/g;

  const out: DisplayToken[] = [];
  let wi = 0;
  let last = 0;

  for (const m of text.matchAll(wordRe)) {
    const word = m[1];
    const at = m.index ?? 0;

    // emit punctuation between last token and this word
    if (at > last) {
      const punct = text.slice(last, at);
      if (punct) out.push({ kind: 'punct', text: punct });
    }

    const t = timings[wi];
    out.push({
      kind: 'word',
      text: word,
      start: t ? t.t : undefined,
      index: t ? t.i : wi,
    });

    wi += 1;
    last = at + word.length;
  }

  // tail punctuation
  if (last < text.length) {
    const tail = text.slice(last);
    if (tail) out.push({ kind: 'punct', text: tail });
  }

  return out;
}

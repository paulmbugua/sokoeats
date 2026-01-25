export function decodeHtmlEntities(input) {
  const decodeOnce = (str) =>
    str.replace(/&lt;|&gt;|&amp;|&quot;|&#39;/g, (m) => {
      switch (m) {
        case '&lt;':
          return '<';
        case '&gt;':
          return '>';
        case '&amp;':
          return '&';
        case '&quot;':
          return '"';
        case '&#39;':
          return "'";
        default:
          return m;
      }
    });

  let out = String(input ?? '');
  for (let i = 0; i < 2; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
    if (!/&lt;|&gt;|&amp;|&quot;|&#39;/.test(out)) break;
  }
  return out;
}

export function looksLikeEscapedSsml(input) {
  if (!input) return false;
  return (
    /&lt;\s*(speak|break|prosody|mark)\b/i.test(input) ||
    /&amp;lt;\s*(speak|break|prosody|mark)\b/i.test(input)
  );
}

function normalizeLtGtArtifacts(input) {
  if (!input) return '';
  const tagNames = '(?:speak|break|prosody|mark|bookmark|p|s|voice|mstts:[\\w-]+|amazon:[\\w-]+)';
  const ltGtPattern = new RegExp(`\\blt\\b\\s*(\\/?\\s*${tagNames}[^]*?)\\s*\\bgt\\b`, 'gi');

  return input.replace(ltGtPattern, (_match, body) => {
    const trimmed = String(body || '').trim();
    const nameMatch = trimmed.match(/^(\/?)\s*([^\s/>]+)/i);
    const rawName = (nameMatch && nameMatch[2]) || '';
    const lower = rawName.toLowerCase();
    const isClosing = Boolean(nameMatch && nameMatch[1]);
    const selfClosing = new Set(['break', 'mark', 'bookmark']);

    if (!trimmed || !rawName) return _match;

    if (!isClosing && selfClosing.has(lower)) {
      const bodyTrimmed = trimmed.replace(/\s*\/?\s*$/, '');
      return `<${bodyTrimmed}/>`;
    }

    return `<${trimmed}>`;
  });
}

export function normalizeIncomingSsml(ssml) {
  if (!ssml) return '';
  let out = String(ssml);
  if (looksLikeEscapedSsml(out)) {
    out = decodeHtmlEntities(out);
  }
  out = normalizeLtGtArtifacts(out);
  return out;
}

export function ssmlToPlainText(ssml) {
  if (!ssml) return '';
  let out = normalizeIncomingSsml(ssml);

  out = out.replace(/<\s*break\b[^>]*\/?>/gi, ' ');
  out = out.replace(/<\s*mark\b[^>]*\/?>/gi, ' ');
  out = out.replace(/<\s*bookmark\b[^>]*\/?>/gi, ' ');

  out = out.replace(/<\s*\/p\s*>/gi, '\n');
  out = out.replace(/<\s*p\b[^>]*>/gi, ' ');
  out = out.replace(/<\s*\/s\s*>/gi, '\n');
  out = out.replace(/<\s*s\b[^>]*>/gi, ' ');

  out = out.replace(/<[^>]+>/g, ' ');
  out = decodeHtmlEntities(out);

  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.replace(/\s+/g, ' ').trim();

  return out;
}

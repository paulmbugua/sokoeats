// apps/backend/utils/remarkUtils.js

export const REMARK_MAX_CHARS = 30;

/**
 * Structured Outputs (json_schema) supports `pattern` (not maxLength),
 * so we enforce 1..30 chars and "must not end with '.' or '…'".
 *
 * Pattern rules:
 * - total length 1..30
 * - last character is NOT: dot '.', unicode ellipsis '…', or whitespace
 *
 * NOTE:
 * - Preventing *any* "cut-off words" is not realistically enforceable via regex alone.
 *   We enforce that at runtime via sanitizeRemark().
 */
export const REMARK_PATTERN_30 = '^(?=.{1,30}$).*[^\u2026\\.\\s]$';

/**
 * Sanitize a remark to:
 * - collapse whitespace
 * - trim
 * - remove forbidden trailing ".", "...", "…"
 * - soft-clip to <= maxChars on a word boundary when possible
 * - MUST NOT end with ".", "..." or "…"
 *
 * Returns null if it cannot produce a clean phrase.
 */
export function sanitizeRemark(raw, maxChars = REMARK_MAX_CHARS) {
  if (raw == null) return null;

  let s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return null;

  // Strip any trailing dots/ellipsis (repeat-safe)
  // Handles ".", "...", "....", "…", "……", ".…", etc.
  s = s.replace(/[.\u2026]+$/g, '').trim();
  if (!s) return null;

  // Clip to maxChars without cutting a word if possible.
  if (s.length > maxChars) {
    const within = s.slice(0, maxChars).trimEnd();

    // Try to cut on last space (avoid chopping a word)
    const lastSpace = within.lastIndexOf(' ');
    if (lastSpace >= 12) {
      s = within.slice(0, lastSpace).trimEnd();
    } else {
      // If no safe word boundary, keep the clipped text (still a valid phrase),
      // but we'll re-run trailing-punct guard below.
      s = within;
    }

    // Re-strip trailing dots/ellipsis after clipping
    s = s.replace(/[.\u2026]+$/g, '').trim();
    if (!s) return null;
  }

  // Final hard guards
  if (s.length > maxChars) {
    s = s.slice(0, maxChars).trimEnd();
  }
  s = s.replace(/[.\u2026]+$/g, '').trim();
  if (!s) return null;

  // Must not end with dot/ellipsis/whitespace
  if (/[.\u2026\s]$/.test(s)) {
    s = s.replace(/[.\u2026\s]+$/g, '').trim();
    if (!s) return null;
  }

  // Ensure we didn’t exceed limit after trims
  if (s.length > maxChars) {
    s = s.slice(0, maxChars).trimEnd();
    s = s.replace(/[.\u2026]+$/g, '').trim();
    if (!s) return null;
  }

  return s;
}

export function sanitizeRemark30(raw) {
  return sanitizeRemark(raw, REMARK_MAX_CHARS);
}

/**
 * Helper to embed the remark constraint into Structured Outputs schemas.
 * Uses pattern-only (compatible with json_schema Structured Outputs).
 */
export function remarkStringSchema30() {
  return {
    type: 'string',
    pattern: REMARK_PATTERN_30,
    description:
      '1–30 chars; must not end with "." or "…" or whitespace; short complete phrase.',
  };
}

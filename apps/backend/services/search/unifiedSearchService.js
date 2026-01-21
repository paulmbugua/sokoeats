// apps/backend/services/search/unifiedSearchService.js
import { aiParseCourseSearch } from '../aiCourseSearch.js';
import { clampInt, nowMs, normalizeText, toArr, toStr } from './searchUtils.js';

import { searchTutorsAdapter } from './adapters/searchTutorsAdapter.js';
import { searchOerCoursesAdapter } from './adapters/searchOerCoursesAdapter.js';
import { searchOerVideosAdapter } from './adapters/searchOerVideosAdapter.js';
import { searchPurchasedVideosAdapter } from './adapters/searchPurchasedVideosAdapter.js';
import { searchCoursesAdapter } from './adapters/searchCoursesAdapter.js';
import { searchClassVaultMarketplaceAdapter } from './adapters/searchClassVaultMarketplaceAdapter.js';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

function shouldUseAi(rawQ) {
  return (
    rawQ.length >= 6 &&
    /[a-zA-Z]/.test(rawQ) &&
    (/\s/.test(rawQ) ||
      /[\d$]|under|less|cheap|top|rating|grade|beginner|intermediate|advanced/i.test(
        rawQ,
      ))
  );
}

function normalizeContentKinds(kinds) {
  const arr = toArr(kinds).map((k) => normalizeText(k));
  return arr.map((k) => (k === 'text' || k === 'docs' ? 'doc' : k));
}

/**
 * ✅ Updated: allowAiInferred gate so AI-inferred filters don't "hard filter" results
 * unless we explicitly allow it (second pass).
 */
function mergeFilters(ai, explicitFilters, explicitProvided, opts = {}) {
  const { allowAiInferred = true } = opts;

  const pick = (key, fallback = '') =>
    explicitProvided.has(key) ? toStr(explicitFilters[key]) : toStr(fallback);

  const providersExplicit =
    explicitProvided.has('providers') || explicitProvided.has('provider');
  const contentKindsExplicit =
    explicitProvided.has('contentKinds') || explicitProvided.has('contentKind');

  const providers = providersExplicit
    ? toArr(explicitFilters.providers ?? explicitFilters.provider)
    : allowAiInferred
      ? toArr(ai?.providers)
      : [];

  const contentKinds = contentKindsExplicit
    ? normalizeContentKinds(explicitFilters.contentKinds ?? explicitFilters.contentKind)
    : allowAiInferred
      ? normalizeContentKinds(ai?.contentKinds)
      : [];

  const sourceKindRaw = explicitProvided.has('sourceKind')
    ? toStr(explicitFilters.sourceKind)
    : allowAiInferred
      ? toStr(ai?.sourceKind)
      : '';
  const sourceKind = normalizeText(sourceKindRaw) === 'video' ? '' : sourceKindRaw;

  const minRating = explicitProvided.has('minRating')
    ? Number(explicitFilters.minRating ?? 0)
    : allowAiInferred
      ? Number(ai?.minRating ?? 0)
      : 0;

  const maxPrice = explicitProvided.has('maxPrice')
    ? Number(explicitFilters.maxPrice ?? 0)
    : allowAiInferred
      ? Number(ai?.maxPrice ?? 0)
      : 0;

  return {
    // ✅ CRITICAL: only apply AI inferred subject/gradeBand/country/scope if allowed
    subject: pick('subject', allowAiInferred ? ai?.subject : ''),
    gradeBand: pick('gradeBand', allowAiInferred ? ai?.gradeBand : ''),
    country: pick('country', allowAiInferred ? ai?.country : ''),
    providers,
    contentKinds,
    sourceKind,
    scope: pick('scope', allowAiInferred ? ai?.scope : ''),
    minRating: Number.isFinite(minRating) ? minRating : 0,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : 0,
  };
}

function resolveKinds(explicitFilters, merged) {
  const kinds = toArr(explicitFilters.kinds).map((k) => normalizeText(k));
  const kindSet = new Set(kinds);
  const hasExplicit = kindSet.size > 0;

  const includeByScope = (kind) => {
    if (merged.scope === 'purchased') return kind === 'purchased_video';
    if (merged.scope === 'free') return kind !== 'purchased_video';
    return true;
  };

  const includeBySource = (kind) => {
    const source = normalizeText(merged.sourceKind);
    if (source === 'tutor') return kind === 'tutor';
    if (source === 'oer') return kind === 'oer_course' || kind === 'oer_video';
    return true;
  };

  return {
    kinds,
    shouldInclude: (kind) => {
      if (hasExplicit && !kindSet.has(kind)) return false;
      if (!includeByScope(kind)) return false;
      if (!includeBySource(kind)) return false;
      return true;
    },
  };
}

/**
 * ✅ New: shared adapter runner so we can do 2-pass searching.
 * Pass 1 = explicit-only filters (no AI inferred subject/grade/country/scope)
 * Pass 2 = AI inferred filters (only if pass 1 yields nothing AND AI used)
 */
async function runAdapters({
  effectiveQ,
  limitN,
  offsetN,
  tokenUser,
  explicitFilters,
  merged,
}) {
  const normalizedContentKinds = normalizeContentKinds(merged.contentKinds);
  merged.contentKinds = normalizedContentKinds;

  const { shouldInclude } = resolveKinds(explicitFilters, merged);

  const fetchLimit = Math.min(limitN + offsetN, MAX_LIMIT);

  const adapterIntent = {
    ...merged,
    providers: toArr(merged.providers),
    contentKinds: normalizedContentKinds,
  };

  const tasks = [];

  if (shouldInclude('tutor')) {
    tasks.push({
      kind: 'tutor',
      run: () =>
        searchTutorsAdapter({
          q: effectiveQ,
          limit: fetchLimit,
          offset: 0,
          intent: adapterIntent,
        }),
    });
  }

  if (shouldInclude('oer_course')) {
    tasks.push({
      kind: 'oer_course',
      run: () =>
        searchOerCoursesAdapter({
          q: effectiveQ,
          limit: fetchLimit,
          offset: 0,
          intent: adapterIntent,
        }),
    });
  }

  if (shouldInclude('oer_video')) {
    tasks.push({
      kind: 'oer_video',
      run: () =>
        searchOerVideosAdapter({
          q: effectiveQ,
          limit: fetchLimit,
          offset: 0,
          intent: adapterIntent,
        }),
    });
  }

  if (shouldInclude('course')) {
    tasks.push({
      kind: 'course',
      run: () =>
        searchCoursesAdapter({
          q: effectiveQ,
          limit: fetchLimit,
          offset: 0,
          intent: adapterIntent,
        }),
    });
  }

  if (shouldInclude('purchased_video')) {
    tasks.push({
      kind: 'purchased_video',
      run: () =>
        searchPurchasedVideosAdapter({
          q: effectiveQ,
          limit: fetchLimit,
          offset: 0,
          intent: adapterIntent,
          user: tokenUser,
        }),
    });
  }

  if (shouldInclude('classvault_market')) {
    tasks.push({
      kind: 'classvault_market',
      run: () =>
        searchClassVaultMarketplaceAdapter({
          q: effectiveQ,
          limit: fetchLimit,
          offset: 0,
          intent: adapterIntent,
        }),
    });
  }

  const warnings = [];
  const results = await Promise.allSettled(tasks.map((t) => t.run()));

  const items = results.flatMap((res, idx) => {
    if (res.status === 'fulfilled') return res.value || [];
    warnings.push(`Adapter ${tasks[idx].kind} failed.`);
    return [];
  });

  return { items, warnings, mergedUsed: merged };
}

export async function unifiedSearchService({
  q,
  limit,
  offset,
  tokenUser,
  explicitFilters,
  explicitProvided,
}) {
  const t0 = nowMs();
  const rawQ = toStr(q);
  const limitN = clampInt(limit, 1, MAX_LIMIT, DEFAULT_LIMIT);
  const offsetN = clampInt(offset, 0, Number.MAX_SAFE_INTEGER, 0);

  let ai = null;
  let aiUsed = false;

  if (rawQ && shouldUseAi(rawQ)) {
    try {
      ai = await aiParseCourseSearch(rawQ);
      aiUsed = Boolean(ai);
    } catch {
      ai = null;
      aiUsed = false;
    }
  }

  const aiKeywords = toStr(ai?.keywords);
  const effectiveQ = aiKeywords || rawQ;

  // ✅ PASS 1: explicit-only filters (prevents AI inferred subject from killing results)
  const mergedExplicitOnly = mergeFilters(ai, explicitFilters, explicitProvided, {
    allowAiInferred: false,
  });

  let { items, warnings, mergedUsed } = await runAdapters({
    effectiveQ,
    limitN,
    offsetN,
    tokenUser,
    explicitFilters,
    merged: mergedExplicitOnly,
  });

  // ✅ PASS 2: if empty and AI was used, retry with AI inferred filters
  if (items.length === 0 && aiUsed) {
    const mergedAi = mergeFilters(ai, explicitFilters, explicitProvided, {
      allowAiInferred: true,
    });

    const second = await runAdapters({
      effectiveQ,
      limitN,
      offsetN,
      tokenUser,
      explicitFilters,
      merged: mergedAi,
    });

    items = second.items;
    warnings = warnings.concat(second.warnings);
    mergedUsed = second.mergedUsed;

    if (items.length) {
      warnings.push(
        'AI inferred filters applied after explicit search returned 0 results.',
      );
    }
  }

  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCreated = a._createdAt ?? 0;
    const bCreated = b._createdAt ?? 0;
    if (bCreated !== aCreated) return bCreated - aCreated;
    const aTitle = normalizeText(a.title);
    const bTitle = normalizeText(b.title);
    if (aTitle < bTitle) return -1;
    if (aTitle > bTitle) return 1;
    return 0;
  });

  const countsByKind = sorted.reduce(
    (acc, item) => {
      acc[item.kind] = (acc[item.kind] || 0) + 1;
      return acc;
    },
    {
      tutor: 0,
      oer_video: 0,
      oer_course: 0,
      purchased_video: 0,
      course: 0,
      classvault_market: 0,
    },
  );

  const paged = sorted.slice(offsetN, offsetN + limitN).map((item) => {
    const { _createdAt, ...rest } = item;
    return rest;
  });

  return {
    items: paged,
    meta: {
      q: rawQ,
      limit: limitN,
      offset: offsetN,
      usingServer: true,
      aiUsed,
      parsed: aiUsed ? { ...mergedUsed } : null,
      ms: nowMs() - t0,
      countsByKind,
      ...(warnings.length ? { warnings } : {}),
    },
  };
}

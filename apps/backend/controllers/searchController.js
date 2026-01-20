// apps/backend/controllers/searchController.js
import { unifiedSearchService } from '../services/search/unifiedSearchService.js';

export async function unifiedSearch(req, res) {
  const query = req.query ?? {};
  const explicitProvided = new Set(Object.keys(query));

  const explicitFilters = {
    q: query.q,
    limit: query.limit,
    offset: query.offset,
    kinds: query.kinds,
    subject: query.subject,
    gradeBand: query.gradeBand,
    country: query.country,
    provider: query.provider,
    providers: query.providers,
    contentKind: query.contentKind,
    contentKinds: query.contentKinds,
    sourceKind: query.sourceKind,
    scope: query.scope,
    minRating: query.minRating,
    maxPrice: query.maxPrice,
  };

  try {
    const result = await unifiedSearchService({
      q: query.q,
      limit: query.limit,
      offset: query.offset,
      tokenUser: req.user,
      explicitFilters,
      explicitProvided,
    });

    return res.json(result);
  } catch (err) {
    console.error('[unifiedSearch] error', err?.message || err);
    return res.json({
      items: [],
      meta: {
        q: String(query.q || '').trim(),
        limit: Number(query.limit ?? 24) || 24,
        offset: Number(query.offset ?? 0) || 0,
        usingServer: true,
        aiUsed: false,
        parsed: null,
        ms: 0,
        countsByKind: {
          tutor: 0,
          oer_video: 0,
          oer_course: 0,
          purchased_video: 0,
          course: 0,
          classvault_market: 0,
        },
        warnings: ['Unified search failed.'],
      },
    });
  }
}

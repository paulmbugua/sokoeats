// apps/web/src/pages/OerReaderFull.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useShopContext } from '@mytutorapp/shared/context';
import SeoHead from '../components/seo/SeoHead';

type OerItem = {
  id?: string | number;
  slug?: string;
  title?: string;
  web_url?: string | null;
  html_url?: string | null;
  file_url?: string | null;
  pdf_url?: string | null;
  source_url?: string | null;
  url?: string | null;
  provider?: string | null;
  cover_url?: string | null;
};

const dlog = (...args: any[]) => {
  /* set true to debug */
};

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
  dlog('HTTP', res.status, url, 'preview:', text.slice(0, 200));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function firstHtmlishFromPayload(payload: any, slugOrId: string): OerItem | null {
  // direct item with an HTML url
  const directHtml = payload?.web_url || payload?.html_url;
  if (directHtml) {
    return {
      id: payload?.id ?? slugOrId,
      slug: payload?.slug ?? slugOrId,
      title: payload?.title || payload?.name || 'Open Resource',
      web_url: payload?.web_url || payload?.html_url,
      provider: payload?.provider || payload?.origin || 'OER',
      cover_url: payload?.cover_url || null,
    };
  }
  // array or items
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data?.items)
        ? payload.data.items
        : [];

  // prefer web_url/html_url; if none, fall back to file/source/url (PDF or site)
  for (const it of items) {
    const web = it?.web_url || it?.html_url;
    if (web) return { ...it, web_url: web };
  }
  for (const it of items) {
    const anyUrl = it?.file_url || it?.pdf_url || it?.source_url || it?.url;
    if (anyUrl) return { ...it, web_url: anyUrl };
  }
  // final fallback: treat root payload as a single item with any URL
  const anyUrl = payload?.file_url || payload?.pdf_url || payload?.source_url || payload?.url;
  if (anyUrl) {
    return {
      id: payload?.id ?? slugOrId,
      slug: payload?.slug ?? slugOrId,
      title: payload?.title || payload?.name || 'Open Resource',
      web_url: anyUrl,
      provider: payload?.provider || payload?.origin || 'OER',
      cover_url: payload?.cover_url || null,
    };
  }
  return null;
}

const OerReaderFull: React.FC = () => {
  const { id: rawId } = useParams<{ id: string }>();
  const id = sanitizeId(rawId);
  const nav = useNavigate();
  const location = useLocation();
  const { backendUrl, token } = useShopContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [item, setItem] = useState<OerItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!backendUrl || !id) return;
      setLoading(true);
      setError('');
      try {
        const base = backendUrl.replace(/\/+$/, '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const candidates = [
          // books by id/slug (OpenStax or similar)
          `${base}/api/oer/books/${encodeURIComponent(id)}`,
          `${base}/api/oer/books/by-slug/${encodeURIComponent(id)}`,
          // collections endpoint (some backends store single-item collections)
          `${base}/api/oer/collections/${encodeURIComponent(id)}/items`,
          `${base}/api/oer/collections/by-slug/${encodeURIComponent(id)}/items`,
          // generic search
          `${base}/api/oer/items?collection=${encodeURIComponent(id)}`,
          `${base}/oer/collections/${encodeURIComponent(id)}/items`,
        ];

        let found: OerItem | null = null;
        for (const url of candidates) {
          try {
            const payload = await tryJson(url, headers);
            const o = firstHtmlishFromPayload(payload, id);
            if (o?.web_url) {
              found = o;
              break;
            }
          } catch {
            /* keep trying next candidate */
          }
        }

        if (!cancelled) {
          if (!found) {
            setError('No readable content found for this resource.');
            setItem(null);
          } else {
            setItem(found);
          }
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load resource.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, id, token]);

  const src = useMemo(() => {
    const u = item?.web_url || '';
    // Let the browser render HTML/PDF natively inside iframe/viewer.
    return u;
  }, [item]);

  const titleBase = item?.title ? `${item.title}` : 'Open Educational Resource';
  const pageTitle = item?.title
    ? `Open Educational Resource: ${item.title} | DayBreak`
    : 'Open Educational Resource | DayBreak';
  const description = item?.provider
    ? `Read open educational content from ${item.provider} on DayBreak.`
    : 'Read open educational content and materials on DayBreak.';

  const jsonLd = useMemo(() => {
    if (item?.title) {
      return [
        {
          '@context': 'https://schema.org',
          '@type': 'CreativeWork',
          name: item.title,
          url: item.web_url || undefined,
          publisher: item.provider ? { '@type': 'Organization', name: item.provider } : undefined,
        },
      ];
    }
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Open Educational Resource',
        description,
        url: location.pathname,
      },
    ];
  }, [description, item?.provider, item?.title, item?.web_url, location.pathname]);

  return (
    <div className="min-h-screen h-screen w-full flex flex-col bg-slate-50 dark:bg-[#0a0f15]">
      <SeoHead
        title={pageTitle}
        description={description}
        canonicalPath={location.pathname}
        jsonLd={jsonLd}
      />
      {/* Header */}
      <header className="shrink-0 sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-[#0a0f15]/80 border-b border-slate-200/70 dark:border-white/10">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => nav(-1)}
            className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-2 h-9 hover:bg-slate-100/80 dark:hover:bg-white/10"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate">{titleBase}</h1>
            <div className="text-[11px] text-slate-500 truncate">{item?.provider || 'OER'}</div>
          </div>
          {src && (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="h-9 px-3 rounded-xl ring-1 ring-slate-200/80 dark:ring-white/15 bg-white dark:bg-white/5 text-xs font-semibold inline-flex items-center gap-2"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" /> Open
            </a>
          )}
        </div>
      </header>

      {/* Canvas */}
      <main className="grow min-h-0">
        {loading && (
          <div className="h-full grid place-items-center text-sm text-slate-500">
            Loading resource…
          </div>
        )}
        {!loading && error && (
          <div className="h-full grid place-items-center text-sm text-red-600">{error}</div>
        )}
        {!loading && !error && src && (
          <iframe
            key={src}
            src={src}
            className="w-full h-full block"
            style={{ border: 0 }}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="clipboard-write"
            title={item?.title || 'OER'}
          />
        )}
        {!loading && !error && !src && (
          <div className="h-full grid place-items-center text-sm text-slate-500">
            No URL available for this resource.
          </div>
        )}
      </main>
    </div>
  );
};

export default OerReaderFull;

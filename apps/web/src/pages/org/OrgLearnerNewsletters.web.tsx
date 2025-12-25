// apps/web/src/pages/org/OrgLearnerNewsletters.web.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { apiGetLearnerNewsletter, apiListLearnerNewsletters } from '@mytutorapp/shared/api/orgProApi';
import { getAnnouncementFeed } from '@mytutorapp/shared/api/orgEngagementApi';

type LearnerNewsletter = {
  id: string | number;
  title?: string;
  term_label?: string;
  sent_at?: string;
  has_pdf?: boolean;
  content_md?: string;
};

type LearnerNewsletterListResponse = {
  items: LearnerNewsletter[];
};

type AnnouncementFeedResponse = {
  items: any[];
  page?: number;
  limit?: number;
  audiences?: string[];
  class_label?: string | null;
  scope?: string;
  diag?: any;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function stripThemeFromContent(md: string) {
  return String(md || '').replace(/^\s*<!--THEME[\s\S]*?-->\s*/i, '');
}

// ✅ copied vibe from OrgLearnerHome.web.tsx
const pageShell =
  'min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-darkTextPrimary px-3 sm:px-4 py-6';

const card =
  'rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#0b1220] p-4 sm:p-5 shadow-sm';

function pickString(...xs: any[]) {
  for (const x of xs) {
    const s = typeof x === 'string' ? x : x == null ? '' : String(x);
    if (s.trim()) return s.trim();
  }
  return '';
}

function fmtWhen(v?: any) {
  const s = pickString(v);
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function fmtDateOnly(v?: any) {
  const s = pickString(v);
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString();
}

function firstLine(s: string, max = 120) {
  const t =
    String(s || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)[0] || '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function errSnapshot(e: any) {
  const status = e?.response?.status ?? e?.status ?? null;
  const dataMsg = e?.response?.data?.message ?? e?.response?.data ?? null;
  const msg = e?.message ?? String(e);
  return { status, msg, dataMsg };
}

/** Learner announcement UI mapping (stable + forgiving) */
function mapAnnouncement(a: any) {
  const title = pickString(a?.title, a?.subject, 'Announcement');
  const whenRaw = pickString(a?.created_at, a?.start_at, a?.published_at, a?.sent_at, '');
  const bodyMd = pickString(a?.body, a?.agenda_md, a?.body_md, a?.content_md, a?.content, '');

  const pinned = Boolean(a?.pinned ?? a?.is_pinned);
  const category = pickString(a?.category, a?.kind, '').toLowerCase();
  const audience = pickString(a?.audience, 'all').toLowerCase();
  const classLabel = pickString(a?.class_label, a?.classLabel, a?.class, '');
  const status = pickString(a?.status, '').toLowerCase(); // live | scheduled | expired

  const meetingAt = pickString(a?.meeting_at, '');
  const meetingLoc = pickString(a?.meeting_location, '');
  const meetingUrl = pickString(a?.meeting_url, '');

  const hasMeeting = Boolean(meetingAt || meetingLoc || meetingUrl);

  return {
    raw: a,
    id: a?.id,
    title,
    whenRaw,
    bodyMd,
    pinned,
    category,
    audience,
    classLabel,
    status,
    meetingAt,
    meetingLoc,
    meetingUrl,
    hasMeeting,
  };
}

export const OrgLearnerNewslettersPage: React.FC = () => {
  const { org } = (useOrg?.() ?? {}) as any;
  const { backendUrl, orgToken } = useShopContext() as any;
  const orgId = org?.id as string | undefined;

  const { id } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement | null>(null);

  const debugId = useMemo(() => Math.random().toString(16).slice(2, 8), []);

  // ✅ Tabs
  const tabFromUrl = useMemo<'newsletters' | 'announcements'>(() => {
    const t = (sp.get('tab') || '').toLowerCase();
    return t === 'announcements' ? 'announcements' : 'newsletters';
  }, [sp]);

  const [tab, setTab] = useState<'newsletters' | 'announcements'>(tabFromUrl);
  useEffect(() => setTab(tabFromUrl), [tabFromUrl]);

  // ✅ announcement selection uses query param
  const announcementId = sp.get('aid') || '';

  // ✅ Newsletter PDF view state
  const [viewMode, setViewMode] = useState<'pdf' | 'text'>('pdf');
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const dbgCtx = useMemo(
    () => ({
      debugId,
      tab,
      routeNewsletterId: id || null,
      aid: announcementId || null,
      orgId: orgId || null,
      hasOrgToken: Boolean(orgToken),
      orgTokenPreview: orgToken ? `${String(orgToken).slice(0, 10)}…` : null,
      backendUrl: backendUrl || '(empty; orgEngagementApi may use env fallback)',
    }),
    [debugId, tab, id, announcementId, orgId, orgToken, backendUrl],
  );

  useEffect(() => {
    console.log('[OrgLearnerNewslettersPage] mount', dbgCtx);
    return () => console.log('[OrgLearnerNewslettersPage] unmount', { debugId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.log('[OrgLearnerNewslettersPage] ctx changed', dbgCtx);
  }, [dbgCtx]);

  // ─────────────────────────────────────────────
  // Lists
  // ─────────────────────────────────────────────
  const listNewslettersQ = useQuery<LearnerNewsletterListResponse, Error>({
    queryKey: ['learner-newsletters', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId,
    queryFn: async () => {
      console.log('[learner-newsletters] fetching', { debugId, orgId, backendUrl });
      const r = (await apiListLearnerNewsletters(backendUrl, String(orgId), orgToken)) as LearnerNewsletterListResponse;
      console.log('[learner-newsletters] response', {
        debugId,
        count: r?.items?.length ?? 0,
        sample: r?.items?.[0] || null,
      });
      return r;
    },
  });

  useEffect(() => {
    if (listNewslettersQ.error) {
      console.error('[learner-newsletters] error', { debugId, ...errSnapshot(listNewslettersQ.error) });
    }
  }, [debugId, listNewslettersQ.error]);

  const newsletters = useMemo(() => listNewslettersQ.data?.items || [], [listNewslettersQ.data]);

  // ✅ Announcements feed (learner view)
  const annFeedQ = useQuery<AnnouncementFeedResponse, Error>({
    queryKey: ['learner-announcements-feed', orgId],
    enabled: !!orgToken && !!orgId,

    // Keep it stable so UI doesn't jump
    placeholderData: {
      items: [],
      page: 1,
      limit: 50,
      scope: 'live_upcoming',
      class_label: null,
    },

    queryFn: async (): Promise<AnnouncementFeedResponse> => {
      console.log('[learner-announcements-feed] fetching', {
        debugId,
        orgId,
        backendUrl: backendUrl || '(empty -> env fallback expected)',
        tokenPresent: Boolean(orgToken),
      });

      const raw: any = await getAnnouncementFeed(backendUrl, orgToken, String(orgId), {
        page: 1,
        limit: 50,
        scope: 'live_upcoming',
        debug: 1,
      });

      // Normalize to { items: [] }
      if (Array.isArray(raw)) {
        return { items: raw, page: 1, limit: 50, scope: 'live_upcoming' };
      }
      if (raw && Array.isArray(raw.items)) {
        return raw as AnnouncementFeedResponse;
      }
      return { items: [], page: 1, limit: 50, scope: 'live_upcoming' };
    },
  });

  const announcements = useMemo(() => annFeedQ.data?.items || [], [annFeedQ.data]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    console.log('[learner-announcements-feed] snapshot', {
      orgId,
      hasBackendUrl: Boolean(backendUrl),
      hasOrgToken: Boolean(orgToken),
      tab,
      status: annFeedQ.status,
      error: annFeedQ.error ? String((annFeedQ.error as any)?.message || annFeedQ.error) : null,
      count: (annFeedQ.data?.items || []).length,
      meta: annFeedQ.data ? { scope: annFeedQ.data.scope, class_label: annFeedQ.data.class_label } : null,
    });

    const sample = (annFeedQ.data?.items || []).slice(0, 3).map((a: any) => ({
      id: a.id,
      title: a.title,
      audience: a.audience,
      class_label: a.class_label,
      status: a.status,
      start_at: a.start_at,
      end_at: a.end_at,
      pinned: a.pinned,
    }));
    console.log('[learner-announcements-feed] sample', sample);
  }, [orgId, backendUrl, orgToken, tab, annFeedQ.status, annFeedQ.error, annFeedQ.data]);

  const mappedAnnouncements = useMemo(() => announcements.map(mapAnnouncement), [announcements]);

  // ─────────────────────────────────────────────
  // Details (newsletter only)
  // ─────────────────────────────────────────────
  const newsletterDetailQ = useQuery<LearnerNewsletter, Error>({
    queryKey: ['learner-newsletter', orgId, id],
    enabled: tab === 'newsletters' && !!backendUrl && !!orgToken && !!orgId && !!id,
    queryFn: async () => {
      console.log('[learner-newsletter-detail] fetching', { debugId, orgId, id });
      const r = (await apiGetLearnerNewsletter(backendUrl, String(orgId), String(id), orgToken)) as LearnerNewsletter;
      console.log('[learner-newsletter-detail] response', {
        debugId,
        id: r?.id,
        has_pdf: r?.has_pdf,
        title: r?.title,
      });
      return r;
    },
  });

  useEffect(() => {
    if (newsletterDetailQ.error) {
      console.error('[learner-newsletter-detail] error', { debugId, ...errSnapshot(newsletterDetailQ.error) });
    }
  }, [debugId, newsletterDetailQ.error]);

  const selectedNewsletter = newsletterDetailQ.data || null;

  const selectedAnnouncement = useMemo(() => {
    if (!announcementId) return null;
    return mappedAnnouncements.find((a: any) => String(a.id) === String(announcementId)) || null;
  }, [mappedAnnouncements, announcementId]);

  // Newsletter: auto-switch if no pdf
  useEffect(() => {
    if (tab !== 'newsletters') return;
    if (!selectedNewsletter) return;
    if (!selectedNewsletter?.has_pdf && viewMode === 'pdf') setViewMode('text');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedNewsletter?.has_pdf, selectedNewsletter?.id]);

  // Newsletter: fetch PDF
  useEffect(() => {
    let alive = true;

    async function loadPdf() {
      if (tab !== 'newsletters') return;
      if (!backendUrl || !orgToken || !orgId || !selectedNewsletter?.id) return;

      setPdfError(null);

      if (!selectedNewsletter?.has_pdf) {
        if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
        setPdfObjectUrl(null);
        return;
      }

      setPdfLoading(true);
      setPdfError(null);

      try {
        const url = `${backendUrl}/api/org/${orgId}/learner/newsletters/${selectedNewsletter.id}/pdf`;
        console.log('[newsletter-pdf] fetching', { debugId, url });

        const r = await fetch(url, { headers: { Authorization: `Bearer ${orgToken}` } });
        if (!r.ok) throw new Error(await r.text());

        const blob = await r.blob();
        const objUrl = URL.createObjectURL(blob);

        if (!alive) {
          URL.revokeObjectURL(objUrl);
          return;
        }

        if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
        setPdfObjectUrl(objUrl);

        console.log('[newsletter-pdf] ready', { debugId, bytes: blob.size });
      } catch (e: any) {
        if (!alive) return;
        console.error('[newsletter-pdf] error', { debugId, ...errSnapshot(e) });
        setPdfError(e?.message || 'Failed to load PDF');
        if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
        setPdfObjectUrl(null);
      } finally {
        if (alive) setPdfLoading(false);
      }
    }

    loadPdf();

    return () => {
      alive = false;
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, backendUrl, orgToken, orgId, selectedNewsletter?.id, selectedNewsletter?.has_pdf]);

  const downloadPdfFromHtml = async (titleForFile: string) => {
    if (!printRef.current) return;

    const safeName = String(titleForFile || 'document')
      .trim()
      .replace(/[^\w\d-_]+/g, '_')
      .slice(0, 60);

    const { default: html2pdf } = await import('html2pdf.js');
    await html2pdf()
      .set({
        margin: 10,
        filename: `${safeName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(printRef.current)
      .save();
  };

  const downloadStoredPdf = (titleForFile: string) => {
    if (!pdfObjectUrl) return;

    const safeName = String(titleForFile || 'newsletter')
      .trim()
      .replace(/[^\w\d-_]+/g, '_')
      .slice(0, 60);

    const a = document.createElement('a');
    a.href = pdfObjectUrl;
    a.download = `${safeName}.pdf`;
    a.click();
  };

  // Tab switch handlers
  const goNewsletters = () => navigate('/org/learner/newsletters', { replace: false });
  const goAnnouncements = () => navigate('/org/learner/newsletters?tab=announcements', { replace: false });

  // Render fields
  const selectedTitle =
    tab === 'announcements'
      ? pickString(selectedAnnouncement?.title, 'Announcement')
      : pickString(selectedNewsletter?.title, 'Newsletter');

  const selectedWhen =
    tab === 'announcements' ? pickString(selectedAnnouncement?.whenRaw, '') : pickString(selectedNewsletter?.sent_at, '');

  const selectedMd =
    tab === 'announcements' ? pickString(selectedAnnouncement?.bodyMd, '') : pickString(selectedNewsletter?.content_md, '');

  const rightLoading = tab === 'announcements' ? annFeedQ.isLoading : newsletterDetailQ.isLoading;
  const rightError = tab === 'announcements' ? annFeedQ.error : newsletterDetailQ.error;

  const showDiag =
    tab === 'announcements' &&
    (!!annFeedQ.isFetching || !!annFeedQ.isError || mappedAnnouncements.length === 0 || sp.get('debug') === '1');

  // Theme-aware “pill” button base
  const pillBase =
    'px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:focus-visible:ring-white/20';

  return (
    <div className={pageShell}>
      <div className="max-w-screen-xl mx-auto space-y-4">
        <header className={cn(card, 'flex items-center justify-between gap-3')}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-600 dark:text-darkTextSecondary">
              LEARNER PORTAL
            </div>
            <h1 className="text-xl sm:text-2xl font-bold truncate mt-0.5">News &amp; announcements</h1>
            <div className="text-xs text-slate-600 dark:text-darkTextSecondary mt-0.5">
              Read newsletters and school announcements. Download as PDF anytime.
            </div>
          </div>

          <Link
            to="/org/learn"
            className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                       dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
          >
            ← Back
          </Link>
        </header>

        {/* Switcher */}
        <section className={card}>
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-white/15 dark:bg-white/5">
              <button
                type="button"
                onClick={goNewsletters}
                className={cn(
                  pillBase,
                  tab === 'newsletters'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-[#0b1220]'
                    : 'text-slate-700 hover:bg-white dark:text-white/80 dark:hover:bg-white/10',
                )}
              >
                Newsletters
              </button>
              <button
                type="button"
                onClick={goAnnouncements}
                className={cn(
                  pillBase,
                  tab === 'announcements'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-[#0b1220]'
                    : 'text-slate-700 hover:bg-white dark:text-white/80 dark:hover:bg-white/10',
                )}
              >
                Announcements
              </button>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-white/60">
              {tab === 'newsletters' ? 'Inbox' : 'School updates'}
            </div>
          </div>

          <p className="mt-2 text-sm text-slate-600 dark:text-darkTextSecondary">
            {tab === 'newsletters'
              ? 'Newsletters are longer school updates (often with PDF).'
              : 'Announcements are quick notices (urgent or time-sensitive).'}
          </p>

          {showDiag ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
              <div className="font-semibold text-slate-900 dark:text-white/90">Diagnostics</div>
              <div className="mt-1 grid gap-1">
                <div>debugId: {debugId}</div>
                <div>orgId: {String(orgId || '')}</div>
                <div>backendUrl: {backendUrl || '(empty -> env fallback expected)'}</div>
                <div>orgToken: {orgToken ? `${String(orgToken).slice(0, 10)}…` : '(missing)'}</div>
                <div>
                  feedStatus: {annFeedQ.status} {annFeedQ.isFetching ? '(fetching)' : ''}
                </div>
                <div>feedCount: {(annFeedQ.data?.items || []).length}</div>
                {annFeedQ.data ? (
                  <div className="text-slate-600 dark:text-white/70">
                    meta: scope={String(annFeedQ.data.scope || '')} • class_label={String(annFeedQ.data.class_label || '')}
                  </div>
                ) : null}
                {annFeedQ.isError ? (
                  <div className="text-rose-700 dark:text-rose-200">
                    feedError: {String((annFeedQ.error as any)?.message || annFeedQ.error)}
                  </div>
                ) : null}
                <div className="text-slate-500 dark:text-white/60">Console → filter “learner-announcements-feed”.</div>
              </div>
            </div>
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left */}
          <div className={cn(card, 'lg:col-span-4')}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{tab === 'newsletters' ? 'Inbox' : 'Announcements'}</div>
              {tab === 'newsletters' ? (
                listNewslettersQ.isLoading ? <div className="text-xs text-slate-500 dark:text-white/60">Loading…</div> : null
              ) : annFeedQ.isLoading ? (
                <div className="text-xs text-slate-500 dark:text-white/60">Loading…</div>
              ) : null}
            </div>

            <div className="mt-3 space-y-2 max-h-[70vh] overflow-auto pr-1">
              {tab === 'newsletters' ? (
                newsletters.length === 0 ? (
                  <div className="text-sm text-slate-600 dark:text-darkTextSecondary">No newsletters shared with you yet.</div>
                ) : (
                  newsletters.map((n: LearnerNewsletter) => (
                    <button
                      key={n.id}
                      onClick={() => navigate(`/org/learner/newsletters/${n.id}`)}
                      className={cn(
                        'w-full text-left rounded-2xl border px-3 py-3 transition',
                        'border-slate-200 bg-white hover:bg-slate-50',
                        'dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
                        String(id) === String(n.id) ? 'border-indigo-500/40 bg-indigo-500/10 dark:border-indigo-400/30' : '',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold">{n.title || 'Untitled'}</div>
                        {n.has_pdf ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700
                                           dark:border-white/10 dark:bg-white/10 dark:text-white/70">
                            PDF
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-white/60 mt-0.5">
                        {n.term_label || ''}
                        {n.term_label ? ' • ' : ''}
                        {n.sent_at ? fmtDateOnly(n.sent_at) : ''}
                      </div>
                    </button>
                  ))
                )
              ) : mappedAnnouncements.length === 0 ? (
                <div className="text-sm text-slate-600 dark:text-darkTextSecondary">
                  {annFeedQ.isLoading ? 'Loading announcements…' : 'No announcements yet.'}
                </div>
              ) : (
                mappedAnnouncements.map((a: any) => {
                  const isSelected = String(announcementId) === String(a.id);
                  const cat = (a.category || '').toUpperCase();
                  const showCat = Boolean(cat && cat !== 'GENERAL');
                  const preview = firstLine(a.bodyMd || '');

                  const st = (a.status || '').toUpperCase();
                  const showStatus = Boolean(st && st !== 'LIVE'); // keep list clean

                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/org/learner/newsletters?tab=announcements&aid=${a.id}`)}
                      className={cn(
                        'w-full text-left rounded-2xl border px-3 py-3 transition',
                        'border-slate-200 bg-white hover:bg-slate-50',
                        'dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
                        isSelected ? 'border-indigo-500/40 bg-indigo-500/10 dark:border-indigo-400/30' : '',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold">{a.title}</div>
                        <div className="flex items-center gap-1.5">
                          {a.pinned ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-900
                                             dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                              PINNED
                            </span>
                          ) : null}
                          {showStatus ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-900
                                             dark:border-indigo-400/25 dark:bg-indigo-500/10 dark:text-indigo-100">
                              {st}
                            </span>
                          ) : null}
                          {showCat ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700
                                             dark:border-white/10 dark:bg-white/10 dark:text-white/70">
                              {cat}
                            </span>
                          ) : null}
                          {a.hasMeeting ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-900
                                             dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100">
                              MEETING
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-white/60 mt-0.5">
                        {a.classLabel ? `${a.classLabel} • ` : ''}
                        {a.whenRaw ? fmtDateOnly(a.whenRaw) : ''}
                        {a.audience && a.audience !== 'all' ? ` • ${String(a.audience).toUpperCase()}` : ''}
                      </div>

                      {preview ? <div className="text-xs text-slate-700 dark:text-white/70 mt-1">{preview}</div> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right */}
          <div className={cn(card, 'lg:col-span-8')}>
            {tab === 'newsletters' && !id ? (
              <div className="text-sm text-slate-600 dark:text-darkTextSecondary">Select a newsletter from the left to read it.</div>
            ) : tab === 'announcements' && !announcementId ? (
              <div className="text-sm text-slate-600 dark:text-darkTextSecondary">Select an announcement from the left to read it.</div>
            ) : rightLoading ? (
              <div className="text-sm text-slate-600 dark:text-darkTextSecondary">Loading…</div>
            ) : rightError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-100">
                Could not load.{' '}
                <span className="text-slate-600 dark:text-white/70">{String((rightError as any)?.message || rightError)}</span>
              </div>
            ) : tab === 'announcements' && !selectedAnnouncement ? (
              <div className="text-sm text-slate-600 dark:text-darkTextSecondary">That announcement is no longer available.</div>
            ) : tab === 'newsletters' && !selectedNewsletter ? (
              <div className="text-sm text-slate-600 dark:text-darkTextSecondary">That newsletter is no longer available.</div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-bold truncate">{selectedTitle}</div>
                    <div className="text-xs text-slate-500 dark:text-white/60 mt-0.5">{selectedWhen ? fmtWhen(selectedWhen) : ''}</div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {tab === 'newsletters' && selectedNewsletter?.has_pdf ? (
                      <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-white/15 dark:bg-white/5">
                        <button
                          onClick={() => setViewMode('pdf')}
                          className={cn(
                            'px-3 py-1 text-[11px] rounded-full transition',
                            viewMode === 'pdf'
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-[#0b1220]'
                              : 'text-slate-700 hover:bg-white dark:text-white/70 dark:hover:bg-white/10',
                          )}
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => setViewMode('text')}
                          className={cn(
                            'px-3 py-1 text-[11px] rounded-full transition',
                            viewMode === 'text'
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-[#0b1220]'
                              : 'text-slate-700 hover:bg-white dark:text-white/70 dark:hover:bg-white/10',
                          )}
                        >
                          Text
                        </button>
                      </div>
                    ) : null}

                    <button
                      onClick={() => {
                        if (tab === 'newsletters') {
                          if (selectedNewsletter?.has_pdf) downloadStoredPdf(selectedTitle);
                          else downloadPdfFromHtml(selectedTitle);
                        } else {
                          downloadPdfFromHtml(selectedTitle);
                        }
                      }}
                      className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                                 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80 disabled:opacity-60"
                      disabled={tab === 'newsletters' && selectedNewsletter?.has_pdf ? pdfLoading || !pdfObjectUrl : false}
                      title="Download as PDF"
                    >
                      Download PDF
                    </button>
                  </div>
                </div>

                {/* “Paper” reader area */}
                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-white/10 dark:bg-white/5">
                  {tab === 'newsletters' && selectedNewsletter?.has_pdf && viewMode === 'pdf' ? (
                    pdfLoading ? (
                      <div className="text-sm text-slate-600 dark:text-white/70">Loading PDF…</div>
                    ) : pdfError ? (
                      <div className="text-sm text-rose-700 dark:text-rose-200">{pdfError}</div>
                    ) : pdfObjectUrl ? (
                      <iframe
                        title="Newsletter PDF"
                        src={pdfObjectUrl}
                        className="w-full h-[75vh] rounded-2xl border border-slate-200 dark:border-white/10 bg-white"
                      />
                    ) : (
                      <div className="text-sm text-slate-600 dark:text-white/70">PDF not available.</div>
                    )
                  ) : (
                    <div ref={printRef}>
                      <div className="prose max-w-none prose-slate dark:prose-invert">
                        <ReactMarkdown>{stripThemeFromContent(selectedMd || '')}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgLearnerNewslettersPage;

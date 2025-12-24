import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import {
  apiGetLearnerNewsletter,
  apiListLearnerNewsletters,
} from '@mytutorapp/shared/api/orgProApi';

function stripThemeFromContent(md: string) {
  return String(md || '').replace(/^\s*<!--THEME[\s\S]*?-->\s*/i, '');
}

const card = 'rounded-2xl ring-1 ring-white/10 bg-white/5 p-4 sm:p-5';

export const OrgLearnerNewslettersPage: React.FC = () => {
  const { org } = (useOrg?.() ?? {}) as any;
  const { backendUrl, orgToken } = useShopContext() as any;
  const orgId = org?.id as string | undefined;

  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement | null>(null);

  // ✅ NEW: PDF view state
  const [viewMode, setViewMode] = useState<'pdf' | 'text'>('pdf');
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['learner-newsletters', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId,
    queryFn: async () =>
      apiListLearnerNewsletters(backendUrl, String(orgId), orgToken),
  });

  const items = useMemo(() => listQ.data?.items || [], [listQ.data]);

  const detailQ = useQuery({
    queryKey: ['learner-newsletter', orgId, id],
    enabled: !!backendUrl && !!orgToken && !!orgId && !!id,
    queryFn: async () =>
      apiGetLearnerNewsletter(backendUrl, String(orgId), String(id), orgToken),
  });

  const selected = detailQ.data || null;

  // ✅ NEW: auto-switch to text if no pdf
  useEffect(() => {
    if (!selected) return;
    if (!selected?.has_pdf && viewMode === 'pdf') setViewMode('text');
    if (selected?.has_pdf && !id) setViewMode('pdf');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.has_pdf, selected?.id]);

  // ✅ NEW: fetch + render PDF from protected endpoint (Bearer)
  useEffect(() => {
    let alive = true;

    async function loadPdf() {
      if (!backendUrl || !orgToken || !orgId || !selected?.id) return;

      // cleanup previous object url before fetching new one
      setPdfError(null);

      if (!selected?.has_pdf) {
        if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
        setPdfObjectUrl(null);
        return;
      }

      setPdfLoading(true);
      setPdfError(null);

      try {
        const url = `${backendUrl}/api/org/${orgId}/learner/newsletters/${selected.id}/pdf`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${orgToken}` },
        });
        if (!r.ok) throw new Error(await r.text());

        const blob = await r.blob();
        const objUrl = URL.createObjectURL(blob);

        if (!alive) {
          URL.revokeObjectURL(objUrl);
          return;
        }

        // revoke old, set new
        if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
        setPdfObjectUrl(objUrl);
      } catch (e: any) {
        if (!alive) return;
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
  }, [backendUrl, orgToken, orgId, selected?.id, selected?.has_pdf]);

  const downloadPdfFromHtml = async () => {
    if (!printRef.current) return;

    const safeName = (selected?.title || 'newsletter')
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

  const downloadStoredPdf = () => {
    if (!pdfObjectUrl) return;

    const safeName = (selected?.title || 'newsletter')
      .trim()
      .replace(/[^\w\d-_]+/g, '_')
      .slice(0, 60);

    const a = document.createElement('a');
    a.href = pdfObjectUrl;
    a.download = `${safeName}.pdf`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-6">
      <div className="max-w-screen-xl mx-auto space-y-4">
        <header className={`${card} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/60">
              LEARNER PORTAL
            </div>
            <h1 className="text-xl sm:text-2xl font-bold truncate mt-0.5">
              School newsletters
            </h1>
            <div className="text-xs text-white/60 mt-0.5">
              Read what your school shared. Download as PDF anytime.
            </div>
          </div>

          <Link
             to="/org/learn"
            className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
          >
            ← Back
          </Link>
        </header>

        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left: list */}
          <div className={`${card} lg:col-span-4`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Inbox</div>
              {listQ.isLoading ? (
                <div className="text-xs text-white/60">Loading…</div>
              ) : null}
            </div>

            <div className="mt-3 space-y-2 max-h-[70vh] overflow-auto pr-1">
              {items.length === 0 ? (
                <div className="text-sm text-white/60">
                  No newsletters shared with you yet.
                </div>
              ) : (
                items.map((n: any) => (
                  <button
                    key={n.id}
                    onClick={() => navigate(`/org/learner/newsletters/${n.id}`)}
                    className={`w-full text-left rounded-xl border px-3 py-3 transition ${
                      String(id) === String(n.id)
                        ? 'border-indigo-400/40 bg-indigo-500/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold">{n.title}</div>

                      {/* ✅ NEW: tiny PDF badge */}
                      {n.has_pdf ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-white/70">
                          PDF
                        </span>
                      ) : null}
                    </div>

                    <div className="text-xs text-white/60 mt-0.5">
                      {n.term_label || ''}
                      {n.term_label ? ' • ' : ''}
                      {n.sent_at ? new Date(n.sent_at).toLocaleDateString() : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: reader */}
          <div className={`${card} lg:col-span-8`}>
            {!id ? (
              <div className="text-sm text-white/60">
                Select a newsletter from the left to read it.
              </div>
            ) : detailQ.isLoading ? (
              <div className="text-sm text-white/60">Loading newsletter…</div>
            ) : detailQ.isError ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
                Could not load this newsletter.{' '}
                <span className="text-white/70">
                  {String((detailQ.error as any)?.message || detailQ.error)}
                </span>
              </div>
            ) : selected ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="text-lg font-bold">{selected.title}</div>
                    <div className="text-xs text-white/60">
                      {selected.term_label || ''}
                      {selected.term_label ? ' • ' : ''}
                      {selected.sent_at ? new Date(selected.sent_at).toLocaleString() : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* ✅ NEW: PDF/Text toggle only when pdf exists */}
                    {selected?.has_pdf ? (
                      <div className="flex rounded-full border border-white/15 bg-white/5 p-1">
                        <button
                          onClick={() => setViewMode('pdf')}
                          className={`px-3 py-1 text-[11px] rounded-full transition ${
                            viewMode === 'pdf'
                              ? 'bg-white/15 text-white'
                              : 'text-white/70 hover:text-white'
                          }`}
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => setViewMode('text')}
                          className={`px-3 py-1 text-[11px] rounded-full transition ${
                            viewMode === 'text'
                              ? 'bg-white/15 text-white'
                              : 'text-white/70 hover:text-white'
                          }`}
                        >
                          Text
                        </button>
                      </div>
                    ) : null}

                    {/* ✅ NEW: download behavior (stored pdf if exists, else html-to-pdf) */}
                    <button
                      onClick={selected?.has_pdf ? downloadStoredPdf : downloadPdfFromHtml}
                      className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
                      disabled={selected?.has_pdf ? pdfLoading || !pdfObjectUrl : false}
                      title={
                        selected?.has_pdf
                          ? pdfLoading
                            ? 'Loading PDF…'
                            : 'Download the PDF your school sent'
                          : 'Download a PDF generated from this page'
                      }
                    >
                      Download PDF
                    </button>
                  </div>
                </div>

                {/* ✅ UPDATED: PDF iframe or markdown */}
                <div className="mt-4 rounded-2xl bg-white text-slate-900 p-4 sm:p-6">
                  {selected?.has_pdf && viewMode === 'pdf' ? (
                    pdfLoading ? (
                      <div className="text-sm text-slate-600">Loading PDF…</div>
                    ) : pdfError ? (
                      <div className="text-sm text-rose-700">{pdfError}</div>
                    ) : pdfObjectUrl ? (
                      <iframe
                        title="Newsletter PDF"
                        src={pdfObjectUrl}
                        className="w-full h-[75vh] rounded-xl border border-slate-200"
                      />
                    ) : (
                      <div className="text-sm text-slate-600">PDF not available.</div>
                    )
                  ) : (
                    <div ref={printRef}>
                      <div className="prose max-w-none">
                        <ReactMarkdown>
                          {stripThemeFromContent(selected.content_md || '')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgLearnerNewslettersPage;

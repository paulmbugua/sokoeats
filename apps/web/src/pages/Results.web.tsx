import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import PaymentWidget from '../components/PaymentWidget.web';
import { useAICertificates, useAiCourseEntitlements } from '@mytutorapp/shared/hooks';
import { downloadCertificateFile, downloadTranscriptFile } from '@mytutorapp/shared/api';

type GradeLike = {
  scorePct: number;
  passMark: number;
  passed: boolean;
};

function looksExtendedSku(sku: any): boolean {
  const s = (v: any) => (typeof v === 'string' ? v.toLowerCase() : '');
  const title = s(sku?.title);
  const code = s(sku?.code);
  const tier = s(sku?.tier || sku?.plan || sku?.level || sku?.kind);
  const tags = Array.isArray(sku?.tags) ? sku.tags.map(s) : [];
  return (
    tier.includes('extended') ||
    title.includes('extended') ||
    title.includes('transcript') ||
    /\b(ext|extended|xtra|plus)\b/.test(code) ||
    tags.includes('extended') ||
    tags.includes('transcript')
  );
}

function WatermarkPreview({
  title,
  pdfUrl,
  certId, // <-- new
  backendUrl, // <-- new
  folderHint = 'certificates',
}: {
  title: string;
  pdfUrl?: string | null;
  certId?: string | null;
  backendUrl?: string;
  folderHint?: 'certificates' | 'transcripts';
}) {
  const previewUrl = useMemo(() => {
    // Prefer brand-aware OG image if we have an id + backend
    if (certId && backendUrl) {
      return `${backendUrl.replace(/\/+$/, '')}/api/certificates/${certId}/og`;
    }
    // Fallback to first-page JPG from the raw PDF URL
    if (!pdfUrl) return null;
    try {
      const u = new URL(pdfUrl);
      const [left, right] = u.pathname.split('/upload/');
      if (!right) return null;
      return `${u.origin}${left}/upload/pg_1/${right.replace(/\.pdf$/i, '.jpg')}`;
    } catch {
      return null;
    }
  }, [certId, backendUrl, pdfUrl]);

  return (
    <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/5">
      <div className="px-3 pt-3">
        <div className="text-white font-semibold">{title}</div>
        <div className="text-white/60 text-xs mb-2">Preview (watermarked)</div>
      </div>
      <div className="relative">
        <div className="aspect-[4/3] bg-black/30 flex items-center justify-center">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`${title} preview`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-white/60 text-sm">No preview available</div>
          )}
        </div>
        {/* Watermark overlay */}
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          style={{ mixBlendMode: 'multiply' }}
        >
          <div className="rotate-12 text-4xl sm:text-6xl md:text-7xl font-black tracking-widest text-white/20">
            PREVIEW
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 text-white/60 text-xs">
        Downloads are clean (no watermark) after certificate payment.
      </div>
    </div>
  );
}

const ResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { backendUrl, token } = useShopContext();

  // We expect prior page (RobotTeacher) to push state with these:
  const {
    courseId,
    courseTitle,
    grade,
  }: { courseId?: string; courseTitle?: string; grade?: GradeLike } = (location.state as any) || {};

  const [paymentOpen, setPaymentOpen] = useState(false);

  const [cert, setCert] = useState<{ id: string; url: string; download_url?: string } | null>(null);
  const [trans, setTrans] = useState<{ id: string; url: string; download_url?: string } | null>(
    null
  );

  // Track verified payment status
  const [paymentOk, setPaymentOk] = useState(false);

  // Helper to call API (memoized for stable deps)
  const api = useCallback(
    async function <T = any>(path: string, init?: RequestInit): Promise<T> {
      const r = await fetch(`${backendUrl}${path}`, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (r.status === 204) return null as any;
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e: any = new Error((data as any)?.error || `Request failed: ${r.status}`);
        e.status = r.status;
        e.data = data;
        throw e;
      }
      return data;
    },
    [backendUrl, token]
  );

  // Attempt to fetch existing cert+transcript (they might already exist)
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!courseId) return;
      try {
        // Try to get existing certificate row via your existing endpoint (generate returns existing if found)
        const c = await api(`/api/certificates/generate`, {
          method: 'POST',
          body: JSON.stringify({ courseId }),
        }).catch((e) => {
          // 402 means payment needed — that’s fine; we’ll just show preview as locked.
          if ((e as any)?.status === 402) return null;
          throw e;
        });
        if (!abort && (c as any)?.id) setCert(c as any);
      } catch {}
      try {
        const t = await api(`/api/transcripts/generate`, {
          method: 'POST',
          body: JSON.stringify({ courseId }),
        }).catch((e) => {
          if ((e as any)?.status === 402) return null;
          throw e;
        });
        if (!abort && (t as any)?.id) setTrans(t as any);
      } catch {}
    })();
    return () => {
      abort = true;
    };
  }, [api, courseId]);

  const passed = Boolean(grade?.passed);

  // Verify payment from backend; fallback to presence of clean download URLs
  const checkPaymentStatus = useCallback(async () => {
    try {
      if (courseId) {
        const s = await api<{ paid?: boolean }>(
          `/api/certificates/status?courseId=${encodeURIComponent(courseId)}`
        ).catch(() => null);
        if (s && typeof s.paid === 'boolean') {
          setPaymentOk(s.paid);
          return;
        }
      }
    } catch {}
    setPaymentOk(Boolean(cert?.download_url || trans?.download_url));
  }, [api, courseId, cert?.download_url, trans?.download_url]);

  useEffect(() => {
    checkPaymentStatus();
  }, [checkPaymentStatus]);

  // 🔗 Tokens-first hook (AI certificates, no processor fees)
  const {
    skus,
    loading: aiCertLoading,
    error: aiCertError,
    message: aiCertMsg,
    claim,
    generate,
  } = useAICertificates({ backendUrl, token: token || '', courseId });
  const { items: aiCourses } = useAiCourseEntitlements({
    backendUrl,
    token: token || '',
  });

  return (
    <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-4 sm:py-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Results & Documents</h1>
            <div className="text-white/70 text-sm sm:text-base">
              {courseTitle ? <span className="font-medium">{courseTitle}</span> : 'Course'} • Your
              quiz results & downloads
            </div>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 text-sm"
          >
            Back
          </button>
        </div>

        {/* Score card */}
        <div
          className={`rounded-2xl p-4 ring-1 ${passed ? 'bg-emerald-500/10 ring-emerald-500/40' : 'bg-red-500/10 ring-red-500/40'}`}
        >
          <div className="text-white/80 text-sm">Score</div>
          <div className="text-2xl font-semibold">
            {grade ? `${grade.scorePct}%` : '—'}
            <span className="text-white/60 text-sm ml-2">(Pass mark {grade?.passMark ?? 70}%)</span>
          </div>
          <div className="mt-1 text-white/70">
            {passed
              ? 'Nice! You passed. You can unlock clean downloads.'
              : 'Review the lesson and try again to pass.'}
          </div>
        </div>

        {/* Two-column previews */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WatermarkPreview
            title="Certificate"
            pdfUrl={cert?.url || null}
            certId={cert?.id || null}
            backendUrl={backendUrl}
            folderHint="certificates"
          />

          <WatermarkPreview
            title="Transcript"
            pdfUrl={trans?.url || null}
            folderHint="transcripts"
          />
        </div>

        {aiCourses.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-semibold">Purchased AI courses</div>
                <div className="text-white/60 text-sm">Certificate purchases unlock up to 60 lessons</div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {aiCourses.map((item) => {
                const status = item.completion?.passed
                  ? 'Completed'
                  : item.completion?.attempted
                    ? 'In progress'
                    : 'Not started';
                return (
                  <div
                    key={item.course_id}
                    className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-white font-semibold truncate">{item.title}</div>
                        <div className="text-white/60 text-xs">Lessons used {item.lessons_used}/{item.max_lessons}</div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/80">{status}</span>
                    </div>
                    <div className="flex gap-2">
                      {!item.completion?.passed ? (
                        <Link
                          to={`/courses/${item.course_id}`}
                          className="text-sm px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                        >
                          Continue course
                        </Link>
                      ) : (
                        <Link
                          to={`/results?courseId=${encodeURIComponent(item.course_id)}`}
                          className="text-sm px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                        >
                          View certificate
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="rounded-2xl p-4 ring-1 ring-white/10 bg-white/5">
          <div className="text-white font-semibold mb-2">Downloads</div>
          <div className="text-white/70 text-sm mb-3">
            Pay the certificate fee once to download both the{' '}
            <span className="font-medium">Certificate</span> and{' '}
            <span className="font-medium">Transcript</span> without watermark.
          </div>

          {/* Tokens-first block (no fees) */}
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <div className="text-white font-medium text-sm">Claim with Tokens</div>
            <div className="text-white/70 text-xs mb-2">No processor fees for AI certificates.</div>

            {aiCertLoading && (
              <div className="text-xs text-white/60">Loading certificate options…</div>
            )}
            {aiCertError && <div className="text-xs text-red-300">{aiCertError}</div>}
            {aiCertMsg && <div className="text-xs text-emerald-300">{aiCertMsg}</div>}

            <div className="space-y-2">
              {(skus || []).map((sku) => (
                <div
                  key={sku.code}
                  className="flex items-center justify-between rounded-lg ring-1 ring-white/15 p-2 bg-white/5"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{sku.title}</div>
                    <div className="text-[11px] text-white/60">{sku.code}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {sku.price_tokens} Tokens
                    </span>
                    <button
                      disabled={!passed}
                      title={
                        !passed
                          ? 'Pass the quiz first'
                          : !paymentOk
                            ? 'Complete payment to enable claim & generate'
                            : 'Claim & generate'
                      }
                      onClick={async () => {
                        if (!token) return;
                        try {
                          await claim(sku.code);
                          const doc = await generate();
                          if ((doc as any)?.id) {
                            setCert({
                              id: (doc as any).id,
                              url: (doc as any).url,
                              download_url: (doc as any).download_url,
                            });
                            // ⬇️ If this was an Extended SKU, generate + download Transcript immediately
                            if (looksExtendedSku(sku) && courseId) {
                              try {
                                const t = await api(`/api/transcripts/generate`, {
                                  method: 'POST',
                                  body: JSON.stringify({ courseId }),
                                });
                                if (t?.id) setTrans(t);
                                if (t?.download_url) {
                                  // Kick off the download now
                                  window.location.href = t.download_url;
                                }
                              } catch (e) {
                                console.warn(
                                  '[Results] transcript generate after extended claim failed',
                                  e
                                );
                              }
                            }
                          }
                        } catch (e) {
                          console.error('[Results] token claim/generate failed', e);
                        }
                      }}
                      className={`px-3 py-1.5 rounded text-sm ${
                        passed
                          ? 'bg-emerald-600 hover:bg-emerald-500'
                          : 'bg-emerald-600/50 cursor-not-allowed'
                      } text-white`}
                    >
                      Claim &amp; Generate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPaymentOpen(true)}
              disabled={!passed}
              className={`h-10 px-4 rounded-lg text-sm font-semibold ${passed ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-indigo-600/40 cursor-not-allowed'}`}
              title={passed ? 'Open payment panel' : 'Pass the quiz to unlock payment'}
            >
              Pay certificate fee
            </button>

            {/* Once cert exists AND payment was done, your backend returns download_url */}
            <button
              onClick={async () => {
                if (!cert?.id) {
                  setPaymentOpen(true);
                  return;
                }
                const fileName = `${(courseTitle || 'certificate').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${cert.id}.pdf`;
                try {
                  await downloadCertificateFile(backendUrl, token || '', cert.id, fileName);
                } catch {
                  setPaymentOpen(true);
                }
              }}
              className={`h-10 px-4 rounded-lg text-sm font-semibold ${cert?.id ? 'bg-white/10 hover:bg-white/20 ring-1 ring-white/20' : 'bg-white/5 ring-1 ring-white/10'}`}
            >
              Download Certificate (PDF)
            </button>

            <button
              onClick={async () => {
                if (!trans?.id) {
                  setPaymentOpen(true);
                  return;
                }
                const fileName = `${(courseTitle || 'transcript').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${trans.id}.pdf`;
                try {
                  await downloadTranscriptFile(backendUrl, token || '', trans.id, fileName);
                } catch {
                  setPaymentOpen(true);
                }
              }}
              className={`h-10 px-4 rounded-lg text-sm font-semibold ${trans?.id ? 'bg-white/10 hover:bg-white/20 ring-1 ring-white/20' : 'bg-white/5 ring-1 ring-white/10'}`}
            >
              Download Transcript (PDF)
            </button>
          </div>

        {!passed && (
          <div className="mt-3 text-[12px] text-white/60">
            Tip: Revisit the lesson and retry the quiz to reach the pass mark.
          </div>
        )}
      </div>
    </div>

      {aiCourses.length > 0 && (
        <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-white/80 text-sm font-semibold">
            <span>Purchased AI courses</span>
            <span className="text-white/50 text-xs">certificate unlocks</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {aiCourses.map((c) => {
              const status = c.completion.passed
                ? 'Completed'
                : c.completion.attempted
                  ? 'In progress'
                  : 'Not started';
              return (
                <div
                  key={`${c.course_id}-${c.course_source}`}
                  className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3 flex flex-col gap-1"
                >
                  <div className="text-white font-semibold text-sm">{c.title || 'AI Course'}</div>
                  <div className="text-white/60 text-xs">Lessons: {c.lessons_used}/{c.max_lessons}</div>
                  <div className="text-xs text-white/70">
                    Status: <span className="font-semibold">{status}</span> (pass ≥ {c.completion.pass_mark}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment slide-over — same component you already use */}
      <PaymentWidget
        isOpen={paymentOpen}
        onClose={async () => {
          setPaymentOpen(false);
          // Re-try generation to get fresh download URLs after payment
          if (!courseId) return;
          try {
            const c = await fetch(`${backendUrl}/api/certificates/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ courseId }),
            }).then((r) => (r.ok ? r.json() : null));
            if (c?.id) setCert(c);
          } catch {}
          try {
            const t = await fetch(`${backendUrl}/api/transcripts/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ courseId }),
            }).then((r) => (r.ok ? r.json() : null));
            if (t?.id) setTrans(t);
            if (t?.download_url) {
              window.location.href = t.download_url; // auto download if Extended was just unlocked
            }
          } catch {}

          await checkPaymentStatus(); // ensure buttons reflect payment immediately
        }}
        title="Unlock Certificate"
        showTutorPreview={false}
      />
    </div>
  );
};

export default ResultsPage;

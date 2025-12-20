// apps/web/src/components/ClassVaultDetail.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { faFilePdf, faDownload, faShoppingCart } from '@fortawesome/free-solid-svg-icons';
import { useShopContext } from '@mytutorapp/shared/context';
import { useClassVaultDetail } from '@mytutorapp/shared/hooks/useClassVault';
import { fetchVideoReviews, submitVideoReview } from '@mytutorapp/shared/api/classVaultApi';
import type { VideoReview } from '@mytutorapp/shared/types';

export default function ClassVaultDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { backendUrl, token, profile } = useShopContext();
  const videoId = Number(id);

  // Detail hook (safe: always call)
  const { video, resources, unlockContent, error } = useClassVaultDetail(videoId);

  // ---------- All hooks must be above any conditional returns ----------
  // Unlocking feedback
  const [unlockError, setUnlockError] = useState<string>('');

  // Reviews state
  const [reviews, setReviews] = useState<VideoReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState<boolean>(false);
  const [reviewsError, setReviewsError] = useState<string>('');
  const [showPrompt, setShowPrompt] = useState<boolean>(false);

  // Video progress → prompt
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const promptedRef = useRef<boolean>(false);

  // Review form state
  const [saving, setSaving] = useState<boolean>(false);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');

  // Prevent duplicate unlock calls (e.g., React StrictMode double effects)
  const didRequestUnlockRef = useRef<boolean>(false);

  // Reset the gate if the video changes
  useEffect(() => {
    didRequestUnlockRef.current = false;
  }, [videoId]);

  // Fetch protected URLs on mount (guarded)
  useEffect(() => {
    if (didRequestUnlockRef.current) return;
    didRequestUnlockRef.current = true;
    unlockContent().catch((err: { message?: string }) => setUnlockError(err?.message || ''));
  }, [unlockContent, videoId]);

  // Load reviews
  const loadReviews = async (): Promise<void> => {
    try {
      setLoadingReviews(true);
      setReviewsError('');
      const data = await fetchVideoReviews(backendUrl, videoId);
      setReviews(data);
    } catch {
      setReviewsError('Failed to load reviews');
    } finally {
      setLoadingReviews(false);
    }
  };

  useEffect(() => {
    void loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, videoId]);

  // If user navigated with #review, open the prompt
  useEffect(() => {
    if (location.hash === '#review') {
      setShowPrompt(true);
    }
  }, [location.hash]);

  // Helpers to resolve URLs
  const resolveUrl = (maybeUrl?: string) => {
    if (!maybeUrl) return '';
    return maybeUrl.startsWith('http') ? maybeUrl : `${backendUrl}${maybeUrl}`;
  };

  // Reviews helpers
  const myId = profile?.id ? String(profile.id) : '';
  const hasMyReview = myId ? reviews.some((r) => String(r.student_id) === myId) : false;

  const avgRating =
    reviews.length > 0
      ? Number((reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length).toFixed(2))
      : 0;

  const onTimeUpdate = () => {
    if (promptedRef.current || hasMyReview) return;
    const el = videoRef.current;
    if (!el || !el.duration) return;
    const pct = el.currentTime / el.duration;
    if (pct >= 0.8) {
      promptedRef.current = true;
      setShowPrompt(true);
    }
  };

  // Submit review
  const doSubmit = async (): Promise<void> => {
    if (rating < 1) return;
    if (!token) {
      alert('You must be logged in to review');
      return;
    }
    try {
      setSaving(true);
      await submitVideoReview(backendUrl, token, videoId, {
        rating,
        comment: comment.trim() || undefined,
      });
      setShowPrompt(false);
      setComment('');
      setRating(0);
      await loadReviews();
    } catch {
      alert('Failed to submit review');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Conditional returns (no hooks below this line) ----------
  if (error) {
    return (
      <div
        className="relative min-h-screen flex items-center justify-center bg-slate-50 dark:bg-darkBg
                   text-[#0d141c] dark:text-darkTextPrimary px-4"
        style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
      >
        <div className="rounded-2xl w-full max-w-xl p-6 text-center ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821]">
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div
        className="relative min-h-screen flex items-center justify-center bg-slate-50 dark:bg-darkBg
                   text-[#0d141c] dark:text-darkTextPrimary px-4"
        style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
      >
        <div className="rounded-full p-4 ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821]">
          <svg className="animate-spin h-7 w-7 text-[#3d99f5]" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path className="opacity-75" fill="currentColor" d="M4 12a 8 8 0 018-8v8z" />
          </svg>
        </div>
      </div>
    );
  }

  // Safe to read values from `video` now
  const v = video;
  const tags = v.tags ?? [];

  const fullVideoUrl = resolveUrl(resources?.video_url);
  const previewUrl = resolveUrl(v.preview_url);
  const displayVideo = fullVideoUrl || previewUrl;
  const pdfUrl = resolveUrl(resources?.pdf_url);

  const openLink = (url: string) => {
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div
      className="relative min-h-screen flex justify-center bg-slate-50 dark:bg-darkBg
                 text-[#0d141c] dark:text-darkTextPrimary px-4 py-6"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <article className="w-full max-w-3xl space-y-5">
        {/* Title card */}
        <header className="rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-5">
          <h1 className="text-[22px] sm:text-2xl font-bold leading-tight tracking-[-0.015em] text-[#0d141c] dark:text-darkTextPrimary text-center">
            {v.title}
          </h1>
        </header>

        {/* Video card */}
        {displayVideo && (
          <section className="rounded-2xl overflow-hidden ring-1 ring-[#cedbe8] dark:ring-darkCard bg-black">
            <div className="w-full aspect-video bg-black">
              <video
                ref={videoRef}
                src={displayVideo}
                className="w-full h-full object-contain bg-black"
                controls
                autoPlay={!!fullVideoUrl}
                onTimeUpdate={onTimeUpdate}
              />
            </div>
          </section>
        )}

        {/* Meta + Description */}
        <section className="rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">Subject</p>
              <p className="text-[#0d141c] dark:text-darkTextPrimary font-semibold">
                {v.subject ?? '—'}
              </p>
            </div>

            <div className="flex flex-col">
              <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">Grade Level</p>
              <p className="text-[#0d141c] dark:text-darkTextPrimary font-semibold">
                {v.grade_level ?? '—'}
              </p>
            </div>
          </div>

          {v.description && (
            <div className="flex flex-col">
              <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">Description</p>
              <p className="text-[#0d141c] dark:text-darkTextPrimary leading-relaxed">
                {v.description}
              </p>
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-col">
              <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">Tags</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs sm:text-sm rounded-full px-2 py-1
                               bg-[#e7edf4] text-[#0d141c]
                               dark:bg-[#172534] dark:text-darkTextPrimary
                               ring-1 ring-[#cedbe8] dark:ring-darkCard"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Rating summary + prompt opener */}
        <section className="rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-sm">
              <span className="font-semibold">Rating:</span>{' '}
              <span>
                ★ {avgRating} ({reviews.length})
              </span>
              {loadingReviews && <span className="ml-2 text-[#49739c]">Loading…</span>}
              {reviewsError && <span className="ml-2 text-red-600">{reviewsError}</span>}
            </div>
            {!hasMyReview && (
              <button
                className="ml-auto text-sm underline text-[#3d99f5]"
                onClick={() => setShowPrompt(true)}
              >
                Rate this video
              </button>
            )}
          </div>
          {showPrompt && !hasMyReview && (
            <div className="mt-2 rounded-xl ring-1 ring-[#cedbe8] dark:ring-darkCard p-4">
              <p className="text-sm font-semibold mb-2">How was it?</p>
              <div className="flex items-center gap-2 mb-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    aria-label={`${n} star`}
                    className={n <= rating ? 'text-yellow-500 text-xl' : 'text-[#49739c] text-xl'}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional comment"
                maxLength={500}
                className="w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534]"
              />
              <div className="mt-2 flex gap-2">
                <button
                  disabled={saving || rating < 1}
                  onClick={doSubmit}
                  className="px-3 py-2 rounded bg-[#3d99f5] text-white font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Submit'}
                </button>
                <button
                  onClick={() => setShowPrompt(false)}
                  className="px-3 py-2 rounded ring-1 ring-[#cedbe8] dark:ring-darkCard"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-5 space-y-3">
          {v.pdf_url && (
            <button
              onClick={() => {
                if (pdfUrl) openLink(pdfUrl);
                else navigate('/buy-tokens');
              }}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl h-11 px-4 font-semibold transition
                ${
                  pdfUrl
                    ? 'bg-[#0d141c] text-white hover:brightness-110 dark:bg-[#0d141c]'
                    : 'bg-[#e7edf4] text-[#49739c] cursor-pointer'
                }`}
              title={pdfUrl ? 'Download Class Notes (PDF)' : 'Purchase to Access PDF'}
            >
              <FontAwesomeIcon
                icon={(pdfUrl ? faDownload : faShoppingCart) as IconProp}
                className="text-current"
              />
              <span>{pdfUrl ? 'Download Class Notes (PDF)' : 'Purchase to Access PDF'}</span>
            </button>
          )}

          <button
            onClick={() => {
              if (fullVideoUrl) openLink(fullVideoUrl);
              else navigate('/buy-tokens');
            }}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl h-11 px-4 font-semibold transition
              ${
                fullVideoUrl
                  ? 'bg-[#3d99f5] text-white hover:brightness-110'
                  : 'bg-[#e7edf4] text-[#49739c] cursor-pointer'
              }`}
            title={fullVideoUrl ? 'Download Full Video' : 'Purchase to Access Video'}
          >
            <FontAwesomeIcon
              icon={(fullVideoUrl ? faDownload : faShoppingCart) as IconProp}
              className="text-current"
            />
            <span>{fullVideoUrl ? 'Download Full Video' : 'Purchase to Access Video'}</span>
          </button>

          {unlockError && (
            <p className="text-amber-600 dark:text-amber-400 text-center text-sm">{unlockError}</p>
          )}

          {/* Small helper row */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <FontAwesomeIcon
              icon={faFilePdf as IconProp}
              className="text-[#49739c] dark:text-darkTextSecondary"
            />
            <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
              Downloads open in a new tab.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}

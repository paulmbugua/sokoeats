// apps/web/src/components/CertificateButton.web.tsx
import React, { useMemo, useState, useCallback } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCertificate } from '@mytutorapp/shared/hooks'; // ← singular
import { getCertificateDownloadUrl, downloadCertificateFile } from '@mytutorapp/shared/api';

const CertificateButton: React.FC<{ courseId: string; justPassed?: boolean }> = ({
  courseId,
  justPassed,
}) => {
  const { backendUrl, token } = useShopContext();

  const { eligible, eligibilityReason, certificate, loading, error, generate } = useCertificate({
    backendUrl,
    token,
    courseId,
    justPassed,
  });

  const [downloading, setDownloading] = useState(false);

  const filename = useMemo(() => {
    const anyCert = certificate as any;
    const raw =
      anyCert?.filename ||
      anyCert?.course_title ||
      anyCert?.course?.title ||
      `certificate-${anyCert?.id ?? courseId}`;
    const clean = String(raw)
      .replace(/[^\w\s.-]+/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    return `${clean}.pdf`;
  }, [certificate, courseId]);

  // Decide which URL the <a> should point to:
  // - Logged OUT: prefer public Cloudinary URL (certificate.url) → no auth needed
  // - Logged IN: secure /api/.../download (owner-checked), with JS fetch + auth header
  const downloadHref = useMemo(() => {
    if (!certificate) return null;
    const anyCert = certificate as any;

    // 1) If user is logged out, prefer the public Cloudinary URL
    if (!token && anyCert?.url && typeof anyCert.url === 'string') {
      return anyCert.url as string;
    }

    // 2) If backend attached a download_url (from generateCertificate), use it
    if (anyCert?.download_url && typeof anyCert.download_url === 'string') {
      return anyCert.download_url as string;
    }

    // 3) Fallback: secure API download route (requires auth)
    const id = anyCert.id as string | undefined;
    if (id) return getCertificateDownloadUrl(backendUrl, id);

    // 4) Last resort: Cloudinary URL if present
    return (anyCert?.url as string | undefined) ?? null;
  }, [certificate, backendUrl, token]);

  const onSecureDownload = useCallback(async () => {
    if (!certificate || downloading || !token) return;
    const id = (certificate as any).id as string;
    try {
      setDownloading(true);
      await downloadCertificateFile(backendUrl, token, id, filename);
    } catch (e: any) {
      console.error('[cert-btn] download error', e);
      alert(e?.message || 'Failed to download certificate');
    } finally {
      setDownloading(false);
    }
  }, [backendUrl, token, certificate, downloading, filename]);

  if (certificate) {
    const certId = (certificate as any).id;

    return (
      <div className="flex flex-wrap items-center gap-3">
        {/* Download */}
        <a
          href={downloadHref ?? '#'}
          // Logged OUT → open public URL in a new tab (no auth)
          // Logged IN → we intercept click and use fetch + auth header
          target={token ? undefined : '_blank'}
          rel={token ? undefined : 'noopener noreferrer'}
          className={`inline-flex items-center justify-center rounded-xl h-10 px-4 font-semibold ${
            downloading ? 'bg-green-600/70 cursor-wait' : 'bg-green-600 hover:bg-green-700'
          } text-white`}
          onClick={(e) => {
            if (token) {
              // Use secure, owner-checked download with Authorization header
              e.preventDefault();
              if (!downloading) onSecureDownload();
            }
          }}
          aria-busy={downloading}
          aria-disabled={downloading}
        >
          {downloading ? 'Downloading…' : 'Download Certificate'}
        </a>

        {/* Verify page (SPA route) */}
        <a
          href={`/verify/${certId}`}
          className="inline-flex items-center justify-center rounded-xl h-10 px-4 bg-[#e7edf4] text-[#0d141c] font-semibold hover:brightness-95"
        >
          Verify
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className={`inline-flex items-center justify-center rounded-xl h-10 px-4 font-semibold ${
          eligible
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
        }`}
        onClick={() => generate().catch(() => {})}
        disabled={!eligible || loading}
      >
        {loading ? 'Generating…' : 'Generate Certificate'}
      </button>

      {!eligible && eligibilityReason && (
        <p className="text-sm text-[#49739c]">{eligibilityReason}</p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
};

export default CertificateButton;

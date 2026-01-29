'use client';

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useVerifyCertificate } from '@mytutorapp/shared/hooks/useVerifyCertificate';
import { useShopContext } from '@mytutorapp/shared/context';

const VerifyCertificatePage: React.FC = () => {
  // Works for BOTH routes:
  // - /verify/:id
  // - /verify/no/:certNo
  const params = useParams<{ id?: string; certNo?: string }>();
  const { backendUrl } = useShopContext();

  const certificateId = params.id || '';
  const certNo = params.certNo || '';

  const { data, loading, error } = useVerifyCertificate({
    backendUrl,
    certificateId: certificateId || undefined,
    certNo: certNo || undefined,
  });

  const certIdFromData = data?.valid ? String(data?.certificate?.id || '') : '';
  const certNoFromData = data?.valid ? String(data?.certificate?.certificate_number || '') : '';

  const certLabel = certNoFromData || certNo || certIdFromData || certificateId || '';
  const printId = certIdFromData || certificateId; // print route expects UUID

  return (
    <div className="min-h-screen bg-slate-50 text-[#0d141c]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <header className="flex items-center gap-3 mb-8">
          <span className="size-6 text-[#0d141c]">
            <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
              <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold">Verify Certificate</h1>
        </header>

        {loading && (
          <div className="rounded-xl border border-[#cedbe8] bg-white p-6">Verifying…</div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <p className="text-red-600 font-semibold">Verification Error</p>
            <p className="text-sm text-[#49739c] mt-2">{error}</p>
          </div>
        )}

        {!loading &&
          data &&
          (data.valid ? (
            <div className="rounded-2xl border border-[#cedbe8] bg-white p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center rounded-full bg-green-100 text-green-700 w-6 h-6">
                  ✓
                </span>
                <p className="text-green-700 font-semibold">Valid Certificate</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <DetailRow label="Certificate Number" value={certNoFromData || (certNo || '-')} />
                <DetailRow label="Certificate ID" value={data.certificate?.id} />
                <DetailRow label="Student" value={data.certificate?.student_name} />
                <DetailRow label="Course" value={data.certificate?.course_title} />
                <DetailRow
                  label="Issued At"
                  value={
                    data.certificate?.issued_at
                      ? new Date(data.certificate.issued_at).toLocaleString()
                      : '-'
                  }
                />
              </div>

              <div className="pt-2 flex gap-3 flex-wrap">
                {data.certificate?.url && (
                  <a
                    href={data.certificate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl h-10 px-4 bg-blue-600 text-white font-semibold hover:bg-blue-700"
                  >
                    View / Download PDF
                  </a>
                )}

                {printId ? (
                  <Link
                    to={`/verify/${printId}/print`}
                    className="inline-flex items-center justify-center rounded-xl h-10 px-4 bg-white ring-1 ring-[#cedbe8] font-semibold"
                  >
                    Print View
                  </Link>
                ) : null}

                <Link
                  to="/"
                  className="inline-flex items-center justify-center rounded-xl h-10 px-4 bg-[#e7edf4] text-[#0d141c] font-semibold"
                >
                  Back Home
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-red-200 bg-white p-6">
              <p className="text-red-600 font-semibold">Invalid Certificate</p>
              <p className="text-sm text-[#49739c] mt-2">
                {data.error || 'No matching certificate found.'}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value?: string | number | null }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between">
    <p className="text-sm text-[#49739c]">{label}</p>
    <p className="text-sm font-medium text-[#0d141c]">{value ?? '-'}</p>
  </div>
);

export default VerifyCertificatePage;

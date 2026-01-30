'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useVerifyCertificate } from '@mytutorapp/shared/hooks/useVerifyCertificate';
import { useShopContext } from '@mytutorapp/shared/context';

const A4_MM_WIDTH = 210; // mm
const A4_MM_HEIGHT = 297; // mm
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.daybreaklearner.com';

const VerifyCertificatePrintPage: React.FC = () => {
  const params = useParams<{ id?: string }>();
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? '';
  const { backendUrl } = useShopContext();
  const { data, loading, error } = useVerifyCertificate({ backendUrl, certificateId: id });

  const cert = data?.certificate;
  return (
    <div className="min-h-screen bg-slate-50 text-[#0d141c]">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Toolbar (hidden in print) */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <div className="flex items-center gap-3">
            <span className="size-6 text-[#0d141c]">
              <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
                <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
              </svg>
            </span>
            <h1 className="text-xl font-bold">Verify Certificate (Print)</h1>
          </div>
          <div className="flex gap-2">
            {cert?.url && (
              <a
                href={cert.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl h-10 px-4 bg-blue-600 text-white font-semibold hover:bg-blue-700"
              >
                Download PDF
              </a>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center rounded-xl h-10 px-4 bg-[#e7edf4] text-[#0d141c] font-semibold"
            >
              Print
            </button>
            <Link
              href={`/verify/${id}`}
              className="inline-flex items-center justify-center rounded-xl h-10 px-4 bg-white ring-1 ring-[#cedbe8] font-semibold"
            >
              Back
            </Link>
          </div>
        </div>

        {/* A4 paper */}
        <div className="flex justify-center">
          <div
            className="bg-white shadow print:shadow-none print:border print:border-[#e5e7eb]"
            id="print-root"
          >
            <div className="p-10" style={{ width: '210mm', minHeight: '297mm' }}>
              {loading && <p>Verifying…</p>}
              {!loading && error && (
                <div className="rounded-xl border border-red-200 bg-white p-6">
                  <p className="text-red-600 font-semibold">Verification Error</p>
                  <p className="text-sm text-[#49739c] mt-2">{error}</p>
                </div>
              )}
              {!loading &&
                data &&
                (data.valid ? (
                  <PrintableContent
                    certId={id}
                    issuedAt={cert!.issued_at}
                    student={cert!.student_name!}
                    course={cert!.course_title!}
                    pdfUrl={cert!.url}
                  />
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
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @page { size: ${A4_MM_WIDTH}mm ${A4_MM_HEIGHT}mm; margin: 12mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          #print-root { box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
};

const PrintableContent: React.FC<{
  certId: string;
  issuedAt: string;
  student: string;
  course: string;
  pdfUrl: string;
}> = ({ certId, issuedAt, student, course, pdfUrl }) => {
  const issued = useMemo(() => new Date(issuedAt).toDateString(), [issuedAt]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-6">
        <div className="flex items-center gap-3">
          <span className="size-8 text-[#0d141c]">
            <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
              <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
            </svg>
          </span>
          <div>
            <p className="text-xs text-[#64748b]">Daybreak</p>
            <h2 className="text-lg font-bold">Certificate Verification</h2>
          </div>
        </div>
        <div className="text-right text-xs text-[#64748b]">
          <p>Certificate ID:</p>
          <p className="font-mono text-[#0f172a]">{certId}</p>
        </div>
      </div>

      {/* Body */}
      <div className="py-10">
        <h3 className="text-3xl font-extrabold text-center tracking-tight">Valid Certificate</h3>
        <p className="text-center text-[#64748b] mt-1">
          This page confirms the authenticity of the certificate below.
        </p>

        <div className="grid grid-cols-2 gap-6 mt-10">
          <div className="rounded-xl border border-[#e5e7eb] p-5">
            <Detail label="Student" value={student} />
            <Detail label="Course" value={course} />
            <Detail label="Issued On" value={issued} />
            <Detail label="Certificate ID" value={certId} mono />
          </div>
          <div className="rounded-xl border border-[#e5e7eb] p-5">
            <p className="text-sm text-[#64748b]">Certificate PDF</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2 rounded-lg border border-[#cedbe8] p-3 hover:bg-slate-50"
            >
              <span className="text-sm font-semibold text-blue-700">Open / Download PDF</span>
            </a>
            <p className="text-xs text-[#94a3b8] mt-2">
              The PDF contains embedded branding, instructor signature and QR verification link.
            </p>
          </div>
        </div>

        <div className="mt-10 text-center text-xs text-[#94a3b8]">
          To verify offline, scan the QR code on the certificate or visit
          {`${SITE_URL}/verify/${certId}`}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-6 border-t border-[#e5e7eb] text-center text-xs text-[#94a3b8]">
        © {new Date().getFullYear()} Daybreak • {SITE_URL}
      </div>
    </>
  );
};

const Detail: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="py-2">
    <p className="text-xs text-[#64748b]">{label}</p>
    <p className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{value}</p>
  </div>
);

export default VerifyCertificatePrintPage;

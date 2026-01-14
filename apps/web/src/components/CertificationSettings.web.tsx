// apps/web/src/components/CertificationSettings.web.tsx

import React, { useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import Spinner from './Spinner.web';
import useCertificationSettings, { Base64File } from '@mytutorapp/shared/hooks/useCertificationSettings';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export default function CertificationSettings() {
  const { token, backendUrl, profile } = useShopContext();
  const { uploading, certificationData, handleSubmit } = useCertificationSettings(
    backendUrl,
    token,
    profile?.id
  );

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Helper: check if current user is a tutor
  const isTutor = profile?.role?.toLowerCase() === 'tutor';

  // Convert File → base64 string
  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Handle <input type="file" />
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const valid = files.filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" exceeds 5MB.`);
        return false;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        alert(`"${file.name}" must be PDF, JPEG, or PNG.`);
        return false;
      }
      return true;
    });
    setSelectedFiles(valid);
  };

  // Form submission
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTutor) return;
    if (selectedFiles.length === 0) {
      alert('Please select at least one file.');
      return;
    }
    try {
      const base64Files: Base64File[] = await Promise.all(
        selectedFiles.map((file) =>
          toBase64(file).then((b) => ({
            name: file.name,
            type: file.type,
            base64: b,
          }))
        )
      );
      await handleSubmit(base64Files);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Upload failed:', err);
      alert(err?.message || 'Upload error');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Layout shell (theme-aware, centered, padded)
  // ─────────────────────────────────────────────────────────────
  const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#0b1016]">
      {/* soft background orbs (optional, matches your modern pages) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-pink-500/10 dark:bg-pink-500/10" />
        <div className="absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-sky-500/10 dark:bg-sky-500/10" />
      </div>

      {/* center container */}
      <div className="relative mx-auto w-full max-w-3xl px-4">
        <div className="pt-10 pb-16 sm:pt-14 sm:pb-20">{children}</div>
      </div>
    </div>
  );

  // Show spinner while uploading
  if (uploading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      </PageShell>
    );
  }

  // Only tutors can see the upload form
  if (!isTutor) {
    return (
      <PageShell>
        <div className="mx-auto w-full rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 shadow-sm p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-[2px] uppercase text-pink-600/80 dark:text-pink-400">
                Tutor Tools
              </p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-[#0d141c] dark:text-white">
                Tutor Certification
              </h2>
              <p className="mt-2 text-sm text-[#49739c] dark:text-white/70">
                Certification upload is available only for tutors.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-[#e7edf4] dark:bg-[#172534] p-4 border border-[#cedbe8] dark:border-white/10">
            <p className="text-sm text-[#0d141c] dark:text-white/90">
              If you are a tutor, please switch to your tutor profile to submit your documents.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  const showSubmitBlock = !certificationData || certificationData.status === 'Pending';
  const ctaLabel = certificationData ? 'Update Certification' : 'Submit Certification';

  return (
    <PageShell>
      <div className="mx-auto w-full rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 shadow-sm p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs tracking-[2px] uppercase text-pink-600/80 dark:text-pink-400">
              Tutor Tools
            </p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-[#0d141c] dark:text-white">
              Tutor Certification
            </h2>
            <p className="mt-2 text-sm text-[#49739c] dark:text-white/70">
              (Optional) Enhance your profile’s credibility by submitting your qualification documents.
              You can upload multiple files (each max 5MB, PDF/JPEG/PNG).
            </p>
          </div>

          {/* status pill (if exists) */}
          {certificationData?.status ? (
            <div
              className={[
                'shrink-0 rounded-full px-3 py-1 text-xs font-bold border',
                certificationData.status === 'Verified'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
              ].join(' ')}
              title="Your current certification status"
            >
              {certificationData.status}
            </div>
          ) : null}
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#0d141c] dark:text-white mb-2">
              Certification Documents
            </label>

            <div className="rounded-xl bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 p-3">
              <input
                id="certFiles"
                type="file"
                multiple
                accept=".pdf,image/jpeg,image/png"
                onChange={onFileChange}
                className="block w-full text-sm text-[#0d141c] dark:text-white
                  file:mr-4 file:rounded-lg file:border-0
                  file:bg-white file:text-[#0d141c]
                  dark:file:bg-[#0f1821] dark:file:text-white
                  file:px-4 file:py-2 file:font-semibold
                  file:shadow-sm file:border file:border-[#cedbe8]
                  dark:file:border-white/10
                  focus:outline-none"
              />

              <p className="mt-2 text-xs text-[#49739c] dark:text-white/60">
                Tip: Upload clear scans/photos. Accepted: PDF/JPEG/PNG. Max 5MB per file.
              </p>

              {selectedFiles.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-[#0d141c] dark:text-white/90">
                  {selectedFiles.map((f) => (
                    <li key={f.name} className="flex items-center gap-2">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-pink-500/80" />
                      <span className="truncate">{f.name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {showSubmitBlock ? (
            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-extrabold shadow-sm transition"
            >
              {ctaLabel}
            </button>
          ) : (
            <div className="mt-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 p-4">
              <p className="text-sm text-emerald-900 dark:text-emerald-100">
                Certification status:{' '}
                <span className="font-extrabold">{certificationData?.status}</span>
              </p>
              <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                Your documents have been verified. The “Certified” badge will appear on your tutor card.
              </p>
            </div>
          )}

          {/* footer spacing reassurance */}
          <div className="pt-2">
            <p className="text-[11px] text-[#49739c] dark:text-white/50">
              Need help? Ensure your documents are readable and match the name on your profile.
            </p>
          </div>
        </form>
      </div>
    </PageShell>
  );
}

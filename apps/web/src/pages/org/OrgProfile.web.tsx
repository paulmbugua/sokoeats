// apps/web/src/pages/org/OrgProfile.web.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck2, Wallet, Mail, Megaphone } from 'lucide-react';

import { useShopContext } from '@mytutorapp/shared/context';
import { getMyOrgOrBootstrap, getOrgUsage, uploadAsset } from '@mytutorapp/shared/api';
import { setOrgLearnerPhotoByAdmission } from '@mytutorapp/shared/api/orgLearnersApi';

import ThemeToggle from '../../components/ThemeToggle.web';

import { Skeleton, resolveAsset, tierBadge, cardBase } from './portal/OrgProfileShared.web';

/* ----------------------------- local types ----------------------------- */

type Org = {
  id: string;
  name?: string;
  slug?: string;
  logo_url?: string;
  signature_url?: string;
  certificate_title?: string;
  tier?: 'starter' | 'pro' | 'enterprise';
  seats_used?: number;
  owner_email?: string;
  email_domain?: string;

  // School contact fields
  address_line1?: string;
  address_line2?: string;
  phone_number?: string;
  contact_email?: string;
  website_url?: string;

  // Learner grouping labels
  house_label?: string;
  dorm_label?: string;
  club_label?: string;
};

/* ------------------------------- page -------------------------------- */

const OrgProfilePage: React.FC = () => {
  const nav = useNavigate();
  const { backendUrl, orgToken, setOrgToken } = useShopContext() as any;

  const [org, setOrg] = useState<Org | null>(null);
  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [seatsMax, setSeatsMax] = useState<number>(50);
  const [loading, setLoading] = useState(true);

  // learner photos state
  const [photoAdmCode, setPhotoAdmCode] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);

  const seatCap = useCallback((tier?: string) => {
    switch ((tier || 'starter').toLowerCase()) {
      case 'enterprise':
        return 5000;
      case 'pro':
        return 500;
      default:
        return 50;
    }
  }, []);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!orgToken) {
        setLoading(false);
        return;
      }
      try {
        const o = await getMyOrgOrBootstrap(backendUrl, orgToken);
        if (stop) return;

        setOrg(o);
        setSeatsMax(seatCap(o?.tier));

        try {
          const u = await getOrgUsage(backendUrl, orgToken, o.id);
          if (!stop) setSeatsUsed(Number(u?.seats_used ?? 0));
        } catch {
          if (!stop) setSeatsUsed(Number(o?.seats_used ?? 0));
        }
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [backendUrl, orgToken, seatCap]);

  const logo = useMemo(
    () => resolveAsset(org?.logo_url, backendUrl, org?.name),
    [org?.logo_url, backendUrl, org?.name]
  );

  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100));
  const hasGroupingLabels =
    !!org?.house_label?.trim() || !!org?.dorm_label?.trim() || !!org?.club_label?.trim();

  const logoutOrgMode = () => {
    try {
      localStorage.removeItem('auth:mode');
      localStorage.removeItem('auth:orgId');
      localStorage.removeItem('auth:returnTo:org');
      // clear org role/active to avoid stale redirects
      localStorage.removeItem('org:role');
      localStorage.removeItem('org:activeId');
    } catch {
      // ignore
    }
    nav('/profile/me', { replace: true });
  };

  // full institution logout (clears JWT + org mode and returns to org login)
  const logoutInstitution = async () => {
    try {
      await setOrgToken?.('');

      localStorage.removeItem('orgToken');
      localStorage.removeItem('auth:mode');
      localStorage.removeItem('auth:orgId');
      localStorage.removeItem('auth:token');
      localStorage.removeItem('org:role');
      localStorage.removeItem('org:activeId');
      sessionStorage.removeItem('auth:returnTo');
      sessionStorage.removeItem('auth:returnTo:org');
    } catch {
      // ignore
    }

    window.location.assign('/org/portal/login?logout=1');
  };

  /* --------------------------- unauthenticated --------------------------- */
  if (!orgToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-darkBg">
        <div className={`${cardBase} w-full max-w-md p-6`}>
          <h1 className="text-xl font-bold">Institution Profile</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-darkTextSecondary">
            Please sign in as an institution to continue.
          </p>
          <div className="mt-4">
            <Link
              to="/org/portal/login"
              className="inline-flex h-10 px-4 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Institution Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- render -------------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary">
      {/* Hero */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-indigo-600 to-cyan-500 opacity-20 dark:opacity-25" />
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 pt-8 pb-4">
          <div className={`${cardBase} p-4 sm:p-5 lg:p-6 backdrop-blur-sm`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                {loading ? (
                  <Skeleton className="h-16 w-16 rounded-xl" />
                ) : (
                  <img
                    src={logo}
                    alt="Org logo"
                    className="h-16 w-16 rounded-xl object-cover ring-1 ring-black/5 dark:ring-white/10 bg-white"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                      {loading ? <Skeleton className="h-6 w-48" /> : org?.name || 'Institution'}
                    </h1>
                    {!loading && (
                      <span
                        className={
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
                          tierBadge(org?.tier)
                        }
                        title="Current plan"
                      >
                        {(org?.tier || 'starter').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                    {loading ? (
                      <Skeleton className="h-4 w-28 mt-1" />
                    ) : org?.slug ? (
                      `@${org.slug}`
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden sm:block">
                  <ThemeToggle />
                </div>

                <Link
                  to="/org/portal"
                  className="inline-flex h-10 px-4 items-center rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Open E-Learning Portal
                </Link>

                <Link
                  to="/org/roster"
                  className="inline-flex h-10 px-4 items-center rounded-xl bg-[#e7edf4] dark:bg-[#172534] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Open Roster
                </Link>

                <button
                  onClick={logoutOrgMode}
                  className="inline-flex h-10 px-4 items-center rounded-xl bg-[#e7edf4] dark:bg-[#172534] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Exit org mode
                </button>

                <button
                  onClick={logoutInstitution}
                  className="inline-flex h-10 px-4 items-center rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  title="Sign out of your institution account"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* Seat usage strip */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 dark:bg-[#0b1620] ring-1 ring-black/5 dark:ring-white/10 p-3">
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">Seats used</div>
                {loading ? (
                  <>
                    <Skeleton className="h-7 w-32 mt-2" />
                    <Skeleton className="h-2 w-full mt-2" />
                  </>
                ) : (
                  <>
                    <div className="mt-1 text-2xl font-extrabold">
                      {seatsUsed}/{seatsMax}
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-gray-200 dark:bg-[#182534] overflow-hidden">
                      <div
                        className={`h-full ${seatPct >= 90 ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${seatPct}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-[#0b1620] ring-1 ring-black/5 dark:ring-white/10 p-3">
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">Plan</div>
                {loading ? (
                  <Skeleton className="h-7 w-24 mt-2" />
                ) : (
                  <>
                    <div className="mt-1 text-2xl font-extrabold">
                      {(org?.tier || 'starter').toUpperCase()}
                    </div>
                    <Link
                      to="/org/portal?tab=branding"
                      className="mt-2 inline-flex h-8 px-3 items-center rounded-lg bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
                    >
                      Manage plan
                    </Link>
                  </>
                )}
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-[#0b1620] ring-1 ring-black/5 dark:ring-white/10 p-3">
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                  Certificates
                </div>
                {loading ? (
                  <Skeleton className="h-5 w-48 mt-2" />
                ) : (
                  <>
                    <div className="mt-1 font-semibold line-clamp-1">
                      {org?.certificate_title || 'Certificate of Completion'}
                    </div>
                    <div className="mt-1 text-xs text-[#49739c] dark:text-darkTextSecondary">
                      Signature &amp; pass marks in Branding.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pb-8">
        {/* Pro tools summary */}
        <section className={`${cardBase} p-4 sm:p-5 mb-4`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[#49739c] dark:text-darkTextSecondary">
                Pro &amp; Enterprise
              </p>
              <h2 className="text-lg font-bold">Org tools hub</h2>
              <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                Attendance, fees &amp; balances, newsletters, and announcements for your institution.
              </p>
            </div>
            <Link
              to="/org/portal?tab=tools"
              className="inline-flex h-10 items-center rounded-xl bg-[#3d99f5] px-4 text-sm font-semibold text-white shadow hover:bg-[#2e7ad2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3d99f5]"
            >
              Open in portal
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* Attendance */}
            <Link
              to="/org/attendance"
              className="rounded-xl border border-[#e7edf4] bg-white p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition dark:border-white/10 dark:bg-[#0b1420]"
            >
              <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:text-left sm:justify-between">
                <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-2">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7edf4] dark:bg-[#172534]">
                    <CalendarCheck2 className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Attendance</div>
                    <p className="hidden sm:block text-xs text-[#49739c] dark:text-darkTextSecondary">
                      Create sessions and bulk mark learners.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-[#3d99f5]">Pro</span>
              </div>
            </Link>

            {/* Fees */}
            <Link
              to="/org/fees"
              className="rounded-xl border border-[#e7edf4] bg-white p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition dark:border-white/10 dark:bg-[#0b1420]"
            >
              <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:text-left sm:justify-between">
                <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-2">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7edf4] dark:bg-[#172534]">
                    <Wallet className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Fees</div>
                    <p className="hidden sm:block text-xs text-[#49739c] dark:text-darkTextSecondary">
                      Charges, payments, and statements.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-[#3d99f5]">Pro</span>
              </div>
            </Link>

            {/* Newsletters */}
            <Link
              to="/org/newsletters"
              className="rounded-xl border border-[#e7edf4] bg-white p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition dark:border-white/10 dark:bg-[#0b1420]"
            >
              <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:text-left sm:justify-between">
                <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-2">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7edf4] dark:bg-[#172534]">
                    <Mail className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Newsletters</div>
                    <p className="hidden sm:block text-xs text-[#49739c] dark:text-darkTextSecondary">
                      Draft, preview, and archive updates.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-[#3d99f5]">Pro</span>
              </div>
            </Link>

            {/* Announcements */}
            <Link
              to="/org/announcements"
              className="rounded-xl border border-[#e7edf4] bg-white p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition dark:border-white/10 dark:bg-[#0b1420]"
            >
              <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:text-left sm:justify-between">
                <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-2">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7edf4] dark:bg-[#172534]">
                    <Megaphone className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Announcements</div>
                    <p className="hidden sm:block text-xs text-[#49739c] dark:text-darkTextSecondary">
                      Pinned notices for learners and instructors.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-[#3d99f5]">Pro</span>
              </div>
            </Link>
          </div>
        </section>

        {/* Learner photos – bulk + single upload */}
        <section className={`${cardBase} mt-4 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Learner photos</h2>
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
              Map profile photos to learners for use in report cards and portals.
            </div>
          </div>

          {/* Bulk upload by filename (multiple selection) */}
          <div className="mt-3">
            <label className="inline-flex items-center gap-2 text-xs sm:text-sm cursor-pointer">
              <span className="inline-flex h-8 px-3 items-center rounded-lg bg-[#e7edf4] dark:bg-[#172534] text-xs sm:text-sm font-semibold">
                {photoUploading ? 'Uploading photos…' : 'Bulk upload photos by filename'}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={photoUploading || !org?.id || !orgToken}
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (!files.length || !org?.id || !orgToken) return;

                  try {
                    setPhotoUploading(true);
                    const successes: string[] = [];
                    const failures: string[] = [];

                    for (const file of files) {
                      const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
                      if (!baseName) {
                        failures.push(`${file.name} (no admission code in filename)`);
                        continue;
                      }

                      try {
                        const res: any = await uploadAsset(backendUrl, orgToken, file, 'image');
                        const photoUrl =
                          typeof res === 'string'
                            ? res
                            : res?.url || res?.secure_url || res?.data?.url || '';

                        if (!photoUrl) throw new Error('Upload completed but no URL was returned.');

                        await setOrgLearnerPhotoByAdmission(backendUrl, orgToken, org.id, {
                          admission_code: baseName,
                          photo_url: photoUrl,
                        });

                        successes.push(baseName);
                      } catch (err: any) {
                        const msg =
                          err?.response?.data?.message ||
                          err?.message ||
                          'Failed to map this photo.';
                        failures.push(`${file.name} (${msg})`);
                      }
                    }

                    let alertMsg = '';
                    if (successes.length) {
                      alertMsg += `Mapped ${successes.length} photo(s):\n${successes.join(', ')}`;
                    }
                    if (failures.length) {
                      alertMsg += `${successes.length ? '\n\n' : ''}Failed for ${
                        failures.length
                      } file(s):\n${failures.join('\n')}`;
                    }
                    if (alertMsg) alert(alertMsg);
                  } finally {
                    setPhotoUploading(false);
                  }
                }}
              />
            </label>

            <p className="mt-2 text-[11px] text-[#49739c] dark:text-darkTextSecondary">
              Name each image file exactly as the learner Admission No/Code, for example{' '}
              <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-black/40 text-[10px]">
                ADM-2025-001.jpg
              </code>
              . The system extracts the code from the filename (before the extension) and maps it
              automatically.
            </p>
          </div>

          {/* Single manual mapping */}
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] items-end">
            <label className="block">
              <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
                Admission No / Code
              </div>
              <input
                value={photoAdmCode}
                onChange={(e) => setPhotoAdmCode(e.target.value)}
                placeholder="e.g. ADM-2025-001"
                className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2 text-sm"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-xs sm:text-sm cursor-pointer">
              <span className="underline underline-offset-4">
                {photoUploading ? 'Uploading…' : 'Upload photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={photoUploading || !photoAdmCode.trim() || !org?.id || !orgToken}
                onChange={async (e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = '';
                  if (!file || !org?.id || !orgToken) return;

                  if (!photoAdmCode.trim()) {
                    alert('Enter the Admission No/Code first.');
                    return;
                  }

                  try {
                    setPhotoUploading(true);
                    const res: any = await uploadAsset(backendUrl, orgToken, file, 'image');
                    const photoUrl =
                      typeof res === 'string'
                        ? res
                        : res?.url || res?.secure_url || res?.data?.url || '';

                    if (!photoUrl) throw new Error('Upload completed but no URL was returned.');

                    await setOrgLearnerPhotoByAdmission(backendUrl, orgToken, org.id, {
                      admission_code: photoAdmCode.trim(),
                      photo_url: photoUrl,
                    });

                    alert('Photo mapped to learner. Future report cards will use it.');
                    setPhotoAdmCode('');
                  } catch (err: any) {
                    alert(
                      err?.response?.data?.message ||
                        err?.message ||
                        'Failed to upload learner photo.'
                    );
                  } finally {
                    setPhotoUploading(false);
                  }
                }}
              />
            </label>
          </div>

          <p className="mt-2 text-[11px] text-[#49739c] dark:text-darkTextSecondary">
            • Use clear passport-style photos. • If the admission code does not exist, the backend
            should return an error so you can correct it.
          </p>
        </section>

        {/* Branding */}
        <section className="mt-4">
          <div className={`${cardBase} p-4 sm:p-5`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Branding</h2>
              <Link
                to="/org/portal?tab=branding"
                className="inline-flex h-9 px-3 items-center rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Edit Branding
              </Link>
            </div>

            {/* 4-card grid including School contact */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Logo */}
              <div className="rounded-xl p-3 ring-1 ring-black/5 dark:ring-white/10 bg-slate-50 dark:bg-[#0b1620]">
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">Logo</div>
                {loading ? (
                  <Skeleton className="h-24 w-24 mt-2 rounded-lg" />
                ) : (
                  <img
                    src={resolveAsset(org?.logo_url, backendUrl)}
                    alt="Logo"
                    className="mt-2 h-24 w-24 object-contain ring-1 ring-black/10 rounded-lg bg-white"
                  />
                )}
              </div>

              {/* Registrar Signature */}
              <div className="rounded-xl p-3 ring-1 ring-black/5 dark:ring-white/10 bg-slate-50 dark:bg-[#0b1620]">
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                  Registrar Signature
                </div>
                {loading ? (
                  <Skeleton className="h-24 w-40 mt-2 rounded-lg" />
                ) : (
                  <img
                    src={resolveAsset(org?.signature_url, backendUrl)}
                    alt="Signature"
                    className="mt-2 h-24 max-w-full object-contain ring-1 ring-black/10 rounded-lg bg-white"
                    style={{ imageRendering: 'auto' }}
                  />
                )}
              </div>

              {/* Email domain */}
              <div className="rounded-xl p-3 ring-1 ring-black/5 dark:ring-white/10 bg-slate-50 dark:bg-[#0b1620]">
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">Email domain</div>
                {loading ? (
                  <Skeleton className="h-6 w-40 mt-2" />
                ) : (
                  <div className="mt-2 text-sm font-medium">
                    {org?.email_domain?.trim() || (
                      <span className="text-[#49739c]">Not restricted</span>
                    )}
                  </div>
                )}
              </div>

              {/* School contact */}
              <div className="rounded-xl p-3 ring-1 ring-black/5 dark:ring-white/10 bg-slate-50 dark:bg-[#0b1620]">
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                  School contact
                </div>
                {loading ? (
                  <Skeleton className="h-10 w-full mt-2" />
                ) : (
                  <div className="mt-2 text-xs space-y-1">
                    {org?.address_line1 && <div>{org.address_line1}</div>}
                    {org?.address_line2 && <div>{org.address_line2}</div>}
                    {org?.phone_number && (
                      <div className="text-[#49739c] dark:text-darkTextSecondary">
                        Tel: {org.phone_number}
                      </div>
                    )}
                    {org?.contact_email && (
                      <div className="text-[#49739c] dark:text-darkTextSecondary">
                        Email: {org.contact_email}
                      </div>
                    )}
                    {org?.website_url && (
                      <div className="text-[#49739c] dark:text-darkTextSecondary">
                        Website: {org.website_url}
                      </div>
                    )}
                    {!org?.address_line1 &&
                      !org?.phone_number &&
                      !org?.contact_email &&
                      !org?.website_url && <div className="text-[#9ca3af]">Not set yet.</div>}
                  </div>
                )}
              </div>
            </div>

            {/* Learner grouping labels (house/dorm/club) – show only when customized */}
            {!loading && hasGroupingLabels && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-[#49739c] dark:text-darkTextSecondary">
                {org?.house_label?.trim() && (
                  <div className="rounded-lg px-3 py-2 bg-slate-50 dark:bg-[#0b1620] ring-1 ring-black/5 dark:ring-white/10">
                    <div className="text-[11px] uppercase tracking-wide opacity-70">House label</div>
                    <div className="mt-1 text-sm text-[#0d141c] dark:text-darkTextPrimary">
                      {org.house_label}
                    </div>
                  </div>
                )}

                {org?.dorm_label?.trim() && (
                  <div className="rounded-lg px-3 py-2 bg-slate-50 dark:bg-[#0b1620] ring-1 ring-black/5 dark:ring-white/10">
                    <div className="text-[11px] uppercase tracking-wide opacity-70">Dorm label</div>
                    <div className="mt-1 text-sm text-[#0d141c] dark:text-darkTextPrimary">
                      {org.dorm_label}
                    </div>
                  </div>
                )}

                {org?.club_label?.trim() && (
                  <div className="rounded-lg px-3 py-2 bg-slate-50 dark:bg-[#0b1620] ring-1 ring-black/5 dark:ring-white/10">
                    <div className="text-[11px] uppercase tracking-wide opacity-70">Club label</div>
                    <div className="mt-1 text-sm text-[#0d141c] dark:text-darkTextPrimary">
                      {org.club_label}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Quick actions */}
        <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
          <Link
            to="/org/portal"
            className="inline-flex h-10 px-4 items-center rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Open Portal
          </Link>
          <Link
            to="/org/portal?tab=assign"
            className="inline-flex h-10 px-4 items-center rounded-xl bg-[#e7edf4] dark:bg-[#172534] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Create Assignment
          </Link>
        </div>

        {/* App settings */}
        <section className="mt-4">
          <div className={`${cardBase} p-4 sm:p-5`}>
            <h2 className="text-lg font-bold">App settings</h2>
            <div className="mt-3 grid gap-3">
              <div className="flex items-center justify-between rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534]" />
                  <span>Dark mode</span>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Mobile sticky bar */}
      <div className="sm:hidden fixed bottom-4 inset-x-4 z-40 space-y-2">
        <div className="rounded-2xl shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-300/30 overflow-hidden">
          <Link
            to="/org/portal"
            className="block text-center py-3 font-semibold bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-500 text-white"
          >
            Manage in Portal
          </Link>
        </div>

        <div className="flex items-center justify-between rounded-2xl px-3 py-2 ring-1 ring-black/5 dark:ring-white/10 bg-white/90 dark:bg-[#0f1821]/90 backdrop-blur">
          <span className="text-sm">Dark mode</span>
          <ThemeToggle />
        </div>

        <button
          onClick={logoutInstitution}
          className="w-full rounded-2xl py-3 font-semibold bg-rose-600 text-white shadow ring-1 ring-rose-500/40"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default OrgProfilePage;

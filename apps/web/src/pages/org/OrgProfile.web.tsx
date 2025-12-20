// apps/web/src/pages/org/OrgProfile.web.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  getOrgRoster as apiRoster,
  createOrgMembershipInvite,
  removeOrgMember,
} from '@mytutorapp/shared/api/orgApi';

import { getMyOrgOrBootstrap, getOrgUsage, uploadAsset } from '@mytutorapp/shared/api';

// Learner creation + CSV upload
import {
  createOrgLearner as apiCreateOrgLearner,
  uploadOrgLearnersCsv,
  setOrgLearnerPhotoByAdmission,
} from '@mytutorapp/shared/api/orgLearnersApi';

// Instructor creation (no CSV)
import { createOrgInstructor as apiCreateOrgInstructor } from '@mytutorapp/shared/api/orgInstructorsApi';

// Theme toggle
import ThemeToggle from '../../components/ThemeToggle.web';

// Shared UI + helpers
import {
  Skeleton,
  PersonRow,
  resolveAsset,
  tierBadge,
  cardBase,
  type MiniUser,
} from './portal/OrgProfileShared.web';

// Modals
import { InviteModal, AddInstructorModal, AddLearnerModal } from './portal/OrgProfileModals.web';

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

/* ----------------------------- helpers ----------------------------- */

async function tryFetchRoster(backendUrl: string, token: string, orgId: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const base = backendUrl.replace(/\/+$/, '');
  const candidates = [
    `${base}/api/orgs/${orgId}/roster`,
    `${base}/api/organizations/${orgId}/roster`,
    `${base}/api/orgs/${orgId}/members`,
    `${base}/api/organizations/${orgId}/members`,
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return await r.json(); // { instructors: MiniUser[], learners: MiniUser[] }
    } catch {
      // ignore and try next
    }
  }
  return { instructors: [] as MiniUser[], learners: [] as MiniUser[] };
}

/* ------------------------------- page -------------------------------- */

const OrgProfilePage: React.FC = () => {
  const nav = useNavigate();
  const { backendUrl, orgToken, setOrgToken } = useShopContext() as any;

  const [org, setOrg] = useState<Org | null>(null);
  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [seatsMax, setSeatsMax] = useState<number>(50);
  const [loading, setLoading] = useState(true);
  const [instructors, setInstructors] = useState<MiniUser[]>([]);
  const [learners, setLearners] = useState<MiniUser[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<'instructor' | 'learner'>('learner');

  // add-learner & CSV upload state
  const [addLearnerOpen, setAddLearnerOpen] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);

  // add-instructor (no CSV) state
  const [addInstructorOpen, setAddInstructorOpen] = useState(false);

  // learner photos state
  const [photoAdmCode, setPhotoAdmCode] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);

  // pagination state
  const [instructorPage, setInstructorPage] = useState(1);
  const [learnerPage, setLearnerPage] = useState(1);
  const [instructorPageSize, setInstructorPageSize] = useState(10);
  const [learnerPageSize, setLearnerPageSize] = useState(10);

  type InviteResp = { ok: boolean; invite_code: string; invite_url: string };

  const handleCreateMembershipInvite = useCallback(
    async (role: 'instructor' | 'learner', email?: string) => {
      if (!org?.id) throw new Error('Organization is not loaded yet.');
      if (!orgToken) throw new Error('You are not authenticated for this organization.');

      const resp = (await createOrgMembershipInvite(backendUrl, orgToken, org.id, {
        role,
        email,
      })) as InviteResp;

      const url = resp.invite_url;
      if (!url) throw new Error('Invite created but no URL was returned.');

      // best-effort roster refresh
      try {
        const roster = await apiRoster(backendUrl, orgToken, org.id);
        setInstructors(Array.isArray(roster?.instructors) ? roster.instructors : []);
        setLearners(Array.isArray(roster?.learners) ? roster.learners : []);
        setInstructorPage(1);
        setLearnerPage(1);
      } catch {
        // ignore
      }

      return { url };
    },
    [backendUrl, org?.id, orgToken]
  );

  const handleRemoveMember = useCallback(
    async (u: MiniUser) => {
      if (!org?.id || !orgToken) return;

      const label = u.name || u.email || `User #${u.id}`;
      const ok = window.confirm(
        `Remove ${label} from ${org?.name || 'this organization'}?\n\nThey will lose portal access.`
      );
      if (!ok) return;

      try {
        await removeOrgMember(backendUrl, orgToken, org.id, u.id);

        // Optimistic UI updates
        setInstructors((prev) => prev.filter((x) => String(x.id) !== String(u.id)));
        const wasLearner = learners.some((x) => String(x.id) === String(u.id));
        setLearners((prev) => prev.filter((x) => String(x.id) !== String(u.id)));
        if (wasLearner) setSeatsUsed((s) => Math.max(0, (s || 0) - 1));
      } catch (e: any) {
        const msg = e?.response?.data?.message || 'Failed to remove member.';
        alert(msg);
      }
    },
    [backendUrl, org?.id, org?.name, orgToken, learners]
  );

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

  // shared roster refresh helper
  const refreshRoster = useCallback(
    async (orgId: string) => {
      if (!orgToken || !orgId) return;
      try {
        const roster = await apiRoster(backendUrl, orgToken, orgId);
        setInstructors(Array.isArray(roster?.instructors) ? roster.instructors : []);
        setLearners(Array.isArray(roster?.learners) ? roster.learners : []);
        setInstructorPage(1);
        setLearnerPage(1);
      } catch {
        try {
          const roster = await tryFetchRoster(backendUrl, orgToken, orgId);
          setInstructors(Array.isArray(roster?.instructors) ? roster.instructors : []);
          setLearners(Array.isArray(roster?.learners) ? roster.learners : []);
          setInstructorPage(1);
          setLearnerPage(1);
        } catch {
          // ignore
        }
      }
    },
    [backendUrl, orgToken]
  );

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
        const cap = seatCap(o?.tier);
        setSeatsMax(cap);
        try {
          const u = await getOrgUsage(backendUrl, orgToken, o.id);
          if (!stop) setSeatsUsed(Number(u?.seats_used ?? 0));
        } catch {
          if (!stop) setSeatsUsed(Number(o?.seats_used ?? 0));
        }

        if (!stop) {
          await refreshRoster(o.id);
        }
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [backendUrl, orgToken, seatCap, refreshRoster]);

  const logo = useMemo(
    () => resolveAsset(org?.logo_url, backendUrl, org?.name),
    [org?.logo_url, backendUrl, org?.name]
  );

  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100));
  const hasGroupingLabels =
    !!org?.house_label?.trim() || !!org?.dorm_label?.trim() || !!org?.club_label?.trim();

  // pagination derived values
  const totalInstructorPages = useMemo(() => {
    if (!instructors.length) return 1;
    return Math.max(1, Math.ceil(instructors.length / instructorPageSize));
  }, [instructors.length, instructorPageSize]);

  const totalLearnerPages = useMemo(() => {
    if (!learners.length) return 1;
    return Math.max(1, Math.ceil(learners.length / learnerPageSize));
  }, [learners.length, learnerPageSize]);

  const paginatedInstructors = useMemo(() => {
    if (!instructors.length) return [];
    const start = (instructorPage - 1) * instructorPageSize;
    return instructors.slice(start, start + instructorPageSize);
  }, [instructors, instructorPage, instructorPageSize]);

  const paginatedLearners = useMemo(() => {
    if (!learners.length) return [];
    const start = (learnerPage - 1) * learnerPageSize;
    return learners.slice(start, start + learnerPageSize);
  }, [learners, learnerPage, learnerPageSize]);

  useEffect(() => {
    const maxPage = totalInstructorPages;
    if (instructorPage > maxPage) {
      setInstructorPage(maxPage);
    }
  }, [totalInstructorPages, instructorPage]);

  useEffect(() => {
    const maxPage = totalLearnerPages;
    if (learnerPage > maxPage) {
      setLearnerPage(maxPage);
    }
  }, [totalLearnerPages, learnerPage]);

  const instructorRangeText = () => {
    if (!instructors.length) return 'No instructors yet';
    const start = (instructorPage - 1) * instructorPageSize + 1;
    const end = Math.min(instructorPage * instructorPageSize, instructors.length);
    return `Showing ${start}–${end} of ${instructors.length} instructors`;
  };

  const learnerRangeText = () => {
    if (!learners.length) return 'No learners yet';
    const start = (learnerPage - 1) * learnerPageSize + 1;
    const end = Math.min(learnerPage * learnerPageSize, learners.length);
    return `Showing ${start}–${end} of ${learners.length} learners`;
  };

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

  // create instructor handler (no CSV)
  const handleCreateInstructor = useCallback(
    async (payload: { name: string; email?: string; subject?: string; staff_code?: string }) => {
      if (!org?.id || !orgToken) {
        throw new Error('Organization or token missing.');
      }
      const resp = await apiCreateOrgInstructor(backendUrl, orgToken, org.id, payload);
      await refreshRoster(org.id);
      return { tempPassword: resp.tempPassword || null };
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

  // ---- Shared CSV helpers (used for learners + login sheet) ----
  const csvEscape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const downloadCsv = (filename: string, rows: (string | null | undefined)[][]) => {
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // Learner sample template CSV
  const downloadLearnerSampleCsv = () => {
    const rows: (string | null | undefined)[][] = [
      [
        'name',
        'email',
        'admission_code',
        'class_label',
        'guardian_email',
        'house',
        'dormitory',
        'club',
      ],
      [
        'Aisha Mwangi',
        'aisha.mwangi@students.your-school.edu',
        'ADM-2025-001',
        'Grade 7 Blue',
        'parent1@example.com',
        'Taifa',
        'North Wing',
        'Science Club',
      ],
      [
        'Omar Ali',
        'omar.ali@students.your-school.edu',
        'ADM-2025-002',
        'Grade 7 Blue',
        'parent2@example.com',
        'Nyayo',
        'South Wing',
        'Debate Club',
      ],
    ];
    downloadCsv('learners-sample.csv', rows);
  };

  // Download login sheet as CSV built from current roster
  const downloadRosterCsv = () => {
    if (!org) {
      alert('Organization not loaded yet.');
      return;
    }

    if (!instructors.length && !learners.length) {
      alert('No instructors or learners to export yet.');
      return;
    }

    const rows: (string | null | undefined)[][] = [];

    // Header
    rows.push([
      'Type',
      'Name',
      'Email',
      'Staff code',
      'Admission code',
      'Class / Stream',
      'Guardian email',
      'Temp password',
    ]);

    // Instructors
    instructors.forEach((u) => {
      rows.push([
        'Instructor',
        u.name,
        u.email,
        (u as any).staff_code,
        null,
        null,
        null,
        (u as any).temp_password,
      ]);
    });

    // Learners
    learners.forEach((u) => {
      rows.push([
        'Learner',
        u.name,
        u.email,
        null,
        (u as any).admission_code,
        (u as any).class_label,
        (u as any).guardian_email,
        (u as any).temp_password,
      ]);
    });

    const slug = org.slug || org.name || org.id;
    downloadCsv(`login-sheet-${slug}.csv`, rows);
  };

  // create learner handler
  const handleCreateLearner = useCallback(
    async (payload: {
      name: string;
      email?: string;
      class_label?: string;
      guardian_email?: string;
      admission_code?: string;
      house?: string;
      dormitory?: string;
      club?: string;
    }) => {
      if (!org?.id || !orgToken) {
        throw new Error('Organization or token missing.');
      }
      const resp = await apiCreateOrgLearner(backendUrl, orgToken, org.id, payload);
      await refreshRoster(org.id);
      return { tempPassword: resp.tempPassword || null };
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

  // learner CSV upload handler
  const handleCsvUpload = async (file: File | null) => {
    if (!file || !org?.id || !orgToken) return;
    setCsvUploading(true);
    try {
      const resp = await uploadOrgLearnersCsv(backendUrl, orgToken, org.id, file);
      const created = resp?.createdCount ?? 0;
      const reused = resp?.reusedCount ?? 0;
      alert(
        `CSV processed.\nNew learners: ${created}\nExisting reused/updated: ${reused}\n\nNext: click “Download login sheet (CSV)” to get their login details and temporary passwords.`
      );
      await refreshRoster(org.id);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to upload CSV.';
      alert(msg);
    } finally {
      setCsvUploading(false);
    }
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
              <p className="text-xs uppercase tracking-wide text-[#49739c] dark:text-darkTextSecondary">Pro &amp; Enterprise</p>
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

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Link
              to="/org/attendance"
              className="rounded-xl border border-[#e7edf4] bg-white p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition dark:border-white/10 dark:bg-[#0b1420]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Attendance</div>
                  <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">Create sessions and bulk mark learners.</p>
                </div>
                <span className="text-[11px] font-semibold text-[#3d99f5]">Pro</span>
              </div>
            </Link>

            <Link
              to="/org/fees"
              className="rounded-xl border border-[#e7edf4] bg-white p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition dark:border-white/10 dark:bg-[#0b1420]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Fees &amp; balances</div>
                  <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">Charges, payments, and statements.</p>
                </div>
                <span className="text-[11px] font-semibold text-[#3d99f5]">Pro</span>
              </div>
            </Link>

            <Link
              to="/org/newsletters"
              className="rounded-xl border border-[#e7edf4] bg-white p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition dark:border-white/10 dark:bg-[#0b1420]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Newsletters</div>
                  <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">Draft, preview, and archive updates.</p>
                </div>
                <span className="text-[11px] font-semibold text-[#3d99f5]">Pro</span>
              </div>
            </Link>

            <Link
              to="/org/announcements"
              className="rounded-xl border border-[#e7edf4] bg-white p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition dark:border-white/10 dark:bg-[#0b1420]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Announcements</div>
                  <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">Pinned notices for learners and instructors.</p>
                </div>
                <span className="text-[11px] font-semibold text-[#3d99f5]">Pro</span>
              </div>
            </Link>
          </div>
        </section>

        {/* People */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Instructors */}
          <section className={`${cardBase} p-4 sm:p-5`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Instructors</h2>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => setAddInstructorOpen(true)}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Add instructor →
                </button>

                <button
                  onClick={() => {
                    setInviteRole('instructor');
                    setInviteOpen(true);
                  }}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Invite instructor →
                </button>

                <button
                  onClick={downloadRosterCsv}
                  className="text-xs sm:text-sm font-semibold underline underline-offset-4"
                >
                  Download login sheet (CSV)
                </button>

                <Link
                  to="/org/portal?tab=assign"
                  className={`text-sm font-semibold underline underline-offset-4 ${
                    !instructors.length ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  title={!instructors.length ? 'Add an instructor first' : 'Assign courses'}
                >
                  Assign courses →
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : instructors.length ? (
              <>
                <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10 rounded-xl">
                  {paginatedInstructors.map((u) => (
                    <PersonRow key={String(u.id)} u={u} onRemove={() => handleRemoveMember(u)} />
                  ))}
                </ul>

                {/* Pagination strip */}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] sm:text-xs text-[#49739c] dark:text-darkTextSecondary">
                  <span>{instructorRangeText()}</span>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#e7edf4] dark:bg-[#172534]">
                      <span className="hidden sm:inline">Rows per page:</span>
                      <span className="sm:hidden">Rows:</span>
                      <select
                        value={instructorPageSize}
                        onChange={(e) => {
                          const size = Number(e.target.value) || 10;
                          setInstructorPageSize(size);
                          setInstructorPage(1);
                        }}
                        className="text-[11px] sm:text-xs rounded-full bg-white/80 dark:bg-[#0f1821] px-2 py-0.5 border border-transparent focus:outline-none"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>

                    {totalInstructorPages > 1 && (
                      <div className="inline-flex items-center gap-1 rounded-full bg-[#e7edf4] dark:bg-[#172534] px-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => setInstructorPage((p) => Math.max(1, p - 1))}
                          disabled={instructorPage === 1}
                          className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                            instructorPage === 1
                              ? 'opacity-40 cursor-default'
                              : 'hover:bg-white/70 dark:hover:bg-white/10'
                          }`}
                        >
                          ‹ Prev
                        </button>
                        <span className="px-2 py-1 text-[11px]">
                          Page {instructorPage} of {totalInstructorPages}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setInstructorPage((p) => Math.min(totalInstructorPages, p + 1))
                          }
                          disabled={instructorPage === totalInstructorPages}
                          className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                            instructorPage === totalInstructorPages
                              ? 'opacity-40 cursor-default'
                              : 'hover:bg-white/70 dark:hover:bg-white/10'
                          }`}
                        >
                          Next ›
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[#cedbe8] dark:border-white/10 p-6 text-center">
                <div className="text-2xl">👩🏽‍🏫</div>
                <p className="mt-2 text-sm">No instructors listed yet.</p>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                  Use invites or direct add to enroll instructors. Share their login details by
                  email or WhatsApp.
                </p>
              </div>
            )}
          </section>

          {/* Learners */}
          <section className={`${cardBase} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Learners</h2>

              <div className="flex flex-wrap gap-2 items-center">
                <label className="text-xs sm:text-sm flex items-center gap-2 cursor-pointer">
                  <span className="underline underline-offset-4">
                    {csvUploading ? 'Uploading CSV…' : 'Import CSV'}
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    disabled={csvUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      void handleCsvUpload(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={downloadLearnerSampleCsv}
                  className="text-[11px] sm:text-xs font-semibold underline underline-offset-4"
                >
                  Sample CSV
                </button>

                <button
                  onClick={() => setAddLearnerOpen(true)}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Add learner →
                </button>

                <button
                  onClick={() => {
                    setInviteRole('learner');
                    setInviteOpen(true);
                  }}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Invite learners →
                </button>

                {/* Uses Option A (server PDF) instead of legacy learner print code */}
                <button
                  onClick={downloadRosterCsv}
                  className="text-xs sm:text-sm font-semibold underline underline-offset-4"
                >
                  Download login sheet (CSV)
                </button>
              </div>
            </div>

            {/* CSV help text */}
            <p className="mt-2 text-[11px] text-[#49739c] dark:text-darkTextSecondary">
              CSV columns: <strong>name</strong>, <strong>email</strong>,{' '}
              <strong>admission_code</strong>, <strong>class_label</strong>,{' '}
              <strong>guardian_email</strong>, <strong>house</strong>, <strong>dormitory</strong>,{' '}
              <strong>club</strong>. Existing learners will be matched by{' '}
              <strong>admission_code</strong> or <strong>email</strong> and updated where possible.
              Use the <strong>Sample CSV</strong> button above as a ready-made template.
            </p>

            {loading ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : learners.length ? (
              <>
                <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10 rounded-xl">
                  {paginatedLearners.map((u) => (
                    <PersonRow key={String(u.id)} u={u} onRemove={() => handleRemoveMember(u)} />
                  ))}
                </ul>

                {/* Pagination strip */}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] sm:text-xs text-[#49739c] dark:text-darkTextSecondary">
                  <span>{learnerRangeText()}</span>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#e7edf4] dark:bg-[#172534]">
                      <span className="hidden sm:inline">Rows per page:</span>
                      <span className="sm:hidden">Rows:</span>
                      <select
                        value={learnerPageSize}
                        onChange={(e) => {
                          const size = Number(e.target.value) || 10;
                          setLearnerPageSize(size);
                          setLearnerPage(1);
                        }}
                        className="text-[11px] sm:text-xs rounded-full bg-white/80 dark:bg-[#0f1821] px-2 py-0.5 border border-transparent focus:outline-none"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>

                    {totalLearnerPages > 1 && (
                      <div className="inline-flex items-center gap-1 rounded-full bg-[#e7edf4] dark:bg-[#172534] px-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => setLearnerPage((p) => Math.max(1, p - 1))}
                          disabled={learnerPage === 1}
                          className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                            learnerPage === 1
                              ? 'opacity-40 cursor-default'
                              : 'hover:bg-white/70 dark:hover:bg-white/10'
                          }`}
                        >
                          ‹ Prev
                        </button>
                        <span className="px-2 py-1 text-[11px]">
                          Page {learnerPage} of {totalLearnerPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLearnerPage((p) => Math.min(totalLearnerPages, p + 1))}
                          disabled={learnerPage === totalLearnerPages}
                          className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                            learnerPage === totalLearnerPages
                              ? 'opacity-40 cursor-default'
                              : 'hover:bg-white/70 dark:hover:bg-white/10'
                          }`}
                        >
                          Next ›
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[#cedbe8] dark:border-white/10 p-6 text-center">
                <div className="text-2xl">🎓</div>
                <p className="mt-2 text-sm">No learners yet.</p>
                <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                  Use invites, direct add, or CSV import to enroll learners.
                </p>
              </div>
            )}
          </section>
        </div>

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

                        if (!photoUrl) {
                          throw new Error('Upload completed but no URL was returned.');
                        }

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
                      alertMsg += `${
                        successes.length ? '\n\n' : ''
                      }Failed for ${failures.length} file(s):\n${failures.join('\n')}`;
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
                    if (!photoUrl) {
                      throw new Error('Upload completed but no URL was returned.');
                    }
                    await setOrgLearnerPhotoByAdmission(backendUrl, orgToken, org.id, {
                      admission_code: photoAdmCode.trim(),
                      photo_url: photoUrl,
                    });
                    alert('Photo mapped to learner. Future report cards will use it.');
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
                <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                  Email domain
                </div>
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
                    <div className="text-[11px] uppercase tracking-wide opacity-70">
                      House label
                    </div>
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

        {/* Invite & Add modals */}
        <InviteModal
          open={inviteOpen}
          initialRole={inviteRole}
          onClose={() => setInviteOpen(false)}
          onCreate={handleCreateMembershipInvite}
        />

        <AddInstructorModal
          open={addInstructorOpen}
          onClose={() => setAddInstructorOpen(false)}
          onCreate={handleCreateInstructor}
        />

        <AddLearnerModal
          open={addLearnerOpen}
          onClose={() => setAddLearnerOpen(false)}
          onCreate={handleCreateLearner}
        />
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

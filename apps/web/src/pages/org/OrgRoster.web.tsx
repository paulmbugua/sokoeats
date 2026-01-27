import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Users, GraduationCap, Search, Printer,Download } from 'lucide-react';

import { useShopContext } from '@mytutorapp/shared/context';

import {
  getOrgRoster as apiRoster,
  createOrgMembershipInvite,
  removeOrgMember,
} from '@mytutorapp/shared/api/orgApi';
import { getMyOrgOrBootstrap, getOrgUsage } from '@mytutorapp/shared/api';

import {
  createOrgLearner as apiCreateOrgLearner,
  uploadOrgLearnersCsv,
  updateOrgLearner,
} from '@mytutorapp/shared/api/orgLearnersApi';

import {
  createOrgInstructor as apiCreateOrgInstructor,
  updateOrgInstructor,
} from '@mytutorapp/shared/api/orgInstructorsApi';

import { useOrgInstructorFeeAccess } from '@mytutorapp/shared/hooks/useOrgInstructorFeeAccess';
import { Coachmark, useCoachmark } from '../../components/hints/Coachmark';

import {
  Skeleton,
  PersonRow,
  cardBase,
  tierBadge,
  type MiniUser,
} from './portal/OrgProfileShared.web';

import {
  InviteModal,
  AddInstructorModal,
  AddLearnerModal,
  EditLearnerModal,
  EditInstructorModal,
} from './portal/OrgProfileModals.web';

type Org = {
  id: string;
  name?: string;
  slug?: string;
  tier?: 'starter' | 'pro' | 'enterprise';
  seats_used?: number;
};

type TabKey = 'instructors' | 'learners';

type SearchField =
  | 'all'
  | 'name'
  | 'email'
  | 'staff_code'
  | 'subject'
  | 'class_label'
  | 'admission_code';

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
      if (r.ok) return await r.json();
    } catch {
      // ignore
    }
  }
  return { instructors: [] as MiniUser[], learners: [] as MiniUser[] };
}

const csvEscape = (v: unknown) => {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
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

const seatCap = (tier?: string) => {
  switch ((tier || 'starter').toLowerCase()) {
    case 'enterprise':
      return 5000;
    case 'pro':
      return 500;
    default:
      return 50;
  }
};

function normalize(v?: any) {
  return String(v ?? '').trim().toLowerCase();
}

function openPrintWindow(html: string, title = 'Roster') {
  // IMPORTANT: don’t include noopener/noreferrer here, or w can be null.
  const w = window.open('', '_blank', 'width=980,height=720');
  if (!w) {
    alert('Popup blocked. Please allow popups to print.');
    return;
  }

  // keep security without breaking the window handle
  try {
    (w as any).opener = null;
  } catch {}

  w.document.open();
  w.document.write(html);
  w.document.close();

  w.document.title = title;
  w.focus();

  // print immediately (keeps the “user gesture” so browsers allow it)
  w.print();

  // close after print
  const close = () => {
    try {
      w.close();
    } catch {}
  };
  if ('onafterprint' in w) w.onafterprint = close;
  else setTimeout(close, 800);
}


function buildLearnerPrintHtml(orgName: string, classLabel: string, learners: MiniUser[]) {
  const today = new Date().toLocaleString();
  const rows = learners
    .map((l, i) => {
      const adm = (l as any)?.admission_code || '';
      const email = l.email || '';
      const name = l.name || email || `User #${l.id}`;
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${adm}</td>
          <td>${name}</td>
          <td>${email}</td>
        </tr>
      `;
    })
    .join('');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    .top { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
    h1 { margin:0; font-size: 18px; }
    .meta { font-size: 12px; color:#555; margin-top:6px; }
    .badge { display:inline-block; padding:4px 10px; border:1px solid #ddd; border-radius:999px; font-size: 12px; }
    table { width:100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background:#f5f5f5; text-align:left; }
    @media print { .no-print { display:none; } }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>${orgName} — Learner Roster</h1>
      <div class="meta">Class: <strong>${classLabel || '—'}</strong> • Printed: ${today}</div>
    </div>
    <div class="badge">Total: ${learners.length}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;">#</th>
        <th style="width:160px;">Admission No</th>
        <th>Name</th>
        <th style="width:260px;">Email</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
`;
}

const OrgRosterPage: React.FC = () => {
  const nav = useNavigate();
  const { backendUrl, orgToken, orgLogout } = useShopContext() as any;

  const [tab, setTab] = useState<TabKey>('learners');

  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  const [instructors, setInstructors] = useState<MiniUser[]>([]);
  const [learners, setLearners] = useState<MiniUser[]>([]);

  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [seatsMax, setSeatsMax] = useState<number>(50);

  // search + filters
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const [classFilter, setClassFilter] = useState<string>(''); // learners only

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // modals
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<'instructor' | 'learner'>('learner');
  const rosterHint = useCoachmark('org_roster_add_v1', !loading);
  const [addInstructorOpen, setAddInstructorOpen] = useState(false);
  const [addLearnerOpen, setAddLearnerOpen] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<MiniUser | null>(null);
  const [editingLearner, setEditingLearner] = useState<MiniUser | null>(null);

  // bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<Set<string>>(new Set());
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // learner csv upload
  const [csvUploading, setCsvUploading] = useState(false);

  const { ready: feeReady, saving: feeSaving, setFeeAccess, designatedInstructorId } =
    useOrgInstructorFeeAccess({
      backendUrl,
      token: orgToken,
      orgId: org?.id,
    });

  const feeDesignatedLabel = useMemo(() => {
    const activeId = designatedInstructorId ?? instructors.find((i) => i.can_access_fees)?.id ?? null;
    const match = activeId
      ? instructors.find((i) => String(i.id) === String(activeId)) ?? null
      : null;

    if (match) return match.name || match.email || `User #${match.id}`;
    if (activeId) return `User #${activeId}`;
    return 'None';
  }, [designatedInstructorId, instructors]);

  const downloadRosterPdf = useCallback(async () => {
  if (!org?.id || !orgToken) return;

  const qs = new URLSearchParams();
  if (classFilter) qs.set('class_label', classFilter);
  if (search) qs.set('q', search);
  if (searchField && searchField !== 'all') qs.set('field', searchField);

  const url = `${backendUrl.replace(/\/+$/, '')}/api/orgs/${org.id}/learners/roster.pdf?${qs.toString()}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${orgToken}` },
  });

  if (!r.ok) {
    const msg = await r.text().catch(() => '');
    throw new Error(msg || 'Failed to download PDF');
  }

  const blob = await r.blob();
  const a = document.createElement('a');
  const objUrl = URL.createObjectURL(blob);

  const slug = String(org.slug || org.name || org.id).replace(/[^a-z0-9-_]+/gi, '_');
  const cls = String(classFilter || 'all').replace(/[^a-z0-9-_]+/gi, '_');

  a.href = objUrl;
  a.download = `roster-${slug}-${cls}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}, [backendUrl, org?.id, org?.name, org?.slug, orgToken, classFilter, search, searchField]);

  const refreshRoster = useCallback(
    async (orgId: string) => {
      if (!orgToken || !orgId) return;
      try {
        const roster = await apiRoster(backendUrl, orgToken, orgId);
        setInstructors(Array.isArray(roster?.instructors) ? roster.instructors : []);
        setLearners(Array.isArray(roster?.learners) ? roster.learners : []);
      } catch {
        const roster = await tryFetchRoster(backendUrl, orgToken, orgId);
        setInstructors(Array.isArray(roster?.instructors) ? roster.instructors : []);
        setLearners(Array.isArray(roster?.learners) ? roster.learners : []);
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
        setSeatsMax(seatCap(o?.tier));
        try {
          const u = await getOrgUsage(backendUrl, orgToken, o.id);
          if (!stop) setSeatsUsed(Number(u?.seats_used ?? 0));
        } catch {
          if (!stop) setSeatsUsed(Number(o?.seats_used ?? 0));
        }
        await refreshRoster(o.id);
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [backendUrl, orgToken, refreshRoster]);

  // keep pagination sane when changing tabs/filters
  useEffect(() => {
    setPage(1);
  }, [tab, pageSize, classFilter, search, searchField]);

  // prune selections if roster changes
  useEffect(() => {
    setSelectedInstructorIds((prev) => {
      const next = new Set([...prev].filter((id) => instructors.some((u) => String(u.id) === id)));
      return next;
    });
  }, [instructors]);

  useEffect(() => {
    setSelectedLearnerIds((prev) => {
      const next = new Set([...prev].filter((id) => learners.some((u) => String(u.id) === id)));
      return next;
    });
  }, [learners]);

  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const l of learners) {
      const c = String((l as any)?.class_label ?? '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [learners]);

  const filteredInstructors = useMemo(() => {
    const q = normalize(search);
    const sf = searchField;

    if (!q && sf === 'all') return instructors;

    return instructors.filter((u) => {
      const name = normalize(u.name);
      const email = normalize(u.email);
      const staff = normalize((u as any)?.staff_code);
      const subject = normalize((u as any)?.subject);

      const hayAll = `${name} ${email} ${staff} ${subject}`;

      if (sf === 'name') return name.includes(q);
      if (sf === 'email') return email.includes(q);
      if (sf === 'staff_code') return staff.includes(q);
      if (sf === 'subject') return subject.includes(q);
      // learners-only fields ignored here
      return hayAll.includes(q);
    });
  }, [instructors, search, searchField]);

  const filteredLearners = useMemo(() => {
    const q = normalize(search);
    const sf = searchField;

    return learners
      .filter((u) => {
        const c = String((u as any)?.class_label ?? '').trim();
        return !classFilter ? true : c === classFilter;
      })
      .filter((u) => {
        const name = normalize(u.name);
        const email = normalize(u.email);
        const adm = normalize((u as any)?.admission_code);
        const cls = normalize((u as any)?.class_label);
        const guardian = normalize((u as any)?.guardian_email);

        const hayAll = `${name} ${email} ${adm} ${cls} ${guardian}`;

        if (!q && sf === 'all') return true;

        if (sf === 'name') return name.includes(q);
        if (sf === 'email') return email.includes(q);
        if (sf === 'admission_code') return adm.includes(q);
        if (sf === 'class_label') return cls.includes(q);
        return hayAll.includes(q);
      });
  }, [learners, search, searchField, classFilter]);

  const activeList = tab === 'instructors' ? filteredInstructors : filteredLearners;

  const totalPages = useMemo(() => {
    if (!activeList.length) return 1;
    return Math.max(1, Math.ceil(activeList.length / pageSize));
  }, [activeList.length, pageSize]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return activeList.slice(start, start + pageSize);
  }, [activeList, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const runWithConcurrency = useCallback(
    async (ids: string[], worker: (id: string) => Promise<void>, limit = 3) => {
      if (!ids.length) return [];
      const failures: { id: string; error: string }[] = [];
      let idx = 0;
      let active = 0;

      return new Promise<typeof failures>((resolve) => {
        const launch = () => {
          if (idx >= ids.length) {
            if (active === 0) resolve(failures);
            return;
          }

          const id = ids[idx++];
          active += 1;
          Promise.resolve(worker(id))
            .catch((e: any) => {
              const msg = e?.response?.data?.message || e?.message || 'Failed.';
              failures.push({ id, error: msg });
            })
            .finally(() => {
              active -= 1;
              launch();
            });
        };

        const starters = Math.min(limit, ids.length);
        for (let i = 0; i < starters; i += 1) launch();
      });
    },
    []
  );

  const printRoster = useCallback(() => {
  if (!org?.name) return alert('Organization not loaded.');

  const cls = String(classFilter || '').trim();
  const rows = filteredLearners; // respects search + classFilter

  if (!rows.length) return alert('No learners to print.');

  const label = cls ? cls : 'All classes';
  const html = buildLearnerPrintHtml(org.name || 'School', label, rows);
  openPrintWindow(html, `Roster — ${label}`);
}, [org?.name, classFilter, filteredLearners]);


  const selectedSet = tab === 'instructors' ? selectedInstructorIds : selectedLearnerIds;
  const setSelectedSet =
    tab === 'instructors' ? setSelectedInstructorIds : setSelectedLearnerIds;

  const toggleSelect = useCallback(
    (id: string | number) => {
      const key = String(id);
      setSelectedSet((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [setSelectedSet]
  );

  const selectAllFiltered = useCallback(() => {
    const ids = activeList.map((u) => String(u.id));
    setSelectedSet(new Set(ids));
  }, [activeList, setSelectedSet]);

  const cancelSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedSet(new Set());
  }, [setSelectedSet]);

  const handleBulkDelete = useCallback(async () => {
    if (!org?.id || !orgToken) return;

    const ids = Array.from(selectedSet);
    if (!ids.length) return;

    const label = tab === 'instructors' ? 'instructor' : 'learner';
    const ok = window.confirm(
      `Delete ${ids.length} ${label}${ids.length === 1 ? '' : 's'}? This cannot be undone.`
    );
    if (!ok) return;

    setBulkDeleting(true);
    let success = 0;

    const failures = await runWithConcurrency(
      ids,
      async (id) => {
        await removeOrgMember(backendUrl, orgToken, org.id, id);
        success += 1;

        if (tab === 'instructors') {
          setInstructors((prev) => prev.filter((u) => String(u.id) !== String(id)));
          setSelectedInstructorIds((prev) => {
            const next = new Set(prev);
            next.delete(String(id));
            return next;
          });
        } else {
          setLearners((prev) => prev.filter((u) => String(u.id) !== String(id)));
          setSelectedLearnerIds((prev) => {
            const next = new Set(prev);
            next.delete(String(id));
            return next;
          });
        }
      },
      3
    );

    if (tab === 'learners' && success) {
      setSeatsUsed((s) => Math.max(0, (s || 0) - success));
    }

    setBulkDeleting(false);

    if (!failures.length) {
      alert(`Deleted ${success} ${label}${success === 1 ? '' : 's'}.`);
      setSelectMode(false);
      setSelectedSet(new Set());
      return;
    }

    alert(
      `Deleted ${success} ${label}${success === 1 ? '' : 's'}, failed ${
        failures.length
      }.\n\nFailures:\n${failures
        .slice(0, 10)
        .map((f) => `• ${f.id}: ${f.error}`)
        .join('\n')}${failures.length > 10 ? `\n… +${failures.length - 10} more` : ''}`
    );
  }, [
    backendUrl,
    org?.id,
    orgToken,
    runWithConcurrency,
    selectedSet,
    setSelectedSet,
    tab,
  ]);

  const handleRemoveMember = useCallback(
    async (u: MiniUser) => {
      if (!org?.id || !orgToken) return;

      const label = u.name || u.email || `User #${u.id}`;
      const ok = window.confirm(`Remove ${label} from ${org?.name || 'this organization'}?`);
      if (!ok) return;

      try {
        await removeOrgMember(backendUrl, orgToken, org.id, u.id);
        setInstructors((prev) => prev.filter((x) => String(x.id) !== String(u.id)));

        const wasLearner = learners.some((x) => String(x.id) === String(u.id));
        setLearners((prev) => prev.filter((x) => String(x.id) !== String(u.id)));

        setSelectedInstructorIds((prev) => {
          const next = new Set(prev);
          next.delete(String(u.id));
          return next;
        });
        setSelectedLearnerIds((prev) => {
          const next = new Set(prev);
          next.delete(String(u.id));
          return next;
        });

        if (wasLearner) setSeatsUsed((s) => Math.max(0, (s || 0) - 1));
      } catch (e: any) {
        alert(e?.response?.data?.message || 'Failed to remove member.');
      }
    },
    [backendUrl, org?.id, org?.name, orgToken, learners]
  );

  const handleCreateMembershipInvite = useCallback(
    async (role: 'instructor' | 'learner', email?: string) => {
      if (!org?.id) throw new Error('Organization not loaded.');
      if (!orgToken) throw new Error('No org token.');

      const resp: any = await createOrgMembershipInvite(backendUrl, orgToken, org.id, {
        role,
        email,
      });
      const url = resp?.invite_url;
      if (!url) throw new Error('Invite created but no URL returned.');

      // best-effort refresh
      try {
        await refreshRoster(org.id);
      } catch {
        // ignore
      }

      return { url };
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

  const handleCreateInstructor = useCallback(
    async (payload: { name: string; email?: string; subject?: string; staff_code?: string }) => {
      if (!org?.id || !orgToken) throw new Error('Organization/token missing.');
      const resp: any = await apiCreateOrgInstructor(backendUrl, orgToken, org.id, payload);
      await refreshRoster(org.id);
      return { tempPassword: resp?.tempPassword || null };
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

  const handleUpdateInstructor = useCallback(
    async (payload: { name: string; email?: string; subject?: string; staff_code?: string }) => {
      if (!org?.id || !orgToken || !editingInstructor) throw new Error('Missing context.');
      await updateOrgInstructor(backendUrl, orgToken, org.id, editingInstructor.id, payload);
      await refreshRoster(org.id);
      setEditingInstructor(null);
      alert('Instructor updated.');
    },
    [backendUrl, editingInstructor, org?.id, orgToken, refreshRoster]
  );

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
      if (!org?.id || !orgToken) throw new Error('Organization/token missing.');
      const resp: any = await apiCreateOrgLearner(backendUrl, orgToken, org.id, payload);
      await refreshRoster(org.id);
      return { tempPassword: resp?.tempPassword || null };
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

  const handleUpdateLearner = useCallback(
    async (payload: {
      name: string;
      email?: string;
      admission_code?: string;
      class_label?: string;
      guardian_email?: string;
      house?: string;
      dormitory?: string;
      club?: string;
    }) => {
      if (!org?.id || !orgToken || !editingLearner) throw new Error('Missing context.');
      await updateOrgLearner(backendUrl, orgToken, org.id, editingLearner.id, payload);
      await refreshRoster(org.id);
      setEditingLearner(null);
      alert('Learner updated.');
    },
    [backendUrl, editingLearner, org?.id, orgToken, refreshRoster]
  );

  const downloadLoginSheetCsv = useCallback(() => {
    if (!org) return alert('Organization not loaded yet.');
    if (!instructors.length && !learners.length) return alert('No roster to export yet.');

    const rows: (string | null | undefined)[][] = [];
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

    instructors.forEach((u) => {
      rows.push([
        'Instructor',
        u.name,
        u.email,
        (u as any)?.staff_code,
        null,
        null,
        null,
        (u as any)?.temp_password,
      ]);
    });

    learners.forEach((u) => {
      rows.push([
        'Learner',
        u.name,
        u.email,
        null,
        (u as any)?.admission_code,
        (u as any)?.class_label,
        (u as any)?.guardian_email,
        (u as any)?.temp_password,
      ]);
    });

    const slug = org.slug || org.name || org.id;
    downloadCsv(`login-sheet-${slug}.csv`, rows);
  }, [org, instructors, learners]);

  const handleCsvUpload = useCallback(
    async (file: File | null) => {
      if (!file || !org?.id || !orgToken) return;
      setCsvUploading(true);
      try {
        const resp: any = await uploadOrgLearnersCsv(backendUrl, orgToken, org.id, file);
        const created = resp?.createdCount ?? 0;
        const reused = resp?.reusedCount ?? 0;
        alert(
          `CSV processed.\nNew learners: ${created}\nExisting reused/updated: ${reused}\n\nNext: “Download login sheet (CSV)” for passwords.`
        );
        await refreshRoster(org.id);
      } catch (e: any) {
        alert(e?.response?.data?.message || e?.message || 'Failed to upload CSV.');
      } finally {
        setCsvUploading(false);
      }
    },
    [backendUrl, org?.id, orgToken, refreshRoster]
  );

  const handleFeeAccess = useCallback(
    async (u: MiniUser, enable: boolean) => {
      if (!org?.id || !feeReady || feeSaving) return;
      const label = u.name || u.email || `User #${u.id}`;
      const ok = window.confirm(
        enable
          ? `Grant Fees access to ${label}? This will remove access from other instructors.`
          : `Remove Fees access from ${label}?`
      );
      if (!ok) return;
      try {
        await setFeeAccess({ instructorUserId: u.id, enabled: enable });
        setInstructors((prev) =>
          prev.map((p) => ({
            ...p,
            can_access_fees: String(p.id) === String(u.id) ? enable : false,
          }))
        );
        alert(enable ? 'Fee access granted.' : 'Fee access removed.');
      } catch (e: any) {
        alert(e?.response?.data?.message || e?.message || 'Unable to update fee access.');
      }
    },
    [feeReady, feeSaving, org?.id, setFeeAccess]
  );

  const logoutInstitution = async () => {
    try {
      await orgLogout?.();
      sessionStorage.removeItem('auth:returnTo');
      sessionStorage.removeItem('auth:returnTo:org');
    } catch {
      // ignore
    }
    window.location.assign('/org/portal/login?logout=1');
  };

  const printCurrentClass = useCallback(() => {
    if (!org?.name) return alert('Organization not loaded.');
    const cls = String(classFilter || '').trim();
    if (!cls) return alert('Select a class/stream first.');
    const rows = learners.filter((l) => String((l as any)?.class_label ?? '').trim() === cls);
    const html = buildLearnerPrintHtml(org.name || 'School', cls, rows);
    openPrintWindow(html, `Roster — ${cls}`);
  }, [classFilter, learners, org?.name]);

  if (!orgToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-darkBg">
        <div className={`${cardBase} w-full max-w-md p-6`}>
          <h1 className="text-xl font-bold">Roster</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-darkTextSecondary">
            Please sign in as an institution to continue.
          </p>
          <div className="mt-4">
            <Link
              to="/org/portal/login"
              className="inline-flex h-10 px-4 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500"
            >
              Institution Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        {/* header */}
        <div className={`${cardBase} p-4 sm:p-5`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Roster</h1>
                {!loading && (
                  <span
                    className={
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
                      tierBadge(org?.tier)
                    }
                  >
                    {(org?.tier || 'starter').toUpperCase()}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-[#49739c] dark:text-darkTextSecondary">
                {loading ? (
                  <Skeleton className="h-4 w-44" />
                ) : (
                  <>
                    {org?.name || 'Institution'} • Seats: {seatsUsed}/{seatsMax}
                  </>
                )}
              </div>

              {!loading && (
                <div className="mt-2 h-2 rounded-full bg-gray-200 dark:bg-[#182534] overflow-hidden max-w-xs">
                  <div
                    className={`h-full ${seatPct >= 90 ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${seatPct}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/org/profile"
                className="inline-flex h-10 px-4 items-center rounded-xl bg-[#e7edf4] dark:bg-[#172534] font-semibold"
              >
                Back to Profile
              </Link>
              <Link
                to="/org/portal"
                className="inline-flex h-10 px-4 items-center rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
              >
                Open Portal
              </Link>
              <button
                onClick={logoutInstitution}
                className="inline-flex h-10 px-4 items-center rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              >
                Logout
              </button>
            </div>
          </div>

          {/* tabs + search */}
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTab('instructors');
                    setSelectMode(false);
                  }}
                  className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl font-semibold ring-1 transition ${
                    tab === 'instructors'
                      ? 'bg-[#0d141c] text-white ring-black/10 dark:bg-white dark:text-black'
                      : 'bg-white dark:bg-[#0f1821] ring-black/10 dark:ring-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Instructors <span className="opacity-70">({instructors.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTab('learners');
                    setSelectMode(false);
                  }}
                  className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl font-semibold ring-1 transition ${
                    tab === 'learners'
                      ? 'bg-[#0d141c] text-white ring-black/10 dark:bg-white dark:text-black'
                      : 'bg-white dark:bg-[#0f1821] ring-black/10 dark:ring-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <GraduationCap className="h-4 w-4" />
                  Learners <span className="opacity-70">({learners.length})</span>
                </button>
              </div>
              {tab === 'instructors' && (
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Fee access:{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">{feeDesignatedLabel}</span>
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] items-stretch">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === 'learners'
                      ? 'Search learners (name, email, admission, class)…'
                      : 'Search instructors (name, email, staff code, subject)…'
                  }
                  className="w-full h-10 pl-9 pr-3 rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821]"
                />
              </div>

              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value as any)}
                className="h-10 rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3"
                title="Search by"
              >
                <option value="all">All fields</option>
                <option value="name">Name</option>
                <option value="email">Email</option>
                {tab === 'learners' ? (
                  <>
                    <option value="admission_code">Admission No</option>
                    <option value="class_label">Class / Stream</option>
                  </>
                ) : (
                  <>
                    <option value="staff_code">Staff code</option>
                    <option value="subject">Subject</option>
                  </>
                )}
              </select>

              {tab === 'learners' ? (
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="h-10 rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3"
                  title="Filter class"
                >
                  <option value="">All classes</option>
                  {classes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <div />
              )}
            </div>
          </div>
        </div>

        {/* action bar */}
        <div className={`${cardBase} mt-4 p-3 sm:p-4 relative`}>
          <Coachmark
            id="org_roster_add_v1"
            title="Grow your roster"
            text="Use Add, Invite, or Import CSV to quickly bring instructors and learners in."
            visible={rosterHint.visible}
            onDismiss={rosterHint.dismiss}
            placement="top"
          />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {/* select / bulk delete */}
              {selectMode ? (
                <>
                  <span className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                    {selectedSet.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={!selectedSet.size || bulkDeleting}
                    className="text-sm font-semibold text-rose-600 disabled:opacity-50"
                  >
                    {bulkDeleting ? 'Deleting…' : 'Delete selected'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelSelect}
                    className="text-sm font-semibold underline underline-offset-4"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-sm font-semibold underline underline-offset-4"
                    title="Select all currently filtered results"
                  >
                    Select all (filtered)
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Select
                </button>
              )}

              <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/10" />

              {/* shared */}
              <button
                type="button"
                onClick={downloadLoginSheetCsv}
                className="text-sm font-semibold underline underline-offset-4"
              >
                Download login sheet (CSV)
              </button>

              {tab === 'instructors' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAddInstructorOpen(true)}
                    className="text-sm font-semibold underline underline-offset-4"
                  >
                    Add instructor →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInviteRole('instructor');
                      setInviteOpen(true);
                    }}
                    className="text-sm font-semibold underline underline-offset-4"
                  >
                    Invite instructor →
                  </button>

                  <Link
                    to="/org/portal?tab=assign"
                    className="text-sm font-semibold underline underline-offset-4"
                    title="Assign courses"
                  >
                    Assign →
                  </Link>
                </>
              ) : (
                <>
                  <label className="text-sm font-semibold underline underline-offset-4 cursor-pointer">
                    {csvUploading ? 'Uploading CSV…' : 'Import CSV'}
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
                    className="text-sm font-semibold underline underline-offset-4"
                  >
                    Sample CSV
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddLearnerOpen(true)}
                    className="text-sm font-semibold underline underline-offset-4"
                  >
                    Add learner →
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInviteRole('learner');
                      setInviteOpen(true);
                    }}
                    className="text-sm font-semibold underlne underline-offset-4"
                  >
                    Invite learners →
                  </button>

                  <button
                    type="button"
                    onClick={printRoster}
                    disabled={loading || filteredLearners.length === 0}
                    className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4 disabled:opacity-50"
                    title={filteredLearners.length === 0 ? 'No learners to print' : 'Print current roster'}
                  >
                    <Printer className="h-4 w-4" />
                    Print roster
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadRosterPdf().catch((e) => alert(e.message || 'Download failed'))}
                    disabled={loading || filteredLearners.length === 0}
                    className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4 disabled:opacity-50"
                    title={filteredLearners.length === 0 ? 'No learners to export' : 'Download roster PDF'}
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </button>


                </>
              )}
            </div>

            <div className="flex items-center justify-between lg:justify-end gap-2 text-xs text-[#49739c] dark:text-darkTextSecondary">
              <div>
                Showing{' '}
                <span className="font-semibold text-[#0d141c] dark:text-darkTextPrimary">
                  {activeList.length}
                </span>{' '}
                result(s)
              </div>
              <div className="inline-flex items-center gap-2">
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) || 10)}
                  className="rounded-full bg-white dark:bg-[#0f1821] px-2 py-1 ring-1 ring-black/10 dark:ring-white/10"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>

          {tab === 'learners' ? (
            <p className="mt-2 text-[11px] text-[#49739c] dark:text-darkTextSecondary">
              Tip: Search by <strong>Admission No</strong> or <strong>Class / Stream</strong>. For
              printing, choose a class then click <strong>Print class roster</strong>.
            </p>
          ) : null}
        </div>

        {/* list */}
        <div className={`${cardBase} mt-4 p-4 sm:p-5`}>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : activeList.length ? (
            <>
              <ul className="divide-y divide-black/5 dark:divide-white/10 rounded-xl">
                {paginated.map((u) => {
                  const isInstructor = tab === 'instructors';

                  const hasFees = !!u.can_access_fees;

                  return (
                    <PersonRow
                      key={String(u.id)}
                      u={u}
                      onRemove={() => handleRemoveMember(u)}
                      selectMode={selectMode}
                      selected={selectedSet.has(String(u.id))}
                      onToggleSelect={() => toggleSelect(u.id)}
                      hideRemove={selectMode}
                      onEdit={() => (isInstructor ? setEditingInstructor(u) : setEditingLearner(u))}
                      extraActions={
                        isInstructor ? (
                          <button
                            type="button"
                            onClick={() => void handleFeeAccess(u, !hasFees)}
                            disabled={!feeReady || feeSaving}
                            className={`text-[11px] sm:text-xs font-semibold px-2 py-1 rounded-full border transition ${
                              hasFees
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
                            }`}
                            title={hasFees ? 'Remove fees access' : 'Grant fees access'}
                          >
                            {hasFees ? 'Remove fees' : 'Grant fees'}
                          </button>
                        ) : null
                      }
                      badge={
                        tab === 'learners' ? (
                          (u as any)?.class_label ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200">
                              {(u as any)?.class_label}
                            </span>
                          ) : null
                        ) : null
                      }
                    />
                  );
                })}
              </ul>

              {/* pagination */}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] sm:text-xs text-[#49739c] dark:text-darkTextSecondary">
                <span>
                  Page {page} of {totalPages}
                </span>

                {totalPages > 1 ? (
                  <div className="inline-flex items-center gap-1 rounded-full bg-[#e7edf4] dark:bg-[#172534] px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                        page === 1
                          ? 'opacity-40 cursor-default'
                          : 'hover:bg-white/70 dark:hover:bg-white/10'
                      }`}
                    >
                      ‹ Prev
                    </button>

                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                        page === totalPages
                          ? 'opacity-40 cursor-default'
                          : 'hover:bg-white/70 dark:hover:bg-white/10'
                      }`}
                    >
                      Next ›
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-[#cedbe8] dark:border-white/10 p-10 text-center">
              <div className="text-2xl">{tab === 'instructors' ? '👩🏽‍🏫' : '🎓'}</div>
              <div className="mt-2 font-semibold">
                {tab === 'instructors' ? 'No instructors found.' : 'No learners found.'}
              </div>
              <div className="mt-1 text-sm text-[#49739c] dark:text-darkTextSecondary">
                Try clearing filters or add new records.
              </div>
            </div>
          )}
        </div>

        {/* modals */}
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

        <EditInstructorModal
          open={!!editingInstructor}
          instructor={editingInstructor}
          onClose={() => setEditingInstructor(null)}
          onSave={handleUpdateInstructor}
        />

        <EditLearnerModal
          open={!!editingLearner}
          learner={editingLearner}
          onClose={() => setEditingLearner(null)}
          onSave={handleUpdateLearner}
        />
      </div>
    </div>
  );
};

export default OrgRosterPage;

// apps/web/src/pages/org/OrgToolsClubs.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgClubs } from '@mytutorapp/shared/hooks/useOrgClubs';

const OrgToolsClubsPage: React.FC = () => {
  const { isPro, upgradeCta, org } = useOrgProTools();
  const { clubs, myClubs, members, loading, saving, fetchClubs, fetchMyClubs, fetchMembers, saveClub, enrollMember } =
    useOrgClubs();

  const [form, setForm] = useState({ name: '', description: '' });
  const [enrollForm, setEnrollForm] = useState({ clubId: '', member_id: '', role: '' });

  useEffect(() => {
    fetchClubs();
    fetchMyClubs();
  }, [fetchClubs, fetchMyClubs]);

  const canCreate = useMemo(() => Boolean(form.name), [form.name]);
  const canEnroll = useMemo(() => Boolean(enrollForm.clubId && enrollForm.member_id), [enrollForm.clubId, enrollForm.member_id]);

  const handleSave = async () => {
    if (!canCreate) return;
    await saveClub({ name: form.name, description: form.description || undefined });
    setForm({ name: '', description: '' });
  };

  const handleEnroll = async () => {
    if (!canEnroll) return;
    await enrollMember(Number(enrollForm.clubId), {
      member_id: enrollForm.member_id,
      role: enrollForm.role || undefined,
    });
    fetchMembers(Number(enrollForm.clubId));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Clubs & societies</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">Create clubs and enroll members.</p>
        </div>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
          Pro / Enterprise
        </span>
      </div>

      {!isPro && upgradeCta ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="font-semibold">{upgradeCta.headline}</div>
          <p className="text-sm">{upgradeCta.body}</p>
          <div className="text-sm text-blue-700 underline">
            <a href="/org/profile">Upgrade for {org?.name || 'your org'}</a>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="STEM Club"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Weekly labs and robotics"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <div className="flex gap-3">
            <button
              disabled={!canCreate || saving}
              onClick={handleSave}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {saving ? 'Saving…' : 'Save club'}
            </button>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800">
            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">Enroll member</span>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={enrollForm.clubId}
                onChange={(e) => setEnrollForm((p) => ({ ...p, clubId: e.target.value }))}
                placeholder="Club ID"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                value={enrollForm.member_id}
                onChange={(e) => setEnrollForm((p) => ({ ...p, member_id: e.target.value }))}
                placeholder="Learner ID"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                value={enrollForm.role}
                onChange={(e) => setEnrollForm((p) => ({ ...p, role: e.target.value }))}
                placeholder="Role"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              disabled={!canEnroll || saving}
              onClick={handleEnroll}
              className="self-start rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {saving ? 'Enrolling…' : 'Enroll member'}
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Clubs</div>
              <button
                onClick={() => fetchClubs()}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Refresh
              </button>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? <p className="py-2 text-sm text-slate-500">Loading clubs…</p> : null}
              {!loading && !clubs.length ? (
                <p className="py-2 text-sm text-slate-500">No clubs yet.</p>
              ) : (
                clubs.map((club) => (
                  <div key={club.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{club.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{club.description || 'No description'}</div>
                      </div>
                      <button
                        onClick={() => fetchMembers(club.id)}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        View members
                      </button>
                    </div>
                    {members.length && members[0]?.club_id === club.id ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{members.length} members</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            {myClubs.length ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">My clubs</div>
                {myClubs.map((club) => (
                  <div key={club.id} className="text-xs text-slate-700 dark:text-slate-200">• {club.name}</div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgToolsClubsPage;

// apps/web/src/pages/org/portal/OrgProfileModals.web.tsx
import React, { useEffect, useState } from 'react';
import { cardBase } from './OrgProfileShared.web';

/* ------------------------------- InviteModal ------------------------------ */

export const InviteModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (role: 'instructor' | 'learner', email?: string) => Promise<{ url: string } | void>;
  initialRole?: 'instructor' | 'learner';
}> = ({ open, onClose, onCreate, initialRole = 'learner' }) => {
  const [role, setRole] = useState<'instructor' | 'learner'>('learner');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (open) {
      setRole(initialRole);
      setEmail('');
      setUrl('');
      setCreating(false);
    }
  }, [open, initialRole]);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setUrl('');
      setRole('learner');
      setCreating(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-3">
      <div className={`${cardBase} w-full max-w-md p-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Create invite</h3>
          <button onClick={onClose} className="chip">
            Close
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Role</div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
            >
              <option value="learner">Learner</option>
              <option value="instructor">Instructor</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Email (optional)
            </div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.edu"
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
            />
          </label>

          {!url && (
            <button
              disabled={creating}
              onClick={async () => {
                setCreating(true);
                const r = await onCreate(role, email || undefined);
                if (r?.url) setUrl(r.url);
                setCreating(false);
              }}
              className="inline-flex h-10 px-4 items-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {creating ? 'Creating…' : 'Create invite'}
            </button>
          )}

          {!!url && (
            <div className="space-y-2">
              <code className="block w-full text-xs p-3 rounded-lg bg-slate-100 dark:bg-black/40">
                {url}
              </code>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(url).catch(() => {})}
                  className="chip chip-active"
                >
                  Copy
                </button>
                <a
                  className="chip"
                  href={`mailto:?subject=${encodeURIComponent(
                    'You’re invited'
                  )}&body=${encodeURIComponent(url)}`}
                >
                  Email
                </a>
                <a
                  className="chip"
                  href={`https://wa.me/?text=${encodeURIComponent(url)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* --------------------------- AddInstructorModal -------------------------- */

export const AddInstructorModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    email?: string;
    subject?: string;
    staff_code?: string;
  }) => Promise<{ tempPassword?: string | null } | void>;
}> = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setSubject('');
      setStaffCode('');
      setTempPassword(null);
      setCreating(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('Instructor name is required.');
      return;
    }
    setCreating(true);
    try {
      const resp = await onCreate({
        name: name.trim(),
        email: email.trim() || undefined,
        subject: subject.trim() || undefined,
        staff_code: staffCode.trim() || undefined,
      });
      if (resp && typeof resp.tempPassword === 'string') {
        setTempPassword(resp.tempPassword);
      } else {
        onClose();
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to create instructor.';
      alert(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-3">
      <div className={`${cardBase} w-full max-w-md p-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Add instructor</h3>
          <button onClick={onClose} className="chip">
            Close
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Full name *
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="Instructor name"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Email (optional, used for login)
            </div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="instructor@example.edu"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Subject / department (optional)
            </div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Mathematics, English"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Staff ID / code (optional)
            </div>
            <input
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. ST-001"
            />
          </label>

          {!tempPassword && (
            <button
              disabled={creating}
              onClick={handleSubmit}
              className="inline-flex h-10 px-4 items-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {creating ? 'Creating…' : 'Create instructor'}
            </button>
          )}

          {tempPassword && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                Instructor created. Share these login details securely:
              </div>
              <code className="block w-full text-xs p-3 rounded-lg bg-slate-100 dark:bg-black/40 whitespace-pre-wrap">
                Email / ID: {email || '(their assigned email or user ID)'}
                {'\n'}
                Staff code: {staffCode || '(see roster)'}
                {'\n'}
                Temp password: {tempPassword}
              </code>
              <button onClick={onClose} className="chip chip-active mt-2">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------------------- AddLearnerModal ---------------------------- */

export const AddLearnerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    email?: string;
    class_label?: string;
    guardian_email?: string;
    admission_code?: string;
    house?: string;
    dormitory?: string;
    club?: string;
  }) => Promise<{ tempPassword?: string | null } | void>;
}> = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [classLabel, setClassLabel] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [admissionCode, setAdmissionCode] = useState('');
  const [house, setHouse] = useState('');
  const [dormitory, setDormitory] = useState('');
  const [club, setClub] = useState('');
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setClassLabel('');
      setGuardianEmail('');
      setAdmissionCode('');
      setHouse('');
      setDormitory('');
      setClub('');
      setTempPassword(null);
      setCreating(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('Learner name is required.');
      return;
    }
    setCreating(true);
    try {
      const resp = await onCreate({
        name: name.trim(),
        email: email.trim() || undefined,
        class_label: classLabel.trim() || undefined,
        guardian_email: guardianEmail.trim() || undefined,
        admission_code: admissionCode.trim() || undefined,
        house: house.trim() || undefined,
        dormitory: dormitory.trim() || undefined,
        club: club.trim() || undefined,
      });
      if (resp && typeof resp.tempPassword === 'string') {
        setTempPassword(resp.tempPassword);
      } else {
        onClose();
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to create learner.';
      alert(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-3">
      <div className={`${cardBase} w-full max-w-md p-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Add learner</h3>
          <button onClick={onClose} className="chip">
            Close
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Full name *
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="Learner name"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Email (optional, used for login)
            </div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="learner@example.edu"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Admission No / Code
            </div>
            <input
              value={admissionCode}
              onChange={(e) => setAdmissionCode(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. ADM-2025-001"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Class / grade
            </div>
            <input
              value={classLabel}
              onChange={(e) => setClassLabel(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Grade 7 Maple"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              House (optional)
            </div>
            <input
              value={house}
              onChange={(e) => setHouse(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Maple / Blue"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Dormitory (optional)
            </div>
            <input
              value={dormitory}
              onChange={(e) => setDormitory(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Dorm A / Hostel 3"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Club / Activity (optional)
            </div>
            <input
              value={club}
              onChange={(e) => setClub(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Debate, Football, Science"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">
              Guardian email (optional)
            </div>
            <input
              value={guardianEmail}
              onChange={(e) => setGuardianEmail(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="parent@example.com"
            />
          </label>

          {!tempPassword && (
            <button
              disabled={creating}
              onClick={handleSubmit}
              className="inline-flex h-10 px-4 items-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {creating ? 'Creating…' : 'Create learner'}
            </button>
          )}

          {tempPassword && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                Learner created. Share these login details securely:
              </div>
              <code className="block w-full text-xs p-3 rounded-lg bg-slate-100 dark:bg-black/40 whitespace-pre-wrap">
                Email / ID: {email || '(their assigned email or user ID)'}
                {'\n'}
                Admission No/Code: {admissionCode || '(see roster)'}
                {'\n'}
                Temp password: {tempPassword}
              </code>
              <button onClick={onClose} className="chip chip-active mt-2">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* --------------------------- EditLearnerModal --------------------------- */

export const EditLearnerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  learner?: {
    name?: string | null;
    email?: string | null;
    admission_code?: string | null;
    class_label?: string | null;
    guardian_email?: string | null;
    house?: string | null;
    dormitory?: string | null;
    club?: string | null;
  } | null;
  onSave: (payload: {
    name: string;
    email?: string;
    admission_code?: string;
    class_label?: string;
    guardian_email?: string;
    house?: string;
    dormitory?: string;
    club?: string;
  }) => Promise<void>;
}> = ({ open, onClose, learner, onSave }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [admissionCode, setAdmissionCode] = useState('');
  const [classLabel, setClassLabel] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [house, setHouse] = useState('');
  const [dormitory, setDormitory] = useState('');
  const [club, setClub] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && learner) {
      setName(learner.name || '');
      setEmail(learner.email || '');
      setAdmissionCode(learner.admission_code || '');
      setClassLabel(learner.class_label || '');
      setGuardianEmail(learner.guardian_email || '');
      setHouse(learner.house || '');
      setDormitory(learner.dormitory || '');
      setClub(learner.club || '');
      setSaving(false);
    }
    if (!open) {
      setSaving(false);
    }
  }, [open, learner]);

  if (!open || !learner) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('Learner name is required.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      alert('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || undefined,
        admission_code: admissionCode.trim() || undefined,
        class_label: classLabel.trim() || undefined,
        guardian_email: guardianEmail.trim() || undefined,
        house: house.trim() || undefined,
        dormitory: dormitory.trim() || undefined,
        club: club.trim() || undefined,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to update learner.';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/40 p-3">
      <div className={`${cardBase} w-full max-w-md p-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Edit learner</h3>
          <button onClick={onClose} className="chip">
            Close
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Full name *</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="Learner name"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Email (optional)</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="learner@example.edu"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Admission No / Code</div>
            <input
              value={admissionCode}
              onChange={(e) => setAdmissionCode(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. ADM-2025-001"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Class / grade</div>
            <input
              value={classLabel}
              onChange={(e) => setClassLabel(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Grade 7 Maple"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Guardian email</div>
            <input
              value={guardianEmail}
              onChange={(e) => setGuardianEmail(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="parent@example.com"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">House (optional)</div>
            <input
              value={house}
              onChange={(e) => setHouse(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Maple / Blue"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Dormitory (optional)</div>
            <input
              value={dormitory}
              onChange={(e) => setDormitory(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Dorm A / Hostel 3"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Club / Activity (optional)</div>
            <input
              value={club}
              onChange={(e) => setClub(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Debate, Football, Science"
            />
          </label>

          <button
            disabled={saving}
            onClick={handleSubmit}
            className="inline-flex h-10 px-4 items-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-70"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------- EditInstructorModal ------------------------- */

export const EditInstructorModal: React.FC<{
  open: boolean;
  onClose: () => void;
  instructor?: {
    name?: string | null;
    email?: string | null;
    subject?: string | null;
    staff_code?: string | null;
  } | null;
  onSave: (payload: {
    name: string;
    email?: string;
    subject?: string;
    staff_code?: string;
  }) => Promise<void>;
}> = ({ open, onClose, instructor, onSave }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && instructor) {
      setName(instructor.name || '');
      setEmail(instructor.email || '');
      setSubject(instructor.subject || '');
      setStaffCode(instructor.staff_code || '');
      setSaving(false);
    }
    if (!open) setSaving(false);
  }, [open, instructor]);

  if (!open || !instructor) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('Instructor name is required.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      alert('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || undefined,
        subject: subject.trim() || undefined,
        staff_code: staffCode.trim() || undefined,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to update instructor.';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/40 p-3">
      <div className={`${cardBase} w-full max-w-md p-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Edit instructor</h3>
          <button onClick={onClose} className="chip">
            Close
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Full name *</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="Instructor name"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Email (optional)</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="instructor@example.edu"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Subject / department</div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. Mathematics, English"
            />
          </label>

          <label className="block">
            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mb-1">Staff ID / code</div>
            <input
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value)}
              className="w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-[#0f1821] px-3 py-2"
              placeholder="e.g. ST-001"
            />
          </label>

          <button
            disabled={saving}
            onClick={handleSubmit}
            className="inline-flex h-10 px-4 items-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-70"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

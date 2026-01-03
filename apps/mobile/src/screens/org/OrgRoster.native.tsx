/* eslint-disable no-console */
// apps/mobile/src/screens/org/OrgRoster.native.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
// Use legacy to avoid the deprecation warnings from expo-file-system in SDK 54+
import * as FileSystem from 'expo-file-system/legacy';

import tw from '../../../tailwind';
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

import type { MainStackParamList } from '../../navigation/types';

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

type MiniUser = {
  id: string | number;
  name?: string;
  email?: string;
  can_access_fees?: boolean;
  [k: string]: any;
};

const CARD = 'rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]';
const SUBTLE = 'text-[#49739c] dark:text-white/70';
const TITLE = 'text-[#0d141c] dark:text-white';

const seatCap = (tier?: string) => {
  switch (String(tier || 'starter').toLowerCase()) {
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

const csvEscape = (v: unknown) => {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const rowsToCsv = (rows: (string | null | undefined)[][]) =>
  rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');

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

const Chip: React.FC<{
  label: string;
  active?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}> = ({ label, active, onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={tw`px-3 py-2 rounded-full ${
      active
        ? 'bg-[#0d141c] dark:bg-white'
        : 'bg-[#e7edf4] dark:bg-[#172534]'
    } ${disabled ? 'opacity-50' : ''}`}
  >
    <Text
      style={tw`text-[12px] font-semibold ${
        active ? 'text-white dark:text-black' : 'text-[#0d141c] dark:text-white'
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
}> = ({ label, value, onChange, placeholder, keyboardType }) => (
  <View style={tw`mb-3`}>
    <Text style={tw`mb-2 text-sm font-semibold ${TITLE}`}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      keyboardType={keyboardType}
      placeholderTextColor={'#94a3b8'}
      style={tw`h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
    />
  </View>
);

const BaseModal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, onClose, children }) => (
  <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <View style={tw`flex-1 bg-black/40 px-4 justify-center`}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={tw`${CARD} p-4`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-lg font-extrabold ${TITLE}`}>{title}</Text>
            <Pressable onPress={onClose} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
              <Text style={tw`font-bold ${TITLE}`}>Close</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  </Modal>
);

const InviteModalNative: React.FC<{
  open: boolean;
  initialRole: 'instructor' | 'learner';
  onClose: () => void;
  onCreate: (role: 'instructor' | 'learner', email?: string) => Promise<{ url: string }>;
}> = ({ open, initialRole, onClose, onCreate }) => {
  const [role, setRole] = useState<'instructor' | 'learner'>(initialRole);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => setRole(initialRole), [initialRole, open]);
  useEffect(() => {
    if (open) setEmail('');
  }, [open]);

  const submit = async () => {
    setSaving(true);
    try {
      const { url } = await onCreate(role, email.trim() || undefined);
      onClose();
      Alert.alert('Invite created', url, [
        {
          text: 'Share',
          onPress: () => Share.share({ message: url }),
        },
        { text: 'OK' },
      ]);
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Unable to create invite.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal open={open} title="Invite" onClose={onClose}>
      <Text style={tw`text-sm ${SUBTLE} mb-3`}>
        Create an invite link and share it with the person.
      </Text>

      <Text style={tw`mb-2 text-sm font-semibold ${TITLE}`}>Role</Text>
      <View style={tw`flex-row gap-2 mb-3`}>
        <Chip label="Learner" active={role === 'learner'} onPress={() => setRole('learner')} />
        <Chip
          label="Instructor"
          active={role === 'instructor'}
          onPress={() => setRole('instructor')}
        />
      </View>

      <Field
        label="Email (optional)"
        value={email}
        onChange={setEmail}
        placeholder="person@example.com"
        keyboardType="email-address"
      />

      <Pressable
        onPress={submit}
        disabled={saving}
        style={tw`h-12 rounded-xl items-center justify-center bg-indigo-600 ${saving ? 'opacity-60' : ''}`}
      >
        {saving ? <ActivityIndicator /> : <Text style={tw`text-white font-extrabold`}>Create invite</Text>}
      </Pressable>
    </BaseModal>
  );
};

const AddInstructorModalNative: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (payload: { name: string; email?: string; subject?: string; staff_code?: string }) => Promise<{
    tempPassword: string | null;
  }>;
}> = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setSubject('');
      setStaffCode('');
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Missing', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      const resp = await onCreate({
        name: name.trim(),
        email: email.trim() || undefined,
        subject: subject.trim() || undefined,
        staff_code: staffCode.trim() || undefined,
      });
      onClose();
      if (resp?.tempPassword) {
        Alert.alert('Instructor created', `Temporary password: ${resp.tempPassword}`);
      } else {
        Alert.alert('Instructor created', 'Done.');
      }
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Unable to create instructor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal open={open} title="Add instructor" onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} placeholder="Jane Teacher" />
      <Field
        label="Email (optional)"
        value={email}
        onChange={setEmail}
        placeholder="jane@school.edu"
        keyboardType="email-address"
      />
      <Field label="Subject (optional)" value={subject} onChange={setSubject} placeholder="Math" />
      <Field
        label="Staff code (optional)"
        value={staffCode}
        onChange={setStaffCode}
        placeholder="T-001"
      />

      <Pressable
        onPress={submit}
        disabled={saving}
        style={tw`h-12 rounded-xl items-center justify-center bg-emerald-600 ${saving ? 'opacity-60' : ''}`}
      >
        {saving ? <ActivityIndicator /> : <Text style={tw`text-white font-extrabold`}>Create</Text>}
      </Pressable>
    </BaseModal>
  );
};

const AddLearnerModalNative: React.FC<{
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
  }) => Promise<{ tempPassword: string | null }>;
}> = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [adm, setAdm] = useState('');
  const [cls, setCls] = useState('');
  const [guardian, setGuardian] = useState('');
  const [house, setHouse] = useState('');
  const [dorm, setDorm] = useState('');
  const [club, setClub] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setAdm('');
      setCls('');
      setGuardian('');
      setHouse('');
      setDorm('');
      setClub('');
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Missing', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      const resp = await onCreate({
        name: name.trim(),
        email: email.trim() || undefined,
        admission_code: adm.trim() || undefined,
        class_label: cls.trim() || undefined,
        guardian_email: guardian.trim() || undefined,
        house: house.trim() || undefined,
        dormitory: dorm.trim() || undefined,
        club: club.trim() || undefined,
      });
      onClose();
      if (resp?.tempPassword) {
        Alert.alert('Learner created', `Temporary password: ${resp.tempPassword}`);
      } else {
        Alert.alert('Learner created', 'Done.');
      }
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Unable to create learner.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal open={open} title="Add learner" onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} placeholder="Aisha Mwangi" />
      <Field
        label="Email (optional)"
        value={email}
        onChange={setEmail}
        placeholder="aisha@students.your-school.edu"
        keyboardType="email-address"
      />
      <Field label="Admission No (optional)" value={adm} onChange={setAdm} placeholder="ADM-2025-001" />
      <Field label="Class / Stream (optional)" value={cls} onChange={setCls} placeholder="Grade 7 Blue" />
      <Field
        label="Guardian email (optional)"
        value={guardian}
        onChange={setGuardian}
        placeholder="parent@example.com"
        keyboardType="email-address"
      />
      <Field label="House (optional)" value={house} onChange={setHouse} placeholder="Taifa" />
      <Field label="Dormitory (optional)" value={dorm} onChange={setDorm} placeholder="North Wing" />
      <Field label="Club (optional)" value={club} onChange={setClub} placeholder="Science Club" />

      <Pressable
        onPress={submit}
        disabled={saving}
        style={tw`h-12 rounded-xl items-center justify-center bg-emerald-600 ${saving ? 'opacity-60' : ''}`}
      >
        {saving ? <ActivityIndicator /> : <Text style={tw`text-white font-extrabold`}>Create</Text>}
      </Pressable>
    </BaseModal>
  );
};

const EditInstructorModalNative: React.FC<{
  open: boolean;
  instructor: MiniUser | null;
  onClose: () => void;
  onSave: (payload: { name: string; email?: string; subject?: string; staff_code?: string }) => Promise<void>;
}> = ({ open, instructor, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && instructor) {
      setName(String(instructor.name ?? ''));
      setEmail(String(instructor.email ?? ''));
      setSubject(String(instructor.subject ?? ''));
      setStaffCode(String(instructor.staff_code ?? ''));
    }
  }, [open, instructor]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Missing', 'Name is required.');
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
      onClose();
      Alert.alert('Saved', 'Instructor updated.');
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Unable to update instructor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal open={open} title="Edit instructor" onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Email (optional)" value={email} onChange={setEmail} keyboardType="email-address" />
      <Field label="Subject (optional)" value={subject} onChange={setSubject} />
      <Field label="Staff code (optional)" value={staffCode} onChange={setStaffCode} />

      <Pressable
        onPress={submit}
        disabled={saving}
        style={tw`h-12 rounded-xl items-center justify-center bg-[#0d141c] dark:bg-white ${saving ? 'opacity-60' : ''}`}
      >
        {saving ? (
          <ActivityIndicator />
        ) : (
          <Text style={tw`font-extrabold text-white dark:text-black`}>Save</Text>
        )}
      </Pressable>
    </BaseModal>
  );
};

const EditLearnerModalNative: React.FC<{
  open: boolean;
  learner: MiniUser | null;
  onClose: () => void;
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
}> = ({ open, learner, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [adm, setAdm] = useState('');
  const [cls, setCls] = useState('');
  const [guardian, setGuardian] = useState('');
  const [house, setHouse] = useState('');
  const [dorm, setDorm] = useState('');
  const [club, setClub] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && learner) {
      setName(String(learner.name ?? ''));
      setEmail(String(learner.email ?? ''));
      setAdm(String(learner.admission_code ?? ''));
      setCls(String(learner.class_label ?? ''));
      setGuardian(String(learner.guardian_email ?? ''));
      setHouse(String(learner.house ?? ''));
      setDorm(String(learner.dormitory ?? ''));
      setClub(String(learner.club ?? ''));
    }
  }, [open, learner]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Missing', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || undefined,
        admission_code: adm.trim() || undefined,
        class_label: cls.trim() || undefined,
        guardian_email: guardian.trim() || undefined,
        house: house.trim() || undefined,
        dormitory: dorm.trim() || undefined,
        club: club.trim() || undefined,
      });
      onClose();
      Alert.alert('Saved', 'Learner updated.');
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Unable to update learner.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal open={open} title="Edit learner" onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Email (optional)" value={email} onChange={setEmail} keyboardType="email-address" />
      <Field label="Admission No (optional)" value={adm} onChange={setAdm} />
      <Field label="Class / Stream (optional)" value={cls} onChange={setCls} />
      <Field label="Guardian email (optional)" value={guardian} onChange={setGuardian} keyboardType="email-address" />
      <Field label="House (optional)" value={house} onChange={setHouse} />
      <Field label="Dormitory (optional)" value={dorm} onChange={setDorm} />
      <Field label="Club (optional)" value={club} onChange={setClub} />

      <Pressable
        onPress={submit}
        disabled={saving}
        style={tw`h-12 rounded-xl items-center justify-center bg-[#0d141c] dark:bg-white ${saving ? 'opacity-60' : ''}`}
      >
        {saving ? (
          <ActivityIndicator />
        ) : (
          <Text style={tw`font-extrabold text-white dark:text-black`}>Save</Text>
        )}
      </Pressable>
    </BaseModal>
  );
};

const OrgRosterScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const FOOTER_OVERLAY_PX = 84;
  const NAV_SPACER_PX = 12;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  const { backendUrl, orgToken, setOrgToken } = useShopContext() as any;

  const [tab, setTab] = useState<TabKey>('learners');

  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [instructors, setInstructors] = useState<MiniUser[]>([]);
  const [learners, setLearners] = useState<MiniUser[]>([]);

  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [seatsMax, setSeatsMax] = useState<number>(50);

  // search + filters
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const [classFilter, setClassFilter] = useState<string>('');

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // modals
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<'instructor' | 'learner'>('learner');
  const [addInstructorOpen, setAddInstructorOpen] = useState(false);
  const [addLearnerOpen, setAddLearnerOpen] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<MiniUser | null>(null);
  const [editingLearner, setEditingLearner] = useState<MiniUser | null>(null);

  // bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<Set<string>>(new Set());
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // CSV upload
  const [csvUploading, setCsvUploading] = useState(false);
  const [classPdfSharing, setClassPdfSharing] = useState(false);


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

  const loadAll = useCallback(async () => {
    if (!orgToken) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    try {
      const o = await getMyOrgOrBootstrap(backendUrl, orgToken);
      setOrg(o);
      setSeatsMax(seatCap(o?.tier));
      try {
        const u = await getOrgUsage(backendUrl, orgToken, o.id);
        setSeatsUsed(Number(u?.seats_used ?? 0));
      } catch {
        setSeatsUsed(Number(o?.seats_used ?? 0));
      }
      await refreshRoster(o.id);
    } catch (e: any) {
      console.log('[OrgRoster] load error', e?.message || e);
    } finally {
      setRefreshing(false);
    }
  }, [backendUrl, orgToken, refreshRoster]);

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

  // keep pagination sane
  useEffect(() => {
    setPage(1);
  }, [tab, pageSize, classFilter, search, searchField]);

  // prune selections
  useEffect(() => {
    setSelectedInstructorIds((prev) => new Set([...prev].filter((id) => instructors.some((u) => String(u.id) === id))));
  }, [instructors]);
  useEffect(() => {
    setSelectedLearnerIds((prev) => new Set([...prev].filter((id) => learners.some((u) => String(u.id) === id))));
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
  async (
    rawIds: Array<string | number | null | undefined>,
    worker: (id: string) => Promise<void>,
    limit = 3
  ) => {
    const ids = rawIds
      .map((v) => (v == null ? '' : String(v)).trim())
      .filter((s): s is string => s.length > 0);

    if (!ids.length) return [];

    const failures: Array<{ id: string; error: string }> = [];
    let idx = 0;
    let active = 0;

    return new Promise<typeof failures>((resolve) => {
      const launch = () => {
        if (idx >= ids.length) {
          if (active === 0) resolve(failures);
          return;
        }
          const id = ids[idx++]; // id is string | undefined when noUncheckedIndexedAccess=true
          if (!id) {
            // should never happen (we filtered), but satisfies TS + protects runtime
            launch();
            return;
          }

          active += 1;

          Promise.resolve(worker(id))
            .catch((e: any) => {
              const msg = e?.response?.data?.message ?? e?.message ?? 'Failed.';
              failures.push({ id, error: String(msg) });
            })

          .finally(() => {
            active -= 1;
            launch();
          });
      };

      for (let i = 0; i < Math.min(limit, ids.length); i += 1) launch();
    });
  },
  []
);

  const selectedSet = tab === 'instructors' ? selectedInstructorIds : selectedLearnerIds;
  const setSelectedSet = tab === 'instructors' ? setSelectedInstructorIds : setSelectedLearnerIds;

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

    Alert.alert(
      'Confirm',
      `Delete ${ids.length} ${label}${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
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
              Alert.alert('Done', `Deleted ${success} ${label}${success === 1 ? '' : 's'}.`);
              setSelectMode(false);
              setSelectedSet(new Set());
              return;
            }

            Alert.alert(
              'Partial success',
              `Deleted ${success} ${label}${success === 1 ? '' : 's'}, failed ${
                failures.length
              }.\n\n${failures
                .slice(0, 8)
                .map((f) => `• ${f.id}: ${f.error}`)
                .join('\n')}${failures.length > 8 ? `\n… +${failures.length - 8} more` : ''}`
            );
          },
        },
      ]
    );
  }, [
    backendUrl,
    org?.id,
    orgToken,
    runWithConcurrency,
    selectedSet,
    setSelectedSet,
    tab,
    org,
  ]);

  const handleRemoveMember = useCallback(
    async (u: MiniUser) => {
      if (!org?.id || !orgToken) return;

      const label = u.name || u.email || `User #${u.id}`;

      Alert.alert('Remove member', `Remove ${label} from ${org?.name || 'this organization'}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
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
              Alert.alert('Failed', e?.response?.data?.message || 'Failed to remove member.');
            }
          },
        },
      ]);
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
    },
    [backendUrl, editingLearner, org?.id, orgToken, refreshRoster]
  );

  const shareCsvText = useCallback(async (title: string, rows: (string | null | undefined)[][]) => {
    const csv = rowsToCsv(rows);
    await Share.share({ message: csv, title });
  }, []);

  const shareLearnerSampleCsv = useCallback(async () => {
    const rows: (string | null | undefined)[][] = [
      ['name', 'email', 'admission_code', 'class_label', 'guardian_email', 'house', 'dormitory', 'club'],
      ['Aisha Mwangi', 'aisha.mwangi@students.your-school.edu', 'ADM-2025-001', 'Grade 7 Blue', 'parent1@example.com', 'Taifa', 'North Wing', 'Science Club'],
      ['Omar Ali', 'omar.ali@students.your-school.edu', 'ADM-2025-002', 'Grade 7 Blue', 'parent2@example.com', 'Nyayo', 'South Wing', 'Debate Club'],
    ];
    await shareCsvText('learners-sample.csv', rows);
  }, [shareCsvText]);

  const shareLoginSheetCsv = useCallback(async () => {
    if (!org) {
      Alert.alert('Wait', 'Organization not loaded yet.');
      return;
    }
    if (!instructors.length && !learners.length) {
      Alert.alert('Empty', 'No roster to export yet.');
      return;
    }

    const rows: (string | null | undefined)[][] = [];
    rows.push(['Type', 'Name', 'Email', 'Staff code', 'Admission code', 'Class / Stream', 'Guardian email', 'Temp password']);

    instructors.forEach((u) => {
      rows.push(['Instructor', u.name, u.email, (u as any)?.staff_code, null, null, null, (u as any)?.temp_password]);
    });

    learners.forEach((u) => {
      rows.push(['Learner', u.name, u.email, null, (u as any)?.admission_code, (u as any)?.class_label, (u as any)?.guardian_email, (u as any)?.temp_password]);
    });

    const slug = org.slug || org.name || org.id;
    await shareCsvText(`login-sheet-${slug}.csv`, rows);
  }, [org, instructors, learners, shareCsvText]);

  const handleCsvUploadPick = useCallback(async () => {
    if (!org?.id || !orgToken) return;

    setCsvUploading(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset?.uri) throw new Error('No file selected.');

      const fileLike: any = {
        uri: asset.uri,
        name: asset.name || `learners-${Date.now()}.csv`,
        type: asset.mimeType || 'text/csv',
      };

      const resp: any = await uploadOrgLearnersCsv(backendUrl, orgToken, org.id, fileLike);
      const created = resp?.createdCount ?? 0;
      const reused = resp?.reusedCount ?? 0;

      Alert.alert(
        'CSV processed',
        `New learners: ${created}\nExisting reused/updated: ${reused}\n\nNext: Share “Login sheet (CSV)” to distribute passwords.`
      );

      await refreshRoster(org.id);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.message || e?.message || 'Failed to upload CSV.');
    } finally {
      setCsvUploading(false);
    }
  }, [backendUrl, org?.id, orgToken, refreshRoster]);

  const handleFeeAccess = useCallback(
    async (u: MiniUser, enable: boolean) => {
      if (!org?.id || !feeReady || feeSaving) return;
      const label = u.name || u.email || `User #${u.id}`;

      Alert.alert(
        'Confirm',
        enable
          ? `Grant Fees access to ${label}? This will remove access from other instructors.`
          : `Remove Fees access from ${label}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: enable ? 'Grant' : 'Remove',
            style: 'default',
            onPress: async () => {
              try {
                await setFeeAccess({ instructorUserId: u.id, enabled: enable });
                setInstructors((prev) =>
                  prev.map((p) => ({
                    ...p,
                    can_access_fees: String(p.id) === String(u.id) ? enable : false,
                  }))
                );
                Alert.alert('Done', enable ? 'Fee access granted.' : 'Fee access removed.');
              } catch (e: any) {
                Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Unable to update fee access.');
              }
            },
          },
        ]
      );
    },
    [feeReady, feeSaving, org?.id, setFeeAccess]
  );

const safeFilePart = (v: any) =>
  String(v || '')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '_')
    .slice(0, 80);

const shareCurrentClassRoster = useCallback(async () => {
  if (!org?.id || !orgToken) return;

  const cls = String(classFilter || '').trim();
  if (!cls) {
    Alert.alert('Select class', 'Choose a class/stream first.');
    return;
  }

  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  if (!canShare) {
    Alert.alert('Not available', 'PDF sharing is not available on this device/session.');
    return;
  }

  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) {
    Alert.alert('Not supported', 'PDF storage isn’t available in this session. Try again in the installed app.');
    return;
  }

  setClassPdfSharing(true);

  let fileUri = '';
  try {
    // Build same query logic as web
    const qsParts: string[] = [];
    qsParts.push(`class_label=${encodeURIComponent(cls)}`);

    if (search?.trim()) qsParts.push(`q=${encodeURIComponent(search.trim())}`);
    if (searchField && searchField !== 'all') qsParts.push(`field=${encodeURIComponent(searchField)}`);

    const qs = qsParts.join('&');
    const base = backendUrl.replace(/\/+$/, '');

    const slug = safeFilePart(org.slug || org.name || org.id);
    const clsSlug = safeFilePart(cls || 'all');
    fileUri = `${dir}roster-${slug}-${clsSlug}.pdf`;

    // Try both route variants (orgs vs organizations) for safety
    const candidates = [
      `${base}/api/orgs/${org.id}/learners/roster.pdf?${qs}`,
      `${base}/api/organizations/${org.id}/learners/roster.pdf?${qs}`,
    ];

    let ok = false;
    let lastStatus = 0;

    for (const url of candidates) {
      const dl = await FileSystem.downloadAsync(url, fileUri, {
        headers: { Authorization: `Bearer ${orgToken}` },
      });

      lastStatus = dl.status ?? 0;
      if (dl.status >= 200 && dl.status < 300) {
        ok = true;
        break;
      }
    }

    if (!ok) {
      throw new Error(`Failed to generate roster PDF. (HTTP ${lastStatus || 'error'})`);
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `${org.name || 'School'} — ${cls} roster`,
    });
  } catch (e: any) {
    Alert.alert('Failed', e?.message || 'Unable to share roster PDF.');
  } finally {
    setClassPdfSharing(false);

    // best-effort cleanup
    if (fileUri) {
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true } as any);
      } catch {
        // ignore
      }
    }
  }
}, [backendUrl, org?.id, org?.name, org?.slug, orgToken, classFilter, search, searchField]);


  const logoutInstitution = useCallback(async () => {
    try {
      await setOrgToken?.('');
      await AsyncStorage.multiRemove([
        'orgToken',
        'auth:mode',
        'auth:orgId',
        'auth:token',
        'org:role',
        'org:activeId',
        'auth:returnTo',
        'auth:returnTo:org',
      ]);
    } catch {
      // ignore
    }
    navigation.navigate('InstitutionLogin' as any);
  }, [navigation, setOrgToken]);

  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / (seatsMax || 1)) * 100));

  if (!orgToken) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 px-4 items-center justify-center`}>
          <View style={tw`${CARD} w-full p-5`}>
            <Text style={tw`text-xl font-extrabold ${TITLE}`}>Roster</Text>
            <Text style={tw`mt-2 text-sm ${SUBTLE}`}>Please sign in as an institution to continue.</Text>

            <Pressable
              onPress={() => navigation.navigate('InstitutionLogin' as any)}
              style={tw`mt-4 h-12 rounded-xl bg-emerald-600 items-center justify-center`}
            >
              <Text style={tw`text-white font-extrabold`}>Institution Login</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const searchFieldOptions: { key: SearchField; label: string }[] =
    tab === 'learners'
      ? [
          { key: 'all', label: 'All' },
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'admission_code', label: 'Admission' },
          { key: 'class_label', label: 'Class' },
        ]
      : [
          { key: 'all', label: 'All' },
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'staff_code', label: 'Staff' },
          { key: 'subject', label: 'Subject' },
        ];

  const renderRow = ({ item }: { item: MiniUser }) => {
    const isInstructor = tab === 'instructors';
    const selected = selectedSet.has(String(item.id));
    const cls = String((item as any)?.class_label ?? '').trim();
    const subtitle = isInstructor
      ? [String((item as any)?.staff_code ?? '').trim(), String((item as any)?.subject ?? '').trim()]
          .filter(Boolean)
          .join(' • ')
      : [String((item as any)?.admission_code ?? '').trim(), cls].filter(Boolean).join(' • ');

    const hasFees = Boolean(item.can_access_fees);


    return (
      <Pressable
        onPress={() => {
          if (selectMode) toggleSelect(item.id);
        }}
        style={tw`py-3`}
      >
        <View style={tw`flex-row items-center justify-between gap-3`}>
          <View style={tw`flex-1 min-w-0`}>
            <View style={tw`flex-row items-center gap-2 flex-wrap`}>
              <Text numberOfLines={1} style={tw`text-[15px] font-bold ${TITLE}`}>
                {item.name || item.email || `User #${item.id}`}
              </Text>

              {!isInstructor && !!cls ? (
                <View style={tw`px-2 py-0.5 rounded-full bg-indigo-500/10`}>
                  <Text style={tw`text-[11px] font-semibold text-indigo-700 dark:text-indigo-200`}>
                    {cls}
                  </Text>
                </View>
              ) : null}

              {isInstructor && hasFees ? (
                <View style={tw`px-2 py-0.5 rounded-full bg-emerald-500/10`}>
                  <Text style={tw`text-[11px] font-semibold text-emerald-700 dark:text-emerald-200`}>
                    Fees access
                  </Text>
                </View>
              ) : null}
            </View>

            {item.email ? (
              <Text numberOfLines={1} style={tw`text-xs ${SUBTLE} mt-0.5`}>
                {item.email}
              </Text>
            ) : null}

            {subtitle ? (
              <Text numberOfLines={1} style={tw`text-xs ${SUBTLE} mt-0.5`}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {selectMode ? (
            <View
              style={tw`h-6 w-6 rounded-md border ${
                selected ? 'bg-[#0d141c] dark:bg-white border-transparent' : 'border-[#cedbe8] dark:border-white/20'
              } items-center justify-center`}
            >
              {selected ? <Text style={tw`text-white dark:text-black font-extrabold`}>✓</Text> : null}
            </View>
          ) : (
            <View style={tw`flex-row items-center gap-2`}>
              {isInstructor ? (
                <Pressable
                  onPress={() => void handleFeeAccess(item, !hasFees)}
                  disabled={!feeReady || feeSaving}
                  style={tw`px-3 py-2 rounded-xl ${
                    hasFees
                      ? 'bg-emerald-500/15'
                      : 'bg-[#e7edf4] dark:bg-[#172534]'
                  } ${(feeReady && !feeSaving) ? '' : 'opacity-60'}`}
                >
                  <Text style={tw`text-[12px] font-semibold ${
                    hasFees ? 'text-emerald-700 dark:text-emerald-200' : TITLE
                  }`}>
                    {hasFees ? 'Remove fees' : 'Grant fees'}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => (isInstructor ? setEditingInstructor(item) : setEditingLearner(item))}
                style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
              >
                <Text style={tw`text-[12px] font-semibold ${TITLE}`}>Edit</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleRemoveMember(item)}
                style={tw`px-3 py-2 rounded-xl bg-rose-600/15`}
              >
                <Text style={tw`text-[12px] font-semibold text-rose-700 dark:text-rose-200`}>Remove</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={tw`mt-3 h-px bg-black/5 dark:bg-white/10`} />
      </Pressable>
    );
  };

  const Header = (
    <View style={tw`px-4`}>

      {/* Header card */}
      <View style={[tw`${CARD} p-4`, { marginTop: insets.top + NAV_SPACER_PX }]}>
        <View style={tw`flex-row items-start justify-between gap-3`}>
          <View style={tw`flex-1 min-w-0`}>
            <Text style={tw`text-[26px] font-extrabold ${TITLE}`}>Roster</Text>

            <Text style={tw`mt-1 text-sm ${SUBTLE}`}>
              {loading ? 'Loading…' : `${org?.name || 'Institution'} • Seats: ${seatsUsed}/${seatsMax}`}
            </Text>

            {!loading ? (
              <View style={tw`mt-2 h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden max-w-[260px]`}>
                <View
                  style={[
                    tw`${seatPct >= 90 ? 'bg-red-500' : 'bg-emerald-500'} h-full`,
                    { width: `${seatPct}%` },
                  ]}
                />
              </View>
            ) : null}
          </View>

          <View style={tw`items-end gap-2`}>
            <Pressable
              onPress={() => navigation.navigate('OrgProfile' as any)}
              style={tw`h-10 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
            >
              <Text style={tw`font-bold ${TITLE}`}>Profile</Text>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('OrgElearnPortal' as any)}
              style={tw`h-10 px-4 rounded-xl bg-indigo-600 items-center justify-center`}
            >
              <Text style={tw`font-bold text-white`}>Portal</Text>
            </Pressable>

            <Pressable
              onPress={logoutInstitution}
              style={tw`h-10 px-4 rounded-xl bg-rose-600 items-center justify-center`}
            >
              <Text style={tw`font-bold text-white`}>Logout</Text>
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View style={tw`mt-4 flex-row gap-2`}>
          <Pressable
            onPress={() => {
              setTab('instructors');
              setSelectMode(false);
              setSearchField('all');
              setClassFilter('');
            }}
            style={tw`flex-1 h-11 rounded-xl items-center justify-center ${
              tab === 'instructors'
                ? 'bg-[#0d141c] dark:bg-white'
                : 'bg-white dark:bg-[#0b1620] border border-black/10 dark:border-white/10'
            }`}
          >
            <Text style={tw`font-extrabold ${tab === 'instructors' ? 'text-white dark:text-black' : TITLE}`}>
              Instructors ({instructors.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setTab('learners');
              setSelectMode(false);
              setSearchField('all');
            }}
            style={tw`flex-1 h-11 rounded-xl items-center justify-center ${
              tab === 'learners'
                ? 'bg-[#0d141c] dark:bg-white'
                : 'bg-white dark:bg-[#0b1620] border border-black/10 dark:border-white/10'
            }`}
          >
            <Text style={tw`font-extrabold ${tab === 'learners' ? 'text-white dark:text-black' : TITLE}`}>
              Learners ({learners.length})
            </Text>
          </Pressable>
        </View>

        {tab === 'instructors' ? (
          <Text style={tw`mt-2 text-sm ${SUBTLE}`}>
            Fee access:{' '}
            <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>{feeDesignatedLabel}</Text>
          </Text>
        ) : null}

        {/* Search */}
        <View style={tw`mt-3`}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={
              tab === 'learners'
                ? 'Search learners (name, email, admission, class)…'
                : 'Search instructors (name, email, staff, subject)…'
            }
            placeholderTextColor={'#94a3b8'}
            style={tw`h-12 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
          />
        </View>

        {/* Search field chips */}
        <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
          {searchFieldOptions.map((o) => (
            <Chip key={o.key} label={o.label} active={searchField === o.key} onPress={() => setSearchField(o.key)} />
          ))}
        </View>

        {/* Class filter (learners) */}
        {tab === 'learners' ? (
          <View style={tw`mt-3`}>
            <Text style={tw`text-sm font-semibold ${TITLE} mb-2`}>Class filter</Text>
            <View style={tw`flex-row flex-wrap gap-2`}>
              <Chip label="All" active={!classFilter} onPress={() => setClassFilter('')} />
              {classes.slice(0, 20).map((c) => (
                <Chip key={c} label={c} active={classFilter === c} onPress={() => setClassFilter(c)} />
              ))}
              {classes.length > 20 ? (
                <View style={tw`px-2 py-2`}>
                  <Text style={tw`text-xs ${SUBTLE}`}>… +{classes.length - 20} more (use search)</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {/* Action bar */}
      <View style={tw`${CARD} mt-4 p-4`}>
        <View style={tw`flex-row flex-wrap items-center gap-2`}>
          {selectMode ? (
            <>
              <Text style={tw`text-sm font-semibold ${SUBTLE}`}>{selectedSet.size} selected</Text>
              <Pressable
                onPress={handleBulkDelete}
                disabled={!selectedSet.size || bulkDeleting}
                style={tw`px-3 py-2 rounded-xl bg-rose-600/15 ${(selectedSet.size && !bulkDeleting) ? '' : 'opacity-50'}`}
              >
                <Text style={tw`text-sm font-extrabold text-rose-700 dark:text-rose-200`}>
                  {bulkDeleting ? 'Deleting…' : 'Delete selected'}
                </Text>
              </Pressable>
              <Pressable onPress={cancelSelect} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
                <Text style={tw`text-sm font-bold ${TITLE}`}>Cancel</Text>
              </Pressable>
              <Pressable onPress={selectAllFiltered} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
                <Text style={tw`text-sm font-bold ${TITLE}`}>Select all</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setSelectMode(true)} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
              <Text style={tw`text-sm font-bold ${TITLE}`}>Select</Text>
            </Pressable>
          )}

          <Pressable onPress={shareLoginSheetCsv} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
            <Text style={tw`text-sm font-bold ${TITLE}`}>Login sheet (CSV)</Text>
          </Pressable>

          {tab === 'instructors' ? (
            <>
              <Pressable onPress={() => setAddInstructorOpen(true)} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
                <Text style={tw`text-sm font-bold ${TITLE}`}>Add instructor</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setInviteRole('instructor');
                  setInviteOpen(true);
                }}
                style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
              >
                <Text style={tw`text-sm font-bold ${TITLE}`}>Invite instructor</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={handleCsvUploadPick}
                disabled={csvUploading}
                style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] ${csvUploading ? 'opacity-60' : ''}`}
              >
                <Text style={tw`text-sm font-bold ${TITLE}`}>{csvUploading ? 'Importing…' : 'Import CSV'}</Text>
              </Pressable>

              <Pressable onPress={shareLearnerSampleCsv} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
                <Text style={tw`text-sm font-bold ${TITLE}`}>Sample CSV</Text>
              </Pressable>

              <Pressable onPress={() => setAddLearnerOpen(true)} style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}>
                <Text style={tw`text-sm font-bold ${TITLE}`}>Add learner</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setInviteRole('learner');
                  setInviteOpen(true);
                }}
                style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
              >
                <Text style={tw`text-sm font-bold ${TITLE}`}>Invite learner</Text>
              </Pressable>

              <Pressable
              onPress={() => void shareCurrentClassRoster()}
              disabled={!classFilter || classPdfSharing}
              style={tw`px-3 py-2 rounded-xl ${
                !classFilter || classPdfSharing ? 'bg-indigo-600/50' : 'bg-indigo-600'
              }`}
            >
              <Text style={tw`text-sm font-extrabold text-white`}>
                {!classFilter ? 'Select class first' : classPdfSharing ? 'Preparing PDF…' : 'Share class roster (PDF)'}
              </Text>
            </Pressable>

            </>
          )}
        </View>

        <View style={tw`mt-3 flex-row items-center justify-between`}>
          <Text style={tw`text-xs ${SUBTLE}`}>
            Showing <Text style={tw`font-extrabold ${TITLE}`}>{activeList.length}</Text> result(s)
          </Text>

          <View style={tw`flex-row items-center gap-2`}>
            <Text style={tw`text-xs ${SUBTLE}`}>Rows:</Text>
            <View style={tw`flex-row gap-2`}>
              {[10, 25, 50].map((n) => (
                <Chip key={String(n)} label={String(n)} active={pageSize === n} onPress={() => setPageSize(n)} />
              ))}
            </View>
          </View>
        </View>

        {tab === 'learners' ? (
          <Text style={tw`mt-2 text-[11px] ${SUBTLE}`}>
            Tip: Search by <Text style={tw`font-bold ${TITLE}`}>Admission</Text> or{' '}
            <Text style={tw`font-bold ${TITLE}`}>Class</Text>. To share a class roster, choose a class first.
          </Text>
        ) : null}
      </View>

      {/* List container title */}
      <View style={tw`mt-4 px-1`}>
        <Text style={tw`text-sm font-semibold ${SUBTLE}`}>
          Page {page} / {totalPages}
        </Text>
      </View>
    </View>
  );

  const Footer = (
    <View style={tw`px-4 pb-3`}>
      {loading ? null : totalPages > 1 ? (
        <View style={tw`${CARD} mt-3 p-3 flex-row items-center justify-between`}>
          <Pressable
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] ${page === 1 ? 'opacity-50' : ''}`}
          >
            <Text style={tw`font-bold ${TITLE}`}>‹ Prev</Text>
          </Pressable>

          <Text style={tw`text-xs ${SUBTLE}`}>
            Page <Text style={tw`font-extrabold ${TITLE}`}>{page}</Text> of{' '}
            <Text style={tw`font-extrabold ${TITLE}`}>{totalPages}</Text>
          </Text>

          <Pressable
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] ${page === totalPages ? 'opacity-50' : ''}`}
          >
            <Text style={tw`font-bold ${TITLE}`}>Next ›</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <FlatList
        data={loading ? [] : paginated}
        keyExtractor={(u) => String(u.id)}
        renderItem={renderRow}
        ListHeaderComponent={Header}
        ListEmptyComponent={
          loading ? (
            <View style={tw`px-4 mt-4`}>
              <View style={tw`${CARD} p-4`}>
                <ActivityIndicator />
                <Text style={tw`mt-2 text-sm ${SUBTLE}`}>Loading roster…</Text>
              </View>
            </View>
          ) : (
            <View style={tw`px-4 mt-4`}>
              <View style={tw`${CARD} p-8 items-center`}>
                <Text style={tw`text-2xl`}>{tab === 'instructors' ? '👩🏽‍🏫' : '🎓'}</Text>
                <Text style={tw`mt-2 font-extrabold ${TITLE}`}>
                  {tab === 'instructors' ? 'No instructors found.' : 'No learners found.'}
                </Text>
                <Text style={tw`mt-1 text-sm ${SUBTLE}`}>Try clearing filters or add new records.</Text>
              </View>
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ paddingBottom: bottomPad }}>
            {Footer}
          </View>
        }
        contentContainerStyle={tw`pb-2`}
        onRefresh={loadAll}
        refreshing={refreshing}
        showsVerticalScrollIndicator={false}
      />

      {/* Modals */}
      <InviteModalNative
        open={inviteOpen}
        initialRole={inviteRole}
        onClose={() => setInviteOpen(false)}
        onCreate={handleCreateMembershipInvite}
      />

      <AddInstructorModalNative
        open={addInstructorOpen}
        onClose={() => setAddInstructorOpen(false)}
        onCreate={handleCreateInstructor}
      />

      <AddLearnerModalNative
        open={addLearnerOpen}
        onClose={() => setAddLearnerOpen(false)}
        onCreate={handleCreateLearner}
      />

      <EditInstructorModalNative
        open={!!editingInstructor}
        instructor={editingInstructor}
        onClose={() => setEditingInstructor(null)}
        onSave={handleUpdateInstructor}
      />

      <EditLearnerModalNative
        open={!!editingLearner}
        learner={editingLearner}
        onClose={() => setEditingLearner(null)}
        onSave={handleUpdateLearner}
      />
    </SafeAreaView>
  );
};

export default OrgRosterScreen;

/* eslint-disable prettier/prettier */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import tw from '../../../tailwind';
import { useThemePref } from '../../theme/ThemeContext';

/* ----------------------------- shared palette ----------------------------- */

function usePalette() {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';
  return {
    isDark,
    bg: isDark ? '#020617' : '#f8fafc',
    card: isDark ? '#0b1016' : '#ffffff',
    border: isDark ? 'rgba(148,163,184,0.28)' : '#cedbe8',
    divider: isDark ? 'rgba(15,23,42,1)' : '#e7edf4',
    text: isDark ? '#e5f0ff' : '#0d141c',
    textMuted: isDark ? 'rgba(148,163,184,0.95)' : '#49739c',
    textSubtle: isDark ? 'rgba(148,163,184,0.85)' : 'rgba(73,115,156,0.75)',
    surface(style?: any) {
      return [
        tw`rounded-3xl p-4`,
        {
          backgroundColor: this.card,
          borderColor: this.border,
          borderWidth: 1,
        },
        style,
      ];
    },
    input() {
      return [
        tw`px-3 py-2 rounded-xl text-sm`,
        {
          backgroundColor: this.bg,
          borderColor: this.border,
          borderWidth: 1,
          color: this.text,
        },
      ];
    },
    button(kind: 'primary' | 'neutral' = 'primary') {
      if (kind === 'primary') {
        return tw`h-10 px-4 rounded-xl bg-emerald-600 items-center justify-center`;
      }
      return [
        tw`h-10 px-4 rounded-xl items-center justify-center`,
        { backgroundColor: this.divider },
      ];
    },
    chip(active?: boolean) {
      if (active) {
        return [
          tw`px-3 py-1.5 rounded-full`,
          {
            backgroundColor: this.isDark ? '#22c55e33' : '#dcfce7',
          },
        ];
      }
      return [tw`px-3 py-1.5 rounded-full`, { backgroundColor: this.divider }];
    },
    monoText() {
      return {
        fontFamily: Platform.select({
          ios: 'Menlo',
          android: 'monospace',
          default: 'monospace',
        }),
      };
    },
  };
}

/* -------------------------------- InviteModal ----------------------------- */

export const InviteModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (role: 'instructor' | 'learner', email?: string) => Promise<{ url: string } | void>;
  initialRole?: 'instructor' | 'learner';
}> = ({ open, onClose, onCreate, initialRole = 'learner' }) => {
  const palette = usePalette();
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

  const copyUrl = async () => {
    if (!url) return;
    try {
      await Clipboard.setStringAsync(url);
      Alert.alert('Copied', 'Invite link copied to clipboard.');
    } catch {
      // ignore
    }
  };

  const shareEmail = () => {
    if (!url) return;
    const mailUrl = `mailto:?subject=${encodeURIComponent(
      'You’re invited'
    )}&body=${encodeURIComponent(url)}`;
    Linking.openURL(mailUrl).catch(() => {});
  };

  const shareWhatsApp = () => {
    if (!url) return;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(url)}`;
    Linking.openURL(waUrl).catch(() => {});
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={tw`flex-1 items-center justify-center bg-black/40 p-3`}>
        <View style={[palette.surface(), tw`w-full max-w-xl`]}>
          {/* Header */}
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Create invite</Text>
            <TouchableOpacity onPress={onClose} style={palette.chip()}>
              <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={tw`mt-3`}>
            {/* Role */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>Role</Text>
              <View style={tw`flex-row`}>
                {(['learner', 'instructor'] as const).map((r) => {
                  const active = role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setRole(r)}
                      style={[
                        tw`px-3 py-2 rounded-2xl mr-2`,
                        {
                          backgroundColor: active ? palette.divider : 'transparent',
                          borderColor: palette.border,
                          borderWidth: active ? 1 : 0,
                        },
                      ]}
                    >
                      <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                        {r === 'learner' ? 'Learner' : 'Instructor'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Email */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>Email (optional)</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.edu"
                placeholderTextColor={palette.textSubtle}
                autoCapitalize="none"
                keyboardType="email-address"
                style={palette.input()}
              />
            </View>

            {/* Create / URL */}
            {!url ? (
              <TouchableOpacity
                disabled={creating}
                onPress={async () => {
                  try {
                    setCreating(true);
                    const r = await onCreate(role, email || undefined);
                    if (r?.url) setUrl(r.url);
                  } catch (e: any) {
                    const msg =
                      e?.response?.data?.message || e?.message || 'Failed to create invite.';
                    Alert.alert('Invite', msg);
                  } finally {
                    setCreating(false);
                  }
                }}
                style={palette.button('primary')}
              >
                <Text style={tw`text-white font-semibold text-sm`}>
                  {creating ? 'Creating…' : 'Create invite'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={tw`mt-2`}>
                <View
                  style={[
                    tw`rounded-2xl p-3`,
                    {
                      backgroundColor: palette.divider,
                      borderColor: palette.border,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text
                    selectable
                    style={[tw`text-xs`, { color: palette.text }, palette.monoText()]}
                  >
                    {url}
                  </Text>
                </View>
                <View style={tw`flex-row flex-wrap gap-2 mt-2`}>
                  <TouchableOpacity onPress={copyUrl} style={palette.chip(true)}>
                    <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={shareEmail} style={palette.chip()}>
                    <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>Email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={shareWhatsApp} style={palette.chip()}>
                    <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                      WhatsApp
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* --------------------------- AddInstructorModal --------------------------- */

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
  const palette = usePalette();
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
      Alert.alert('Add instructor', 'Instructor name is required.');
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
      Alert.alert('Add instructor', msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={tw`flex-1 items-center justify-center bg-black/40 p-3`}>
        <View style={[palette.surface(), tw`w-full max-w-xl`]}>
          {/* Header */}
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Add instructor</Text>
            <TouchableOpacity onPress={onClose} style={palette.chip()}>
              <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={tw`mt-3`}>
            {/* Name */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>Full name *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Instructor name"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {/* Email */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Email (optional, used for login)
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="instructor@example.edu"
                placeholderTextColor={palette.textSubtle}
                autoCapitalize="none"
                keyboardType="email-address"
                style={palette.input()}
              />
            </View>

            {/* Subject */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Subject / department (optional)
              </Text>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                placeholder="e.g. Mathematics, English"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {/* Staff code */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Staff ID / code (optional)
              </Text>
              <TextInput
                value={staffCode}
                onChangeText={setStaffCode}
                placeholder="e.g. ST-001"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {!tempPassword && (
              <TouchableOpacity
                disabled={creating}
                onPress={handleSubmit}
                style={palette.button('primary')}
              >
                <Text style={tw`text-white font-semibold text-sm`}>
                  {creating ? 'Creating…' : 'Create instructor'}
                </Text>
              </TouchableOpacity>
            )}

            {tempPassword && (
              <View style={tw`mt-3`}>
                <Text style={[tw`text-xs mb-2`, { color: palette.textMuted }]}>
                  Instructor created. Share these login details securely:
                </Text>
                <View
                  style={[
                    tw`rounded-2xl p-3`,
                    {
                      backgroundColor: palette.divider,
                      borderColor: palette.border,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text
                    selectable
                    style={[tw`text-xs`, { color: palette.text }, palette.monoText()]}
                  >
                    Email / ID: {email || '(their assigned email or user ID)'}
                    {'\n'}
                    Staff code: {staffCode || '(see roster)'}
                    {'\n'}
                    Temp password: {tempPassword}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={[palette.chip(true), tw`mt-3 self-start`]}
                >
                  <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* ---------------------------- AddLearnerModal ----------------------------- */

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
  const palette = usePalette();
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
      Alert.alert('Add learner', 'Learner name is required.');
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
      Alert.alert('Add learner', msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={tw`flex-1 items-center justify-center bg-black/40 p-3`}>
        <View style={[palette.surface(), tw`w-full max-w-xl`]}>
          {/* Header */}
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>Add learner</Text>
            <TouchableOpacity onPress={onClose} style={palette.chip()}>
              <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={tw`mt-3`}>
            {/* Name */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>Full name *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Learner name"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {/* Email */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Email (optional, used for login)
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="learner@example.edu"
                placeholderTextColor={palette.textSubtle}
                autoCapitalize="none"
                keyboardType="email-address"
                style={palette.input()}
              />
            </View>

            {/* Admission code */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Admission No / Code
              </Text>
              <TextInput
                value={admissionCode}
                onChangeText={setAdmissionCode}
                placeholder="e.g. ADM-2025-001"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {/* Class / grade */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>Class / grade</Text>
              <TextInput
                value={classLabel}
                onChangeText={setClassLabel}
                placeholder="e.g. Grade 7 Maple"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {/* House */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>House (optional)</Text>
              <TextInput
                value={house}
                onChangeText={setHouse}
                placeholder="e.g. Maple / Blue"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {/* Dormitory */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Dormitory (optional)
              </Text>
              <TextInput
                value={dormitory}
                onChangeText={setDormitory}
                placeholder="e.g. Dorm A / Hostel 3"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {/* Club */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Club / Activity (optional)
              </Text>
              <TextInput
                value={club}
                onChangeText={setClub}
                placeholder="e.g. Debate, Football, Science"
                placeholderTextColor={palette.textSubtle}
                style={palette.input()}
              />
            </View>

            {/* Guardian email */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-xs mb-1`, { color: palette.textMuted }]}>
                Guardian email (optional)
              </Text>
              <TextInput
                value={guardianEmail}
                onChangeText={setGuardianEmail}
                placeholder="parent@example.com"
                placeholderTextColor={palette.textSubtle}
                autoCapitalize="none"
                keyboardType="email-address"
                style={palette.input()}
              />
            </View>

            {!tempPassword && (
              <TouchableOpacity
                disabled={creating}
                onPress={handleSubmit}
                style={palette.button('primary')}
              >
                <Text style={tw`text-white font-semibold text-sm`}>
                  {creating ? 'Creating…' : 'Create learner'}
                </Text>
              </TouchableOpacity>
            )}

            {tempPassword && (
              <View style={tw`mt-3`}>
                <Text style={[tw`text-xs mb-2`, { color: palette.textMuted }]}>
                  Learner created. Share these login details securely:
                </Text>
                <View
                  style={[
                    tw`rounded-2xl p-3`,
                    {
                      backgroundColor: palette.divider,
                      borderColor: palette.border,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text
                    selectable
                    style={[tw`text-xs`, { color: palette.text }, palette.monoText()]}
                  >
                    Email / ID: {email || '(their assigned email or user ID)'}
                    {'\n'}
                    Admission No/Code: {admissionCode || '(see roster)'}
                    {'\n'}
                    Temp password: {tempPassword}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={[palette.chip(true), tw`mt-3 self-start`]}
                >
                  <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

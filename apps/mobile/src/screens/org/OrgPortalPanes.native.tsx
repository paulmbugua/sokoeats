/* apps/mobile/src/screens/org/OrgPortalPanes.native.tsx */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  FlatList,
  Alert,
  Image,
  Linking,
} from 'react-native';
import tw from '../../../tailwind';
import type { OrgResp as Org, OrgAnalyticsRow } from '@mytutorapp/shared/api/orgApi';

type TabKey = 'branding' | 'assign' | 'analytics';
type Period = 'month' | 'term' | 'year';

const Label = ({ children }: { children: React.ReactNode }) => (
  <Text style={tw`text-xs text-gray-300`}>{children}</Text>
);

const Pill = ({ children }: { children: React.ReactNode }) => (
  <View style={tw`px-2 py-0.5 rounded-full bg-white/10`}>
    <Text style={tw`text-[11px] text-white`}>{children}</Text>
  </View>
);

/* ─────────────────────────────────────────────────────────
 * BRANDING + ASSIGN pane (Native)
 * ───────────────────────────────────────────────────────── */

type MiniUser = { id: string | number; name?: string; email?: string };

type BrandingAssignProps = {
  tab: TabKey;
  setTab: (t: TabKey) => void;

  // instructors (for bulk mail / WhatsApp share)
  instructors?: MiniUser[];

  // capabilities
  canBranding: boolean;
  canAssignments: boolean;
  canCustomPassTimers: boolean;
  canSSO: boolean;
  canWebhooks: boolean;
  canEmailReports: boolean;

  // org/session
  org: Org | null;
  token?: string | null;
  backendUrl: string;

  // branding form
  form: any;
  setForm: (f: any) => void;

  uploadingLogo: boolean;
  uploadingSignature: boolean;
  uploadingInstructorSignature?: boolean;

  /** Native: parent handles media picker and upload. */
  onPickImage: (target: 'logo_url' | 'signature_url' | 'instructor_signature_url') => Promise<void>;

  onSaveBranding: () => void;
  onSendTestReport: () => Promise<void>;

  // Teach with AI assignment
  courseId: string;
  setCourseId: (v: string) => void;
  titleOverride: string;
  setTitleOverride: (v: string) => void;
  passMark: number | '';
  setPassMark: (v: number | '') => void;
  timer: number | '';
  setTimer: (v: number | '') => void;
  dueAt: string;
  setDueAt: (v: string) => void;
  onCreateAssignment: () => void;
  inviteLink: string;
  copyLink: () => Promise<void> | void;

  // NEW: optional assignment scope (class/subject)
  assignClassLabel?: string;
  assignSubjectKey?: string;
  setAssignScope?: (opts: { classLabel?: string; subjectKey?: string }) => void;

  // NEW: legacy (classic) assignment fields
  legacyTitle: string;
  setLegacyTitle: (v: string) => void;
  legacyInstructions: string;
  setLegacyInstructions: (v: string) => void;
  legacyDueAt: string;
  setLegacyDueAt: (v: string) => void;
  legacyAttachmentLabel?: string | null;
  legacyUploadingAttachment?: boolean;
  onPickLegacyAttachment?: () => Promise<void>;
  onCreateLegacyAssignment: () => void;
  creatingLegacyAssignment?: boolean;
};

export function BrandingAssignPane({
  tab,
  setTab,
  instructors = [],
  canBranding,
  canAssignments,
  canCustomPassTimers,
  canSSO,
  canWebhooks,
  canEmailReports,
  org,
  token,
  backendUrl,
  form,
  setForm,
  uploadingLogo,
  uploadingSignature,
  uploadingInstructorSignature,
  onPickImage,
  onSaveBranding,
  onSendTestReport,
  courseId,
  setCourseId,
  titleOverride,
  setTitleOverride,
  passMark,
  setPassMark,
  timer,
  setTimer,
  dueAt,
  setDueAt,
  onCreateAssignment,
  inviteLink,
  copyLink,
  assignClassLabel,
  assignSubjectKey,
  setAssignScope,
  legacyTitle,
  setLegacyTitle,
  legacyInstructions,
  setLegacyInstructions,
  legacyDueAt,
  setLegacyDueAt,
  legacyAttachmentLabel,
  legacyUploadingAttachment,
  onPickLegacyAttachment,
  onCreateLegacyAssignment,
  creatingLegacyAssignment,
}: BrandingAssignProps) {
  // Webhook test enablement logic
  const rawUrl = String(form.webhook_url ?? '').trim();
  const urlOk = /^https:\/\/.+/i.test(rawUrl);
  const canSendTest = Boolean(org?.id && token && form.webhook_enabled && urlOk);
  const [isSending, setIsSending] = useState(false);

  const logoPreview = form.logo_url || '';
  const sigPreview = form.signature_url || '';
  const instructorSigPreview = form.instructor_signature_url || '';

  // Instructor utilities (mailto chunking + WhatsApp share)
  const { instructorEmails, bccChunks } = useMemo(() => {
    const emails = (instructors ?? []).map((i) => (i.email || '').trim()).filter(Boolean);

    const mkMailto = (arr: string[], link: string) => {
      const subject = encodeURIComponent('Course invite');
      const body = encodeURIComponent(link);
      const bcc = encodeURIComponent(arr.join(','));
      return `mailto:?subject=${subject}&bcc=${bcc}&body=${body}`;
    };

    const chunks: string[][] = [];
    if (inviteLink) {
      let cur: string[] = [];
      for (const e of emails) {
        const test = mkMailto([...cur, e], inviteLink);
        if (test.length > 1800 || cur.length >= 50) {
          if (cur.length) chunks.push(cur);
          cur = [e];
        } else {
          cur.push(e);
        }
      }
      if (cur.length) chunks.push(cur);
    }
    return { instructorEmails: emails, bccChunks: chunks };
  }, [instructors, inviteLink]);

  const openMailto = async (emails: string[]) => {
    if (!inviteLink || !emails.length) return;
    const subject = encodeURIComponent('Course invite');
    const body = encodeURIComponent(inviteLink);
    const bcc = encodeURIComponent(emails.join(','));
    const url = `mailto:?subject=${subject}&bcc=${bcc}&body=${body}`;
    try {
      await Linking.openURL(url);
    } catch {}
  };

  const openWhatsApp = async () => {
    if (!inviteLink) return;
    const text = encodeURIComponent(
      `Please share this course invite with your learners:\n\n${inviteLink}`
    );
    const waUrl = `https://wa.me/?text=${text}`;
    try {
      await Linking.openURL(waUrl);
    } catch {}
  };

  return (
    <View style={tw`rounded-2xl border border-white/10 bg-white/5 p-3`}>
      {/* Tabs header */}
      <View style={tw`mb-3 flex-row`}>
        {canBranding && (
          <TouchableOpacity
            onPress={() => setTab('branding')}
            style={tw.style(
              'px-3 py-1.5 rounded-xl mr-2',
              tab === 'branding' ? 'bg-white/10' : 'bg-white/5'
            )}
          >
            <Text style={tw`text-sm text-white`}>Branding</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setTab('assign')}
          style={tw.style(
            'px-3 py-1.5 rounded-xl',
            tab === 'assign' ? 'bg-white/10' : 'bg-white/5'
          )}
        >
          <Text style={tw`text-sm text-white`}>Assign</Text>
        </TouchableOpacity>
      </View>

      {/* ───────────────── BRANDING TAB ───────────────── */}
      {tab === 'branding' && (
        <View style={tw`gap-3`}>
          {!canBranding && (
            <Text style={tw`text-sm text-amber-300`}>
              Branding settings aren’t editable from this account. Please ask your institution owner
              or admin to update logos, signatures, and contact details.
            </Text>
          )}

          {/* Institution Name */}
          <View>
            <Label>Institution Name</Label>
            <TextInput
              style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
              placeholder="Example Academy"
              placeholderTextColor="#9CA3AF"
              value={form.name || ''}
              onChangeText={(t) => setForm({ ...form, name: t })}
              editable={canBranding}
            />
          </View>

          {/* Certificate Title */}
          <View>
            <Label>Certificate Title (optional)</Label>
            <TextInput
              style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
              placeholder="Certificate of Completion"
              placeholderTextColor="#9CA3AF"
              value={form.certificate_title || ''}
              onChangeText={(t) => setForm({ ...form, certificate_title: t })}
              editable={canBranding}
            />
          </View>

          {/* Logo */}
          <View>
            <Label>Logo</Label>
            <View style={tw`flex-row items-center mt-2`}>
              <View
                style={tw`w-16 h-16 rounded bg-white/10 border border-white/10 items-center justify-center overflow-hidden`}
              >
                {logoPreview ? (
                  <Image source={{ uri: logoPreview }} style={tw`w-16 h-16`} resizeMode="contain" />
                ) : (
                  <Text style={tw`text-[10px] text-white/60 px-1 text-center`}>No logo</Text>
                )}
              </View>
              <View style={tw`ml-3 flex-1`}>
                <TextInput
                  style={tw`mb-2 px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="https://..."
                  placeholderTextColor="#9CA3AF"
                  value={form.logo_url || ''}
                  onChangeText={(t) => setForm({ ...form, logo_url: t })}
                  editable={canBranding}
                />
                <TouchableOpacity
                  onPress={() => onPickImage('logo_url')}
                  disabled={!canBranding || uploadingLogo || !token}
                  style={tw.style(
                    'px-3 py-2 rounded',
                    !canBranding || uploadingLogo || !token ? 'bg-white/10' : 'bg-emerald-600'
                  )}
                >
                  {uploadingLogo ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={tw`text-white text-sm font-semibold`}>Upload Logo</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Registrar Signature */}
          <View>
            <Label>Registrar Signature</Label>
            <View style={tw`flex-row items-center mt-2`}>
              <View
                style={tw`w-16 h-16 rounded bg-white/10 border border-white/10 items-center justify-center overflow-hidden`}
              >
                {sigPreview ? (
                  <Image source={{ uri: sigPreview }} style={tw`w-16 h-16`} resizeMode="contain" />
                ) : (
                  <Text style={tw`text-[10px] text-white/60 px-1 text-center`}>No signature</Text>
                )}
              </View>
              <View style={tw`ml-3 flex-1`}>
                <TextInput
                  style={tw`mb-2 px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="https://..."
                  placeholderTextColor="#9CA3AF"
                  value={form.signature_url || ''}
                  onChangeText={(t) => setForm({ ...form, signature_url: t })}
                  editable={canBranding}
                />
                <TouchableOpacity
                  onPress={() => onPickImage('signature_url')}
                  disabled={!canBranding || uploadingSignature || !token}
                  style={tw.style(
                    'px-3 py-2 rounded',
                    !canBranding || uploadingSignature || !token ? 'bg-white/10' : 'bg-emerald-600'
                  )}
                >
                  {uploadingSignature ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={tw`text-white text-sm font-semibold`}>Upload Signature</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Course Instructor Signature */}
          <View>
            <Label>Course Instructor Signature</Label>
            <View style={tw`flex-row items-center mt-2`}>
              <View
                style={tw`w-16 h-16 rounded bg-white/10 border border-white/10 items-center justify-center overflow-hidden`}
              >
                {instructorSigPreview ? (
                  <Image
                    source={{ uri: instructorSigPreview }}
                    style={tw`w-16 h-16`}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={tw`text-[10px] text-white/60 px-1 text-center`}>No signature</Text>
                )}
              </View>
              <View style={tw`ml-3 flex-1`}>
                <TextInput
                  style={tw`mb-2 px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="https://..."
                  placeholderTextColor="#9CA3AF"
                  value={form.instructor_signature_url || ''}
                  onChangeText={(t) => setForm({ ...form, instructor_signature_url: t })}
                  editable={canBranding}
                />
                <TouchableOpacity
                  onPress={() => onPickImage('instructor_signature_url')}
                  disabled={!canBranding || uploadingInstructorSignature || !token}
                  style={tw.style(
                    'px-3 py-2 rounded',
                    !canBranding || uploadingInstructorSignature || !token
                      ? 'bg-white/10'
                      : 'bg-emerald-600'
                  )}
                >
                  {uploadingInstructorSignature ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={tw`text-white text-sm font-semibold`}>Upload Signature</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Institution contact details */}
          <View>
            <View style={tw`flex-row items-center justify-between mb-1 flex-wrap`}>
              <Label>Institution contact details</Label>
              <Text style={tw`text-[10px] text-white/50`}>Optional – appears on report cards.</Text>
            </View>

            <View style={tw`gap-2`}>
              <Text style={tw`text-[11px] text-gray-300`}>Address line 1</Text>
              <TextInput
                style={tw`w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                placeholder="123 Main Street"
                placeholderTextColor="#9CA3AF"
                value={form.address_line1 || ''}
                onChangeText={(t) => setForm({ ...form, address_line1: t })}
                editable={canBranding}
              />

              <Text style={tw`mt-2 text-[11px] text-gray-300`}>Address line 2</Text>
              <TextInput
                style={tw`w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                placeholder="City / State / Country"
                placeholderTextColor="#9CA3AF"
                value={form.address_line2 || ''}
                onChangeText={(t) => setForm({ ...form, address_line2: t })}
                editable={canBranding}
              />

              <Text style={tw`mt-2 text-[11px] text-gray-300`}>Phone</Text>
              <TextInput
                style={tw`w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                placeholder="+00 123 456 789"
                placeholderTextColor="#9CA3AF"
                value={form.phone_number || ''}
                onChangeText={(t) => setForm({ ...form, phone_number: t })}
                editable={canBranding}
              />

              <Text style={tw`mt-2 text-[11px] text-gray-300`}>Contact email</Text>
              <TextInput
                style={tw`w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                placeholder="info@school.example"
                placeholderTextColor="#9CA3AF"
                value={form.contact_email || ''}
                onChangeText={(t) => setForm({ ...form, contact_email: t })}
                editable={canBranding}
              />

              <Text style={tw`mt-2 text-[11px] text-gray-300`}>Website</Text>
              <TextInput
                style={tw`w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                placeholder="https://school.example"
                placeholderTextColor="#9CA3AF"
                value={form.website_url || ''}
                onChangeText={(t) => setForm({ ...form, website_url: t })}
                editable={canBranding}
              />
            </View>
          </View>

          {/* Default Pass Mark */}
          <View>
            <View style={tw`flex-row items-center gap-2`}>
              <Label>Default Pass Mark</Label>
              {!canCustomPassTimers && <Pill>Pro+</Pill>}
            </View>
            <TextInput
              style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
              keyboardType="numeric"
              value={String(form.default_pass_mark ?? 70)}
              onChangeText={(t) =>
                setForm({
                  ...form,
                  default_pass_mark: Number(t) || 70,
                })
              }
              editable={canCustomPassTimers}
            />
          </View>

          {/* Quiz Time Limit */}
          <View>
            <View style={tw`flex-row items-center gap-2`}>
              <Label>Quiz Time Limit (seconds)</Label>
              {!canCustomPassTimers && <Pill>Pro+</Pill>}
            </View>
            <TextInput
              style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
              keyboardType="numeric"
              value={String(form.quiz_time_limit_s ?? 900)}
              onChangeText={(t) =>
                setForm({
                  ...form,
                  quiz_time_limit_s: Number(t) || 900,
                })
              }
              editable={canCustomPassTimers}
            />
          </View>

          {/* Allow retry */}
          <View style={tw`flex-row items-center`}>
            <Switch
              value={!!form.allow_retry}
              onValueChange={(v) => setForm({ ...form, allow_retry: v })}
              disabled={!canCustomPassTimers}
            />
            <Text style={tw`ml-2 text-sm text-white`}>
              Allow retry? <Text style={tw`text-white/50`}>(default off)</Text>
            </Text>
            {!canCustomPassTimers && (
              <View style={tw`ml-2`}>
                <Pill>Pro+</Pill>
              </View>
            )}
          </View>

          {/* Email Domain Restrict */}
          <View>
            <View style={tw`flex-row items-center gap-2`}>
              <Label>Restrict invites by email domain</Label>
              {!canSSO && <Pill>Enterprise</Pill>}
            </View>
            <TextInput
              style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
              placeholder="example.edu, *.example.edu"
              placeholderTextColor="#9CA3AF"
              value={form.email_domain || ''}
              onChangeText={(t) => setForm({ ...form, email_domain: t })}
              editable={canSSO}
            />
            <Text style={tw`mt-1 text-[11px] text-white/60`}>
              Comma-separated. Supports wildcards like *.example.edu
            </Text>
          </View>

          {/* Webhooks */}
          <View>
            <View style={tw`flex-row items-center gap-2`}>
              <Label>Webhook (on submit / pass)</Label>
              {!canWebhooks && <Pill>Enterprise</Pill>}
            </View>

            <View style={tw`flex-row items-center mt-1`}>
              <Switch
                value={!!form.webhook_enabled}
                onValueChange={(v) => setForm({ ...form, webhook_enabled: v })}
                disabled={!canWebhooks}
              />
              <Text style={tw`ml-2 text-sm text-white`}>Enable webhooks</Text>
            </View>

            <TextInput
              style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
              placeholder="https://your.system/hooks/elearn"
              placeholderTextColor="#9CA3AF"
              value={form.webhook_url || ''}
              onChangeText={(t) => setForm({ ...form, webhook_url: t })}
              editable={canWebhooks}
            />

            {/* Webhook controls */}
            <View style={tw`mt-2 flex-row flex-wrap`}>
              {/* View secret status */}
              <TouchableOpacity
                onPress={async () => {
                  if (!org?.id || !token) return;
                  try {
                    const r = await fetch(`${backendUrl}/api/orgs/${org.id}/webhooks/secret`, {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    const j = await r.json();
                    if (!j.ok && j.message) {
                      Alert.alert('Webhook', j.message);
                      return;
                    }
                    Alert.alert(
                      'Webhook secret',
                      j.present
                        ? `Secret exists (last4: ${j.last4 || '—'}). Rotated: ${j.rotatedAt || '—'}`
                        : 'No secret yet. Generate one.'
                    );
                  } catch (e: any) {
                    Alert.alert('Webhook', e?.message || 'Failed to fetch status.');
                  }
                }}
                disabled={!org?.id || !token}
                style={tw.style(
                  'px-3 py-2 rounded mr-2 mb-2',
                  !org?.id || !token ? 'bg-white/10' : 'bg-white/10'
                )}
              >
                <Text style={tw`text-white text-xs`}>View secret status</Text>
              </TouchableOpacity>

              {/* Generate/rotate secret */}
              <TouchableOpacity
                onPress={() => {
                  if (!org?.id || !token) return;
                  Alert.alert(
                    'Rotate secret',
                    'Generate/rotate the secret now? This invalidates the previous one.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Rotate',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            const r = await fetch(
                              `${backendUrl}/api/orgs/${org.id}/webhooks/secret`,
                              {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${token}` },
                              }
                            );
                            const j = await r.json();
                            if (!j.ok) {
                              Alert.alert('Error', j.message || 'Failed to generate secret.');
                              return;
                            }
                            Alert.alert('Copy secret', j.secret);
                          } catch (e: any) {
                            Alert.alert('Error', e?.message || 'Failed to generate.');
                          }
                        },
                      },
                    ]
                  );
                }}
                disabled={!org?.id || !token}
                style={tw.style(
                  'px-3 py-2 rounded mr-2 mb-2',
                  !org?.id || !token ? 'bg-white/10' : 'bg-white/10'
                )}
              >
                <Text style={tw`text-white text-xs`}>Generate / Rotate secret</Text>
              </TouchableOpacity>

              {/* Send test webhook */}
              <TouchableOpacity
                onPress={async () => {
                  if (!canWebhooks || !canSendTest || isSending || !org?.id || !token) return;
                  setIsSending(true);
                  try {
                    const r = await fetch(`${backendUrl}/api/orgs/${org.id}/webhooks/test`, {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        overrideUrl: String(form.webhook_url || '').trim(),
                      }),
                    });
                    let j: any = null;
                    if (r.status !== 204) {
                      try {
                        j = await r.json();
                      } catch {}
                    }
                    if (!r.ok || j?.ok === false) {
                      Alert.alert('Webhook', j?.message || `Failed (HTTP ${r.status})`);
                      return;
                    }
                    Alert.alert(
                      'Webhook',
                      `Test webhook queued${
                        j?.status ? ` and fired (HTTP ${j.status})` : ''
                      }. Delivery id: ${j?.id || 'n/a'}`
                    );
                  } catch (e: any) {
                    Alert.alert('Network', e?.message || 'Failed to queue.');
                  } finally {
                    setIsSending(false);
                  }
                }}
                disabled={!canWebhooks || !canSendTest || isSending}
                style={tw.style(
                  'px-3 py-2 rounded mb-2',
                  !canWebhooks || !canSendTest || isSending ? 'bg-white/10' : 'bg-pink-600'
                )}
              >
                <Text style={tw`text-white text-xs`}>
                  {isSending ? 'Sending…' : 'Send test webhook'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Email reports card */}
            {canEmailReports && (
              <View style={tw`mt-3 rounded-xl bg-white/5 border border-white/10 p-3`}>
                <View style={tw`flex-row items-center justify-between`}>
                  <View>
                    <Text style={tw`text-white font-medium`}>Email reports</Text>
                    <Text style={tw`text-[11px] text-white/70`}>
                      Send periodic analytics to admins
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onSendTestReport}
                    style={tw`px-3 py-2 rounded bg-indigo-600`}
                  >
                    <Text style={tw`text-white text-sm`}>Send test report</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Save branding */}
          <View style={tw`mt-2`}>
            <TouchableOpacity
              onPress={onSaveBranding}
              disabled={!org?.id || !token || !canBranding}
              style={tw.style(
                'px-3 py-2 rounded items-center',
                !org?.id || !token || !canBranding ? 'bg-white/10' : 'bg-indigo-600'
              )}
            >
              <Text style={tw`text-white font-semibold`}>Save Branding</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ───────────────── ASSIGN TAB ───────────────── */}
      {tab === 'assign' && (
        <View style={tw`gap-3`}>
          {!canAssignments && (
            <Text style={tw`text-sm text-amber-300`}>
              Assignments are not available on your plan. Upgrade to enable.
            </Text>
          )}

          {/* Scope hint */}
          {(assignClassLabel || assignSubjectKey) && (
            <View style={tw`rounded-xl bg-white/10 px-3 py-2`}>
              <Text style={tw`text-[11px] text-white/70`}>
                This work is currently scoped to{' '}
                {assignClassLabel ? <Text style={tw`font-bold`}>{assignClassLabel}</Text> : null}
                {assignClassLabel && assignSubjectKey ? ' · ' : ''}
                {assignSubjectKey ? <Text style={tw`font-bold`}>{assignSubjectKey}</Text> : null}.
                Learners in this class/subject will see it in their assignments.
              </Text>
            </View>
          )}

          {/* Classic assignment card */}
          <View style={tw`rounded-2xl border border-white/10 bg-[#111b28] p-3`}>
            <Text style={tw`text-[11px] uppercase tracking-wide text-white/60`}>
              Classic assignment
            </Text>
            <Text style={tw`mt-1 text-sm font-semibold text-white`}>
              Attach a worksheet or project brief
            </Text>
            <Text style={tw`mt-1 text-[11px] text-white/70`}>
              Perfect for essays, worksheets, experiments and offline tasks. Learners download your
              file, complete the work, then submit their own file or typed answer.
            </Text>

            {/* Class + subject */}
            <View style={tw`mt-3 gap-3`}>
              <View>
                <Label>Class / Grade</Label>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="e.g. Grade 7 Blue"
                  placeholderTextColor="#9CA3AF"
                  value={assignClassLabel || ''}
                  onChangeText={(t) => setAssignScope?.({ classLabel: t || '' })}
                  editable={canAssignments}
                />
              </View>

              <View>
                <Label>Subject</Label>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="e.g. Mathematics, English, Physics"
                  placeholderTextColor="#9CA3AF"
                  value={assignSubjectKey || ''}
                  onChangeText={(t) => setAssignScope?.({ subjectKey: t || '' })}
                  editable={canAssignments}
                />
              </View>
            </View>

            {/* Title + deadline */}
            <View style={tw`mt-3 gap-3`}>
              <View>
                <Label>Assignment title</Label>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="Term 2 Algebra worksheet"
                  placeholderTextColor="#9CA3AF"
                  value={legacyTitle}
                  onChangeText={setLegacyTitle}
                  editable={canAssignments}
                />
              </View>

              <View>
                <Label>Deadline (optional)</Label>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="2025-09-30T23:59:59Z"
                  placeholderTextColor="#9CA3AF"
                  value={legacyDueAt}
                  onChangeText={setLegacyDueAt}
                  editable={canAssignments}
                />
                <Text style={tw`mt-1 text-[11px] text-white/60`}>
                  Learners will still see the assignment after the deadline, but you can treat late
                  submissions differently.
                </Text>
              </View>
            </View>

            {/* Instructions */}
            <View style={tw`mt-3`}>
              <Label>Instructions</Label>
              <TextInput
                style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10 min-h-24`}
                multiline
                placeholder="Explain what learners should do, how to name their files, and how you will grade them…"
                placeholderTextColor="#9CA3AF"
                value={legacyInstructions}
                onChangeText={setLegacyInstructions}
                editable={canAssignments}
              />
            </View>

            {/* Attachment */}
            <View style={tw`mt-3`}>
              <Label>Attach assignment file (PDF, DOC, slides…)</Label>
              <View style={tw`mt-1 flex-row items-center justify-between`}>
                <TouchableOpacity
                  onPress={onPickLegacyAttachment}
                  disabled={!canAssignments || legacyUploadingAttachment}
                  style={tw.style(
                    'px-3 py-2 rounded',
                    !canAssignments || legacyUploadingAttachment ? 'bg-white/10' : 'bg-white/10'
                  )}
                >
                  <Text style={tw`text-white text-xs`}>
                    {legacyUploadingAttachment ? 'Uploading…' : 'Pick attachment'}
                  </Text>
                </TouchableOpacity>

                {legacyAttachmentLabel ? (
                  <Text style={tw`ml-2 flex-1 text-[11px] text-white/70`} numberOfLines={1}>
                    {legacyAttachmentLabel}
                  </Text>
                ) : (
                  <Text style={tw`ml-2 flex-1 text-[11px] text-white/40`}>No file selected</Text>
                )}
              </View>
            </View>

            <View style={tw`mt-3 flex-row justify-end`}>
              <TouchableOpacity
                onPress={onCreateLegacyAssignment}
                disabled={!canAssignments || creatingLegacyAssignment}
                style={tw.style(
                  'px-4 py-2 rounded-2xl items-center',
                  !canAssignments ? 'bg-white/10' : 'bg-emerald-600'
                )}
              >
                <Text style={tw`text-white font-semibold text-sm`}>
                  {creatingLegacyAssignment ? 'Sharing…' : 'Share with class'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Teach with AI / Robot Tutor card */}
          <View style={tw`rounded-2xl border border-white/10 bg-white/5 p-3`}>
            <Text style={tw`text-[11px] uppercase tracking-wide text-white/60`}>Teach with AI</Text>
            <Text style={tw`mt-1 text-sm font-semibold text-white`}>
              Link a Robot Tutor course as an assignment
            </Text>
            <Text style={tw`mt-1 text-[11px] text-white/70`}>
              Choose one of your AI-generated courses, set optional pass marks and timers, then
              share the invite link with specific groups.
            </Text>

            <View style={tw`mt-3 gap-3`}>
              <View>
                <Label>Course ID</Label>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="course uuid"
                  placeholderTextColor="#9CA3AF"
                  value={courseId}
                  onChangeText={setCourseId}
                  editable={canAssignments}
                />
              </View>

              <View>
                <Label>Title Override (optional)</Label>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="Intro to Cybersecurity — Cohort A"
                  placeholderTextColor="#9CA3AF"
                  value={titleOverride}
                  onChangeText={setTitleOverride}
                  editable={canAssignments}
                />
              </View>

              <View>
                <View style={tw`flex-row items-center`}>
                  <Label>Pass Mark (optional)</Label>
                  {!canCustomPassTimers && (
                    <View style={tw`ml-2`}>
                      <Pill>Pro+</Pill>
                    </View>
                  )}
                </View>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  keyboardType="numeric"
                  value={passMark === '' ? '' : String(passMark)}
                  onChangeText={(t) => setPassMark(t ? Number(t) : '')}
                  editable={canAssignments && canCustomPassTimers}
                />
              </View>

              <View>
                <View style={tw`flex-row items-center`}>
                  <Label>Timer seconds (optional)</Label>
                  {!canCustomPassTimers && (
                    <View style={tw`ml-2`}>
                      <Pill>Pro+</Pill>
                    </View>
                  )}
                </View>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  keyboardType="numeric"
                  value={timer === '' ? '' : String(timer)}
                  onChangeText={(t) => setTimer(t ? Number(t) : '')}
                  editable={canAssignments && canCustomPassTimers}
                />
              </View>

              <View>
                <Label>Due at (optional, ISO)</Label>
                <TextInput
                  style={tw`mt-1 w-full px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                  placeholder="2025-09-30T23:59:59Z"
                  placeholderTextColor="#9CA3AF"
                  value={dueAt}
                  onChangeText={setDueAt}
                  editable={canAssignments}
                />
              </View>
            </View>

            {/* Actions + link + shares */}
            <View style={tw`mt-3`}>
              <TouchableOpacity
                onPress={onCreateAssignment}
                disabled={!canAssignments}
                style={tw.style(
                  'px-3 py-2 rounded items-center',
                  canAssignments ? 'bg-indigo-600' : 'bg-white/10'
                )}
              >
                <Text style={tw`text-white font-semibold`}>Create AI assignment</Text>
              </TouchableOpacity>

              {!!inviteLink && (
                <View style={tw`mt-2`}>
                  <TextInput
                    style={tw`px-3 py-2 rounded bg-[#0f1821] text-white border border-white/10`}
                    value={inviteLink}
                    editable={false}
                  />

                  {/* Share to instructors (email / WhatsApp) */}
                  {instructorEmails.length > 0 && (
                    <View style={tw`mt-2 flex-row flex-wrap`}>
                      {bccChunks.map((grp, idx) => (
                        <TouchableOpacity
                          key={`${idx}`}
                          onPress={() => openMailto(grp)}
                          style={tw`mr-2 mb-2 px-3 py-2 rounded bg-white/10`}
                        >
                          <Text style={tw`text-white text-xs`}>
                            {bccChunks.length === 1
                              ? 'Email instructors'
                              : `Email instructors (grp ${idx + 1})`}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      <TouchableOpacity
                        onPress={openWhatsApp}
                        style={tw`mr-2 mb-2 px-3 py-2 rounded bg-white/10`}
                      >
                        <Text style={tw`text-white text-xs`}>WhatsApp instructors</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={copyLink}
                    style={tw`mt-2 px-3 py-2 rounded bg-pink-600 items-center self-start`}
                  >
                    <Text style={tw`text-white text-sm font-semibold`}>Copy invite link</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!!inviteLink && (org?.email_domain || form.email_domain) && (
                <Text style={tw`mt-2 text-[11px] text-amber-300`}>
                  This invite is restricted to:{' '}
                  <Text style={tw`font-bold`}>
                    {(form.email_domain || org?.email_domain || '').trim()}
                  </Text>
                </Text>
              )}
            </View>

            <Text style={tw`text-xs text-white/70 mt-1`}>
              Share the AI invite link for timed quizzes and auto-marking. For open-ended projects
              or long-form work, use the classic assignment card above so learners can upload their
              files directly.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
 * ANALYTICS pane (Native)
 * ───────────────────────────────────────────────────────── */

type AnalyticsProps = {
  period: Period;
  setPeriod: (p: Period) => void;
  canMultiPeriodAnalytics: boolean;
  canEmailReports: boolean;
  canCSV: boolean;
  canMonthly: boolean;

  loadingAnalytics: boolean;
  analytics: OrgAnalyticsRow[];
  summary?: {
    totalAttempts: number;
    totalPasses: number;
    overallPassRate: number;
    overallAvgScore: number;

    examsAttempts: number;
    examsPasses: number;
    examsPassRate: number;

    robotQuizAttempts: number;
    robotQuizPasses: number;
    robotQuizPassRate: number;

    assignmentAttempts: number;
    assignmentPasses: number;
    assignmentPassRate: number;

    examCardsGenerated?: number;
  } | null;

  onRefresh: () => void;
  onExportCSV: () => void;
  onSendReportRow: (bucketISO: string, period: Period) => Promise<void>;
};

export function AnalyticsPane({
  period,
  setPeriod,
  canMultiPeriodAnalytics,
  canEmailReports,
  canCSV,
  canMonthly,
  loadingAnalytics,
  analytics,
  summary,
  onRefresh,
  onExportCSV,
  onSendReportRow,
}: AnalyticsProps) {
  const hasData = (analytics?.length ?? 0) > 0;

  const effectiveSummary = useMemo(() => {
    if (summary) return summary;

    // Fallback: treat everything as Robot Teacher quizzes
    const rows = (analytics || []) as any[];
    let totalAttempts = 0;
    let totalPasses = 0;
    let scoreWeightedSum = 0;
    let scoreWeight = 0;

    for (const r of rows) {
      const attempts = Number(r.attempts ?? 0);
      const passes = Number(r.passes ?? 0);
      const avg = Number(r.avg_score ?? r.avgScore ?? 0);
      totalAttempts += attempts;
      totalPasses += passes;
      if (attempts > 0 && Number.isFinite(avg)) {
        scoreWeightedSum += avg * attempts;
        scoreWeight += attempts;
      }
    }

    const overallPassRate = totalAttempts > 0 ? Math.round((totalPasses * 100) / totalAttempts) : 0;
    const overallAvgScore = scoreWeight > 0 ? +(scoreWeightedSum / scoreWeight).toFixed(1) : 0;

    return {
      totalAttempts,
      totalPasses,
      overallPassRate,
      overallAvgScore,
      examsAttempts: 0,
      examsPasses: 0,
      examsPassRate: 0,
      robotQuizAttempts: totalAttempts,
      robotQuizPasses: totalPasses,
      robotQuizPassRate: overallPassRate,
      assignmentAttempts: 0,
      assignmentPasses: 0,
      assignmentPassRate: 0,
      examCardsGenerated: undefined,
    };
  }, [summary, analytics]);

  const periodLabel =
    period === 'month' ? 'Last 30 days' : period === 'term' ? 'This term' : 'This year';

  const maxAttemptsInBucket = Math.max(
    0,
    ...analytics.map((r) => Number((r as any).attempts ?? 0))
  );

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  const header = (
    <View style={tw`flex-row flex-wrap items-center mb-3`}>
      {/* Period selector */}
      <View style={tw`flex-row rounded-xl overflow-hidden bg-white/10`}>
        {(['month', 'term', 'year'] as Period[]).map((p) => {
          const disabled = p !== 'month' && (!canMultiPeriodAnalytics || !canMonthly);
          return (
            <TouchableOpacity
              key={p}
              disabled={disabled}
              onPress={() => !disabled && setPeriod(p)}
              style={tw.style(
                'px-3 py-1.5',
                period === p ? 'bg-white/20' : 'bg-transparent',
                disabled && 'opacity-40'
              )}
            >
              <Text style={tw`text-white text-sm`}>
                {p === 'month' ? 'Month' : p === 'term' ? 'Term' : 'Year'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={tw`ml-auto flex-row items-center mt-2 sm:mt-0`}>
        {canCSV && hasData && (
          <TouchableOpacity
            onPress={onExportCSV}
            style={tw`px-3 py-1.5 rounded-xl bg-white/10 mr-2`}
          >
            <Text style={tw`text-white text-sm`}>Export CSV</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onRefresh} style={tw`px-3 py-1.5 rounded-xl bg-white/10`}>
          <Text style={tw`text-white text-sm`}>{loadingAnalytics ? 'Refreshing…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRow = ({ item }: { item: OrgAnalyticsRow }) => {
    const bucketISO = String((item as any).bucket ?? (item as any).bucket_iso ?? '');
    const attempts = Number((item as any).attempts ?? 0);
    const passes = Number((item as any).passes ?? 0);
    const avg = Number((item as any).avg_score ?? (item as any).avgScore ?? 0);
    const barWidth =
      maxAttemptsInBucket > 0 ? Math.max(4, Math.round((attempts / maxAttemptsInBucket) * 100)) : 0;

    return (
      <View style={tw`py-2 border-t border-white/10`}>
        <View style={tw`flex-row`}>
          <View style={tw`w-2/5 pr-2`}>
            <Text style={tw`text-white/70 text-xs`}>Bucket</Text>
            <Text style={tw`text-white text-xs`}>{bucketISO ? formatDate(bucketISO) : '—'}</Text>
          </View>
          <View style={tw`w-1/5 pr-2`}>
            <Text style={tw`text-white/70 text-xs`}>Attempts</Text>
            <Text style={tw`text-white text-xs`}>{attempts}</Text>
          </View>
          <View style={tw`w-1/5 pr-2`}>
            <Text style={tw`text-white/70 text-xs`}>Passes</Text>
            <Text style={tw`text-white text-xs`}>{passes}</Text>
          </View>
          <View style={tw`w-1/5`}>
            <Text style={tw`text-white/70 text-xs`}>Avg</Text>
            <Text style={tw`text-white text-xs`}>
              {Number.isFinite(avg) ? `${Math.round(avg)}%` : '—'}
            </Text>
          </View>
        </View>

        {/* Mini bar */}
        <View style={tw`mt-2`}>
          <View style={tw`h-2 w-full rounded-full bg-white/5 overflow-hidden`}>
            <View style={[tw`h-full rounded-full bg-emerald-500`, { width: `${barWidth}%` }]} />
          </View>
        </View>

        {canEmailReports && (
          <View style={tw`mt-2 flex-row justify-end`}>
            <TouchableOpacity
              onPress={() => bucketISO && onSendReportRow(bucketISO, period)}
              style={tw`px-3 py-1.5 rounded bg-white/10 self-start`}
            >
              <Text style={tw`text-white text-xs`}>Email snapshot</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={tw`rounded-2xl border border-white/10 bg-white/5 p-3`}>
      {/* Header + controls */}
      {header}

      {/* Summary row */}
      <View style={tw`mb-3`}>
        <Text style={tw`text-white font-semibold text-sm`}>Learning analytics</Text>
        <Text style={tw`text-[11px] text-white/70 mt-1`}>
          Blended view of Robot Teacher quizzes, exam results and instructor assignments for{' '}
          {periodLabel.toLowerCase()}.
        </Text>

        <View style={tw`mt-3 flex-row`}>
          <View style={tw`flex-1 mr-2`}>
            <Text style={tw`text-[11px] text-white/60`}>Exam attempts</Text>
            <Text style={tw`text-lg text-white font-semibold`}>
              {effectiveSummary.examsAttempts || 0}
            </Text>
            <Text style={tw`text-[11px] text-white/60 mt-1`}>
              Pass rate:{' '}
              <Text style={tw`font-semibold`}>
                {effectiveSummary.examsAttempts ? `${effectiveSummary.examsPassRate}%` : '—'}
              </Text>
            </Text>
          </View>

          <View style={tw`flex-1 mr-2`}>
            <Text style={tw`text-[11px] text-white/60`}>Robot Teacher quizzes</Text>
            <Text style={tw`text-lg text-white font-semibold`}>
              {effectiveSummary.robotQuizAttempts || 0}
            </Text>
            <Text style={tw`text-[11px] text-white/60 mt-1`}>
              Pass rate:{' '}
              <Text style={tw`font-semibold`}>{effectiveSummary.robotQuizPassRate || 0}%</Text>
            </Text>
            <Text style={tw`text-[11px] text-white/60 mt-0.5`}>
              Avg score:{' '}
              <Text style={tw`font-semibold`}>{effectiveSummary.overallAvgScore || 0}%</Text>
            </Text>
          </View>

          <View style={tw`flex-1`}>
            <Text style={tw`text-[11px] text-white/60`}>Graded assignments</Text>
            <Text style={tw`text-lg text-white font-semibold`}>
              {effectiveSummary.assignmentAttempts || 0}
            </Text>
            <Text style={tw`text-[11px] text-white/60 mt-1`}>
              Pass rate:{' '}
              <Text style={tw`font-semibold`}>{effectiveSummary.assignmentPassRate || 0}%</Text>
            </Text>
            <Text style={tw`text-[11px] text-white/60 mt-0.5`}>
              Overall graded:{' '}
              <Text style={tw`font-semibold`}>{effectiveSummary.totalAttempts || 0}</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* List / empty / loading */}
      {loadingAnalytics ? (
        <View style={tw`py-6 items-center`}>
          <ActivityIndicator color="#fff" />
          <Text style={tw`text-white/70 text-xs mt-2`}>Loading…</Text>
        </View>
      ) : hasData ? (
        <FlatList data={analytics} keyExtractor={(_, i) => String(i)} renderItem={renderRow} />
      ) : (
        <Text style={tw`py-6 text-white/60 text-xs`}>
          No data for this period yet. Once learners start taking quizzes, exams or assignments,
          you’ll see a trend here.
        </Text>
      )}

      {!canMonthly && (
        <Text style={tw`mt-3 text-xs text-amber-300`}>
          Monthly analytics are not included. Upgrade to view full analytics.
        </Text>
      )}
    </View>
  );
}

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import tw from '../../../tailwind';
import type { OrgExamConfig, OrgExamGradingBand } from '@mytutorapp/shared/types';
import { useThemePref } from '../../theme/ThemeContext';

type OrgExamSetupTabProps = {
  editingConfig: OrgExamConfig;
  setEditingConfig: React.Dispatch<React.SetStateAction<OrgExamConfig>>;
  configLoading: boolean;
  onAddTerm: () => void;
  onAddSession: () => void;
  onApplyBandsPreset: () => void;
  onSaveConfig: () => void;

  // AI support
  onRunAiConfig?: (instructions: string) => Promise<void> | void;
  configAiLoading?: boolean;
};

/* ────────────────────────────────────────────────
 * Theme palette helper (same family as other tabs)
 * ──────────────────────────────────────────────── */
function usePalette() {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';

  const bg = isDark ? '#020617' : '#f8fafc';
  const card = isDark ? '#020617' : '#ffffff';
  const border = isDark ? 'rgba(148,163,184,0.45)' : '#cbd5e1';
  const text = isDark ? '#e5f0ff' : '#020617';
  const textMuted = isDark ? '#9ca3af' : '#4b5563';
  const textSoft = isDark ? '#94a3b8' : '#64748b';
  const accent = '#2563eb';
  const accentSoft = isDark ? '#38bdf8' : '#0369a1';
  const chipBg = isDark ? '#0f172a' : '#e5f2ff';
  const inputBg = isDark ? '#020617' : '#ffffff';
  const headerBg = isDark ? '#020617' : '#e5f2ff';
  const rowBg = isDark ? '#020617' : '#ffffff';
  const rowAltBg = isDark ? '#020617' : '#f1f5f9';

  return {
    isDark,
    bg,
    card,
    border,
    text,
    textMuted,
    textSoft,
    accent,
    accentSoft,
    chipBg,
    inputBg,
    headerBg,
    rowBg,
    rowAltBg,
  };
}

const OrgExamSetupTab: React.FC<OrgExamSetupTabProps> = ({
  editingConfig,
  setEditingConfig,
  configLoading,
  onAddTerm,
  onAddSession,
  onApplyBandsPreset,
  onSaveConfig,
  onRunAiConfig,
  configAiLoading,
}) => {
  const [aiPrompt, setAiPrompt] = useState('');
  const busy = configLoading || !!configAiLoading;
  const palette = usePalette();

  // 🔹 Shared shells / inputs (no `as const` so RN StyleProp typing is happy)
  const cardShell = [
    tw`rounded-2xl p-3`,
    {
      backgroundColor: palette.card,
      borderColor: palette.border,
      borderWidth: 1,
    },
  ];

  const inputBase = [
    tw`rounded-xl px-3 text-xs`,
    {
      backgroundColor: palette.inputBg,
      borderColor: palette.border,
      borderWidth: 1,
      color: palette.text,
    },
  ];

  const smallInputBase = [
    tw`rounded-lg px-2 text-xs`,
    {
      backgroundColor: palette.inputBg,
      borderColor: palette.border,
      borderWidth: 1,
      color: palette.text,
      minHeight: 36, // taller for digits + descenders
      paddingVertical: 6, // avoid vertical clipping
    },
  ];

  const handleAiClick = () => {
    if (!onRunAiConfig) return;
    const value = aiPrompt.trim();
    if (!value) {
      Alert.alert('AI setup', 'Type a short instruction for the AI first.');
      return;
    }
    void onRunAiConfig(value);
  };

  const renderTermExams = (termId: string | number) => {
    const labels = editingConfig.sessions.filter((s) => s.term_id === termId).map((s) => s.label);

    return labels.length ? labels.join(', ') : 'none yet';
  };

  return (
    <ScrollView contentContainerStyle={tw`space-y-4 pb-6`} keyboardShouldPersistTaps="handled">
      {/* AI assistant strip */}
      <View style={[...cardShell, { backgroundColor: palette.rowBg }]}>
        <View style={tw`flex-col gap-3`}>
          <View style={tw`flex-1`}>
            <View style={tw`flex-row items-center gap-2`}>
              <View
                style={[
                  tw`h-6 w-6 rounded-full items-center justify-center`,
                  { backgroundColor: palette.accent },
                ]}
              >
                <Text style={tw`text-xs text-white font-semibold`}>AI</Text>
              </View>
              <Text style={[tw`text-sm font-bold`, { color: palette.text }]}>
                Let AI help with your exam setup
              </Text>
            </View>

            <Text style={[tw`mt-1 text-[11px]`, { color: palette.textSoft }]}>
              Describe what you want — create terms, exams/semesters, or grading bands. You can also
              ask to delete items by name.
            </Text>

            <View style={tw`mt-2 flex-row flex-wrap gap-1`}>
              <View style={[tw`px-2 py-0.5 rounded-full`, { backgroundColor: palette.chipBg }]}>
                <Text style={[tw`text-[10px]`, { color: palette.text }]}>
                  “Create 3 terms for 2025 with Midterm and End Term in each”
                </Text>
              </View>
              <View style={[tw`px-2 py-0.5 rounded-full`, { backgroundColor: palette.chipBg }]}>
                <Text style={[tw`text-[10px]`, { color: palette.text }]}>
                  “Use grading A–E, delete F”
                </Text>
              </View>
              <View style={[tw`px-2 py-0.5 rounded-full`, { backgroundColor: palette.chipBg }]}>
                <Text style={[tw`text-[10px]`, { color: palette.text }]}>
                  “Remove the Trial Exam and keep only Final Exam this year”
                </Text>
              </View>
            </View>
          </View>

          <View style={tw`flex-1`}>
            <TextInput
              multiline
              style={[
                tw`w-full min-h-[60px] rounded-xl px-2 py-1.5 text-xs`,
                {
                  backgroundColor: palette.inputBg,
                  borderColor: palette.border,
                  borderWidth: 1,
                  color: palette.text,
                },
              ]}
              placeholder="E.g. “Create Term 1 & Term 2 for 2026 and delete grade E from the bands.”"
              placeholderTextColor={palette.textSoft}
              value={aiPrompt}
              onChangeText={setAiPrompt}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleAiClick}
              disabled={!onRunAiConfig || busy}
              style={[
                tw`mt-2 h-9 px-3 rounded-xl flex-row items-center justify-center`,
                !onRunAiConfig || busy
                  ? { backgroundColor: '#94a3b8' }
                  : { backgroundColor: palette.accent },
              ]}
            >
              <Text style={tw`text-xs font-semibold text-white`}>
                {configAiLoading
                  ? 'AI is updating…'
                  : configLoading
                    ? 'Saving…'
                    : 'Apply with AI (preview)'}
              </Text>
            </TouchableOpacity>
            <Text style={[tw`mt-1 text-[10px]`, { color: palette.textMuted }]}>
              Changes are only saved when you tap{' '}
              <Text style={tw`font-semibold`}>Save configuration</Text>.
            </Text>
          </View>
        </View>
      </View>

      {/* Report card title (global default) */}
      <View style={cardShell}>
        <View style={tw`flex-col gap-2`}>
          <View>
            <Text style={[tw`text-sm font-bold`, { color: palette.text }]}>Report card title</Text>
            <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
              This title appears at the top of each learner&apos;s report card PDF. Leave blank to
              use <Text style={tw`font-semibold`}>TERM REPORT CARD</Text>.
            </Text>
          </View>

          <TextInput
            style={[...inputBase, tw`mt-1 w-full h-9`]}
            placeholder='E.g. "Term Report Card", "Progress Report", "End of Year Report"'
            placeholderTextColor={palette.textSoft}
            value={editingConfig.reportTitle ?? ''}
            onChangeText={(value) =>
              setEditingConfig((prev) => ({
                ...prev,
                reportTitle: value,
              }))
            }
          />
          <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>
            You can also mention a preferred title in your AI instructions, e.g.{' '}
            <Text style={tw`italic`}>
              “Use ‘Mid-Year Progress Report’ as the card title and create 3 terms…”
            </Text>
          </Text>
        </View>
      </View>

      {/* Main: terms/sessions + grading bands */}
      <View style={tw`flex-col gap-4`}>
        {/* Terms & sessions */}
        <View style={cardShell}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={[tw`text-sm font-bold`, { color: palette.text }]}>Terms & exams</Text>
            <TouchableOpacity
              style={[
                tw`h-9 px-3 rounded-xl items-center justify-center`,
                { backgroundColor: palette.chipBg },
              ]}
              onPress={onAddTerm}
            >
              <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>+ Add term</Text>
            </TouchableOpacity>
          </View>

          <View style={tw`max-h-[260px]`}>
            <ScrollView>
              {editingConfig.terms.map((t) => (
                <View
                  key={t.id}
                  style={[
                    tw`mb-2 rounded-xl p-2.5`,
                    {
                      borderColor: palette.border,
                      borderWidth: 1,
                      backgroundColor: palette.rowBg,
                    },
                  ]}
                >
                  <View style={tw`flex-row items-center justify-between mb-1`}>
                    <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>
                      {t.year} – {t.label}
                    </Text>

                    <TouchableOpacity
                      onPress={() =>
                        setEditingConfig((prev) => ({
                          ...prev,
                          terms: prev.terms.map((x) =>
                            x.id === t.id ? { ...x, is_active: !t.is_active } : x
                          ),
                        }))
                      }
                      style={[
                        tw`flex-row items-center px-2 py-0.5 rounded-full border`,
                        t.is_active
                          ? {
                              backgroundColor: 'rgba(16,185,129,0.12)',
                              borderColor: '#22c55e',
                            }
                          : {
                              backgroundColor: palette.chipBg,
                              borderColor: palette.border,
                            },
                      ]}
                    >
                      <View
                        style={[
                          tw`w-3 h-3 rounded-full mr-1`,
                          {
                            backgroundColor: t.is_active ? '#22c55e' : '#9ca3af',
                          },
                        ]}
                      />
                      <Text style={[tw`text-[11px]`, { color: palette.text }]}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                    Exams: {renderTermExams(t.id)}
                  </Text>
                </View>
              ))}

              {!editingConfig.terms.length && (
                <Text style={[tw`text-xs`, { color: palette.textSoft }]}>
                  No terms yet. Add a term or let AI create them for you.
                </Text>
              )}
            </ScrollView>
          </View>

          <View style={tw`mt-3 flex-row items-center justify-between gap-2`}>
            <View style={tw`flex-1`}>
              <Text style={[tw`text-xs font-semibold`, { color: palette.textSoft }]}>
                Exam sessions
              </Text>
              <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                Attach exams to terms and assign weight for yearly averages.
              </Text>
            </View>
            <TouchableOpacity
              style={tw`h-9 px-3 rounded-xl bg-sky-500 items-center justify-center`}
              onPress={onAddSession}
            >
              <Text style={tw`text-xs font-semibold text-white`}>+ Add exam</Text>
            </TouchableOpacity>
          </View>

          <View style={tw`mt-2 max-h-[220px]`}>
            <ScrollView>
              {editingConfig.sessions.map((s) => (
                <View
                  key={s.id}
                  style={[
                    tw`mb-1 flex-row items-center justify-between gap-2 rounded-lg px-2 py-1`,
                    { backgroundColor: palette.chipBg },
                  ]}
                >
                  <View style={tw`flex-1`}>
                    <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                      {s.label}
                    </Text>
                    <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                      {editingConfig.terms.find((t) => t.id === s.term_id)?.label || 'Unassigned'} •
                      weight {s.weight}
                    </Text>
                  </View>
                </View>
              ))}

              {!editingConfig.sessions.length && (
                <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                  No exams configured yet.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>

        {/* Grading bands */}
        <View style={cardShell}>
          <View style={tw`flex-row items-center justify-between`}>
            <View>
              <Text style={[tw`text-sm font-bold`, { color: palette.text }]}>Grading bands</Text>
              <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                Used to auto-grade each subject and overall score.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                tw`h-9 px-3 rounded-xl items-center justify-center`,
                { backgroundColor: palette.chipBg },
              ]}
              onPress={onApplyBandsPreset}
            >
              <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                Use default preset
              </Text>
            </TouchableOpacity>
          </View>

          <View style={tw`mt-3`}>
            {/* Header row */}
            <View
              style={[
                tw`flex-row items-center border-b pb-1 mb-1`,
                { borderColor: palette.border },
              ]}
            >
              <View style={tw`w-16 pr-2`}>
                <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>Grade</Text>
              </View>
              <View style={tw`w-36 pr-2`}>
                <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>% range</Text>
              </View>
              <View style={tw`flex-1`}>
                <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>Remark</Text>
              </View>
            </View>

            <ScrollView style={tw`max-h-[260px]`}>
              {editingConfig.gradingBands.map((b, idx) => (
                <View
                  key={idx}
                  style={[tw`flex-row items-center py-1 border-b`, { borderColor: palette.border }]}
                >
                  {/* Grade */}
                  <View style={tw`w-16 pr-2`}>
                    <TextInput
                      style={smallInputBase}
                      value={b.grade}
                      onChangeText={(value) =>
                        setEditingConfig((prev) => {
                          const bands = [...prev.gradingBands] as OrgExamGradingBand[];
                          const current = bands[idx] as OrgExamGradingBand;

                          const next: OrgExamGradingBand = {
                            ...current,
                            grade: value ?? '',
                          };

                          bands[idx] = next;
                          return {
                            ...prev,
                            gradingBands: bands,
                          };
                        })
                      }
                      placeholderTextColor={palette.textSoft}
                    />
                  </View>

                  {/* % range */}
                  <View style={tw`w-36 pr-2 flex-row items-center`}>
                    <TextInput
                      style={[...smallInputBase, tw`flex-1 px-1`]}
                      keyboardType="numeric"
                      value={String(b.min_percent ?? '')}
                      onChangeText={(value) =>
                        setEditingConfig((prev) => {
                          const bands = [...prev.gradingBands] as OrgExamGradingBand[];
                          const current = bands[idx] as OrgExamGradingBand;
                          const num = Number(value);
                          const safe = Number.isFinite(num) ? num : 0;

                          const next: OrgExamGradingBand = {
                            ...current,
                            min_percent: safe,
                          };

                          bands[idx] = next;
                          return {
                            ...prev,
                            gradingBands: bands,
                          };
                        })
                      }
                      placeholderTextColor={palette.textSoft}
                    />
                    <Text style={[tw`mx-1 text-[11px]`, { color: palette.textSoft }]}>to</Text>
                    <TextInput
                      style={[...smallInputBase, tw`flex-1 px-1`]}
                      keyboardType="numeric"
                      value={String(b.max_percent ?? '')}
                      onChangeText={(value) =>
                        setEditingConfig((prev) => {
                          const bands = [...prev.gradingBands] as OrgExamGradingBand[];
                          const current = bands[idx] as OrgExamGradingBand;
                          const num = Number(value);
                          const safe = Number.isFinite(num) ? num : 0;

                          const next: OrgExamGradingBand = {
                            ...current,
                            max_percent: safe,
                          };

                          bands[idx] = next;
                          return {
                            ...prev,
                            gradingBands: bands,
                          };
                        })
                      }
                      placeholderTextColor={palette.textSoft}
                    />
                  </View>

                  {/* Remark */}
                  <View style={tw`flex-1`}>
                    <TextInput
                      multiline
                      style={[...smallInputBase, tw`px-2 min-h-[40px]`]}
                      value={b.remark ?? ''}
                      onChangeText={(value) =>
                        setEditingConfig((prev) => {
                          const bands = [...prev.gradingBands] as OrgExamGradingBand[];
                          const current = bands[idx] as OrgExamGradingBand;

                          const next: OrgExamGradingBand = {
                            ...current,
                            remark: value ?? '',
                          };

                          bands[idx] = next;
                          return {
                            ...prev,
                            gradingBands: bands,
                          };
                        })
                      }
                      placeholderTextColor={palette.textSoft}
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              ))}

              {!editingConfig.gradingBands.length && (
                <Text style={[tw`py-3 text-xs`, { color: palette.textSoft }]}>
                  No grading bands yet. Use the preset or ask AI to create a grading scale.
                </Text>
              )}
            </ScrollView>
          </View>

          <View style={tw`mt-3 items-end`}>
            <TouchableOpacity
              style={[
                tw`h-9 px-4 rounded-xl items-center justify-center`,
                { backgroundColor: busy ? '#94a3b8' : palette.accent },
              ]}
              onPress={onSaveConfig}
              disabled={busy}
            >
              <Text style={tw`text-sm font-semibold text-white`}>
                {busy ? 'Saving…' : 'Save configuration'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default OrgExamSetupTab;

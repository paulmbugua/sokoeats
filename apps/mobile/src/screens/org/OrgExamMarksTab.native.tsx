import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import tw from '../../../tailwind';
import type { OrgExamResultRow } from '@mytutorapp/shared/types';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useThemePref } from '../../theme/ThemeContext';

type OrgRosterLearner = {
  id: number | string;
  name?: string | null;
  email?: string | null;
  admission_code?: string | null;
  class_label?: string | null;
};

type OrgExamMarksTabProps = {
  rosterLearners: OrgRosterLearner[];
  rosterLoading: boolean;
  visibleLearnerCount: number | string;
  subjectFilter: string;
  setSubjectFilter: (value: string) => void;
  learnerOptions: { value: string; label: string }[];
  newStudentId: string;
  setNewStudentId: (value: string) => void;
  newSubject: string;
  setNewSubject: (value: string) => void;
  teacherInitials: string;
  setTeacherInitials: (value: string) => void;
  selectedSessionId: string;
  classLabel: string;
  sheetLoading: boolean;
  filteredSheetRows: OrgExamResultRow[];
  sheetRows: OrgExamResultRow[];
  learnerById: Map<number, OrgRosterLearner>;
  savingSheet: boolean;
  onAddRowFromRoster: () => void;
  onBulkAddClassForSubject: () => void;
  onSaveSheet: () => void;
  onOpenStudentCard: (studentId: number) => void;
  onEmailStudentCard: (studentId: number) => void;
  saveSheet: (
    sessionId: string,
    classLabel: string | undefined,
    rows: OrgExamResultRow[]
  ) => void | Promise<void>;
};

/* ────────────────────────────────────────────────
 * Theme palette helper
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

const OrgExamMarksTab: React.FC<OrgExamMarksTabProps> = ({
  rosterLearners,
  rosterLoading,
  visibleLearnerCount,
  subjectFilter,
  setSubjectFilter,
  learnerOptions,
  newStudentId,
  setNewStudentId,
  newSubject,
  setNewSubject,
  teacherInitials,
  setTeacherInitials,
  selectedSessionId,
  classLabel,
  sheetLoading,
  filteredSheetRows,
  sheetRows,
  learnerById,
  savingSheet,
  onAddRowFromRoster,
  onBulkAddClassForSubject,
  onSaveSheet,
  onOpenStudentCard,
  onEmailStudentCard,
  saveSheet,
}) => {
  const palette = usePalette();
  const { backendUrl, token: userToken, orgToken } = useShopContext() as any;
  const authToken = orgToken || userToken;
  const { org } = (useOrg?.() ?? {}) as any;
  const orgId = org?.id || (org as any)?.org_id || (org as any)?.orgId || null;

  const [aiBusy, setAiBusy] = useState(false);
  const [aiColumnKey, setAiColumnKey] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [newExtraColumnName, setNewExtraColumnName] = useState('');

  // 🔽 learner dropdown open/close
  const [learnerDropdownOpen, setLearnerDropdownOpen] = useState(false);

  // 🔹 Collect all dynamic extra-column keys from row.extra
  const extraColumnKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of sheetRows) {
      const extra = (r as any).extra;
      if (extra && typeof extra === 'object') {
        Object.keys(extra).forEach((k) => {
          if (k && k !== '__meta__') set.add(k);
        });
      }
    }
    return Array.from(set).sort();
  }, [sheetRows]);

  const totalCols = 10 + extraColumnKeys.length; // parity with web (informational only)

  // 🔢 Pagination state for marks table
  const [marksPage, setMarksPage] = useState(1);
  const [marksPageSize, setMarksPageSize] = useState(10);

  const totalMarksPages = useMemo(() => {
    if (!filteredSheetRows.length) return 1;
    return Math.max(1, Math.ceil(filteredSheetRows.length / marksPageSize));
  }, [filteredSheetRows.length, marksPageSize]);

  const paginatedSheetRows = useMemo(() => {
    if (!filteredSheetRows.length) return [];
    const start = (marksPage - 1) * marksPageSize;
    return filteredSheetRows.slice(start, start + marksPageSize);
  }, [filteredSheetRows, marksPage, marksPageSize]);

  // clamp current page if filtered rows shrink
  useEffect(() => {
    const maxPage = totalMarksPages;
    if (marksPage > maxPage) {
      setMarksPage(maxPage);
    }
  }, [totalMarksPages, marksPage]);

  // reset to page 1 when we change session, class, or subject filter
  useEffect(() => {
    setMarksPage(1);
  }, [selectedSessionId, classLabel, subjectFilter]);

  const marksRangeText = () => {
    if (!filteredSheetRows.length) return 'No marks yet';
    const start = (marksPage - 1) * marksPageSize + 1;
    const end = Math.min(marksPage * marksPageSize, filteredSheetRows.length);
    return `Showing ${start}–${end} of ${filteredSheetRows.length} rows`;
  };

  // Current learner label for dropdown
  const selectedLearnerLabel = useMemo(() => {
    if (rosterLoading) return 'Loading learners…';
    if (!learnerOptions.length) return 'No learners in roster';
    const found = learnerOptions.find((o) => o.value === newStudentId);
    return found?.label ?? 'Choose learner';
  }, [learnerOptions, newStudentId, rosterLoading]);

  // ✨ AI helper: call backend to compute/fill a column (or many) and then save the sheet
  const handleAiFillColumn = useCallback(
    async (targetKey: string, instructions: string) => {
      if (!backendUrl || !orgId) {
        Alert.alert('AI fill', 'Missing org or backend URL – cannot run AI fill.');
        return;
      }
      if (!selectedSessionId) {
        Alert.alert('AI fill', 'Please select an exam session first.');
        return;
      }
      if (!sheetRows.length) {
        Alert.alert('AI fill', 'No rows available for AI to work on.');
        return;
      }

      setAiBusy(true);
      try {
        const resp = await fetch(`${backendUrl}/api/orgs/${orgId}/exams/sheet/ai-compute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            sessionId: selectedSessionId,
            classLabel,
            rows: sheetRows,
            targetColumnKey: targetKey || undefined,
            instructions,
          }),
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok || !data?.ok) {
          console.error('[handleAiFillColumn] error response', data);
          Alert.alert(
            'AI fill',
            data?.message || 'AI sheet update failed. Please check your instructions and try again.'
          );
          return;
        }

        if (Array.isArray(data.rows) && data.rows.length) {
          await saveSheet(selectedSessionId, classLabel || undefined, data.rows);
        } else {
          Alert.alert('AI fill', 'AI did not return any updated rows.');
        }
      } catch (err) {
        console.error('[handleAiFillColumn] error', err);
        Alert.alert('AI fill', 'Failed to run AI fill. Please try again.');
      } finally {
        setAiBusy(false);
      }
    },
    [backendUrl, orgId, authToken, selectedSessionId, classLabel, sheetRows, saveSheet]
  );

  // ✨ Free-form AI prompt that can add / rename / fill extra columns
  const handleAiSheetCommand = useCallback(async () => {
    const trimmed = aiPrompt.trim();
    if (!trimmed) {
      Alert.alert('AI sheet assistant', 'Type an AI instruction first.');
      return;
    }

    if (!backendUrl || !orgId || !selectedSessionId || !sheetRows.length) {
      Alert.alert('AI sheet assistant', 'Missing context (org, session or rows) for AI.');
      return;
    }

    setAiBusy(true);
    try {
      await handleAiFillColumn(aiColumnKey || '', trimmed);
    } finally {
      setAiBusy(false);
    }
  }, [aiPrompt, aiColumnKey, backendUrl, orgId, selectedSessionId, sheetRows, handleAiFillColumn]);

  // ────────────────────────────────────────────────
  // UI helpers
  // ────────────────────────────────────────────────

  const smallButton = (variant: 'primary' | 'ghost') => [
    tw`h-9 px-3 rounded-xl items-center justify-center flex-row`,
    variant === 'primary'
      ? { backgroundColor: palette.accent }
      : {
          backgroundColor: palette.chipBg,
          borderColor: palette.border,
          borderWidth: 1,
        },
  ];

  const tableHeaderCell = [tw`px-3 py-2 min-w-[90px]`, { borderColor: palette.border }];
  const tableCell = [tw`px-3 py-2 min-w-[90px]`, { borderColor: palette.border }];

  const inputBase = [
    tw`rounded-xl px-3 text-xs`,
    {
      backgroundColor: palette.inputBg,
      borderColor: palette.border,
      borderWidth: 1,
      color: palette.text,
      minHeight: 36,
      paddingVertical: 6,
    },
  ];

  const smallInputBase = [
    tw`rounded-lg px-2 text-[11px]`,
    {
      backgroundColor: palette.inputBg,
      borderColor: palette.border,
      borderWidth: 1,
      color: palette.text,
      minHeight: 32,
      paddingVertical: 4,
    },
  ];

  return (
    <View
      style={[
        tw`rounded-2xl p-3`,
        { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 },
      ]}
    >
      {/* Header / summary */}
      <View style={tw`flex-row flex-wrap items-center justify-between gap-y-3 mb-3`}>
        <View style={tw`flex-1 mr-2`}>
          <Text style={[tw`text-sm font-bold`, { color: palette.text }]}>Marks entry</Text>
          <Text style={[tw`text-[11px] mt-0.5`, { color: palette.textSoft }]}>
            One row per learner & subject. The system will auto-grade on save.
          </Text>
          <Text style={[tw`text-[11px] mt-0.5`, { color: palette.textMuted }]}>
            Roster learners: {rosterLoading ? 'Loading…' : rosterLearners.length || '0'} •
            Selectable for this class: {classLabel.trim() ? visibleLearnerCount : 'all'}
          </Text>
        </View>

        {/* Subject filter + controls */}
        <View style={tw`w-full mt-2`}>
          <TextInput
            value={subjectFilter}
            onChangeText={setSubjectFilter}
            placeholder="Filter by subject"
            placeholderTextColor={palette.textSoft}
            style={[...inputBase, tw`h-9`]}
          />
        </View>
      </View>

      {/* Row: learner selector, subject, initials, actions */}
      <View style={tw`mt-2 gap-3`}>
        {/* Learner selector DROPDOWN */}
        <View>
          <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>Select learner</Text>

          {/* Field */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              if (rosterLoading || !learnerOptions.length) return;
              setLearnerDropdownOpen((open) => !open);
            }}
            style={[
              tw`h-9 rounded-xl px-3 flex-row items-center justify-between`,
              {
                backgroundColor: palette.inputBg,
                borderColor: palette.border,
                borderWidth: 1,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                tw`text-[11px] flex-1`,
                {
                  color:
                    selectedLearnerLabel === 'Choose learner' ? palette.textSoft : palette.text,
                },
              ]}
            >
              {selectedLearnerLabel}
            </Text>
            <Text style={[tw`text-[10px] ml-2`, { color: palette.textSoft }]}>
              {learnerDropdownOpen ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {/* Dropdown menu */}
          {learnerDropdownOpen && !rosterLoading && learnerOptions.length > 0 && (
            <View
              style={[
                tw`mt-1 rounded-xl overflow-hidden`,
                {
                  borderColor: palette.border,
                  borderWidth: 1,
                  backgroundColor: palette.card,
                },
              ]}
            >
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 220 }}
              >
                {learnerOptions.map((opt) => {
                  const active = opt.value === newStudentId;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => {
                        setNewStudentId(opt.value);
                        setLearnerDropdownOpen(false);
                      }}
                      style={[
                        tw`px-3 py-2 flex-row items-center justify-between`,
                        {
                          backgroundColor: active ? palette.rowAltBg : palette.card,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[tw`text-[11px] flex-1`, { color: palette.text }]}
                      >
                        {opt.label}
                      </Text>
                      {active && (
                        <Text style={[tw`text-[10px] ml-2`, { color: palette.accentSoft }]}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Loading / empty helper text when dropdown unavailable */}
          {rosterLoading && (
            <Text style={[tw`mt-1 text-[11px]`, { color: palette.textSoft }]}>
              Loading learners…
            </Text>
          )}
          {!rosterLoading && learnerOptions.length === 0 && (
            <Text style={[tw`mt-1 text-[11px]`, { color: palette.textSoft }]}>
              No learners in roster.
            </Text>
          )}
        </View>

        {/* Subject + initials + add row / bulk add / extra column */}
        <View style={tw`flex-row flex-wrap items-center gap-2`}>
          <View style={tw`flex-1 min-w-[140px]`}>
            <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>Subject name</Text>
            <TextInput
              value={newSubject}
              onChangeText={setNewSubject}
              placeholder="Subject name"
              placeholderTextColor={palette.textSoft}
              style={inputBase}
            />
          </View>

          <View style={tw`w-20`}>
            <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>Initials</Text>
            <TextInput
              value={teacherInitials}
              onChangeText={(v) => setTeacherInitials(v.toUpperCase())}
              placeholder="Init."
              placeholderTextColor={palette.textSoft}
              style={[...smallInputBase, tw`text-center`]}
            />
          </View>

          {/* Single learner add */}
          <TouchableOpacity
            style={smallButton('primary')}
            disabled={!selectedSessionId || !newStudentId || !newSubject.trim() || rosterLoading}
            onPress={onAddRowFromRoster}
          >
            <Text style={tw`text-xs text-white font-semibold`}>+ Add row</Text>
          </TouchableOpacity>

          {/* Bulk add class */}
          <TouchableOpacity
            style={smallButton('ghost')}
            disabled={
              !selectedSessionId ||
              !classLabel.trim() ||
              !newSubject.trim() ||
              rosterLoading ||
              !visibleLearnerCount
            }
            onPress={onBulkAddClassForSubject}
          >
            <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>
              Add class roster
            </Text>
          </TouchableOpacity>
        </View>

        {/* Extra column + AI column controls */}
        <View style={tw`flex-row flex-wrap items-center gap-2 mt-1`}>
          {/* Extra column name + button */}
          <View style={tw`flex-row items-center gap-2`}>
            <View style={tw`w-32`}>
              <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>
                New extra column
              </Text>
              <TextInput
                value={newExtraColumnName}
                onChangeText={setNewExtraColumnName}
                placeholder="e.g. Effort"
                placeholderTextColor={palette.textSoft}
                style={smallInputBase}
              />
            </View>
            <TouchableOpacity
              style={[
                tw`h-9 px-3 rounded-xl items-center justify-center`,
                { backgroundColor: palette.chipBg, borderColor: palette.border, borderWidth: 1 },
              ]}
              onPress={() => {
                const label = newExtraColumnName.trim();
                if (!label) {
                  Alert.alert('Extra column', 'Type a column title first.');
                  return;
                }

                const next = sheetRows.map((row) => {
                  const currentExtra =
                    (row as any).extra && typeof (row as any).extra === 'object'
                      ? (row as any).extra
                      : {};
                  if (Object.prototype.hasOwnProperty.call(currentExtra, label)) {
                    return row;
                  }
                  return {
                    ...row,
                    extra: { ...currentExtra, [label]: '' },
                  } as any;
                });

                void saveSheet(selectedSessionId, classLabel || undefined, next);
              }}
            >
              <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>
                + Extra column
              </Text>
            </TouchableOpacity>
          </View>

          {/* AI column selector + buttons */}
          <View style={tw`flex-row items-center gap-1 flex-wrap`}>
            <Text style={[tw`text-[10px]`, { color: palette.accentSoft }]}>AI column</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {extraColumnKeys.length === 0 && (
                <View
                  style={[tw`px-2 py-1 rounded-full mr-1`, { backgroundColor: palette.chipBg }]}
                >
                  <Text style={[tw`text-[10px]`, { color: palette.textSoft }]}>
                    No extra columns
                  </Text>
                </View>
              )}
              {extraColumnKeys.map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setAiColumnKey(key)}
                  style={[
                    tw`px-2 py-1 rounded-full mr-1 border`,
                    aiColumnKey === key
                      ? { backgroundColor: '#f59e0b', borderColor: '#fed7aa' }
                      : { backgroundColor: palette.chipBg, borderColor: palette.border },
                  ]}
                >
                  <Text style={[tw`text-[10px]`, { color: palette.text }]}>{key}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[
                tw`h-9 px-3 rounded-xl items-center justify-center`,
                { backgroundColor: '#f97316' },
              ]}
              disabled={
                aiBusy ||
                !selectedSessionId ||
                !sheetRows.length ||
                !backendUrl ||
                !orgId ||
                !extraColumnKeys.length
              }
              onPress={async () => {
                const effectiveKey = aiColumnKey || extraColumnKeys[0] || '';
                if (!effectiveKey) {
                  Alert.alert(
                    'AI fill',
                    'No target column selected. Please add or choose an extra column first.'
                  );
                  return;
                }
                const trimmed = aiPrompt.trim();
                if (!trimmed) {
                  Alert.alert('AI fill', 'Type instructions for AI in the assistant box below.');
                  return;
                }
                await handleAiFillColumn(effectiveKey, trimmed);
              }}
            >
              <Text style={tw`text-[11px] text-white font-semibold`}>
                {aiBusy ? 'AI filling…' : '✨ AI fill'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                tw`h-9 px-3 rounded-xl items-center justify-center`,
                { backgroundColor: '#fee2e2' },
              ]}
              disabled={
                aiBusy ||
                !selectedSessionId ||
                !sheetRows.length ||
                !backendUrl ||
                !orgId ||
                !extraColumnKeys.length
              }
              onPress={() => {
                const effectiveKey = aiColumnKey || extraColumnKeys[0] || '';
                if (!effectiveKey) {
                  Alert.alert(
                    'AI delete',
                    'No target column selected. Please add or choose an extra column first.'
                  );
                  return;
                }

                Alert.alert(
                  'Delete column',
                  `AI will remove the entire "${effectiveKey}" column from this sheet (all rows). Continue?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        const instructions =
                          `Delete the "${effectiveKey}" column completely from this sheet. ` +
                          'For every row, set extra["' +
                          effectiveKey +
                          '"] to "__DELETE__" so the backend removes this column entirely.';
                        await handleAiFillColumn(effectiveKey, instructions);
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={tw`text-[11px] text-rose-700 font-semibold`}>🗑 AI delete col</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ✨ Free-form AI sheet assistant */}
      <View
        style={[
          tw`mt-3 rounded-2xl px-3 py-2 border border-dashed`,
          { borderColor: palette.border, backgroundColor: palette.rowBg },
        ]}
      >
        <View style={tw`flex-row flex-wrap items-start justify-between gap-2`}>
          <View style={tw`flex-1 min-w-[220px]`}>
            <View style={tw`flex-row items-center gap-1.5`}>
              <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>
                AI sheet assistant
              </Text>
              <View style={tw`px-2 py-0.5 rounded-full bg-blue-500/20`}>
                <Text style={tw`text-[9px] uppercase tracking-wide text-blue-200`}>Beta</Text>
              </View>
            </View>
            <Text style={[tw`text-[10px] mt-0.5`, { color: palette.textSoft }]}>
              Example:{' '}
              <Text style={tw`italic`}>
                “Add a Homework /40 column and fill 38 for student 105, 35 for 106. Set Effort A–E
                based on the % score. Delete the old ‘Comments’ column.”
              </Text>
            </Text>
          </View>

          <TouchableOpacity
            disabled={aiBusy || !backendUrl || !orgId || !selectedSessionId || !sheetRows.length}
            onPress={handleAiSheetCommand}
            style={[
              tw`h-9 px-3 rounded-xl items-center justify-center self-end`,
              {
                backgroundColor: palette.isDark ? palette.chipBg : palette.accent,
                borderColor: palette.isDark ? palette.border : palette.accentSoft,
                borderWidth: 1,
                opacity:
                  aiBusy || !backendUrl || !orgId || !selectedSessionId || !sheetRows.length
                    ? 0.6
                    : 1,
              },
            ]}
          >
            <Text style={[tw`text-[11px] font-semibold`, { color: '#ffffff' }]}>
              {aiBusy ? 'Working…' : 'Run on sheet'}
            </Text>
          </TouchableOpacity>
        </View>

        <TextInput
          multiline
          value={aiPrompt}
          onChangeText={setAiPrompt}
          placeholder='Eg. "Create an Effort column (A–E) based on % ranges and set Homework /20 for each student using these raw marks…"'
          placeholderTextColor={palette.textSoft}
          style={[
            tw`mt-2 w-full min-h-[60px] rounded-xl px-2.5 py-1.5 text-[11px]`,
            {
              backgroundColor: palette.inputBg,
              borderColor: palette.border,
              borderWidth: 1,
              color: palette.text,
            },
          ]}
        />
        <Text style={[tw`mt-1 text-[10px]`, { color: palette.textMuted }]}>
          The assistant updates the in-memory sheet first, then your{' '}
          <Text style={tw`font-semibold`}>Save all marks</Text> persists everything to{' '}
          <Text style={tw`font-mono`}>org_exam_results.extra</Text>.
        </Text>
      </View>

      {/* Marks table */}
      <View
        style={[
          tw`mt-3 rounded-xl border-2`,
          { borderColor: palette.border, backgroundColor: palette.card },
        ]}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {/* Header row */}
            <View
              style={[
                tw`flex-row border-b`,
                { backgroundColor: palette.headerBg, borderColor: palette.border },
              ]}
            >
              <View style={tableHeaderCell}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Student ID</Text>
              </View>
              <View style={tableHeaderCell}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Adm. code</Text>
              </View>
              <View style={[...tableHeaderCell, tw`min-w-[160px]`]}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Name / Email</Text>
              </View>
              <View style={tableHeaderCell}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Subject</Text>
              </View>
              <View style={tableHeaderCell}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Score</Text>
              </View>
              <View style={tableHeaderCell}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Out of</Text>
              </View>
              <View style={[...tableHeaderCell, tw`min-w-[110px]`]}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>% / Grade</Text>
              </View>
              <View style={[...tableHeaderCell, tw`min-w-[150px]`]}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Remarks</Text>
              </View>

              {/* dynamic extras */}
              {extraColumnKeys.map((key) => (
                <View key={key} style={[...tableHeaderCell, tw`min-w-[120px]`]}>
                  <Text style={[tw`text-[11px]`, { color: palette.text }]}>{key}</Text>
                </View>
              ))}

              <View style={tableHeaderCell}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Initials</Text>
              </View>
              <View style={[...tableHeaderCell, tw`min-w-[130px]`]}>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>Actions</Text>
              </View>
            </View>

            {/* Body */}
            {sheetLoading && (
              <View style={tw`px-3 py-4`}>
                <Text style={[tw`text-sm`, { color: palette.textSoft }]}>Loading marks…</Text>
              </View>
            )}

            {!sheetLoading &&
              paginatedSheetRows.map((r, idx) => {
                const percent =
                  r.score != null && r.max_score
                    ? Math.round((Number(r.score) / Number(r.max_score)) * 100)
                    : null;

                const meta = learnerById.get(Number(r.student_user_id));
                const admissionCode = (r as any).admission_code ?? meta?.admission_code ?? null;

                const displayName =
                  (r as any).student_name ||
                  meta?.name ||
                  meta?.email ||
                  `User #${r.student_user_id}`;

                const displayEmail = (r as any).student_email ?? meta?.email ?? '';

                let rowIndex = sheetRows.indexOf(r);
                if (rowIndex === -1) {
                  rowIndex = sheetRows.findIndex(
                    (x) => x.student_user_id === r.student_user_id && x.subject === r.subject
                  );
                }
                const safeIndex = rowIndex === -1 ? filteredSheetRows.indexOf(r) : rowIndex;

                const rowBgColor = idx % 2 === 0 ? palette.rowBg : palette.rowAltBg;

                return (
                  <View
                    key={`${r.student_user_id}-${r.subject}-${safeIndex}`}
                    style={[
                      tw`flex-row border-t`,
                      { borderColor: palette.border, backgroundColor: rowBgColor },
                    ]}
                  >
                    <View style={tableCell}>
                      <Text style={[tw`text-[11px]`, { color: palette.text }]}>
                        {r.student_user_id}
                      </Text>
                    </View>

                    <View style={tableCell}>
                      {admissionCode ? (
                        <View
                          style={[
                            tw`px-2 py-0.5 rounded-full`,
                            { backgroundColor: palette.chipBg },
                          ]}
                        >
                          <Text style={[tw`text-[10px] font-semibold`, { color: palette.text }]}>
                            {admissionCode}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>—</Text>
                      )}
                    </View>

                    <View style={[...tableCell, tw`min-w-[160px]`]}>
                      <Text style={[tw`text-xs font-medium`, { color: palette.text }]}>
                        {displayName}
                      </Text>
                      {displayEmail ? (
                        <Text style={[tw`text-[11px] mt-0.5`, { color: palette.textSoft }]}>
                          {displayEmail}
                        </Text>
                      ) : null}
                    </View>

                    <View style={tableCell}>
                      <Text style={[tw`text-[11px]`, { color: palette.text }]}>{r.subject}</Text>
                    </View>

                    {/* Score */}
                    <View style={tableCell}>
                      <TextInput
                        keyboardType="numeric"
                        value={r.score == null ? '' : String(r.score)}
                        onChangeText={(text) => {
                          const val = Number(text) || 0;
                          const copy: OrgExamResultRow[] = [...sheetRows];
                          if (safeIndex < 0 || safeIndex >= copy.length) return;

                          const current: OrgExamResultRow = copy[safeIndex] as OrgExamResultRow;
                          const next: OrgExamResultRow = {
                            ...current,
                            score: val,
                          };

                          copy[safeIndex] = next;
                          void saveSheet(selectedSessionId, classLabel || undefined, copy);
                        }}
                        style={[...smallInputBase, tw`w-20`]}
                        placeholderTextColor={palette.textSoft}
                      />
                    </View>

                    {/* Out of */}
                    <View style={tableCell}>
                      <TextInput
                        keyboardType="numeric"
                        value={r.max_score == null ? '' : String(r.max_score)}
                        onChangeText={(text) => {
                          const val = Number(text) || 0;
                          const copy: OrgExamResultRow[] = [...sheetRows];
                          if (safeIndex < 0 || safeIndex >= copy.length) return;

                          const current: OrgExamResultRow = copy[safeIndex] as OrgExamResultRow;
                          const next: OrgExamResultRow = {
                            ...current,
                            max_score: val,
                          };

                          copy[safeIndex] = next;
                          void saveSheet(selectedSessionId, classLabel || undefined, copy);
                        }}
                        style={[...smallInputBase, tw`w-20`]}
                        placeholderTextColor={palette.textSoft}
                      />
                    </View>

                    {/* % / Grade */}
                    <View style={[...tableCell, tw`min-w-[110px]`]}>
                      {percent != null ? (
                        <Text style={[tw`text-[11px]`, { color: palette.text }]}>
                          {percent}% {r.grade ? `• ${r.grade}` : ''}
                        </Text>
                      ) : (
                        <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>—</Text>
                      )}
                    </View>

                    {/* Per-subject remark */}
                    <View style={[...tableCell, tw`min-w-[150px]`]}>
                      <TextInput
                        value={(r as any).remark ?? ''}
                        onChangeText={(val) => {
                          const copy = [...sheetRows];
                          if (safeIndex < 0 || safeIndex >= copy.length) return;
                          (copy[safeIndex] as any) = {
                            ...copy[safeIndex],
                            remark: val,
                          };
                          void saveSheet(selectedSessionId, classLabel || undefined, copy);
                        }}
                        placeholder="Remark"
                        placeholderTextColor={palette.textSoft}
                        style={[...smallInputBase, tw`w-40`]}
                      />
                    </View>

                    {/* Dynamic extra columns */}
                    {extraColumnKeys.map((key) => {
                      const extra =
                        (r as any).extra && typeof (r as any).extra === 'object'
                          ? ((r as any).extra as Record<string, any>)
                          : {};
                      const value = extra[key] ?? '';

                      return (
                        <View key={key} style={[...tableCell, tw`min-w-[120px]`]}>
                          <TextInput
                            value={String(value)}
                            onChangeText={(val) => {
                              const copy = [...sheetRows];
                              if (safeIndex < 0 || safeIndex >= copy.length) return;
                              const current = (copy[safeIndex] as any) || {};
                              const currentExtra =
                                current.extra && typeof current.extra === 'object'
                                  ? current.extra
                                  : {};
                              (copy[safeIndex] as any) = {
                                ...current,
                                extra: {
                                  ...currentExtra,
                                  [key]: val,
                                },
                              };
                              void saveSheet(selectedSessionId, classLabel || undefined, copy);
                            }}
                            style={[...smallInputBase, tw`w-28`]}
                            placeholderTextColor={palette.textSoft}
                          />
                        </View>
                      );
                    })}

                    {/* Teacher initials */}
                    <View style={tableCell}>
                      <TextInput
                        value={(r as any).teacher_initials ?? (r as any).teacherInitials ?? ''}
                        onChangeText={(val) => {
                          const copy = [...sheetRows];
                          if (safeIndex < 0 || safeIndex >= copy.length) return;
                          (copy[safeIndex] as any) = {
                            ...copy[safeIndex],
                            teacher_initials: val,
                          };
                          void saveSheet(selectedSessionId, classLabel || undefined, copy);
                        }}
                        placeholder="Init."
                        placeholderTextColor={palette.textSoft}
                        style={[...smallInputBase, tw`w-16`]}
                      />
                    </View>

                    {/* Actions */}
                    <View style={[...tableCell, tw`flex-row items-center gap-1 min-w-[130px]`]}>
                      <TouchableOpacity
                        style={[
                          tw`h-8 px-3 rounded-xl items-center justify-center`,
                          { backgroundColor: palette.chipBg },
                        ]}
                        onPress={() => onOpenStudentCard(r.student_user_id)}
                      >
                        <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>
                          Card
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={tw`h-8 px-3 rounded-xl bg-sky-500 items-center justify-center`}
                        onPress={() => onEmailStudentCard(r.student_user_id)}
                      >
                        <Text style={tw`text-[11px] text-white font-semibold`}>Email</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

            {!sheetLoading && !filteredSheetRows.length && (
              <View style={tw`px-3 py-4`}>
                <Text style={[tw`text-sm`, { color: palette.textSoft }]}>
                  No marks yet for this exam/class. Start by adding rows using the learner selector
                  above.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* 🔢 Pagination strip */}
      {!sheetLoading && filteredSheetRows.length > 0 && (
        <View style={tw`mt-2 flex-row flex-wrap items-center justify-between gap-2`}>
          <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>{marksRangeText()}</Text>

          <View style={tw`flex-row flex-wrap items-center gap-2`}>
            {/* Rows per page */}
            <View
              style={[
                tw`flex-row items-center gap-1 px-2 py-1 rounded-full`,
                { backgroundColor: palette.chipBg },
              ]}
            >
              <Text style={[tw`text-[11px]`, { color: palette.text }]}>Rows:</Text>
              {[10, 25, 50].map((size) => (
                <TouchableOpacity
                  key={size}
                  onPress={() => {
                    setMarksPageSize(size);
                    setMarksPage(1);
                  }}
                  style={[
                    tw`px-2 py-0.5 rounded-full`,
                    {
                      backgroundColor: marksPageSize === size ? palette.accent : palette.rowBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      tw`text-[11px]`,
                      {
                        color: marksPageSize === size ? '#ffffff' : palette.text,
                      },
                    ]}
                  >
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Prev / next */}
            {totalMarksPages > 1 && (
              <View
                style={[
                  tw`flex-row items-center gap-1 px-2 py-1 rounded-full`,
                  { backgroundColor: palette.chipBg },
                ]}
              >
                <TouchableOpacity
                  disabled={marksPage === 1}
                  onPress={() => setMarksPage((p) => Math.max(1, p - 1))}
                  style={[
                    tw`px-2 py-0.5 rounded-full`,
                    {
                      backgroundColor: marksPage === 1 ? 'transparent' : palette.rowBg,
                      opacity: marksPage === 1 ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text style={[tw`text-[11px]`, { color: palette.text }]}>‹ Prev</Text>
                </TouchableOpacity>
                <Text style={[tw`text-[11px]`, { color: palette.text }]}>
                  Page {marksPage} of {totalMarksPages}
                </Text>
                <TouchableOpacity
                  disabled={marksPage === totalMarksPages}
                  onPress={() => setMarksPage((p) => Math.min(totalMarksPages, p + 1))}
                  style={[
                    tw`px-2 py-0.5 rounded-full`,
                    {
                      backgroundColor:
                        marksPage === totalMarksPages ? 'transparent' : palette.rowBg,
                      opacity: marksPage === totalMarksPages ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text style={[tw`text-[11px]`, { color: palette.text }]}>Next ›</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Save button */}
      <View style={tw`mt-3 flex-row justify-end`}>
        <TouchableOpacity
          disabled={savingSheet}
          onPress={onSaveSheet}
          style={[
            tw`h-9 px-4 rounded-xl items-center justify-center`,
            { backgroundColor: palette.accent },
          ]}
        >
          <Text style={tw`text-sm text-white font-semibold`}>
            {savingSheet ? 'Saving…' : 'Save all marks'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OrgExamMarksTab;

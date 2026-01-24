// apps/web/src/pages/org/OrgExamMarksTab.web.tsx
import React from 'react';
import type { OrgExamResultRow } from '@mytutorapp/shared/types';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

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
  const { backendUrl, orgToken } = useShopContext();
  const authToken = orgToken;
  const { org } = (useOrg?.() ?? {}) as any;
  const orgId = org?.id || (org as any)?.org_id || (org as any)?.orgId || null;

  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiColumnKey, setAiColumnKey] = React.useState('');
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [aiFiles, setAiFiles] = React.useState<File[]>([]);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) {
      setAiFiles([]);
      return;
    }
    setAiFiles(files.slice(0, 3)); // cap at 3 for sanity
  };

  // 🔹 Collect all dynamic extra-column keys from row.extra
  const extraColumnKeys = React.useMemo(() => {
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

  const totalCols = 10 + extraColumnKeys.length; // base 10 columns + dynamic extras

  // 🔢 Pagination state for marks table
  const [marksPage, setMarksPage] = React.useState(1);
  const [marksPageSize, setMarksPageSize] = React.useState(10);

  const totalMarksPages = React.useMemo(() => {
    if (!filteredSheetRows.length) return 1;
    return Math.max(1, Math.ceil(filteredSheetRows.length / marksPageSize));
  }, [filteredSheetRows.length, marksPageSize]);

  const paginatedSheetRows = React.useMemo(() => {
    if (!filteredSheetRows.length) return [];
    const start = (marksPage - 1) * marksPageSize;
    return filteredSheetRows.slice(start, start + marksPageSize);
  }, [filteredSheetRows, marksPage, marksPageSize]);

  // clamp current page if filtered rows shrink
  React.useEffect(() => {
    const maxPage = totalMarksPages;
    if (marksPage > maxPage) {
      setMarksPage(maxPage);
    }
  }, [totalMarksPages, marksPage]);

  // reset to page 1 when we change session, class, or subject filter
  React.useEffect(() => {
    setMarksPage(1);
  }, [selectedSessionId, classLabel, subjectFilter]);

  const marksRangeText = () => {
    if (!filteredSheetRows.length) return 'No marks yet';
    const start = (marksPage - 1) * marksPageSize + 1;
    const end = Math.min(marksPage * marksPageSize, filteredSheetRows.length);
    return `Showing ${start}–${end} of ${filteredSheetRows.length} rows`;
  };

  // ✨ AI helper: call backend to compute/fill a column (or many) and then save the sheet
  const handleAiFillColumn = React.useCallback(
    async (targetKey: string, instructions: string) => {
      if (!backendUrl || !orgId) {
        window.alert('Missing org or backend URL – cannot run AI fill.');
        return;
      }
      if (!selectedSessionId) {
        window.alert('Please select an exam session first.');
        return;
      }
      if (!sheetRows.length) {
        window.alert('No rows available for AI to work on.');
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
            rows: sheetRows, // send current rows
            targetColumnKey: targetKey || undefined,
            instructions,
          }),
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok || !data?.ok) {
          // eslint-disable-next-line no-console
          console.error('[handleAiFillColumn] error response', data);
          window.alert(
            data?.message || 'AI sheet update failed. Please check your instructions and try again.'
          );
          return;
        }

        if (Array.isArray(data.rows) && data.rows.length) {
          // Use existing saveSheet pipeline so behaviour stays consistent
          await saveSheet(selectedSessionId, classLabel || undefined, data.rows);
        } else {
          window.alert('AI did not return any updated rows.');
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[handleAiFillColumn] error', err);
        window.alert('Failed to run AI fill. Please try again.');
      } finally {
        setAiBusy(false);
      }
    },
    [backendUrl, orgId, authToken, selectedSessionId, classLabel, sheetRows, saveSheet]
  );

  // ✨ Free-form AI prompt that can add / rename / fill extra columns
  const handleAiSheetCommand = React.useCallback(async () => {
    const trimmed = aiPrompt.trim();
    if (!trimmed) {
      window.alert('Type an AI instruction first.');
      return;
    }

    if (!backendUrl || !orgId || !selectedSessionId || !sheetRows.length) {
      window.alert('Missing context (org, session or rows) for AI.');
      return;
    }

    setAiBusy(true);
    try {
      if (aiFiles.length === 0) {
        // 🔹 Existing behaviour: no docs → call JSON ai-compute
        await handleAiFillColumn(aiColumnKey || '', trimmed);
        return;
      }

      // 🔹 With docs → send files + prompt to ai-extract-doc
      const form = new FormData();
      form.append('sessionId', selectedSessionId);
      if (classLabel) form.append('classLabel', classLabel);
      form.append('instructions', trimmed);
      form.append('rows', JSON.stringify(sheetRows));

      aiFiles.forEach((file) => {
        form.append('files', file);
      });

      const resp = await fetch(`${backendUrl}/api/orgs/${orgId}/exams/sheet/ai-extract-doc`, {
        method: 'POST',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: form,
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        // eslint-disable-next-line no-console
        console.error('[handleAiSheetCommand] ai-extract-doc error', data);
        window.alert(
          data?.message || 'AI document extraction failed. Please check the file and try again.'
        );
        return;
      }

      if (Array.isArray(data.rows) && data.rows.length) {
        await saveSheet(selectedSessionId, classLabel || undefined, data.rows);
        setAiFiles([]);
      } else {
        window.alert('AI did not return any updated rows.');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[handleAiSheetCommand] error', err);
      window.alert('Failed to run AI sheet assistant. Please try again.');
    } finally {
      setAiBusy(false);
    }
  }, [
    aiPrompt,
    aiColumnKey,
    aiFiles,
    backendUrl,
    orgId,
    selectedSessionId,
    classLabel,
    sheetRows,
    authToken,
    handleAiFillColumn,
    saveSheet,
  ]);

  return (
    <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-darkTextPrimary">
            Marks entry
          </h2>
          <p className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
            One row per learner &amp; subject. The system will auto-grade on save.
          </p>
          <p className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
            Roster learners: {rosterLoading ? 'Loading…' : rosterLearners.length || '0'} •&nbsp;
            Selectable for this class: {classLabel.trim() ? visibleLearnerCount : 'all'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full sm:w-auto">
          <input
            className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-xs sm:text-sm px-3 flex-1 text-gray-900 dark:text-darkTextPrimary placeholder:text-gray-500 dark:placeholder:text-darkTextSecondary"
            placeholder="Filter by subject"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-xs sm:text-sm px-2 min-w-[160px] text-gray-900 dark:text-darkTextPrimary"
              value={newStudentId}
              onChange={(e) => setNewStudentId(e.target.value)}
              disabled={rosterLoading || !rosterLearners.length}
            >
              <option value="">
                {rosterLoading
                  ? 'Loading learners…'
                  : rosterLearners.length
                    ? classLabel.trim()
                      ? 'Select learner for this class…'
                      : 'Select learner…'
                    : 'No learners in roster'}
              </option>
              {learnerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <input
              className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-xs sm:text-sm px-3 min-w-[140px] text-gray-900 dark:text-darkTextPrimary placeholder:text-gray-500 dark:placeholder:text-darkTextSecondary"
              placeholder="Subject name"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />

            {/* Teacher initials */}
            <input
              className="h-9 w-20 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-[11px] px-2 text-center uppercase tracking-wide text-gray-900 dark:text-darkTextPrimary placeholder:text-gray-500 dark:placeholder:text-darkTextSecondary"
              placeholder="Init."
              value={teacherInitials}
              onChange={(e) => setTeacherInitials(e.target.value.toUpperCase())}
              title="Teacher initials used for this class & subject (auto-applied to new rows)"
            />

            {/* Single learner add */}
            <button
              className="h-9 px-3 rounded-xl bg-[#3d99f5] text-white text-xs sm:text-sm font-semibold disabled:opacity-50"
              onClick={onAddRowFromRoster}
              disabled={!selectedSessionId || !newStudentId || !newSubject.trim() || rosterLoading}
            >
              + Add row
            </button>

            {/* Bulk add */}
            <button
              className="h-9 px-3 rounded-xl bg-[#0f172a] dark:bg-white text-white dark:text-[#0f172a] text-[11px] sm:text-xs font-semibold disabled:opacity-40"
              onClick={onBulkAddClassForSubject}
              disabled={
                !selectedSessionId ||
                !classLabel.trim() ||
                !newSubject.trim() ||
                rosterLoading ||
                !visibleLearnerCount
              }
              title="Use Class + Subject + Initials to create rows for the whole class."
            >
              Add class roster
            </button>

            {/* ✅ Add extra column */}
            <button
              type="button"
              className="h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-[11px] sm:text-xs font-semibold text-[#0f172a] dark:text-darkTextPrimary"
              onClick={() => {
                const label = window.prompt('New column title (e.g. "Effort", "Homework %"):', '');
                if (!label) return;

                const trimmed = label.trim();
                if (!trimmed) return;

                const next = sheetRows.map((row) => {
                  const currentExtra =
                    (row as any).extra && typeof (row as any).extra === 'object'
                      ? (row as any).extra
                      : {};
                  if (Object.prototype.hasOwnProperty.call(currentExtra, trimmed)) {
                    return row;
                  }
                  return {
                    ...row,
                    extra: { ...currentExtra, [trimmed]: '' },
                  } as any;
                });

                void saveSheet(selectedSessionId, classLabel || undefined, next);
              }}
            >
              + Extra column
            </button>

            {/* ✨ AI column selector + button */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] sm:text-xs text-[#49739c] dark:text-darkTextSecondary">
                AI column
              </span>
              <select
                className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-[11px] sm:text-xs px-2 min-w-[110px] text-gray-900 dark:text-darkTextPrimary"
                value={aiColumnKey || extraColumnKeys[0] || ''}
                onChange={(e) => setAiColumnKey(e.target.value)}
                disabled={!extraColumnKeys.length}
              >
                {extraColumnKeys.length === 0 ? (
                  <option value="">No extra columns</option>
                ) : (
                  extraColumnKeys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                className="h-9 px-3 rounded-xl bg-[#f97316] text-white text-[11px] sm:text-xs font-semibold disabled:opacity-50"
                disabled={
                  aiBusy ||
                  !selectedSessionId ||
                  !sheetRows.length ||
                  !backendUrl ||
                  !orgId ||
                  !extraColumnKeys.length
                }
                onClick={async () => {
                  const effectiveKey = aiColumnKey || extraColumnKeys[0] || '';

                  if (!effectiveKey) {
                    window.alert(
                      'No target column selected. Please add or choose an extra column first.'
                    );
                    return;
                  }

                  const instructions =
                    window
                      .prompt(
                        `What should AI do for column "${effectiveKey}"?\n` +
                          'Example: "Fill Effort A–E based on percent ranges."',
                        ''
                      )
                      ?.trim() || '';

                  if (!instructions) return;

                  await handleAiFillColumn(effectiveKey, instructions);
                }}
              >
                {aiBusy ? 'AI filling…' : '✨ AI fill'}
              </button>
              <button
                type="button"
                className="h-9 px-3 rounded-xl bg-[#fee2e2] text-[#b91c1c] text-[11px] sm:text-xs font-semibold disabled:opacity-50"
                disabled={
                  aiBusy ||
                  !selectedSessionId ||
                  !sheetRows.length ||
                  !backendUrl ||
                  !orgId ||
                  !extraColumnKeys.length
                }
                onClick={async () => {
                  const effectiveKey = aiColumnKey || extraColumnKeys[0] || '';
                  if (!effectiveKey) {
                    window.alert(
                      'No target column selected. Please add or choose an extra column first.'
                    );
                    return;
                  }

                  const confirmDelete = window.confirm(
                    `AI will remove the entire "${effectiveKey}" column from this sheet (all rows). Continue?`
                  );
                  if (!confirmDelete) return;

                  const instructions =
                    `Delete the "${effectiveKey}" column completely from this sheet. ` +
                    'For every row, set extra["' +
                    effectiveKey +
                    '"] to "__DELETE__" so the backend removes this column entirely.';

                  await handleAiFillColumn(effectiveKey, instructions);
                }}
              >
                🗑 AI delete col
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ✨ Free-form AI sheet assistant */}
      <div className="mt-1 w-full rounded-2xl border border-dashed border-[#c4d3e3] dark:border-slate-700 bg-[#f8fbff] dark:bg-[#020617] px-3 py-2.5 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#0f172a] dark:text-white">
                AI sheet assistant
              </span>
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide bg-[#3b82f6]/10 text-[#1d4ed8] dark:text-[#bfdbfe]">
                Beta
              </span>
            </div>
            <p className="text-[10px] text-[#64748b] dark:text-slate-400 mt-0.5">
              Describe changes in plain English. Example: <br />
              <span className="italic">
                “Add a Homework /40 column and fill 38 for student 105, 35 for 106. Set Effort A–E
                based on the % score. Delete the old ‘Comments’ column.”
              </span>
            </p>

            {/* 📎 Attached docs summary */}
            {aiFiles.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {aiFiles.map((f) => (
                  <span
                    key={f.name}
                    className="inline-flex items-center gap-1 rounded-full bg-white/80 dark:bg-[#020617] border border-[#d1e0f0] dark:border-slate-700 px-2 py-0.5 text-[9px] text-gray-900 dark:text-darkTextPrimary"
                  >
                    <span className="truncate max-w-[120px]">{f.name}</span>
                    <button
                      type="button"
                      className="text-[#ef4444]"
                      onClick={() => setAiFiles((prev) => prev.filter((x) => x !== f))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 items-end">
            {/* 📎 Attach document button */}
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*,.txt"
              />
              <button
                type="button"
                className="h-8 px-3 rounded-xl bg-white dark:bg-[#020617] border border-[#c4d3e3] dark:border-slate-700 text-[10px] sm:text-xs font-semibold flex items-center gap-1 text-gray-900 dark:text-darkTextPrimary"
                onClick={() => fileInputRef.current?.click()}
              >
                📎 Attach document
              </button>
            </div>

            <button
              type="button"
              className="h-9 px-3 rounded-xl bg-[#0f172a] dark:bg-white text-white dark:text-[#0f172a] text-[11px] sm:text-xs font-semibold disabled:opacity-50"
              disabled={aiBusy || !backendUrl || !orgId || !selectedSessionId || !sheetRows.length}
              onClick={handleAiSheetCommand}
              title="Run AI across this sheet. Changes will be saved into the JSON 'extra' column and regular score fields."
            >
              {aiBusy ? 'Working…' : 'Run on sheet'}
            </button>
          </div>
        </div>

        <textarea
          className="w-full min-h-[48px] rounded-xl border border-[#cedbe8] dark:border-slate-700 bg-white dark:bg-[#020617] px-2.5 py-1.5 text-[11px] sm:text-xs resize-y text-gray-900 dark:text-darkTextPrimary placeholder:text-gray-500 dark:placeholder:text-darkTextSecondary"
          placeholder='Eg. "Create an Effort column (A–E) based on % ranges and set Homework /20 for each student using these raw marks…"'
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <p className="text-[10px] text-[#94a3b8] dark:text-slate-500">
          The assistant updates the in-memory sheet first, then your usual{' '}
          <span className="font-semibold">Save all marks</span> persists everything to{' '}
          <code className="font-mono">org_exam_results.extra</code>.
        </p>
      </div>

      {/* Marks table */}
      <div className="overflow-x-auto rounded-xl border-2 border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821]">
        <table className="min-w-[950px] w-full text-xs sm:text-sm">
          <thead className="bg-slate-100 dark:bg-[#0f1821] text-left">
            <tr className="text-gray-900 dark:text-darkTextPrimary">
              <th className="px-3 py-2">Student ID</th>
              <th className="px-3 py-2">Adm. code</th>
              <th className="px-3 py-2">Name / Email</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Out of</th>
              <th className="px-3 py-2">% / Grade</th>
              <th className="px-3 py-2">Remarks</th>

              {/* ✅ dynamic user-added columns – now next to Remarks */}
              {extraColumnKeys.map((key) => (
                <th key={key} className="px-3 py-2">
                  {key}
                </th>
              ))}

              <th className="px-3 py-2">Initials</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="text-gray-900 dark:text-darkTextPrimary">
            {sheetLoading && (
              <tr>
                <td colSpan={totalCols} className="px-3 py-4 text-sm">
                  Loading marks…
                </td>
              </tr>
            )}

            {!sheetLoading &&
              paginatedSheetRows.map((r) => {
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

                // 🔐 Find the index in the master sheetRows array so edits write back to the correct row
                let rowIndex = sheetRows.indexOf(r);
                if (rowIndex === -1) {
                  rowIndex = sheetRows.findIndex(
                    (x) => x.student_user_id === r.student_user_id && x.subject === r.subject
                  );
                }
                const safeIndex = rowIndex === -1 ? filteredSheetRows.indexOf(r) : rowIndex;

                return (
                  <tr
                    key={`${r.student_user_id}-${r.subject}-${safeIndex}`}
                    className="border-t border-[#cedbe8] dark:border-darkCard"
                  >
                    <td className="px-3 py-2">{r.student_user_id}</td>
                    <td className="px-3 py-2">
                      {admissionCode ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-[#e7edf4] dark:bg-[#172534] font-semibold text-[#0f172a] dark:text-darkTextPrimary">
                          {admissionCode}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-xs sm:text-sm">{displayName}</div>
                      {displayEmail && (
                        <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                          {displayEmail}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2">{r.subject}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        className="w-20 h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-xs text-gray-900 dark:text-darkTextPrimary"
                        value={r.score}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const copy = [...sheetRows];
                          if (safeIndex < 0 || safeIndex >= copy.length) return;
                          copy[safeIndex] = { ...copy[safeIndex], score: val };
                          void saveSheet(selectedSessionId, classLabel || undefined, copy);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        className="w-20 h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-xs text-gray-900 dark:text-darkTextPrimary"
                        value={r.max_score}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const copy = [...sheetRows];
                          if (safeIndex < 0 || safeIndex >= copy.length) return;
                          copy[safeIndex] = { ...copy[safeIndex], max_score: val };
                          void saveSheet(selectedSessionId, classLabel || undefined, copy);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {percent != null ? (
                        <span className="text-xs sm:text-sm">
                          {percent}% {r.grade ? `• ${r.grade}` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Per-subject remark */}
                    <td className="px-3 py-2">
                      <input
                        className="w-32 sm:w-40 h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[11px] text-gray-900 dark:text-darkTextPrimary placeholder:text-gray-500 dark:placeholder:text-darkTextSecondary"
                        placeholder="Remark"
                        value={(r as any).remark ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const copy = [...sheetRows];
                          if (safeIndex < 0 || safeIndex >= copy.length) return;
                          (copy[safeIndex] as any) = {
                            ...copy[safeIndex],
                            remark: val,
                          };
                          void saveSheet(selectedSessionId, classLabel || undefined, copy);
                        }}
                      />
                    </td>

                    {/* ✅ Dynamic extra columns (Homework, Effort, NextStep, etc.) */}
                    {extraColumnKeys.map((key) => {
                      const extra =
                        (r as any).extra && typeof (r as any).extra === 'object'
                          ? ((r as any).extra as Record<string, any>)
                          : {};
                      const value = extra[key] ?? '';

                      return (
                        <td key={key} className="px-3 py-2">
                          <input
                            className="w-24 sm:w-32 h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[11px] text-gray-900 dark:text-darkTextPrimary"
                            value={value}
                            onChange={(e) => {
                              const val = e.target.value;
                              const copy = [...sheetRows];
                              if (safeIndex < 0 || safeIndex >= copy.length) return;
                              const current = (copy[safeIndex] as any) || {};
                              const currentExtra =
                                current.extra && typeof current.extra === 'object'
                                  ? current.extra
                                  : {};
                              (copy[safeIndex] as any) = {
                                ...current,
                                extra: { ...currentExtra, [key]: val },
                              };
                              void saveSheet(selectedSessionId, classLabel || undefined, copy);
                            }}
                          />
                        </td>
                      );
                    })}

                    {/* Teacher initials */}
                    <td className="px-3 py-2">
                      <input
                        className="w-16 h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[11px] text-gray-900 dark:text-darkTextPrimary placeholder:text-gray-500 dark:placeholder:text-darkTextSecondary"
                        placeholder="Init."
                        value={(r as any).teacher_initials ?? (r as any).teacherInitials ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const copy = [...sheetRows];
                          if (safeIndex < 0 || safeIndex >= copy.length) return;
                          (copy[safeIndex] as any) = {
                            ...copy[safeIndex],
                            teacher_initials: val,
                          };
                          void saveSheet(selectedSessionId, classLabel || undefined, copy);
                        }}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <button
                        className="h-8 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-[11px] font-semibold mr-1 text-[#0f172a] dark:text-darkTextPrimary"
                        onClick={() => onOpenStudentCard(r.student_user_id)}
                      >
                        Card
                      </button>
                      <button
                        className="h-8 px-3 rounded-xl bg-[#3d99f5] text-white text-[11px] font-semibold"
                        onClick={() => onEmailStudentCard(r.student_user_id)}
                      >
                        Email
                      </button>
                    </td>
                  </tr>
                );
              })}

            {!sheetLoading && !filteredSheetRows.length && (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-3 py-4 text-sm text-[#49739c] dark:text-darkTextSecondary"
                >
                  No marks yet for this exam/class. Start by adding rows using the learner selector
                  above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 🔢 Pagination strip */}
      {!sheetLoading && filteredSheetRows.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] sm:text-xs text-[#49739c] dark:text-darkTextSecondary">
          <span>{marksRangeText()}</span>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#e7edf4] dark:bg-[#172534]">
              <span className="hidden sm:inline">Rows per page:</span>
              <span className="sm:hidden">Rows:</span>
              <select
                value={marksPageSize}
                onChange={(e) => {
                  const size = Number(e.target.value) || 10;
                  setMarksPageSize(size);
                  setMarksPage(1);
                }}
                className="text-[11px] sm:text-xs rounded-full bg-white/80 dark:bg-[#0f1821] px-2 py-0.5 border border-transparent focus:outline-none text-gray-900 dark:text-darkTextPrimary"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            {totalMarksPages > 1 && (
              <div className="inline-flex items-center gap-1 rounded-full bg-[#e7edf4] dark:bg-[#172534] px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setMarksPage((p) => Math.max(1, p - 1))}
                  disabled={marksPage === 1}
                  className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                    marksPage === 1
                      ? 'opacity-40 cursor-default'
                      : 'hover:bg-white/70 dark:hover:bg-white/10'
                  }`}
                >
                  ‹ Prev
                </button>
                <span className="px-2 py-1 text-[11px] text-[#0f172a] dark:text-darkTextPrimary">
                  Page {marksPage} of {totalMarksPages}
                </span>
                <button
                  type="button"
                  onClick={() => setMarksPage((p) => Math.min(totalMarksPages, p + 1))}
                  disabled={marksPage === totalMarksPages}
                  className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                    marksPage === totalMarksPages
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
      )}

      <div className="flex justify-end">
        <button
          className="h-9 px-4 rounded-xl bg-[#3d99f5] text-white text-sm font-semibold disabled:opacity-60"
          onClick={onSaveSheet}
          disabled={savingSheet}
        >
          {savingSheet ? 'Saving…' : 'Save all marks'}
        </button>
      </div>
    </div>
  );
};

export default OrgExamMarksTab;

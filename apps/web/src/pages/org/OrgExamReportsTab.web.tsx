import React from 'react';
import type { OrgResp as Org } from '@mytutorapp/shared/api/orgApi';
import type { OrgExamTerm, OrgExamSession } from '@mytutorapp/shared/types';

const formatRank = (n: number | null | undefined): string => {
  if (!n || !Number.isFinite(n)) return '';
  return String(n); // 👈 1, 2, 3… no “st/nd/th”
};

const buildProgressSeries = (card: any): { label: string; percent: number }[] => {
  if (!card) return [];

  const seriesSource =
    card.progressSeries || card.history || card.previousSummaries || card.previous_terms || [];

  const out: { label: string; percent: number }[] = [];

  if (Array.isArray(seriesSource)) {
    seriesSource.forEach((p: any, idx: number) => {
      const label = p.label || p.termLabel || p.term || p.name || p.examLabel || `Term ${idx + 1}`;
      const percent =
        typeof p.percent === 'number'
          ? p.percent
          : typeof p.totalPercent === 'number'
            ? p.totalPercent
            : null;
      if (percent != null) {
        out.push({ label, percent });
      }
    });
  }

  if (!out.length && typeof card?.summary?.totalPercent === 'number') {
    out.push({ label: 'This exam', percent: card.summary.totalPercent });
  }

  return out;
};

// Small helper: render extra (JSON) tags as chips under a subject
const renderSubjectExtraChips = (extra: any) => {
  if (!extra || typeof extra !== 'object') return null;

  const entries = Object.entries(extra).filter(([key, value]) => {
    if (key === '__meta__') return false;
    if (value == null) return false;
    const str = String(value).trim();
    return str.length > 0;
  });

  if (!entries.length) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center rounded-full bg-[#e7edf4] dark:bg-[#172534] px-2 py-0.5 text-[10px] text-[#0f172a] dark:text-slate-100"
        >
          <span className="font-semibold mr-1">{key}:</span>
          <span className="opacity-90">{String(value)}</span>
        </span>
      ))}
    </div>
  );
};

const buildAiExtrasMatrix = (subjects: any[] | undefined | null) => {
  if (!Array.isArray(subjects) || !subjects.length) return null;

  const keyHasValues = new Map<string, boolean>();

  subjects.forEach((s) => {
    const extra =
      s && s.extra && typeof s.extra === 'object' && !Array.isArray(s.extra)
        ? (s.extra as Record<string, unknown>)
        : null;

    if (!extra) return;

    Object.entries(extra).forEach(([key, value]) => {
      if (key === '__meta__') return;
      if (value == null) return;
      const str = String(value).trim();
      if (!str) return;
      keyHasValues.set(key, true);
    });
  });

  const extraKeys = Array.from(keyHasValues.keys()).sort();
  if (!extraKeys.length) return null;

  const rows = subjects
    .map((s) => {
      const subjectLabel = s.subject || '—';
      const extra =
        s && s.extra && typeof s.extra === 'object' && !Array.isArray(s.extra)
          ? (s.extra as Record<string, unknown>)
          : {};
      const cells = extraKeys.map((k) => {
        const raw = extra[k];
        const str = raw == null ? '' : String(raw).trim();
        return str || '—';
      });

      // skip subjects with no meaningful extras at all
      const hasAny = cells.some((c) => c !== '—');
      if (!hasAny) return null;

      return {
        subject: subjectLabel,
        cells,
      };
    })
    .filter(Boolean) as { subject: string; cells: string[] }[];

  if (!rows.length) return null;

  return {
    extraKeys,
    rows,
  };
};

const AiExtrasTable: React.FC<{ subjects: any[] }> = ({ subjects }) => {
  const matrix = React.useMemo(() => buildAiExtrasMatrix(subjects), [subjects]);

  if (!matrix) return null;

  const { extraKeys, rows } = matrix;

  return (
    <div className="mt-2.5 sm:col-span-2 rounded-lg border border-dashed border-[#cbd5f5] dark:border-slate-700 bg-[#f8fafc] dark:bg-[#020617] p-2.5">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div>
          <h4 className="text-[11px] font-semibold text-[#0f172a] dark:text-slate-100">
            AI-assisted extra columns
          </h4>
          <p className="text-[9px] text-[#64748b] dark:text-slate-400">
            A compact view of AI-generated fields such as Effort, Homework, or Next step – kept
            separate from teacher remarks.
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center rounded-full bg-[#3b82f6]/10 text-[#1d4ed8] px-2 py-0.5 text-[9px] uppercase tracking-wide">
          AI enrichment
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-[9px] sm:text-[10px]">
          <thead className="text-left text-[#6b7280] dark:text-slate-400">
            <tr>
              <th className="py-1 pr-2 sticky left-0 bg-[#f8fafc] dark:bg-[#020617] z-10">
                Subject
              </th>
              {extraKeys.map((key) => (
                <th key={key} className="py-1 px-2">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.subject}-${idx}`}
                className="border-t border-[#e5e7eb] dark:border-slate-800"
              >
                <td className="py-1 pr-2 font-medium sticky left-0 bg-[#f8fafc] dark:bg-[#020617]">
                  {row.subject}
                </td>
                {row.cells.map((cell, i) => (
                  <td key={i} className="py-1 px-2 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[9px] text-[#94a3b8] dark:text-slate-500">
        Note: This table reflects <span className="font-semibold">AI-driven column changes</span>{' '}
        (Effort, targets, homework, etc.). The main subject remarks column on the report card
        remains reserved for <span className="font-semibold">teacher comments</span>.
      </p>
    </div>
  );
};

type AttendanceFormState = {
  lessonsAttended?: string;
  lessonsHeld?: string;
  attendancePercent?: string;
  behaviorRating?: string;
  punctualityRating?: string;
  teacherComment?: string;
};

type OrgExamReportsTabProps = {
  isLearnerView: boolean;
  org: Org | null;
  selectedStudentId: number | null;
  selectedTerm: OrgExamTerm | null;
  selectedSession: OrgExamSession | null;
  classLabel: string;
  studentCard: any | null;
  studentCardText: string | null;
  reportRemarks: string | null;
  setReportRemarks: (value: string | null) => void;
  attendanceForm: AttendanceFormState;
  setAttendanceForm: (updater: any) => void;
  analytics: any[];
  analyticsLoading: boolean;
  onRefreshAnalytics: () => void;
  onDownloadPdf: () => void;
  onRegenerateRemarks: (instructions?: string) => void;
  onSaveRemarks: () => void;
  onSaveAttendance: () => void; // 👈 NEW
  canDownloadClass: boolean;
  onDownloadClassPdf: () => void;
  onRegenerateTeacherComment?: (instructions?: string) => void;
};

const OrgExamReportsTab: React.FC<OrgExamReportsTabProps> = ({
  isLearnerView,
  org,
  selectedStudentId,
  selectedTerm,
  selectedSession,
  classLabel,
  studentCard,
  studentCardText,
  reportRemarks,
  setReportRemarks,
  attendanceForm,
  setAttendanceForm,
  analytics,
  analyticsLoading,
  onRefreshAnalytics,
  onDownloadPdf,
  onRegenerateRemarks,
  onSaveRemarks,
  onSaveAttendance,
  canDownloadClass,
  onDownloadClassPdf,
  onRegenerateTeacherComment,
}) => {
  // 🔹 small local textbox for AI hints
  const [aiInstructions, setAiInstructions] = React.useState('');
  const [teacherAiInstructions, setTeacherAiInstructions] = React.useState('');

  if (isLearnerView) {
    // 🎓 Learner: only own card
    return (
      <div className="max-w-3xl mx-auto rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold">My report card</h2>
            <p className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
              This view shows only your own exam results and a downloadable PDF.
            </p>
          </div>
          {selectedStudentId && (
            <button
              className="h-8 px-3 rounded-xl bg-[#3d99f5] text-white text-[11px] font-semibold"
              onClick={onDownloadPdf}
            >
              Download PDF
            </button>
          )}
        </div>

        <div className="mt-3 flex-1 rounded-xl border border-[#e7edf4] dark:border-darkCard bg-slate-50 dark:bg-[#0b1420] p-3 text-[11px] sm:text-xs overflow-y-auto">
          {!studentCard && !studentCardText && (
            <div className="text-[#49739c] dark:text-darkTextSecondary">
              Your report card will appear here once your school publishes marks for this exam, or
              once you choose a term and exam above.
            </div>
          )}

          {!studentCard && studentCardText && (
            <pre className="whitespace-pre-wrap">{studentCardText}</pre>
          )}

          {studentCard && (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-[#49739c] dark:text-darkTextSecondary">
                    {org?.name || 'School'}
                  </div>
                  <div className="text-sm sm:text-base font-bold">
                    {studentCard.student?.name || 'Learner'}
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                    {studentCard.student?.admission_code && (
                      <span className="px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#111827] border border-[#e7edf4] dark:border-darkCard">
                        Adm: {studentCard.student.admission_code}
                      </span>
                    )}
                    {(classLabel || studentCard.student?.class_label) && (
                      <span className="px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#111827] border border-[#e7edf4] dark:border-darkCard">
                        Class: {classLabel || studentCard.student?.class_label}
                      </span>
                    )}
                    {selectedTerm && (
                      <span className="px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#111827] border border-[#e7edf4] dark:border-darkCard">
                        {selectedTerm.year} – {selectedTerm.label}
                      </span>
                    )}
                    {selectedSession && (
                      <span className="px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#111827] border border-[#e7edf4] dark:border-darkCard">
                        Exam: {selectedSession.label}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <div className="text-[10px] uppercase tracking-wide text-[#49739c] dark:text-darkTextSecondary">
                    Overall performance
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-extrabold">
                      {typeof studentCard.summary?.totalPercent === 'number'
                        ? `${studentCard.summary.totalPercent.toFixed(1)}%`
                        : '—'}
                    </span>
                    {studentCard.summary?.overallGrade && (
                      <span className="px-2 py-0.5 rounded-full bg-[#3d99f5] text-white text-[10px] font-semibold">
                        Grade {studentCard.summary.overallGrade}
                      </span>
                    )}
                  </div>
                  {studentCard.summary?.classRank && studentCard.summary?.classSize && (
                    <div className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                      Position{' '}
                      <span className="font-semibold">
                        {formatRank(studentCard.summary.classRank)}
                      </span>{' '}
                      out of {studentCard.summary.classSize}
                    </div>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="grid sm:grid-cols-2 gap-3">
                {/* Subjects */}
                <div className="rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-[11px] font-semibold">Subject breakdown</h3>
                    <span className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                      Score • Grade • Position
                    </span>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <thead className="text-[#49739c] dark:text-darkTextSecondary text-left">
                        <tr>
                          <th className="py-1 pr-2">Subject</th>
                          <th className="py-1 pr-2 text-right">Score</th>
                          <th className="py-1 pr-2 text-right">% / Grade</th>
                          <th className="py-1 pr-0 text-right">Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentCard.subjects.map((s: any, idx: number) => (
                          <tr
                            key={`${s.subject}-${idx}`}
                            className="border-t border-[#e7edf4] dark:border-darkCard"
                          >
                            <td className="py-1 pr-2 align-top">
                              <div className="flex flex-col">
                                <span className="font-medium">{s.subject || '—'}</span>

                                {/* 🔹 Mirror extra tags from marks tab as chips – learner-facing */}
                                {renderSubjectExtraChips((s as any).extra)}
                              </div>
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {s.score}/{s.max_score}
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {typeof s.percent === 'number' ? `${Math.round(s.percent)}%` : '—'}{' '}
                              {s.grade ? `• ${s.grade}` : ''}
                            </td>
                            <td className="py-1 pr-0 text-right">
                              {s.classRank && s.classSize ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#e7edf4] dark:bg-[#111827] text-[9px] font-semibold">
                                  {formatRank(s.classRank)} / {s.classSize}
                                </span>
                              ) : (
                                <span className="text-[9px] text-[#9ca3af]">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <AiExtrasTable subjects={studentCard.subjects} />

                {/* Highlights + progress */}
                <div className="space-y-2.5">
                  <div className="rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard p-2.5">
                    <h3 className="text-[11px] font-semibold mb-1">Highlights</h3>
                    <ul className="space-y-0.5 text-[10px] text-[#111827] dark:text-darkTextPrimary">
                      {studentCard.computed?.bestSubject && (
                        <li>
                          <span className="font-semibold">Strength: </span>
                          {studentCard.computed.bestSubject} (
                          {studentCard.computed.bestPercent != null
                            ? `${Math.round(studentCard.computed.bestPercent)}%`
                            : '—'}
                          )
                        </li>
                      )}
                      {studentCard.computed?.weakestSubject && (
                        <li>
                          <span className="font-semibold">Focus area: </span>
                          {studentCard.computed.weakestSubject} (
                          {studentCard.computed.weakestPercent != null
                            ? `${Math.round(studentCard.computed.weakestPercent)}%`
                            : '—'}
                          )
                        </li>
                      )}
                      {studentCard.summary?.totalPercent != null &&
                        typeof studentCard.summary?.classRank === 'number' &&
                        typeof studentCard.summary?.classSize === 'number' && (
                          <li>
                            <span className="font-semibold">Overall: </span>
                            {studentCard.summary.totalPercent.toFixed(1)}% – position{' '}
                            {formatRank(studentCard.summary.classRank)} of{' '}
                            {studentCard.summary.classSize}
                          </li>
                        )}
                    </ul>
                  </div>

                  <div className="rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-[11px] font-semibold">Progress over time</h3>
                      <span className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                        % scores by term / exam
                      </span>
                    </div>
                    {(() => {
                      const series = buildProgressSeries(studentCard);
                      if (!series.length) {
                        return (
                          <div className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                            Historical data not available yet. Once previous exams are synced, this
                            chart will show your trend.
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-1.5">
                          {series.map((p, idx) => (
                            <div key={`${p.label}-${idx}`}>
                              <div className="flex items-center justify-between text-[10px] mb-0.5">
                                <span>{p.label}</span>
                                <span className="font-semibold">{p.percent.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-[#e5e7eb] dark:bg-[#111827] overflow-hidden">
                                <div
                                  className="h-2 rounded-full bg-[#3d99f5]"
                                  style={{
                                    width: `${Math.max(5, Math.min(100, p.percent))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {reportRemarks && (
                <div className="rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard p-2.5">
                  <h3 className="text-[11px] font-semibold mb-1">Teacher / principal remarks</h3>
                  <p className="text-[10px] leading-relaxed text-[#111827] dark:text-darkTextPrimary">
                    {reportRemarks}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 🧑‍🏫 Admin / teacher view
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Analytics card */}
      <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold">Subject analytics</h2>
            <p className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
              Distribution per subject for this exam, plus a downloadable class booklet.
            </p>
            <p className="mt-0.5 text-[10px] text-[#9ca3af] dark:text-darkTextSecondary">
              Class report includes: per-subject stats, full learner list with totals, grades,
              positions, and remarks – ready to share with parents.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              className="h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
              onClick={onRefreshAnalytics}
            >
              Refresh
            </button>
            <button
              className="h-9 px-3 rounded-xl bg-[#0f172a] text-white text-xs font-semibold shadow-md hover:bg-[#020617] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              onClick={onDownloadClassPdf}
              disabled={!canDownloadClass}
            >
              <span className="text-[13px]">📘</span>
              <span>Download class report</span>
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="text-left text-[#49739c] dark:text-darkTextSecondary">
              <tr>
                <th className="py-1 pr-3">Subject</th>
                <th className="py-1 pr-3">Scripts</th>
                <th className="py-1 pr-3">Avg %</th>
                <th className="py-1 pr-3">Min %</th>
                <th className="py-1 pr-3">Max %</th>
              </tr>
            </thead>
            <tbody>
              {analyticsLoading && (
                <tr>
                  <td colSpan={5} className="py-3 text-sm">
                    Loading analytics…
                  </td>
                </tr>
              )}
              {!analyticsLoading &&
                analytics.map((r: any, idx: number) => (
                  <tr key={idx} className="border-t border-[#e7edf4] dark:border-darkCard">
                    <td className="py-1 pr-3">{r.subject}</td>
                    <td className="py-1 pr-3">{r.scripts}</td>
                    <td className="py-1 pr-3">{r.avg_percent}</td>
                    <td className="py-1 pr-3">{r.min_percent}</td>
                    <td className="py-1 pr-3">{r.max_percent}</td>
                  </tr>
                ))}
              {!analyticsLoading && !analytics.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-3 text-xs text-[#49739c] dark:text-darkTextSecondary"
                  >
                    No analytics yet. Ensure there are marks for this exam.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report card preview */}
      <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold">Report card preview</h2>
            <p className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
              Select any learner in Marks view and click “Card” to preview a full modern report.
            </p>
          </div>
          {selectedStudentId && (
            <button
              className="h-8 px-3 rounded-xl bg-[#3d99f5] text-white text-[11px] font-semibold"
              onClick={onDownloadPdf}
            >
              Download PDF
            </button>
          )}
        </div>

        <div className="mt-3 flex-1 rounded-xl border border-[#e7edf4] dark:border-darkCard bg-slate-50 dark:bg-[#0b1420] p-3 text-[11px] sm:text-xs overflow-y-auto">
          {!studentCard && !studentCardText && (
            <div className="text-[#49739c] dark:text-darkTextSecondary">
              No report selected yet.
            </div>
          )}
          {!studentCard && studentCardText && (
            <pre className="whitespace-pre-wrap">{studentCardText}</pre>
          )}

          {studentCard && (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-[#49739c] dark:text-darkTextSecondary">
                    {org?.name || 'School'}
                  </div>
                  <div className="text-sm sm:text-base font-bold">
                    {studentCard.student?.name || 'Learner'}
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                    {studentCard.student?.admission_code && (
                      <span className="px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#111827] border border-[#e7edf4] dark:border-darkCard">
                        Adm: {studentCard.student.admission_code}
                      </span>
                    )}
                    {(classLabel || studentCard.student?.class_label) && (
                      <span className="px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#111827] border border-[#e7edf4] dark:border-darkCard">
                        Class: {classLabel || studentCard.student?.class_label}
                      </span>
                    )}
                    {selectedTerm && (
                      <span className="px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#111827] border border-[#e7edf4] dark:border-darkCard">
                        {selectedTerm.year} – {selectedTerm.label}
                      </span>
                    )}
                    {selectedSession && (
                      <span className="px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#111827] border border-[#e7edf4] dark:border-darkCard">
                        Exam: {selectedSession.label}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <div className="text-[10px] uppercase tracking-wide text-[#49739c] dark:text-darkTextSecondary">
                    Overall performance
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-extrabold">
                      {typeof studentCard.summary?.totalPercent === 'number'
                        ? `${studentCard.summary.totalPercent.toFixed(1)}%`
                        : '—'}
                    </span>
                    {studentCard.summary?.overallGrade && (
                      <span className="px-2 py-0.5 rounded-full bg-[#3d99f5] text-white text-[10px] font-semibold">
                        Grade {studentCard.summary.overallGrade}
                      </span>
                    )}
                  </div>
                  {studentCard.summary?.classRank && studentCard.summary?.classSize && (
                    <div className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                      Position{' '}
                      <span className="font-semibold">
                        {formatRank(studentCard.summary.classRank)}
                      </span>{' '}
                      out of {studentCard.summary.classSize}
                    </div>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="grid sm:grid-cols-2 gap-3">
                {/* Subjects */}
                <div className="rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-[11px] font-semibold">Subject breakdown</h3>
                    <span className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                      Score • Grade • Position
                    </span>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <thead className="text-[#49739c] dark:text-darkTextSecondary text-left">
                        <tr>
                          <th className="py-1 pr-2">Subject</th>
                          <th className="py-1 pr-2 text-right">Score</th>
                          <th className="py-1 pr-2 text-right">% / Grade</th>
                          <th className="py-1 pr-0 text-right">Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentCard.subjects.map((s: any, idx: number) => (
                          <tr
                            key={`${s.subject}-${idx}`}
                            className="border-t border-[#e7edf4] dark:border-darkCard"
                          >
                            <td className="py-1 pr-2 align-top">
                              <div className="flex flex-col">
                                <span className="font-medium">{s.subject || '—'}</span>
                                {/* 🔹 Show the same chips here so teachers see what learners see */}
                                {renderSubjectExtraChips((s as any).extra)}
                              </div>
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {s.score}/{s.max_score}
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {typeof s.percent === 'number' ? `${Math.round(s.percent)}%` : '—'}{' '}
                              {s.grade ? `• ${s.grade}` : ''}
                            </td>
                            <td className="py-1 pr-0 text-right">
                              {s.classRank && s.classSize ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#e7edf4] dark:bg-[#111827] text-[9px] font-semibold">
                                  {formatRank(s.classRank)} / {s.classSize}
                                </span>
                              ) : (
                                <span className="text-[9px] text-[#9ca3af]">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 🔮 AI extras table (admin view) */}
                <AiExtrasTable subjects={studentCard.subjects} />

                {/* Highlights + progress */}
                <div className="space-y-2.5">
                  <div className="rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard p-2.5">
                    <h3 className="text-[11px] font-semibold mb-1">Highlights</h3>
                    <ul className="space-y-0.5 text-[10px] text-[#111827] dark:text-darkTextPrimary">
                      {studentCard.computed?.bestSubject && (
                        <li>
                          <span className="font-semibold">Strength: </span>
                          {studentCard.computed.bestSubject} (
                          {studentCard.computed.bestPercent != null
                            ? `${Math.round(studentCard.computed.bestPercent)}%`
                            : '—'}
                          )
                        </li>
                      )}
                      {studentCard.computed?.weakestSubject && (
                        <li>
                          <span className="font-semibold">Focus area: </span>
                          {studentCard.computed.weakestSubject} (
                          {studentCard.computed.weakestPercent != null
                            ? `${Math.round(studentCard.computed.weakestPercent)}%`
                            : '—'}
                          )
                        </li>
                      )}
                      {studentCard.summary?.totalPercent != null &&
                        typeof studentCard.summary?.classRank === 'number' &&
                        typeof studentCard.summary?.classSize === 'number' && (
                          <li>
                            <span className="font-semibold">Overall: </span>
                            {studentCard.summary.totalPercent.toFixed(1)}% – position{' '}
                            {formatRank(studentCard.summary.classRank)} of{' '}
                            {studentCard.summary.classSize}
                          </li>
                        )}
                    </ul>
                  </div>

                  <div className="rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-[11px] font-semibold">Progress over time</h3>
                      <span className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                        % scores by term / exam
                      </span>
                    </div>
                    {(() => {
                      const series = buildProgressSeries(studentCard);
                      if (!series.length) {
                        return (
                          <div className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                            Historical data not available yet. Once previous exams are synced, this
                            chart will show the learner&apos;s trend.
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-1.5">
                          {series.map((p, idx) => (
                            <div key={`${p.label}-${idx}`}>
                              <div className="flex items-center justify-between text-[10px] mb-0.5">
                                <span>{p.label}</span>
                                <span className="font-semibold">{p.percent.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-[#e5e7eb] dark:bg-[#111827] overflow-hidden">
                                <div
                                  className="h-2 rounded-full bg-[#3d99f5]"
                                  style={{
                                    width: `${Math.max(5, Math.min(100, p.percent))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Attendance & behaviour */}
              <div className="rounded-lg bg-white dark:bg-[#020617] border-2 border-[#e7edf4] dark:border-darkCard p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[11px] font-semibold">Attendance &amp; behaviour</h3>
                  <span className="text-[9px] text-[#9ca3af]">Admin / instructor only</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[#6b7280]">Lessons attended</span>
                    <input
                      className="h-7 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[10px]"
                      value={attendanceForm.lessonsAttended ?? ''}
                      onChange={(e) =>
                        setAttendanceForm((prev: AttendanceFormState) => {
                          const next: AttendanceFormState = {
                            ...prev,
                            lessonsAttended: e.target.value,
                          };
                          const attended = Number(next.lessonsAttended);
                          const held = Number(next.lessonsHeld);
                          if (Number.isFinite(attended) && Number.isFinite(held) && held > 0) {
                            next.attendancePercent = ((attended / held) * 100).toFixed(1);
                          } else {
                            next.attendancePercent = '';
                          }
                          return next;
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[#6b7280]">Lessons held</span>
                    <input
                      className="h-7 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[10px]"
                      value={attendanceForm.lessonsHeld ?? ''}
                      onChange={(e) =>
                        setAttendanceForm((prev: AttendanceFormState) => {
                          const next: AttendanceFormState = {
                            ...prev,
                            lessonsHeld: e.target.value,
                          };
                          const attended = Number(next.lessonsAttended);
                          const held = Number(next.lessonsHeld);
                          if (Number.isFinite(attended) && Number.isFinite(held) && held > 0) {
                            next.attendancePercent = ((attended / held) * 100).toFixed(1);
                          } else {
                            next.attendancePercent = '';
                          }
                          return next;
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[#6b7280]">Attendance %</span>
                    <input
                      className="h-7 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[10px]"
                      value={attendanceForm.attendancePercent ?? ''}
                      readOnly
                    />
                  </label>

                  <label className="flex flex-col gap-0.5">
                    <span className="text-[#6b7280]">Behaviour (1–5)</span>
                    <input
                      className="h-7 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[10px]"
                      value={attendanceForm.behaviorRating ?? ''}
                      onChange={(e) =>
                        setAttendanceForm((prev: AttendanceFormState) => ({
                          ...prev,
                          behaviorRating: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[#6b7280]">Punctuality (1–5)</span>
                    <input
                      className="h-7 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[10px]"
                      value={attendanceForm.punctualityRating ?? ''}
                      onChange={(e) =>
                        setAttendanceForm((prev: AttendanceFormState) => ({
                          ...prev,
                          punctualityRating: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <label className="mt-2 flex flex-col gap-0.5 text-[10px]">
                  <span className="text-[#6b7280]">Teacher behaviour note</span>
                  <textarea
                    className="min-h-[40px] rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 py-1 text-[10px]"
                    value={attendanceForm.teacherComment ?? ''}
                    onChange={(e) =>
                      setAttendanceForm((prev: AttendanceFormState) => ({
                        ...prev,
                        teacherComment: e.target.value,
                      }))
                    }
                  />
                </label>

                {/* 🔮 AI controls for teacher note */}
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[9px]">
                  <div className="flex-1 space-y-1">
                    <p className="text-[#9ca3af] dark:text-slate-400">
                      Attendance % is calculated automatically from lessons attended vs held. Use
                      “Save attendance” to store it on the learner’s report card and PDF.
                    </p>
                    <input
                      type="text"
                      className="w-full sm:w-[260px] h-7 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[10px]"
                      placeholder='AI hint (optional)… e.g. "Highlight improved punctuality"'
                      value={teacherAiInstructions}
                      onChange={(e) => setTeacherAiInstructions(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-1 justify-end">
                    <button
                      type="button"
                      className="h-7 px-2 rounded-lg bg-[#e7edf4] dark:bg-[#172534] text-[10px] font-semibold"
                      onClick={() => onRegenerateTeacherComment?.(teacherAiInstructions)}
                      disabled={!selectedStudentId}
                    >
                      AI regenerate
                    </button>
                    <button
                      type="button"
                      className="h-7 px-2 rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard text-[10px] font-semibold"
                      onClick={onSaveAttendance}
                      disabled={!selectedStudentId || !selectedTerm}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="h-7 px-2 rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard text-[10px] font-semibold"
                      onClick={() =>
                        setAttendanceForm((prev: AttendanceFormState) => ({
                          ...prev,
                          teacherComment: '',
                        }))
                      }
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div className="rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard p-2.5 space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="text-[11px] font-semibold">Remarks</h3>
                    <p className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                      Auto-generated summary that the class teacher or principal can edit.
                    </p>
                    {/* 🔹 AI instructions input */}
                    <div className="mt-1">
                      <input
                        type="text"
                        className="w-full sm:w-[260px] h-7 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-[10px]"
                        placeholder='AI instructions (optional)… e.g. "Focus more on behaviour"'
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 justify-end">
                    <button
                      type="button"
                      className="h-7 px-2 rounded-lg bg-[#e7edf4] dark:bg-[#172534] text-[10px] font-semibold"
                      onClick={() => onRegenerateRemarks(aiInstructions)}
                      disabled={!selectedStudentId}
                    >
                      AI regenerate
                    </button>
                    <button
                      type="button"
                      className="h-7 px-2 rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard text-[10px] font-semibold"
                      onClick={onSaveRemarks}
                      disabled={!selectedStudentId}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="h-7 px-2 rounded-lg bg-white dark:bg-[#020617] border border-[#e7edf4] dark:border-darkCard text-[10px] font-semibold"
                      onClick={() => setReportRemarks('')}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <textarea
                  className="mt-2 w-full min-h-[80px] rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 py-1.5 text-[10px] leading-relaxed resize-vertical text-[#111827] dark:text-darkTextPrimary"
                  placeholder="Principal’s overall remark for this learner…"
                  value={reportRemarks ?? ''}
                  onChange={(e) => setReportRemarks(e.target.value)}
                />

                <div className="mt-2 grid sm:grid-cols-2 gap-2 text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                  <div>
                    Class teacher:&nbsp;
                    <span className="inline-block min-w-[120px] border-b border-dotted border-[#9ca3af]" />
                  </div>
                  <div>
                    Head teacher / Principal:&nbsp;
                    <span className="inline-block min-w-[120px] border-b border-dotted border-[#9ca3af]" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrgExamReportsTab;

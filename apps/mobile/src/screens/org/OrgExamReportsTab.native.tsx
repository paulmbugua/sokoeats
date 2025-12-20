import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import tw from '../../../tailwind';
import type { OrgResp as Org } from '@mytutorapp/shared/api/orgApi';
import type { OrgExamTerm, OrgExamSession } from '@mytutorapp/shared/types';

const formatRank = (n: number | null | undefined): string => {
  if (!n || !Number.isFinite(n)) return '';
  return String(n); // 1, 2, 3…
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
    <View style={tw`mt-1 flex-row flex-wrap gap-1.5`}>
      {entries.map(([key, value]) => (
        <View
          key={key as string}
          style={tw`flex-row items-center rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5`}
        >
          <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100 font-semibold mr-1`}>
            {key}:
          </Text>
          <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100 opacity-90`}>
            {String(value)}
          </Text>
        </View>
      ))}
    </View>
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
  const matrix = useMemo(() => buildAiExtrasMatrix(subjects), [subjects]);

  if (!matrix) return null;

  const { extraKeys, rows } = matrix;

  return (
    <View
      style={tw`mt-2.5 rounded-lg border border-dashed border-indigo-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2.5`}
    >
      <View style={tw`flex-row items-center justify-between mb-1.5`}>
        <View style={tw`flex-1 pr-2`}>
          <Text style={tw`text-[11px] font-semibold text-slate-900 dark:text-slate-100`}>
            AI-assisted extra columns
          </Text>
          <Text style={tw`text-[9px] text-slate-500 dark:text-slate-400`}>
            A compact view of AI-generated fields such as Effort, Homework, or Next step – kept
            separate from teacher remarks.
          </Text>
        </View>
        <View style={tw`hidden sm:flex px-2 py-0.5 rounded-full bg-blue-500/10`}>
          <Text style={tw`text-[9px] uppercase tracking-wide text-blue-700 dark:text-blue-200`}>
            AI enrichment
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header row */}
          <View style={tw`flex-row border-b border-slate-200 dark:border-slate-800`}>
            <View style={tw`py-1 pr-2 min-w-[90px]`}>
              <Text style={tw`text-[9px] text-slate-600 dark:text-slate-300`}>Subject</Text>
            </View>
            {extraKeys.map((key) => (
              <View key={key} style={tw`py-1 px-2 min-w-[80px]`}>
                <Text style={tw`text-[9px] text-slate-600 dark:text-slate-300`}>{key}</Text>
              </View>
            ))}
          </View>

          {/* Body rows */}
          {rows.map((row, idx) => (
            <View
              key={`${row.subject}-${idx}`}
              style={tw`flex-row border-t border-slate-200 dark:border-slate-800`}
            >
              <View style={tw`py-1 pr-2 min-w-[90px]`}>
                <Text style={tw`text-[9px] font-medium text-slate-900 dark:text-slate-100`}>
                  {row.subject}
                </Text>
              </View>
              {row.cells.map((cell, i) => (
                <View key={i} style={tw`py-1 px-2 min-w-[80px]`}>
                  <Text style={tw`text-[9px] text-slate-800 dark:text-slate-200`}>{cell}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={tw`mt-1.5 text-[9px] text-slate-400 dark:text-slate-500`}>
        Note: This table reflects <Text style={tw`font-semibold`}>AI-driven column changes</Text>{' '}
        (Effort, targets, homework, etc.). The main subject remarks column on the report card
        remains reserved for <Text style={tw`font-semibold`}>teacher comments</Text>.
      </Text>
    </View>
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
  onSaveAttendance: () => void;
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
  const [aiInstructions, setAiInstructions] = useState('');
  const [teacherAiInstructions, setTeacherAiInstructions] = useState('');

  const headerPill = (label: string) => (
    <View
      style={tw`px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 mr-1 mb-1`}
    >
      <Text style={tw`text-[10px] text-slate-700 dark:text-slate-200`}>{label}</Text>
    </View>
  );

  const cardShell = tw`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3`;

  const subjectTableHeaderCell = tw`py-1 pr-2 min-w-[80px]`;
  const subjectTableCell = tw`py-1 pr-2 min-w-[80px]`;

  // ─────────────────────────────────────────────────────
  // Learner view
  // ─────────────────────────────────────────────────────
  if (isLearnerView) {
    return (
      <View
        style={tw`max-w-full self-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3`}
      >
        <View style={tw`flex-row items-center justify-between mb-2`}>
          <View style={tw`flex-1 pr-2`}>
            <Text style={tw`text-sm font-bold text-slate-900 dark:text-slate-50`}>
              My report card
            </Text>
            <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>
              This view shows only your own exam results and a downloadable PDF.
            </Text>
          </View>
          {selectedStudentId && (
            <TouchableOpacity
              style={tw`h-8 px-3 rounded-xl bg-sky-500 items-center justify-center`}
              onPress={onDownloadPdf}
            >
              <Text style={tw`text-[11px] text-white font-semibold`}>Download PDF</Text>
            </TouchableOpacity>
          )}
        </View>

        <View
          style={tw`mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3`}
        >
          {!studentCard && !studentCardText && (
            <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>
              Your report card will appear here once your school publishes marks for this exam, or
              once you choose a term and exam above.
            </Text>
          )}

          {!studentCard && studentCardText && (
            <ScrollView>
              <Text style={tw`text-[11px] text-slate-100`}>{studentCardText}</Text>
            </ScrollView>
          )}

          {studentCard && (
            <ScrollView style={tw`max-h-[520px]`} showsVerticalScrollIndicator>
              <View style={tw`space-y-3`}>
                {/* Header */}
                <View style={tw`flex-row flex-wrap items-start justify-between gap-y-3`}>
                  <View style={tw`flex-1 pr-2`}>
                    <Text
                      style={tw`text-[12px] font-semibold uppercase tracking-wide text-sky-700 dark:text-slate-300`}
                    >
                      {org?.name || 'School'}
                    </Text>
                    <Text style={tw`text-base font-bold text-slate-900 dark:text-slate-50`}>
                      {studentCard.student?.name || 'Learner'}
                    </Text>
                    <View style={tw`flex-row flex-wrap mt-1`}>
                      {studentCard.student?.admission_code &&
                        headerPill(`Adm: ${studentCard.student.admission_code}`)}
                      {(classLabel || studentCard.student?.class_label) &&
                        headerPill(`Class: ${classLabel || studentCard.student?.class_label}`)}
                      {selectedTerm && headerPill(`${selectedTerm.year} – ${selectedTerm.label}`)}
                      {selectedSession && headerPill(`Exam: ${selectedSession.label}`)}
                    </View>
                  </View>

                  <View style={tw`items-end gap-1`}>
                    <Text
                      style={tw`text-[10px] uppercase tracking-wide text-sky-700 dark:text-slate-300`}
                    >
                      Overall performance
                    </Text>
                    <View style={tw`flex-row items-baseline gap-2`}>
                      <Text style={tw`text-xl font-extrabold text-slate-900 dark:text-slate-50`}>
                        {typeof studentCard.summary?.totalPercent === 'number'
                          ? `${studentCard.summary.totalPercent.toFixed(1)}%`
                          : '—'}
                      </Text>
                      {studentCard.summary?.overallGrade && (
                        <View
                          style={tw`px-2 py-0.5 rounded-full bg-sky-500 items-center justify-center`}
                        >
                          <Text style={tw`text-[10px] text-white font-semibold`}>
                            Grade {studentCard.summary.overallGrade}
                          </Text>
                        </View>
                      )}
                    </View>
                    {studentCard.summary?.classRank && studentCard.summary?.classSize && (
                      <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                        Position{' '}
                        <Text style={tw`font-semibold`}>
                          {formatRank(studentCard.summary.classRank)}
                        </Text>{' '}
                        out of {studentCard.summary.classSize}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Body */}
                <View style={tw`flex-col sm:flex-row sm:flex-wrap gap-3`}>
                  {/* Subjects */}
                  <View style={cardShell}>
                    <View style={tw`flex-row items-center justify-between mb-1`}>
                      <Text style={tw`text-[11px] font-semibold text-slate-900 dark:text-slate-50`}>
                        Subject breakdown
                      </Text>
                      <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                        Score • Grade • Position
                      </Text>
                    </View>

                    <ScrollView style={tw`max-h-[220px]`} nestedScrollEnabled>
                      <ScrollView horizontal showsHorizontalScrollIndicator>
                        <View>
                          {/* Header row */}
                          <View
                            style={tw`flex-row border-b border-slate-200 dark:border-slate-800`}
                          >
                            <View style={[subjectTableHeaderCell, tw`min-w-[120px]`]}>
                              <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                                Subject
                              </Text>
                            </View>
                            <View style={[subjectTableHeaderCell, tw`items-end`]}>
                              <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                                Score
                              </Text>
                            </View>
                            <View style={[subjectTableHeaderCell, tw`items-end`]}>
                              <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                                % / Grade
                              </Text>
                            </View>
                            <View style={[subjectTableHeaderCell, tw`items-end`]}>
                              <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                                Pos.
                              </Text>
                            </View>
                          </View>

                          {/* Body */}
                          {studentCard.subjects.map((s: any, idx: number) => (
                            <View
                              key={`${s.subject}-${idx}`}
                              style={tw`flex-row border-t border-slate-200 dark:border-slate-800`}
                            >
                              <View style={[subjectTableCell, tw`min-w-[120px]`]}>
                                <View style={tw`flex-col`}>
                                  <Text
                                    style={tw`text-[10px] font-medium text-slate-900 dark:text-slate-50`}
                                  >
                                    {s.subject || '—'}
                                  </Text>
                                  {renderSubjectExtraChips((s as any).extra)}
                                </View>
                              </View>
                              <View style={subjectTableCell}>
                                <Text
                                  style={tw`text-[10px] text-right text-slate-800 dark:text-slate-100`}
                                >
                                  {s.score}/{s.max_score}
                                </Text>
                              </View>
                              <View style={subjectTableCell}>
                                <Text
                                  style={tw`text-[10px] text-right text-slate-800 dark:text-slate-100`}
                                >
                                  {typeof s.percent === 'number'
                                    ? `${Math.round(s.percent)}%`
                                    : '—'}{' '}
                                  {s.grade ? `• ${s.grade}` : ''}
                                </Text>
                              </View>
                              <View style={subjectTableCell}>
                                {s.classRank && s.classSize ? (
                                  <View
                                    style={tw`self-end px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800`}
                                  >
                                    <Text
                                      style={tw`text-[9px] font-semibold text-slate-900 dark:text-slate-50`}
                                    >
                                      {formatRank(s.classRank)} / {s.classSize}
                                    </Text>
                                  </View>
                                ) : (
                                  <Text style={tw`text-[9px] text-right text-slate-400`}>—</Text>
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </ScrollView>
                  </View>

                  <AiExtrasTable subjects={studentCard.subjects} />

                  {/* Highlights + progress */}
                  <View style={tw`flex-1 gap-2.5`}>
                    <View style={cardShell}>
                      <Text
                        style={tw`text-[11px] font-semibold mb-1 text-slate-900 dark:text-slate-50`}
                      >
                        Highlights
                      </Text>
                      <View style={tw`space-y-0.5`}>
                        {studentCard.computed?.bestSubject && (
                          <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100`}>
                            <Text style={tw`font-semibold`}>Strength: </Text>
                            {studentCard.computed.bestSubject} (
                            {studentCard.computed.bestPercent != null
                              ? `${Math.round(studentCard.computed.bestPercent)}%`
                              : '—'}
                            )
                          </Text>
                        )}
                        {studentCard.computed?.weakestSubject && (
                          <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100`}>
                            <Text style={tw`font-semibold`}>Focus area: </Text>
                            {studentCard.computed.weakestSubject} (
                            {studentCard.computed.weakestPercent != null
                              ? `${Math.round(studentCard.computed.weakestPercent)}%`
                              : '—'}
                            )
                          </Text>
                        )}
                        {studentCard.summary?.totalPercent != null &&
                          typeof studentCard.summary?.classRank === 'number' &&
                          typeof studentCard.summary?.classSize === 'number' && (
                            <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100`}>
                              <Text style={tw`font-semibold`}>Overall: </Text>
                              {studentCard.summary.totalPercent.toFixed(1)}% – position{' '}
                              {formatRank(studentCard.summary.classRank)} of{' '}
                              {studentCard.summary.classSize}
                            </Text>
                          )}
                      </View>
                    </View>

                    <View style={cardShell}>
                      <View style={tw`flex-row items-center justify-between mb-1`}>
                        <Text
                          style={tw`text-[11px] font-semibold text-slate-900 dark:text-slate-50`}
                        >
                          Progress over time
                        </Text>
                        <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                          % scores by term / exam
                        </Text>
                      </View>
                      {(() => {
                        const series = buildProgressSeries(studentCard);
                        if (!series.length) {
                          return (
                            <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                              Historical data not available yet. Once previous exams are synced,
                              this chart will show your trend.
                            </Text>
                          );
                        }
                        return (
                          <View style={tw`space-y-1.5`}>
                            {series.map((p, idx) => (
                              <View key={`${p.label}-${idx}`}>
                                <View style={tw`flex-row items-center justify-between mb-0.5`}>
                                  <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100`}>
                                    {p.label}
                                  </Text>
                                  <Text
                                    style={tw`text-[10px] font-semibold text-slate-900 dark:text-slate-100`}
                                  >
                                    {p.percent.toFixed(1)}%
                                  </Text>
                                </View>
                                <View
                                  style={tw`h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden`}
                                >
                                  <View
                                    style={[
                                      tw`h-2 rounded-full bg-sky-500`,
                                      {
                                        width: `${Math.max(5, Math.min(100, p.percent))}%`,
                                      },
                                    ]}
                                  />
                                </View>
                              </View>
                            ))}
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                </View>

                {reportRemarks && (
                  <View style={cardShell}>
                    <Text
                      style={tw`text-[11px] font-semibold mb-1 text-slate-900 dark:text-slate-50`}
                    >
                      Teacher / principal remarks
                    </Text>
                    <Text
                      style={tw`text-[10px] leading-relaxed text-slate-900 dark:text-slate-100`}
                    >
                      {reportRemarks}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────
  // Admin / teacher view
  // ─────────────────────────────────────────────────────
  return (
    <View style={tw`flex-col md:flex-row md:flex-wrap gap-4`}>
      {/* Analytics card */}
      <View style={cardShell}>
        <View style={tw`flex-col gap-2 mb-2`}>
          <View>
            <Text style={tw`text-sm font-bold text-slate-900 dark:text-slate-50`}>
              Subject analytics
            </Text>
            <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>
              Distribution per subject for this exam, plus a downloadable class booklet.
            </Text>
            <Text style={tw`mt-0.5 text-[10px] text-slate-400 dark:text-slate-300`}>
              Class report includes: per-subject stats, full learner list with totals, grades,
              positions, and remarks – ready to share with parents.
            </Text>
          </View>
          <View style={tw`flex-row flex-wrap gap-2 justify-end`}>
            <TouchableOpacity
              style={tw`h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center`}
              onPress={onRefreshAnalytics}
            >
              <Text style={tw`text-xs font-semibold text-slate-900 dark:text-slate-50`}>
                Refresh
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`h-9 px-3 rounded-xl bg-slate-900 items-center justify-center ${
                !canDownloadClass ? 'opacity-40' : ''
              }`}
              onPress={onDownloadClassPdf}
              disabled={!canDownloadClass}
            >
              <Text style={tw`text-xs font-semibold text-white`}>📘 Download class report</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={tw`flex-row border-b border-slate-200 dark:border-slate-800`}>
              <View style={tw`py-1 pr-3 min-w-[120px]`}>
                <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>Subject</Text>
              </View>
              <View style={tw`py-1 pr-3 min-w-[60px]`}>
                <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>Scripts</Text>
              </View>
              <View style={tw`py-1 pr-3 min-w-[60px]`}>
                <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>Avg %</Text>
              </View>
              <View style={tw`py-1 pr-3 min-w-[60px]`}>
                <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>Min %</Text>
              </View>
              <View style={tw`py-1 pr-3 min-w-[60px]`}>
                <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>Max %</Text>
              </View>
            </View>

            {analyticsLoading && (
              <View style={tw`py-3`}>
                <Text style={tw`text-sm text-slate-100`}>Loading analytics…</Text>
              </View>
            )}

            {!analyticsLoading &&
              analytics.map((r: any, idx: number) => (
                <View
                  key={idx}
                  style={tw`flex-row border-t border-slate-200 dark:border-slate-800`}
                >
                  <View style={tw`py-1 pr-3 min-w-[120px]`}>
                    <Text style={tw`text-xs text-slate-900 dark:text-slate-100`}>{r.subject}</Text>
                  </View>
                  <View style={tw`py-1 pr-3 min-w-[60px]`}>
                    <Text style={tw`text-xs text-slate-900 dark:text-slate-100`}>{r.scripts}</Text>
                  </View>
                  <View style={tw`py-1 pr-3 min-w-[60px]`}>
                    <Text style={tw`text-xs text-slate-900 dark:text-slate-100`}>
                      {r.avg_percent}
                    </Text>
                  </View>
                  <View style={tw`py-1 pr-3 min-w-[60px]`}>
                    <Text style={tw`text-xs text-slate-900 dark:text-slate-100`}>
                      {r.min_percent}
                    </Text>
                  </View>
                  <View style={tw`py-1 pr-3 min-w-[60px]`}>
                    <Text style={tw`text-xs text-slate-900 dark:text-slate-100`}>
                      {r.max_percent}
                    </Text>
                  </View>
                </View>
              ))}

            {!analyticsLoading && !analytics.length && (
              <View style={tw`py-3`}>
                <Text style={tw`text-xs text-sky-700 dark:text-slate-300`}>
                  No analytics yet. Ensure there are marks for this exam.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Report card preview + attendance + remarks */}
      <View style={[cardShell, tw`flex-1`]}>
        {/* Header */}
        <View style={tw`flex-row items-center justify-between mb-2`}>
          <View style={tw`flex-1 pr-2`}>
            <Text style={tw`text-sm font-bold text-slate-900 dark:text-slate-50`}>
              Report card preview
            </Text>
            <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>
              Select any learner in Marks view and tap “Card” to preview a full modern report.
            </Text>
          </View>
          {selectedStudentId && (
            <TouchableOpacity
              style={tw`h-8 px-3 rounded-xl bg-sky-500 items-center justify-center`}
              onPress={onDownloadPdf}
            >
              <Text style={tw`text-[11px] text-white font-semibold`}>Download PDF</Text>
            </TouchableOpacity>
          )}
        </View>

        <View
          style={tw`mt-3 flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3`}
        >
          {!studentCard && !studentCardText && (
            <Text style={tw`text-[11px] text-sky-700 dark:text-slate-300`}>
              No report selected yet.
            </Text>
          )}
          {!studentCard && studentCardText && (
            <ScrollView>
              <Text style={tw`text-[11px] text-slate-100`}>{studentCardText}</Text>
            </ScrollView>
          )}

          {studentCard && (
            <ScrollView showsVerticalScrollIndicator>
              <View style={tw`space-y-3`}>
                {/* Header */}
                <View style={tw`flex-row flex-wrap items-start justify-between gap-y-3`}>
                  <View style={tw`flex-1 pr-2`}>
                    <Text
                      style={tw`text-[12px] font-semibold uppercase tracking-wide text-sky-700 dark:text-slate-300`}
                    >
                      {org?.name || 'School'}
                    </Text>
                    <Text style={tw`text-base font-bold text-slate-900 dark:text-slate-50`}>
                      {studentCard.student?.name || 'Learner'}
                    </Text>
                    <View style={tw`flex-row flex-wrap mt-1`}>
                      {studentCard.student?.admission_code &&
                        headerPill(`Adm: ${studentCard.student.admission_code}`)}
                      {(classLabel || studentCard.student?.class_label) &&
                        headerPill(`Class: ${classLabel || studentCard.student?.class_label}`)}
                      {selectedTerm && headerPill(`${selectedTerm.year} – ${selectedTerm.label}`)}
                      {selectedSession && headerPill(`Exam: ${selectedSession.label}`)}
                    </View>
                  </View>

                  <View style={tw`items-end gap-1`}>
                    <Text
                      style={tw`text-[10px] uppercase tracking-wide text-sky-700 dark:text-slate-300`}
                    >
                      Overall performance
                    </Text>
                    <View style={tw`flex-row items-baseline gap-2`}>
                      <Text style={tw`text-xl font-extrabold text-slate-900 dark:text-slate-50`}>
                        {typeof studentCard.summary?.totalPercent === 'number'
                          ? `${studentCard.summary.totalPercent.toFixed(1)}%`
                          : '—'}
                      </Text>
                      {studentCard.summary?.overallGrade && (
                        <View
                          style={tw`px-2 py-0.5 rounded-full bg-sky-500 items-center justify-center`}
                        >
                          <Text style={tw`text-[10px] text-white font-semibold`}>
                            Grade {studentCard.summary.overallGrade}
                          </Text>
                        </View>
                      )}
                    </View>
                    {studentCard.summary?.classRank && studentCard.summary?.classSize && (
                      <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                        Position{' '}
                        <Text style={tw`font-semibold`}>
                          {formatRank(studentCard.summary.classRank)}
                        </Text>{' '}
                        out of {studentCard.summary.classSize}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Body */}
                <View style={tw`flex-col gap-3`}>
                  {/* Subjects + AI extras + highlights */}
                  <View style={tw`flex-col md:flex-row md:flex-wrap gap-3`}>
                    {/* Subjects */}
                    <View style={cardShell}>
                      <View style={tw`flex-row items-center justify-between mb-1`}>
                        <Text
                          style={tw`text-[11px] font-semibold text-slate-900 dark:text-slate-50`}
                        >
                          Subject breakdown
                        </Text>
                        <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                          Score • Grade • Position
                        </Text>
                      </View>

                      <ScrollView style={tw`max-h-[220px]`} nestedScrollEnabled>
                        <ScrollView horizontal>
                          <View>
                            <View
                              style={tw`flex-row border-b border-slate-200 dark:border-slate-800`}
                            >
                              <View style={[subjectTableHeaderCell, tw`min-w-[120px]`]}>
                                <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                                  Subject
                                </Text>
                              </View>
                              <View style={subjectTableHeaderCell}>
                                <Text
                                  style={tw`text-[10px] text-right text-sky-700 dark:text-slate-300`}
                                >
                                  Score
                                </Text>
                              </View>
                              <View style={subjectTableHeaderCell}>
                                <Text
                                  style={tw`text-[10px] text-right text-sky-700 dark:text-slate-300`}
                                >
                                  % / Grade
                                </Text>
                              </View>
                              <View style={subjectTableHeaderCell}>
                                <Text
                                  style={tw`text-[10px] text-right text-sky-700 dark:text-slate-300`}
                                >
                                  Pos.
                                </Text>
                              </View>
                            </View>

                            {studentCard.subjects.map((s: any, idx: number) => (
                              <View
                                key={`${s.subject}-${idx}`}
                                style={tw`flex-row border-t border-slate-200 dark:border-slate-800`}
                              >
                                <View style={[subjectTableCell, tw`min-w-[120px]`]}>
                                  <View style={tw`flex-col`}>
                                    <Text
                                      style={tw`text-[10px] font-medium text-slate-900 dark:text-slate-50`}
                                    >
                                      {s.subject || '—'}
                                    </Text>
                                    {renderSubjectExtraChips((s as any).extra)}
                                  </View>
                                </View>
                                <View style={subjectTableCell}>
                                  <Text
                                    style={tw`text-[10px] text-right text-slate-900 dark:text-slate-100`}
                                  >
                                    {s.score}/{s.max_score}
                                  </Text>
                                </View>
                                <View style={subjectTableCell}>
                                  <Text
                                    style={tw`text-[10px] text-right text-slate-900 dark:text-slate-100`}
                                  >
                                    {typeof s.percent === 'number'
                                      ? `${Math.round(s.percent)}%`
                                      : '—'}{' '}
                                    {s.grade ? `• ${s.grade}` : ''}
                                  </Text>
                                </View>
                                <View style={subjectTableCell}>
                                  {s.classRank && s.classSize ? (
                                    <View
                                      style={tw`self-end px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800`}
                                    >
                                      <Text
                                        style={tw`text-[9px] font-semibold text-slate-900 dark:text-slate-50`}
                                      >
                                        {formatRank(s.classRank)} / {s.classSize}
                                      </Text>
                                    </View>
                                  ) : (
                                    <Text style={tw`text-[9px] text-right text-slate-400`}>—</Text>
                                  )}
                                </View>
                              </View>
                            ))}
                          </View>
                        </ScrollView>
                      </ScrollView>
                    </View>

                    <AiExtrasTable subjects={studentCard.subjects} />

                    {/* Highlights + progress */}
                    <View style={tw`flex-1 gap-2.5`}>
                      <View style={cardShell}>
                        <Text
                          style={tw`text-[11px] font-semibold mb-1 text-slate-900 dark:text-slate-50`}
                        >
                          Highlights
                        </Text>
                        <View style={tw`space-y-0.5`}>
                          {studentCard.computed?.bestSubject && (
                            <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100`}>
                              <Text style={tw`font-semibold`}>Strength: </Text>
                              {studentCard.computed.bestSubject} (
                              {studentCard.computed.bestPercent != null
                                ? `${Math.round(studentCard.computed.bestPercent)}%`
                                : '—'}
                              )
                            </Text>
                          )}
                          {studentCard.computed?.weakestSubject && (
                            <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100`}>
                              <Text style={tw`font-semibold`}>Focus area: </Text>
                              {studentCard.computed.weakestSubject} (
                              {studentCard.computed.weakestPercent != null
                                ? `${Math.round(studentCard.computed.weakestPercent)}%`
                                : '—'}
                              )
                            </Text>
                          )}
                          {studentCard.summary?.totalPercent != null &&
                            typeof studentCard.summary?.classRank === 'number' &&
                            typeof studentCard.summary?.classSize === 'number' && (
                              <Text style={tw`text-[10px] text-slate-900 dark:text-slate-100`}>
                                <Text style={tw`font-semibold`}>Overall: </Text>
                                {studentCard.summary.totalPercent.toFixed(1)}% – position{' '}
                                {formatRank(studentCard.summary.classRank)} of{' '}
                                {studentCard.summary.classSize}
                              </Text>
                            )}
                        </View>
                      </View>

                      <View style={cardShell}>
                        <View style={tw`flex-row items-center justify-between mb-1`}>
                          <Text
                            style={tw`text-[11px] font-semibold text-slate-900 dark:text-slate-50`}
                          >
                            Progress over time
                          </Text>
                          <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                            % scores by term / exam
                          </Text>
                        </View>
                        {(() => {
                          const series = buildProgressSeries(studentCard);
                          if (!series.length) {
                            return (
                              <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                                Historical data not available yet. Once previous exams are synced,
                                this chart will show the learner&apos;s trend.
                              </Text>
                            );
                          }
                          return (
                            <View style={tw`space-y-1.5`}>
                              {series.map((p, idx) => (
                                <View key={`${p.label}-${idx}`}>
                                  <View style={tw`flex-row items-center justify-between mb-0.5`}>
                                    <Text
                                      style={tw`text-[10px] text-slate-900 dark:text-slate-100`}
                                    >
                                      {p.label}
                                    </Text>
                                    <Text
                                      style={tw`text-[10px] font-semibold text-slate-900 dark:text-slate-100`}
                                    >
                                      {p.percent.toFixed(1)}%
                                    </Text>
                                  </View>
                                  <View
                                    style={tw`h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden`}
                                  >
                                    <View
                                      style={[
                                        tw`h-2 rounded-full bg-sky-500`,
                                        {
                                          width: `${Math.max(5, Math.min(100, p.percent))}%`,
                                        },
                                      ]}
                                    />
                                  </View>
                                </View>
                              ))}
                            </View>
                          );
                        })()}
                      </View>
                    </View>
                  </View>

                  {/* Attendance & behaviour */}
                  <View style={[cardShell, tw`border-2 border-slate-200 dark:border-slate-800`]}>
                    <View style={tw`flex-row items-center justify-between mb-1`}>
                      <Text style={tw`text-[11px] font-semibold text-slate-900 dark:text-slate-50`}>
                        Attendance & behaviour
                      </Text>
                      <Text style={tw`text-[9px] text-slate-400`}>Admin / instructor only</Text>
                    </View>

                    <View style={tw`flex-row flex-wrap gap-2 text-[10px]`}>
                      <View style={tw`flex-1 min-w-[120px]`}>
                        <Text style={tw`text-slate-500`}>Lessons attended</Text>
                        <TextInput
                          style={tw`mt-0.5 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-900 dark:text-slate-100`}
                          value={attendanceForm.lessonsAttended ?? ''}
                          onChangeText={(value) =>
                            setAttendanceForm((prev: AttendanceFormState) => {
                              const next: AttendanceFormState = {
                                ...prev,
                                lessonsAttended: value,
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
                      </View>

                      <View style={tw`flex-1 min-w-[120px]`}>
                        <Text style={tw`text-slate-500`}>Lessons held</Text>
                        <TextInput
                          style={tw`mt-0.5 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-900 dark:text-slate-100`}
                          value={attendanceForm.lessonsHeld ?? ''}
                          onChangeText={(value) =>
                            setAttendanceForm((prev: AttendanceFormState) => {
                              const next: AttendanceFormState = {
                                ...prev,
                                lessonsHeld: value,
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
                      </View>

                      <View style={tw`flex-1 min-w-[120px]`}>
                        <Text style={tw`text-slate-500`}>Attendance %</Text>
                        <TextInput
                          style={tw`mt-0.5 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-900 dark:text-slate-100`}
                          value={attendanceForm.attendancePercent ?? ''}
                          editable={false}
                        />
                      </View>

                      <View style={tw`flex-1 min-w-[120px]`}>
                        <Text style={tw`text-slate-500`}>Behaviour (1–5)</Text>
                        <TextInput
                          style={tw`mt-0.5 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-900 dark:text-slate-100`}
                          value={attendanceForm.behaviorRating ?? ''}
                          onChangeText={(value) =>
                            setAttendanceForm((prev: AttendanceFormState) => ({
                              ...prev,
                              behaviorRating: value,
                            }))
                          }
                        />
                      </View>

                      <View style={tw`flex-1 min-w-[120px]`}>
                        <Text style={tw`text-slate-500`}>Punctuality (1–5)</Text>
                        <TextInput
                          style={tw`mt-0.5 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-900 dark:text-slate-100`}
                          onChangeText={(value) =>
                            setAttendanceForm((prev: AttendanceFormState) => ({
                              ...prev,
                              punctualityRating: value,
                            }))
                          }
                        />
                      </View>
                    </View>

                    <View style={tw`mt-2`}>
                      <Text style={tw`text-[10px] text-slate-500`}>Teacher behaviour note</Text>
                      <TextInput
                        multiline
                        style={tw`mt-0.5 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-900 dark:text-slate-100`}
                        value={attendanceForm.teacherComment ?? ''}
                        onChangeText={(value) =>
                          setAttendanceForm((prev: AttendanceFormState) => ({
                            ...prev,
                            teacherComment: value,
                          }))
                        }
                      />
                    </View>

                    {/* AI controls for teacher note */}
                    <View
                      style={tw`mt-2 flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}
                    >
                      <View style={tw`flex-1`}>
                        <Text style={tw`text-[9px] text-slate-400 dark:text-slate-400`}>
                          Attendance % is calculated automatically from lessons attended vs held.
                          Use “Save attendance” to store it on the learner’s report card and PDF.
                        </Text>
                        <TextInput
                          style={tw`mt-1 w-full sm:w-[260px] h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-900 dark:text-slate-100`}
                          placeholderTextColor="#64748b"
                          value={teacherAiInstructions}
                          onChangeText={setTeacherAiInstructions}
                        />
                      </View>

                      <View style={tw`flex-row flex-wrap gap-1 justify-end`}>
                        <TouchableOpacity
                          style={tw`h-7 px-2 rounded-lg bg-slate-200 dark:bg-slate-800 items-center justify-center`}
                          onPress={() => onRegenerateTeacherComment?.(teacherAiInstructions)}
                          disabled={!selectedStudentId}
                        >
                          <Text
                            style={tw`text-[10px] font-semibold text-slate-900 dark:text-slate-50`}
                          >
                            AI regenerate
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`h-7 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 items-center justify-center`}
                          onPress={onSaveAttendance}
                          disabled={!selectedStudentId || !selectedTerm}
                        >
                          <Text
                            style={tw`text-[10px] font-semibold text-slate-900 dark:text-slate-50`}
                          >
                            Save
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`h-7 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 items-center justify-center`}
                          onPress={() =>
                            setAttendanceForm((prev: AttendanceFormState) => ({
                              ...prev,
                              teacherComment: '',
                            }))
                          }
                        >
                          <Text
                            style={tw`text-[10px] font-semibold text-slate-900 dark:text-slate-50`}
                          >
                            Clear
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Remarks */}
                  <View style={cardShell}>
                    <View style={tw`flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
                      <View style={tw`flex-1`}>
                        <Text
                          style={tw`text-[11px] font-semibold text-slate-900 dark:text-slate-50`}
                        >
                          Remarks
                        </Text>
                        <Text style={tw`text-[10px] text-sky-700 dark:text-slate-300`}>
                          Auto-generated summary that the class teacher or principal can edit.
                        </Text>
                        <TextInput
                          style={tw`mt-1 w-full sm:w-[260px] h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-900 dark:text-slate-100`}
                          placeholder='AI instructions (optional)… e.g. "Focus more on behaviour"'
                          placeholderTextColor="#64748b"
                          value={aiInstructions}
                          onChangeText={setAiInstructions}
                        />
                      </View>

                      <View style={tw`flex-row flex-wrap gap-1 justify-end`}>
                        <TouchableOpacity
                          style={tw`h-7 px-2 rounded-lg bg-slate-200 dark:bg-slate-800 items-center justify-center`}
                          onPress={() => onRegenerateRemarks(aiInstructions)}
                          disabled={!selectedStudentId}
                        >
                          <Text
                            style={tw`text-[10px] font-semibold text-slate-900 dark:text-slate-50`}
                          >
                            AI regenerate
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`h-7 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 items-center justify-center`}
                          onPress={onSaveRemarks}
                          disabled={!selectedStudentId}
                        >
                          <Text
                            style={tw`text-[10px] font-semibold text-slate-900 dark:text-slate-50`}
                          >
                            Save
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`h-7 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 items-center justify-center`}
                          onPress={() => setReportRemarks('')}
                        >
                          <Text
                            style={tw`text-[10px] font-semibold text-slate-900 dark:text-slate-50`}
                          >
                            Clear
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <TextInput
                      multiline
                      style={tw`mt-2 w-full min-h-[80px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[10px] text-slate-900 dark:text-slate-100`}
                      placeholder="Principal’s overall remark for this learner…"
                      placeholderTextColor="#64748b"
                      value={reportRemarks ?? ''}
                      onChangeText={setReportRemarks}
                    />

                    <View
                      style={tw`mt-2 flex-row flex-wrap gap-2 text-[10px] text-sky-700 dark:text-slate-300`}
                    >
                      <View style={tw`flex-row items-center`}>
                        <Text>Class teacher: </Text>
                        <View
                          style={tw`ml-1 min-w-[120px] border-b border-dotted border-slate-400`}
                        />
                      </View>
                      <View style={tw`flex-row items-center`}>
                        <Text>Head teacher / Principal: </Text>
                        <View
                          style={tw`ml-1 min-w-[120px] border-b border-dotted border-slate-400`}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
};

export default OrgExamReportsTab;

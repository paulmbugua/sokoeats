// apps/web/src/pages/org/OrgExamResultsPortal.web.tsx
/* eslint-disable no-console */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { getMyOrgOrBootstrap } from '@mytutorapp/shared/api';
import type { OrgResp as Org } from '@mytutorapp/shared/api/orgApi';
import {
  getOrgRoster,
  saveOrgLearnerAttendance as saveOrgLearnerAttendanceApi,
} from '@mytutorapp/shared/api/orgApi';

import { useOrgExams } from '@mytutorapp/shared/hooks';

import type {
  OrgExamConfig,
  OrgExamTerm,
  OrgExamSession,
  OrgExamGradingBand,
  OrgExamResultRow,
} from '@mytutorapp/shared/types';

// ⬇️ Your split components
import OrgExamSetupTab from './OrgExamSetupTab.web';
import OrgExamMarksTab from './OrgExamMarksTab.web';
import OrgExamReportsTab from './OrgExamReportsTab.web';
import { Coachmark, useCoachmark } from '../../components/hints/Coachmark';

const TAB_BTN_BASE =
  'group relative inline-flex items-center justify-center h-10 sm:h-11 px-4 sm:px-6 rounded-xl ' +
  'font-bold text-sm sm:text-base tracking-wide transition-all ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3d99f5]/60 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-[#0a0f15]';

type ViewTab = 'setup' | 'marks' | 'reports';

const emptyConfig: OrgExamConfig = {
  terms: [],
  sessions: [],
  gradingBands: [],
};

const bandPresets: OrgExamGradingBand[] = [
  { grade: 'A', min_percent: 80, max_percent: 100, remark: 'Excellent' },
  { grade: 'B', min_percent: 70, max_percent: 79.99, remark: 'Very good' },
  { grade: 'C', min_percent: 60, max_percent: 69.99, remark: 'Good' },
  { grade: 'D', min_percent: 50, max_percent: 59.99, remark: 'Fair' },
  { grade: 'E', min_percent: 0, max_percent: 49.99, remark: 'Needs improvement' },
];

// Small helper to build safe filenames
const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report';

// roster learner shape for this file
type OrgRosterLearner = {
  id: number | string;
  name?: string | null;
  email?: string | null;
  admission_code?: string | null;
  class_label?: string | null;
};

// ── Helpers for percentages, ordinals & remarks ──────────────────────────────

const percentOf = (score: any, max: any): number | null => {
  const s = Number(score);
  const m = Number(max);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null;
  return (s / m) * 100;
};

const formatRank = (n: number | null | undefined): string => {
  if (!n || !Number.isFinite(n)) return '';
  return String(n);
};

type AutoRemarksArgs = {
  name: string;
  percent: number | null;
  overallGrade?: string | null;
  classRank?: number | null;
  classSize?: number | null;
  bestSubject?: string | null;
  bestPercent?: number | null;
  weakestSubject?: string | null;
  weakestPercent?: number | null;
};

const buildAutoRemarks = ({
  name,
  percent,
  overallGrade,
  classRank,
  classSize,
  bestSubject,
  bestPercent,
  weakestSubject,
  weakestPercent,
}: AutoRemarksArgs): string => {
  const pieces: string[] = [];

  const displayName = name || 'This learner';
  if (percent != null) {
    pieces.push(
      `${displayName} achieved an overall score of ${percent.toFixed(1)}%${
        overallGrade ? ` (grade ${overallGrade})` : ''
      }, reflecting their effort and engagement this term.`
    );
  }

  if (classRank && classSize) {
    pieces.push(
      `In the class, ${displayName.toLowerCase()} ranked ${formatRank(
        classRank
      )} out of ${classSize} learners.`
    );
  }

  if (bestSubject && bestPercent != null) {
    pieces.push(
      `Strongest performance was in ${bestSubject} at about ${Math.round(
        bestPercent
      )}%, showing confidence and understanding in this area.`
    );
  }

  if (weakestSubject && weakestPercent != null) {
    pieces.push(
      `More focused support is recommended in ${weakestSubject}, where the score was around ${Math.round(
        weakestPercent
      )}%.`
    );
  }

  if (!pieces.length) {
    pieces.push(
      `${displayName} has made noticeable progress this term. Continued effort and support will help unlock even better outcomes.`
    );
  }

  pieces.push(
    'Parents/guardians are encouraged to celebrate the wins, discuss the areas that need improvement, and agree on 1–3 practical action steps for the coming term.'
  );

  return pieces.join(' ');
};

type AttendanceFormState = {
  lessonsAttended?: string;
  lessonsHeld?: string;
  attendancePercent?: string;
  behaviorRating?: string;
  punctualityRating?: string;
  teacherComment?: string;
};

const OrgExamResultsPortal: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const { backendUrl, orgToken, userId } = useShopContext() as any;

  // view mode: admin vs learner
  const rawView = params.get('view');
  const view: 'learner' | 'admin' = rawView === 'learner' ? 'learner' : 'admin';
  const isLearnerView = view === 'learner';

  const authToken = orgToken || '';

  // support ?studentId= and ?student_id=
  const studentIdParam = params.get('studentId') ?? params.get('student_id');

  const studentIdFromUrl: string | null =
    studentIdParam && studentIdParam.trim() !== '' ? studentIdParam.trim() : null;

  const resolvedLearnerId: string | null = React.useMemo(() => {
    if (!isLearnerView) return null;
    if (studentIdFromUrl) return studentIdFromUrl;
    if (userId != null) return String(userId);
    return null;
  }, [isLearnerView, studentIdFromUrl, userId]);

  console.log('[ExamPortal] ids', {
    view,
    isLearnerView,
    studentIdFromUrl,
    resolvedLearnerId,
  });

  const [org, setOrg] = useState<Org | null>(null);
  const orgId = org?.id ?? '';

  const [studentCard, setStudentCard] = useState<any | null>(null);
  const [studentCardText, setStudentCardText] = useState<string | null>(null);
  const [studentCardMeta, setStudentCardMeta] = useState<{
    studentName: string;
    overallGrade?: string | null;
  } | null>(null);

  const [reportRemarks, setReportRemarks] = useState<string | null>(null);
  const [attendanceForm, setAttendanceForm] = useState<AttendanceFormState>({});

  const [tab, setTab] = useState<ViewTab>(isLearnerView ? 'reports' : 'marks');

  const {
    config,
    configLoading,
    fetchConfig,
    saveConfig,
    sheetRows,
    sheetLoading,
    savingSheet,
    fetchSheet,
    saveSheet,
    analytics,
    analyticsLoading,
    fetchAnalytics,
    fetchStudentCard,
    emailStudentCard,
    downloadStudentCardPdf,
    downloadClassReportPdf,
    configAiLoading,
    previewConfigWithAi,
  } = useOrgExams({ backendUrl, token: authToken, orgId });
  const examFlowHint = useCoachmark(
    'org_exam_flow_v1',
    !isLearnerView && !configLoading && !sheetLoading
  );

  const cfg = config ?? emptyConfig;
  const [editingConfig, setEditingConfig] = useState<OrgExamConfig>(emptyConfig);

  const [selectedTermId, setSelectedTermId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [classLabel, setClassLabel] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [teacherInitials, setTeacherInitials] = useState<string>('');

  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const [hasAutoOpenedLearnerCard, setHasAutoOpenedLearnerCard] = useState(false);

  // roster + mark-entry helpers
  const [rosterLearners, setRosterLearners] = useState<OrgRosterLearner[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [newStudentId, setNewStudentId] = useState<string>('');
  const [newSubject, setNewSubject] = useState<string>('');

  // ─────────────────────
  // Load org + config
  // ─────────────────────
  useEffect(() => {
    if (!authToken) {
      console.log('[ExamPortal] no authToken, redirecting to /org/login');
      navigate('/org/login', { replace: true });
      return;
    }
    (async () => {
      try {
        const o = await getMyOrgOrBootstrap(backendUrl, authToken);
        setOrg(o);
      } catch (e) {
        console.warn('[ExamPortal] Failed to load org', e);
      }
    })();
  }, [backendUrl, authToken, navigate]);

  useEffect(() => {
    if (!orgId || !authToken) return;
    void fetchConfig();
  }, [orgId, authToken, fetchConfig]);

  // roster only for admin/teacher
  useEffect(() => {
    if (!orgId || !authToken || isLearnerView) return;
    (async () => {
      setRosterLoading(true);
      try {
        const roster = await getOrgRoster(backendUrl, authToken, orgId);
        const learners = Array.isArray(roster?.learners) ? roster.learners : [];
        setRosterLearners(learners as OrgRosterLearner[]);
      } catch (e) {
        console.warn('[OrgExamPortal] Failed to load org roster', e);
      } finally {
        setRosterLoading(false);
      }
    })();
  }, [backendUrl, authToken, orgId, isLearnerView]);

  // sync editable config
  useEffect(() => {
    if (!config) return;
    setEditingConfig(config);
  }, [config]);

  // learner default term/session
  useEffect(() => {
    if (!isLearnerView) return;
    if (selectedSessionId) return;
    if (!config || !config.terms.length || !config.sessions.length) return;

    const activeTerms = config.terms.filter((t) => t.is_active);
    const baseTerms = activeTerms.length ? activeTerms : config.terms;

    const sortedTerms = [...baseTerms].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.label.localeCompare(b.label);
    });

    const latestTerm = sortedTerms[sortedTerms.length - 1];
    const sessionsForTerm = config.sessions.filter((s) => s.term_id === latestTerm.id);
    if (!sessionsForTerm.length) return;

    const latestSession = sessionsForTerm[sessionsForTerm.length - 1];

    setSelectedTermId(latestTerm.id);
    setSelectedSessionId(latestSession.id);
  }, [isLearnerView, selectedSessionId, config]);

  const ensureSessionSelected = () => {
    if (!selectedSessionId) {
      alert('Please select a term and exam session first.');
      return false;
    }
    return true;
  };

  // marks: load sheet + analytics when exam/class changes
  useEffect(() => {
    if (!selectedSessionId) return;
    void fetchSheet(selectedSessionId, classLabel || undefined);
    if (!isLearnerView) {
      void fetchAnalytics(selectedSessionId);
    }
  }, [selectedSessionId, classLabel, fetchSheet, fetchAnalytics, isLearnerView]);

  // ─────────────────────
  // Config handlers
  // ─────────────────────
  const makeClientId = () =>
    `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const handleAddTerm = () => {
    const year = new Date().getFullYear();
    const label = window.prompt(
      'Term label (e.g. "Term 1"):',
      `Term ${editingConfig.terms.length + 1}`
    );
    if (!label) return;
    const next = {
      id: makeClientId(),
      label,
      year,
      is_active: true,
    } as OrgExamTerm;
    setEditingConfig((prev) => ({ ...prev, terms: [...prev.terms, next] }));
  };

  const handleAddSession = () => {
    if (!editingConfig.terms.length) {
      alert('Add at least one term first.');
      return;
    }
    const label = window.prompt('Exam label (e.g. "Midterm"):', 'Midterm');
    if (!label) return;
    const termId = selectedTermId || editingConfig.terms[0].id;
    const next: OrgExamSession = {
      id: makeClientId(),
      term_id: termId,
      label,
      weight: 1,
      starts_at: null,
      ends_at: null,
    };
    setEditingConfig((prev) => ({ ...prev, sessions: [...prev.sessions, next] }));
  };

  const handleRunConfigAi = async (instructions: string) => {
    try {
      const next = await previewConfigWithAi(editingConfig, instructions);
      setEditingConfig(next);
    } catch (e: any) {
      console.error('[OrgExamPortal] AI config error', e);
      alert(e?.message || 'Failed to apply AI changes to exam setup.');
    }
  };

  const handleApplyBandsPreset = () => {
    const withSort = bandPresets.map((b, idx) => ({
      ...b,
      sort_order: idx,
    }));
    setEditingConfig((prev) => ({ ...prev, gradingBands: withSort }));
  };

  const handleSaveConfig = async () => {
    try {
      await saveConfig(editingConfig);
      alert('Exam configuration saved.');
    } catch (e: any) {
      console.error('[OrgExamPortal] save config error', e);
      const maybeData = e?.response?.data;
      const serverMessage =
        (maybeData && (maybeData.message || maybeData.error)) ||
        e?.message ||
        'Failed to save configuration';
      alert(serverMessage);
    }
  };

  const handleSaveSheet = async () => {
    if (!ensureSessionSelected()) return;
    try {
      await saveSheet(selectedSessionId, classLabel || undefined, sheetRows);
      alert('Marks saved.');
    } catch (e: any) {
      console.error('[OrgExamPortal] save marks error', e);
      const maybeData = e?.response?.data;
      const serverMessage =
        (maybeData && (maybeData.message || maybeData.error)) ||
        e?.message ||
        'Failed to save marks';
      alert(serverMessage);
    }
  };

  const handleOpenStudentCard = useCallback(
    async (studentId: number) => {
      if (!ensureSessionSelected()) return;

      setSelectedStudentId(studentId);
      if (!isLearnerView) {
        setTab('reports');
      }
      setStudentCard(null);
      setStudentCardText('Loading report card…');
      setStudentCardMeta(null);
      setReportRemarks(null);

      try {
        const card: any = await fetchStudentCard(selectedSessionId, studentId);

        if (!card) {
          setStudentCardText('No report data found for this learner yet.');
          return;
        }

        // compute per-class totals + ranks for this session
        const classKey = (classLabel || card.student?.class_label || '')
          .toString()
          .toLowerCase()
          .trim();

        const rowsInClass = sheetRows.filter((r) => {
          if (!classKey) return true;
          const rowClass = (r.class_label || '').toString().toLowerCase();
          return rowClass.includes(classKey);
        });

        const totalsByStudent = new Map<
          number,
          { totalScore: number; totalMax: number; percent: number }
        >();

        for (const r of rowsInClass) {
          const sid = Number(r.student_user_id);
          if (!Number.isFinite(sid)) continue;
          const s = Number(r.score) || 0;
          const m = Number(r.max_score) || 0;
          const prev = totalsByStudent.get(sid) || {
            totalScore: 0,
            totalMax: 0,
            percent: 0,
          };
          const nextTotalScore = prev.totalScore + s;
          const nextTotalMax = prev.totalMax + m;
          const nextPercent = nextTotalMax > 0 ? (nextTotalScore / nextTotalMax) * 100 : 0;
          totalsByStudent.set(sid, {
            totalScore: nextTotalScore,
            totalMax: nextTotalMax,
            percent: nextPercent,
          });
        }

        const overallSorted = Array.from(totalsByStudent.entries()).sort(
          (a, b) => b[1].percent - a[1].percent
        );
        const classSize = overallSorted.length;
        const overallIdx = overallSorted.findIndex(([id]) => id === studentId);
        const overallRank = overallIdx >= 0 ? overallIdx + 1 : null;

        const subjectPositions: Record<
          string,
          { rank: number | null; size: number; meanPercent: number | null }
        > = {};

        const rowsBySubject = new Map<string, OrgExamResultRow[]>();
        for (const r of rowsInClass) {
          const key = (r.subject || '').toString().toLowerCase();
          if (!rowsBySubject.has(key)) rowsBySubject.set(key, []);
          rowsBySubject.get(key)!.push(r);
        }

        card.subjects.forEach((s: any) => {
          const subKey = (s.subject || '').toString().toLowerCase();
          const subjectRows = rowsBySubject.get(subKey) || [];
          if (!subjectRows.length) {
            subjectPositions[subKey] = {
              rank: null,
              size: 0,
              meanPercent: null,
            };
            return;
          }

          const withPerc = subjectRows
            .map((r) => {
              const p = percentOf(r.score, r.max_score) ?? 0;
              return { studentId: Number(r.student_user_id), percent: p };
            })
            .sort((a, b) => b.percent - a.percent);

          const size = withPerc.length;
          const idx = withPerc.findIndex((row) => row.studentId === studentId);
          const rank = idx >= 0 ? idx + 1 : null;
          const meanPercent = withPerc.reduce((acc, r) => acc + r.percent, 0) / size || null;

          subjectPositions[subKey] = { rank, size, meanPercent };
        });

        let bestSubject: string | null = null;
        let bestPercent: number | null = null;
        let weakestSubject: string | null = null;
        let weakestPercent: number | null = null;

        card.subjects.forEach((s: any) => {
          const p = percentOf(s.score, s.max_score);
          if (p == null) return;

          if (bestPercent == null || p > bestPercent) {
            bestPercent = p;
            bestSubject = s.subject;
          }

          if (weakestPercent == null || p < weakestPercent) {
            weakestPercent = p;
            weakestSubject = s.subject;
          }
        });

        const overallPercent: number | null =
          typeof card.summary?.totalPercent === 'number' ? card.summary.totalPercent : null;

        const enrichedCard = {
          ...card,
          summary: {
            ...card.summary,
            totalPercent: overallPercent,
            classRank: overallRank,
            classSize,
          },
          subjects: card.subjects.map((s: any) => {
            const key = (s.subject || '').toString().toLowerCase();
            const pos = subjectPositions[key];
            const subjectPercent = percentOf(s.score, s.max_score);
            return {
              ...s,
              percent: subjectPercent,
              classRank: pos?.rank ?? null,
              classSize: pos?.size ?? null,
              classMeanPercent: pos?.meanPercent ?? null,
            };
          }),
          computed: {
            bestSubject,
            bestPercent,
            weakestSubject,
            weakestPercent,
          },
        };

        setStudentCard(enrichedCard);

        const attendance = (card as any).attendance || (card.summary as any)?.attendance || {};
        setAttendanceForm({
          lessonsAttended:
            attendance.lessonsAttended != null ? String(attendance.lessonsAttended) : '',
          lessonsHeld: attendance.lessonsHeld != null ? String(attendance.lessonsHeld) : '',
          attendancePercent:
            typeof attendance.attendancePercent === 'number'
              ? String(attendance.attendancePercent)
              : '',
          behaviorRating:
            attendance.behaviorRating != null ? String(attendance.behaviorRating) : '',
          punctualityRating:
            attendance.punctualityRating != null ? String(attendance.punctualityRating) : '',
          teacherComment: attendance.teacherComment ?? '',
        });

        const lines: string[] = [];
        lines.push(`${card.student.name} – Report`);
        lines.push('');
        enrichedCard.subjects.forEach((s: any) => {
          const baseLine = `${s.subject}: ${s.score}/${s.max_score}`;
          const percentStr = s.percent != null ? ` (${Math.round(s.percent)}%)` : '';
          const gradeStr = s.grade ? ` – ${s.grade}` : '';
          const posStr =
            s.classRank && s.classSize
              ? ` – position ${formatRank(s.classRank)} of ${s.classSize}`
              : '';
          lines.push(baseLine + percentStr + gradeStr + posStr);
        });
        lines.push('');
        if (overallPercent != null) {
          const posStr =
            overallRank && classSize
              ? ` – position ${formatRank(overallRank)} of ${classSize}`
              : '';
          lines.push(
            `Total: ${card.summary.totalScore}/${card.summary.totalMax} (${overallPercent.toFixed(
              1
            )}%) – ${card.summary.overallGrade || ''}${posStr}`
          );
        }
        setStudentCardText(lines.join('\n'));

        setStudentCardMeta({
          studentName: card.student.name || 'Student',
          overallGrade: card.summary.overallGrade,
        });

        const principalFromServer =
          (card.summary && (card.summary.principalRemark || card.summary.overallRemark)) || null;

        const remarks =
          principalFromServer ||
          buildAutoRemarks({
            name: card.student.name || 'This learner',
            percent: overallPercent,
            overallGrade: card.summary.overallGrade,
            classRank: overallRank,
            classSize,
            bestSubject,
            bestPercent,
            weakestSubject,
            weakestPercent,
          });

        setReportRemarks(remarks);
      } catch (e: any) {
        console.error('[OrgExamPortal] fetchStudentCard error', e);
        setStudentCard(null);
        setStudentCardText(null);
        setReportRemarks(null);
        alert(e?.message || 'Failed to load report card');
      }
    },
    [
      selectedSessionId,
      classLabel,
      sheetRows,
      ensureSessionSelected,
      fetchStudentCard,
      isLearnerView,
    ]
  );

  // reset learner auto-open when exam or learner changes
  useEffect(() => {
    if (!isLearnerView) return;
    setHasAutoOpenedLearnerCard(false);
  }, [isLearnerView, selectedSessionId, resolvedLearnerId]);

  // learner: auto-open their card once
  useEffect(() => {
    if (!isLearnerView) return;
    if (hasAutoOpenedLearnerCard) return;

    if (!resolvedLearnerId) return;
    const numericId = Number(resolvedLearnerId);
    if (!Number.isFinite(numericId)) return;
    if (!selectedSessionId) return;
    if (!sheetRows || !sheetRows.length) return;

    const match = sheetRows.find((r) => String(r.student_user_id) === String(numericId));
    if (!match) return;

    setHasAutoOpenedLearnerCard(true);
    void handleOpenStudentCard(numericId);
  }, [
    isLearnerView,
    hasAutoOpenedLearnerCard,
    resolvedLearnerId,
    selectedSessionId,
    sheetRows,
    handleOpenStudentCard,
  ]);

  const handleEmailStudentCard = async (studentId: number) => {
    if (!ensureSessionSelected()) return;
    const maybeTo = window.prompt(
      'Send report to (leave blank to use guardian/student email):',
      ''
    );
    try {
      const resp = await emailStudentCard(selectedSessionId, studentId, maybeTo || undefined);
      if (!resp.ok) {
        alert('Failed to queue email.');
      } else {
        alert(`Report queued to: ${resp.to || '(guardian/student email)'}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to queue exam email');
    }
  };

  const filteredSheetRows = useMemo(() => {
    if (!subjectFilter) return sheetRows;
    return sheetRows.filter((r) =>
      String(r.subject || '')
        .toLowerCase()
        .includes(subjectFilter.toLowerCase())
    );
  }, [sheetRows, subjectFilter]);

  const learnerById = useMemo(() => {
    const m = new Map<number, OrgRosterLearner>();
    for (const l of rosterLearners) {
      const idNum = Number(l.id);
      if (Number.isFinite(idNum)) {
        m.set(idNum, l);
      }
    }
    return m;
  }, [rosterLearners]);

  const learnerOptions = useMemo(() => {
    const classFilter = classLabel.trim().toLowerCase();
    const filtered = rosterLearners.filter((l) => {
      if (!classFilter) return true;
      if (!l.class_label) return false;
      return l.class_label.toLowerCase().includes(classFilter);
    });
    return filtered.map((l) => {
      const displayBase = l.name || l.email || `User #${l.id}`;
      const withAdm = l.admission_code ? `${l.admission_code} – ${displayBase}` : displayBase;
      const withClass = l.class_label ? `${withAdm} (${l.class_label})` : withAdm;
      return {
        value: String(l.id),
        label: withClass,
      };
    });
  }, [rosterLearners, classLabel]);

  const visibleLearnerCount = learnerOptions.length;

  const handleAddRowFromRoster = () => {
    if (!ensureSessionSelected()) return;
    if (!newStudentId || !newSubject.trim()) {
      alert('Select a learner and enter a subject.');
      return;
    }
    const studentIdNum = Number(newStudentId);
    if (!Number.isFinite(studentIdNum)) {
      alert('Invalid learner selection.');
      return;
    }

    const meta = learnerById.get(studentIdNum);
    const initialsTrimmed = teacherInitials.trim();

    const newRow: OrgExamResultRow = {
      student_user_id: studentIdNum,
      subject: newSubject.trim(),
      score: 0,
      max_score: 100,
      class_label: classLabel || meta?.class_label || undefined,
    };

    (newRow as any).teacher_initials = initialsTrimmed || null;
    (newRow as any).student_name = meta?.name || meta?.email || null;
    (newRow as any).student_email = meta?.email || null;
    (newRow as any).admission_code = meta?.admission_code || null;

    const next = [...sheetRows, newRow];
    void saveSheet(selectedSessionId, classLabel || undefined, next);

    setNewStudentId('');
    setNewSubject('');
  };

  const handleBulkAddClassForSubject = () => {
    if (!ensureSessionSelected()) return;

    const subject = newSubject.trim();
    const classKey = classLabel.trim().toLowerCase();
    const initialsTrimmed = teacherInitials.trim();

    if (!classKey) {
      alert('Enter the class label above (e.g. "Grade 7 Maple") before bulk adding.');
      return;
    }
    if (!subject) {
      alert('Enter the subject name before bulk adding.');
      return;
    }

    const classLearners = rosterLearners.filter((l) => {
      if (!l.class_label) return false;
      return l.class_label.toLowerCase().includes(classKey);
    });

    if (!classLearners.length) {
      alert('No learners in roster match this class label.');
      return;
    }

    const existing = new Set(
      sheetRows.map((r) => `${r.student_user_id}::${String(r.subject || '').toLowerCase()}`)
    );

    const additions: OrgExamResultRow[] = [];

    for (const l of classLearners) {
      const idNum = Number(l.id);
      if (!Number.isFinite(idNum)) continue;

      const key = `${idNum}::${subject.toLowerCase()}`;
      if (existing.has(key)) continue;

      const base: OrgExamResultRow = {
        student_user_id: idNum,
        subject,
        score: 0,
        max_score: 100,
        class_label: l.class_label || classLabel || undefined,
      };

      (base as any).teacher_initials = initialsTrimmed || null;
      (base as any).student_name = l.name || l.email || null;
      (base as any).student_email = l.email || null;
      (base as any).admission_code = l.admission_code || null;

      additions.push(base);
    }

    if (!additions.length) {
      alert('All learners in this class already have rows for this subject.');
      return;
    }

    const next = [...sheetRows, ...additions];
    void saveSheet(selectedSessionId, classLabel || undefined, next);
  };

  const selectedSession = cfg.sessions.find((s) => s.id === selectedSessionId) || null;
  const selectedTerm = cfg.terms.find((t) => t.id === selectedSession?.term_id) || null;

  const handleDownloadPdf = useCallback(() => {
    if (!selectedStudentId || !ensureSessionSelected()) return;

    const studentName = studentCardMeta?.studentName || 'student';
    const termPart = selectedTerm ? `${selectedTerm.year}-${selectedTerm.label}` : '';
    const examPart = selectedSession?.label || '';
    const classPart = classLabel || '';
    const gradePart = studentCardMeta?.overallGrade || '';

    const pieces = [studentName, classPart, termPart, examPart, gradePart, 'report-card']
      .map((p) => p.trim())
      .filter(Boolean);

    const base = slugify(pieces.join('_'));
    const fileName = `${base}.pdf`;

    void downloadStudentCardPdf(selectedSessionId, selectedStudentId, fileName);
  }, [
    selectedStudentId,
    selectedSessionId,
    downloadStudentCardPdf,
    studentCardMeta,
    selectedTerm,
    selectedSession,
    classLabel,
    ensureSessionSelected,
  ]);

  const handleDownloadClassPdf = useCallback(() => {
    if (!ensureSessionSelected()) return;

    const trimmedClass = classLabel.trim();
    if (!trimmedClass) {
      alert('Enter/select the class label above first (e.g. "Grade 7 Maple").');
      return;
    }

    if (!selectedSessionId) {
      alert('Please select an exam session first.');
      return;
    }

    const termPart = selectedTerm ? `${selectedTerm.year}-${selectedTerm.label}` : '';
    const examPart = selectedSession?.label || '';

    const pieces = [org?.name || 'school', trimmedClass, termPart, examPart, 'class-report']
      .map((p) => String(p || '').trim())
      .filter(Boolean);

    const base = slugify(pieces.join('_'));
    const fileName = `${base}.pdf`;

    // fire-and-download
    void downloadClassReportPdf(selectedSessionId, trimmedClass, fileName);
  }, [
    ensureSessionSelected,
    classLabel,
    selectedSessionId,
    selectedTerm,
    selectedSession,
    org,
    downloadClassReportPdf,
  ]);

  const handleRefreshAnalytics = useCallback(() => {
    if (!ensureSessionSelected()) return;
    void fetchAnalytics(selectedSessionId);
  }, [ensureSessionSelected, fetchAnalytics, selectedSessionId]);

  const handleSaveRemarks = useCallback(async () => {
    if (!selectedStudentId || !selectedSessionId || !orgId) return;

    try {
      const resp = await fetch(
        `${backendUrl}/api/orgs/${orgId}/exams/student/${selectedStudentId}/remarks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            sessionId: selectedSessionId,
            principalRemark: reportRemarks ?? '',
          }),
        }
      );

      const data = await resp.json().catch(() => null);

      if (!resp.ok || !data?.ok) {
        console.error('[OrgExamPortal] save remarks error', data);
        alert(data?.message || 'Failed to save remarks');
        return;
      }

      // optional toast
      // alert('Remarks saved.');
    } catch (e: any) {
      console.error('[OrgExamPortal] save remarks error', e);
      alert(e?.message || 'Failed to save remarks');
    }
  }, [selectedStudentId, selectedSessionId, orgId, backendUrl, authToken, reportRemarks]);

  const handleSaveAttendance = useCallback(async () => {
    if (!selectedStudentId || !selectedTerm || !orgId) {
      alert('Select a learner, term, and exam before saving attendance.');
      return;
    }
    if (!authToken) {
      alert('You must be logged in to save attendance.');
      return;
    }

    const lhRaw = attendanceForm.lessonsHeld ?? '';
    const laRaw = attendanceForm.lessonsAttended ?? '';
    const bhRaw = attendanceForm.behaviorRating ?? '';
    const puRaw = attendanceForm.punctualityRating ?? '';
    const commentRaw = attendanceForm.teacherComment ?? '';

    const lessonsHeld = lhRaw.trim() === '' ? null : Number(lhRaw.trim());
    const lessonsAttended = laRaw.trim() === '' ? null : Number(laRaw.trim());
    const behaviorRating = bhRaw.trim() === '' ? null : Number(bhRaw.trim());
    const punctualityRating = puRaw.trim() === '' ? null : Number(puRaw.trim());
    const teacherComment = commentRaw.trim() === '' ? null : commentRaw.trim();

    const payload = {
      termId: selectedTerm.id,
      // 🔹 add session if you want it:
      // sessionId: selectedSession?.id,
      lessonsHeld,
      lessonsAttended,
      behaviorRating,
      punctualityRating,
      teacherComment,
    };

    console.log('[OrgExamPortal] save attendance payload', {
      backendUrl,
      orgId,
      selectedStudentId,
      payload,
    });

    try {
      const resp = await saveOrgLearnerAttendanceApi(
        backendUrl,
        authToken,
        orgId,
        selectedStudentId,
        payload
      );

      if (!resp?.ok) {
        alert('Failed to save attendance.');
        return;
      }

      setStudentCard((prev: any) => {
        if (!prev) return prev;
        const attended = lessonsAttended ?? null;
        const held = lessonsHeld ?? null;
        const pct = held && attended != null && held > 0 ? (attended / held) * 100 : null;

        return {
          ...prev,
          attendance: {
            ...(prev as any).attendance,
            lessonsHeld: held,
            lessonsAttended: attended,
            behaviorRating,
            punctualityRating,
            teacherComment,
            attendancePercent: pct,
          },
        };
      });

      // alert('Attendance saved.');
    } catch (e: any) {
      console.error('[OrgExamPortal] save attendance error', e);
      alert(e?.message || 'Failed to save attendance');
    }
  }, [
    selectedStudentId,
    selectedTerm,
    orgId,
    backendUrl,
    authToken,
    attendanceForm,
    setStudentCard,
  ]);

  const handleRegenerateTeacherComment = useCallback(
    async (instructions?: string) => {
      if (!selectedStudentId || !selectedSessionId || !orgId) return;

      try {
        const resp = await fetch(
          `${backendUrl}/api/orgs/${orgId}/exams/student/${selectedStudentId}/ai-remarks`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              sessionId: selectedSessionId,
              // 🧠 Tell AI we only care about a short class-teacher note,
              // and that it should use attendance + behaviour + punctuality.
              instructions: [
                'Write a single short class-teacher behaviour note (1–2 short sentences, max ~160 characters).',
                'Base it on the learner’s attendance, behaviour rating (1–5), and punctuality rating (1–5) from the card.attendance block.',
                'Focus on behaviour, attitude, and presence (punctuality), not academic performance.',
                instructions ? `Extra hint: ${instructions}` : '',
              ]
                .filter(Boolean)
                .join(' '),
            }),
          }
        ).then((r) => r.json());

        if (!resp?.ok) {
          console.error('AI teacher-comment error', resp);
          alert(resp?.message || 'Failed to generate AI teacher behaviour note.');
          return;
        }

        const raw = (resp as any).principalRemark as string | null | undefined;
        if (!raw) return;

        // Clean and lightly clamp for this note
        const flat = raw.replace(/\s+/g, ' ').trim();
        const shortened = flat.length > 200 ? flat.slice(0, 200) : flat;

        setAttendanceForm((prev: AttendanceFormState) => ({
          ...prev,
          teacherComment: shortened,
        }));
      } catch (e: any) {
        console.error('[OrgExamPortal] AI teacher-comment error', e);
        alert(e?.message || 'Failed to generate AI teacher behaviour note.');
      }
    },
    [selectedStudentId, selectedSessionId, orgId, backendUrl, authToken, setAttendanceForm]
  );

  const handleRegenerateRemarks = useCallback(
    async (instructions?: string) => {
      if (!selectedStudentId || !selectedSessionId || !orgId) return;

      try {
        const resp = await fetch(
          `${backendUrl}/api/orgs/${orgId}/exams/student/${selectedStudentId}/ai-remarks`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              sessionId: selectedSessionId,
              instructions: instructions ?? '',
            }),
          }
        ).then((r) => r.json());

        if (!resp?.ok) {
          console.error('AI remarks error', resp);
          alert(resp?.message || 'Failed to generate AI-powered remarks.');
          return;
        }

        const { principalRemark, subjectRemarks } = resp as {
          principalRemark?: string | null;
          subjectRemarks?: { subject: string; remark: string }[];
        };

        if (principalRemark) {
          // 🔹 update textarea
          setReportRemarks(principalRemark);
        }

        if (Array.isArray(subjectRemarks) && subjectRemarks.length) {
          const updated = sheetRows.map((row) => {
            const match = subjectRemarks.find(
              (s) =>
                s.subject &&
                s.subject.toLowerCase().trim() ===
                  String(row.subject || '')
                    .toLowerCase()
                    .trim()
            );
            if (!match) return row;
            return { ...row, remark: match.remark };
          });

          // 🔹 persist subject-level remarks
          await saveSheet(selectedSessionId, classLabel || undefined, updated);
        }
      } catch (e: any) {
        console.error('[OrgExamPortal] AI remarks error', e);
        alert(e?.message || 'Failed to generate AI remarks');
      }
    },
    [
      selectedStudentId,
      selectedSessionId,
      orgId,
      backendUrl,
      authToken,
      sheetRows,
      saveSheet,
      classLabel,
      setReportRemarks,
    ]
  );

  return (
    <div
      className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary overflow-x-hidden"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <main className="flex-1 flex justify-center py-6 px-3 sm:px-4 lg:px-10">
        <div className="flex flex-col w-full max-w-[1200px]">
          {/* Header */}
          <section className="px-1 sm:px-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex min-w-60 sm:min-w-72 flex-col gap-1">
                <h1 className="text-[24px] sm:text-[28px] md:text-[32px] font-bold leading-tight">
                  {isLearnerView ? 'My exam results' : 'Exam Results & Reports'}
                </h1>
                <p className="text-[#49739c] dark:text-darkTextSecondary text-xs sm:text-sm">
                  {isLearnerView
                    ? 'See your marks and download an official, school-branded report card.'
                    : 'Record marks, auto-grade, and send rich report cards to parents.'}
                </p>
              </div>

              {!isLearnerView && (
                <div
                  role="tablist"
                  aria-label="Exam views"
                  className="relative inline-flex items-center rounded-2xl p-1.5 bg-white/80 dark:bg-[#0b1420]/80 ring-2 ring-[#3d99f5] dark:ring-[#3d99f5]/90 shadow-xl backdrop-blur supports-[backdrop-filter]:backdrop-blur"
                >
                  <Coachmark
                    id="org_exam_flow_v1"
                    title="Follow the flow"
                    text="Start in Setup, enter Marks, then export Reports for families."
                    visible={examFlowHint.visible}
                    onDismiss={examFlowHint.dismiss}
                    placement="bottom"
                  />
                  <button
                    role="tab"
                    aria-selected={tab === 'setup'}
                    aria-pressed={tab === 'setup'}
                    onClick={() => setTab('setup')}
                    className={[
                      TAB_BTN_BASE,
                      tab === 'setup'
                        ? 'bg-[#3d99f5] text-white shadow-lg ring-1 ring-[#3d99f5]'
                        : 'bg-transparent text-[#0d141c] dark:text-darkTextPrimary ring-1 ring-[#3d99f5]/60 hover:bg-[#e7edf4]/80 dark:hover:bg-white/5',
                    ].join(' ')}
                  >
                    Setup
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'marks'}
                    aria-pressed={tab === 'marks'}
                    onClick={() => setTab('marks')}
                    className={[
                      TAB_BTN_BASE,
                      'ml-1.5',
                      tab === 'marks'
                        ? 'bg-[#3d99f5] text-white shadow-lg ring-1 ring-[#3d99f5]'
                        : 'bg-transparent text-[#0d141c] dark:text-darkTextPrimary ring-1 ring-[#3d99f5]/60 hover:bg-[#e7edf4]/80 dark:hover:bg-white/5',
                    ].join(' ')}
                  >
                    Marks entry
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'reports'}
                    aria-pressed={tab === 'reports'}
                    onClick={() => setTab('reports')}
                    className={[
                      TAB_BTN_BASE,
                      'ml-1.5',
                      tab === 'reports'
                        ? 'bg-[#3d99f5] text-white shadow-lg ring-1 ring-[#3d99f5]'
                        : 'bg-transparent text-[#0d141c] dark:text-darkTextPrimary ring-1 ring-[#3d99f5]/60 hover:bg-[#e7edf4]/80 dark:hover:bg-white/5',
                    ].join(' ')}
                  >
                    Reports &amp; analytics
                  </button>
                </div>
              )}

              {isLearnerView && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0f172a] text-xs text-white/80 shadow-lg">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Learner view – only your results
                </div>
              )}
            </div>
          </section>

          {/* Selection strip */}
          <section className="mt-4 sm:mt-5">
            {isLearnerView ? (
              <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] px-3 sm:px-4 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-[#49739c] dark:text-darkTextSecondary">
                    Exam selection
                  </span>
                  <span className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                    Choose the term and exam you want to view your report card for.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-xs sm:text-sm px-2 min-w-[140px]"
                    value={selectedTermId}
                    onChange={(e) => setSelectedTermId(e.target.value)}
                  >
                    <option value="">Select term</option>
                    {cfg.terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.year} – {t.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-xs sm:text-sm px-2 min-w-[140px]"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                  >
                    <option value="">Select exam</option>
                    {cfg.sessions
                      .filter((s) => !selectedTermId || s.term_id === selectedTermId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] px-3 sm:px-4 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs sm:text-sm font-semibold text-[#49739c] dark:text-darkTextSecondary">
                    Active selection:
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#e7edf4] dark:bg-[#172534]">
                    Term: {selectedTerm?.label ?? '—'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#e7edf4] dark:bg-[#172534]">
                    Exam: {selectedSession?.label ?? '—'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#e7edf4] dark:bg-[#172534]">
                    Class: {classLabel || '—'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-xs sm:text-sm px-2"
                    value={selectedTermId}
                    onChange={(e) => setSelectedTermId(e.target.value)}
                  >
                    <option value="">Select term</option>
                    {cfg.terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.year} – {t.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-xs sm:text-sm px-2"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                  >
                    <option value="">Select exam</option>
                    {cfg.sessions
                      .filter((s) => !selectedTermId || s.term_id === selectedTermId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                  </select>
                  <input
                    className="h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] text-xs sm:text-sm px-3 min-w-[120px]"
                    placeholder="Class (e.g. Grade 7 Maple)"
                    value={classLabel}
                    onChange={(e) => setClassLabel(e.target.value)}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Main content – split into 3 tabs */}
          <section className="mt-4 sm:mt-6 space-y-4 sm:space-y-5">
            {/* Setup tab */}
            {!isLearnerView && tab === 'setup' && (
              <OrgExamSetupTab
                editingConfig={editingConfig}
                setEditingConfig={setEditingConfig}
                configLoading={configLoading}
                onAddTerm={handleAddTerm}
                onAddSession={handleAddSession}
                onApplyBandsPreset={handleApplyBandsPreset}
                onSaveConfig={handleSaveConfig}
                onRunAiConfig={handleRunConfigAi}
                configAiLoading={configAiLoading}
              />
            )}

            {/* Marks tab */}
            {!isLearnerView && tab === 'marks' && (
              <OrgExamMarksTab
                rosterLearners={rosterLearners}
                rosterLoading={rosterLoading}
                visibleLearnerCount={visibleLearnerCount}
                subjectFilter={subjectFilter}
                setSubjectFilter={setSubjectFilter}
                learnerOptions={learnerOptions}
                newStudentId={newStudentId}
                setNewStudentId={setNewStudentId}
                newSubject={newSubject}
                setNewSubject={setNewSubject}
                teacherInitials={teacherInitials}
                setTeacherInitials={setTeacherInitials}
                selectedSessionId={selectedSessionId}
                classLabel={classLabel}
                sheetLoading={sheetLoading}
                filteredSheetRows={filteredSheetRows}
                sheetRows={sheetRows}
                learnerById={learnerById}
                savingSheet={savingSheet}
                onAddRowFromRoster={handleAddRowFromRoster}
                onBulkAddClassForSubject={handleBulkAddClassForSubject}
                onSaveSheet={handleSaveSheet}
                onOpenStudentCard={handleOpenStudentCard}
                onEmailStudentCard={handleEmailStudentCard}
                saveSheet={saveSheet}
              />
            )}
            {tab === 'reports' && (
              <OrgExamReportsTab
                isLearnerView={isLearnerView}
                org={org}
                selectedStudentId={selectedStudentId}
                selectedTerm={selectedTerm}
                selectedSession={selectedSession}
                classLabel={classLabel}
                studentCard={studentCard}
                studentCardText={studentCardText}
                reportRemarks={reportRemarks}
                setReportRemarks={setReportRemarks}
                attendanceForm={attendanceForm}
                setAttendanceForm={setAttendanceForm}
                analytics={analytics}
                analyticsLoading={analyticsLoading}
                onRefreshAnalytics={handleRefreshAnalytics}
                onDownloadPdf={handleDownloadPdf}
                onRegenerateRemarks={handleRegenerateRemarks}
                onSaveRemarks={handleSaveRemarks}
                onSaveAttendance={handleSaveAttendance}
                canDownloadClass={Boolean(
                  !isLearnerView &&
                    selectedSessionId &&
                    classLabel.trim() &&
                    sheetRows &&
                    sheetRows.length
                )}
                onDownloadClassPdf={handleDownloadClassPdf}
                onRegenerateTeacherComment={handleRegenerateTeacherComment}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default OrgExamResultsPortal;

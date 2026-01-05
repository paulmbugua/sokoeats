/* eslint-disable no-console */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, Linking } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import tw from '../../../tailwind';
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

// ⬇️ Native split components
import OrgExamSetupTab from './OrgExamSetupTab.native';
import OrgExamMarksTab from './OrgExamMarksTab.native';
import OrgExamReportsTab from './OrgExamReportsTab.native';

import { useThemePref } from '../../theme/ThemeContext';

type ViewTab = 'setup' | 'marks' | 'reports';

type OrgRosterLearner = {
  id: number | string;
  name?: string | null;
  email?: string | null;
  admission_code?: string | null;
  class_label?: string | null;
};

type OrgExamResultsPortalRouteParams = {
  view?: 'learner' | 'admin';
  studentId?: string | number | null;
};

type OrgStackParamList = {
  OrgExamResultsPortal: OrgExamResultsPortalRouteParams | undefined;
};

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

/* ───────────────────────────────────────────────────────────
 * Palette (theme-aware)
 * ─────────────────────────────────────────────────────────── */
function usePalette() {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';

  const bg = isDark ? '#020617' : '#f8fafc';
  const card = isDark ? '#020617' : '#ffffff';
  const border = isDark ? 'rgba(148,163,184,0.35)' : '#cbd5e1';
  const text = isDark ? '#e5f0ff' : '#020617';
  const textMuted = isDark ? '#9ca3af' : '#4b5563';
  const textSoft = isDark ? '#94a3b8' : '#64748b';
  const accent = '#2563eb';
  const accentSoft = isDark ? 'rgba(56,189,248,0.9)' : '#0369a1';
  const chipBg = isDark ? '#0f172a' : '#e5f2ff';
  const stripBg = isDark ? '#020617' : '#e5f2ff';
  const pillBg = isDark ? '#020617' : '#e0f2fe';
  const pillText = isDark ? '#bae6fd' : '#075985';
  const inputBg = isDark ? '#020617' : '#ffffff';

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
    stripBg,
    pillBg,
    pillText,
    inputBg,
    surface(style?: any) {
      return [
        tw`rounded-2xl px-3 py-3`,
        {
          backgroundColor: card,
          borderColor: border,
          borderWidth: 1,
        },
        style,
      ];
    },
  };
}

const OrgExamResultsPortalNative: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<OrgStackParamList, 'OrgExamResultsPortal'>>();
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  const { backendUrl, token: userToken, orgToken, userId } = useShopContext() as any;

  const authToken = orgToken || userToken || '';

  // view mode: admin vs learner – from route params, fallback to 'admin'
  const rawView = route.params?.view;
  const view: 'learner' | 'admin' = rawView === 'learner' ? 'learner' : 'admin';
  const isLearnerView = view === 'learner';

  // support param studentId
  const studentIdFromParamRaw = route.params?.studentId;
  const studentIdFromParam = studentIdFromParamRaw != null ? String(studentIdFromParamRaw) : null;

  const resolvedLearnerId: string | null = useMemo(() => {
    if (!isLearnerView) return null;
    if (studentIdFromParam) return studentIdFromParam;
    if (userId != null) return String(userId);
    return null;
  }, [isLearnerView, studentIdFromParam, userId]);

  console.log('[ExamPortalNative] ids', {
    view,
    isLearnerView,
    studentIdFromParam,
    resolvedLearnerId,
  });

  const outerScrollRef = useRef<any>(null);
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

    // Local draft rows for smooth editing & scrolling (no network during interaction)
  const [draftSheetRows, setDraftSheetRows] = useState<OrgExamResultRow[]>([]);
  const [draftDirty, setDraftDirty] = useState(false);

  // When server sheet changes (new fetch/session/class), reset draft
  useEffect(() => {
    setDraftSheetRows(sheetRows);
    setDraftDirty(false);
  }, [sheetRows, selectedSessionId, classLabel]);

  // This replaces "saveSheet" inside the marks table: local update ONLY.
  const saveSheetDraftOnly = useCallback(
    (_sessionId: string, _classLabel: string | undefined, rows: OrgExamResultRow[]) => {
      setDraftSheetRows(rows);
      setDraftDirty(true);
    },
    []
  );


  // ─────────────────────
  // Navigation guard: if not logged in, go to InstitutionLogin
  // ─────────────────────
  useEffect(() => {
    if (!authToken) {
      console.log('[ExamPortalNative] no authToken, navigating to InstitutionLogin');
      navigation.replace('InstitutionLogin' as never);
    }
  }, [authToken, navigation]);

  // ─────────────────────
  // Load org + config
  // ─────────────────────
  useEffect(() => {
    if (!authToken) return;
    (async () => {
      try {
        const o = await getMyOrgOrBootstrap(backendUrl, authToken);
        setOrg(o);
      } catch (e) {
        console.warn('[ExamPortalNative] Failed to load org', e);
      }
    })();
  }, [backendUrl, authToken]);

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
        console.warn('[OrgExamPortalNative] Failed to load org roster', e);
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

    if (!sortedTerms.length) return;

    const latestTerm = sortedTerms[sortedTerms.length - 1] as OrgExamTerm;

    const sessionsForTerm = config.sessions.filter((s) => s.term_id === latestTerm.id);
    if (!sessionsForTerm.length) return;

    const latestSession = sessionsForTerm[sessionsForTerm.length - 1] as OrgExamSession;

    setSelectedTermId(latestTerm.id);
    setSelectedSessionId(latestSession.id);
  }, [isLearnerView, selectedSessionId, config]);

  const ensureSessionSelected = () => {
    if (!selectedSessionId) {
      Alert.alert('Select exam', 'Please select a term and exam session first.');
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
    const label = `Term ${editingConfig.terms.length + 1}`;
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
      Alert.alert('Add term', 'Add at least one term first.');
      return;
    }

    const label = `Exam ${editingConfig.sessions.length + 1}`;

    const firstTerm = editingConfig.terms[0];
    const baseTermId = selectedTermId || firstTerm?.id;

    if (!baseTermId) {
      Alert.alert(
        'Add term',
        'No term is available to attach this exam. Please create a term first.'
      );
      return;
    }

    const next: OrgExamSession = {
      id: makeClientId(),
      term_id: baseTermId,
      label,
      weight: 1,
      starts_at: null,
      ends_at: null,
    };

    setEditingConfig((prev) => ({
      ...prev,
      sessions: [...prev.sessions, next],
    }));
  };

  const handleRunConfigAi = async (instructions: string) => {
    try {
      const next = await previewConfigWithAi(editingConfig, instructions);
      setEditingConfig(next);
    } catch (e: any) {
      console.error('[OrgExamPortalNative] AI config error', e);
      Alert.alert('AI error', e?.message || 'Failed to apply AI changes to exam setup.');
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
      Alert.alert('Saved', 'Exam configuration saved.');
    } catch (e: any) {
      console.error('[OrgExamPortalNative] save config error', e);
      const maybeData = e?.response?.data;
      const serverMessage =
        (maybeData && (maybeData.message || maybeData.error)) ||
        e?.message ||
        'Failed to save configuration';
      Alert.alert('Error', serverMessage);
    }
  };

  const handleSaveSheet = async () => {
    if (!ensureSessionSelected()) return;
    try {
      await saveSheet(selectedSessionId, classLabel || undefined, draftSheetRows);
      setDraftDirty(false);
      Alert.alert('Saved', 'Marks saved.');
    } catch (e: any) {
      console.error('[OrgExamPortalNative] save marks error', e);
      const maybeData = e?.response?.data;
      const serverMessage =
        (maybeData && (maybeData.message || maybeData.error)) ||
        e?.message ||
        'Failed to save marks';
      Alert.alert('Error', serverMessage);
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
              return {
                studentId: Number(r.student_user_id),
                percent: p,
              };
            })
            .sort((a, b) => b.percent - a.percent);

          const size = withPerc.length;
          const idx = withPerc.findIndex((row) => row.studentId === studentId);
          const rank = idx >= 0 ? idx + 1 : null;
          const meanPercent = withPerc.reduce((acc, r) => acc + r.percent, 0) / size || null;

          subjectPositions[subKey] = {
            rank,
            size,
            meanPercent,
          };
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
        console.error('[OrgExamPortalNative] fetchStudentCard error', e);
        setStudentCard(null);
        setStudentCardText(null);
        setReportRemarks(null);
        Alert.alert('Error', e?.message || 'Failed to load report card');
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
    try {
      const resp = await emailStudentCard(
        selectedSessionId,
        studentId,
        undefined // native: send to default guardian/student email
      );
      if (!resp.ok) {
        Alert.alert('Error', 'Failed to queue email.');
      } else {
        Alert.alert('Queued', `Report queued to: ${resp.to || '(guardian/student email)'}`);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e?.message || 'Failed to queue exam email');
    }
  };

  const filteredSheetRows = useMemo(() => {
    const base = draftSheetRows;
    if (!subjectFilter) return base;
    const q = subjectFilter.toLowerCase();
    return base.filter((r) => String(r.subject || '').toLowerCase().includes(q));
  }, [draftSheetRows, subjectFilter]);


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
      Alert.alert('Missing data', 'Select a learner and enter a subject.');
      return;
    }
    const studentIdNum = Number(newStudentId);
    if (!Number.isFinite(studentIdNum)) {
      Alert.alert('Invalid selection', 'Invalid learner selection.');
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

    
    const next = [...draftSheetRows, newRow];
    saveSheetDraftOnly(selectedSessionId, classLabel || undefined, next);

    setNewStudentId('');
    setNewSubject('');
  };

  const handleBulkAddClassForSubject = () => {
    if (!ensureSessionSelected()) return;

    const subject = newSubject.trim();
    const classKey = classLabel.trim().toLowerCase();
    const initialsTrimmed = teacherInitials.trim();

    if (!classKey) {
      Alert.alert(
        'Class label',
        'Enter the class label above (e.g. "Grade 7 Maple") before bulk adding.'
      );
      return;
    }
    if (!subject) {
      Alert.alert('Subject', 'Enter the subject name before bulk adding.');
      return;
    }

    const classLearners = rosterLearners.filter((l) => {
      if (!l.class_label) return false;
      return l.class_label.toLowerCase().includes(classKey);
    });

    if (!classLearners.length) {
      Alert.alert('No learners', 'No learners in roster match this class label.');
      return;
    }

    const existing = new Set(
     draftSheetRows.map((r) => `${r.student_user_id}::${String(r.subject || '').toLowerCase()}`)
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
      Alert.alert(
        'Already added',
        'All learners in this class already have rows for this subject.'
      );
      return;
    }

   const next = [...draftSheetRows, ...additions];
   saveSheetDraftOnly(selectedSessionId, classLabel || undefined, next);
  };

  const selectedSession = cfg.sessions.find((s) => s.id === selectedSessionId) || null;
  const selectedTerm = cfg.terms.find((t) => t.id === selectedSession?.term_id) || null;

  const handleDownloadPdf = useCallback(async () => {
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

    try {
      const url = await downloadStudentCardPdf(selectedSessionId, selectedStudentId, fileName); // url: string | null

      if (!url) {
        Alert.alert('Download error', 'No PDF URL was returned by the server.');
        return;
      }

      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Cannot open PDF', url);
        return;
      }

      await Linking.openURL(url);
    } catch (e: any) {
      console.error('[OrgExamPortalNative] download student PDF error', e);
      Alert.alert('Download failed', e?.message || 'Failed to open report card PDF.');
    }
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

  const handleDownloadClassPdf = useCallback(async () => {
    if (!ensureSessionSelected()) return;

    const trimmedClass = classLabel.trim();
    if (!trimmedClass) {
      Alert.alert('Class', 'Enter/select the class label above first (e.g. "Grade 7 Maple").');
      return;
    }

    if (!selectedSessionId) {
      Alert.alert('Exam', 'Please select an exam session first.');
      return;
    }

    const termPart = selectedTerm ? `${selectedTerm.year}-${selectedTerm.label}` : '';
    const examPart = selectedSession?.label || '';

    const pieces = [org?.name || 'school', trimmedClass, termPart, examPart, 'class-report']
      .map((p) => String(p || '').trim())
      .filter(Boolean);

    const base = slugify(pieces.join('_'));
    const fileName = `${base}.pdf`;

    try {
      const url = await downloadClassReportPdf(selectedSessionId, trimmedClass, fileName); // url: string | null

      if (!url) {
        Alert.alert('Download error', 'No class report PDF URL was returned by the server.');
        return;
      }

      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Cannot open PDF', url);
        return;
      }

      await Linking.openURL(url);
    } catch (e: any) {
      console.error('[OrgExamPortalNative] download class PDF error', e);
      Alert.alert('Download failed', e?.message || 'Failed to open class report PDF.');
    }
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
        console.error('[OrgExamPortalNative] save remarks error', data);
        Alert.alert('Error', data?.message || 'Failed to save remarks');
        return;
      }
    } catch (e: any) {
      console.error('[OrgExamPortalNative] save remarks error', e);
      Alert.alert('Error', e?.message || 'Failed to save remarks');
    }
  }, [selectedStudentId, selectedSessionId, orgId, backendUrl, authToken, reportRemarks]);

  const handleSaveAttendance = useCallback(async () => {
    const termId = selectedTerm?.id;

    if (!selectedStudentId || !termId || !orgId) {
      Alert.alert('Missing data', 'Select a learner, term, and exam before saving attendance.');
      return;
    }
    if (!authToken) {
      Alert.alert('Auth', 'You must be logged in to save attendance.');
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
      termId,
      lessonsHeld,
      lessonsAttended,
      behaviorRating,
      punctualityRating,
      teacherComment,
    };

    console.log('[OrgExamPortalNative] save attendance payload', {
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
        Alert.alert('Error', 'Failed to save attendance.');
        return;
      }

      setStudentCard((prev: any) => {
        if (!prev) return prev;

        const attended = lessonsAttended ?? null;
        const held = lessonsHeld ?? null;
        const pct = held && attended != null && held > 0 ? (attended / held) * 100 : null;

        const prevAttendance = (prev as any)?.attendance ?? {};

        return {
          ...prev,
          attendance: {
            ...prevAttendance,
            lessonsHeld: held,
            lessonsAttended: attended,
            behaviorRating,
            punctualityRating,
            teacherComment,
            attendancePercent: pct,
          },
        };
      });
    } catch (e: any) {
      console.error('[OrgExamPortalNative] save attendance error', e);
      Alert.alert('Error', e?.message || 'Failed to save attendance');
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
          Alert.alert('AI error', resp?.message || 'Failed to generate AI teacher behaviour note.');
          return;
        }

        const raw = (resp as any).principalRemark as string | null | undefined;
        if (!raw) return;

        const flat = raw.replace(/\s+/g, ' ').trim();
        const shortened = flat.length > 200 ? flat.slice(0, 200) : flat;

        setAttendanceForm((prev: AttendanceFormState) => ({
          ...prev,
          teacherComment: shortened,
        }));
      } catch (e: any) {
        console.error('[OrgExamPortalNative] AI teacher-comment error', e);
        Alert.alert('AI error', e?.message || 'Failed to generate AI teacher behaviour note.');
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
          Alert.alert('AI error', resp?.message || 'Failed to generate AI-powered remarks.');
          return;
        }

        const { principalRemark, subjectRemarks } = resp as {
          principalRemark?: string | null;
          subjectRemarks?: { subject: string; remark: string }[];
        };

        if (principalRemark) {
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

          await saveSheet(selectedSessionId, classLabel || undefined, updated);
        }
      } catch (e: any) {
        console.error('[OrgExamPortalNative] AI remarks error', e);
        Alert.alert('AI error', e?.message || 'Failed to generate AI remarks');
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

  // ───────────────────────────────────────────────────────────
  // UI helpers
  // ───────────────────────────────────────────────────────────
  const termLabel = (t: OrgExamTerm) => `${t.year} – ${t.label}`;
  const sessionLabel = (s: OrgExamSession) => s.label;

  const sessionsForSelectedTerm = cfg.sessions.filter(
    (s) => !selectedTermId || s.term_id === selectedTermId
  );

  // ✅ Style helper – return `any` array to keep TS happy with tailwind style
  const tabButtonStyles = (active: boolean, weight: number): any => [
    tw`px-3 py-2 rounded-xl mx-0.5 flex-row items-center justify-center`,
    {
      flex: weight,
      minWidth: 0,
      backgroundColor: active ? palette.accent : palette.chipBg,
      borderWidth: active ? 0 : 1,
      borderColor: active ? 'transparent' : palette.accentSoft,
    },
  ];

  const bottomPad = Math.max(24, insets.bottom + 24);

  const inputStyle = [
    tw`h-9 px-3 rounded-xl text-xs`,
    {
      backgroundColor: palette.inputBg,
      borderColor: palette.border,
      borderWidth: 1,
      color: palette.text,
    },
  ];

  return (
    <SafeAreaView
      style={[tw`flex-1`, { backgroundColor: palette.bg }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <GHScrollView
        ref={outerScrollRef}
        style={tw`flex-1`}
        contentContainerStyle={[tw`px-3 py-4`, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >

        <View style={tw`w-full self-center`}>
          {/* Header */}
          <View style={tw`mb-4`}>
            {/* Title + subtitle always on top */}
            <View style={tw`mb-3`}>
              <Text style={[tw`text-2xl font-bold`, { color: palette.text }]} numberOfLines={2}>
                {isLearnerView ? 'My exam results' : 'Exam Results & Reports'}
              </Text>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]} numberOfLines={3}>
                {isLearnerView
                  ? 'See your marks and download an official, school-branded report card.'
                  : 'Record marks, auto-grade, and send rich report cards to parents.'}
              </Text>
            </View>

            {/* Under the title: tabs / view strip */}
            {!isLearnerView && (
              <View
                style={[
                  tw`flex-row items-center rounded-2xl px-1.5 py-1`,
                  {
                    backgroundColor: palette.chipBg,
                    borderColor: palette.accentSoft,
                    borderWidth: 1,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => setTab('setup')}
                  style={tabButtonStyles(tab === 'setup', 0.9)} // smaller pill
                >
                  <Text
                    style={[
                      tw`text-xs font-bold`,
                      {
                        color: tab === 'setup' ? '#ffffff' : palette.textSoft,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    Setup
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTab('marks')}
                  style={tabButtonStyles(tab === 'marks', 1.1)} // medium
                >
                  <Text
                    style={[
                      tw`text-xs font-bold`,
                      {
                        color: tab === 'marks' ? '#ffffff' : palette.textSoft,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    Marks entry
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTab('reports')}
                  style={tabButtonStyles(tab === 'reports', 1.3)} // widest pill
                >
                  <Text
                    style={[
                      tw`text-xs font-bold`,
                      {
                        color: tab === 'reports' ? '#ffffff' : palette.textSoft,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    Reports & analytics
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {isLearnerView && (
              <View
                style={[
                  tw`flex-row items-center gap-2 px-3 py-1.5 rounded-full`,
                  {
                    backgroundColor: palette.stripBg,
                  },
                ]}
              >
                <View style={tw`h-2 w-2 rounded-full bg-emerald-400`} />
                <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                  Learner view – only your results
                </Text>
              </View>
            )}
          </View>

          {/* Selection strip */}
          <View style={tw`mb-4`}>
            {isLearnerView ? (
              <View style={palette.surface()}>
                <View style={tw`mb-2`}>
                  <Text style={[tw`text-xs font-semibold`, { color: palette.accentSoft }]}>
                    Exam selection
                  </Text>
                  <Text style={[tw`text-[11px] mt-0.5`, { color: palette.textSoft }]}>
                    Choose the term and exam you want to view your report card for.
                  </Text>
                </View>

                <View style={tw`gap-2`}>
                  {/* Term chips */}
                  <View>
                    <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>Term</Text>
                    <GHScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {cfg.terms.map((t) => {
                        const isActive = selectedTermId === t.id;
                        return (
                          <TouchableOpacity
                            key={t.id}
                            onPress={() => setSelectedTermId(t.id)}
                            style={[
                              tw`px-3 py-1 rounded-full mr-2 mb-1 border`,
                              {
                                backgroundColor: isActive ? palette.accent : palette.chipBg,
                                borderColor: isActive ? palette.accent : palette.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                tw`text-[11px]`,
                                {
                                  color: isActive ? '#ffffff' : palette.textSoft,
                                },
                              ]}
                            >
                              {termLabel(t)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {cfg.terms.length === 0 && (
                        <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                          No terms yet
                        </Text>
                      )}
                    </GHScrollView>
                  </View>

                  {/* Session chips */}
                  <View>
                    <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>Exam</Text>
                    <GHScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {sessionsForSelectedTerm.map((s) => {
                        const isActive = selectedSessionId === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            onPress={() => setSelectedSessionId(s.id)}
                            style={[
                              tw`px-3 py-1 rounded-full mr-2 mb-1 border`,
                              {
                                backgroundColor: isActive ? palette.accent : palette.chipBg,
                                borderColor: isActive ? palette.accent : palette.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                tw`text-[11px]`,
                                {
                                  color: isActive ? '#ffffff' : palette.textSoft,
                                },
                              ]}
                            >
                              {sessionLabel(s)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {sessionsForSelectedTerm.length === 0 && (
                        <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                          No exams yet
                        </Text>
                      )}
                    </GHScrollView>
                  </View>
                </View>
              </View>
            ) : (
              <View style={palette.surface()}>
                <View style={tw`flex-row flex-wrap items-center justify-between gap-y-2`}>
                  <View style={tw`flex-row flex-wrap items-center gap-2`}>
                    <Text style={[tw`text-xs font-semibold`, { color: palette.accentSoft }]}>
                      Active selection:
                    </Text>
                    <View
                      style={[
                        tw`px-2 py-0.5 rounded-full`,
                        {
                          backgroundColor: palette.pillBg,
                        },
                      ]}
                    >
                      <Text style={[tw`text-[11px]`, { color: palette.pillText }]}>
                        Term: {selectedTerm?.label ?? '—'}
                      </Text>
                    </View>
                    <View
                      style={[tw`px-2 py-0.5 rounded-full`, { backgroundColor: palette.pillBg }]}
                    >
                      <Text style={[tw`text-[11px]`, { color: palette.pillText }]}>
                        Exam: {selectedSession?.label ?? '—'}
                      </Text>
                    </View>
                    <View
                      style={[tw`px-2 py-0.5 rounded-full`, { backgroundColor: palette.pillBg }]}
                    >
                      <Text style={[tw`text-[11px]`, { color: palette.pillText }]}>
                        Class: {classLabel || '—'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Selectors */}
                <View style={tw`mt-3 gap-2`}>
                  {/* Term chips */}
                  <View>
                    <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>Term</Text>
                    <GHScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {cfg.terms.map((t) => {
                        const isActive = selectedTermId === t.id;
                        return (
                          <TouchableOpacity
                            key={t.id}
                            onPress={() => setSelectedTermId(t.id)}
                            style={[
                              tw`px-3 py-1 rounded-full mr-2 mb-1 border`,
                              {
                                backgroundColor: isActive ? palette.accent : palette.chipBg,
                                borderColor: isActive ? palette.accent : palette.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                tw`text-[11px]`,
                                {
                                  color: isActive ? '#ffffff' : palette.textSoft,
                                },
                              ]}
                            >
                              {termLabel(t)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {cfg.terms.length === 0 && (
                        <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                          No terms yet
                        </Text>
                      )}
                    </GHScrollView>
                  </View>

                  {/* Session chips */}
                  <View>
                    <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>Exam</Text>
                    <GHScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {sessionsForSelectedTerm.map((s) => {
                        const isActive = selectedSessionId === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            onPress={() => setSelectedSessionId(s.id)}
                            style={[
                              tw`px-3 py-1 rounded-full mr-2 mb-1 border`,
                              {
                                backgroundColor: isActive ? palette.accent : palette.chipBg,
                                borderColor: isActive ? palette.accent : palette.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                tw`text-[11px]`,
                                {
                                  color: isActive ? '#ffffff' : palette.textSoft,
                                },
                              ]}
                            >
                              {sessionLabel(s)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {sessionsForSelectedTerm.length === 0 && (
                        <Text style={[tw`text-[11px]`, { color: palette.textSoft }]}>
                          No exams yet
                        </Text>
                      )}
                    </GHScrollView>
                  </View>

                  {/* Class input */}
                  <View>
                    <Text style={[tw`text-[11px] mb-1`, { color: palette.textSoft }]}>
                      Class (e.g. Grade 7 Maple)
                    </Text>
                    <TextInput
                      value={classLabel}
                      onChangeText={setClassLabel}
                      placeholder="Class label"
                      placeholderTextColor={palette.textSoft}
                      style={inputStyle}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Main content – tabs */}
          <View style={tw`gap-4`}>
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

            {!isLearnerView && tab === 'marks' && (
             <OrgExamMarksTab
                parentScrollRef={outerScrollRef} 
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
                sheetRows={draftSheetRows}              // ✅ draft rows
                learnerById={learnerById}
                savingSheet={savingSheet}
                onAddRowFromRoster={handleAddRowFromRoster}
                onBulkAddClassForSubject={handleBulkAddClassForSubject}
                onSaveSheet={handleSaveSheet}           // ✅ real persist button
                onOpenStudentCard={handleOpenStudentCard}
                onEmailStudentCard={handleEmailStudentCard}
                saveSheet={saveSheetDraftOnly}          // ✅ local-only updates
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
          </View>
        </View>
      </GHScrollView>
    </SafeAreaView>
  );
};

export default OrgExamResultsPortalNative;

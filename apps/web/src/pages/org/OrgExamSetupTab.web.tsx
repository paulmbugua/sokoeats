import React from 'react';
import type { OrgExamConfig, OrgExamGradingBand } from '@mytutorapp/shared/types';

type OrgExamSetupTabProps = {
  editingConfig: OrgExamConfig;
  setEditingConfig: React.Dispatch<React.SetStateAction<OrgExamConfig>>;
  configLoading: boolean;
  onAddTerm: () => void;
  onAddSession: () => void;
  onApplyBandsPreset: () => void;
  onSaveConfig: () => void;

  // NEW: AI support
  onRunAiConfig?: (instructions: string) => Promise<void> | void;
  configAiLoading?: boolean;
};

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
  const [aiPrompt, setAiPrompt] = React.useState('');

  const handleAiClick = () => {
    if (!onRunAiConfig) return;
    const value = aiPrompt.trim();
    if (!value) {
      alert('Type a short instruction for the AI first.');
      return;
    }
    void onRunAiConfig(value);
  };

  const busy = configLoading || configAiLoading;

  return (
    <div className="space-y-4">
      {/* AI assistant strip */}
      <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-gradient-to-r from-white to-[#f3f7fc] dark:from-[#050b12] dark:to-[#0f1823] p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0f172a] text-white text-xs">
              AI
            </span>
            Let AI help with your exam setup
          </h2>
          <p className="mt-1 text-[11px] sm:text-xs text-[#49739c] dark:text-darkTextSecondary">
            Describe what you want &mdash; create terms, exams/semesters, or grading bands. You can
            also ask to delete items by name.
          </p>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-[#49739c] dark:text-darkTextSecondary">
            <span className="px-2 py-0.5 rounded-full bg-[#e7edf4] dark:bg-[#172534]">
              “Create 3 terms for 2025 with Midterm and End Term in each”
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#e7edf4] dark:bg-[#172534]">
              “Use grading A–E, delete F”
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#e7edf4] dark:bg-[#172534]">
              “Remove the Trial Exam and keep only Final Exam this year”
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:w-[260px]">
          <textarea
            className="w-full min-h-[60px] rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#3d99f5]"
            placeholder="E.g. “Create Term 1 & Term 2 for 2026 and delete grade E from the bands.”"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <button
            type="button"
            onClick={handleAiClick}
            disabled={!onRunAiConfig || busy}
            className={[
              'h-9 px-3 rounded-xl text-xs font-semibold flex items-center justify-center',
              !onRunAiConfig || busy
                ? 'bg-[#9bbce6] dark:bg-[#243549] text-white cursor-not-allowed'
                : 'bg-[#0f172a] text-white hover:bg-[#1f2937] dark:bg-[#3d99f5] dark:hover:bg-[#2f7fd0]',
            ].join(' ')}
          >
            {configAiLoading
              ? 'AI is updating…'
              : configLoading
                ? 'Saving…'
                : 'Apply with AI (preview)'}
          </button>
          <p className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
            Changes are only saved when you click <strong>Save configuration</strong>.
          </p>
        </div>
      </div>
      {/* Report card title (global default) */}
      <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold">Report card title</h2>
            <p className="text-[11px] sm:text-xs text-[#49739c] dark:text-darkTextSecondary">
              This title appears at the top of each learner&apos;s report card PDF. Leave blank to
              use <strong>TERM REPORT CARD</strong>.
            </p>
          </div>
        </div>

        <input
          type="text"
          className="mt-1 w-full h-9 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#3d99f5]"
          placeholder='E.g. "Term Report Card", "Progress Report", "End of Year Report"'
          value={editingConfig.reportTitle ?? ''}
          onChange={(e) =>
            setEditingConfig((prev) => ({
              ...prev,
              reportTitle: e.target.value,
            }))
          }
        />
        <p className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
          You can also mention a preferred title in your AI instructions, e.g. &nbsp;
          <em>“Use ‘Mid-Year Progress Report’ as the card title and create 3 terms…”</em>
        </p>
      </div>

      {/* Main grid: terms/sessions + grading bands */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Terms & sessions */}
        <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold">Terms &amp; exams</h2>
            <button
              className="h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
              onClick={onAddTerm}
              type="button"
            >
              + Add term
            </button>
          </div>

          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {editingConfig.terms.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-[#e7edf4] dark:border-darkCard bg-slate-50/70 dark:bg-[#0b1420] p-2.5 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {t.year} – {t.label}
                  </span>
                  <label className="flex items-center gap-1 text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                    <input
                      type="checkbox"
                      checked={t.is_active}
                      onChange={(e) =>
                        setEditingConfig((prev) => ({
                          ...prev,
                          terms: prev.terms.map((x) =>
                            x.id === t.id ? { ...x, is_active: e.target.checked } : x
                          ),
                        }))
                      }
                    />
                    Active
                  </label>
                </div>
                <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                  Exams:{' '}
                  {editingConfig.sessions
                    .filter((s) => s.term_id === t.id)
                    .map((s) => s.label)
                    .join(', ') || 'none yet'}
                </div>
              </div>
            ))}

            {!editingConfig.terms.length && (
              <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                No terms yet. Add a term or let AI create them for you.
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#49739c] dark:text-darkTextSecondary">
                Exam sessions
              </span>
              <span className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                Attach exams to terms and assign weight for yearly averages.
              </span>
            </div>
            <button
              className="h-9 px-3 rounded-xl bg-[#3d99f5] text-white text-xs font-semibold"
              onClick={onAddSession}
              type="button"
            >
              + Add exam
            </button>
          </div>

          <div className="max-h-[220px] overflow-y-auto space-y-1">
            {editingConfig.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1 bg-[#e7edf4] dark:bg-[#172534]"
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{s.label}</span>
                  <span className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                    {editingConfig.terms.find((t) => t.id === s.term_id)?.label || 'Unassigned'} •
                    weight {s.weight}
                  </span>
                </div>
              </div>
            ))}

            {!editingConfig.sessions.length && (
              <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                No exams configured yet.
              </div>
            )}
          </div>
        </div>

        {/* Grading bands */}
        <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-bold">Grading bands</h2>
              <p className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                Used to auto-grade each subject and overall score.
              </p>
            </div>
            <button
              className="h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
              onClick={onApplyBandsPreset}
              type="button"
            >
              Use default preset
            </button>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="text-left text-[#49739c] dark:text-darkTextSecondary">
                <tr>
                  <th className="py-1 pr-2">Grade</th>
                  <th className="py-1 pr-2">% range</th>
                  <th className="py-1 pr-2">Remark</th>
                </tr>
              </thead>
              <tbody>
                {editingConfig.gradingBands.map((b, idx) => (
                  <tr key={idx} className="border-t border-[#e7edf4] dark:border-darkCard">
                    <td className="py-1 pr-2">
                      <input
                        className="w-16 h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-xs"
                        value={b.grade}
                        onChange={(e) =>
                          setEditingConfig((prev) => {
                            const bands = [...prev.gradingBands];
                            bands[idx] = { ...bands[idx], grade: e.target.value };
                            return {
                              ...prev,
                              gradingBands: bands as OrgExamGradingBand[],
                            };
                          })
                        }
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="w-16 h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-1 text-xs"
                          value={b.min_percent}
                          onChange={(e) =>
                            setEditingConfig((prev) => {
                              const bands = [...prev.gradingBands];
                              bands[idx] = {
                                ...bands[idx],
                                min_percent: Number(e.target.value) || 0,
                              };
                              return {
                                ...prev,
                                gradingBands: bands as OrgExamGradingBand[],
                              };
                            })
                          }
                        />
                        <span className="text-[11px]">to</span>
                        <input
                          type="number"
                          className="w-16 h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-1 text-xs"
                          value={b.max_percent}
                          onChange={(e) =>
                            setEditingConfig((prev) => {
                              const bands = [...prev.gradingBands];
                              bands[idx] = {
                                ...bands[idx],
                                max_percent: Number(e.target.value) || 0,
                              };
                              return {
                                ...prev,
                                gradingBands: bands as OrgExamGradingBand[],
                              };
                            })
                          }
                        />
                      </div>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full h-8 rounded-lg border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-2 text-xs"
                        value={b.remark ?? ''}
                        onChange={(e) =>
                          setEditingConfig((prev) => {
                            const bands = [...prev.gradingBands];
                            bands[idx] = { ...bands[idx], remark: e.target.value };
                            return {
                              ...prev,
                              gradingBands: bands as OrgExamGradingBand[],
                            };
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {!editingConfig.gradingBands.length && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-3 text-xs text-[#49739c] dark:text-darkTextSecondary"
                    >
                      No grading bands yet. Use the preset or ask AI to create a grading scale.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              className="h-9 px-4 rounded-xl bg-[#3d99f5] text-white text-sm font-semibold disabled:bg-[#9bbce6] disabled:cursor-not-allowed"
              onClick={onSaveConfig}
              disabled={busy}
              type="button"
            >
              {busy ? 'Saving…' : 'Save configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgExamSetupTab;

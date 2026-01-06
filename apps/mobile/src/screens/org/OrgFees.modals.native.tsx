import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tw from '../../../tailwind';

import type { LearnerLite } from './OrgFees.shared.native';
import {
  moneyFromCents,
  pickAdmissionCode,
  pickLearnerId,
  pickLearnerName,
  toCents,
  calcTotalsPerCurrency,
} from './OrgFees.shared.native';
import { Badge, CircleCheckbox, EmptyState, Modal, MoneyStack, useFeeTheme } from './OrgFees.ui.native';

const Btn = ({ theme, label, onPress, kind = 'primary', disabled, loading }: any) => {
  const bg =
    kind === 'primary' ? theme.primary : kind === 'dark' ? (theme.dark ? '#334155' : '#0f172a') : 'transparent';
  const borderColor = kind === 'ghost' ? theme.border : 'transparent';
  const textColor = kind === 'ghost' ? theme.text : '#fff';

  return (
    <TouchableOpacity
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        tw`px-4 py-3 rounded-2xl border`,
        {
          backgroundColor: disabled || loading ? theme.border : bg,
          borderColor,
          opacity: disabled || loading ? 0.6 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[tw`text-sm font-semibold text-center`, { color: textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

const Chip = ({ theme, active, label, onPress, disabled }: any) => (
  <TouchableOpacity
    disabled={disabled}
    onPress={onPress}
    style={[
      tw`px-3 py-2 rounded-full border mr-2 mb-2`,
      {
        borderColor: active ? theme.primary : theme.border,
        backgroundColor: active ? theme.primarySoft : 'transparent',
        opacity: disabled ? 0.55 : 1,
      },
    ]}
  >
    <Text style={[tw`text-xs font-semibold`, { color: active ? theme.primary : theme.text }]}>{label}</Text>
  </TouchableOpacity>
);

const Field = ({ theme, label, value, onChange, placeholder, multiline, height }: any) => (
  <View style={tw`mb-3`}>
    <Text style={[tw`text-xs uppercase tracking-wider mb-1`, { color: theme.muted }]}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      multiline={multiline}
      style={[
        tw`rounded-2xl px-3 py-3 border`,
        {
          borderColor: theme.border,
          backgroundColor: theme.card,
          color: theme.text,
          minHeight: height,
          textAlignVertical: multiline ? 'top' : 'center',
        },
      ]}
    />
  </View>
);

function norm(s: any) {
  return String(s || '').trim().toLowerCase();
}

function findLearnerById(learners: LearnerLite[], id: string) {
  const key = String(id || '').trim();
  if (!key) return null;
  return (learners || []).find((l) => String(pickLearnerId(l) || '').trim() === key) || null;
}

/**
 * ✅ Compact learner picker:
 * - shows current selection
 * - does NOT auto-populate a learner list
 * - only shows results AFTER user types search
 */
function CompactLearnerPicker({
  theme,
  learners,
  value,
  onChange,
  title = 'Learner',
  hint = 'Type name / ADM / ID…',
}: any) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const selected = useMemo(() => findLearnerById(learners, value), [learners, value]);

  const results = useMemo(() => {
    const query = norm(q);
    if (!open) return [];
    if (!query) return []; // ✅ important: no population unless user types
    const base = Array.isArray(learners) ? learners : [];
    return base
      .filter((l) => {
        const name = norm(pickLearnerName(l));
        const adm = norm(pickAdmissionCode(l));
        const id = norm(pickLearnerId(l));
        return name.includes(query) || adm.includes(query) || id.includes(query);
      })
      .slice(0, 10);
  }, [learners, q, open]);

  return (
    <View style={tw`mb-3`}>
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <Text style={[tw`text-xs uppercase tracking-wider`, { color: theme.muted }]}>{title}</Text>

        <TouchableOpacity
          onPress={() => {
            setOpen((v) => !v);
            setQ('');
          }}
          style={[tw`px-3 py-2 rounded-2xl border`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}
        >
          <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>{open ? 'Close' : 'Change'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[tw`rounded-2xl border p-3`, { borderColor: theme.border, backgroundColor: theme.card }]}>
        {selected ? (
          <>
            <Text style={[tw`text-sm font-bold`, { color: theme.text }]} numberOfLines={1}>
              {pickLearnerName(selected)}
            </Text>
            <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]} numberOfLines={1}>
              ADM: {pickAdmissionCode(selected) || '—'} • ID: {String(pickLearnerId(selected) || '')}
            </Text>
          </>
        ) : (
          <Text style={[tw`text-sm`, { color: theme.subtext }]}>No learner selected (select from Balances first).</Text>
        )}
      </View>

      {open ? (
        <View style={tw`mt-3`}>
          <Field theme={theme} label="Search" value={q} onChange={setQ} placeholder={hint} />

          {q.trim() ? (
            <View style={[tw`rounded-2xl border`, { borderColor: theme.border }]}>
              {results.map((l: LearnerLite) => {
                const id = String(pickLearnerId(l) || '').trim();
                const selectedNow = id && id === String(value || '').trim();
                return (
                  <TouchableOpacity
                    key={id || `${pickLearnerName(l)}-${pickAdmissionCode(l)}`}
                    onPress={() => {
                      if (!id) return;
                      onChange(id);
                      setOpen(false);
                      setQ('');
                    }}
                    style={[
                      tw`p-3 border-b`,
                      { borderBottomColor: theme.border, backgroundColor: selectedNow ? theme.primarySoft : 'transparent' },
                    ]}
                  >
                    <Text style={[tw`text-sm font-semibold`, { color: theme.text }]} numberOfLines={1}>
                      {pickLearnerName(l)}
                    </Text>
                    <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]} numberOfLines={1}>
                      ADM: {pickAdmissionCode(l) || '—'} • ID: {id || '—'}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {results.length === 0 ? (
                <View style={tw`p-3`}>
                  <Text style={[tw`text-sm`, { color: theme.subtext }]}>No matches.</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={[tw`text-[11px]`, { color: theme.muted }]}>
              Start typing to search. (No list will show until you type.)
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

/* ───────────────────────────────────────────────
 * UnmatchedPaymentsModal (native)
 * ─────────────────────────────────────────────── */

export function UnmatchedPaymentsModal({
  title,
  onClose,
  loading,
  rows,
  learners,
  onRefresh,
  onAttach,
  theme: explicitTheme,
}: {
  title: string;
  onClose: () => void;
  loading: boolean;
  rows: Array<any>;
  learners: LearnerLite[];
  onRefresh: () => Promise<void>;
  onAttach: (inboundId: string | number, learnerId: string) => Promise<void>;
  theme?: any;
}) {
  const theme = useFeeTheme(explicitTheme);

  const [selectedInboundId, setSelectedInboundId] = useState<string | number | null>(null);
  const [selectedLearnerId, setSelectedLearnerId] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal title={title} onClose={onClose} theme={theme}>
      <View style={tw`space-y-3`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={[tw`text-xs`, { color: theme.muted }]}>{loading ? 'Loading…' : `${rows?.length || 0} unmatched`}</Text>

          <TouchableOpacity
            onPress={onRefresh}
            style={[tw`px-3 py-2 rounded-2xl border`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}
          >
            <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {!loading && (!rows || rows.length === 0) ? (
          <EmptyState theme={theme} title="No unmatched payments" body="You’re all caught up." />
        ) : (
          <View style={[tw`rounded-2xl border`, { borderColor: theme.border }]}>
            {loading ? (
              <View style={tw`p-4`}>
                <ActivityIndicator />
              </View>
            ) : (
              <View>
                {(rows || []).slice(0, 60).map((r) => {
                  const selected = selectedInboundId === r.id;
                  return (
                    <TouchableOpacity
                      key={String(r.id)}
                      onPress={() => setSelectedInboundId(r.id)}
                      style={[
                        tw`p-3 border-b`,
                        {
                          borderBottomColor: theme.border,
                          backgroundColor: selected ? theme.primarySoft : 'transparent',
                        },
                      ]}
                    >
                      <View style={tw`flex-row items-start justify-between`}>
                        <View style={tw`flex-1 pr-3`}>
                          <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>
                            {moneyFromCents(Number(r.amount_cents || 0), r.currency || 'USD')}
                          </Text>
                          <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                            {r.reference ? `Ref: ${r.reference}` : 'No reference'}
                            {r.payer_phone ? ` • ${r.payer_phone}` : ''}
                          </Text>
                          <Text style={[tw`text-[11px] mt-1`, { color: theme.muted }]}>
                            {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                          </Text>
                        </View>
                        <Badge theme={theme} tone="warn">
                          Unmatched
                        </Badge>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={tw`mt-3`}>
          <Text style={[tw`text-xs font-bold`, { color: theme.subtext }]}>Attach to learner</Text>

          {/* ✅ no auto list — only searchable */}
          <CompactLearnerPicker
            theme={theme}
            learners={learners}
            value={selectedLearnerId}
            onChange={setSelectedLearnerId}
            title="Learner"
          />

          <Btn
            theme={theme}
            kind="primary"
            disabled={!selectedInboundId || !selectedLearnerId || saving}
            label={saving ? 'Attaching…' : 'Attach'}
            onPress={async () => {
              if (!selectedInboundId || !selectedLearnerId) return;
              setSaving(true);
              try {
                await onAttach(selectedInboundId, selectedLearnerId);
                setSelectedInboundId(null);
                setSelectedLearnerId('');
              } finally {
                setSaving(false);
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/* ───────────────────────────────────────────────
 * Charge modal (single / class-bulk) with confirm step
 * - ✅ no learner list auto-population
 * - ✅ bulk: by class (no checkbox list)
 * ─────────────────────────────────────────────── */

type PendingCharge = { payload: any; isBulk: boolean };

export function ResponsiveChargeModal({
  title,
  onClose,
  learners,
  classLabels,
  selectedLearnerId,
  defaultCurrency,
  currencyHintForLearner,
  learnerCurrenciesMap,
  onCharge,
  theme: explicitTheme,
}: {
  title: string;
  onClose: () => void;
  learners: LearnerLite[];
  classLabels: string[];
  selectedLearnerId: string;
  defaultCurrency: string;
  currencyHintForLearner: (learnerId: string) => string;
  learnerCurrenciesMap: Map<string, string[]>;
  onCharge: (payload: any, isBulk?: boolean) => Promise<void>;
  theme?: any;
}) {
  const theme = useFeeTheme(explicitTheme);

  const [mode, setMode] = useState<'single' | 'class'>('single');

  const [chargeLearnerId, setChargeLearnerId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeCurrency, setChargeCurrency] = useState(() => String(defaultCurrency || 'USD').toUpperCase());
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeClassLabel, setChargeClassLabel] = useState('');
  const [chargeDueDate, setChargeDueDate] = useState(''); // yyyy-mm-dd

  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [ack, setAck] = useState(false);
  const [pending, setPending] = useState<PendingCharge | null>(null);

  useEffect(() => {
    if (step === 'confirm') setAck(false);
  }, [step]);

  useEffect(() => {
    if (selectedLearnerId) {
      setChargeLearnerId(selectedLearnerId);
      setChargeCurrency(currencyHintForLearner(selectedLearnerId));
    }
  }, [selectedLearnerId, currencyHintForLearner]);

  useEffect(() => {
    if (mode === 'class') {
      setChargeCurrency(String(defaultCurrency || 'USD').toUpperCase());
      return;
    }
    if (chargeLearnerId) setChargeCurrency(currencyHintForLearner(chargeLearnerId));
  }, [chargeLearnerId, mode, currencyHintForLearner, defaultCurrency]);

  const amount_cents = toCents(chargeAmount);

  const existingCurrencies = mode === 'single' ? learnerCurrenciesMap.get(String(chargeLearnerId)) || [] : [];
  const isMismatch =
    mode === 'single' &&
    existingCurrencies.length > 0 &&
    !existingCurrencies.includes(String(chargeCurrency).toUpperCase());

  const bulkLearnerIds = useMemo(() => {
    if (mode !== 'class') return [];
    const base = Array.isArray(learners) ? learners : [];
    const filtered = chargeClassLabel ? base.filter((l) => String(l.class_label || '') === chargeClassLabel) : base;
    return filtered
      .map((l) => String(pickLearnerId(l) || '').trim())
      .filter((x) => x && x !== 'undefined' && x !== 'null');
  }, [mode, learners, chargeClassLabel]);

  const canSubmitSingle = Boolean(chargeLearnerId) && amount_cents > 0;
  const canSubmitBulk = bulkLearnerIds.length > 0 && amount_cents > 0;

  return (
    <Modal title={title} onClose={onClose} theme={theme}>
      <View>
        <View style={tw`flex-row flex-wrap mb-2`}>
          <Chip theme={theme} label="Single learner" active={mode === 'single'} onPress={() => setMode('single')} />
          <Chip theme={theme} label="Bulk by class" active={mode === 'class'} onPress={() => setMode('class')} />
        </View>

        {step === 'confirm' && pending ? (
          <View style={[tw`rounded-3xl border p-4`, { borderColor: theme.warnBorder, backgroundColor: theme.warnBg }]}>
            <Text style={[tw`text-sm font-bold`, { color: theme.warnText }]}>Confirm & commit</Text>
            <Text style={[tw`text-sm mt-1`, { color: theme.warnText }]}>
              This posts immediately to statements & balances. It can’t be undone.
            </Text>

            <View
              style={[
                tw`rounded-2xl p-3 mt-3`,
                { backgroundColor: theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.60)' },
              ]}
            >
              <Text style={[tw`text-xs font-bold`, { color: theme.subtext }]}>Summary</Text>

              <Text style={[tw`text-sm mt-2`, { color: theme.text }]}>
                <Text style={tw`font-bold`}>Type:</Text>{' '}
                {pending.isBulk ? `Bulk (${pending.payload.learner_ids?.length || 0} learners)` : 'Single learner'}
              </Text>

              <Text style={[tw`text-sm mt-1`, { color: theme.text }]}>
                <Text style={tw`font-bold`}>Amount:</Text>{' '}
                {moneyFromCents(Number(pending.payload.amount_cents || 0), pending.payload.currency)}
              </Text>

              {pending.payload.description ? (
                <Text style={[tw`text-sm mt-1`, { color: theme.text }]}>
                  <Text style={tw`font-bold`}>Description:</Text> {pending.payload.description}
                </Text>
              ) : null}

              {pending.payload.due_date ? (
                <Text style={[tw`text-sm mt-1`, { color: theme.text }]}>
                  <Text style={tw`font-bold`}>Due date:</Text> {pending.payload.due_date}
                </Text>
              ) : null}

              {isMismatch ? (
                <Text style={[tw`text-xs mt-2`, { color: theme.subtext }]}>
                  Note: this creates a new currency bucket for this learner.
                </Text>
              ) : null}
            </View>

            <View style={tw`mt-3`}>
              <CircleCheckbox theme={theme} checked={ack} onChange={setAck} label="I understand this action is irreversible." />
            </View>

            <View style={tw`mt-3`}>
              <Btn theme={theme} kind="ghost" label="Back to edit" onPress={() => setStep('form')} />
            </View>

            <View style={tw`mt-2`}>
              <Btn
                theme={theme}
                kind="primary"
                disabled={!ack || saving}
                label={saving ? 'Saving…' : 'Confirm & commit'}
                onPress={async () => {
                  if (!pending) return;
                  setSaving(true);
                  try {
                    await onCharge(pending.payload, pending.isBulk);
                    setChargeAmount('');
                    setChargeDesc('');
                    setChargeDueDate('');
                    setPending(null);
                    setStep('form');
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            </View>
          </View>
        ) : (
          <>
            {mode === 'single' ? (
              <CompactLearnerPicker
                theme={theme}
                learners={learners}
                value={chargeLearnerId}
                onChange={setChargeLearnerId}
                title="Learner"
              />
            ) : (
              <View style={tw`mb-3`}>
                <Text style={[tw`text-xs uppercase tracking-wider mb-2`, { color: theme.muted }]}>Class</Text>
                <View style={tw`flex-row flex-wrap`}>
                  <Chip theme={theme} label="All classes" active={!chargeClassLabel} onPress={() => setChargeClassLabel('')} />
                  {(classLabels || []).slice(0, 12).map((c) => (
                    <Chip key={c} theme={theme} label={c} active={chargeClassLabel === c} onPress={() => setChargeClassLabel(c)} />
                  ))}
                </View>

                <View style={[tw`rounded-2xl border p-3 mt-2`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}>
                  <Text style={[tw`text-sm`, { color: theme.text }]}>
                    Will charge <Text style={tw`font-bold`}>{bulkLearnerIds.length}</Text> learner(s).
                  </Text>
                  <Text style={[tw`text-[11px] mt-1`, { color: theme.muted }]}>
                    (No learner list here — selection stays in Balances. Bulk uses roster behind the scenes.)
                  </Text>
                </View>
              </View>
            )}

            <Field theme={theme} label="Amount" value={chargeAmount} onChange={setChargeAmount} placeholder="e.g. 25.00" />

            <Text style={[tw`text-xs uppercase tracking-wider mb-2`, { color: theme.muted }]}>Currency</Text>
            <View style={tw`flex-row flex-wrap`}>
              {['USD', 'KES', 'QAR'].map((cur) => (
                <Chip
                  key={cur}
                  theme={theme}
                  label={cur}
                  active={chargeCurrency === cur}
                  disabled={mode === 'class'}
                  onPress={() => setChargeCurrency(cur)}
                />
              ))}
            </View>

            {isMismatch ? (
              <Text style={[tw`text-[11px] mt-1`, { color: theme.warnText }]}>
                This learner has history in: <Text style={tw`font-bold`}>{existingCurrencies.join(', ')}</Text>. Charging in{' '}
                <Text style={tw`font-bold`}>{chargeCurrency}</Text> starts a new currency bucket.
              </Text>
            ) : null}

            <Field theme={theme} label="Description" value={chargeDesc} onChange={setChargeDesc} placeholder="e.g. Tuition fee - Term 1" />
            <Field theme={theme} label="Due date (optional)" value={chargeDueDate} onChange={setChargeDueDate} placeholder="YYYY-MM-DD" />

            <View style={[tw`rounded-2xl border p-3`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}>
              <Text style={[tw`text-xs`, { color: theme.subtext }]}>
                Preview: <Text style={tw`font-bold`}>{moneyFromCents(amount_cents, chargeCurrency)}</Text>
              </Text>
            </View>

            <View style={tw`mt-3`}>
              <Btn theme={theme} kind="ghost" label="Cancel" onPress={onClose} />
            </View>

            <View style={tw`mt-2`}>
              <Btn
                theme={theme}
                kind="primary"
                disabled={(mode === 'single' ? !canSubmitSingle : !canSubmitBulk) || saving}
                label={mode === 'class' ? `Review charges (${bulkLearnerIds.length})` : 'Review charge'}
                onPress={() => {
                  if (amount_cents <= 0) return;

                  const payload =
                    mode === 'single'
                      ? {
                          learner_id: chargeLearnerId,
                          amount_cents,
                          currency: chargeCurrency,
                          description: chargeDesc || undefined,
                          due_date: chargeDueDate || undefined,
                        }
                      : {
                          learner_ids: bulkLearnerIds,
                          amount_cents,
                          currency: chargeCurrency,
                          description: chargeDesc || undefined,
                          class_label: chargeClassLabel || undefined,
                          due_date: chargeDueDate || undefined,
                        };

                  setPending({ payload, isBulk: mode === 'class' });
                  setStep('confirm');
                }}
              />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/* ───────────────────────────────────────────────
 * Payment modal with confirm step
 * - ✅ no learner list auto-population
 * ─────────────────────────────────────────────── */

type PendingPayment = {
  learner_id: string;
  amount_cents: number;
  currency: string;
  method?: string;
  reference?: string;
  note?: string;
  received_at?: string;
};

export function ResponsivePaymentModal({
  title,
  onClose,
  learners,
  selectedLearnerId,
  defaultCurrency,
  currencyHintForLearner,
  learnerCurrenciesMap,
  onPayment,
  theme: explicitTheme,
}: {
  title: string;
  onClose: () => void;
  learners: LearnerLite[];
  selectedLearnerId: string;
  defaultCurrency: string;
  currencyHintForLearner: (learnerId: string) => string;
  learnerCurrenciesMap: Map<string, string[]>;
  onPayment: (payload: any) => Promise<void>;
  theme?: any;
}) {
  const theme = useFeeTheme(explicitTheme);

  const [payLearnerId, setPayLearnerId] = useState('');
  const [payCurrency, setPayCurrency] = useState(() => String(defaultCurrency || 'USD').toUpperCase());
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payReceivedAt, setPayReceivedAt] = useState(''); // ISO or local string
  const [saving, setSaving] = useState(false);

  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [ack, setAck] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);

  useEffect(() => {
    if (step === 'confirm') setAck(false);
  }, [step]);

  useEffect(() => {
    if (selectedLearnerId) {
      setPayLearnerId(selectedLearnerId);
      setPayCurrency(currencyHintForLearner(selectedLearnerId));
    }
  }, [selectedLearnerId, currencyHintForLearner]);

  useEffect(() => {
    if (payLearnerId) setPayCurrency(currencyHintForLearner(payLearnerId));
  }, [payLearnerId, currencyHintForLearner]);

  const amount_cents = toCents(payAmount);

  const existingCurrencies = learnerCurrenciesMap.get(String(payLearnerId)) || [];
  const isMismatch = existingCurrencies.length > 0 && !existingCurrencies.includes(String(payCurrency).toUpperCase());

  return (
    <Modal title={title} onClose={onClose} theme={theme}>
      <View>
        {step === 'confirm' && pending ? (
          <View style={[tw`rounded-3xl border p-4`, { borderColor: theme.warnBorder, backgroundColor: theme.warnBg }]}>
            <Text style={[tw`text-sm font-bold`, { color: theme.warnText }]}>Confirm & commit</Text>
            <Text style={[tw`text-sm mt-1`, { color: theme.warnText }]}>
              This posts immediately to statement & balances. It can’t be undone.
            </Text>

            <View
              style={[
                tw`rounded-2xl p-3 mt-3`,
                { backgroundColor: theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.60)' },
              ]}
            >
              <Text style={[tw`text-xs font-bold`, { color: theme.subtext }]}>Summary</Text>

              <Text style={[tw`text-sm mt-2`, { color: theme.text }]}>
                <Text style={tw`font-bold`}>Amount:</Text> {moneyFromCents(pending.amount_cents, pending.currency)}
              </Text>

              <Text style={[tw`text-sm mt-1`, { color: theme.text }]}>
                <Text style={tw`font-bold`}>Method:</Text> {pending.method || '—'}
              </Text>

              {pending.reference ? (
                <Text style={[tw`text-sm mt-1`, { color: theme.text }]}>
                  <Text style={tw`font-bold`}>Reference:</Text> {pending.reference}
                </Text>
              ) : null}

              {pending.received_at ? (
                <Text style={[tw`text-sm mt-1`, { color: theme.text }]}>
                  <Text style={tw`font-bold`}>Received at:</Text> {new Date(pending.received_at).toLocaleString()}
                </Text>
              ) : null}

              {pending.note ? (
                <Text style={[tw`text-sm mt-1`, { color: theme.text }]}>
                  <Text style={tw`font-bold`}>Note:</Text> {pending.note}
                </Text>
              ) : null}

              {isMismatch ? (
                <Text style={[tw`text-xs mt-2`, { color: theme.subtext }]}>
                  Note: This payment will be tracked in a separate currency bucket.
                </Text>
              ) : null}
            </View>

            <View style={tw`mt-3`}>
              <CircleCheckbox theme={theme} checked={ack} onChange={setAck} label="I understand this action is irreversible." />
            </View>

            <View style={tw`mt-3`}>
              <Btn theme={theme} kind="ghost" label="Back to edit" onPress={() => setStep('form')} />
            </View>

            <View style={tw`mt-2`}>
              <Btn
                theme={theme}
                kind="dark"
                disabled={!ack || saving}
                label={saving ? 'Saving…' : 'Confirm & commit'}
                onPress={async () => {
                  setSaving(true);
                  try {
                    await onPayment(pending);

                    setPayAmount('');
                    setPayReference('');
                    setPayNote('');
                    setPayReceivedAt('');
                    setPending(null);
                    setStep('form');
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            </View>
          </View>
        ) : (
          <>
            <CompactLearnerPicker
              theme={theme}
              learners={learners}
              value={payLearnerId}
              onChange={setPayLearnerId}
              title="Learner"
            />

            <Field theme={theme} label="Amount" value={payAmount} onChange={setPayAmount} placeholder="e.g. 10.00" />

            <Text style={[tw`text-xs uppercase tracking-wider mb-2`, { color: theme.muted }]}>Currency</Text>
            <View style={tw`flex-row flex-wrap`}>
              {['USD', 'KES', 'QAR'].map((cur) => (
                <Chip key={cur} theme={theme} label={cur} active={payCurrency === cur} onPress={() => setPayCurrency(cur)} />
              ))}
            </View>

            {isMismatch ? (
              <Text style={[tw`text-[11px] mt-1`, { color: theme.warnText }]}>
                This learner has history in: <Text style={tw`font-bold`}>{existingCurrencies.join(', ')}</Text>. Recording in{' '}
                <Text style={tw`font-bold`}>{payCurrency}</Text> will be tracked separately.
              </Text>
            ) : null}

            <Field theme={theme} label="Method" value={payMethod} onChange={setPayMethod} placeholder="cash / mpesa / bank_transfer" />
            <Field theme={theme} label="Reference (optional)" value={payReference} onChange={setPayReference} placeholder="Receipt / transaction id" />
            <Field theme={theme} label="Note (optional)" value={payNote} onChange={setPayNote} placeholder="Any extra notes…" />
            <Field theme={theme} label="Received at (optional)" value={payReceivedAt} onChange={setPayReceivedAt} placeholder="Leave blank to use created_at" />

            <View style={[tw`rounded-2xl border p-3`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}>
              <Text style={[tw`text-xs`, { color: theme.subtext }]}>
                Preview: <Text style={tw`font-bold`}>{moneyFromCents(amount_cents, payCurrency)}</Text>
              </Text>
            </View>

            <View style={tw`mt-3`}>
              <Btn theme={theme} kind="ghost" label="Cancel" onPress={onClose} />
            </View>

            <View style={tw`mt-2`}>
              <Btn
                theme={theme}
                kind="dark"
                disabled={!payLearnerId || amount_cents <= 0 || saving}
                label="Review payment"
                onPress={() => {
                  if (amount_cents <= 0 || !payLearnerId) return;

                  const payload: PendingPayment = {
                    learner_id: payLearnerId,
                    amount_cents,
                    currency: payCurrency,
                    method: payMethod || undefined,
                    reference: payReference || undefined,
                    note: payNote || undefined,
                    received_at: payReceivedAt ? new Date(payReceivedAt).toISOString() : undefined,
                  };

                  setPending(payload);
                  setStep('confirm');
                }}
              />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/* ───────────────────────────────────────────────
 * Statement modal (native)
 * ─────────────────────────────────────────────── */

export function StatementModal({
  title,
  onClose,
  learnerId,
  charges,
  payments,
  loading,
  onOpenCharge,
  onOpenPayment,
  onPrint,
  onDownload,
  downloadLoading,
  printLoading,
  theme: explicitTheme,
}: {
  title: string;
  onClose: () => void;
  learnerId: string;
  charges: any[];
  payments: any[];
  loading: boolean;
  onOpenCharge: () => void;
  onOpenPayment: () => void;
  onPrint: () => void;
  onDownload: () => void;
  downloadLoading?: boolean;
  printLoading?: boolean;
  theme?: any;
}) {
  const theme = useFeeTheme(explicitTheme);

  const totals = useMemo(() => calcTotalsPerCurrency(charges || [], payments || []), [charges, payments]);
  const chargeRows = totals.map((t) => ({ currency: t.currency, value: t.charges }));
  const paymentRows = totals.map((t) => ({ currency: t.currency, value: t.payments }));
  const balanceRows = totals.map((t) => ({ currency: t.currency, value: t.balance }));

  return (
    <Modal title={title} onClose={onClose} theme={theme}>
      {!learnerId ? (
        <EmptyState theme={theme} title="Select a learner" body="Pick a learner from the Balances list first." />
      ) : loading ? (
        <View style={tw`p-4`}>
          <ActivityIndicator />
        </View>
      ) : (
        <View>
          <View style={tw`flex-row`}>
            <View style={[tw`flex-1 rounded-2xl p-3 mr-2`, { backgroundColor: theme.primarySoft }]}>
              <Text style={[tw`text-xs`, { color: theme.muted }]}>Charges</Text>
              <View style={tw`mt-2`}>
                <MoneyStack theme={theme} rows={chargeRows} />
              </View>
            </View>
            <View style={[tw`flex-1 rounded-2xl p-3 mr-2`, { backgroundColor: theme.primarySoft }]}>
              <Text style={[tw`text-xs`, { color: theme.muted }]}>Payments</Text>
              <View style={tw`mt-2`}>
                <MoneyStack theme={theme} rows={paymentRows} />
              </View>
            </View>
            <View style={[tw`flex-1 rounded-2xl p-3`, { backgroundColor: theme.primarySoft }]}>
              <Text style={[tw`text-xs`, { color: theme.muted }]}>Balance</Text>
              <View style={tw`mt-2`}>
                <MoneyStack theme={theme} rows={balanceRows} />
              </View>
            </View>
          </View>

          <View style={tw`mt-3 flex-row flex-wrap`}>
            <View style={tw`mr-2 mb-2`}>
              <Btn theme={theme} kind="primary" label="Add charge" onPress={onOpenCharge} />
            </View>
            <View style={tw`mr-2 mb-2`}>
              <Btn theme={theme} kind="dark" label="Add payment" onPress={onOpenPayment} />
            </View>
            <View style={tw`mr-2 mb-2`}>
              <Btn
                theme={theme}
                kind="ghost"
                label={downloadLoading ? 'Generating…' : 'Statement PDF'}
                onPress={onDownload}
                loading={downloadLoading}
                disabled={printLoading}
              />
            </View>
            <View style={tw`mb-2`}>
              <Btn
                theme={theme}
                kind="ghost"
                label={printLoading ? 'Printing…' : 'Print'}
                onPress={onPrint}
                loading={printLoading}
                disabled={downloadLoading}
              />
            </View>
          </View>

          <Text style={[tw`text-sm font-bold mt-3`, { color: theme.text }]}>Charges</Text>
          {(charges || []).length ? (
            (charges || []).slice(0, 50).map((c: any) => (
              <View key={`c-${c.id}`} style={[tw`mt-2 rounded-2xl border p-3`, { borderColor: theme.border }]}>
                <Text style={[tw`text-sm font-semibold`, { color: theme.text }]}>{c.description || 'Fee'}</Text>
                <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                  {c.created_at ? new Date(c.created_at).toLocaleString() : '—'} • {moneyFromCents(Number(c.amount_cents || 0), c.currency)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[tw`text-sm mt-2`, { color: theme.subtext }]}>No charges yet.</Text>
          )}

          <Text style={[tw`text-sm font-bold mt-4`, { color: theme.text }]}>Payments</Text>
          {(payments || []).length ? (
            (payments || []).slice(0, 50).map((p: any) => (
              <View key={`p-${p.id}`} style={[tw`mt-2 rounded-2xl border p-3`, { borderColor: theme.border }]}>
                <Text style={[tw`text-sm font-semibold`, { color: theme.text }]}>{p.method || 'Payment'}</Text>
                <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                  {(p.received_at ? new Date(p.received_at).toLocaleString() : p.created_at ? new Date(p.created_at).toLocaleString() : '—')}{' '}
                  • {moneyFromCents(Number(p.amount_cents || 0), p.currency)}
                </Text>
                {p.reference ? <Text style={[tw`text-xs mt-1`, { color: theme.muted }]}>Ref: {String(p.reference)}</Text> : null}
                {p.note ? (
                  <Text style={[tw`text-xs mt-1`, { color: theme.muted }]} numberOfLines={2}>
                    {String(p.note)}
                  </Text>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={[tw`text-sm mt-2`, { color: theme.subtext }]}>No payments yet.</Text>
          )}

          <Text style={[tw`text-[11px] mt-3`, { color: theme.muted }]}>Note: totals are computed per currency from line items.</Text>
        </View>
      )}
    </Modal>
  );
}

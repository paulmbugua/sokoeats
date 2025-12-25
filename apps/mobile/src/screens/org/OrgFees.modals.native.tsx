// apps/mobile/src/screens/org/OrgFees.modals.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tw from '../../../tailwind';

import type { LearnerLite } from './OrgFees.shared.native';
import { moneyFromCents, pickAdmissionCode, pickFeeLearnerRef, pickLearnerId, pickLearnerName, toCents, calcTotalsPerCurrency } from './OrgFees.shared.native';
import { Badge, CircleCheckbox, EmptyState, Modal, MoneyStack, useFeeTheme } from './OrgFees.ui.native';

const Btn = ({ theme, label, onPress, kind = 'primary', disabled }: any) => {
  const bg =
    kind === 'primary' ? theme.primary : kind === 'dark' ? (theme.dark ? '#334155' : '#0f172a') : 'transparent';
  const borderColor = kind === 'ghost' ? theme.border : 'transparent';
  const textColor = kind === 'ghost' ? theme.text : '#fff';

  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        tw`px-4 py-3 rounded-2xl border`,
        {
          backgroundColor: disabled ? theme.border : bg,
          borderColor,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[tw`text-sm font-semibold text-center`, { color: textColor }]}>{label}</Text>
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

  const [learnerQuery, setLearnerQuery] = useState('');

  const filteredLearners = useMemo(() => {
    const q = learnerQuery.trim().toLowerCase();
    const base = Array.isArray(learners) ? learners : [];
    if (!q) return base;

    return base.filter((l) => {
      const name = String(pickLearnerName(l) || '').toLowerCase();
      const adm = String(pickAdmissionCode(l) || '').toLowerCase();
      return name.includes(q) || adm.includes(q);
    });
  }, [learners, learnerQuery]);

  return (
    <Modal title={title} onClose={onClose} theme={theme}>
      <View style={tw`space-y-3`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={[tw`text-xs`, { color: theme.muted }]}>
            {loading ? 'Loading…' : `${rows?.length || 0} unmatched`}
          </Text>

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

          <Field
            theme={theme}
            label="Search learner"
            value={learnerQuery}
            onChange={setLearnerQuery}
            placeholder="Type name or admission…"
          />

          <View style={[tw`rounded-2xl border`, { borderColor: theme.border }]}>
            {(filteredLearners || []).slice(0, 40).map((l) => {
              const feeRef = pickFeeLearnerRef(l);
              const adm = pickAdmissionCode(l);
              const value = (adm || feeRef || '').trim();
              if (!value) return null;

              const selected = selectedLearnerId === value;
              return (
                <TouchableOpacity
                  key={`${value}`}
                  onPress={() => setSelectedLearnerId(value)}
                  style={[
                    tw`p-3 border-b`,
                    { borderBottomColor: theme.border, backgroundColor: selected ? theme.primarySoft : 'transparent' },
                  ]}
                >
                  <Text style={[tw`text-sm font-semibold`, { color: theme.text }]} numberOfLines={1}>
                    {pickLearnerName(l)}
                  </Text>
                  <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]} numberOfLines={1}>
                    {adm ? `ADM: ${adm}` : `ID: ${feeRef}`}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {filteredLearners.length === 0 ? (
              <View style={tw`p-3`}>
                <Text style={[tw`text-sm`, { color: theme.subtext }]}>No learners match your search.</Text>
              </View>
            ) : null}
          </View>

          <View style={tw`mt-3`}>
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
      </View>
    </Modal>
  );
}

/* ───────────────────────────────────────────────
 * Charge modal (single / bulk) with confirm step
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

  const [chargeLearnerId, setChargeLearnerId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeCurrency, setChargeCurrency] = useState(() => String(defaultCurrency || 'USD').toUpperCase());
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeClassLabel, setChargeClassLabel] = useState('');
  const [chargeDueDate, setChargeDueDate] = useState(''); // yyyy-mm-dd
  const [chargeMode, setChargeMode] = useState<'single' | 'bulk'>('single');
  const [bulkLearnerIds, setBulkLearnerIds] = useState<string[]>([]);
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
    if (chargeMode === 'bulk') {
      setChargeCurrency(String(defaultCurrency || 'USD').toUpperCase());
      return;
    }
    if (chargeLearnerId) setChargeCurrency(currencyHintForLearner(chargeLearnerId));
  }, [chargeLearnerId, chargeMode, currencyHintForLearner, defaultCurrency]);

  const amount_cents = toCents(chargeAmount);

  const bulkCandidates = useMemo(() => {
    const base = Array.isArray(learners) ? learners : [];
    return chargeClassLabel ? base.filter((l) => String(l.class_label || '') === chargeClassLabel) : base;
  }, [learners, chargeClassLabel]);

  const existingCurrencies =
    chargeMode === 'single' ? learnerCurrenciesMap.get(String(chargeLearnerId)) || [] : [];

  const isMismatch =
    chargeMode === 'single' &&
    existingCurrencies.length > 0 &&
    !existingCurrencies.includes(String(chargeCurrency).toUpperCase());

  return (
    <Modal title={title} onClose={onClose} theme={theme}>
      <View>
        <View style={tw`flex-row flex-wrap mb-2`}>
          <Chip theme={theme} label="Single learner" active={chargeMode === 'single'} onPress={() => setChargeMode('single')} />
          <Chip theme={theme} label="Bulk by class" active={chargeMode === 'bulk'} onPress={() => setChargeMode('bulk')} />
        </View>

        {step === 'confirm' && pending ? (
          <View style={[tw`rounded-3xl border p-4`, { borderColor: theme.warnBorder, backgroundColor: theme.warnBg }]}>
            <Text style={[tw`text-sm font-bold`, { color: theme.warnText }]}>Confirm & commit</Text>
            <Text style={[tw`text-sm mt-1`, { color: theme.warnText }]}>
              This posts immediately to statements & balances. It can’t be undone.
            </Text>

            <View style={[tw`rounded-2xl p-3 mt-3`, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.60)' }]}>
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
                    setBulkLearnerIds([]);
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
            {chargeMode === 'single' ? (
              <View>
                <Text style={[tw`text-xs font-bold mb-2`, { color: theme.subtext }]}>Learner</Text>
                <View style={[tw`rounded-2xl border`, { borderColor: theme.border }]}>
                  {(learners || []).slice(0, 40).map((l) => {
                    const id = pickLearnerId(l);
                    if (!id) return null;
                    const selected = chargeLearnerId === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => setChargeLearnerId(id)}
                        style={[
                          tw`p-3 border-b`,
                          { borderBottomColor: theme.border, backgroundColor: selected ? theme.primarySoft : 'transparent' },
                        ]}
                      >
                        <Text style={[tw`text-sm font-semibold`, { color: theme.text }]} numberOfLines={1}>
                          {pickLearnerName(l)}
                        </Text>
                        <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]} numberOfLines={1}>
                          ADM: {pickAdmissionCode(l) || '—'} • ID: {id}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[tw`text-[11px] mt-2`, { color: theme.muted }]}>
                  (Showing first 40 learners here. If you want a full searchable picker, we’ll add it.)
                </Text>
              </View>
            ) : (
              <View>
                <Text style={[tw`text-xs font-bold mb-2`, { color: theme.subtext }]}>Class</Text>
                <View style={tw`flex-row flex-wrap`}>
                  <Chip theme={theme} label="All classes" active={!chargeClassLabel} onPress={() => setChargeClassLabel('')} />
                  {(classLabels || []).slice(0, 12).map((c) => (
                    <Chip key={c} theme={theme} label={c} active={chargeClassLabel === c} onPress={() => setChargeClassLabel(c)} />
                  ))}
                </View>

                <View style={tw`flex-row items-center justify-between mt-2`}>
                  <Text style={[tw`text-xs`, { color: theme.muted }]}>{bulkLearnerIds.length} selected</Text>

                  <TouchableOpacity
                    onPress={() => {
                      const allIds = bulkCandidates
                        .map((l) => pickLearnerId(l))
                        .filter((x) => x && x !== 'undefined' && x !== 'null');
                      const allSelected = bulkLearnerIds.length === allIds.length;
                      setBulkLearnerIds(allSelected ? [] : allIds);
                    }}
                    style={[tw`px-3 py-2 rounded-2xl border`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}
                  >
                    <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>Toggle all</Text>
                  </TouchableOpacity>
                </View>

                <View style={[tw`rounded-2xl border mt-2`, { borderColor: theme.border }]}>
                  {bulkCandidates.slice(0, 80).map((l) => {
                    const id = String(pickLearnerId(l) || '').trim();
                    if (!id) return null;
                    const checked = bulkLearnerIds.includes(id);
                    return (
                      <View key={id} style={[tw`p-3 border-b`, { borderBottomColor: theme.border }]}>
                        <CircleCheckbox
                          theme={theme}
                          checked={checked}
                          onChange={() =>
                            setBulkLearnerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                          }
                          label={
                            <Text style={[tw`text-sm`, { color: theme.text }]}>
                              {pickLearnerName(l)} <Text style={{ color: theme.muted }}>({id})</Text>
                            </Text>
                          }
                        />
                      </View>
                    );
                  })}
                </View>

                <Text style={[tw`text-[11px] mt-2`, { color: theme.muted }]}>
                  (Bulk list shows first 80 learners.)
                </Text>
              </View>
            )}

            <View style={tw`mt-4`}>
              <Field theme={theme} label="Amount" value={chargeAmount} onChange={setChargeAmount} placeholder="e.g. 25.00" />
              <Text style={[tw`text-xs uppercase tracking-wider mb-2`, { color: theme.muted }]}>Currency</Text>
              <View style={tw`flex-row flex-wrap`}>
                {['USD', 'KES', 'QAR'].map((cur) => (
                  <Chip
                    key={cur}
                    theme={theme}
                    label={cur}
                    active={chargeCurrency === cur}
                    disabled={chargeMode === 'bulk'}
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

              {saving ? <Text style={[tw`text-xs mt-2`, { color: theme.muted }]}>Saving…</Text> : null}

              <View style={tw`mt-3`}>
                <Btn theme={theme} kind="ghost" label="Cancel" onPress={onClose} />
              </View>

              <View style={tw`mt-2`}>
                <Btn
                  theme={theme}
                  kind="primary"
                  disabled={
                    (chargeMode === 'single' && !chargeLearnerId) ||
                    (chargeMode === 'bulk' && bulkLearnerIds.length === 0) ||
                    amount_cents <= 0 ||
                    saving
                  }
                  label={chargeMode === 'bulk' ? `Review charges (${bulkLearnerIds.length})` : 'Review charge'}
                  onPress={() => {
                    if (amount_cents <= 0) return;

                    const payload =
                      chargeMode === 'single'
                        ? {
                            learner_id: chargeLearnerId,
                            amount_cents,
                            currency: chargeCurrency,
                            description: chargeDesc || undefined,
                            class_label: chargeClassLabel || undefined,
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

                    setPending({ payload, isBulk: chargeMode === 'bulk' });
                    setStep('confirm');
                  }}
                />
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/* ───────────────────────────────────────────────
 * Payment modal with confirm step
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

            <View style={[tw`rounded-2xl p-3 mt-3`, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.60)' }]}>
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
            <Text style={[tw`text-xs font-bold mb-2`, { color: theme.subtext }]}>Learner</Text>
            <View style={[tw`rounded-2xl border`, { borderColor: theme.border }]}>
              {(learners || []).slice(0, 40).map((l) => {
                const id = pickLearnerId(l);
                if (!id) return null;
                const selected = payLearnerId === id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setPayLearnerId(id)}
                    style={[
                      tw`p-3 border-b`,
                      { borderBottomColor: theme.border, backgroundColor: selected ? theme.primarySoft : 'transparent' },
                    ]}
                  >
                    <Text style={[tw`text-sm font-semibold`, { color: theme.text }]} numberOfLines={1}>
                      {pickLearnerName(l)}
                    </Text>
                    <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]} numberOfLines={1}>
                      ADM: {pickAdmissionCode(l) || '—'} • ID: {id}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[tw`text-[11px] mt-2`, { color: theme.muted }]}>
              (Showing first 40 learners.)
            </Text>

            <View style={tw`mt-4`}>
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
        <EmptyState theme={theme} title="Select a learner" body="Pick a learner from the list first." />
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
              <Btn theme={theme} kind="ghost" label="Statement PDF" onPress={onDownload} />
            </View>
            <View style={tw`mb-2`}>
              <Btn theme={theme} kind="ghost" label="Print" onPress={onPrint} />
            </View>
          </View>

          <Text style={[tw`text-sm font-bold mt-3`, { color: theme.text }]}>Charges</Text>
          {(charges || []).length ? (
            (charges || []).slice(0, 50).map((c: any) => (
              <View key={`c-${c.id}`} style={[tw`mt-2 rounded-2xl border p-3`, { borderColor: theme.border }]}>
                <Text style={[tw`text-sm font-semibold`, { color: theme.text }]}>{c.description || 'Fee'}</Text>
                <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                  {c.created_at ? new Date(c.created_at).toLocaleString() : '—'} •{' '}
                  {moneyFromCents(Number(c.amount_cents || 0), c.currency)}
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
                {p.note ? <Text style={[tw`text-xs mt-1`, { color: theme.muted }]} numberOfLines={2}>{String(p.note)}</Text> : null}
              </View>
            ))
          ) : (
            <Text style={[tw`text-sm mt-2`, { color: theme.subtext }]}>No payments yet.</Text>
          )}

          <Text style={[tw`text-[11px] mt-3`, { color: theme.muted }]}>
            Note: totals are computed per currency from line items.
          </Text>
        </View>
      )}
    </Modal>
  );
}

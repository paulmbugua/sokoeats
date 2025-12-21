// packages/shared/types/orgPro.ts
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface OrgAttendanceSession {
  id: number;
  org_id?: string;
  session_date: string;
  class_label?: string | null;
  period_label?: string | null;
  entries?: OrgAttendanceEntry[];
}

export interface OrgAttendanceEntry {
  learner_id: string;
  status: AttendanceStatus;
  note?: string | null;
}

export interface OrgFeeCharge {
  id: number;
  learner_id: string;
  amount_cents: number;
  currency: string;
  description?: string | null;
  class_label?: string | null;
  due_date?: string | null;
  created_at?: string;
}

export interface OrgFeePayment {
  id: number;
  learner_id: string;
  amount_cents: number;
  currency: string;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  received_at?: string | null;
}

export interface OrgFeeStatement {
  charges: OrgFeeCharge[];
  payments: OrgFeePayment[];
  balance: number;
}

export interface FeeStructureItem {
  id: number;
  structure_id: number;
  label: string;
  amount_cents: number;
  currency: string;
  cadence?: string | null;
  is_optional?: boolean;
  sort_order?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface FeeStructure {
  id: number;
  org_id?: string;
  title: string;
  description?: string | null;
  currency: string;
  effective_term?: string | null;
  is_active?: boolean;
  created_by?: string | number | null;
  created_at?: string;
  updated_at?: string;
  items?: FeeStructureItem[];
}

export interface FeeCharge {
  id: number;
  learner_id: string;
  amount_cents: number;
  currency: string;
  description?: string | null;
  class_label?: string | null;
  due_date?: string | null;
  created_at?: string;
  created_by?: string | number | null;
  structure_id?: number | null;
  structure_item_id?: number | null;
  metadata?: Record<string, unknown>;
}

export interface FeePayment {
  id: number;
  learner_id: string;
  amount_cents: number;
  currency: string;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  received_at?: string | null;
  created_at?: string;
  created_by?: string | number | null;
  charge_id?: number | null;
  metadata?: Record<string, unknown>;
}

export interface FeeBalanceRow {
  learner_id: string;
  charges: number;
  payments: number;
  balance: number;
}

export interface FeeStatementRow {
  charge_id?: number | null;
  charge_amount?: number | null;
  charge_currency?: string | null;
  description?: string | null;
  class_label?: string | null;
  due_date?: string | null;
  charge_created_at?: string | null;
  payment_id?: number | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  received_at?: string | null;
  payment_created_at?: string | null;
}

export interface OrgNewsletter {
  id: number;
  term_label?: string | null;
  title: string;
  content_md?: string | null;
  status: 'draft' | 'sent' | string;
  sent_at?: string | null;
}

export interface OrgAnnouncement {
  id: number;
  audience: 'all' | 'learners' | 'instructors' | string;
  title: string;
  body: string;
  pinned?: boolean;
  start_at?: string | null;
  end_at?: string | null;
  created_at?: string;
}

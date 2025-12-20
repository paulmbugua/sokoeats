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

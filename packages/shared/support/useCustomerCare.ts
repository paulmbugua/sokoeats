import { useCallback, useEffect, useRef, useState } from 'react';

export type CareMessage = { id: string; sequence: number; clientMessageId: string; senderKind: 'customer' | 'support'; senderName: string; body: string; createdAt: string };
export type CareConversation = { id: string; code: string; status: string; version: number; customerReadSequence: number; staffReadSequence: number; customerName: string; role: string; applicationReference?: string; assigned: boolean };
export type CareSnapshot = { conversation: CareConversation | null; messages: CareMessage[]; hasOlder: boolean };
export type CareRequest = <T>(path: string, options?: RequestInit) => Promise<T>;
export type PartnerApplication = { reference: string; role: string; createdAt: string; status: string; note?: string; businessName: string };
export const applicationStatus: Record<string, string> = { details_required: 'Complete application details', submitted: 'Application received', under_review: 'Under review', verified: 'Approved', rejected: 'Changes required', suspended: 'Suspended' };
export function approvalEmail(reference: string, name: string) {
  return `mailto:support@sokoeats.co.ke?subject=${encodeURIComponent(`Application approval request - ${reference}`)}&body=${encodeURIComponent(`Hello SokoEats support,\n\nPlease review my application.\nTracking number: ${reference}\nBusiness: ${name}\n\nPlease let me know if any details are needed.\n\nThank you.`)}`;
}
const empty: CareSnapshot = { conversation: null, messages: [], hasOlder: false };
const messageId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const value = Math.floor(Math.random() * 16); return (character === 'x' ? value : (value & 3) | 8).toString(16);
});

export function useCustomerCare(request: CareRequest, userKey: string | undefined, open: boolean, selectedId?: string, staff = false, enabled = true) {
  const [snapshot, setSnapshot] = useState<CareSnapshot>(empty);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const snapshotRef = useRef(snapshot);
  const pending = useRef<{ body: string; clientMessageId: string } | null>(null);
  const epoch = useRef(0);
  const sendingRef = useRef(false);
  const merge = useCallback((next: CareSnapshot, older = false) => {
    setSnapshot((current) => {
      if (current.conversation?.id === next.conversation?.id && next.conversation && current.conversation && next.conversation.version < current.conversation.version && !older) return current;
      const messages = new Map<string, CareMessage>();
      if (current.conversation?.id === next.conversation?.id) current.messages.forEach((message) => messages.set(message.id, message));
      next.messages.forEach((message) => messages.set(message.id, message));
      const result = { ...next, conversation: older ? current.conversation : next.conversation, messages: [...messages.values()].sort((a,b) => a.sequence-b.sequence), hasOlder: older || !current.messages.length ? next.hasOlder : current.hasOlder };
      snapshotRef.current = result; return result;
    });
  }, []);
  useEffect(() => {
    epoch.current++; snapshotRef.current = empty; setSnapshot(empty); setDraft(''); setError(''); setConnectionError(''); setConnected(false); pending.current = null;
  }, [userKey, selectedId]);
  useEffect(() => {
    if (!enabled || !userKey || (staff && !selectedId)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const cycle = async () => {
      let delay = open ? 100 : 12000;
      try {
        const current = snapshotRef.current.conversation;
        const id = selectedId || current?.id;
        const path = id ? `/api/care/conversations/${id}${open && current?.id === id ? `?after=${current.version}&wait=1` : ''}` : '/api/care/conversation';
        const result = await request<CareSnapshot>(path, { signal: controller.signal });
        if (!active) return;
        merge(result); setConnected(true); setConnectionError('');
        const last = result.messages.at(-1)?.sequence || 0;
        const read = staff ? result.conversation?.staffReadSequence : result.conversation?.customerReadSequence;
        if (open && result.conversation && last > (read || 0)) await request(`/api/care/conversations/${result.conversation.id}/read`, { method: 'POST', body: JSON.stringify({ sequence: last }), signal: controller.signal });
        if (!result.conversation) delay = 12000;
      } catch (err) {
        if (!active) return;
        setConnected(false); setConnectionError(err instanceof Error ? err.message : 'Chat could not connect. Retrying...'); delay = 4000;
      } finally { if (active) timer = setTimeout(cycle, delay); }
    };
    void cycle();
    return () => { active = false; controller.abort(); if (timer) clearTimeout(timer); };
  }, [request, userKey, open, selectedId, staff, merge, enabled]);
  const send = async () => {
    if (sendingRef.current || !draft.trim() || !userKey) return false;
    sendingRef.current = true; setSending(true); setError('');
    const generation = epoch.current;
    const body = draft.trim();
    if (pending.current?.body !== body) pending.current = { body, clientMessageId: messageId() };
    try {
      const id = selectedId || snapshotRef.current.conversation?.id;
      const result = await request<CareSnapshot>(id ? `/api/care/conversations/${id}/messages` : '/api/care/conversation/messages', { method: 'POST', body: JSON.stringify(pending.current) });
      if (generation !== epoch.current) return false;
      merge(result); setDraft(''); pending.current = null; setConnected(true); return true;
    } catch (err) { if (generation === epoch.current) setError(err instanceof Error ? err.message : 'Message was not sent. Your draft is saved here; please retry.'); return false; }
    finally { sendingRef.current = false; setSending(false); }
  };
  const loadOlder = async () => {
    const id = snapshot.conversation?.id, first = snapshot.messages[0]?.sequence;
    if (!id || !first || loadingOlder) return;
    setLoadingOlder(true);
    try { merge(await request<CareSnapshot>(`/api/care/conversations/${id}?before=${first}`), true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load earlier messages.'); }
    finally { setLoadingOlder(false); }
  };
  const read = staff ? snapshot.conversation?.staffReadSequence : snapshot.conversation?.customerReadSequence;
  const unread = snapshot.messages.filter((message) => message.senderKind === (staff ? 'customer' : 'support') && message.sequence > (read || 0)).length;
  return { ...snapshot, error: error || connectionError, connected, sending, draft, setDraft, send, unread, loadOlder, loadingOlder };
}

'use client';
import React, { useEffect, useRef, useState } from 'react';
import { CheckCheck, Mail, MessageCircle, Send, X } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import { applicationStatus, approvalEmail, useCustomerCare, type PartnerApplication } from '@sokoeats/shared/support/useCustomerCare';
import './CustomerCareChat.css';

type User = { id?: string; name: string; role: string; applicationReference?: string | null };
export function ApplicationTracker({ user, onStatusChange }: { user: User; onStatusChange?: (status:string)=>void }) {
  const [application, setApplication] = useState<PartnerApplication | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!['vendor','merchant'].includes(user.role)) return;
    let active = true;
    const refresh = () => api<{ application: PartnerApplication | null }>('/api/care/application').then((result) => { if (active) { setApplication(result.application); setError(''); if(result.application)onStatusChange?.(result.application.status); } }).catch(() => { if (active) setError('Status is temporarily unavailable. You can still email support with your tracking number.'); });
    void refresh(); const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [user.id, user.role]);
  if (!['vendor','merchant'].includes(user.role)) return null;
  const reference = application?.reference || user.applicationReference;
  return <section className="careApplication" aria-label="Application tracking">
    <div><span>YOUR APPLICATION</span><h2>{application ? applicationStatus[application.status] || application.status.replaceAll('_',' ') : 'Application tracking'}</h2><p>Tracking number: <strong>{reference || 'Loading...'}</strong></p>{application?.note && <p>{application.note}</p>}{error && <p role="status">{error}</p>}</div>
    {reference && application?.status !== 'verified' && <a href={approvalEmail(reference, application?.businessName || user.name)}><Mail size={18} />Request approval by email</a>}
  </section>;
}

export function CareThread({ user, open, conversationId, staff = false }: { user: User | null; open: boolean; conversationId?: string; staff?: boolean }) {
  const [visible,setVisible]=useState(true);
  useEffect(()=>{const changed=()=>setVisible(!document.hidden);changed();document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
  const chat = useCustomerCare(api, user?.id, open && visible, conversationId, staff, visible);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [actionError, setActionError] = useState('');
  useEffect(() => { if (nearBottom.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [chat.messages.length]);
  if (!user) return null;
  const peerRead = staff ? chat.conversation?.customerReadSequence : chat.conversation?.staffReadSequence;
  return <div className="careThread">
    <div className="careMeta"><span>{chat.conversation?.code || 'A new conversation'}</span><span>{chat.connected ? 'Connected' : 'Reconnecting...'}</span></div>
    {chat.conversation?.applicationReference && <div className="careReference">Application {chat.conversation.applicationReference}</div>}
    {staff && chat.conversation && <div className="careStaffActions"><span>{chat.conversation.customerName} · {chat.conversation.role}</span><button onClick={async () => { try { await api(`/api/care/conversations/${chat.conversation!.id}`, { method:'PATCH', body:JSON.stringify({ status: chat.conversation!.status === 'resolved' ? 'open' : 'resolved' }) }); setActionError(''); } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not update conversation.'); } }}>{chat.conversation.status === 'resolved' ? 'Reopen' : 'Resolve'}</button></div>}
    <div className="careMessages" ref={scroll} role="log" aria-label="Customer care messages" aria-live="polite" onScroll={() => { const node=scroll.current; if(node) nearBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<90; }}>
      {chat.hasOlder && <button className="careOlder" disabled={chat.loadingOlder} onClick={() => void chat.loadOlder()}>{chat.loadingOlder ? 'Loading...' : 'Earlier messages'}</button>}
      {!chat.messages.length && <div className="careWelcome"><MessageCircle size={32}/><h3>How can we help?</h3><p>Tell us about your order, account or application. Our customer-care team will reply here.</p></div>}
      {chat.messages.map((message) => {
        const mine=message.senderKind===(staff?'support':'customer');
        return <article key={message.id} className={`careMessage ${mine?'mine':''}`}><b>{mine?'You':message.senderName}</b><p>{message.body}</p><small><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit',minute:'2-digit' })}</time>{mine && <span>{message.sequence <= (peerRead || 0) ? <><CheckCheck size={14}/>Seen</> : 'Sent'}</span>}</small></article>;
      })}
    </div>
    {chat.conversation?.status==='resolved' && <p className="careNotice">This conversation is resolved. Send a message to reopen it.</p>}
    {(chat.error || actionError) && <p className="careError" role="alert">{actionError || chat.error}</p>}
    <form className="careComposer" onSubmit={(event) => { event.preventDefault(); nearBottom.current=true; void chat.send(); }}><textarea aria-label="Message customer care" maxLength={4000} value={chat.draft} onChange={(event)=>chat.setDraft(event.target.value)} placeholder="Write your message..." rows={2} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();nearBottom.current=true;void chat.send();}}}/><button aria-label="Send message" title="Send message" disabled={chat.sending || !chat.draft.trim()}><Send size={20}/></button></form>
  </div>;
}

export function CustomerCareChat({ user, onSignIn }: { user: User | null; onSignIn?: () => void }) {
  const [open,setOpen]=useState(false);
  const [unread,setUnread]=useState(0);
  const panel=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if(!user?.id){setUnread(0);return;}
    let active=true;
    const refresh=()=>api<{conversation:{customerReadSequence:number}|null;messages:Array<{sequence:number;senderKind:string}>}>('/api/care/conversation').then(result=>{if(active)setUnread(result.messages.filter(m=>m.senderKind==='support'&&m.sequence>(result.conversation?.customerReadSequence||0)).length);}).catch(()=>{});
    void refresh();const timer=setInterval(refresh,12000);return()=>{active=false;clearInterval(timer);};
  },[user?.id]);
  useEffect(()=>{if(open)panel.current?.show();else panel.current?.close();},[open]);
  return <div className="careWidget">
    <dialog ref={panel} className="carePanel" aria-label="SokoEats customer care" onCancel={()=>setOpen(false)} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>
      <header><div><MessageCircle size={22}/><span><b>SokoEats customer care</b><small>Orders, accounts and applications</small></span></div><button aria-label="Close customer care" title="Close chat" onClick={()=>setOpen(false)}><X size={22}/></button></header>
      {user ? <CareThread key={user.id} user={user} open={open}/> : <div className="careGuest"><h3>Talk to our team</h3><p>Sign in to send messages and keep your conversation across devices.</p><button onClick={()=>{setOpen(false);onSignIn?.();}}>Sign in to chat</button><a href="mailto:support@sokoeats.co.ke"><Mail size={18}/> Email customer care</a></div>}
    </dialog>
    <button className="careLauncher" aria-label={open?'Close customer care':'Chat with customer care'} title="Customer care" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?<X size={26}/>:<MessageCircle size={26}/>} {!open&&unread>0&&<span>{unread>9?'9+':unread}</span>}</button>
  </div>;
}

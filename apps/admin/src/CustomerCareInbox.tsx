import React, { useEffect, useState } from 'react';
import { api, type StoredAuthSession } from '@sokoeats/shared/api';
import { CareThread } from '../../web/src/CustomerCareChat';
type Conversation = { id:string;code:string;status:string;name:string;role:string;applicationReference?:string;preview:string;unread:number;updatedAt:string };
export function CustomerCareInbox({ user }: { user:StoredAuthSession['user'] }) {
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selected,setSelected]=useState('');
  const [search,setSearch]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const refresh=()=>api<{conversations:Conversation[]}>(`/api/care/inbox?search=${encodeURIComponent(search)}`).then(result=>{if(active){setConversations(result.conversations);setError('');}}).catch(error=>{if(active)setError(error.message);});
    void refresh();const timer=setInterval(refresh,4000);return()=>{active=false;clearInterval(timer);};
  },[search]);
  return <><p>Customer messages and partner application enquiries.</p>{error&&<p role="alert">{error}</p>}<div className="careInbox"><aside className="careInboxList"><input aria-label="Search conversations" placeholder="Name, case or application number" value={search} onChange={event=>setSearch(event.target.value)}/>{!conversations.length&&<p className="careInboxEmpty">No conversations found.</p>}{conversations.map(conversation=><button key={conversation.id} className={selected===conversation.id?'active':''} onClick={()=>setSelected(conversation.id)}><b>{conversation.name} {conversation.unread>0&&<strong>({conversation.unread} unread)</strong>}</b><small>{conversation.code} · {conversation.status}</small>{conversation.applicationReference&&<small>{conversation.applicationReference}</small>}<span>{conversation.preview?.slice(0,100)}</span></button>)}</aside>{selected?<CareThread key={selected} user={user} open conversationId={selected} staff/>:<div className="careInboxEmpty">Select a conversation to reply.</div>}</div></>;
}

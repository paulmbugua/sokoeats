import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BadgeDollarSign, CheckCircle2, CreditCard, Headphones, MessageSquare, PhoneCall, TicketCheck, Truck } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import './styles.css';

type TicketDetails = { ticket: any; agent: any; customer: any; order: any; rider: any; messages: any[]; activity: any[]; sourceFiles: string[] };

function App() {
  const [details, setDetails] = useState<TicketDetails | null>(null);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const load = () => api<{ ticketDetails: TicketDetails }>('/api/support/tickets/SKO-9214').then((r) => setDetails(r.ticketDetails)).catch(() => {});
  useEffect(() => { void load(); }, []);
  const send = async () => { if (!body.trim()) return; const next = await api<{ ticketDetails: TicketDetails }>('/api/support/tickets/SKO-9214/messages', { method: 'POST', body: JSON.stringify({ body, internal }) }); setBody(''); setInternal(false); setDetails(next.ticketDetails); };
  const resolve = async () => { const next = await api<{ ticketDetails: TicketDetails }>('/api/support/tickets/SKO-9214/resolve', { method: 'POST', body: JSON.stringify({ note: 'Resolved from admin tickets dashboard.' }) }); setDetails(next.ticketDetails); };
  if (!details) return <div className="empty">Loading ticket SKO-9214...</div>;
  return <main className="app">
    <aside className="sidebar"><div className="brand"><TicketCheck /> <span>SokoEats Tickets</span></div>{['Dashboard','Tickets','Orders','Customers','Analytics','Settings'].map((item, index) => <button className={index === 1 ? 'nav-btn active' : 'nav-btn'} key={item}><Headphones size={17} /> {item}</button>)}</aside>
    <section className="page">
      <div className="topbar"><input className="search" placeholder="Search orders, tickets, or customers..." /><div className="user"><img className="avatar" src={details.agent.avatarUrl} /><b>Agent {details.agent.name}</b></div></div>
      <div className="split">
        <aside className="profile-card"><div className="row"><img className="avatar" src={details.customer.avatarUrl} /><div><b>{details.customer.name}</b><div className="muted">{details.customer.tier}</div></div></div><p className="muted">{details.customer.email}<br />{details.customer.location}</p><div className="kpi-row"><article className="metric"><span>Total Orders</span><strong>{details.customer.totalOrders}</strong></article><article className="metric"><span>Total Spend</span><strong>{details.customer.totalSpend}</strong></article></div><h2>Order #{details.order.code}</h2><span className="pill">{details.order.status}</span>{details.order.items.map((item: any) => <div className="seller" key={item.name}><img className="thumb" src={item.imageUrl} /><div><b>{item.name}</b><div className="muted">{item.note}</div></div><b>{item.price}</b></div>)}<div className="row"><b>Total</b><b>{details.order.total}</b></div><h2><Truck /> Rider: {details.rider.name}</h2><img className="map" src={details.rider.mapUrl} /><p className="muted">Current status: {details.rider.status}</p></aside>
        <main className="panel"><div className="ticket-head"><div><p className="eyebrow">Ticket #{details.ticket.code}</p><h1>{details.ticket.title}</h1><p>{details.ticket.issue}</p><div className="actions"><span className="pill red">Priority {details.ticket.priority}</span><span className="pill">{details.ticket.opened}</span><span className={details.ticket.status === 'resolved' ? 'pill green' : 'pill red'}>SLA: {details.ticket.sla}</span></div></div><button className="primary" onClick={resolve}><CheckCircle2 size={17} /> Resolve Ticket</button></div>
          <div className="actions" style={{ margin: '18px 0' }}><button className="action"><BadgeDollarSign size={17} /> Issue Refund</button><button className="action"><CreditCard size={17} /> Apply Credit (KSh 200)</button><button className="action"><PhoneCall size={17} /> Escalate</button></div>
          <h2><MessageSquare /> Communication Log</h2>{details.messages.map((message, index) => <article className={message.tone === 'agent' ? 'message agent' : 'message'} key={index}><b>{message.sender}</b><div>{message.body}</div><span className="muted">{message.time}</span></article>)}
          <div className="composer"><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Reply to customer or add an internal note..." /><button className="primary" onClick={send}>Send</button></div><label className="muted"><input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} /> Internal note</label>
          <h2 style={{ marginTop: 20 }}>Recent Agent Activity</h2>{details.activity.map((entry) => <div className="activity" key={entry.label}><b>{entry.label}</b><div className="muted">{entry.body}</div></div>)}
        </main>
      </div>
      <div className="source">Built from: {details.sourceFiles.join(' | ')}</div>
    </section>
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

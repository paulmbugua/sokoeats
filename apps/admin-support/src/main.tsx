import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Bike, CalendarDays, Filter, Headphones, LayoutDashboard, MapPinned, Search, TicketCheck } from 'lucide-react';
import { api } from '@sokoeats/shared/api';
import './styles.css';

type Dashboard = { agent: any; header: any; metrics: { label: string; value: string; delta: string }[]; priorityTickets: any[]; orderAlerts: any[]; fleet: any; sourceFiles: string[] };

function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  useEffect(() => { api<{ dashboard: Dashboard }>('/api/support/dashboard').then((r) => setDashboard(r.dashboard)).catch(() => {}); }, []);
  if (!dashboard) return <div className="empty">Loading support queues...</div>;
  return <main className="app">
    <aside className="sidebar"><div className="brand"><Headphones /> <span>SokoEats Support</span></div>{['Dashboard','Tickets','Orders','Customers','Analytics','New Ticket','Settings','Logout'].map((item, index) => <button className={index === 0 ? 'nav-btn active' : 'nav-btn'} key={item}><LayoutDashboard size={17} /> {item}</button>)}</aside>
    <section className="page">
      <div className="topbar"><input className="search" placeholder="Search orders, tickets, or customers..." /><div className="user"><img className="avatar" src={dashboard.agent.avatarUrl} /><div><b>{dashboard.agent.name}</b><div className="muted">{dashboard.agent.role}</div></div></div></div>
      <div className="hero"><div><p className="eyebrow">Customer Support</p><h1>{dashboard.header.title}</h1><p>{dashboard.header.subtitle}</p></div><div className="actions"><button className="action"><CalendarDays size={17} /> {dashboard.header.dateLabel}</button><button className="action"><Filter size={17} /> Filter</button></div></div>
      <div className="metrics">{dashboard.metrics.map((metric) => <article className="metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><em>{metric.delta}</em></article>)}</div>
      <div className="grid">
        <section className="panel"><h2><TicketCheck /> Priority Tickets</h2>{dashboard.priorityTickets.map((ticket) => <div className="row" key={ticket.code}><div><b>{ticket.code}</b><span className="muted">{ticket.customer} - {ticket.issue}</span></div><div className="actions"><span className={ticket.priority === 'Urgent' ? 'pill red' : 'pill'}>{ticket.priority}</span><span className="muted">{ticket.age}</span></div></div>)}</section>
        <section className="panel"><h2><MapPinned /> {dashboard.fleet.title}</h2><img className="map" src={dashboard.fleet.mapUrl} /><h1 style={{ fontSize: 28, margin: '14px 0 0' }}>{dashboard.fleet.value}</h1></section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}><h2><Bike /> Order Alerts</h2>{dashboard.orderAlerts.map((alert) => <article className="alert" key={alert.code}><div className="row"><div><b>{alert.code}</b><span className="muted">{alert.body}</span></div><div className="actions"><span className={alert.label === 'High Risk' ? 'pill red' : 'pill'}>{alert.label}</span><span className="pill">{alert.status}</span></div></div><div className="row"><span className="muted">{alert.meta}</span><button className="action">{alert.action}</button></div></article>)}</section>
      <div className="source">Built from: {dashboard.sourceFiles.join(' | ')}</div>
    </section>
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

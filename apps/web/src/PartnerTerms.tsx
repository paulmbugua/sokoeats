'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@sokoeats/shared/api';
import { Download, X } from 'lucide-react';
import './PartnerTerms.css';

export type TermsConsent = { accepted: true; role: string; version: string; hash: string };
type TermsDocument = { role: string; title: string; version: string; hash: string; effectiveDate: string; operator: string; address: string; contact: string; sections: { title: string; body: string }[] };
export function PartnerTerms({ role, value, onChange, accepted = false }: { role: string; value: TermsConsent | null; onChange: (value: TermsConsent | null) => void; accepted?: boolean }) {
  const [document, setDocument] = useState<TermsDocument | null>(null);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [acceptedAt, setAcceptedAt] = useState('');
  const openAcceptedCopy = async () => {
    try {
      const result = await api<{ acceptances: { role: string; document: TermsDocument; accepted_at: string }[] }>('/api/auth/terms/acceptances');
      const receipt = result.acceptances.find((entry) => entry.role === role);
      if (!receipt) throw new Error('No acceptance record found.');
      setDocument(receipt.document); setAcceptedAt(receipt.accepted_at); dialog.current?.showModal();
    } catch { setError('The accepted copy could not be loaded. Please try again.'); }
  };
  useEffect(() => {
    let active = true;
    setDocument(null); setError(''); setOpened(false); onChange(null);
    if (!['rider', 'vendor', 'merchant'].includes(role)) return;
    api<TermsDocument>(`/api/legal/terms/${role}`).then((result) => { if (active) setDocument(result); }).catch(() => { if (active) setError('Terms could not be loaded. Please retry.'); });
    return () => { active = false; };
  }, [role, retry]);
  if (!['rider', 'vendor', 'merchant'].includes(role)) return null;
  const checked = !!document && value?.role === role && value?.hash === document.hash;
  const downloadCopy = () => {
    if (!document) return;
    const text = [document.title, `Version ${document.version} | Effective ${document.effectiveDate}`, document.operator, document.address, document.contact, ...document.sections.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`)].join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = window.document.createElement('a'); link.href = url; link.download = `sokoeats-${role}-terms-${document.version}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="partnerTerms" data-auth-field="termsAcceptance">
    <button type="button" disabled={!document} onClick={() => { setOpened(true); dialog.current?.showModal(); }}>Read {role} terms of service</button>
    {error && <p role="alert">{error} <button type="button" onClick={() => setRetry((n) => n + 1)}>Retry</button></p>}
    {!document && !error && <p role="status">Loading terms...</p>}
    {accepted ? <button type="button" onClick={openAcceptedCopy}>Your accepted copy</button> : <label className="partnerTermsCheck"><input type="checkbox" name="termsAcceptance" disabled={!document || !opened} checked={checked} onChange={(event) => onChange(event.target.checked && document ? { accepted: true, role, version: document.version, hash: document.hash } : null)} /><span>I have read and agree to the {role} terms of service{document ? ` (version ${document.version})` : ''}.</span></label>}
    <dialog ref={dialog} className="partnerTermsDialog" aria-label={document?.title || 'Terms of service'}>
      <header><h2>{document?.title}</h2><button type="button" aria-label="Close terms" onClick={() => dialog.current?.close()}><X size={22} /></button></header>
      {acceptedAt && <p>Accepted {new Date(acceptedAt).toLocaleString()}</p>}
      {document && <><div className="partnerTermsBody"><p>Version {document.version} | Effective {document.effectiveDate}</p><p><strong>{document.operator}</strong><br />{document.address}<br /><a href={`mailto:${document.contact}`}>{document.contact}</a></p>{document.sections.map((section, i) => <section key={section.title}><h3>{i + 1}. {section.title}</h3><p>{section.body}</p></section>)}</div><footer><button type="button" onClick={downloadCopy}><Download size={18} /> Download copy</button><button type="button" onClick={() => dialog.current?.close()}>Back to account</button></footer></>}
    </dialog>
  </div>;
}

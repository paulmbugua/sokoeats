import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Minus, Plus, QrCode, RotateCcw, ScanLine, Trash2, X } from 'lucide-react';
import type { MenuItem } from '@sokoeats/shared/types';
import './PartnerPos.css';

type PosLine = { item: MenuItem; quantity: number };
type ScanTone = 'idle' | 'success' | 'error';
type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

const salePrice = (item: MenuItem) => Number(item.customerPrice ?? item.price);
const money = (amount: number) => `KES ${amount.toLocaleString('en-KE')}`;
const comparable = (value: unknown) => String(value || '').trim().toLowerCase();

function codeCandidates(raw: string) {
  const values = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value || '').trim();
    if (text) values.add(text);
  };
  add(raw);
  add(raw.replace(/^sokoeats:(?:product|item):/i, ''));
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    ['barcode', 'code', 'qr', 'productId', 'menuItemId', 'itemId', 'id'].forEach((key) => add(payload[key]));
  } catch {
    // Plain barcode values are expected for most retail products.
  }
  try {
    const url = new URL(raw);
    ['barcode', 'code', 'qr', 'productId', 'menuItemId', 'itemId', 'id'].forEach((key) => add(url.searchParams.get(key)));
    add(url.pathname.split('/').filter(Boolean).at(-1));
  } catch {
    // Not every scanned value is a URL.
  }
  return [...values].map(comparable);
}

function scanConfirmation() {
  navigator.vibrate?.(35);
  const AudioContextApi = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
  if (!AudioContextApi) return;
  const context = new AudioContextApi();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.08);
  oscillator.addEventListener('ended', () => void context.close());
}

export function PartnerPos({ vendorId, items }: { vendorId: string; items: MenuItem[] }) {
  const [lines, setLines] = useState<PosLine[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [scanTone, setScanTone] = useState<ScanTone>('idle');
  const [scanMessage, setScanMessage] = useState('Ready for the next item');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [restoredStorageKey, setRestoredStorageKey] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const lastScanRef = useRef({ value: '', at: 0 });
  const processCodeRef = useRef<(raw: string) => boolean>(() => false);
  const storageKey = `sokoeats.pos.sale.${vendorId}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]') as Array<{ id: string; quantity: number }>;
      setLines(saved.flatMap((line) => {
        const item = items.find((entry) => entry.id === line.id);
        return item ? [{ item, quantity: Math.max(1, Number(line.quantity) || 1) }] : [];
      }));
    } catch {
      setLines([]);
    } finally {
      setRestoredStorageKey(storageKey);
    }
  }, [storageKey, items]);

  useEffect(() => {
    if (restoredStorageKey !== storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(lines.map((line) => ({ id: line.item.id, quantity: line.quantity }))));
  }, [lines, restoredStorageKey, storageKey]);

  useEffect(() => () => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const addItem = (item: MenuItem) => {
    if (item.available === false) {
      setScanTone('error');
      setScanMessage(`${item.name} is marked unavailable`);
      return false;
    }
    setLines((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      return existing
        ? current.map((line) => line.item.id === item.id ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line)
        : [...current, { item, quantity: 1 }];
    });
    setScanTone('success');
    setScanMessage(`${item.name} added`);
    scanConfirmation();
    return true;
  };

  const addByCode = (raw: string) => {
    const candidates = codeCandidates(raw);
    const item = items.find((entry) => candidates.includes(comparable(entry.barcode)) || candidates.includes(comparable(entry.id)));
    if (!item) {
      setScanTone('error');
      setScanMessage(`No product matches “${raw.trim()}”`);
      return false;
    }
    return addItem(item);
  };
  processCodeRef.current = addByCode;

  const stopCamera = () => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraBusy(false);
  };

  const startCamera = async () => {
    setCameraBusy(true);
    setScanTone('idle');
    try {
      const DetectorApi = (window as typeof window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (!DetectorApi) throw new Error('Camera scanning is not supported by this browser. Use the QR number field.');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Use the QR number field.');
      const detector = new DetectorApi({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Scanner preview is unavailable.');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
      setCameraBusy(false);
      setScanMessage('Scanner active');
      const detect = async () => {
        const video = videoRef.current;
        if (video && video.readyState >= 2 && !detectingRef.current) {
          detectingRef.current = true;
          try {
            const [result] = await detector.detect(video);
            const raw = result?.rawValue?.trim();
            const now = Date.now();
            if (raw && (lastScanRef.current.value !== raw || now - lastScanRef.current.at > 1500)) {
              lastScanRef.current = { value: raw, at: now };
              processCodeRef.current(raw);
            }
          } catch {
            // Individual video frames can be unreadable while the camera remains healthy.
          } finally {
            detectingRef.current = false;
          }
        }
        if (streamRef.current) frameRef.current = requestAnimationFrame(detect);
      };
      frameRef.current = requestAnimationFrame(detect);
    } catch (error) {
      stopCamera();
      setScanTone('error');
      setScanMessage(error instanceof Error ? error.message : 'The camera could not be started.');
    }
  };

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    if (!manualCode.trim()) return;
    if (addByCode(manualCode)) setManualCode('');
  };
  const changeQuantity = (id: string, delta: number) => setLines((current) => current.flatMap((line) => {
    if (line.item.id !== id) return [line];
    const quantity = line.quantity + delta;
    return quantity > 0 ? [{ ...line, quantity: Math.min(99, quantity) }] : [];
  }));
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + salePrice(line.item) * line.quantity, 0);

  return <section className="partnerPos" aria-labelledby="pos-title">
    <div className="posHeading">
      <div><span>Point of sale</span><h2 id="pos-title">Scan counter</h2><p>Current sale updates with every product scan.</p></div>
      <div className="posCounter"><strong>{itemCount}</strong><span>{itemCount === 1 ? 'item' : 'items'}</span></div>
    </div>
    <div className="posWorkspace">
      <div className="scannerPanel">
        <div className={`scannerViewport ${cameraActive ? 'active' : ''}`}>
          <video ref={videoRef} muted playsInline aria-label="Product scanner camera" />
          <div className="scannerReticle"><i/><i/><i/><i/><ScanLine/></div>
          {!cameraActive && <div className="scannerIdle"><QrCode/><b>QR and barcode scanner</b><span>{cameraBusy ? 'Opening camera...' : 'Camera is off'}</span></div>}
          {cameraActive && <button className="scannerClose" onClick={stopCamera} aria-label="Stop camera"><X/></button>}
        </div>
        <button className="cameraAction" disabled={cameraBusy} onClick={cameraActive ? stopCamera : startCamera}>{cameraActive ? <X/> : <Camera/>}{cameraActive ? 'Stop scanner' : cameraBusy ? 'Opening camera...' : 'Open scanner'}</button>
        <form className="manualScan" onSubmit={submitManual}>
          <label htmlFor="manual-product-code"><Keyboard/>QR or barcode number</label>
          <div><input id="manual-product-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} autoComplete="off" inputMode="text" placeholder="Scan or enter product code"/><button aria-label="Add product code"><Plus/></button></div>
        </form>
        <div className={`scanNotice ${scanTone}`} role="status"><span/>{scanMessage}</div>
        <div className="posQuickPicks">
          {items.filter((item) => item.available).slice(0, 6).map((item) => <button key={item.id} onClick={() => addItem(item)}>{item.imageUrl ? <img src={item.imageUrl} alt=""/> : <QrCode/>}<span>{item.name}</span><b>{money(salePrice(item))}</b></button>)}
        </div>
      </div>
      <div className="salePanel">
        <div className="saleTitle"><div><span>Current sale</span><h3>Scanned items</h3></div>{lines.length > 0 && <button onClick={() => setLines([])}><RotateCcw/>Clear</button>}</div>
        <div className="saleLines">
          {lines.map((line) => <article key={line.item.id}>
            {line.item.imageUrl ? <img src={line.item.imageUrl} alt=""/> : <div className="saleImageFallback"><QrCode/></div>}
            <div className="saleProduct"><b>{line.item.name}</b><span>{line.item.barcode || line.item.id}</span><small>{money(salePrice(line.item))} each</small></div>
            <div className="quantityStepper"><button onClick={() => changeQuantity(line.item.id, -1)} aria-label={`Remove one ${line.item.name}`}><Minus/></button><strong>{line.quantity}</strong><button onClick={() => changeQuantity(line.item.id, 1)} aria-label={`Add one ${line.item.name}`}><Plus/></button></div>
            <strong className="lineTotal">{money(salePrice(line.item) * line.quantity)}</strong>
            <button className="removeLine" onClick={() => setLines((current) => current.filter((entry) => entry.item.id !== line.item.id))} aria-label={`Remove ${line.item.name}`}><Trash2/></button>
          </article>)}
          {!lines.length && <div className="emptySale"><ScanLine/><h3>No items scanned</h3><p>Scanned products will appear here in sale order.</p></div>}
        </div>
        <footer className="saleSummary"><div><span>Units</span><b>{itemCount}</b></div><div className="saleGrandTotal"><span>Sale total</span><strong>{money(total)}</strong></div></footer>
      </div>
    </div>
  </section>;
}

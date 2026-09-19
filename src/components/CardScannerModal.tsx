import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogCard } from '../types';
import { getCardImageUrl } from '../lib/supabase';
import {
  matchScan,
  preprocessFooter,
  detectCardBounds,
  FOOTER_THRESHOLDS,
  OCR_CHARSET,
  CORNER_REGION,
  CORNER_REGION_LANDSCAPE,
  CARD_ASPECT,
  type CardBounds,
  type ScanCandidate,
} from '../lib/cardScan';

interface CardScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: CatalogCard[];
  game: string;
  /** Adds copies to the collection; the catalog owns the actual storage. */
  onAddCard: (card: CatalogCard, isFoil: boolean, delta: number) => void;
}

interface ScannedEntry {
  card: CatalogCard;
  isFoil: boolean;
  count: number;
}

/** Below this a read is shown as "is this right?" rather than accepted on its own. */
const AUTO_ACCEPT_CONFIDENCE = 0.85;
const FRAME_INTERVAL_MS = 700;

/** The guide box the user lines the card up with, as a fraction of the video's short side. */
const GUIDE_WIDTH_RATIO = 0.82;

export function CardScannerModal({ isOpen, onClose, cards, game, onAddCard }: CardScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Guards against a scan loop tick landing after the modal closed. */
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = isOpen;
    return () => { aliveRef.current = false; };
  }, [isOpen]);

  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [lastRead, setLastRead] = useState('');
  const [addFoil, setAddFoil] = useState(false);
  const [session, setSession] = useState<ScannedEntry[]>([]);
  const [torchOn, setTorchOn] = useState(false);
  const [scanningPhoto, setScanningPhoto] = useState(false);
  /** Battlefields are printed landscape, so the guide box has to turn with them. */
  const [landscape, setLandscape] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Loads Tesseract only when the scanner is actually opened — it's a multi-MB download. */
  const ensureWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current;
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: OCR_CHARSET,
      tessedit_pageseg_mode: '7' as any, // one text line
    });
    workerRef.current = worker;
    return worker;
  }, []);

  /** Reads the footer out of one image source, trying each threshold until confident. */
  const readFrom = useCallback(
    async (source: CanvasImageSource, width: number, height: number) => {
      const worker = await ensureWorker();
      let best: ScanCandidate[] = [];
      let bestText = '';

      for (const threshold of FOOTER_THRESHOLDS) {
        if (!aliveRef.current) return { candidates: [], text: '' };
        const canvas = preprocessFooter(source, width, height, { threshold });
        const { data } = await worker.recognize(canvas);
        const text = (data.text || '').trim();
        const found = matchScan(text, cards, { game });
        if (found.length && (!best.length || found[0].confidence > best[0].confidence)) {
          best = found;
          bestText = text;
        }
        if (best.length && best[0].confidence >= AUTO_ACCEPT_CONFIDENCE) break;
      }
      return { candidates: best, text: bestText };
    },
    [cards, game, ensureWorker]
  );

  /** Crops the guide box out of the live frame, so the footer is located relative to the card. */
  const grabGuideRegion = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    const aspect = landscape ? 1 / CARD_ASPECT : CARD_ASPECT;
    const guideWidth = Math.min(video.videoWidth, video.videoHeight * aspect) * GUIDE_WIDTH_RATIO;
    const guideHeight = guideWidth / aspect;
    const left = (video.videoWidth - guideWidth) / 2;
    const top = (video.videoHeight - guideHeight) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(guideWidth);
    canvas.height = Math.round(guideHeight);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, left, top, guideWidth, guideHeight, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, [landscape]);

  const scanTick = useCallback(async () => {
    if (!aliveRef.current || runningRef.current) return;
    runningRef.current = true;
    try {
      const frame = grabGuideRegion();
      if (frame) {
        const { candidates: found, text } = await readFrom(frame, frame.width, frame.height);
        if (aliveRef.current && found.length) {
          setCandidates(found.slice(0, 4));
          setLastRead(text);
        }
      }
    } catch (e) {
      // A single failed frame doesn't matter; the next tick tries again.
    } finally {
      runningRef.current = false;
    }
  }, [grabGuideRegion, readFrom]);

  // Camera lifecycle
  useEffect(() => {
    if (!isOpen) return;
    aliveRef.current = true;
    setStatus('starting');
    setErrorMsg(null);

    let interval: number | undefined;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!aliveRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        setHasTorch(Boolean((track?.getCapabilities?.() as any)?.torch));
        setStatus('scanning');
        await ensureWorker();
        interval = window.setInterval(scanTick, FRAME_INTERVAL_MS);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setStatus('error');
        setErrorMsg(
          e?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser, or use "Scan a photo" below.'
            : 'No camera available here. Use "Scan a photo" below instead.'
        );
      }
    })();

    return () => {
      aliveRef.current = false;
      if (interval) window.clearInterval(interval);
      stopCamera();
    };
  }, [isOpen, scanTick, ensureWorker, stopCamera]);

  // Tear the OCR worker down with the modal, not with every camera restart.
  useEffect(() => {
    if (isOpen) return;
    setCandidates([]);
    setLastRead('');
    setSession([]);
    const worker = workerRef.current;
    workerRef.current = null;
    worker?.terminate?.();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as any);
      setTorchOn(next);
    } catch (e) {
      setHasTorch(false);
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    setScanningPhoto(true);
    try {
      const bitmap = await createImageBitmap(file);

      // A photo usually has background around the card, so the footer isn't at a fixed fraction of
      // the image. Find the card itself where possible; otherwise fall back to the whole frame and
      // then progressively tighter centred card-shaped crops.
      const detected = detectCardBounds(bitmap, bitmap.width, bitmap.height);
      const regions: CardBounds[] = [];
      if (detected) regions.push(detected);
      for (const aspect of [CARD_ASPECT, 1 / CARD_ASPECT]) {
        for (const inset of [1, 0.92, 0.82, 0.7]) {
          const width = Math.min(bitmap.width, bitmap.height * aspect) * inset;
          const height = width / aspect;
          regions.push({ x: (bitmap.width - width) / 2, y: (bitmap.height - height) / 2, width, height });
        }
      }

      let best: ScanCandidate[] = [];
      let bestText = '';
      for (const region of regions) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(region.width));
        canvas.height = Math.max(1, Math.round(region.height));
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);

        const { candidates: found, text } = await readFrom(canvas, canvas.width, canvas.height);
        if (found.length && (!best.length || found[0].confidence > best[0].confidence)) {
          best = found;
          bestText = text;
        }
        if (best.length && best[0].confidence >= AUTO_ACCEPT_CONFIDENCE) break;
      }

      setLastRead(bestText);
      setCandidates(best.slice(0, 4));
      if (!best.length) setErrorMsg("Couldn't read a card number from that photo. Try filling the frame with the card, straight on.");
    } catch (err) {
      setErrorMsg("Couldn't read that image.");
    } finally {
      setScanningPhoto(false);
    }
  };

  const accept = (card: CatalogCard) => {
    onAddCard(card, addFoil, 1);
    setSession((prev) => {
      const key = (e: ScannedEntry) => e.card.id === card.id && e.isFoil === addFoil;
      const existing = prev.find(key);
      if (existing) return prev.map((e) => (key(e) ? { ...e, count: e.count + 1 } : e));
      return [{ card, isFoil: addFoil, count: 1 }, ...prev];
    });
    setCandidates([]);
    setLastRead('');
  };

  if (!isOpen) return null;

  const top = candidates[0];
  const confident = top && top.confidence >= AUTO_ACCEPT_CONFIDENCE;
  const sessionTotal = session.reduce((sum, e) => sum + e.count, 0);
  const guideRegion = landscape
    ? { ...CORNER_REGION_LANDSCAPE, aspect: 1 / CARD_ASPECT }
    : { ...CORNER_REGION, aspect: CARD_ASPECT };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(6px)', padding: 12, overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md my-auto rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Scan Cards</h2>
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              Line the card up inside the frame — it reads the number along the bottom edge.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar">
          {/* Camera view with the alignment guide */}
          <div className="relative bg-black" style={{ aspectRatio: '3 / 4' }}>
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className="relative rounded-xl"
                style={{
                  width: landscape ? '92%' : `${GUIDE_WIDTH_RATIO * 100}%`,
                  aspectRatio: `${guideRegion.aspect}`,
                  border: `2px solid ${confident ? '#10b981' : 'rgba(255,255,255,0.75)'}`,
                  boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Where the printed code needs to land */}
                <div
                  className="absolute rounded"
                  style={{
                    left: `${guideRegion.left * 100}%`,
                    top: `${guideRegion.top * 100}%`,
                    width: `${guideRegion.width * 100}%`,
                    height: `${guideRegion.height * 100}%`,
                    border: '1.5px dashed rgba(245,158,11,0.9)',
                    background: 'rgba(245,158,11,0.12)',
                  }}
                />
              </div>
            </div>

            {status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-300">
                Starting camera…
              </div>
            )}

            <button
              type="button"
              onClick={() => setLandscape((v) => !v)}
              title="Battlefields are printed sideways"
              className="absolute bottom-3 left-3 px-3 py-2 rounded-xl text-xs font-black cursor-pointer border"
              style={{ background: landscape ? 'var(--accent)' : 'rgba(0,0,0,0.6)', borderColor: landscape ? 'var(--accent)' : 'rgba(255,255,255,0.3)', color: landscape ? 'var(--text-on-accent, #000)' : '#fff' }}
            >
              {landscape ? 'Battlefield' : 'Rotate'}
            </button>

            {hasTorch && status === 'scanning' && (
              <button
                type="button"
                onClick={toggleTorch}
                className="absolute bottom-3 right-3 px-3 py-2 rounded-xl text-xs font-black cursor-pointer border"
                style={{ background: torchOn ? 'var(--accent)' : 'rgba(0,0,0,0.6)', borderColor: 'var(--accent)', color: torchOn ? 'var(--text-on-accent, #000)' : '#fff' }}
              >
                {torchOn ? 'Light on' : 'Light'}
              </button>
            )}
          </div>

          <div className="p-4 space-y-3">
            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {/* Match */}
            {top ? (
              <div className="rounded-xl border p-3" style={{ background: 'var(--bg-surface-2)', borderColor: confident ? 'rgba(16,185,129,0.5)' : 'var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-[67px] rounded-lg overflow-hidden bg-zinc-950 border border-white/10 shrink-0">
                    {top.card.image_path && <img src={getCardImageUrl(top.card.image_path)} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black truncate" style={{ color: 'var(--text-primary)' }}>{top.card.name}</div>
                    <div className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                      {top.card.card_number} · {top.card.set_name || top.card.sets?.name}
                    </div>
                    <div className="text-[11px] font-bold mt-0.5" style={{ color: confident ? '#34d399' : '#fbbf24' }}>
                      {confident ? 'Confident match' : 'Not sure — check this is right'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => accept(top.card)}
                    className="px-3.5 py-2 rounded-xl text-xs font-black cursor-pointer shrink-0"
                    style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
                  >
                    Add
                  </button>
                </div>

                {candidates.length > 1 && (
                  <div className="mt-2.5 pt-2.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      Or did you mean
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {candidates.slice(1).map((c) => (
                        <button
                          key={c.card.id}
                          type="button"
                          onClick={() => accept(c.card)}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left cursor-pointer border"
                          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                        >
                          <span className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{c.card.name}</span>
                          <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-tertiary)' }}>{c.card.card_number}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>
                {status === 'scanning' ? 'Looking for a card number…' : 'Point the camera at a card.'}
                {lastRead && <div className="font-mono mt-1 opacity-70">read: {lastRead}</div>}
              </div>
            )}

            {/* Options */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={addFoil} onChange={(e) => setAddFoil(e.target.checked)} className="w-4 h-4 accent-amber-400 cursor-pointer" />
                Add as foil
              </label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={scanningPhoto}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {scanningPhoto ? 'Reading…' : 'Scan a photo'}
              </button>
            </div>

            {/* What this session added */}
            {session.length > 0 && (
              <div className="pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
                  Added this session ({sessionTotal})
                </div>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto custom-scrollbar">
                  {session.map((e) => (
                    <div key={`${e.card.id}-${e.isFoil}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
                        {e.count}× {e.card.name}{e.isFoil ? ' (foil)' : ''}
                      </span>
                      <span className="font-mono shrink-0" style={{ color: 'var(--text-tertiary)' }}>{e.card.card_number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogCard } from '../types';
import { getCardImageUrl } from '../lib/supabase';
import { detectCardBounds, type CardBounds } from '../lib/cardDetect';
import {
  computeSignature,
  matchArt,
  parseArtIndex,
  type ArtIndexEntry,
  type ArtIndexFile,
} from '../lib/cardArtMatch';

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

/** How often a frame is examined. Detect + signature + match is a few milliseconds. */
const FRAME_INTERVAL_MS = 120;
/** Frames that must agree before a card is taken, so a blurred in-between frame can't add a card. */
const FRAMES_TO_CONFIRM = 3;
/** Below this the card is named but not taken automatically. */
const AUTO_ACCEPT_CONFIDENCE = 0.62;
/** Frames without a card before the scanner will accept the same card again. */
const FRAMES_TO_CLEAR = 4;
/** Frames are examined at this width; enough for both locating and the signature. */
const WORKING_WIDTH = 640;

export function CardScannerModal({ isOpen, onClose, cards, game, onAddCard }: CardScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const indexRef = useRef<ArtIndexEntry[] | null>(null);
  const busyRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const aliveRef = useRef(false);

  /** Which card the recent frames have been agreeing on, for how many, and the best look so far. */
  const streakRef = useRef<{ id: string | null; frames: number; confidence: number }>({ id: null, frames: 0, confidence: 0 });
  /** Blocks re-adding the card still sitting under the lens; cleared once it leaves. */
  const heldIdRef = useRef<string | null>(null);
  const emptyFramesRef = useRef(0);

  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [choices, setChoices] = useState<CatalogCard[]>([]);
  const [seeing, setSeeing] = useState<CardBounds | null>(null);
  const [videoAspect, setVideoAspect] = useState(3 / 4);
  const [addFoil, setAddFoil] = useState(false);
  const [session, setSession] = useState<ScannedEntry[]>([]);
  const [justAdded, setJustAdded] = useState<CatalogCard | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);

  // Rebuilt only when the catalog changes, not on every scanned frame's re-render.
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const cardsByIdRef = useRef(cardsById);
  cardsByIdRef.current = cardsById;

  const addFoilRef = useRef(addFoil);
  addFoilRef.current = addFoil;

  useEffect(() => {
    aliveRef.current = isOpen;
    return () => { aliveRef.current = false; };
  }, [isOpen]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Loads the artwork index once per session; it's a ~150KB static file. */
  const ensureIndex = useCallback(async () => {
    if (indexRef.current) return indexRef.current;
    const res = await fetch('/card-art-index.json');
    if (!res.ok) throw new Error('index unavailable');
    const file: ArtIndexFile = await res.json();
    indexRef.current = parseArtIndex(file, game);
    return indexRef.current;
  }, [game]);

  const addToSession = useCallback(
    (card: CatalogCard) => {
      const isFoil = addFoilRef.current;
      onAddCard(card, isFoil, 1);
      setSession((prev) => {
        const same = (e: ScannedEntry) => e.card.id === card.id && e.isFoil === isFoil;
        if (prev.some(same)) return prev.map((e) => (same(e) ? { ...e, count: e.count + 1 } : e));
        return [{ card, isFoil, count: 1 }, ...prev];
      });
      setJustAdded(card);
      setChoices([]);
    },
    [onAddCard]
  );

  /**
   * Locates the card in one image and ranks the catalog against its artwork.
   *
   * Prints that share a picture come back together, so the caller can tell "this is the card" from
   * "this is the card, but which printing".
   */
  const identify = useCallback(
    async (source: CanvasImageSource, width: number, height: number) => {
      const index = await ensureIndex();
      const bounds = detectCardBounds(source, width, height);
      if (!bounds) return { bounds: null, matches: [] as CatalogCard[], confidence: 0 };

      const crop = document.createElement('canvas');
      crop.width = Math.max(1, Math.round(bounds.width));
      crop.height = Math.max(1, Math.round(bounds.height));
      crop
        .getContext('2d', { willReadFrequently: true })!
        .drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, crop.width, crop.height);

      const ranked = matchArt(computeSignature(crop, crop.width, crop.height), index);
      const matches = ranked
        .map((m) => cardsByIdRef.current.get(m.id))
        .filter((c): c is CatalogCard => Boolean(c));
      return { bounds, matches, confidence: ranked[0]?.confidence ?? 0 };
    },
    [ensureIndex]
  );

  /** Draws the current frame into the reusable working canvas. */
  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;

    const canvas = (workCanvasRef.current ||= document.createElement('canvas'));
    const scale = Math.min(1, WORKING_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d', { willReadFrequently: true })!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, []);

  const scanTick = useCallback(async () => {
    if (!aliveRef.current || busyRef.current) return;
    busyRef.current = true;
    try {
      const frame = grabFrame();
      if (!frame) return;

      const { bounds, matches, confidence } = await identify(frame, frame.width, frame.height);
      if (!aliveRef.current) return;

      setSeeing(
        bounds
          ? { x: bounds.x / frame.width, y: bounds.y / frame.height, width: bounds.width / frame.width, height: bounds.height / frame.height }
          : null
      );

      if (!matches.length) {
        // Once the card is out of view the same one may be scanned again.
        if (++emptyFramesRef.current >= FRAMES_TO_CLEAR) {
          heldIdRef.current = null;
          streakRef.current = { id: null, frames: 0, confidence: 0 };
          setChoices([]);
        }
        return;
      }
      emptyFramesRef.current = 0;

      const topId = matches[0].id;
      const streak = streakRef.current;
      // A card is judged over a run of frames, not one: any single frame can be caught mid-blur,
      // so the run has to agree on the card and only its clearest look has to be convincing.
      streakRef.current = streak.id === topId
        ? { id: topId, frames: streak.frames + 1, confidence: Math.max(streak.confidence, confidence) }
        : { id: topId, frames: 1, confidence };

      if (streakRef.current.frames < FRAMES_TO_CONFIRM) return;
      if (heldIdRef.current === topId) return;

      if (matches.length > 1) {
        // Several printings share this artwork, so it isn't ours to choose.
        setChoices(matches.slice(0, 4));
        return;
      }
      if (streakRef.current.confidence < AUTO_ACCEPT_CONFIDENCE) {
        setChoices(matches.slice(0, 1));
        return;
      }

      heldIdRef.current = topId;
      addToSession(matches[0]);
    } catch (e) {
      // One bad frame doesn't matter; the next tick tries again.
    } finally {
      busyRef.current = false;
    }
  }, [grabFrame, identify, addToSession]);

  /**
   * The scan loop is reached through a ref so the camera effect can depend on nothing but isOpen.
   *
   * Adding a card re-renders the catalog above us, which hands us a fresh onAddCard; if that
   * reached the effect's dependencies it would tear the camera down and stop the track, and the
   * scanner would die after the very first card it recognised.
   */
  const scanTickRef = useRef(scanTick);
  scanTickRef.current = scanTick;

  // Camera lifecycle
  useEffect(() => {
    if (!isOpen) return;
    aliveRef.current = true;
    setStatus('starting');
    setErrorMsg(null);

    let interval: number | undefined;
    (async () => {
      try {
        await ensureIndex();
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
        const caps: any = track?.getCapabilities?.() ?? {};
        setHasTorch(Boolean(caps.torch));
        // Cards are held close, so keep the lens hunting rather than locked on the room.
        if (caps.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any).catch(() => {});
        }

        setStatus('scanning');
        interval = window.setInterval(() => scanTickRef.current(), FRAME_INTERVAL_MS);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setStatus('error');
        setErrorMsg(
          e?.message === 'index unavailable'
            ? 'The card index is missing. Run scripts/build_card_art_index.mjs.'
            : e?.name === 'NotAllowedError'
              ? 'Camera access was blocked. Allow it for this site, or use "Scan a photo" below.'
              : 'No camera available here. Use "Scan a photo" below instead.'
        );
      }
    })();

    return () => {
      aliveRef.current = false;
      if (interval) window.clearInterval(interval);
      stopCamera();
    };
  }, [isOpen, ensureIndex, stopCamera]);

  useEffect(() => {
    if (isOpen) return;
    setChoices([]);
    setSession([]);
    setJustAdded(null);
    setSeeing(null);
    streakRef.current = { id: null, frames: 0, confidence: 0 };
    heldIdRef.current = null;
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
    setReadingPhoto(true);
    try {
      const bitmap = await createImageBitmap(file);
      const { matches } = await identify(bitmap, bitmap.width, bitmap.height);
      if (!matches.length) {
        setErrorMsg("Couldn't find a card in that photo. Try a plainer background.");
        return;
      }
      setChoices(matches.slice(0, 4));
    } catch (err) {
      setErrorMsg("Couldn't read that image.");
    } finally {
      setReadingPhoto(false);
    }
  };

  if (!isOpen) return null;

  const live = status === 'scanning';
  const sessionTotal = session.reduce((sum, e) => sum + e.count, 0);

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
              Hold cards in view one at a time — each is added as it's recognised.
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
          {/* The whole camera frame, uncropped, so what's on screen is what's being read. */}
          <div className="relative bg-black" style={{ aspectRatio: String(videoAspect) }}>
            <video
              ref={videoRef}
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth) setVideoAspect(v.videoWidth / v.videoHeight);
              }}
              className="w-full h-full object-contain"
            />

            {/* Outline of the card the scanner has actually found */}
            {live && seeing && (
              <div
                className="absolute rounded-lg pointer-events-none"
                style={{
                  left: `${seeing.x * 100}%`,
                  top: `${seeing.y * 100}%`,
                  width: `${seeing.width * 100}%`,
                  height: `${seeing.height * 100}%`,
                  border: `2px solid ${justAdded ? '#10b981' : 'rgba(255,255,255,0.85)'}`,
                  transition: 'all 0.12s linear',
                }}
              />
            )}

            {status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-300">
                Starting camera…
              </div>
            )}

            {hasTorch && live && (
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

            {choices.length > 0 ? (
              <div className="rounded-xl border p-3" style={{ background: 'var(--bg-surface-2)', borderColor: 'rgba(245,158,11,0.45)' }}>
                <div className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: '#fbbf24' }}>
                  {choices.length > 1 ? 'Same artwork on several printings — which one?' : 'Is this it?'}
                </div>
                <div className="flex flex-col gap-1.5">
                  {choices.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { heldIdRef.current = c.id; addToSession(c); }}
                      className="flex items-center gap-2.5 p-1.5 rounded-lg text-left cursor-pointer border"
                      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="w-8 h-11 rounded overflow-hidden bg-zinc-950 shrink-0">
                        {c.image_path && <img src={getCardImageUrl(c.image_path)} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                        <div className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                          {c.card_number} · {c.set_name || c.sets?.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : justAdded ? (
              <div className="flex items-center gap-3 rounded-xl border p-2.5" style={{ background: 'var(--bg-surface-2)', borderColor: 'rgba(16,185,129,0.45)' }}>
                <div className="w-9 h-12 rounded overflow-hidden bg-zinc-950 shrink-0">
                  {justAdded.image_path && <img src={getCardImageUrl(justAdded.image_path)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#34d399' }}>Added</div>
                  <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{justAdded.name}</div>
                  <div className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{justAdded.card_number}</div>
                </div>
                <button
                  type="button"
                  onClick={() => addToSession(justAdded)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-black cursor-pointer border shrink-0"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  +1
                </button>
              </div>
            ) : (
              <div className="text-center text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>
                {live ? (seeing ? 'Looking…' : 'Hold a card in view.') : 'Camera not running.'}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={addFoil} onChange={(e) => setAddFoil(e.target.checked)} className="w-4 h-4 accent-amber-400 cursor-pointer" />
                Add as foil
              </label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={readingPhoto}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {readingPhoto ? 'Reading…' : 'Scan a photo'}
              </button>
            </div>

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

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: 'left' | 'right';
  maxWidth?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  side = 'right',
  maxWidth = 'max-w-md',
}: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const content = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Drawer'}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      className="fixed inset-0 z-[100] flex bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ justifyContent: side === 'right' ? 'flex-end' : 'flex-start' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidth} h-full bg-zinc-900 border-${side === 'right' ? 'l' : 'r'} border-zinc-800 shadow-2xl flex flex-col animate-in ${side === 'right' ? 'slide-in-from-right' : 'slide-in-from-left'} duration-200`}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
            <h3 className="text-base font-black text-zinc-100">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}

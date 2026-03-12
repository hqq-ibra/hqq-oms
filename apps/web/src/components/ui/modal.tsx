'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from './button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const mouseDownTarget = React.useRef<EventTarget | null>(null);

  React.useEffect(() => {
    setMounted(typeof document !== 'undefined');
  }, []);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (mouseDownTarget.current === overlayRef.current && e.target === overlayRef.current) {
      onClose();
    }
    mouseDownTarget.current = null;
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[5vh] sm:pt-[10vh]"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/40 backdrop-blur-sm',
          'transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        className={cn(
          'relative z-10 w-full max-w-lg mb-[5vh]',
          'rounded-xl bg-white shadow-xl',
          'transition-all duration-200 ease-out',
          isOpen
            ? 'scale-100 opacity-100 translate-y-0'
            : 'scale-95 opacity-0 translate-y-4',
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6">
          {title && (
            <h2
              id="modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              {title}
            </h2>
          )}
          <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className={cn(!title && 'ml-auto', '-mr-2 h-8 w-8 p-0')}
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </Button>
        </div>
        <div className="p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

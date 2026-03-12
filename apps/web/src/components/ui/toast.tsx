'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 4000;

const typeConfig: Record<
  ToastType,
  { icon: React.ElementType; className: string }
> = {
  success: {
    icon: CheckCircle,
    className: 'bg-green-50 border-green-200 text-green-800',
  },
  error: {
    icon: XCircle,
    className: 'bg-red-50 border-red-200 text-red-800',
  },
  info: {
    icon: Info,
    className: 'bg-blue-50 border-blue-200 text-blue-800',
  },
};

function ToastItemComponent({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const { icon: Icon, className } = typeConfig[toast.type];
  const duration = toast.duration ?? TOAST_DURATION;

  React.useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg',
        className
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-1 hover:bg-black/5 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(typeof document !== 'undefined');
  }, []);

  const addToast = React.useCallback(
    (message: string, type: ToastType = 'info', duration = TOAST_DURATION) => {
      const id = crypto.randomUUID();
      setToasts((prev: ToastItem[]) => [...prev, { id, message, type, duration }]);
    },
    []
  );

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev: ToastItem[]) => prev.filter((t: ToastItem) => t.id !== id));
  }, []);

  const value = React.useMemo(
    () => ({ toasts, addToast, removeToast }),
    [toasts, addToast, removeToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full sm:max-w-md"
            aria-live="polite"
          >
            {toasts.map((toast) => (
              <ToastItemComponent
                key={toast.id}
                toast={toast}
                onDismiss={() => removeToast(toast.id)}
              />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

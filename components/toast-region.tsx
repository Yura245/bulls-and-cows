"use client";

import type { ToastItem } from "@/lib/use-toast-queue";

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
};

export function ToastRegion({ toasts, onDismiss }: Props) {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <span>{toast.text}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Закрыть уведомление"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

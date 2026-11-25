import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { ToastItem } from '../../hooks/useDiscountWorkspace';

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-md ${
              isError
                ? 'border-red-200 bg-white text-red-900'
                : isSuccess
                  ? 'border-emerald-200 bg-white text-slate-900'
                  : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            {isError ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            ) : isSuccess ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{toast.title}</div>
              {toast.message && <p className="mt-0.5 text-xs text-slate-600">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

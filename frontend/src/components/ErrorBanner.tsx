import { AlertCircle } from 'lucide-react';

export function ErrorBanner({
  errors,
  title,
}: {
  errors: string[];
  title?: string;
}) {
  if (!errors || errors.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-900"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-red-900">
            {title || `${errors.length} ${errors.length === 1 ? 'issue' : 'issues'} found`}
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-red-800">
            {errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

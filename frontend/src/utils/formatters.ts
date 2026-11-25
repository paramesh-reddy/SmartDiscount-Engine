export function formatINR(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(num)) return 'Rs.0';
  return `Rs.${Math.round(num).toLocaleString('en-IN')}`;
}

export function formatRuleValue(discountType: 'percentage' | 'flat', value: number): string {
  if (discountType === 'percentage') {
    return `${value}%`;
  }
  return formatINR(value);
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function extractApiError(err: unknown, fallback = 'An unexpected error occurred.'): string {
  if (typeof err === 'object' && err !== null) {
    const maybeAxios = err as { response?: { data?: { detail?: string; message?: string } }; message?: string };
    if (maybeAxios.response?.data?.detail) return maybeAxios.response.data.detail;
    if (maybeAxios.response?.data?.message) return maybeAxios.response.data.message;
    if (maybeAxios.message) return maybeAxios.message;
  }
  return fallback;
}

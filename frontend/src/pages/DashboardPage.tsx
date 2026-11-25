import { Link } from 'react-router-dom';
import { ArrowRight, Plus, FileUp, MessageSquarePlus } from 'lucide-react';
import { useDiscountWorkspace } from '../hooks/useDiscountWorkspace';
import { formatDateTime, formatINR } from '../utils/formatters';
import { TableSkeleton, EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';

export function DashboardPage() {
  const {
    activeCart,
    rules,
    latestCalculation,
    calculationHistory,
    loading,
    error,
    refreshAll,
  } = useDiscountWorkspace();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-5" />
          ))}
        </div>
        <TableSkeleton rows={4} cols={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBanner errors={[error]} title="Unable to load dashboard data" />
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    );
  }

  const itemCount = activeCart?.items.length ?? 0;
  const originalTotal = activeCart?.original_total ?? 0;
  const itemDiscountTotal = activeCart?.item_discount_total ?? 0;
  const cartDiscountTotal = activeCart?.cart_discount_total ?? 0;
  const finalTotal = activeCart?.final_total ?? 0;
  const totalSavings = Math.max(0, originalTotal - finalTotal);
  const activeRuleCount = rules.filter((r) => r.is_active).length;

  const metrics = [
    { label: 'Total Cart Items', value: String(itemCount), sub: `${activeRuleCount} active rules evaluated` },
    { label: 'Original Cart Value', value: formatINR(originalTotal), sub: 'Sum of item base prices' },
    { label: 'Item-Level Discounts', value: formatINR(itemDiscountTotal), sub: 'Non-stackable + stackable savings', accent: 'text-emerald-700' },
    { label: 'Cart-Level Discount', value: formatINR(cartDiscountTotal), sub: latestCalculation?.calculation_details.applied_cart_rules[0]?.rule_code ? `Triggered ${latestCalculation.calculation_details.applied_cart_rules[0].rule_code}` : 'Threshold not triggered', accent: cartDiscountTotal > 0 ? 'text-emerald-700' : 'text-slate-900' },
    { label: 'Total Customer Savings', value: formatINR(totalSavings), sub: originalTotal > 0 ? `${Math.round((totalSavings / originalTotal) * 100)}% effective reduction` : '0% reduction', accent: 'text-emerald-700' },
    { label: 'Final Cart Amount', value: formatINR(finalTotal), sub: 'Payable total after all offers', highlight: true },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Metrics Grid */}
      <section aria-label="Cart summary metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-xl border p-5 ${
                metric.highlight
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className={`text-xs font-medium ${metric.highlight ? 'text-slate-300' : 'text-slate-500'}`}>
                {metric.label}
              </div>
              <div className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums ${metric.highlight ? 'text-white' : metric.accent || 'text-slate-900'}`}>
                {metric.value}
              </div>
              <div className={`mt-1 text-xs ${metric.highlight ? 'text-slate-300' : 'text-slate-500'}`}>
                {metric.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Workflows */}
      <section aria-label="Quick actions" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link
          to="/ai-builder"
          className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MessageSquarePlus className="h-4 w-4 text-blue-600" />
              <span>Natural Language Rule</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Parse plain English offers into validated discount rules.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Link
          to="/pdf-upload"
          className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileUp className="h-4 w-4 text-blue-600" />
              <span>Upload Cart PDF</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Extract cart tables from PDFs, fix rows, and import.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Link
          to="/results"
          className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Plus className="h-4 w-4 text-blue-600" />
              <span>Full Discount Breakdown</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Inspect winning non-stackable rules, stacks, and savings.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </section>

      {/* Recent Calculations */}
      <section aria-label="Recent calculations" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">Recent Calculations</h2>
            <p className="text-xs text-slate-500">
              Audit log of persisted discount calculations for {activeCart?.cart_name ?? 'active cart'}.
            </p>
          </div>
          <Link
            to="/results"
            className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
          >
            View Breakdown
          </Link>
        </div>

        {calculationHistory.length === 0 ? (
          <EmptyState
            title="No calculations recorded yet"
            description="Add items to the shopping cart and click Recalculate Cart to persist your first calculation."
            action={
              <Link
                to="/cart"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Go to Shopping Cart
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3 text-right">Items</th>
                  <th className="px-4 py-3 text-right">Original Total</th>
                  <th className="px-4 py-3 text-right">Item Discounts</th>
                  <th className="px-4 py-3 text-right">Cart Discount</th>
                  <th className="px-4 py-3 text-right">Final Total</th>
                  <th className="px-4 py-3">Cart Offer Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calculationHistory.slice(0, 8).map((calc) => (
                  <tr key={calc.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTime(calc.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                      {calc.calculation_details.items.length}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                      {formatINR(calc.original_total)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-emerald-700">
                      -{formatINR(calc.item_discount_total)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-emerald-700">
                      {calc.cart_discount_total > 0 ? `-${formatINR(calc.cart_discount_total)}` : 'Rs.0'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                      {formatINR(calc.final_total)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {calc.calculation_details.cart_explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

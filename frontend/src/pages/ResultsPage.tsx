import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useDiscountWorkspace } from '../hooks/useDiscountWorkspace';
import { formatINR } from '../utils/formatters';
import { EmptyState, TableSkeleton } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';

export function ResultsPage() {
  const {
    activeCart,
    latestCalculation,
    loading,
    calculating,
    error,
    recalculateActiveCart,
  } = useDiscountWorkspace();

  if (loading) {
    return <TableSkeleton rows={6} cols={6} />;
  }

  if (error) {
    return <ErrorBanner errors={[error]} title="Unable to load calculation breakdown" />;
  }

  const details = latestCalculation?.calculation_details;

  if (!activeCart || !details || details.items.length === 0) {
    return (
      <EmptyState
        title="No discount breakdown available"
        description="Add items to your cart and run a calculation to inspect item-level and cart-level offers."
        action={
          <Link
            to="/cart"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Open Shopping Cart
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Discount Breakdown &amp; Savings Explanation
          </h2>
          <p className="text-xs text-slate-500">
            {details.rounding_policy}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void recalculateActiveCart()}
          disabled={calculating}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${calculating ? 'animate-spin' : ''}`} />
          <span>Recalculate Now</span>
        </button>
      </div>

      {/* Item-level Breakdown Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Original Price</th>
              <th className="px-4 py-3">Winning Non-Stackable</th>
              <th className="px-4 py-3">Stackable Offers</th>
              <th className="px-4 py-3 text-right">Item Savings</th>
              <th className="px-4 py-3 text-right">Final Price</th>
              <th className="px-4 py-3">Customer Explanation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {details.items.map((item) => (
              <tr key={item.item_id} className="align-top hover:bg-slate-50/70">
                <td className="px-4 py-3.5">
                  <div className="font-medium text-slate-900">{item.product_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {item.brand} <span aria-hidden="true">·</span> {item.platform}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-600">
                  {formatINR(item.base_price)}
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-700">
                  {item.winning_non_stackable ? (
                    <div>
                      <span className="font-mono font-semibold text-slate-900">
                        {item.winning_non_stackable.rule_code}
                      </span>{' '}
                      <span className="text-slate-600">
                        (-{formatINR(item.winning_non_stackable.saving_amount)})
                      </span>
                      {item.skipped_rules.length > 0 && (
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          Beat {item.skipped_rules.map((s) => `${s.rule_code} (${formatINR(s.potential_saving)})`).join(', ')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">None</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-700">
                  {item.stackable_rules.length > 0 ? (
                    <div className="space-y-0.5">
                      {item.stackable_rules.map((sr) => (
                        <div key={sr.id}>
                          <span className="font-mono font-semibold text-slate-900">{sr.rule_code}</span>{' '}
                          <span className="text-slate-600">(-{formatINR(sr.saving_amount)})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">None</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-xs font-medium tabular-nums text-emerald-700">
                  {item.discount_amount > 0 ? `-${formatINR(item.discount_amount)}` : 'Rs.0'}
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                  {formatINR(item.final_price)}
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-600">{item.explanation}</td>
              </tr>
            ))}

            {/* Pre-Cart Subtotal */}
            <tr className="border-t border-slate-200 bg-slate-50/70">
              <td className="px-4 py-3 text-xs font-medium text-slate-700" colSpan={4}>
                Pre-Cart-Discount Subtotal (Sum of final item prices)
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-emerald-700">
                -{formatINR(details.item_discount_total)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                {formatINR(details.pre_cart_discount_total)}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                Original value {formatINR(details.original_total)}
              </td>
            </tr>

            {/* Cart-Level Discount Line */}
            <tr className="border-t border-slate-200 bg-white">
              <td className="px-4 py-3.5 text-xs font-semibold text-slate-900" colSpan={4}>
                Cart-Level Discount
                {details.applied_cart_rules.length > 0 && (
                  <span className="ml-2 font-mono font-normal text-slate-600">
                    ({details.applied_cart_rules.map((r) => r.rule_code).join(', ')})
                  </span>
                )}
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-emerald-700">
                {details.cart_discount_total > 0 ? `-${formatINR(details.cart_discount_total)}` : 'Rs.0'}
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-500">—</td>
              <td className="px-4 py-3.5 text-xs text-slate-700">{details.cart_explanation}</td>
            </tr>
          </tbody>
        </table>

        {/* Final Totals Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-900 px-6 py-4 text-white">
          <div className="space-y-0.5">
            <div className="text-xs text-slate-300">Total Customer Savings</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
              {formatINR(details.total_savings)} saved
            </div>
          </div>
          <div className="text-right space-y-0.5">
            <div className="text-xs text-slate-300">Final Payable Cart Total</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-white">
              {formatINR(details.final_total)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

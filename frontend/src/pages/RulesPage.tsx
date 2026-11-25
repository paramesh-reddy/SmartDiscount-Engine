import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Power, Search } from 'lucide-react';
import { useDiscountWorkspace } from '../hooks/useDiscountWorkspace';
import { DiscountRule, DiscountRulePayload } from '../types';
import { createDiscountRule, deleteDiscountRule, updateDiscountRule } from '../api/discountRules';
import { extractApiError, formatINR, formatRuleValue } from '../utils/formatters';
import { RuleFormDialog } from '../components/RuleFormDialog';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState, TableSkeleton } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';

export function RulesPage() {
  const { rules, loading, error, refreshAll, pushToast } = useDiscountWorkspace();

  const [scopeFilter, setScopeFilter] = useState<'all' | 'platform' | 'brand' | 'cart'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'percentage' | 'flat'>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [ruleToDelete, setRuleToDelete] = useState<DiscountRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const platforms = useMemo(
    () => Array.from(new Set(rules.filter((r) => r.scope === 'platform' && r.applies_to).map((r) => r.applies_to!))),
    [rules]
  );

  const brands = useMemo(
    () => Array.from(new Set(rules.filter((r) => r.scope === 'brand' && r.applies_to).map((r) => r.applies_to!))),
    [rules]
  );

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (scopeFilter !== 'all' && r.scope !== scopeFilter) return false;
      if (typeFilter !== 'all' && r.discount_type !== typeFilter) return false;
      if (platformFilter !== 'all' && !(r.scope === 'platform' && r.applies_to === platformFilter)) return false;
      if (brandFilter !== 'all' && !(r.scope === 'brand' && r.applies_to === brandFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesCode = r.rule_code.toLowerCase().includes(q);
        const matchesTarget = (r.applies_to ?? '').toLowerCase().includes(q);
        if (!matchesCode && !matchesTarget) return false;
      }
      return true;
    });
  }, [rules, scopeFilter, typeFilter, platformFilter, brandFilter, searchQuery]);

  async function handleSaveRule(payload: DiscountRulePayload) {
    setSubmitting(true);
    try {
      if (editingRule) {
        await updateDiscountRule(editingRule.id, payload);
        pushToast({ type: 'success', title: `Updated ${editingRule.rule_code}`, message: 'Cart totals recalculated.' });
      } else {
        const created = await createDiscountRule(payload);
        pushToast({ type: 'success', title: `Created ${created.rule_code}`, message: 'Cart totals recalculated.' });
      }
      setDialogOpen(false);
      setEditingRule(null);
      await refreshAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Failed to save rule', message: extractApiError(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(rule: DiscountRule) {
    try {
      await updateDiscountRule(rule.id, { is_active: !rule.is_active });
      pushToast({
        type: 'success',
        title: `${rule.rule_code} ${rule.is_active ? 'deactivated' : 'activated'}`,
        message: 'Cart totals updated.',
      });
      await refreshAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Update failed', message: extractApiError(err) });
    }
  }

  async function handleConfirmDelete() {
    if (!ruleToDelete) return;
    setDeleting(true);
    try {
      await deleteDiscountRule(ruleToDelete.id);
      pushToast({ type: 'success', title: `Deleted ${ruleToDelete.rule_code}` });
      setRuleToDelete(null);
      await refreshAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Delete failed', message: extractApiError(err) });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <TableSkeleton rows={5} cols={7} />;
  }

  if (error) {
    return <ErrorBanner errors={[error]} title="Unable to load discount rules" />;
  }

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">Discount Rules Engine</h2>
          <p className="text-xs text-slate-500">
            Manage platform, brand, and cart-level rules. Changes automatically trigger cart recalculation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingRule(null);
            setDialogOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Rule</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Interactive Scope Segmented Control */}
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Filter by scope">
            {(['all', 'platform', 'brand', 'cart'] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => setScopeFilter(sc)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                  scopeFilter === sc ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sc === 'all' ? 'All Scopes' : sc}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rule code or target..."
              aria-label="Search rules"
              className="w-full rounded-lg border border-slate-200 py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'percentage' | 'flat')}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All types</option>
              <option value="percentage">Percentage</option>
              <option value="flat">Flat</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>Platform:</span>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All platforms</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>Brand:</span>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          {(scopeFilter !== 'all' || typeFilter !== 'all' || platformFilter !== 'all' || brandFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setScopeFilter('all');
                setTypeFilter('all');
                setPlatformFilter('all');
                setBrandFilter('all');
                setSearchQuery('');
              }}
              className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Rules Table */}
      {filteredRules.length === 0 ? (
        <EmptyState
          title="No matching discount rules"
          description="Try clearing your filters or create a new rule manually or with the AI Rule Builder."
          action={
            <button
              type="button"
              onClick={() => {
                setEditingRule(null);
                setDialogOpen(true);
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Add Discount Rule
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Target / Condition</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3">Stacking</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className={`hover:bg-slate-50/70 ${!rule.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                    {rule.rule_code}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium capitalize text-slate-700">
                    {rule.scope}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {rule.scope === 'cart'
                      ? `Min cart >= ${formatINR(rule.min_cart_value)}`
                      : rule.applies_to || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                    {formatRuleValue(rule.discount_type, rule.value)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {rule.stackable ? 'Stackable' : 'Non-stackable'}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">
                    <span className={rule.is_active ? 'text-emerald-700' : 'text-slate-400'}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(rule)}
                        title={rule.is_active ? 'Deactivate rule' : 'Activate rule'}
                        aria-label={rule.is_active ? `Deactivate ${rule.rule_code}` : `Activate ${rule.rule_code}`}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRule(rule);
                          setDialogOpen(true);
                        }}
                        title="Edit rule"
                        aria-label={`Edit ${rule.rule_code}`}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRuleToDelete(rule)}
                        title="Delete rule"
                        aria-label={`Delete ${rule.rule_code}`}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RuleFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingRule(null);
        }}
        initialRule={editingRule}
        onSubmitRule={handleSaveRule}
        submitting={submitting}
      />

      <Dialog
        open={Boolean(ruleToDelete)}
        onClose={() => setRuleToDelete(null)}
        title="Delete Discount Rule"
        description={`Are you sure you want to delete ${ruleToDelete?.rule_code}? Active cart totals will recalculate immediately.`}
        maxWidthClass="max-w-md"
      >
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setRuleToDelete(null)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleConfirmDelete()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Rule'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Upload, FileUp, RefreshCw, RotateCcw } from 'lucide-react';
import { useDiscountWorkspace } from '../hooks/useDiscountWorkspace';
import { CartItem, CartItemPayload } from '../types';
import { addCartItem, removeCartItem, replaceCartItems, updateCartItem } from '../api/carts';
import { extractApiError, formatINR } from '../utils/formatters';
import { parseCartCSV, SAMPLE_CART_CSV } from '../utils/csvParser';
import { CartItemDialog } from '../components/CartItemDialog';
import { ErrorBanner } from '../components/ErrorBanner';
import { EmptyState, TableSkeleton } from '../components/ui/EmptyState';

export function CartPage() {
  const {
    activeCart,
    loading,
    calculating,
    error,
    refreshAll,
    recalculateActiveCart,
    pushToast,
  } = useDiscountWorkspace();

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  async function handleSaveItem(payload: CartItemPayload) {
    if (!activeCart) return;
    setSubmitting(true);
    try {
      if (editingItem) {
        await updateCartItem(activeCart.id, editingItem.id, payload);
        pushToast({ type: 'success', title: 'Product updated', message: `${payload.product_name} saved.` });
      } else {
        await addCartItem(activeCart.id, payload);
        pushToast({ type: 'success', title: 'Product added', message: `${payload.product_name} added to cart.` });
      }
      setItemDialogOpen(false);
      setEditingItem(null);
      await refreshAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Failed to save product', message: extractApiError(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveItem(item: CartItem) {
    if (!activeCart) return;
    try {
      await removeCartItem(activeCart.id, item.id);
      pushToast({ type: 'success', title: 'Product removed', message: item.product_name });
      await refreshAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Remove failed', message: extractApiError(err) });
    }
  }

  async function handleImportCsvText(csvText: string, sourceLabel: string) {
    if (!activeCart) return;
    const { data, errors } = parseCartCSV(csvText);
    setCsvErrors(errors);
    if (errors.length > 0 && data.length === 0) {
      pushToast({ type: 'error', title: 'CSV import failed', message: 'Check formatting errors below.' });
      return;
    }
    try {
      await replaceCartItems(activeCart.id, data);
      pushToast({
        type: 'success',
        title: `Imported ${data.length} items`,
        message: `Loaded from ${sourceLabel} and recalculated discounts.`,
      });
      await refreshAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Import failed', message: extractApiError(err) });
    }
  }

  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = String(evt.target?.result ?? '');
      void handleImportCsvText(content, file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  if (loading) {
    return <TableSkeleton rows={6} cols={7} />;
  }

  if (error) {
    return <ErrorBanner errors={[error]} title="Unable to load shopping cart" />;
  }

  const items = activeCart?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            {activeCart?.cart_name ?? 'Shopping Cart'}
          </h2>
          <p className="text-xs text-slate-500">
            {items.length} {items.length === 1 ? 'product' : 'products'} · Original {formatINR(activeCart?.original_total)} · Final {formatINR(activeCart?.final_total)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => void handleImportCsvText(SAMPLE_CART_CSV, 'sample cart.csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Load Sample CSV</span>
          </button>

          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import CSV</span>
          </button>

          <Link
            to="/pdf-upload"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FileUp className="h-3.5 w-3.5" />
            <span>Upload PDF</span>
          </Link>

          <button
            type="button"
            onClick={() => void recalculateActiveCart()}
            disabled={calculating || !activeCart}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${calculating ? 'animate-spin' : ''}`} />
            <span>Recalculate</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setItemDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      <ErrorBanner errors={csvErrors} title="CSV validation issues" />

      {/* Cart Items Table */}
      {items.length === 0 ? (
        <EmptyState
          title="Your shopping cart is empty"
          description="Add a product manually, load the Opptra sample CSV, or upload a cart PDF to calculate discounts."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setItemDialogOpen(true);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Add Product
              </button>
              <button
                type="button"
                onClick={() => void handleImportCsvText(SAMPLE_CART_CSV, 'sample cart.csv')}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Load Sample CSV
              </button>
            </div>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3 text-right">Base Price</th>
                <th className="px-4 py-3 text-right">Applied Discount</th>
                <th className="px-4 py-3 text-right">Final Price</th>
                <th className="px-4 py-3">Discount Explanation</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-900">{item.product_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{item.brand}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{item.platform}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600">
                    {formatINR(item.base_price)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-emerald-700">
                    {item.discount_amount > 0 ? `-${formatINR(item.discount_amount)}` : 'Rs.0'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                    {formatINR(item.final_price)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {item.explanation || 'No offers available.'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(item);
                          setItemDialogOpen(true);
                        }}
                        aria-label={`Edit ${item.product_name}`}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveItem(item)}
                        aria-label={`Remove ${item.product_name}`}
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

          {/* Summary Footer Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-4 py-3.5 text-xs">
            <div className="flex flex-wrap items-center gap-4 text-slate-600">
              <span>
                Original: <strong className="font-mono tabular-nums text-slate-900">{formatINR(activeCart?.original_total)}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Item Savings: <strong className="font-mono tabular-nums text-emerald-700">-{formatINR(activeCart?.item_discount_total)}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Cart Discount: <strong className="font-mono tabular-nums text-emerald-700">-{formatINR(activeCart?.cart_discount_total)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-slate-900">
                Final Total: <span className="font-mono tabular-nums">{formatINR(activeCart?.final_total)}</span>
              </span>
              <Link to="/results" className="font-medium text-blue-600 hover:text-blue-700">
                Inspect Breakdown
              </Link>
            </div>
          </div>
        </div>
      )}

      <CartItemDialog
        open={itemDialogOpen}
        onClose={() => {
          setItemDialogOpen(false);
          setEditingItem(null);
        }}
        initialItem={editingItem}
        onSubmitItem={handleSaveItem}
        submitting={submitting}
      />
    </div>
  );
}

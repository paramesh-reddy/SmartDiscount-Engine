import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CalculationResult, Cart, DiscountRule } from '../types';
import { listCarts } from '../api/carts';
import { listDiscountRules } from '../api/discountRules';
import { calculateCart, getCalculationResults } from '../api/calculations';
import { extractApiError } from '../utils/formatters';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface WorkspaceContextValue {
  carts: Cart[];
  activeCart: Cart | null;
  rules: DiscountRule[];
  latestCalculation: CalculationResult | null;
  calculationHistory: CalculationResult[];
  loading: boolean;
  calculating: boolean;
  error: string | null;
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
  selectCart: (cartId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  recalculateActiveCart: () => Promise<CalculationResult | null>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [activeCartId, setActiveCartId] = useState<string | null>(null);
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [calculationHistory, setCalculationHistory] = useState<CalculationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 4500);
    },
    [dismissToast]
  );

  const loadHistoryForCart = useCallback(async (cartId: string) => {
    const res = await getCalculationResults(cartId, 20);
    setCalculationHistory(res.items);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cartsRes, rulesRes] = await Promise.all([
        listCarts(),
        listDiscountRules({ limit: 100 }),
      ]);
      setCarts(cartsRes.items);
      setRules(rulesRes.items);

      const targetId =
        activeCartId && cartsRes.items.some((c) => c.id === activeCartId)
          ? activeCartId
          : cartsRes.items[0]?.id ?? null;

      setActiveCartId(targetId);
      if (targetId) {
        await loadHistoryForCart(targetId);
      } else {
        setCalculationHistory([]);
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to connect to the Discount Engine API.'));
    } finally {
      setLoading(false);
    }
  }, [activeCartId, loadHistoryForCart]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const selectCart = useCallback(
    async (cartId: string) => {
      setActiveCartId(cartId);
      try {
        await loadHistoryForCart(cartId);
      } catch (err) {
        pushToast({ type: 'error', title: 'Failed to load cart history', message: extractApiError(err) });
      }
    },
    [loadHistoryForCart, pushToast]
  );

  const recalculateActiveCart = useCallback(async () => {
    if (!activeCartId) return null;
    setCalculating(true);
    try {
      const res = await calculateCart(activeCartId);
      await refreshAll();
      pushToast({
        type: 'success',
        title: 'Discounts recalculated',
        message: `Final cart total: Rs.${res.final_total.toLocaleString('en-IN')}`,
      });
      return res;
    } catch (err) {
      pushToast({ type: 'error', title: 'Calculation failed', message: extractApiError(err) });
      return null;
    } finally {
      setCalculating(false);
    }
  }, [activeCartId, pushToast, refreshAll]);

  const activeCart = carts.find((c) => c.id === activeCartId) ?? carts[0] ?? null;
  const latestCalculation = calculationHistory[0] ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        carts,
        activeCart,
        rules,
        latestCalculation,
        calculationHistory,
        loading,
        calculating,
        error,
        toasts,
        pushToast,
        dismissToast,
        selectCart,
        refreshAll,
        recalculateActiveCart,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useDiscountWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useDiscountWorkspace must be used inside WorkspaceProvider.');
  }
  return ctx;
}

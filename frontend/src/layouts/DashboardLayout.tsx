import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  SlidersHorizontal,
  ShoppingCart,
  MessageSquarePlus,
  FileUp,
  ReceiptText,
  RefreshCw,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react';
import { useDiscountWorkspace } from '../hooks/useDiscountWorkspace';
import { ToastViewport } from '../components/ui/Toast';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/rules', label: 'Discount Rules', icon: SlidersHorizontal },
  { to: '/cart', label: 'Shopping Cart', icon: ShoppingCart },
  { to: '/ai-builder', label: 'AI Rule Builder', icon: MessageSquarePlus },
  { to: '/pdf-upload', label: 'PDF Cart Upload', icon: FileUp },
  { to: '/results', label: 'Discount Breakdown', icon: ReceiptText },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/rules': 'Discount Rules',
  '/cart': 'Shopping Cart',
  '/ai-builder': 'Natural Language Rule Builder',
  '/pdf-upload': 'PDF Cart Import',
  '/results': 'Results & Breakdown',
};

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { activeCart, recalculateActiveCart, calculating, toasts, dismissToast } = useDiscountWorkspace();

  const pageTitle = PAGE_TITLES[location.pathname] || 'Workspace';

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-5">
        <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Opptra Discount Engine
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <a
          href="/docs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <span>Swagger API Docs</span>
          <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-[248px] shrink-0 border-r border-slate-200 lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 w-[260px] border-r border-slate-200 bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-slate-400 sm:inline">Workspace</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <h1 className="truncate font-display text-base font-semibold text-slate-900">
                {pageTitle}
              </h1>
              {activeCart && (
                <>
                  <span className="hidden text-slate-300 md:inline">·</span>
                  <span className="hidden truncate text-xs text-slate-500 md:inline">
                    {activeCart.cart_name} ({activeCart.items.length} items)
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void recalculateActiveCart()}
              disabled={!activeCart || calculating}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${calculating ? 'animate-spin' : ''}`} />
              <span>{calculating ? 'Calculating...' : 'Recalculate Cart'}</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

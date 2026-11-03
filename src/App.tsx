/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Plus,
  Settings,
  Wallet,
  X,
} from 'lucide-react';
import { CashView } from './components/CashView';
import { DashboardView } from './components/DashboardView';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ExpensesView } from './components/ExpensesView';
import { IdealSheetView } from './components/IdealSheetView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { formatCurrency } from './lib/format';
import { ActiveSection, type Expense } from './types/finance';

interface NavItem {
  id: ActiveSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: ActiveSection.Dashboard, label: 'Dashboard', icon: LayoutDashboard },
  { id: ActiveSection.Expenses, label: 'Daily Expenses', icon: ClipboardList },
  { id: ActiveSection.IdealSheet, label: 'Ideal Expense Sheet', icon: FileSpreadsheet },
  { id: ActiveSection.RemainingCash, label: 'Remaining Cash', icon: Wallet },
  { id: ActiveSection.Reports, label: 'Reports', icon: BarChart3 },
  { id: ActiveSection.Settings, label: 'Settings', icon: Settings },
];

const SECTION_TITLES: Record<ActiveSection, string> = {
  [ActiveSection.Dashboard]: 'Dashboard',
  [ActiveSection.Expenses]: 'Daily Expenses',
  [ActiveSection.IdealSheet]: 'Ideal Expense Sheet',
  [ActiveSection.RemainingCash]: 'Remaining Cash',
  [ActiveSection.Reports]: 'Financial Reports',
  [ActiveSection.Settings]: 'Settings',
};

function WorkspaceShell() {
  const { loading, error, settings, todayStatus, toasts, dismissToast } = useFinance();

  const [activeSection, setActiveSection] = useState<ActiveSection>(ActiveSection.Dashboard);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modal state for Add / Edit Expense
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>(undefined);

  const handleOpenAddExpense = (defaultDate?: string) => {
    setEditingExpense(null);
    setModalDefaultDate(defaultDate);
    setExpenseModalOpen(true);
  };

  const handleOpenEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setModalDefaultDate(expense.date);
    setExpenseModalOpen(true);
  };

  const handleNavigate = (section: ActiveSection) => {
    setActiveSection(section);
    setMobileSidebarOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Responsive Deep Navy Sidebar Navigation */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-900 text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-6">
          <button
            type="button"
            onClick={() => handleNavigate(ActiveSection.Dashboard)}
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            LedgerFlow
          </button>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quiet Cash & Daily Status Summary in Sidebar Footer */}
        <div className="border-t border-slate-800 px-5 py-4 text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <span>Remaining Cash</span>
            <button
              type="button"
              onClick={() => handleNavigate(ActiveSection.RemainingCash)}
              className="font-mono font-semibold tabular-nums text-white hover:underline"
            >
              {formatCurrency(settings.cashBalance, settings.currency)}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span>Today&apos;s Log</span>
            <span className="font-medium text-slate-200">
              {todayStatus === 'expenses_recorded'
                ? 'Recorded'
                : todayStatus === 'no_expenses_today'
                ? 'No Spend'
                : 'Not Updated'}
            </span>
          </div>
          {settings.userName && (
            <div className="mt-2.5 truncate border-t border-slate-800 pt-2.5 text-slate-300">
              {settings.userName}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: Breadcrumb on Left, Primary Action on Right */}
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs sm:px-8 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 truncate text-sm">
              <span className="hidden font-medium text-slate-500 sm:inline dark:text-slate-400">
                LedgerFlow
              </span>
              <span aria-hidden="true" className="hidden text-slate-300 sm:inline dark:text-slate-700">
                /
              </span>
              <h1 className="truncate font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {SECTION_TITLES[activeSection]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenAddExpense()}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Quick Expense
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {loading ? (
            <div className="space-y-6">
              <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
                <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">Local Storage Initialization Error</p>
              <p className="mt-1">{error}</p>
            </div>
          ) : (
            <>
              {activeSection === ActiveSection.Dashboard && (
                <DashboardView
                  onNavigate={handleNavigate}
                  onOpenExpenseModal={handleOpenAddExpense}
                />
              )}
              {activeSection === ActiveSection.Expenses && (
                <ExpensesView
                  onOpenAddModal={handleOpenAddExpense}
                  onOpenEditModal={handleOpenEditExpense}
                />
              )}
              {activeSection === ActiveSection.IdealSheet && <IdealSheetView />}
              {activeSection === ActiveSection.RemainingCash && <CashView />}
              {activeSection === ActiveSection.Reports && <ReportsView />}
              {activeSection === ActiveSection.Settings && <SettingsView />}
            </>
          )}
        </main>
      </div>

      {/* Global Add / Edit Expense Modal */}
      <ExpenseFormModal
        open={expenseModalOpen}
        editingExpense={editingExpense}
        defaultDate={modalDefaultDate}
        onClose={() => {
          setExpenseModalOpen(false);
          setEditingExpense(null);
        }}
      />

      {/* Toast Feedback Stack */}
      {toasts.length > 0 && (
        <div
          className="no-print fixed right-4 bottom-4 z-50 flex flex-col gap-2"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-xs font-medium shadow-md ${
                t.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                  : 'border-slate-200 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              {t.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
              <span>{t.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="ml-2 opacity-70 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <FinanceProvider>
      <WorkspaceShell />
    </FinanceProvider>
  );
}

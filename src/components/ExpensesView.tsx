import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Slash,
  Trash2,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  formatCurrency,
  formatDateReadable,
  getCurrencyPrefix,
  getCurrentYearMonth,
  shiftDateByDays,
} from '../lib/format';
import type { Expense, PaymentMethod, RecurringExpense, RecurringFrequency } from '../types/finance';
import { PAYMENT_METHODS } from '../types/finance';
import { ConfirmDialog } from './ConfirmDialog';

interface ExpensesViewProps {
  onOpenAddModal: (defaultDate?: string) => void;
  onOpenEditModal: (expense: Expense) => void;
}

type ViewScope = 'all' | 'date' | 'month';
type SubTab = 'ledger' | 'recurring';

export function ExpensesView({ onOpenAddModal, onOpenEditModal }: ExpensesViewProps) {
  const {
    settings,
    expenses,
    recurringExpenses,
    todayDate,
    todayStatus,
    removeExpense,
    markNoExpensesToday,
    undoNoExpensesToday,
    saveRecurring,
    removeRecurring,
    recordRecurringNow,
  } = useFinance();

  const [subTab, setSubTab] = useState<SubTab>('ledger');
  const [scope, setScope] = useState<ViewScope>('month');
  const [selectedDate, setSelectedDate] = useState<string>(todayDate);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    todayDate.slice(0, 7) || getCurrentYearMonth()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  // Delete confirmation state
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [restoreCashOnDelete, setRestoreCashOnDelete] = useState(true);

  // No Expenses Today dialog
  const [confirmNoSpendOpen, setConfirmNoSpendOpen] = useState(false);

  // Recurring Expense Form state
  const [recTitle, setRecTitle] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recCategory, setRecCategory] = useState(settings.categories[0] || 'Bills');
  const [recPayment, setRecPayment] = useState<PaymentMethod>('Bank Transfer');
  const [recFrequency, setRecFrequency] = useState<RecurringFrequency>('monthly');
  const [recNextDue, setRecNextDue] = useState(todayDate);
  const [recNotes, setRecNotes] = useState('');
  const [recError, setRecError] = useState<string | null>(null);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses.filter((exp) => {
      if (scope === 'date' && exp.date !== selectedDate) return false;
      if (scope === 'month' && !exp.date.startsWith(selectedMonth)) return false;
      if (categoryFilter !== 'ALL' && exp.category !== categoryFilter) return false;
      if (paymentFilter !== 'ALL' && exp.paymentMethod !== paymentFilter) return false;
      if (q) {
        const hay = `${exp.id} ${exp.title} ${exp.category} ${exp.paymentMethod} ${exp.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, scope, selectedDate, selectedMonth, categoryFilter, paymentFilter, searchQuery]);

  const summary = useMemo(() => {
    let total = 0;
    let cashTotal = 0;
    let digitalTotal = 0;
    for (const exp of filteredExpenses) {
      total += exp.amount;
      if (exp.paymentMethod === 'Cash') {
        cashTotal += exp.amount;
      } else {
        digitalTotal += exp.amount;
      }
    }
    return {
      count: filteredExpenses.length,
      total,
      cashTotal,
      digitalTotal,
    };
  }, [filteredExpenses]);

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError(null);
    const cleanTitle = recTitle.trim();
    const num = Number(recAmount);
    if (!cleanTitle) {
      setRecError('Please enter a recurring expense title (e.g. House Rent, PTCL Fiber).');
      return;
    }
    if (!Number.isFinite(num) || num <= 0) {
      setRecError('Please enter a valid positive amount.');
      return;
    }

    const item: RecurringExpense = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      amount: Math.round(num * 100) / 100,
      category: recCategory || 'Bills',
      paymentMethod: recPayment,
      frequency: recFrequency,
      nextDueDate: recNextDue || todayDate,
      notes: recNotes.trim(),
      active: true,
      createdAt: new Date().toISOString(),
    };

    await saveRecurring(item);
    setRecTitle('');
    setRecAmount('');
    setRecNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setSubTab('ledger')}
            className={`whitespace-nowrap shrink-0 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              subTab === 'ledger'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Daily Expense Records ({expenses.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('recurring')}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              subTab === 'recurring'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Repeat className="h-3.5 w-3.5" />
            Recurring Bills ({recurringExpenses.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {todayStatus === 'not_updated' && (
            <button
              type="button"
              onClick={() => setConfirmNoSpendOpen(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Slash className="h-3.5 w-3.5" />
              No Expenses Today
            </button>
          )}
          {todayStatus === 'no_expenses_today' && (
            <button
              type="button"
              onClick={() => void undoNoExpensesToday()}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo &ldquo;No Expenses Today&rdquo;
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenAddModal(scope === 'date' ? selectedDate : todayDate)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        </div>
      </div>

      {subTab === 'ledger' ? (
        <>
          {/* Filter & Search Bar */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {/* View Scope Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                  {(['month', 'date', 'all'] as ViewScope[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setScope(mode)}
                      className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        scope === mode
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {mode === 'month' ? 'By Month' : mode === 'date' ? 'By Date' : 'All Records'}
                    </button>
                  ))}
                </div>

                {scope === 'date' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedDate((d) => shiftDateByDays(d, -1))}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      aria-label="Previous day"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedDate((d) => shiftDateByDays(d, 1))}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      aria-label="Next day"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {scope === 'month' && (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                )}
              </div>

              {/* Search + Category + Payment Method Filters */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:flex lg:items-center">
                <div className="relative min-w-[200px]">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search title, ID, notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  aria-label="Filter by category"
                >
                  <option value="ALL">All Categories</option>
                  {settings.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  aria-label="Filter by payment method"
                >
                  <option value="ALL">All Payment Methods</option>
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filtered Summary Totals */}
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <span>
                Showing <strong className="font-mono text-slate-900 dark:text-slate-100">{summary.count}</strong>{' '}
                {summary.count === 1 ? 'record' : 'records'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Filtered Total:{' '}
                <strong className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(summary.total, settings.currency)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Physical Cash:{' '}
                <strong className="font-mono text-slate-900 dark:text-slate-100">
                  {formatCurrency(summary.cashTotal, settings.currency)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Bank / Digital:{' '}
                <strong className="font-mono text-slate-900 dark:text-slate-100">
                  {formatCurrency(summary.digitalTotal, settings.currency)}
                </strong>
              </span>
            </div>
          </section>

          {/* Expenses Data Ledger Table */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {filteredExpenses.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  No matching expense records found
                </p>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  {expenses.length === 0
                    ? 'Your local database currently has zero expenses. Click "Add Expense" to log your first transaction.'
                    : 'Try adjusting your date, month, category, or search filters.'}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenAddModal(scope === 'date' ? selectedDate : todayDate)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <Plus className="h-4 w-4" />
                    Record Expense
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                      <th className="px-4 py-3">Date &amp; Time</th>
                      <th className="px-4 py-3">Expense Title &amp; Details</th>
                      <th className="px-4 py-3">Category · Payment</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredExpenses.map((exp) => (
                      <tr
                        key={exp.id}
                        className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <div className="font-mono text-xs font-medium tabular-nums text-slate-900 dark:text-slate-100">
                            {formatDateReadable(exp.date)}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                            {exp.time} · {exp.id}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {exp.title}
                          </div>
                          {exp.notes && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {exp.notes}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {exp.category}
                          </span>
                          <span aria-hidden="true" className="mx-1.5 text-slate-400">
                            ·
                          </span>
                          <span>{exp.paymentMethod}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right align-top font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCurrency(exp.amount, settings.currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenEditModal(exp)}
                              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                              aria-label={`Edit ${exp.title}`}
                              title="Edit expense"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRestoreCashOnDelete(true);
                                setExpenseToDelete(exp);
                              }}
                              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                              aria-label={`Delete ${exp.title}`}
                              title="Delete expense"
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
          </section>
        </>
      ) : (
        /* Recurring Expenses Manager */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Add Recurring Expense
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Track rent, internet packages, mobile bundles, subscriptions, and monthly utility bills.
            </p>

            <form onSubmit={handleCreateRecurring} className="mt-4 space-y-3.5">
              {recError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {recError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. House Rent, Fiber Internet, Mobile Package"
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Amount ({getCurrencyPrefix(settings.currency).trim()}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="0"
                    value={recAmount}
                    onChange={(e) => setRecAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Frequency
                  </label>
                  <select
                    value={recFrequency}
                    onChange={(e) => setRecFrequency(e.target.value as RecurringFrequency)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Category
                  </label>
                  <select
                    value={recCategory}
                    onChange={(e) => setRecCategory(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {settings.categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Payment Method
                  </label>
                  <select
                    value={recPayment}
                    onChange={(e) => setRecPayment(e.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Next Due Date
                </label>
                <input
                  type="date"
                  value={recNextDue}
                  onChange={(e) => setRecNextDue(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Account number or billing note"
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Save Recurring Schedule
              </button>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Scheduled Recurring Bills &amp; Subscriptions
              </h3>
            </div>
            {recurringExpenses.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No recurring expenses configured yet
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Add recurring commitments like Rent, Internet, or Subscriptions on the left to log them with one click when due.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recurringExpenses.map((item) => {
                  const isDue = item.active && item.nextDueDate <= todayDate;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {item.title}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {formatCurrency(item.amount, settings.currency)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {item.category} · {item.paymentMethod} · Every {item.frequency} · Next due:{' '}
                          <span
                            className={`font-mono font-medium ${
                              isDue
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {formatDateReadable(item.nextDueDate)}
                            {isDue ? ' (Due)' : ''}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void recordRecurringNow(item)}
                          className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Record Today
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeRecurring(item.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          aria-label={`Delete recurring ${item.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Delete Expense Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(expenseToDelete)}
        title="Delete Expense Record"
        description={
          expenseToDelete
            ? `Are you sure you want to permanently delete "${expenseToDelete.title}" (${formatCurrency(expenseToDelete.amount, settings.currency)})?`
            : ''
        }
        confirmLabel="Delete Expense"
        variant="danger"
        extraContent={
          expenseToDelete?.paymentMethod === 'Cash' ? (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <input
                type="checkbox"
                checked={restoreCashOnDelete}
                onChange={(e) => setRestoreCashOnDelete(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span>
                Restore{' '}
                <strong className="font-mono">
                  {formatCurrency(expenseToDelete.amount, settings.currency)}
                </strong>{' '}
                back to physical Remaining Cash balance
              </span>
            </label>
          ) : undefined
        }
        onConfirm={() => {
          if (expenseToDelete) {
            void removeExpense(expenseToDelete, restoreCashOnDelete);
          }
          setExpenseToDelete(null);
        }}
        onCancel={() => setExpenseToDelete(null)}
      />

      {/* No Expenses Today Confirmation Modal */}
      <ConfirmDialog
        open={confirmNoSpendOpen}
        title="No Expenses Today"
        description="Are you sure you did not spend any money today?"
        confirmLabel="Yes, Mark No Expenses"
        onConfirm={() => {
          setConfirmNoSpendOpen(false);
          void markNoExpensesToday();
        }}
        onCancel={() => setConfirmNoSpendOpen(false)}
      />
    </div>
  );
}

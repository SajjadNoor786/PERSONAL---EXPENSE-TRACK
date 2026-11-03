import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  formatCurrency,
  formatMonthReadable,
  getCurrencyPrefix,
  getCurrentYearMonth,
  getDaysInMonth,
  getRemainingDaysInMonth,
  normalizeIdealToMonthly,
} from '../lib/format';
import type { BudgetPeriod, IdealBudgetItem } from '../types/finance';
import { ConfirmDialog } from './ConfirmDialog';

export function IdealSheetView() {
  const {
    settings,
    expenses,
    idealBudgets,
    todayDate,
    saveIdealItem,
    removeIdealItem,
    addCategory,
  } = useFinance();

  const [selectedMonth, setSelectedMonth] = useState<string>(
    todayDate.slice(0, 7) || getCurrentYearMonth()
  );

  // Add category budget form
  const [selectedCat, setSelectedCat] = useState<string>(settings.categories[0] || 'Food');
  const [useNewCategory, setUseNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>('monthly');
  const [formError, setFormError] = useState<string | null>(null);

  // Inline row editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editPeriod, setEditPeriod] = useState<BudgetPeriod>('monthly');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<IdealBudgetItem | null>(null);

  const daysInMonth = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth]);
  const remainingDays = useMemo(
    () => getRemainingDaysInMonth(selectedMonth, todayDate),
    [selectedMonth, todayDate]
  );

  const actualByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of expenses) {
      if (exp.date.startsWith(selectedMonth)) {
        map[exp.category] = (map[exp.category] || 0) + exp.amount;
      }
    }
    return map;
  }, [expenses, selectedMonth]);

  const sheetRows = useMemo(() => {
    return idealBudgets.map((item) => {
      const monthlyIdeal = normalizeIdealToMonthly(item.amount, item.period, daysInMonth);
      const actual = Math.round((actualByCategory[item.category] || 0) * 100) / 100;
      const remaining = Math.round((monthlyIdeal - actual) * 100) / 100;
      const isOverspent = actual > monthlyIdeal;
      const suggestedDaily =
        remaining > 0 && remainingDays > 0 ? Math.round(remaining / remainingDays) : 0;

      return {
        item,
        monthlyIdeal,
        actual,
        remaining,
        isOverspent,
        overspentBy: isOverspent ? Math.round((actual - monthlyIdeal) * 100) / 100 : 0,
        underspentBy: !isOverspent ? remaining : 0,
        suggestedDaily,
      };
    });
  }, [idealBudgets, daysInMonth, actualByCategory, remainingDays]);

  // Categories that have actual expenses this month but aren't in Ideal Sheet yet
  const unplannedCategories = useMemo(() => {
    const plannedSet = new Set(idealBudgets.map((i) => i.category));
    return Object.entries(actualByCategory)
      .filter(([cat, amt]) => !plannedSet.has(cat) && amt > 0)
      .map(([category, actual]) => ({ category, actual }));
  }, [idealBudgets, actualByCategory]);

  const totals = useMemo(() => {
    const totalPlannedMonthly = sheetRows.reduce((s, r) => s + r.monthlyIdeal, 0);
    const totalPlannedActual = sheetRows.reduce((s, r) => s + r.actual, 0);
    const totalAllMonthActual = Object.values(actualByCategory).reduce((s, v) => s + v, 0);
    const netPlanSavings = totalPlannedMonthly - totalAllMonthActual;
    const suggestedOverallDaily =
      netPlanSavings > 0 && remainingDays > 0 ? Math.round(netPlanSavings / remainingDays) : 0;
    const exceededCategories = sheetRows.filter((r) => r.isOverspent);

    return {
      totalPlannedMonthly,
      totalPlannedActual,
      totalAllMonthActual,
      netPlanSavings,
      suggestedOverallDaily,
      exceededCategories,
    };
  }, [sheetRows, actualByCategory, remainingDays]);

  const handleAddOrUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const catName = useNewCategory ? newCategoryName.trim() : selectedCat.trim();
    if (!catName) {
      setFormError('Please select or enter a category name.');
      return;
    }

    const num = Number(budgetAmount);
    if (!Number.isFinite(num) || num <= 0) {
      setFormError('Please enter an ideal budget amount greater than 0.');
      return;
    }

    if (useNewCategory) {
      await addCategory(catName);
    }

    const existing = idealBudgets.find(
      (i) => i.category.toLowerCase() === catName.toLowerCase()
    );

    const record: IdealBudgetItem = {
      id: existing ? existing.id : `ideal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category: existing ? existing.category : catName,
      amount: Math.round(num * 100) / 100,
      period: budgetPeriod,
      updatedAt: new Date().toISOString(),
    };

    await saveIdealItem(record);
    setBudgetAmount('');
    setNewCategoryName('');
    setUseNewCategory(false);
  };

  const handleSaveInlineEdit = async (rowItem: IdealBudgetItem) => {
    const num = Number(editAmount);
    if (!Number.isFinite(num) || num <= 0) return;
    await saveIdealItem({
      ...rowItem,
      amount: Math.round(num * 100) / 100,
      period: editPeriod,
      updatedAt: new Date().toISOString(),
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Exceeded Category Warning Banner */}
      {totals.exceededCategories.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-sm font-semibold">
                {totals.exceededCategories.length}{' '}
                {totals.exceededCategories.length === 1 ? 'category has' : 'categories have'} exceeded its Ideal Budget in{' '}
                {formatMonthReadable(selectedMonth)}
              </p>
              <p className="mt-1 text-xs opacity-90">
                {totals.exceededCategories
                  .map(
                    (c) =>
                      `${c.item.category}: Overspent by ${formatCurrency(c.overspentBy, settings.currency)}`
                  )
                  .join(' · ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Savings Tracker & Plan Summary Header */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Ideal Expense Plan &amp; Savings Tracker
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Plan daily, weekly, or monthly category targets and compare against actual recorded spending.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="ideal-month-picker" className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Comparison Month:
            </label>
            <input
              id="ideal-month-picker"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 dark:divide-slate-800">
          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Ideal Monthly Plan
            </span>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(totals.totalPlannedMonthly, settings.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Across {sheetRows.length} planned {sheetRows.length === 1 ? 'category' : 'categories'}
            </p>
          </div>

          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Actual Monthly Expenses
            </span>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(totals.totalAllMonthActual, settings.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Recorded in {formatMonthReadable(selectedMonth)}
            </p>
          </div>

          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Savings vs. Ideal Plan
            </span>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                totals.totalPlannedMonthly === 0
                  ? 'text-slate-900 dark:text-slate-100'
                  : totals.netPlanSavings >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {totals.totalPlannedMonthly === 0
                ? '—'
                : totals.netPlanSavings >= 0
                ? formatCurrency(totals.netPlanSavings, settings.currency)
                : `-${formatCurrency(Math.abs(totals.netPlanSavings), settings.currency)}`}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {totals.totalPlannedMonthly === 0
                ? 'Add category targets below'
                : totals.netPlanSavings >= 0
                ? 'Underspent relative to ideal plan'
                : `Overspent by ${formatCurrency(Math.abs(totals.netPlanSavings), settings.currency)}`}
            </p>
          </div>

          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Suggested Daily Limit
            </span>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-blue-800 dark:text-blue-400">
              {totals.totalPlannedMonthly > 0
                ? formatCurrency(totals.suggestedOverallDaily, settings.currency)
                : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {remainingDays > 0
                ? `Based on ${remainingDays} remaining day(s) in month`
                : 'Completed past month'}
            </p>
          </div>
        </div>
      </section>

      {/* Add / Update Category Target Form */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Add or Update Category Budget Target
          </h3>
          <button
            type="button"
            onClick={() => setUseNewCategory((prev) => !prev)}
            className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            {useNewCategory ? 'Select existing category' : '+ Create new category'}
          </button>
        </div>

        <form onSubmit={handleAddOrUpdatePlan} className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Category
            </label>
            {useNewCategory ? (
              <input
                type="text"
                placeholder="New category name..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            ) : (
              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {settings.categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Ideal Budget ({getCurrencyPrefix(settings.currency).trim()})
            </label>
            <input
              type="number"
              step="any"
              min="1"
              placeholder="e.g. 8000"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Budget Cadence
            </label>
            <select
              value={budgetPeriod}
              onChange={(e) => setBudgetPeriod(e.target.value as BudgetPeriod)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="monthly">Monthly Budget</option>
              <option value="weekly">Weekly Budget</option>
              <option value="daily">Daily Budget</option>
            </select>
          </div>

          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Save Plan
            </button>
          </div>
        </form>
        {formError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{formError}</p>}
      </section>

      {/* Ideal Expense Sheet Comparison Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Category-Wise Ideal vs. Actual Sheet ({formatMonthReadable(selectedMonth)})
          </h3>
        </div>

        {sheetRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Your Ideal Expense Sheet is currently empty
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
              Add target budgets for categories like Food, Transport, Bills, and Shopping above to automatically track overspending, underspending, and daily category limits.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Configured Plan</th>
                  <th className="px-4 py-3 text-right">Monthly Ideal</th>
                  <th className="px-4 py-3 text-right">Actual Spent</th>
                  <th className="px-4 py-3 text-right">Category Remaining / Status</th>
                  <th className="px-4 py-3 text-right">Suggested Daily</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {sheetRows.map((row) => {
                  const isEditing = editingId === row.item.id;
                  return (
                    <tr
                      key={row.item.id}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {row.item.category}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="any"
                              min="1"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="w-24 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950"
                            />
                            <select
                              value={editPeriod}
                              onChange={(e) => setEditPeriod(e.target.value as BudgetPeriod)}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                            >
                              <option value="monthly">/ month</option>
                              <option value="weekly">/ week</option>
                              <option value="daily">/ day</option>
                            </select>
                          </div>
                        ) : (
                          <span className="font-mono tabular-nums">
                            {formatCurrency(row.item.amount, settings.currency)} / {row.item.period}
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(row.monthlyIdeal, settings.currency)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(row.actual, settings.currency)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {row.isOverspent ? (
                          <span className="inline-flex items-center justify-end gap-1.5 font-mono text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Overspent by {formatCurrency(row.overspentBy, settings.currency)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-end gap-1.5 font-mono text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            Remaining {formatCurrency(row.underspentBy, settings.currency)}
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {row.isOverspent
                          ? formatCurrency(0, settings.currency)
                          : `${formatCurrency(row.suggestedDaily, settings.currency)}/d`}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleSaveInlineEdit(row.item)}
                              className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                              aria-label="Save changes"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              aria-label="Cancel edit"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(row.item.id);
                                setEditAmount(String(row.item.amount));
                                setEditPeriod(row.item.period);
                              }}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                              aria-label={`Edit ${row.item.category} budget`}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row.item)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              aria-label={`Remove ${row.item.category} budget`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Unplanned Categories Notice */}
        {unplannedCategories.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Unplanned categories with recorded spending in {formatMonthReadable(selectedMonth)}:
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
              {unplannedCategories.map((u) => (
                <div key={u.category} className="inline-flex items-center gap-2">
                  <span>
                    {u.category}:{' '}
                    <strong className="font-mono text-slate-900 dark:text-slate-100">
                      {formatCurrency(u.actual, settings.currency)}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setUseNewCategory(false);
                      setSelectedCat(u.category);
                      setBudgetAmount(String(Math.ceil(u.actual / 500) * 500 || u.actual));
                    }}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    + Set Ideal Budget
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove Category Budget"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.category}" from your Ideal Expense Sheet? Your recorded expenses in this category will remain untouched.`
            : ''
        }
        confirmLabel="Remove Plan"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            void removeIdealItem(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

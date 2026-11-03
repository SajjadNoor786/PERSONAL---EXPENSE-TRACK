import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Info,
  Plus,
  RotateCcw,
  Slash,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/FinanceContext';
import {
  formatCurrency,
  formatDateReadable,
  formatDateTimeReadable,
  formatMonthReadable,
  getCurrencyPrefix,
  getCurrentYearMonth,
  getDaysInMonth,
  getLocalNowTime,
  getRemainingDaysInMonth,
  normalizeIdealToMonthly,
} from '../lib/format';
import type { ActiveSection, PaymentMethod } from '../types/finance';
import { PAYMENT_METHODS } from '../types/finance';
import { ConfirmDialog } from './ConfirmDialog';

interface DashboardViewProps {
  onNavigate: (section: ActiveSection) => void;
  onOpenExpenseModal: (defaultDate?: string) => void;
}

const CHART_PALETTE = [
  '#1E3A8A', // Deep Navy
  '#0284C7', // Ocean Blue
  '#0D9488', // Teal
  '#16A34A', // Green
  '#D97706', // Amber
  '#DC2626', // Crimson
  '#4F46E5', // Indigo
  '#64748B', // Slate
];

export function DashboardView({ onNavigate, onOpenExpenseModal }: DashboardViewProps) {
  const {
    settings,
    expenses,
    idealBudgets,
    dailyStatuses,
    recurringExpenses,
    todayDate,
    todayStatus,
    addExpense,
    updateSettings,
    markNoExpensesToday,
    undoNoExpensesToday,
    recordRecurringNow,
  } = useFinance();

  const currentYearMonth = useMemo(() => todayDate.slice(0, 7) || getCurrentYearMonth(), [todayDate]);
  const [calendarMonth, setCalendarMonth] = useState<string>(currentYearMonth);

  // Quick inline expense entry state
  const [quickTitle, setQuickTitle] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickCategory, setQuickCategory] = useState(settings.categories[0] || 'Food');
  const [quickPayment, setQuickPayment] = useState<PaymentMethod>('Cash');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);

  // Inline budget edit modal state
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  // No Expenses Today confirmation state
  const [confirmNoSpendOpen, setConfirmNoSpendOpen] = useState(false);

  const isDark = settings.theme === 'dark';
  const axisColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#1E293B' : '#E2E8F0';
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderColor: isDark ? '#334155' : '#E2E8F0',
    borderRadius: '8px',
    color: isDark ? '#F8FAFC' : '#0F172A',
    fontSize: '12px',
    fontFamily: 'IBM Plex Mono, monospace',
  };

  // Financial Metrics Calculations
  const metrics = useMemo(() => {
    const todayExpenses = expenses.filter((e) => e.date === todayDate);
    const monthExpenses = expenses.filter((e) => e.date.startsWith(currentYearMonth));

    const totalToday = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalMonth = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const monthlyBudget = settings.monthlyBudget || 0;
    const remainingBudget = monthlyBudget - totalMonth;

    const utilizationPct =
      monthlyBudget > 0 ? Math.round((totalMonth / monthlyBudget) * 1000) / 10 : 0;

    const daysInMonth = getDaysInMonth(currentYearMonth);
    const remainingDays = getRemainingDaysInMonth(currentYearMonth, todayDate);
    const dailyAllowance =
      monthlyBudget > 0 && remainingBudget > 0 ? remainingBudget / remainingDays : 0;

    // Ideal Expense Sheet monthly total for Savings Tracker
    const totalIdealMonthly = idealBudgets.reduce(
      (sum, item) => sum + normalizeIdealToMonthly(item.amount, item.period, daysInMonth),
      0
    );

    const budgetSavings = monthlyBudget > 0 ? monthlyBudget - totalMonth : 0;
    const idealPlanSavings = totalIdealMonthly > 0 ? totalIdealMonthly - totalMonth : null;

    return {
      todayCount: todayExpenses.length,
      monthCount: monthExpenses.length,
      totalToday,
      totalMonth,
      monthlyBudget,
      remainingBudget,
      utilizationPct,
      daysInMonth,
      remainingDays,
      dailyAllowance,
      totalIdealMonthly,
      budgetSavings,
      idealPlanSavings,
    };
  }, [expenses, settings.monthlyBudget, idealBudgets, todayDate, currentYearMonth]);

  // Budget Alert Level (50%, 75%, 90%, 100%)
  const budgetAlert = useMemo(() => {
    if (metrics.monthlyBudget <= 0) return null;
    const pct = metrics.utilizationPct;
    if (pct >= 100) {
      const over = Math.abs(metrics.remainingBudget);
      return {
        level: 'critical' as const,
        threshold: '100%',
        title:
          over > 0
            ? `Monthly Budget Exceeded by ${formatCurrency(over, settings.currency)}`
            : '100% of Monthly Budget Reached',
        detail: `You have spent ${formatCurrency(metrics.totalMonth, settings.currency)} of your ${formatCurrency(metrics.monthlyBudget, settings.currency)} budget (${pct.toFixed(1)}%).`,
      };
    }
    if (pct >= 90) {
      return {
        level: 'high' as const,
        threshold: '90%',
        title: '90% Budget Alert — Approaching Monthly Limit',
        detail: `Only ${formatCurrency(metrics.remainingBudget, settings.currency)} remains for the next ${metrics.remainingDays} day(s) (${formatCurrency(metrics.dailyAllowance, settings.currency)}/day).`,
      };
    }
    if (pct >= 75) {
      return {
        level: 'warning' as const,
        threshold: '75%',
        title: '75% Budget Threshold Reached',
        detail: `${formatCurrency(metrics.remainingBudget, settings.currency)} remaining (${formatCurrency(metrics.dailyAllowance, settings.currency)} available per remaining day).`,
      };
    }
    if (pct >= 50) {
      return {
        level: 'notice' as const,
        threshold: '50%',
        title: '50% Mid-Budget Milestone Reached',
        detail: `You have used ${pct.toFixed(1)}% of your monthly budget with ${metrics.remainingDays} day(s) left in ${formatMonthReadable(currentYearMonth)}.`,
      };
    }
    return null;
  }, [metrics, settings.currency, currentYearMonth]);

  // Due Recurring Expenses
  const dueRecurring = useMemo(
    () => recurringExpenses.filter((r) => r.active && r.nextDueDate <= todayDate),
    [recurringExpenses, todayDate]
  );

  // Chart 1: Daily Expense Trend (Current Month)
  const dailyTrendData = useMemo(() => {
    const days = getDaysInMonth(currentYearMonth);
    const byDay: Record<string, number> = {};
    for (const exp of expenses) {
      if (exp.date.startsWith(currentYearMonth)) {
        byDay[exp.date] = (byDay[exp.date] || 0) + exp.amount;
      }
    }
    const points = [];
    for (let d = 1; d <= days; d++) {
      const dayStr = String(d).padStart(2, '0');
      const fullDate = `${currentYearMonth}-${dayStr}`;
      points.push({
        day: dayStr,
        fullDate,
        amount: Math.round((byDay[fullDate] || 0) * 100) / 100,
      });
    }
    return points;
  }, [expenses, currentYearMonth]);

  // Chart 2: Monthly Expense Trend (Last 6 Months)
  const monthlyTrendData = useMemo(() => {
    const [curY, curM] = currentYearMonth.split('-').map(Number);
    const months: { ym: string; label: string; actual: number; budget: number }[] = [];

    for (let offset = 5; offset >= 0; offset--) {
      const dt = new Date(curY, curM - 1 - offset, 1);
      const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const label = dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const sum = expenses
        .filter((e) => e.date.startsWith(ym))
        .reduce((acc, e) => acc + e.amount, 0);
      months.push({
        ym,
        label,
        actual: Math.round(sum * 100) / 100,
        budget: settings.monthlyBudget || 0,
      });
    }
    return months;
  }, [expenses, currentYearMonth, settings.monthlyBudget]);

  // Chart 3: Expenses by Category (Current Month)
  const categoryChartData = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const exp of expenses) {
      if (exp.date.startsWith(currentYearMonth)) {
        totals[exp.category] = (totals[exp.category] || 0) + exp.amount;
      }
    }
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, currentYearMonth]);

  // Chart 4: Budget vs Actual Expenses (Category Ideal Sheet or Monthly Overall)
  const budgetVsActualData = useMemo(() => {
    const days = getDaysInMonth(currentYearMonth);
    const actualByCat: Record<string, number> = {};
    for (const exp of expenses) {
      if (exp.date.startsWith(currentYearMonth)) {
        actualByCat[exp.category] = (actualByCat[exp.category] || 0) + exp.amount;
      }
    }

    if (idealBudgets.length > 0) {
      const categoriesSet = new Set([
        ...idealBudgets.map((i) => i.category),
        ...Object.keys(actualByCat),
      ]);
      const idealMap = new Map(
        idealBudgets.map((i) => [
          i.category,
          normalizeIdealToMonthly(i.amount, i.period, days),
        ])
      );

      return Array.from(categoriesSet)
        .map((cat) => ({
          name: cat.length > 14 ? `${cat.slice(0, 12)}…` : cat,
          fullCategory: cat,
          Planned: idealMap.get(cat) || 0,
          Actual: Math.round((actualByCat[cat] || 0) * 100) / 100,
        }))
        .filter((row) => row.Planned > 0 || row.Actual > 0)
        .slice(0, 8);
    }

    return [
      {
        name: formatMonthReadable(currentYearMonth),
        fullCategory: 'Monthly Total',
        Planned: settings.monthlyBudget || 0,
        Actual: Math.round(metrics.totalMonth * 100) / 100,
      },
    ];
  }, [idealBudgets, expenses, currentYearMonth, settings.monthlyBudget, metrics.totalMonth]);

  // Chart 5: Weekly Spending Comparison (Weeks 1-5 of Current Month)
  const weeklyComparisonData = useMemo(() => {
    const buckets = [
      { week: 'Week 1 (1–7)', amount: 0 },
      { week: 'Week 2 (8–14)', amount: 0 },
      { week: 'Week 3 (15–21)', amount: 0 },
      { week: 'Week 4 (22–28)', amount: 0 },
      { week: 'Week 5 (29+)', amount: 0 },
    ];
    for (const exp of expenses) {
      if (!exp.date.startsWith(currentYearMonth)) continue;
      const dayNum = Number(exp.date.slice(8, 10)) || 1;
      const idx = Math.min(4, Math.floor((dayNum - 1) / 7));
      buckets[idx].amount = Math.round((buckets[idx].amount + exp.amount) * 100) / 100;
    }
    return buckets.filter((b, idx) => idx < 4 || getDaysInMonth(currentYearMonth) > 28 || b.amount > 0);
  }, [expenses, currentYearMonth]);

  // Expense Calendar Grid Calculation
  const calendarCells = useMemo(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0 = Sun
    const totalDays = getDaysInMonth(calendarMonth);

    const spendByDate: Record<string, { total: number; count: number }> = {};
    for (const exp of expenses) {
      if (exp.date.startsWith(calendarMonth)) {
        if (!spendByDate[exp.date]) spendByDate[exp.date] = { total: 0, count: 0 };
        spendByDate[exp.date].total += exp.amount;
        spendByDate[exp.date].count += 1;
      }
    }

    const cells: Array<{
      date: string | null;
      dayNumber: number | null;
      total: number;
      count: number;
      isNoSpend: boolean;
      isToday: boolean;
      isPast: boolean;
    }> = [];

    for (let i = 0; i < firstWeekday; i++) {
      cells.push({
        date: null,
        dayNumber: null,
        total: 0,
        count: 0,
        isNoSpend: false,
        isToday: false,
        isPast: false,
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calendarMonth}-${String(d).padStart(2, '0')}`;
      const info = spendByDate[dateStr] || { total: 0, count: 0 };
      const statusRec = dailyStatuses[dateStr];
      cells.push({
        date: dateStr,
        dayNumber: d,
        total: info.total,
        count: info.count,
        isNoSpend: info.count === 0 && statusRec?.status === 'no_expenses_today',
        isToday: dateStr === todayDate,
        isPast: dateStr < todayDate,
      });
    }

    return cells;
  }, [calendarMonth, expenses, dailyStatuses, todayDate]);

  const handleShiftCalendarMonth = (delta: number) => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const dt = new Date(y, m - 1 + delta, 1);
    setCalendarMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleQuickExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError(null);
    const cleanTitle = quickTitle.trim();
    const numAmount = Number(quickAmount);

    if (!cleanTitle) {
      setQuickError('Enter an expense title.');
      return;
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setQuickError('Enter an amount greater than 0.');
      return;
    }

    setQuickSaving(true);
    try {
      await addExpense({
        date: todayDate,
        time: getLocalNowTime(),
        title: cleanTitle,
        category: quickCategory || settings.categories[0] || 'Food',
        amount: numAmount,
        paymentMethod: quickPayment,
        notes: '',
      });
      setQuickTitle('');
      setQuickAmount('');
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : 'Could not save expense.');
    } finally {
      setQuickSaving(false);
    }
  };

  const handleSaveMonthlyBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(budgetInput);
    if (!Number.isFinite(val) || val < 0) return;
    await updateSettings({ monthlyBudget: Math.round(val * 100) / 100 });
    setBudgetModalOpen(false);
  };

  return (
    <div className="space-y-8">
      {/* Budget Threshold Alert Banner (50% / 75% / 90% / 100%) */}
      {budgetAlert && (
        <div
          className={`flex flex-col justify-between gap-3 rounded-xl border px-5 py-4 sm:flex-row sm:items-center ${
            budgetAlert.level === 'critical'
              ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
              : budgetAlert.level === 'high' || budgetAlert.level === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
              : 'border-blue-200 bg-blue-50/70 text-slate-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-slate-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {budgetAlert.level === 'critical' ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            ) : budgetAlert.level === 'high' || budgetAlert.level === 'warning' ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-400" />
            )}
            <div>
              <p className="text-sm font-semibold">{budgetAlert.title}</p>
              <p className="mt-0.5 text-xs opacity-90">{budgetAlert.detail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setBudgetInput(String(settings.monthlyBudget || ''));
              setBudgetModalOpen(true);
            }}
            className="whitespace-nowrap shrink-0 self-start rounded-lg border border-current/20 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 sm:self-center dark:hover:bg-white/10"
          >
            Adjust Budget
          </button>
        </div>
      )}

      {/* Due Recurring Expenses Strip */}
      {dueRecurring.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5 text-sm font-medium text-amber-900 dark:text-amber-200">
              <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {dueRecurring.length} recurring {dueRecurring.length === 1 ? 'expense is' : 'expenses are'} due for recording
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {dueRecurring.slice(0, 3).map((rec) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => void recordRecurringNow(rec)}
                  className="whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                  Log {rec.title} ({formatCurrency(rec.amount, settings.currency)})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Expense Entry + Today's Status Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Quick Daily Expense Entry
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Record an expense for {formatDateReadable(todayDate)} in seconds, or mark today as zero-spend.
            </p>
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
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="font-medium">Marked: No Expenses Today</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => void undoNoExpensesToday()}
                  className="inline-flex items-center gap-1 font-medium text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                  Undo
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => onOpenExpenseModal(todayDate)}
              className="whitespace-nowrap shrink-0 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Full Form with Notes →
            </button>
          </div>
        </div>

        <form onSubmit={handleQuickExpenseSubmit} className="mt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <label className="sr-only" htmlFor="quick-title">Expense Title</label>
              <input
                id="quick-title"
                type="text"
                placeholder="What did you spend on?"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="sr-only" htmlFor="quick-amount">Amount</label>
              <input
                id="quick-amount"
                type="number"
                step="any"
                min="0.01"
                placeholder={`Amount (${getCurrencyPrefix(settings.currency).trim()})`}
                value={quickAmount}
                onChange={(e) => setQuickAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="sr-only" htmlFor="quick-category">Category</label>
              <select
                id="quick-category"
                value={quickCategory}
                onChange={(e) => setQuickCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {settings.categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="sr-only" htmlFor="quick-payment">Payment Method</label>
              <select
                id="quick-payment"
                value={quickPayment}
                onChange={(e) => setQuickPayment(e.target.value as PaymentMethod)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={quickSaving}
                className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                {quickSaving ? 'Saving...' : 'Add Expense'}
              </button>
            </div>
          </div>
          {quickError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{quickError}</p>
          )}
        </form>
      </section>

      {/* 8 Financial KPI Cards in Clean Single-Elevation Hairline Grid */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 dark:divide-slate-800">
          {/* 1. Total Monthly Budget */}
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Monthly Budget
              </span>
              <button
                type="button"
                onClick={() => {
                  setBudgetInput(String(settings.monthlyBudget || ''));
                  setBudgetModalOpen(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                <Edit3 className="h-3 w-3" />
                {metrics.monthlyBudget > 0 ? 'Edit' : 'Set Budget'}
              </button>
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(metrics.monthlyBudget, settings.currency)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {metrics.monthlyBudget > 0
                ? `${formatMonthReadable(currentYearMonth)} allocation`
                : 'Click Set Budget to track monthly limits'}
            </p>
          </div>

          {/* 2. Total Expenses Today */}
          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Expenses Today
            </span>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(metrics.totalToday, settings.currency)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {metrics.todayCount} {metrics.todayCount === 1 ? 'transaction' : 'transactions'} · {formatDateReadable(todayDate)}
            </p>
          </div>

          {/* 3. Total Expenses This Month */}
          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Expenses This Month
            </span>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(metrics.totalMonth, settings.currency)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {metrics.monthCount} {metrics.monthCount === 1 ? 'record' : 'records'} in {formatMonthReadable(currentYearMonth)}
            </p>
          </div>

          {/* 4. Remaining Budget */}
          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Remaining Budget
            </span>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                metrics.monthlyBudget === 0
                  ? 'text-slate-900 dark:text-slate-100'
                  : metrics.remainingBudget < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {metrics.monthlyBudget === 0
                ? '—'
                : formatCurrency(metrics.remainingBudget, settings.currency)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {metrics.monthlyBudget === 0
                ? 'Set a monthly budget to calculate'
                : metrics.remainingBudget >= 0
                ? `${formatCurrency(Math.round(metrics.dailyAllowance), settings.currency)} / day (${metrics.remainingDays}d left)`
                : `Overspent by ${formatCurrency(Math.abs(metrics.remainingBudget), settings.currency)}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-slate-200 border-t border-slate-200 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 dark:divide-slate-800 dark:border-slate-800">
          {/* 5. Remaining Cash */}
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Remaining Cash
              </span>
              <button
                type="button"
                onClick={() => onNavigate('remaining_cash' as ActiveSection)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                <Wallet className="h-3 w-3" />
                Edit Balance
              </button>
            </div>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                settings.cashBalance < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {formatCurrency(settings.cashBalance, settings.currency)}
            </p>
            <p className="mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
              Updated: {formatDateTimeReadable(settings.cashLastUpdated)}
            </p>
          </div>

          {/* 6. Today's Expense Status */}
          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Today&apos;s Expense Status
            </span>
            <div className="mt-2.5 flex items-center gap-2">
              {todayStatus === 'expenses_recorded' && (
                <>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-display text-base font-semibold text-emerald-700 dark:text-emerald-400">
                    Expenses Recorded
                  </span>
                </>
              )}
              {todayStatus === 'no_expenses_today' && (
                <>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-400" />
                  <span className="font-display text-base font-semibold text-blue-800 dark:text-blue-300">
                    No Expenses Today
                  </span>
                </>
              )}
              {todayStatus === 'not_updated' && (
                <>
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="font-display text-base font-semibold text-amber-700 dark:text-amber-400">
                    Not Updated
                  </span>
                </>
              )}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {todayStatus === 'not_updated' ? (
                <button
                  type="button"
                  onClick={() => setConfirmNoSpendOpen(true)}
                  className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  Mark &ldquo;No Expenses Today&rdquo; →
                </button>
              ) : todayStatus === 'no_expenses_today' ? (
                <button
                  type="button"
                  onClick={() => void undoNoExpensesToday()}
                  className="font-medium text-slate-600 hover:underline dark:text-slate-300"
                >
                  Undo zero-spend status
                </button>
              ) : (
                <span>Reminder suppressed for today</span>
              )}
            </div>
          </div>

          {/* 7. Monthly Savings */}
          <div className="p-5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Monthly Savings
            </span>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                metrics.monthlyBudget === 0 && metrics.idealPlanSavings === null
                  ? 'text-slate-900 dark:text-slate-100'
                  : (metrics.monthlyBudget > 0 ? metrics.budgetSavings : metrics.idealPlanSavings ?? 0) >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {metrics.monthlyBudget > 0
                ? formatCurrency(metrics.budgetSavings, settings.currency)
                : metrics.idealPlanSavings !== null
                ? formatCurrency(metrics.idealPlanSavings, settings.currency)
                : '—'}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {metrics.idealPlanSavings !== null
                ? `Vs. Ideal Sheet: ${formatCurrency(metrics.idealPlanSavings, settings.currency)}`
                : metrics.monthlyBudget > 0
                ? 'Unspent monthly budget balance'
                : 'Set budget or Ideal Sheet to track'}
            </p>
          </div>

          {/* 8. Budget Utilization Percentage */}
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Budget Utilization
              </span>
              <span className="font-mono text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                {metrics.monthlyBudget > 0 ? `${metrics.utilizationPct.toFixed(1)}%` : '0.0%'}
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {metrics.monthlyBudget > 0 ? `${metrics.utilizationPct.toFixed(1)}%` : '—'}
            </p>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  metrics.utilizationPct >= 100
                    ? 'bg-red-600'
                    : metrics.utilizationPct >= 75
                    ? 'bg-amber-500'
                    : 'bg-blue-800 dark:bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, metrics.utilizationPct))}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Dedicated Remaining Amount & Daily Spending Limit Summary Strip */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Remaining Spending Allowance &amp; Daily Pacing
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Automatically calculated from your {formatMonthReadable(currentYearMonth)} budget minus recorded expenses across {metrics.remainingDays} remaining day(s).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Monthly Budget</span>
              <span className="mt-0.5 block font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(metrics.monthlyBudget, settings.currency)}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Total Spent</span>
              <span className="mt-0.5 block font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(metrics.totalMonth, settings.currency)}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Remaining Amount</span>
              <span
                className={`mt-0.5 block font-mono text-sm font-semibold tabular-nums ${
                  metrics.remainingBudget < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {metrics.monthlyBudget > 0
                  ? formatCurrency(metrics.remainingBudget, settings.currency)
                  : 'Set Budget'}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Safe Daily Limit</span>
              <span className="mt-0.5 block font-mono text-sm font-semibold tabular-nums text-blue-800 dark:text-blue-400">
                {metrics.monthlyBudget > 0
                  ? formatCurrency(Math.round(metrics.dailyAllowance), settings.currency)
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Row 1 Charts: Daily Expense Trend + Expenses by Category */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Daily Expense Trend
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Day-by-day spending across {formatMonthReadable(currentYearMonth)}
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {formatCurrency(metrics.totalMonth, settings.currency)} total
            </span>
          </div>

          <div className="mt-5 h-64 w-full">
            {metrics.monthCount === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-lg bg-slate-50 px-4 text-center dark:bg-slate-950">
                <TrendingDown className="h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  No expenses recorded in {formatMonthReadable(currentYearMonth)} yet
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Add your first expense above to visualize your daily spending curve.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailySpendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1E3A8A" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#1E3A8A" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="day" stroke={axisColor} fontSize={11} tickLine={false} />
                  <YAxis
                    stroke={axisColor}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [
                      formatCurrency(Number(value ?? 0), settings.currency),
                      'Spent',
                    ]}
                    labelFormatter={(label) => `Day ${label} (${currentYearMonth}-${label})`}
                  />
                  {metrics.dailyAllowance > 0 && (
                    <ReferenceLine
                      y={Math.round(metrics.dailyAllowance)}
                      stroke="#D97706"
                      strokeDasharray="4 4"
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke={isDark ? '#60A5FA' : '#1E3A8A'}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#dailySpendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Expenses by Category
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Category share for {formatMonthReadable(currentYearMonth)}
              </p>
            </div>
          </div>

          {categoryChartData.length === 0 ? (
            <div className="mt-5 flex h-64 flex-col items-center justify-center rounded-lg bg-slate-50 px-4 text-center dark:bg-slate-950">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No category breakdown yet
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Recorded expenses will automatically group by Food, Transport, Bills, and more.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                    >
                      {categoryChartData.map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => formatCurrency(Number(value ?? 0), settings.currency)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {categoryChartData.map((cat, idx) => {
                  const pct =
                    metrics.totalMonth > 0
                      ? ((cat.value / metrics.totalMonth) * 100).toFixed(1)
                      : '0.0';
                  return (
                    <div
                      key={cat.name}
                      className="flex items-center justify-between border-b border-slate-100 pb-1.5 text-xs last:border-b-0 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-xs"
                          style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                        />
                        <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                          {cat.name}
                        </span>
                      </div>
                      <span className="ml-2 shrink-0 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(cat.value, settings.currency)} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Row 2 Charts: Budget vs Actual + Monthly Trend + Weekly Comparison */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Budget vs Actual */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Budget vs. Actual
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {idealBudgets.length > 0 ? 'Ideal category sheet vs. spent' : 'Monthly budget vs. spent'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ideal_sheet' as ActiveSection)}
              className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Ideal Sheet →
            </button>
          </div>
          <div className="mt-4 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetVsActualData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" stroke={axisColor} fontSize={11} tickLine={false} />
                <YAxis
                  stroke={axisColor}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => formatCurrency(Number(value ?? 0), settings.currency)}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Planned" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="Actual"
                  fill={isDark ? '#3B82F6' : '#1E3A8A'}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Monthly Expense Trend */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Monthly Expense Trend
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              6-month historical comparison
            </p>
          </div>
          <div className="mt-4 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" stroke={axisColor} fontSize={11} tickLine={false} />
                <YAxis
                  stroke={axisColor}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    formatCurrency(Number(value ?? 0), settings.currency),
                    'Monthly Total',
                  ]}
                />
                <Bar
                  dataKey="actual"
                  name="Expenses"
                  fill={isDark ? '#38BDF8' : '#0F172A'}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Weekly Spending Comparison */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Weekly Spending Comparison
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Week-over-week breakdown in {formatMonthReadable(currentYearMonth)}
            </p>
          </div>
          <div className="mt-4 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyComparisonData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="week"
                  stroke={axisColor}
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(w: string) => w.split(' ')[0] + ' ' + w.split(' ')[1]}
                />
                <YAxis
                  stroke={axisColor}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    formatCurrency(Number(value ?? 0), settings.currency),
                    'Weekly Spend',
                  ]}
                />
                <Bar
                  dataKey="amount"
                  name="Weekly Spend"
                  fill="#0D9488"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Expense Activity Calendar */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Daily Expense Calendar
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click any date to record an expense for that day. Shows daily totals and zero-spend days.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleShiftCalendarMonth(-1)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatMonthReadable(calendarMonth)}
            </span>
            <button
              type="button"
              onClick={() => handleShiftCalendarMonth(1)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1.5">
          {calendarCells.map((cell, idx) => {
            if (!cell.date) {
              return <div key={`empty_${idx}`} className="h-20 rounded-lg bg-slate-50/50 dark:bg-slate-950/30" />;
            }

            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => onOpenExpenseModal(cell.date!)}
                className={`flex h-20 flex-col justify-between rounded-lg border p-2 text-left transition-colors hover:border-blue-600 dark:hover:border-blue-400 ${
                  cell.isToday
                    ? 'border-blue-700 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      cell.isToday
                        ? 'text-blue-800 dark:text-blue-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {cell.count > 0 && (
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      {cell.count}x
                    </span>
                  )}
                </div>

                <div className="w-full truncate">
                  {cell.count > 0 ? (
                    <span className="block truncate font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(cell.total, settings.currency)}
                    </span>
                  ) : cell.isNoSpend ? (
                    <span className="block truncate text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      No Expenses
                    </span>
                  ) : cell.isPast || cell.isToday ? (
                    <span className="block truncate text-[11px] text-slate-400 dark:text-slate-600">
                      Not updated
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* No Expenses Today Confirmation Dialog */}
      <ConfirmDialog
        open={confirmNoSpendOpen}
        title="No Expenses Today"
        description="Are you sure you did not spend any money today?"
        confirmLabel="Yes, Mark No Expenses"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirmNoSpendOpen(false);
          void markNoExpensesToday();
        }}
        onCancel={() => setConfirmNoSpendOpen(false)}
      />

      {/* Monthly Budget Modal */}
      {budgetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Set Monthly Budget
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Enter your total monthly spending budget in {settings.currency}.
            </p>
            <form onSubmit={handleSaveMonthlyBudget} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Monthly Budget ({getCurrencyPrefix(settings.currency).trim()})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  placeholder="e.g. 50000"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  Save Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

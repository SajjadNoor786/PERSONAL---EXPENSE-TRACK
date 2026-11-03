import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/FinanceContext';
import {
  downloadTextFile,
  formatCurrency,
  formatDateReadable,
  formatDateTimeReadable,
  formatMonthReadable,
  generateExpensesCSV,
  getCurrentYearMonth,
  getDaysInMonth,
  normalizeIdealToMonthly,
  shiftDateByDays,
} from '../lib/format';

type ReportTab = 'periods' | 'categories' | 'payments' | 'budget_actual' | 'cash_history';
type RangePreset = 'today' | 'week' | 'month' | 'last_month' | '90d' | 'custom';

export function ReportsView() {
  const { settings, expenses, idealBudgets, cashLedger, todayDate, notify } = useFinance();

  const currentYM = todayDate.slice(0, 7) || getCurrentYearMonth();
  const [activeTab, setActiveTab] = useState<ReportTab>('periods');
  const [preset, setPreset] = useState<RangePreset>('month');
  const [fromDate, setFromDate] = useState<string>(`${currentYM}-01`);
  const [toDate, setToDate] = useState<string>(todayDate);
  const [summaryMonth, setSummaryMonth] = useState<string>(currentYM);

  const isDark = settings.theme === 'dark';

  const applyPreset = (nextPreset: RangePreset) => {
    setPreset(nextPreset);
    if (nextPreset === 'today') {
      setFromDate(todayDate);
      setToDate(todayDate);
    } else if (nextPreset === 'week') {
      setFromDate(shiftDateByDays(todayDate, -6));
      setToDate(todayDate);
    } else if (nextPreset === 'month') {
      setFromDate(`${currentYM}-01`);
      setToDate(todayDate);
    } else if (nextPreset === 'last_month') {
      const [y, m] = currentYM.split('-').map(Number);
      const prevDt = new Date(y, m - 2, 1);
      const prevYM = `${prevDt.getFullYear()}-${String(prevDt.getMonth() + 1).padStart(2, '0')}`;
      const lastDay = getDaysInMonth(prevYM);
      setFromDate(`${prevYM}-01`);
      setToDate(`${prevYM}-${String(lastDay).padStart(2, '0')}`);
    } else if (nextPreset === '90d') {
      setFromDate(shiftDateByDays(todayDate, -89));
      setToDate(todayDate);
    }
  };

  // Filtered expenses in [fromDate, toDate]
  const rangeExpenses = useMemo(() => {
    return expenses.filter((e) => e.date >= fromDate && e.date <= toDate);
  }, [expenses, fromDate, toDate]);

  // Filtered cash ledger in [fromDate, toDate]
  const rangeCashLedger = useMemo(() => {
    return cashLedger.filter((entry) => {
      const localDay = entry.timestamp.slice(0, 10);
      return localDay >= fromDate && localDay <= toDate;
    });
  }, [cashLedger, fromDate, toDate]);

  // Aggregate KPIs for range
  const rangeTotals = useMemo(() => {
    const totalSpent = rangeExpenses.reduce((s, e) => s + e.amount, 0);
    const uniqueDays = new Set(rangeExpenses.map((e) => e.date)).size;
    const avgPerActiveDay = uniqueDays > 0 ? totalSpent / uniqueDays : 0;
    const cashSpent = rangeExpenses
      .filter((e) => e.paymentMethod === 'Cash')
      .reduce((s, e) => s + e.amount, 0);
    return {
      totalSpent,
      count: rangeExpenses.length,
      uniqueDays,
      avgPerActiveDay,
      cashSpent,
      nonCashSpent: totalSpent - cashSpent,
    };
  }, [rangeExpenses]);

  // Daily, Weekly, and Monthly grouped summaries
  const periodSummaries = useMemo(() => {
    const byDate: Record<string, { date: string; count: number; total: number }> = {};
    const byWeek: Record<string, { weekStart: string; count: number; total: number }> = {};
    const byMonth: Record<string, { month: string; count: number; total: number }> = {};

    for (const exp of rangeExpenses) {
      if (!byDate[exp.date]) byDate[exp.date] = { date: exp.date, count: 0, total: 0 };
      byDate[exp.date].count += 1;
      byDate[exp.date].total += exp.amount;

      // ISO week start (Monday)
      const [y, m, d] = exp.date.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const dayOfWeek = dt.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      dt.setDate(dt.getDate() + diffToMonday);
      const weekKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (!byWeek[weekKey]) byWeek[weekKey] = { weekStart: weekKey, count: 0, total: 0 };
      byWeek[weekKey].count += 1;
      byWeek[weekKey].total += exp.amount;

      const monthKey = exp.date.slice(0, 7);
      if (!byMonth[monthKey]) byMonth[monthKey] = { month: monthKey, count: 0, total: 0 };
      byMonth[monthKey].count += 1;
      byMonth[monthKey].total += exp.amount;
    }

    return {
      daily: Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)),
      weekly: Object.values(byWeek).sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
      monthly: Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month)),
    };
  }, [rangeExpenses]);

  // Category-Wise Breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { category: string; count: number; total: number }> = {};
    for (const exp of rangeExpenses) {
      if (!map[exp.category]) map[exp.category] = { category: exp.category, count: 0, total: 0 };
      map[exp.category].count += 1;
      map[exp.category].total += exp.amount;
    }
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map((row) => ({
        ...row,
        avg: row.count > 0 ? row.total / row.count : 0,
        sharePct: rangeTotals.totalSpent > 0 ? (row.total / rangeTotals.totalSpent) * 100 : 0,
      }));
  }, [rangeExpenses, rangeTotals.totalSpent]);

  // Payment Method Breakdown
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, { method: string; count: number; total: number }> = {};
    for (const exp of rangeExpenses) {
      if (!map[exp.paymentMethod]) {
        map[exp.paymentMethod] = { method: exp.paymentMethod, count: 0, total: 0 };
      }
      map[exp.paymentMethod].count += 1;
      map[exp.paymentMethod].total += exp.amount;
    }
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map((row) => ({
        ...row,
        sharePct: rangeTotals.totalSpent > 0 ? (row.total / rangeTotals.totalSpent) * 100 : 0,
      }));
  }, [rangeExpenses, rangeTotals.totalSpent]);

  // Budget vs Actual for summaryMonth
  const monthlyBudgetComparison = useMemo(() => {
    const days = getDaysInMonth(summaryMonth);
    const monthExps = expenses.filter((e) => e.date.startsWith(summaryMonth));
    const actualByCat: Record<string, number> = {};
    let totalActual = 0;

    for (const exp of monthExps) {
      actualByCat[exp.category] = (actualByCat[exp.category] || 0) + exp.amount;
      totalActual += exp.amount;
    }

    const allCats = Array.from(
      new Set([...idealBudgets.map((i) => i.category), ...Object.keys(actualByCat)])
    );

    const rows = allCats.map((cat) => {
      const idealObj = idealBudgets.find((i) => i.category === cat);
      const idealMonthly = idealObj
        ? normalizeIdealToMonthly(idealObj.amount, idealObj.period, days)
        : 0;
      const actual = actualByCat[cat] || 0;
      const variance = idealMonthly - actual;
      return {
        category: cat,
        idealMonthly,
        actual,
        variance,
      };
    });

    return {
      rows: rows.sort((a, b) => b.actual - a.actual),
      totalActual,
      monthlyBudget: settings.monthlyBudget || 0,
      remainingMonthlyBudget: (settings.monthlyBudget || 0) - totalActual,
    };
  }, [summaryMonth, expenses, idealBudgets, settings.monthlyBudget]);

  const handleExportRangeCSV = () => {
    const csv = generateExpensesCSV(rangeExpenses);
    downloadTextFile(
      `ledgerflow-report-${fromDate}-to-${toDate}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
    notify('success', 'Exported filtered report to CSV');
  };

  const handleDownloadMonthlySummary = () => {
    const monthExps = expenses.filter((e) => e.date.startsWith(summaryMonth));
    const lines: string[] = [
      `LedgerFlow Monthly Financial Summary — ${formatMonthReadable(summaryMonth)}`,
      `Generated At,${new Date().toISOString()}`,
      `Currency,${settings.currency}`,
      `Monthly Budget,${settings.monthlyBudget}`,
      `Total Monthly Expenses,${monthlyBudgetComparison.totalActual}`,
      `Remaining Monthly Budget,${monthlyBudgetComparison.remainingMonthlyBudget}`,
      `Current Remaining Cash,${settings.cashBalance}`,
      '',
      'Category,Ideal Monthly Budget,Actual Spent,Variance (Ideal - Actual)',
      ...monthlyBudgetComparison.rows.map(
        (r) => `"${r.category.replace(/"/g, '""')}",${r.idealMonthly},${r.actual},${r.variance}`
      ),
      '',
      'Transactions in Month',
      generateExpensesCSV(monthExps),
    ];

    downloadTextFile(
      `ledgerflow-monthly-summary-${summaryMonth}.csv`,
      lines.join('\n'),
      'text/csv;charset=utf-8'
    );
    notify('success', `Downloaded ${formatMonthReadable(summaryMonth)} summary statement`);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Print-Only Header */}
      <div className="print-only hidden border-b border-slate-300 pb-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          LedgerFlow — Personal Financial Statement
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          Period: {formatDateReadable(fromDate)} to {formatDateReadable(toDate)} · Printed{' '}
          {formatDateTimeReadable(new Date().toISOString())}
        </p>
      </div>

      {/* Date Range & Export Toolbar */}
      <section className="no-print rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              {(
                [
                  ['today', 'Today'],
                  ['week', 'Last 7 Days'],
                  ['month', 'This Month'],
                  ['last_month', 'Last Month'],
                  ['90d', '90 Days'],
                  ['custom', 'Custom'],
                ] as Array<[RangePreset, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    preset === key
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setPreset('custom');
                  setFromDate(e.target.value);
                }}
                aria-label="Start date"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setPreset('custom');
                  setToDate(e.target.value);
                }}
                aria-label="End date"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportRangeCSV}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleDownloadMonthlySummary}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              Monthly Summary ({summaryMonth})
            </button>
            <button
              type="button"
              onClick={handlePrintReport}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Report
            </button>
          </div>
        </div>

        {/* Report Section Tabs */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          {(
            [
              ['periods', 'Daily, Weekly & Monthly'],
              ['categories', 'Category Analysis'],
              ['payments', 'Payment Methods'],
              ['budget_actual', 'Budget vs. Actual'],
              ['cash_history', 'Cash Balance History'],
            ] as Array<[ReportTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === id
                  ? 'bg-slate-900 text-white dark:bg-blue-600'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Range Summary Strip */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-2 divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0 sm:divide-x dark:divide-slate-800">
          <div className="p-4">
            <span className="text-xs text-slate-500 dark:text-slate-400">Range Total Spent</span>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(rangeTotals.totalSpent, settings.currency)}
            </p>
          </div>
          <div className="p-4">
            <span className="text-xs text-slate-500 dark:text-slate-400">Transactions</span>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {rangeTotals.count}
            </p>
          </div>
          <div className="p-4">
            <span className="text-xs text-slate-500 dark:text-slate-400">Cash vs. Digital</span>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(rangeTotals.cashSpent, settings.currency)} /{' '}
              {formatCurrency(rangeTotals.nonCashSpent, settings.currency)}
            </p>
          </div>
          <div className="p-4">
            <span className="text-xs text-slate-500 dark:text-slate-400">Avg. Per Active Day</span>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(Math.round(rangeTotals.avgPerActiveDay), settings.currency)}
            </p>
          </div>
        </div>
      </section>

      {/* Report Tab 1: Daily, Weekly & Monthly */}
      {activeTab === 'periods' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Daily Summary */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Daily Expenses Summary
              </h3>
            </div>
            {periodSummaries.daily.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">No daily records in selected range.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {periodSummaries.daily.map((d) => (
                  <div key={d.date} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {formatDateReadable(d.date)}
                      </span>
                      <span className="ml-2 text-slate-500">({d.count}x)</span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(d.total, settings.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Weekly Summary */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Weekly Expenses Summary
              </h3>
            </div>
            {periodSummaries.weekly.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">No weekly records in selected range.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {periodSummaries.weekly.map((w) => (
                  <div key={w.weekStart} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        Week of {formatDateReadable(w.weekStart)}
                      </span>
                      <span className="ml-2 text-slate-500">({w.count}x)</span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(w.total, settings.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Monthly Summary */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Monthly Expenses Summary
              </h3>
            </div>
            {periodSummaries.monthly.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">No monthly records in selected range.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {periodSummaries.monthly.map((m) => (
                  <div key={m.month} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {formatMonthReadable(m.month)}
                      </span>
                      <span className="ml-2 text-slate-500">({m.count}x)</span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(m.total, settings.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Report Tab 2: Category-Wise Expenses */}
      {activeTab === 'categories' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Category-Wise Expense Analysis
            </h3>
          </div>
          {categoryBreakdown.length === 0 ? (
            <p className="p-10 text-center text-xs text-slate-500">
              No category transactions recorded in this date range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Records</th>
                    <th className="px-4 py-3 text-right">Average Entry</th>
                    <th className="px-4 py-3 text-right">Share</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {categoryBreakdown.map((row) => (
                    <tr key={row.category}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {row.category}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {row.count}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(Math.round(row.avg), settings.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {row.sharePct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(row.total, settings.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Report Tab 3: Payment Method Analysis */}
      {activeTab === 'payments' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Payment Method Analysis
          </h3>
          {paymentBreakdown.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">
              No transactions recorded in this date range.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="h-64 lg:col-span-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentBreakdown}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={isDark ? '#1E293B' : '#E2E8F0'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="method"
                      stroke={isDark ? '#94A3B8' : '#64748B'}
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke={isDark ? '#94A3B8' : '#64748B'}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(val) => formatCurrency(Number(val ?? 0), settings.currency)}
                    />
                    <Bar
                      dataKey="total"
                      fill={isDark ? '#3B82F6' : '#1E3A8A'}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto lg:col-span-6">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2.5">Payment Method</th>
                      <th className="py-2.5 text-right">Count</th>
                      <th className="py-2.5 text-right">Share</th>
                      <th className="py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paymentBreakdown.map((pm) => (
                      <tr key={pm.method}>
                        <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">
                          {pm.method}
                        </td>
                        <td className="py-2.5 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                          {pm.count}
                        </td>
                        <td className="py-2.5 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                          {pm.sharePct.toFixed(1)}%
                        </td>
                        <td className="py-2.5 text-right font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCurrency(pm.total, settings.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Report Tab 4: Budget vs Actual */}
      {activeTab === 'budget_actual' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center dark:border-slate-800">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Budget vs. Actual Statement ({formatMonthReadable(summaryMonth)})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monthly Budget: {formatCurrency(monthlyBudgetComparison.monthlyBudget, settings.currency)} · Actual:{' '}
                {formatCurrency(monthlyBudgetComparison.totalActual, settings.currency)} · Remaining:{' '}
                {formatCurrency(monthlyBudgetComparison.remainingMonthlyBudget, settings.currency)}
              </p>
            </div>
            <input
              type="month"
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value)}
              className="no-print rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {monthlyBudgetComparison.rows.length === 0 ? (
            <p className="p-10 text-center text-xs text-slate-500">
              No Ideal Sheet budgets or monthly expenses recorded for {formatMonthReadable(summaryMonth)}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Ideal Monthly Plan</th>
                    <th className="px-4 py-3 text-right">Actual Spent</th>
                    <th className="px-4 py-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {monthlyBudgetComparison.rows.map((r) => (
                    <tr key={r.category}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {r.category}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-600 dark:text-slate-400">
                        {r.idealMonthly > 0
                          ? formatCurrency(r.idealMonthly, settings.currency)
                          : 'Unplanned'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(r.actual, settings.currency)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums ${
                          r.idealMonthly === 0
                            ? 'text-slate-500'
                            : r.variance < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {r.idealMonthly === 0
                          ? '—'
                          : r.variance < 0
                          ? `Overspent by ${formatCurrency(Math.abs(r.variance), settings.currency)}`
                          : `Remaining ${formatCurrency(r.variance, settings.currency)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Report Tab 5: Cash Balance History */}
      {activeTab === 'cash_history' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Cash Balance History ({formatDateReadable(fromDate)} – {formatDateReadable(toDate)})
            </h3>
          </div>
          {rangeCashLedger.length === 0 ? (
            <p className="p-10 text-center text-xs text-slate-500">
              No physical cash adjustments or cash expenses occurred in this date range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Previous</th>
                    <th className="px-4 py-3 text-right">Delta</th>
                    <th className="px-4 py-3 text-right">Ending Cash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {rangeCashLedger.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {formatDateTimeReadable(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-800 dark:text-slate-200">
                        {entry.note}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(entry.previousBalance, settings.currency)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums ${
                          entry.delta >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {entry.delta >= 0 ? '+' : ''}
                        {formatCurrency(entry.delta, settings.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(entry.newBalance, settings.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

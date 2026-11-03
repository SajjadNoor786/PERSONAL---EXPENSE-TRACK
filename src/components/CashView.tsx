import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Edit3,
  Scale,
  Wallet,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  formatCurrency,
  formatDateTimeReadable,
  getCurrencyPrefix,
} from '../lib/format';
import type { CashEventType } from '../types/finance';

export function CashView() {
  const { settings, expenses, cashLedger, updateCashManual } = useFinance();

  // Manual Edit Balance form
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualNote, setManualNote] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [savingManual, setSavingManual] = useState(false);

  // Physical Cash Reconciliation form
  const [countedCash, setCountedCash] = useState<string>('');
  const [reconNote, setReconNote] = useState<string>('');
  const [reconError, setReconError] = useState<string | null>(null);
  const [savingRecon, setSavingRecon] = useState(false);

  // History filter
  const [historyFilter, setHistoryFilter] = useState<'ALL' | CashEventType>('ALL');

  const cashStats = useMemo(() => {
    let totalCashExpenses = 0;
    let totalNonCashExpenses = 0;
    for (const exp of expenses) {
      if (exp.paymentMethod === 'Cash') {
        totalCashExpenses += exp.amount;
      } else {
        totalNonCashExpenses += exp.amount;
      }
    }
    return {
      totalCashExpenses,
      totalNonCashExpenses,
      reconciliationCount: cashLedger.filter((c) => c.type === 'reconciliation').length,
    };
  }, [expenses, cashLedger]);

  const parsedCounted = Number(countedCash);
  const hasCountedInput = countedCash.trim() !== '' && Number.isFinite(parsedCounted);
  const discrepancy = hasCountedInput
    ? Math.round((parsedCounted - settings.cashBalance) * 100) / 100
    : 0;

  const filteredLedger = useMemo(() => {
    if (historyFilter === 'ALL') return cashLedger;
    return cashLedger.filter((entry) => entry.type === historyFilter);
  }, [cashLedger, historyFilter]);

  const handleManualBalanceSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    const val = Number(manualAmount);
    if (manualAmount.trim() === '' || !Number.isFinite(val)) {
      setManualError('Please enter a valid cash balance amount.');
      return;
    }

    setSavingManual(true);
    try {
      await updateCashManual({
        newBalance: val,
        note: manualNote.trim() || 'Manual cash balance adjustment',
        mode: 'manual_edit',
      });
      setManualAmount('');
      setManualNote('');
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Failed to update cash balance.');
    } finally {
      setSavingManual(false);
    }
  };

  const handleReconciliationSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setReconError(null);
    if (!hasCountedInput) {
      setReconError('Please enter your counted physical cash amount.');
      return;
    }

    const defaultNote =
      Math.abs(discrepancy) < 0.005
        ? 'Physical cash verified — exact match with calculated balance'
        : discrepancy > 0
        ? `Cash reconciliation (+${formatCurrency(discrepancy, settings.currency)} surplus)`
        : `Cash reconciliation (${formatCurrency(discrepancy, settings.currency)} shortage)`;

    setSavingRecon(true);
    try {
      await updateCashManual({
        newBalance: parsedCounted,
        note: reconNote.trim() || defaultNote,
        mode: 'reconciliation',
      });
      setCountedCash('');
      setReconNote('');
    } catch (err) {
      setReconError(err instanceof Error ? err.message : 'Failed to reconcile cash.');
    } finally {
      setSavingRecon(false);
    }
  };

  const getEventLabel = (type: CashEventType): string => {
    switch (type) {
      case 'manual_edit':
        return 'Manual Balance Edit';
      case 'reconciliation':
        return 'Cash Reconciliation';
      case 'cash_expense':
        return 'Cash Expense Deduction';
      case 'cash_expense_update':
        return 'Cash Expense Adjusted';
      case 'cash_expense_reversal':
        return 'Cash Expense Reversed';
    }
  };

  return (
    <div className="space-y-6">
      {/* Primary Remaining Cash Overview */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-3 lg:divide-y-0 lg:divide-x dark:divide-slate-800">
          <div className="p-6">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Wallet className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              <span>Current Remaining Cash</span>
            </div>
            <p
              className={`mt-2.5 font-mono text-3xl font-semibold tabular-nums ${
                settings.cashBalance < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {formatCurrency(settings.cashBalance, settings.currency)}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Last updated: <span className="font-mono">{formatDateTimeReadable(settings.cashLastUpdated)}</span>
            </p>
            {settings.cashLastNote && (
              <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                Note: {settings.cashLastNote}
              </p>
            )}
          </div>

          <div className="p-6">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Cumulative Cash Expenses Recorded
            </span>
            <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(cashStats.totalCashExpenses, settings.currency)}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Automatically deducted when Payment Method is set to &ldquo;Cash&rdquo;
            </p>
          </div>

          <div className="p-6">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Bank &amp; Digital Payments (Excluded from Cash)
            </span>
            <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(cashStats.totalNonCashExpenses, settings.currency)}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Bank Transfers, Cards, and Mobile Wallets never deduct from physical cash
            </p>
          </div>
        </div>
      </section>

      {/* Two-Column Action Workspace: Manual Edit Balance + Physical Cash Reconciliation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Edit Balance Directly */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <Edit3 className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Edit Cash Balance
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Set your current cash in hand (for example after an ATM withdrawal, salary cash receipt, or opening balance).
          </p>

          <form onSubmit={handleManualBalanceSave} className="mt-4 space-y-4">
            {manualError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {manualError}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  New Cash Balance ({getCurrencyPrefix(settings.currency).trim()}) *
                </label>
                <button
                  type="button"
                  onClick={() => setManualAmount(String(settings.cashBalance))}
                  className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  Fill current ({formatCurrency(settings.cashBalance, settings.currency)})
                </button>
              </div>
              <input
                type="number"
                step="any"
                placeholder="e.g. 15000"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Adjustment Explanation / Note
              </label>
              <input
                type="text"
                placeholder="e.g. ATM withdrawal of Rs. 20,000 or Initial wallet balance"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={savingManual}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {savingManual ? 'Saving Balance...' : 'Save Cash Balance'}
            </button>
          </form>
        </section>

        {/* 2. Manual Physical Cash Reconciliation */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <Scale className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Manual Cash Reconciliation
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Count the physical currency notes in your wallet and reconcile any discrepancy with the system-calculated balance.
          </p>

          <form onSubmit={handleReconciliationSave} className="mt-4 space-y-4">
            {reconError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {reconError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Actual Physical Cash Counted ({getCurrencyPrefix(settings.currency).trim()}) *
              </label>
              <input
                type="number"
                step="any"
                placeholder="Enter counted physical cash..."
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {hasCountedInput && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Calculated Balance:</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(settings.cashBalance, settings.currency)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Reconciliation Variance:</span>
                  {Math.abs(discrepancy) < 0.005 ? (
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Exact Match (0 difference)
                    </span>
                  ) : discrepancy > 0 ? (
                    <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      +{formatCurrency(discrepancy, settings.currency)} (Unrecorded Cash Surplus)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {formatCurrency(discrepancy, settings.currency)} (Unrecorded Cash Shortage)
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reconciliation Note
              </label>
              <input
                type="text"
                placeholder="e.g. Evening wallet count — minor loose change difference"
                value={reconNote}
                onChange={(e) => setReconNote(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={savingRecon}
              className="w-full rounded-lg border border-slate-900 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {savingRecon ? 'Reconciling...' : 'Reconcile & Sync Cash Balance'}
            </button>
          </form>
        </section>
      </div>

      {/* Cash Reconciliation & Balance History */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Cash Reconciliation &amp; Adjustment History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Permanent audit log of manual edits, physical cash reconciliations, and cash expense deductions.
            </p>
          </div>

          <select
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value as 'ALL' | CashEventType)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            aria-label="Filter cash history"
          >
            <option value="ALL">All Cash Events ({cashLedger.length})</option>
            <option value="manual_edit">Manual Balance Edits</option>
            <option value="reconciliation">Cash Reconciliations</option>
            <option value="cash_expense">Cash Expense Deductions</option>
          </select>
        </div>

        {filteredLedger.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No cash balance history recorded yet
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Set your initial Remaining Cash balance above or record a Cash expense to populate your audit log.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Event Type &amp; Note</th>
                  <th className="px-4 py-3 text-right">Previous</th>
                  <th className="px-4 py-3 text-right">Adjustment</th>
                  <th className="px-4 py-3 text-right">New Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredLedger.map((entry) => (
                  <tr
                    key={entry.id}
                    className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                      {formatDateTimeReadable(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {getEventLabel(entry.type)}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {entry.note}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                      {formatCurrency(entry.previousBalance, settings.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                      {entry.delta > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
                          <ArrowUpRight className="h-3.5 w-3.5" />+
                          {formatCurrency(entry.delta, settings.currency)}
                        </span>
                      ) : entry.delta < 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400">
                          <ArrowDownRight className="h-3.5 w-3.5" />
                          {formatCurrency(entry.delta, settings.currency)}
                        </span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
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
    </div>
  );
}

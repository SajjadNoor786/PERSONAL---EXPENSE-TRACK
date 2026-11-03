import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatCurrency, getCurrencyPrefix, getLocalNowTime, getLocalTodayDate } from '../lib/format';
import type { Expense, ExpenseInput, PaymentMethod } from '../types/finance';
import { PAYMENT_METHODS } from '../types/finance';

interface ExpenseFormModalProps {
  open: boolean;
  editingExpense?: Expense | null;
  defaultDate?: string;
  onClose: () => void;
}

export function ExpenseFormModal({
  open,
  editingExpense,
  defaultDate,
  onClose,
}: ExpenseFormModalProps) {
  const { settings, addExpense, editExpense } = useFinance();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(settings.categories[0] || 'Food');
  const [customCategory, setCustomCategory] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [date, setDate] = useState(defaultDate || getLocalTodayDate());
  const [time, setTime] = useState(getLocalNowTime());
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setShowCustomCategory(false);
    setCustomCategory('');

    if (editingExpense) {
      setTitle(editingExpense.title);
      setAmount(String(editingExpense.amount));
      setCategory(editingExpense.category);
      setPaymentMethod(editingExpense.paymentMethod);
      setDate(editingExpense.date);
      setTime(editingExpense.time);
      setNotes(editingExpense.notes);
    } else {
      setTitle('');
      setAmount('');
      setCategory(settings.categories[0] || 'Food');
      setPaymentMethod('Cash');
      setDate(defaultDate || getLocalTodayDate());
      setTime(getLocalNowTime());
      setNotes('');
    }
  }, [open, editingExpense, defaultDate, settings.categories]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const numericAmount = Number(amount);
  const isCashDeduction = paymentMethod === 'Cash' && Number.isFinite(numericAmount) && numericAmount > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Please enter an expense title.');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError('Please enter a valid expense amount greater than 0.');
      return;
    }

    const finalCategory = showCustomCategory ? customCategory.trim() : category;
    if (!finalCategory) {
      setFormError('Please select or enter a category.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFormError('Please select a valid date.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: ExpenseInput = {
        title: cleanTitle,
        amount: numericAmount,
        category: finalCategory,
        paymentMethod,
        date,
        time: time || getLocalNowTime(),
        notes,
      };

      if (editingExpense) {
        await editExpense(editingExpense, payload);
      } else {
        await addExpense(payload);
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2
              id="expense-modal-title"
              className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {editingExpense ? 'Edit Expense Record' : 'Record New Expense'}
            </h2>
            {editingExpense && (
              <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                ID: {editingExpense.id}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Expense Title *
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Groceries, Petrol, Electricity Bill"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Amount ({getCurrencyPrefix(settings.currency).trim()}) *
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Category *
                </label>
                <button
                  type="button"
                  onClick={() => setShowCustomCategory((prev) => !prev)}
                  className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  {showCustomCategory ? 'Choose existing' : '+ New category'}
                </button>
              </div>
              {showCustomCategory ? (
                <input
                  type="text"
                  placeholder="Enter category name"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              ) : (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {settings.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  {editingExpense && !settings.categories.includes(editingExpense.category) && (
                    <option value={editingExpense.category}>{editingExpense.category}</option>
                  )}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Time *
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Description / Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Optional receipt details, vendor, or context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
            {isCashDeduction ? (
              <span>
                Physical Cash impact: Deducts{' '}
                <strong className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(numericAmount, settings.currency)}
                </strong>{' '}
                from Remaining Cash (current:{' '}
                <span className="font-mono">{formatCurrency(settings.cashBalance, settings.currency)}</span>).
              </span>
            ) : (
              <span>
                {paymentMethod === 'Cash'
                  ? 'Cash payments automatically update your physical Remaining Cash balance.'
                  : `${paymentMethod} payments affect your Monthly Budget but do not deduct from physical Cash.`}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {submitting ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

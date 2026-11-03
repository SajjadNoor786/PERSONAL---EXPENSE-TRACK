import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Mail,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  downloadTextFile,
  formatCurrency,
  formatDateTimeReadable,
  generateExpensesCSV,
  getCurrencyPrefix,
  parseExpensesCSV,
} from '../lib/format';
import type { BackupPayload, CurrencyCode } from '../types/finance';
import { DEFAULT_CATEGORIES } from '../types/finance';
import { ConfirmDialog } from './ConfirmDialog';

const CURRENCY_OPTIONS: Array<{ code: CurrencyCode; label: string }> = [
  { code: 'PKR', label: 'PKR — Pakistani Rupee (Rs.)' },
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'AED', label: 'AED — UAE Dirham (AED)' },
  { code: 'SAR', label: 'SAR — Saudi Riyal (SAR)' },
];

export function SettingsView() {
  const {
    settings,
    expenses,
    reminderLogs,
    reminderBackend,
    todayStatus,
    updateSettings,
    addCategory,
    removeCategory,
    exportBackup,
    importBackup,
    importExpensesCsv,
    clearAllData,
    refreshBackendStatus,
    sendTestReminder,
    notify,
  } = useFinance();

  // Profile & Preferences state
  const [userName, setUserName] = useState(settings.userName);
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency);
  const [monthlyBudget, setMonthlyBudget] = useState(String(settings.monthlyBudget || ''));

  // Email Reminder state
  const [email, setEmail] = useState(settings.email);
  const [reminderEnabled, setReminderEnabled] = useState(settings.reminderEnabled);
  const [reminderTime, setReminderTime] = useState(settings.reminderTime || '21:00');
  const [timezone, setTimezone] = useState(settings.timezone || 'Asia/Karachi');
  const [sendingTest, setSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Category state
  const [newCatInput, setNewCatInput] = useState('');

  // Backup / Restore & Reset state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestorePayload, setPendingRestorePayload] = useState<BackupPayload | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  useEffect(() => {
    setUserName(settings.userName);
    setCurrency(settings.currency);
    setMonthlyBudget(settings.monthlyBudget ? String(settings.monthlyBudget) : '');
    setEmail(settings.email);
    setReminderEnabled(settings.reminderEnabled);
    setReminderTime(settings.reminderTime || '21:00');
    setTimezone(settings.timezone || 'Asia/Karachi');
  }, [settings]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedBudget = Number(monthlyBudget);
    const cleanBudget =
      monthlyBudget.trim() === '' || !Number.isFinite(parsedBudget) || parsedBudget < 0
        ? 0
        : Math.round(parsedBudget * 100) / 100;

    await updateSettings({
      userName: userName.trim(),
      currency,
      monthlyBudget: cleanBudget,
    });
    notify('success', 'Saved profile and budget preferences');
  };

  const handleSaveReminderSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (reminderEnabled && (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
      notify('error', 'Please enter a valid email address to enable daily reminders');
      return;
    }

    await updateSettings({
      email: cleanEmail,
      reminderEnabled,
      reminderTime: reminderTime || '21:00',
      timezone: timezone.trim() || 'Asia/Karachi',
    });
    await refreshBackendStatus();
    notify('success', 'Saved daily reminder schedule');
  };

  const handleTestReminder = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setTestFeedback({ ok: false, text: 'Enter a valid email address above before testing.' });
      return;
    }
    setSendingTest(true);
    setTestFeedback(null);
    try {
      // Save email first so subscription matches
      if (cleanEmail !== settings.email) {
        await updateSettings({ email: cleanEmail });
      }
      const res = await sendTestReminder(cleanEmail);
      setTestFeedback({ ok: res.ok, text: res.message });
    } finally {
      setSendingTest(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addCategory(newCatInput);
    if (ok) setNewCatInput('');
  };

  const handleRestoreDefaultsCategories = async () => {
    const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...settings.categories]));
    await updateSettings({ categories: merged });
    notify('success', 'Restored all default categories');
  };

  const handleExportJSON = async () => {
    const payload = await exportBackup();
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `ledgerflow-backup-${dateStamp}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
    notify('success', 'Downloaded complete JSON backup');
  };

  const handleExportCSV = () => {
    const csv = generateExpensesCSV(expenses);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`ledgerflow-expenses-${dateStamp}.csv`, csv, 'text/csv;charset=utf-8');
    notify('success', 'Downloaded expenses CSV file');
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.csv')) {
        const parsed = parseExpensesCSV(text);
        if (parsed.length === 0) {
          notify('error', 'No valid expense rows found in CSV file.');
          return;
        }
        await importExpensesCsv(parsed);
        return;
      }

      const json = JSON.parse(text) as Partial<BackupPayload>;
      if (!json || (!Array.isArray(json.expenses) && !json.settings)) {
        notify('error', 'Invalid backup JSON format. Please choose a LedgerFlow JSON export.');
        return;
      }

      setPendingRestorePayload(json as BackupPayload);
    } catch (err) {
      notify(
        'error',
        err instanceof Error ? err.message : 'Could not read or parse the selected file.'
      );
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Profile, Currency, Monthly Budget & Theme */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              General Profile &amp; Financial Settings
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Configure your display name, default currency (PKR), monthly budget target, and color theme.
            </p>
          </div>

          {/* Theme Switcher */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => void updateSettings({ theme: 'light' })}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                settings.theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </button>
            <button
              type="button"
              onClick={() => void updateSettings({ theme: 'dark' })}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                settings.theme === 'dark'
                  ? 'bg-slate-800 text-slate-100 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Your Name
            </label>
            <input
              type="text"
              placeholder="e.g. Sajjad Ahmed"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Default Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Monthly Spending Budget ({getCurrencyPrefix(currency).trim()})
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 50000"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Save Profile &amp; Budget
            </button>
          </div>
        </form>
      </section>

      {/* 2. Automated Daily Expense Email Reminder System */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-blue-800 dark:text-blue-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Daily Expense Email Reminder System
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Server-side scheduled reminder emails when today&apos;s expenses are not recorded and not marked as &ldquo;No Expenses Today&rdquo;.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshBackendStatus()}
            className="inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:self-center dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check Server Status
          </button>
        </div>

        {/* Honest Backend Configuration Banner */}
        <div
          className={`mt-4 rounded-lg border p-4 text-xs ${
            reminderBackend?.configured
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {reminderBackend?.configured ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div className="space-y-1">
              <p className="font-semibold">
                {reminderBackend?.configured
                  ? `Email Delivery Configured (${reminderBackend.provider})`
                  : 'Email Reminders Require Server API Key Setup'}
              </p>
              <p className="leading-relaxed opacity-90">
                {reminderBackend?.configured
                  ? `Scheduled server job is running every ${reminderBackend.schedulerIntervalSeconds}s. Sender: ${reminderBackend.fromEmail}. Duplicate daily emails are automatically prevented.`
                  : 'The server-side scheduler is running, but RESEND_API_KEY is not configured in the server environment yet. Set RESEND_API_KEY (from resend.com) and optional REMINDER_FROM_EMAIL in your server environment secrets to enable real email dispatch. API keys are never exposed in browser code.'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSaveReminderSettings} className="space-y-4 lg:col-span-7">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div>
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  Enable Daily Email Reminders
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Today&apos;s current status:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {todayStatus === 'expenses_recorded'
                      ? 'Expenses Recorded (No email needed)'
                      : todayStatus === 'no_expenses_today'
                      ? 'No Expenses Today (No email needed)'
                      : 'Not Updated (Will remind at scheduled time)'}
                  </strong>
                </span>
              </div>
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Recipient Email Address
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Preferred Reminder Time (24h)
                </label>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Timezone
                </label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            {testFeedback && (
              <div
                className={`rounded-lg border px-3.5 py-2.5 text-xs ${
                  testFeedback.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                }`}
              >
                {testFeedback.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                className="whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Save Reminder Configuration
              </button>
              <button
                type="button"
                disabled={sendingTest}
                onClick={() => void handleTestReminder()}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Send className="h-3.5 w-3.5" />
                {sendingTest ? 'Contacting Server...' : 'Send Verification Email'}
              </button>
            </div>
          </form>

          {/* Exact Notification Template Preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 lg:col-span-5 dark:border-slate-800 dark:bg-slate-950">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Notification Message Template
            </span>
            <pre className="mt-2.5 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600 dark:text-slate-400">
{`Hello,

You have not recorded today's expenses yet.

Please open your Expense Management System and update today's expenses.

If you did not spend any money today, please open the application and mark today's expenses as 'No Expenses Today'.

This will help keep your financial records accurate.

Thank you.`}
            </pre>
          </div>
        </div>

        {/* Reminder History Log */}
        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Reminder Execution History
          </h3>
          {reminderLogs.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              No reminder events logged yet. Scheduled checks and verification attempts appear here.
            </p>
          ) : (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    <th className="px-3 py-2">Date &amp; Time</th>
                    <th className="px-3 py-2">Recipient</th>
                    <th className="px-3 py-2">Outcome</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reminderLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {log.date} {log.time}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-300">
                        {log.email}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {log.status === 'sent' && (
                          <span className="text-emerald-700 dark:text-emerald-400">Sent</span>
                        )}
                        {log.status === 'skipped_already_updated' && (
                          <span className="text-blue-700 dark:text-blue-400">Skipped</span>
                        )}
                        {log.status === 'backend_unconfigured' && (
                          <span className="text-amber-700 dark:text-amber-400">Setup Needed</span>
                        )}
                        {log.status === 'failed' && (
                          <span className="text-red-600 dark:text-red-400">Failed</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 3. Expense Categories Configuration */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Expense Categories ({settings.categories.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Customize categories available across Quick Entry, Daily Expenses, and the Ideal Expense Sheet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRestoreDefaultsCategories()}
            className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-blue-700 hover:underline sm:self-center dark:text-blue-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore Default Categories
          </button>
        </div>

        <form onSubmit={handleAddCategory} className="mt-4 flex gap-2.5">
          <input
            type="text"
            placeholder="Add new category (e.g. Charity / Zakat, Maintenance, Medical)..."
            value={newCatInput}
            onChange={(e) => setNewCatInput(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </form>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {settings.categories.map((cat) => (
            <div
              key={cat}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
            >
              <span className="truncate font-medium text-slate-800 dark:text-slate-200">{cat}</span>
              <button
                type="button"
                onClick={() => void removeCategory(cat)}
                className="ml-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                aria-label={`Remove category ${cat}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Local IndexedDB Storage, Backup, Export, Import & Reset */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-2.5 border-b border-slate-100 pb-4 dark:border-slate-800">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-slate-700 dark:text-slate-300" />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              User Storage, Backup, Import &amp; Data Reset
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              All data is stored permanently in your browser&apos;s IndexedDB and works offline. Last backup:{' '}
              <span className="font-mono">{formatDateTimeReadable(settings.lastBackupAt)}</span>
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExportJSON()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Download className="h-4 w-4" />
            Backup / Export All Data (JSON)
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Expenses (CSV)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={(e) => void handleFileSelected(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Upload className="h-4 w-4" />
            Restore Backup / Import JSON or CSV
          </button>

          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
          >
            <Trash2 className="h-4 w-4" />
            Reset All Data
          </button>
        </div>
      </section>

      {/* Restore Backup Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(pendingRestorePayload)}
        title="Restore Data from Backup"
        description={
          pendingRestorePayload
            ? `Backup file contains ${pendingRestorePayload.expenses?.length || 0} expenses, ${pendingRestorePayload.idealBudgets?.length || 0} ideal category budgets, and cash balance ${formatCurrency(pendingRestorePayload.settings?.cashBalance || 0, pendingRestorePayload.settings?.currency || 'PKR')}. Choose how to import:`
            : ''
        }
        confirmLabel={restoreMode === 'replace' ? 'Replace & Restore' : 'Merge Data'}
        extraContent={
          <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-950">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="restore-mode"
                checked={restoreMode === 'replace'}
                onChange={() => setRestoreMode('replace')}
              />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Full Restore (Replace current browser data with backup)
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="restore-mode"
                checked={restoreMode === 'merge'}
                onChange={() => setRestoreMode('merge')}
              />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Merge (Keep current records and add backup entries)
              </span>
            </label>
          </div>
        }
        onConfirm={() => {
          if (pendingRestorePayload) {
            void importBackup(pendingRestorePayload, restoreMode);
          }
          setPendingRestorePayload(null);
        }}
        onCancel={() => setPendingRestorePayload(null)}
      />

      {/* Clear All Data Confirmation Modal */}
      <ConfirmDialog
        open={confirmClearOpen}
        title="Reset All Financial Data"
        description="Are you sure you want to permanently erase all expenses, cash balances, reconciliation logs, ideal budgets, and settings from this browser? Export a JSON backup first if you want a copy."
        confirmLabel="Yes, Erase Everything"
        variant="danger"
        onConfirm={() => {
          setConfirmClearOpen(false);
          void clearAllData();
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}

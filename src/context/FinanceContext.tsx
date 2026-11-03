import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  addExpenseRecord,
  deleteExpenseRecord,
  deleteIdealBudgetRecord,
  deleteRecurringExpenseRecord,
  exportFullBackup,
  importCsvExpensesBatch,
  importFullBackup,
  loadAllFinanceData,
  logRecurringExpenseOccurrence,
  resetAllFinanceData,
  saveIdealBudgetRecord,
  saveRecurringExpenseRecord,
  saveUserSettings,
  setDailyStatusRecord,
  updateCashBalanceManual,
  updateExpenseRecord,
  upsertReminderLogs,
} from '../lib/db';
import { getLocalTodayDate } from '../lib/format';
import {
  deleteServerReminderSubscription,
  fetchReminderBackendStatus,
  sendTestReminderRequest,
  syncReminderSubscription,
} from '../lib/reminderClient';
import type {
  BackupPayload,
  CashLedgerEntry,
  DailyStatusRecord,
  DailyStatusType,
  Expense,
  ExpenseInput,
  IdealBudgetItem,
  RecurringExpense,
  ReminderBackendStatus,
  ReminderLogEntry,
  UserSettings,
} from '../types/finance';
import { DEFAULT_CATEGORIES } from '../types/finance';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface FinanceContextValue {
  loading: boolean;
  error: string | null;
  settings: UserSettings;
  expenses: Expense[];
  cashLedger: CashLedgerEntry[];
  idealBudgets: IdealBudgetItem[];
  dailyStatuses: Record<string, DailyStatusRecord>;
  recurringExpenses: RecurringExpense[];
  reminderLogs: ReminderLogEntry[];
  reminderBackend: ReminderBackendStatus | null;
  todayDate: string;
  todayStatus: DailyStatusType;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  notify: (type: ToastMessage['type'], text: string) => void;

  // Actions
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  addExpense: (input: ExpenseInput) => Promise<void>;
  editExpense: (existing: Expense, input: ExpenseInput) => Promise<void>;
  removeExpense: (expense: Expense, restoreCash?: boolean) => Promise<void>;
  updateCashManual: (params: {
    newBalance: number;
    note: string;
    mode: 'manual_edit' | 'reconciliation';
  }) => Promise<void>;
  markNoExpensesToday: (targetDate?: string) => Promise<void>;
  undoNoExpensesToday: (targetDate?: string) => Promise<void>;
  saveIdealItem: (item: IdealBudgetItem) => Promise<void>;
  removeIdealItem: (id: string) => Promise<void>;
  saveRecurring: (item: RecurringExpense) => Promise<void>;
  removeRecurring: (id: string) => Promise<void>;
  recordRecurringNow: (item: RecurringExpense) => Promise<void>;
  addCategory: (name: string) => Promise<boolean>;
  removeCategory: (name: string) => Promise<void>;
  exportBackup: () => Promise<BackupPayload>;
  importBackup: (payload: BackupPayload, mode: 'replace' | 'merge') => Promise<void>;
  importExpensesCsv: (parsedExpenses: Expense[]) => Promise<number>;
  clearAllData: () => Promise<void>;
  refreshBackendStatus: () => Promise<void>;
  sendTestReminder: (emailOverride?: string) => Promise<{ ok: boolean; message: string }>;
}

const FALLBACK_SETTINGS: UserSettings = {
  id: 'profile',
  clientId: 'initializing',
  userName: '',
  email: '',
  currency: 'PKR',
  monthlyBudget: 0,
  cashBalance: 0,
  cashLastUpdated: null,
  cashLastNote: '',
  reminderEnabled: false,
  reminderTime: '21:00',
  timezone: 'Asia/Karachi',
  categories: [...DEFAULT_CATEGORIES],
  theme: 'light',
  lastBackupAt: null,
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(FALLBACK_SETTINGS);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [idealBudgets, setIdealBudgets] = useState<IdealBudgetItem[]>([]);
  const [dailyStatuses, setDailyStatuses] = useState<Record<string, DailyStatusRecord>>({});
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [reminderLogs, setReminderLogs] = useState<ReminderLogEntry[]>([]);
  const [reminderBackend, setReminderBackend] = useState<ReminderBackendStatus | null>(null);
  const [todayDate, setTodayDate] = useState<string>(() => getLocalTodayDate());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Keep todayDate fresh across midnight rollovers
  useEffect(() => {
    const interval = setInterval(() => {
      const next = getLocalTodayDate();
      setTodayDate((prev) => (prev !== next ? next : prev));
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const reloadLocalState = useCallback(async () => {
    try {
      const data = await loadAllFinanceData();
      setSettings(data.settings);
      setExpenses(data.expenses);
      setCashLedger(data.cashLedger);
      setIdealBudgets(data.idealBudgets);
      setDailyStatuses(data.dailyStatuses);
      setRecurringExpenses(data.recurringExpenses);
      setReminderLogs(data.reminderLogs);
      setError(null);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to access browser IndexedDB storage.';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Apply theme class to <html> cleanly
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const todayStatus: DailyStatusType = useMemo(() => {
    const hasExpensesToday = expenses.some((e) => e.date === todayDate);
    if (hasExpensesToday) return 'expenses_recorded';
    const record = dailyStatuses[todayDate];
    if (record?.status === 'no_expenses_today') return 'no_expenses_today';
    return 'not_updated';
  }, [expenses, dailyStatuses, todayDate]);

  const refreshBackendStatus = useCallback(async () => {
    const status = await fetchReminderBackendStatus();
    if (status) {
      setReminderBackend(status);
    }
  }, []);

  // Initial load from IndexedDB + backend check
  useEffect(() => {
    void reloadLocalState();
    void refreshBackendStatus();
  }, [reloadLocalState, refreshBackendStatus]);

  // Sync reminder schedule & today's status with backend whenever relevant fields change
  useEffect(() => {
    if (loading || settings.clientId === 'initializing') return;

    let cancelled = false;
    const performSync = async () => {
      const res = await syncReminderSubscription(settings, todayDate, todayStatus);
      if (cancelled || !res) return;
      if (Array.isArray(res.history) && res.history.length > 0) {
        await upsertReminderLogs(res.history);
        const latest = await loadAllFinanceData();
        if (!cancelled) {
          setReminderLogs(latest.reminderLogs);
        }
      }
    };

    void performSync();
    return () => {
      cancelled = true;
    };
  }, [
    loading,
    settings.clientId,
    settings.email,
    settings.userName,
    settings.reminderEnabled,
    settings.reminderTime,
    settings.timezone,
    todayDate,
    todayStatus,
  ]);

  const updateSettings = useCallback(
    async (partial: Partial<UserSettings>) => {
      const merged: UserSettings = { ...settings, ...partial, id: 'profile' };
      await saveUserSettings(merged);
      setSettings(merged);
    },
    [settings]
  );

  const addExpense = useCallback(
    async (input: ExpenseInput) => {
      await addExpenseRecord(input);
      // Ensure category is saved if custom
      if (input.category && !settings.categories.includes(input.category)) {
        await saveUserSettings({
          ...settings,
          categories: [...settings.categories, input.category],
        });
      }
      await reloadLocalState();
      notify('success', `Recorded "${input.title}"`);
    },
    [reloadLocalState, notify, settings]
  );

  const editExpense = useCallback(
    async (existing: Expense, input: ExpenseInput) => {
      await updateExpenseRecord(existing, input);
      await reloadLocalState();
      notify('success', `Updated "${input.title}"`);
    },
    [reloadLocalState, notify]
  );

  const removeExpense = useCallback(
    async (expense: Expense, restoreCash: boolean = true) => {
      await deleteExpenseRecord(expense, restoreCash);
      await reloadLocalState();
      notify('info', `Deleted "${expense.title}"`);
    },
    [reloadLocalState, notify]
  );

  const updateCashManual = useCallback(
    async (params: { newBalance: number; note: string; mode: 'manual_edit' | 'reconciliation' }) => {
      await updateCashBalanceManual(params);
      await reloadLocalState();
      notify(
        'success',
        params.mode === 'reconciliation'
          ? 'Physical cash reconciled and saved'
          : 'Remaining cash balance updated'
      );
    },
    [reloadLocalState, notify]
  );

  const markNoExpensesToday = useCallback(
    async (targetDate?: string) => {
      const dt = targetDate || todayDate;
      await setDailyStatusRecord(dt, 'no_expenses_today', todayStatus);
      await reloadLocalState();
      notify('success', 'Marked today as "No Expenses Today"');
    },
    [todayDate, todayStatus, reloadLocalState, notify]
  );

  const undoNoExpensesToday = useCallback(
    async (targetDate?: string) => {
      const dt = targetDate || todayDate;
      const hasExp = expenses.some((e) => e.date === dt);
      await setDailyStatusRecord(dt, hasExp ? 'expenses_recorded' : 'not_updated', 'no_expenses_today');
      await reloadLocalState();
      notify('info', 'Reverted "No Expenses Today" status');
    },
    [todayDate, expenses, reloadLocalState, notify]
  );

  const saveIdealItem = useCallback(
    async (item: IdealBudgetItem) => {
      await saveIdealBudgetRecord(item);
      await reloadLocalState();
      notify('success', `Saved ideal budget for ${item.category}`);
    },
    [reloadLocalState, notify]
  );

  const removeIdealItem = useCallback(
    async (id: string) => {
      await deleteIdealBudgetRecord(id);
      await reloadLocalState();
      notify('info', 'Removed category from Ideal Expense Sheet');
    },
    [reloadLocalState, notify]
  );

  const saveRecurring = useCallback(
    async (item: RecurringExpense) => {
      await saveRecurringExpenseRecord(item);
      await reloadLocalState();
      notify('success', `Saved recurring expense "${item.title}"`);
    },
    [reloadLocalState, notify]
  );

  const removeRecurring = useCallback(
    async (id: string) => {
      await deleteRecurringExpenseRecord(id);
      await reloadLocalState();
      notify('info', 'Removed recurring expense');
    },
    [reloadLocalState, notify]
  );

  const recordRecurringNow = useCallback(
    async (item: RecurringExpense) => {
      await logRecurringExpenseOccurrence(item, todayDate);
      await reloadLocalState();
      notify('success', `Logged recurring expense "${item.title}" for today`);
    },
    [todayDate, reloadLocalState, notify]
  );

  const addCategory = useCallback(
    async (name: string): Promise<boolean> => {
      const clean = name.trim();
      if (!clean) return false;
      if (settings.categories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
        notify('error', `Category "${clean}" already exists`);
        return false;
      }
      await updateSettings({ categories: [...settings.categories, clean] });
      notify('success', `Added category "${clean}"`);
      return true;
    },
    [settings.categories, updateSettings, notify]
  );

  const removeCategory = useCallback(
    async (name: string) => {
      const next = settings.categories.filter((c) => c !== name);
      if (next.length === 0) {
        notify('error', 'At least one expense category is required');
        return;
      }
      await updateSettings({ categories: next });
      notify('info', `Removed category "${name}"`);
    },
    [settings.categories, updateSettings, notify]
  );

  const exportBackup = useCallback(async () => {
    const payload = await exportFullBackup();
    await reloadLocalState();
    return payload;
  }, [reloadLocalState]);

  const importBackup = useCallback(
    async (payload: BackupPayload, mode: 'replace' | 'merge') => {
      await importFullBackup(payload, mode);
      await reloadLocalState();
      notify(
        'success',
        mode === 'replace' ? 'Backup restored successfully' : 'Data merged successfully'
      );
    },
    [reloadLocalState, notify]
  );

  const importExpensesCsv = useCallback(
    async (parsedExpenses: Expense[]) => {
      const count = await importCsvExpensesBatch(parsedExpenses);
      await reloadLocalState();
      notify('success', `Imported ${count} expense records from CSV`);
      return count;
    },
    [reloadLocalState, notify]
  );

  const clearAllData = useCallback(async () => {
    const oldClientId = settings.clientId;
    await resetAllFinanceData();
    await deleteServerReminderSubscription(oldClientId);
    await reloadLocalState();
    notify('info', 'All local expense, cash, and budget data has been reset');
  }, [settings.clientId, reloadLocalState, notify]);

  const sendTestReminder = useCallback(
    async (emailOverride?: string): Promise<{ ok: boolean; message: string }> => {
      const targetEmail = (emailOverride ?? settings.email).trim();
      const result = await sendTestReminderRequest({
        clientId: settings.clientId,
        email: targetEmail,
        timezone: settings.timezone,
      });

      if (result.logEntry) {
        await upsertReminderLogs([result.logEntry]);
        await reloadLocalState();
      }
      await refreshBackendStatus();

      if (result.ok) {
        const msg = result.message || `Reminder email sent to ${targetEmail}`;
        notify('success', msg);
        return { ok: true, message: msg };
      } else {
        const msg = result.error || 'Could not send email reminder.';
        notify('error', msg);
        return { ok: false, message: msg };
      }
    },
    [settings.clientId, settings.email, settings.timezone, reloadLocalState, refreshBackendStatus, notify]
  );

  const value = useMemo<FinanceContextValue>(
    () => ({
      loading,
      error,
      settings,
      expenses,
      cashLedger,
      idealBudgets,
      dailyStatuses,
      recurringExpenses,
      reminderLogs,
      reminderBackend,
      todayDate,
      todayStatus,
      toasts,
      dismissToast,
      notify,
      updateSettings,
      addExpense,
      editExpense,
      removeExpense,
      updateCashManual,
      markNoExpensesToday,
      undoNoExpensesToday,
      saveIdealItem,
      removeIdealItem,
      saveRecurring,
      removeRecurring,
      recordRecurringNow,
      addCategory,
      removeCategory,
      exportBackup,
      importBackup,
      importExpensesCsv,
      clearAllData,
      refreshBackendStatus,
      sendTestReminder,
    }),
    [
      loading,
      error,
      settings,
      expenses,
      cashLedger,
      idealBudgets,
      dailyStatuses,
      recurringExpenses,
      reminderLogs,
      reminderBackend,
      todayDate,
      todayStatus,
      toasts,
      dismissToast,
      notify,
      updateSettings,
      addExpense,
      editExpense,
      removeExpense,
      updateCashManual,
      markNoExpensesToday,
      undoNoExpensesToday,
      saveIdealItem,
      removeIdealItem,
      saveRecurring,
      removeRecurring,
      recordRecurringNow,
      addCategory,
      removeCategory,
      exportBackup,
      importBackup,
      importExpensesCsv,
      clearAllData,
      refreshBackendStatus,
      sendTestReminder,
    ]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return ctx;
}

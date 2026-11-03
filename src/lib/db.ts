import type {
  BackupPayload,
  CashLedgerEntry,
  DailyStatusRecord,
  DailyStatusType,
  Expense,
  ExpenseInput,
  IdealBudgetItem,
  RecurringExpense,
  ReminderLogEntry,
  UserSettings,
} from '../types/finance';
import { DEFAULT_CATEGORIES } from '../types/finance';
import { advanceRecurringDate, generateExpenseId, getLocalNowTime } from './format';

const DB_NAME = 'ledgerflow_personal_finance_db';
const DB_VERSION = 1;

const STORES = {
  SETTINGS: 'settings',
  EXPENSES: 'expenses',
  CASH_LEDGER: 'cash_ledger',
  IDEAL_BUDGETS: 'ideal_budgets',
  DAILY_STATUSES: 'daily_statuses',
  RECURRING: 'recurring_expenses',
  REMINDER_LOGS: 'reminder_logs',
} as const;

let dbInstance: IDBDatabase | null = null;

function createDefaultSettings(existingClientId?: string): UserSettings {
  const detectedTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi';
    } catch {
      return 'Asia/Karachi';
    }
  })();

  return {
    id: 'profile',
    clientId: existingClientId || `lf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userName: '',
    email: '',
    currency: 'PKR',
    monthlyBudget: 0,
    cashBalance: 0,
    cashLastUpdated: null,
    cashLastNote: '',
    reminderEnabled: false,
    reminderTime: '21:00',
    timezone: detectedTz,
    categories: [...DEFAULT_CATEGORIES],
    theme: 'light',
    lastBackupAt: null,
  };
}

export function openFinanceDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
        const expStore = db.createObjectStore(STORES.EXPENSES, { keyPath: 'id' });
        expStore.createIndex('by_date', 'date', { unique: false });
        expStore.createIndex('by_category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CASH_LEDGER)) {
        const cashStore = db.createObjectStore(STORES.CASH_LEDGER, { keyPath: 'id' });
        cashStore.createIndex('by_timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.IDEAL_BUDGETS)) {
        db.createObjectStore(STORES.IDEAL_BUDGETS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.DAILY_STATUSES)) {
        db.createObjectStore(STORES.DAILY_STATUSES, { keyPath: 'date' });
      }

      if (!db.objectStoreNames.contains(STORES.RECURRING)) {
        db.createObjectStore(STORES.RECURRING, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.REMINDER_LOGS)) {
        db.createObjectStore(STORES.REMINDER_LOGS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB storage.'));
    };
  });
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

function getByKey<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export interface FullFinanceData {
  settings: UserSettings;
  expenses: Expense[];
  cashLedger: CashLedgerEntry[];
  idealBudgets: IdealBudgetItem[];
  dailyStatuses: Record<string, DailyStatusRecord>;
  recurringExpenses: RecurringExpense[];
  reminderLogs: ReminderLogEntry[];
}

export async function loadAllFinanceData(): Promise<FullFinanceData> {
  const db = await openFinanceDB();

  let settings = await getByKey<UserSettings>(db, STORES.SETTINGS, 'profile');
  if (!settings) {
    settings = createDefaultSettings();
    await saveUserSettings(settings);
  } else {
    // Ensure new fields exist on older records
    settings = {
      ...createDefaultSettings(settings.clientId),
      ...settings,
      categories:
        Array.isArray(settings.categories) && settings.categories.length > 0
          ? settings.categories
          : [...DEFAULT_CATEGORIES],
    };
  }

  const [expenses, cashLedger, idealBudgets, statusList, recurringExpenses, reminderLogs] =
    await Promise.all([
      getAllFromStore<Expense>(db, STORES.EXPENSES),
      getAllFromStore<CashLedgerEntry>(db, STORES.CASH_LEDGER),
      getAllFromStore<IdealBudgetItem>(db, STORES.IDEAL_BUDGETS),
      getAllFromStore<DailyStatusRecord>(db, STORES.DAILY_STATUSES),
      getAllFromStore<RecurringExpense>(db, STORES.RECURRING),
      getAllFromStore<ReminderLogEntry>(db, STORES.REMINDER_LOGS),
    ]);

  expenses.sort((a, b) => {
    const cmpDate = b.date.localeCompare(a.date);
    if (cmpDate !== 0) return cmpDate;
    const cmpTime = b.time.localeCompare(a.time);
    if (cmpTime !== 0) return cmpTime;
    return b.createdAt.localeCompare(a.createdAt);
  });

  cashLedger.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  idealBudgets.sort((a, b) => a.category.localeCompare(b.category));
  recurringExpenses.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  reminderLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const dailyStatuses: Record<string, DailyStatusRecord> = {};
  for (const record of statusList) {
    dailyStatuses[record.date] = record;
  }

  return {
    settings,
    expenses,
    cashLedger,
    idealBudgets,
    dailyStatuses,
    recurringExpenses,
    reminderLogs,
  };
}

export async function saveUserSettings(settings: UserSettings): Promise<UserSettings> {
  const db = await openFinanceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SETTINGS, 'readwrite');
    tx.objectStore(STORES.SETTINGS).put(settings);
    tx.oncomplete = () => resolve(settings);
    tx.onerror = () => reject(tx.error);
  });
}

export async function addExpenseRecord(input: ExpenseInput): Promise<void> {
  const db = await openFinanceDB();
  const settings = (await getByKey<UserSettings>(db, STORES.SETTINGS, 'profile')) || createDefaultSettings();
  const existingStatus = await getByKey<DailyStatusRecord>(db, STORES.DAILY_STATUSES, input.date);

  const nowIso = new Date().toISOString();
  const cleanAmount = Math.round(Number(input.amount) * 100) / 100;

  const expense: Expense = {
    id: generateExpenseId(input.date),
    date: input.date,
    time: input.time || getLocalNowTime(),
    title: input.title.trim(),
    category: input.category.trim() || 'Other',
    amount: cleanAmount,
    paymentMethod: input.paymentMethod,
    notes: input.notes.trim(),
    recurringId: input.recurringId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORES.EXPENSES, STORES.SETTINGS, STORES.CASH_LEDGER, STORES.DAILY_STATUSES],
      'readwrite'
    );

    tx.objectStore(STORES.EXPENSES).put(expense);

    // Deduct ONLY Cash expenses from physical Remaining Cash
    if (expense.paymentMethod === 'Cash') {
      const prevCash = settings.cashBalance;
      const nextCash = Math.round((prevCash - cleanAmount) * 100) / 100;
      const updatedSettings: UserSettings = {
        ...settings,
        cashBalance: nextCash,
        cashLastUpdated: nowIso,
        cashLastNote: `Cash expense: ${expense.title}`,
      };
      tx.objectStore(STORES.SETTINGS).put(updatedSettings);

      const ledgerEntry: CashLedgerEntry = {
        id: `cash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'cash_expense',
        previousBalance: prevCash,
        newBalance: nextCash,
        delta: -cleanAmount,
        note: `Expense recorded: ${expense.title} (${expense.category})`,
        expenseId: expense.id,
        timestamp: nowIso,
      };
      tx.objectStore(STORES.CASH_LEDGER).put(ledgerEntry);
    }

    // Automatically mark the day's status as expenses_recorded
    const statusRecord: DailyStatusRecord = {
      date: expense.date,
      status: 'expenses_recorded',
      previousStatus: existingStatus?.status ?? 'not_updated',
      updatedAt: nowIso,
    };
    tx.objectStore(STORES.DAILY_STATUSES).put(statusRecord);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateExpenseRecord(existing: Expense, input: ExpenseInput): Promise<void> {
  const db = await openFinanceDB();
  const settings = (await getByKey<UserSettings>(db, STORES.SETTINGS, 'profile')) || createDefaultSettings();
  const allExpenses = await getAllFromStore<Expense>(db, STORES.EXPENSES);

  const nowIso = new Date().toISOString();
  const newAmount = Math.round(Number(input.amount) * 100) / 100;

  const updatedExpense: Expense = {
    ...existing,
    date: input.date,
    time: input.time || existing.time,
    title: input.title.trim(),
    category: input.category.trim() || 'Other',
    amount: newAmount,
    paymentMethod: input.paymentMethod,
    notes: input.notes.trim(),
    updatedAt: nowIso,
  };

  // Calculate cash balance adjustment
  const wasCash = existing.paymentMethod === 'Cash';
  const isCash = updatedExpense.paymentMethod === 'Cash';
  let cashDelta = 0;
  if (wasCash && isCash) {
    cashDelta = Math.round((existing.amount - newAmount) * 100) / 100;
  } else if (wasCash && !isCash) {
    cashDelta = existing.amount; // Refund physical cash since payment method changed to non-cash
  } else if (!wasCash && isCash) {
    cashDelta = -newAmount; // Deduct physical cash since payment method changed to Cash
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORES.EXPENSES, STORES.SETTINGS, STORES.CASH_LEDGER, STORES.DAILY_STATUSES],
      'readwrite'
    );

    tx.objectStore(STORES.EXPENSES).put(updatedExpense);

    if (Math.abs(cashDelta) > 0.001) {
      const prevCash = settings.cashBalance;
      const nextCash = Math.round((prevCash + cashDelta) * 100) / 100;
      const updatedSettings: UserSettings = {
        ...settings,
        cashBalance: nextCash,
        cashLastUpdated: nowIso,
        cashLastNote: `Updated expense: ${updatedExpense.title}`,
      };
      tx.objectStore(STORES.SETTINGS).put(updatedSettings);

      const ledgerEntry: CashLedgerEntry = {
        id: `cash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: !isCash ? 'cash_expense_reversal' : wasCash ? 'cash_expense_update' : 'cash_expense',
        previousBalance: prevCash,
        newBalance: nextCash,
        delta: cashDelta,
        note: !isCash
          ? `Payment method changed from Cash to ${updatedExpense.paymentMethod}: ${updatedExpense.title}`
          : wasCash
          ? `Adjusted Cash expense amount: ${updatedExpense.title}`
          : `Payment method changed to Cash: ${updatedExpense.title}`,
        expenseId: updatedExpense.id,
        timestamp: nowIso,
      };
      tx.objectStore(STORES.CASH_LEDGER).put(ledgerEntry);
    }

    // Ensure new date is marked as expenses_recorded
    tx.objectStore(STORES.DAILY_STATUSES).put({
      date: updatedExpense.date,
      status: 'expenses_recorded',
      updatedAt: nowIso,
    } satisfies DailyStatusRecord);

    // If date changed and old date now has zero expenses, revert old date to not_updated
    if (existing.date !== updatedExpense.date) {
      const remainingOnOldDate = allExpenses.filter(
        (e) => e.id !== existing.id && e.date === existing.date
      );
      if (remainingOnOldDate.length === 0) {
        tx.objectStore(STORES.DAILY_STATUSES).put({
          date: existing.date,
          status: 'not_updated',
          updatedAt: nowIso,
        } satisfies DailyStatusRecord);
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteExpenseRecord(expense: Expense, restoreCash: boolean = true): Promise<void> {
  const db = await openFinanceDB();
  const settings = (await getByKey<UserSettings>(db, STORES.SETTINGS, 'profile')) || createDefaultSettings();
  const allExpenses = await getAllFromStore<Expense>(db, STORES.EXPENSES);
  const nowIso = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORES.EXPENSES, STORES.SETTINGS, STORES.CASH_LEDGER, STORES.DAILY_STATUSES],
      'readwrite'
    );

    tx.objectStore(STORES.EXPENSES).delete(expense.id);

    if (expense.paymentMethod === 'Cash' && restoreCash) {
      const prevCash = settings.cashBalance;
      const nextCash = Math.round((prevCash + expense.amount) * 100) / 100;
      tx.objectStore(STORES.SETTINGS).put({
        ...settings,
        cashBalance: nextCash,
        cashLastUpdated: nowIso,
        cashLastNote: `Deleted cash expense: ${expense.title}`,
      } satisfies UserSettings);

      tx.objectStore(STORES.CASH_LEDGER).put({
        id: `cash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'cash_expense_reversal',
        previousBalance: prevCash,
        newBalance: nextCash,
        delta: expense.amount,
        note: `Restored from deleted cash expense: ${expense.title}`,
        expenseId: expense.id,
        timestamp: nowIso,
      } satisfies CashLedgerEntry);
    }

    const remainingOnDate = allExpenses.filter((e) => e.id !== expense.id && e.date === expense.date);
    if (remainingOnDate.length === 0) {
      tx.objectStore(STORES.DAILY_STATUSES).put({
        date: expense.date,
        status: 'not_updated',
        updatedAt: nowIso,
      } satisfies DailyStatusRecord);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateCashBalanceManual(params: {
  newBalance: number;
  note: string;
  mode: 'manual_edit' | 'reconciliation';
}): Promise<void> {
  const db = await openFinanceDB();
  const settings = (await getByKey<UserSettings>(db, STORES.SETTINGS, 'profile')) || createDefaultSettings();
  const nowIso = new Date().toISOString();

  const cleanNew = Math.round(Number(params.newBalance) * 100) / 100;
  const prevBalance = settings.cashBalance;
  const delta = Math.round((cleanNew - prevBalance) * 100) / 100;
  const cleanNote =
    params.note.trim() ||
    (params.mode === 'reconciliation' ? 'Manual physical cash reconciliation' : 'Manual cash balance update');

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.SETTINGS, STORES.CASH_LEDGER], 'readwrite');

    tx.objectStore(STORES.SETTINGS).put({
      ...settings,
      cashBalance: cleanNew,
      cashLastUpdated: nowIso,
      cashLastNote: cleanNote,
    } satisfies UserSettings);

    tx.objectStore(STORES.CASH_LEDGER).put({
      id: `cash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: params.mode,
      previousBalance: prevBalance,
      newBalance: cleanNew,
      delta,
      note: cleanNote,
      timestamp: nowIso,
    } satisfies CashLedgerEntry);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function setDailyStatusRecord(
  date: string,
  status: DailyStatusType,
  previousStatus?: DailyStatusType
): Promise<void> {
  const db = await openFinanceDB();
  const existing = await getByKey<DailyStatusRecord>(db, STORES.DAILY_STATUSES, date);
  const nowIso = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.DAILY_STATUSES, 'readwrite');
    tx.objectStore(STORES.DAILY_STATUSES).put({
      date,
      status,
      previousStatus: previousStatus ?? existing?.status ?? 'not_updated',
      updatedAt: nowIso,
    } satisfies DailyStatusRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveIdealBudgetRecord(item: IdealBudgetItem): Promise<void> {
  const db = await openFinanceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.IDEAL_BUDGETS, 'readwrite');
    tx.objectStore(STORES.IDEAL_BUDGETS).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteIdealBudgetRecord(id: string): Promise<void> {
  const db = await openFinanceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.IDEAL_BUDGETS, 'readwrite');
    tx.objectStore(STORES.IDEAL_BUDGETS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveRecurringExpenseRecord(item: RecurringExpense): Promise<void> {
  const db = await openFinanceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RECURRING, 'readwrite');
    tx.objectStore(STORES.RECURRING).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRecurringExpenseRecord(id: string): Promise<void> {
  const db = await openFinanceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RECURRING, 'readwrite');
    tx.objectStore(STORES.RECURRING).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function logRecurringExpenseOccurrence(
  item: RecurringExpense,
  dateToRecord: string
): Promise<void> {
  await addExpenseRecord({
    date: dateToRecord,
    time: getLocalNowTime(),
    title: item.title,
    category: item.category,
    amount: item.amount,
    paymentMethod: item.paymentMethod,
    notes: item.notes ? `${item.notes} (Recurring ${item.frequency})` : `Recurring ${item.frequency} expense`,
    recurringId: item.id,
  });

  const nextDue = advanceRecurringDate(item.nextDueDate, item.frequency);
  await saveRecurringExpenseRecord({
    ...item,
    lastRecordedDate: dateToRecord,
    nextDueDate: nextDue,
  });
}

export async function upsertReminderLogs(entries: ReminderLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openFinanceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.REMINDER_LOGS, 'readwrite');
    const store = tx.objectStore(STORES.REMINDER_LOGS);
    for (const entry of entries) {
      store.put(entry);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function exportFullBackup(): Promise<BackupPayload> {
  const data = await loadAllFinanceData();
  const exportedAt = new Date().toISOString();
  const updatedSettings: UserSettings = {
    ...data.settings,
    lastBackupAt: exportedAt,
  };
  await saveUserSettings(updatedSettings);

  return {
    schemaVersion: 1,
    exportedAt,
    app: 'LedgerFlow',
    settings: updatedSettings,
    expenses: data.expenses,
    cashLedger: data.cashLedger,
    idealBudgets: data.idealBudgets,
    dailyStatuses: Object.values(data.dailyStatuses),
    recurringExpenses: data.recurringExpenses,
    reminderLogs: data.reminderLogs,
  };
}

export async function importFullBackup(
  payload: BackupPayload,
  mode: 'replace' | 'merge' = 'replace'
): Promise<void> {
  const db = await openFinanceDB();
  const currentSettings =
    (await getByKey<UserSettings>(db, STORES.SETTINGS, 'profile')) || createDefaultSettings();

  return new Promise((resolve, reject) => {
    const allStores = [
      STORES.SETTINGS,
      STORES.EXPENSES,
      STORES.CASH_LEDGER,
      STORES.IDEAL_BUDGETS,
      STORES.DAILY_STATUSES,
      STORES.RECURRING,
      STORES.REMINDER_LOGS,
    ];
    const tx = db.transaction(allStores, 'readwrite');

    if (mode === 'replace') {
      for (const storeName of allStores) {
        tx.objectStore(storeName).clear();
      }
    }

    if (payload.settings) {
      const mergedCategories = Array.from(
        new Set([...(currentSettings.categories || []), ...(payload.settings.categories || DEFAULT_CATEGORIES)])
      );
      tx.objectStore(STORES.SETTINGS).put({
        ...createDefaultSettings(currentSettings.clientId),
        ...payload.settings,
        id: 'profile',
        clientId: currentSettings.clientId,
        categories: mode === 'merge' ? mergedCategories : payload.settings.categories || DEFAULT_CATEGORIES,
      } satisfies UserSettings);
    }

    for (const exp of payload.expenses || []) {
      tx.objectStore(STORES.EXPENSES).put(exp);
    }
    for (const entry of payload.cashLedger || []) {
      tx.objectStore(STORES.CASH_LEDGER).put(entry);
    }
    for (const item of payload.idealBudgets || []) {
      tx.objectStore(STORES.IDEAL_BUDGETS).put(item);
    }
    for (const st of payload.dailyStatuses || []) {
      tx.objectStore(STORES.DAILY_STATUSES).put(st);
    }
    for (const rec of payload.recurringExpenses || []) {
      tx.objectStore(STORES.RECURRING).put(rec);
    }
    for (const log of payload.reminderLogs || []) {
      tx.objectStore(STORES.REMINDER_LOGS).put(log);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function importCsvExpensesBatch(expenses: Expense[]): Promise<number> {
  if (expenses.length === 0) return 0;
  const db = await openFinanceDB();
  const settings = (await getByKey<UserSettings>(db, STORES.SETTINGS, 'profile')) || createDefaultSettings();

  const discoveredCategories = Array.from(
    new Set([...settings.categories, ...expenses.map((e) => e.category).filter(Boolean)])
  );

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.EXPENSES, STORES.DAILY_STATUSES, STORES.SETTINGS], 'readwrite');
    const expStore = tx.objectStore(STORES.EXPENSES);
    const statusStore = tx.objectStore(STORES.DAILY_STATUSES);
    const nowIso = new Date().toISOString();

    for (const exp of expenses) {
      expStore.put(exp);
      statusStore.put({
        date: exp.date,
        status: 'expenses_recorded',
        updatedAt: nowIso,
      } satisfies DailyStatusRecord);
    }

    tx.objectStore(STORES.SETTINGS).put({
      ...settings,
      categories: discoveredCategories,
    } satisfies UserSettings);

    tx.oncomplete = () => resolve(expenses.length);
    tx.onerror = () => reject(tx.error);
  });
}

export async function resetAllFinanceData(): Promise<UserSettings> {
  const db = await openFinanceDB();
  const existing = await getByKey<UserSettings>(db, STORES.SETTINGS, 'profile');
  const freshSettings = createDefaultSettings(existing?.clientId);
  // Preserve current theme preference for smooth visual continuity
  if (existing?.theme) {
    freshSettings.theme = existing.theme;
  }

  return new Promise((resolve, reject) => {
    const allStores = [
      STORES.SETTINGS,
      STORES.EXPENSES,
      STORES.CASH_LEDGER,
      STORES.IDEAL_BUDGETS,
      STORES.DAILY_STATUSES,
      STORES.RECURRING,
      STORES.REMINDER_LOGS,
    ];
    const tx = db.transaction(allStores, 'readwrite');
    for (const storeName of allStores) {
      tx.objectStore(storeName).clear();
    }
    tx.objectStore(STORES.SETTINGS).put(freshSettings);
    tx.oncomplete = () => resolve(freshSettings);
    tx.onerror = () => reject(tx.error);
  });
}

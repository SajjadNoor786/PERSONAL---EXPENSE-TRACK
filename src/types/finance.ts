export enum ActiveSection {
  Dashboard = 'dashboard',
  Expenses = 'expenses',
  IdealSheet = 'ideal_sheet',
  RemainingCash = 'remaining_cash',
  Reports = 'reports',
  Settings = 'settings',
}

export type CurrencyCode = 'PKR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SAR';

export type PaymentMethod =
  | 'Cash'
  | 'Bank Transfer'
  | 'Debit Card'
  | 'Credit Card'
  | 'Mobile Wallet'
  | 'Other';

export type DailyStatusType = 'not_updated' | 'expenses_recorded' | 'no_expenses_today';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

export const DEFAULT_CATEGORIES: string[] = [
  'Food',
  'Transport',
  'Fuel',
  'Shopping',
  'Bills',
  'Mobile and Internet',
  'Education',
  'Health',
  'Rent',
  'Family',
  'Entertainment',
  'Other',
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'Bank Transfer',
  'Debit Card',
  'Credit Card',
  'Mobile Wallet',
  'Other',
];

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  title: string;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string;
  recurringId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseInput {
  date: string;
  time: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string;
  recurringId?: string;
}

export type CashEventType =
  | 'manual_edit'
  | 'reconciliation'
  | 'cash_expense'
  | 'cash_expense_update'
  | 'cash_expense_reversal';

export interface CashLedgerEntry {
  id: string;
  type: CashEventType;
  previousBalance: number;
  newBalance: number;
  delta: number;
  note: string;
  expenseId?: string;
  timestamp: string;
}

export interface IdealBudgetItem {
  id: string;
  category: string;
  amount: number;
  period: BudgetPeriod;
  updatedAt: string;
}

export interface DailyStatusRecord {
  date: string; // YYYY-MM-DD (primary key)
  status: DailyStatusType;
  previousStatus?: DailyStatusType;
  updatedAt: string;
}

export interface RecurringExpense {
  id: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  frequency: RecurringFrequency;
  nextDueDate: string; // YYYY-MM-DD
  notes: string;
  active: boolean;
  lastRecordedDate?: string;
  createdAt: string;
}

export interface ReminderLogEntry {
  id: string;
  date: string;
  time: string;
  email: string;
  status: 'sent' | 'skipped_already_updated' | 'failed' | 'backend_unconfigured';
  message: string;
  timestamp: string;
}

export interface UserSettings {
  id: 'profile';
  clientId: string;
  userName: string;
  email: string;
  currency: CurrencyCode;
  monthlyBudget: number;
  cashBalance: number;
  cashLastUpdated: string | null;
  cashLastNote: string;
  reminderEnabled: boolean;
  reminderTime: string; // HH:mm
  timezone: string;
  categories: string[];
  theme: 'light' | 'dark';
  lastBackupAt: string | null;
}

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  app: 'LedgerFlow';
  settings: UserSettings;
  expenses: Expense[];
  cashLedger: CashLedgerEntry[];
  idealBudgets: IdealBudgetItem[];
  dailyStatuses: DailyStatusRecord[];
  recurringExpenses: RecurringExpense[];
  reminderLogs: ReminderLogEntry[];
}

export interface ReminderBackendStatus {
  configured: boolean;
  provider: string;
  fromEmail: string;
  schedulerActive: boolean;
  schedulerIntervalSeconds: number;
  serverTime: string;
  setupNote: string;
}

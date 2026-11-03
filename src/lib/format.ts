import type { BudgetPeriod, CurrencyCode, Expense, PaymentMethod } from '../types/finance';
import { PAYMENT_METHODS } from '../types/finance';

const CURRENCY_PREFIXES: Record<CurrencyCode, string> = {
  PKR: 'Rs. ',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
  SAR: 'SAR ',
};

export function getCurrencyPrefix(currency: CurrencyCode = 'PKR'): string {
  return CURRENCY_PREFIXES[currency] ?? 'Rs. ';
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'PKR'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const isNegative = safeAmount < 0;
  const abs = Math.abs(safeAmount);
  const hasDecimals = Math.abs(abs - Math.round(abs)) > 0.004;

  const formattedNumber = abs.toLocaleString('en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });

  const prefix = getCurrencyPrefix(currency);
  return isNegative ? `-${prefix}${formattedNumber}` : `${prefix}${formattedNumber}`;
}

export function getLocalTodayDate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalNowTime(d: Date = new Date()): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getCurrentYearMonth(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getDaysInMonth(yearMonth: string): number {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
}

export function getRemainingDaysInMonth(yearMonth: string, todayDate: string = getLocalTodayDate()): number {
  const currentYM = todayDate.slice(0, 7);
  const totalDays = getDaysInMonth(yearMonth);
  if (yearMonth < currentYM) return 0;
  if (yearMonth > currentYM) return totalDays;
  const currentDay = Number(todayDate.slice(8, 10)) || 1;
  // Include today in remaining days (minimum 1 on the last day of the month)
  return Math.max(1, totalDays - currentDay + 1);
}

export function normalizeIdealToMonthly(amount: number, period: BudgetPeriod, daysInMonth: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (period === 'daily') return Math.round(amount * daysInMonth);
  if (period === 'weekly') return Math.round(amount * (daysInMonth / 7));
  return amount;
}

export function shiftDateByDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalTodayDate(dt);
}

export function advanceRecurringDate(dateStr: string, frequency: 'daily' | 'weekly' | 'monthly'): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (frequency === 'daily') {
    dt.setDate(dt.getDate() + 1);
  } else if (frequency === 'weekly') {
    dt.setDate(dt.getDate() + 7);
  } else {
    dt.setMonth(dt.getMonth() + 1);
  }
  return getLocalTodayDate(dt);
}

export function formatDateReadable(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthReadable(yearMonth: string): string {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth || '—';
  const [y, m] = yearMonth.split('-').map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateTimeReadable(isoStr: string | null | undefined): string {
  if (!isoStr) return 'Never updated';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateExpenseId(dateStr: string): string {
  const compactDate = dateStr.replace(/-/g, '') || getLocalTodayDate().replace(/-/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `EXP-${compactDate}-${randomSuffix}`;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateExpensesCSV(expenses: Expense[]): string {
  const headers = [
    'Expense ID',
    'Date',
    'Time',
    'Expense Title',
    'Category',
    'Amount',
    'Payment Method',
    'Notes',
  ];
  const rows = expenses.map((exp) =>
    [
      exp.id,
      exp.date,
      exp.time,
      exp.title,
      exp.category,
      exp.amount,
      exp.paymentMethod,
      exp.notes,
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export function parseExpensesCSV(csvText: string): Expense[] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headerCols = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idxId = headerCols.findIndex((h) => h.includes('id'));
  const idxDate = headerCols.findIndex((h) => h === 'date');
  const idxTime = headerCols.findIndex((h) => h === 'time');
  const idxTitle = headerCols.findIndex((h) => h.includes('title') || h === 'description' || h === 'item');
  const idxCategory = headerCols.findIndex((h) => h.includes('category'));
  const idxAmount = headerCols.findIndex((h) => h.includes('amount'));
  const idxPayment = headerCols.findIndex((h) => h.includes('payment'));
  const idxNotes = headerCols.findIndex((h) => h.includes('note'));

  if (idxDate === -1 || idxTitle === -1 || idxAmount === -1) {
    throw new Error('CSV must contain at least Date, Expense Title, and Amount columns.');
  }

  const nowIso = new Date().toISOString();
  const parsed: Expense[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const rawDate = (cols[idxDate] || '').trim();
    const rawTitle = (cols[idxTitle] || '').trim();
    const rawAmount = Number(String(cols[idxAmount] || '').replace(/[^0-9.-]/g, ''));

    if (!rawTitle || !Number.isFinite(rawAmount) || rawAmount <= 0) continue;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getLocalTodayDate();
    const rawTime = idxTime >= 0 ? (cols[idxTime] || '').trim() : '';
    const validTime = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : '12:00';
    const rawPayment = idxPayment >= 0 ? (cols[idxPayment] || '').trim() : 'Cash';
    const validPayment: PaymentMethod = PAYMENT_METHODS.includes(rawPayment as PaymentMethod)
      ? (rawPayment as PaymentMethod)
      : 'Other';

    parsed.push({
      id: idxId >= 0 && cols[idxId]?.trim() ? cols[idxId].trim() : generateExpenseId(validDate),
      date: validDate,
      time: validTime,
      title: rawTitle,
      category: idxCategory >= 0 && cols[idxCategory]?.trim() ? cols[idxCategory].trim() : 'Other',
      amount: Math.round(rawAmount * 100) / 100,
      paymentMethod: validPayment,
      notes: idxNotes >= 0 ? (cols[idxNotes] || '').trim() : '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return parsed;
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

# LedgerFlow — Personal Expense Management System

A complete, local-first Personal Expense Management System with **IndexedDB** permanent browser storage, **Pakistani Rupee (PKR)** formatting, manual physical cash balance & reconciliation tracking, an **Ideal Expense Sheet** planner, interactive financial reports, and a **server-side scheduled daily email reminder engine**.

---

## Core Capabilities

1. **Permanent Local Storage (IndexedDB — Offline Ready)**
   - Stores all expenses, physical cash balances, cash reconciliation history, ideal category budgets, recurring expenses, daily statuses, and user settings permanently in `ledgerflow_personal_finance_db`.
   - Zero fake sample data and zero mandatory sign-up.
   - Includes **JSON Full Backup & Restore** (Replace or Merge), **CSV Export & Import**, and **Reset All Data** with confirmation.

2. **Daily Expense Ledger & Recurring Bills**
   - Add, edit, delete, search, and filter expenses by date, month, category, and payment method (`Cash`, `Bank Transfer`, `Debit Card`, `Credit Card`, `Mobile Wallet`, `Other`).
   - Quick inline entry directly on the Dashboard plus a global **Quick Expense** modal.
   - Recurring expense schedules for rent, internet, mobile packages, subscriptions, and bills.

3. **Remaining Budget & Manual Remaining Cash Reconciliation**
   - Automatically calculates `Remaining Budget = Monthly Budget - Monthly Expenses`, budget utilization percentage, budget threshold alerts (`50%`, `75%`, `90%`, `100%`), and safe daily spending allowance across remaining days of the month.
   - Dedicated **Remaining Cash** workspace: Cash expenses automatically deduct from physical cash, while bank/card/wallet digital payments never deduct from physical cash. Includes manual balance editing, physical wallet count reconciliation, and a permanent audit trail.

4. **Ideal Expense Sheet**
   - Configure **daily**, **weekly**, or **monthly** ideal budgets per category.
   - Automatically normalizes plans to monthly equivalents, flags exceeded categories (`Overspent by Rs. X`), displays remaining category amounts, tracks savings versus your ideal plan, and suggests daily category spending limits.

5. **"No Expenses Today" & Daily Email Reminder Engine**
   - Mark zero-spend days with `"No Expenses Today"` (with confirmation, undo support, and automatic transition to `Expenses Recorded` if an expense is logged later).
   - Server-side background scheduler (`server.ts`) evaluates active reminder subscriptions every 30 seconds in the user's local timezone and sends daily email notifications via **Resend** only when today's status is `Not Updated`, preventing duplicate daily emails.

6. **Daily, Weekly & Monthly Financial Reports**
   - Filter by presets or custom date ranges, inspect Category & Payment Method breakdowns, compare Budget vs. Actual statements, review Cash Balance History, export CSVs, download Monthly Summary statements, or print clean financial reports.

---

## Installation & Local Development

### Prerequisites
- Node.js 20+ (Node 22+ recommended)
- npm 9+

### Setup Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables (optional, required only for real email delivery):**
   Copy `.env.example` to `.env` and add your Resend credentials:
   ```env
   RESEND_API_KEY="re_your_resend_api_key"
   REMINDER_FROM_EMAIL="LedgerFlow Reminders <reminders@yourdomain.com>"
   APP_URL="http://localhost:3000"
   ```
   > **Note:** All expense tracking, cash management, budgets, reports, and offline IndexedDB features work immediately with zero environment keys. If `RESEND_API_KEY` is omitted, the Settings page clearly displays that server email delivery requires setup rather than showing fake sent notifications.

3. **Start the full-stack development server (port 3000):**
   ```bash
   npm run dev
   ```

---

## Email Reminder Backend Setup

Browser-only tabs cannot send emails while closed. LedgerFlow includes a built-in Node/Express server (`server.ts`) with an active background scheduler:

1. Create a free API key at [Resend](https://resend.com).
2. Verify your sender domain (or use `onboarding@resend.dev` to send to your own Resend account email during testing).
3. Add `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` to your server environment variables / Secrets panel.
4. Open **Settings → Daily Expense Email Reminder System**, enable reminders, enter your email address and preferred reminder time, and click **Save Reminder Configuration**.

---

## Production Build & Deployment

1. **Type-check and build the frontend bundle:**
   ```bash
   npm run lint
   npm run build
   ```

2. **Start the production server:**
   ```bash
   NODE_ENV=production npm start
   ```
   The Express server serves the compiled `dist/` SPA and runs `/api/reminders/*` plus the scheduled email reminder loop on port `3000`.

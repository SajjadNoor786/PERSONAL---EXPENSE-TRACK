import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, '.data');
const STORE_PATH = path.join(DATA_DIR, 'reminder-store.json');

export type DailyStatusValue = 'not_updated' | 'expenses_recorded' | 'no_expenses_today';

export interface ReminderSubscription {
  clientId: string;
  email: string;
  userName: string;
  enabled: boolean;
  reminderTime: string; // HH:mm (24h)
  timezone: string;
  syncedDate: string; // YYYY-MM-DD
  todayStatus: DailyStatusValue;
  lastSentDate: string | null;
  lastEvaluatedDate: string | null;
  updatedAt: string;
}

export interface ServerReminderLog {
  id: string;
  clientId: string;
  date: string;
  time: string;
  email: string;
  status: 'sent' | 'skipped_already_updated' | 'failed' | 'backend_unconfigured';
  message: string;
  timestamp: string;
}

interface ReminderStoreData {
  subscriptions: Record<string, ReminderSubscription>;
  logs: ServerReminderLog[];
}

const REMINDER_EMAIL_TEXT = `Hello,

You have not recorded today's expenses yet.

Please open your Expense Management System and update today's expenses.

If you did not spend any money today, please open the application and mark today's expenses as 'No Expenses Today'.

This will help keep your financial records accurate.

Thank you.`;

function isResendConfigured(): boolean {
  const key = (process.env.RESEND_API_KEY || '').trim();
  return key.length > 0 && key !== 'MY_RESEND_API_KEY';
}

function getFromEmail(): string {
  const configured = (process.env.REMINDER_FROM_EMAIL || '').trim();
  return configured || 'LedgerFlow Reminders <onboarding@resend.dev>';
}

function loadStore(): ReminderStoreData {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { subscriptions: {}, logs: [] };
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ReminderStoreData>;
    return {
      subscriptions: parsed.subscriptions || {},
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return { subscriptions: {}, logs: [] };
  }
}

function saveStore(data: ReminderStoreData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, STORE_PATH);
  } catch (err) {
    console.error('Failed to persist reminder store:', err);
  }
}

function getLocalDateAndTime(timezone: string): { date: string; time: string } {
  const safeTz = (() => {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return timezone;
    } catch {
      return 'Asia/Karachi';
    }
  })();

  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const year = dateParts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = dateParts.find((p) => p.type === 'month')?.value ?? '01';
  const day = dateParts.find((p) => p.type === 'day')?.value ?? '01';
  const hourRaw = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const hour = hourRaw === '24' ? '00' : hourRaw;
  const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

async function sendResendEmail(toEmail: string, subject: string, textBody: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!isResendConfigured()) {
    return {
      ok: false,
      error: 'Email service is not configured on the server (missing RESEND_API_KEY).',
    };
  }

  try {
    const htmlBody = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a;">Daily Expense Reminder</h2>
      ${textBody
        .split('\n\n')
        .map((p) => `<p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: #334155;">${p.replace(/\n/g, '<br/>')}</p>`)
        .join('')}
      ${
        process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? `<div style="margin-top: 24px;"><a href="${process.env.APP_URL}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 600;">Open LedgerFlow</a></div>`
          : ''
      }
    </div>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getFromEmail(),
        to: [toEmail],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!response.ok) {
      return {
        ok: false,
        error: payload.message || `Resend API returned HTTP ${response.status}`,
      };
    }

    return { ok: true, id: payload.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network failure while contacting email provider.',
    };
  }
}

function appendLog(store: ReminderStoreData, entry: ServerReminderLog): void {
  store.logs.unshift(entry);
  if (store.logs.length > 500) {
    store.logs = store.logs.slice(0, 500);
  }
}

let isRunningScheduler = false;

async function evaluateScheduledReminders(): Promise<void> {
  if (isRunningScheduler) return;
  isRunningScheduler = true;
  try {
    const store = loadStore();
    let mutated = false;

    for (const sub of Object.values(store.subscriptions)) {
      if (!sub.enabled || !sub.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sub.email)) {
        continue;
      }

      const { date: localDate, time: localTime } = getLocalDateAndTime(sub.timezone || 'Asia/Karachi');

      // Only trigger at or after the user's configured reminder time
      if (localTime < (sub.reminderTime || '21:00')) {
        continue;
      }

      // Prevent duplicate reminder emails on the same day
      if (sub.lastSentDate === localDate || sub.lastEvaluatedDate === localDate) {
        continue;
      }

      // Check whether today's expenses were recorded or marked as "No Expenses Today"
      const effectiveStatus: DailyStatusValue =
        sub.syncedDate === localDate ? sub.todayStatus : 'not_updated';

      if (effectiveStatus === 'expenses_recorded' || effectiveStatus === 'no_expenses_today') {
        sub.lastEvaluatedDate = localDate;
        appendLog(store, {
          id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          clientId: sub.clientId,
          date: localDate,
          time: localTime,
          email: sub.email,
          status: 'skipped_already_updated',
          message:
            effectiveStatus === 'no_expenses_today'
              ? 'Reminder skipped: Today is marked as "No Expenses Today".'
              : "Reminder skipped: Today's expenses are already recorded.",
          timestamp: new Date().toISOString(),
        });
        mutated = true;
        continue;
      }

      // Today's expenses are NOT recorded -> attempt to send email
      if (!isResendConfigured()) {
        sub.lastEvaluatedDate = localDate;
        appendLog(store, {
          id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          clientId: sub.clientId,
          date: localDate,
          time: localTime,
          email: sub.email,
          status: 'backend_unconfigured',
          message:
            'Scheduled check ran (expenses not recorded), but email delivery requires RESEND_API_KEY on the server.',
          timestamp: new Date().toISOString(),
        });
        mutated = true;
        continue;
      }

      const sendResult = await sendResendEmail(
        sub.email,
        "Daily Expense Reminder — You haven't recorded today's expenses yet",
        REMINDER_EMAIL_TEXT
      );

      sub.lastEvaluatedDate = localDate;
      if (sendResult.ok) {
        sub.lastSentDate = localDate;
        appendLog(store, {
          id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          clientId: sub.clientId,
          date: localDate,
          time: localTime,
          email: sub.email,
          status: 'sent',
          message: `Daily reminder email sent to ${sub.email}${sendResult.id ? ` (ID: ${sendResult.id})` : ''}.`,
          timestamp: new Date().toISOString(),
        });
      } else {
        appendLog(store, {
          id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          clientId: sub.clientId,
          date: localDate,
          time: localTime,
          email: sub.email,
          status: 'failed',
          message: `Delivery failed: ${sendResult.error || 'Unknown provider error'}`,
          timestamp: new Date().toISOString(),
        });
      }
      mutated = true;
    }

    if (mutated) {
      saveStore(store);
    }
  } finally {
    isRunningScheduler = false;
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/reminders/config-status', (_req: Request, res: Response) => {
    const configured = isResendConfigured();
    res.json({
      configured,
      provider: configured ? 'Resend Email API' : 'Not Configured',
      fromEmail: getFromEmail(),
      schedulerActive: true,
      schedulerIntervalSeconds: 30,
      serverTime: new Date().toISOString(),
      setupNote: configured
        ? 'Server-side scheduled email delivery is active.'
        : 'Email reminders require RESEND_API_KEY (and optional REMINDER_FROM_EMAIL) configured in server environment variables.',
    });
  });

  app.post('/api/reminders/sync', (req: Request, res: Response) => {
    const body = req.body as Partial<ReminderSubscription>;
    const clientId = String(body.clientId || '').trim();
    if (!clientId) {
      res.status(400).json({ error: 'clientId is required' });
      return;
    }

    const store = loadStore();
    const existing = store.subscriptions[clientId];
    const syncedDate = String(body.syncedDate || '').trim();
    const todayStatus: DailyStatusValue =
      body.todayStatus === 'expenses_recorded' || body.todayStatus === 'no_expenses_today'
        ? body.todayStatus
        : 'not_updated';
    const newReminderTime = String(body.reminderTime || existing?.reminderTime || '21:00').trim();

    // If user changed reminder time or reverted status to not_updated BEFORE an email was actually sent today,
    // allow the scheduler to evaluate again at the new time. Never clear lastSentDate so duplicate emails cannot happen.
    let lastEvaluatedDate = existing?.lastEvaluatedDate ?? null;
    if (
      existing &&
      existing.lastSentDate !== syncedDate &&
      (todayStatus === 'not_updated' || existing.reminderTime !== newReminderTime)
    ) {
      lastEvaluatedDate = null;
    }

    const updated: ReminderSubscription = {
      clientId,
      email: String(body.email ?? existing?.email ?? '').trim(),
      userName: String(body.userName ?? existing?.userName ?? '').trim(),
      enabled: Boolean(body.enabled ?? existing?.enabled ?? false),
      reminderTime: newReminderTime,
      timezone: String(body.timezone || existing?.timezone || 'Asia/Karachi').trim(),
      syncedDate: syncedDate || existing?.syncedDate || '',
      todayStatus,
      lastSentDate: existing?.lastSentDate ?? null,
      lastEvaluatedDate,
      updatedAt: new Date().toISOString(),
    };

    store.subscriptions[clientId] = updated;
    saveStore(store);

    const clientLogs = store.logs.filter((l) => l.clientId === clientId).slice(0, 50);
    res.json({
      ok: true,
      configured: isResendConfigured(),
      subscription: updated,
      history: clientLogs,
    });
  });

  app.get('/api/reminders/history', (req: Request, res: Response) => {
    const clientId = String(req.query.clientId || '').trim();
    if (!clientId) {
      res.json({ history: [], subscription: null, configured: isResendConfigured() });
      return;
    }
    const store = loadStore();
    const clientLogs = store.logs.filter((l) => l.clientId === clientId).slice(0, 50);
    res.json({
      configured: isResendConfigured(),
      subscription: store.subscriptions[clientId] || null,
      history: clientLogs,
    });
  });

  app.post('/api/reminders/test', async (req: Request, res: Response) => {
    const { clientId, email, timezone } = req.body as {
      clientId?: string;
      email?: string;
      timezone?: string;
    };

    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ ok: false, error: 'Please enter a valid email address first.' });
      return;
    }

    const { date: localDate, time: localTime } = getLocalDateAndTime(timezone || 'Asia/Karachi');
    const store = loadStore();
    const cid = String(clientId || 'manual').trim();

    if (!isResendConfigured()) {
      const logEntry: ServerReminderLog = {
        id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        clientId: cid,
        date: localDate,
        time: localTime,
        email: cleanEmail,
        status: 'backend_unconfigured',
        message:
          'Verification check failed: Email backend is not configured. Add RESEND_API_KEY in server secrets to send emails.',
        timestamp: new Date().toISOString(),
      };
      appendLog(store, logEntry);
      saveStore(store);

      res.status(503).json({
        ok: false,
        configured: false,
        error:
          'Email reminders require backend setup: RESEND_API_KEY is not configured in server environment variables. No email was sent.',
        logEntry,
      });
      return;
    }

    const result = await sendResendEmail(
      cleanEmail,
      "Daily Expense Reminder — Verification from LedgerFlow",
      REMINDER_EMAIL_TEXT
    );

    const logEntry: ServerReminderLog = {
      id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      clientId: cid,
      date: localDate,
      time: localTime,
      email: cleanEmail,
      status: result.ok ? 'sent' : 'failed',
      message: result.ok
        ? `Verification reminder email sent to ${cleanEmail}${result.id ? ` (ID: ${result.id})` : ''}.`
        : `Failed to send email: ${result.error || 'Unknown error'}`,
      timestamp: new Date().toISOString(),
    };

    appendLog(store, logEntry);
    saveStore(store);

    if (!result.ok) {
      res.status(502).json({
        ok: false,
        configured: true,
        error: result.error || 'Failed to send email via Resend.',
        logEntry,
      });
      return;
    }

    res.json({
      ok: true,
      configured: true,
      message: `Real reminder email delivered to ${cleanEmail}.`,
      logEntry,
    });
  });

  app.delete('/api/reminders/subscription', (req: Request, res: Response) => {
    const clientId = String(req.query.clientId || '').trim();
    if (clientId) {
      const store = loadStore();
      delete store.subscriptions[clientId];
      store.logs = store.logs.filter((l) => l.clientId !== clientId);
      saveStore(store);
    }
    res.json({ ok: true });
  });

  // Start server-side scheduled reminder job (every 30 seconds)
  setInterval(() => {
    void evaluateScheduledReminders();
  }, 30_000);
  setTimeout(() => {
    void evaluateScheduledReminders();
  }, 5_000);

  const distPath = path.join(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LedgerFlow server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

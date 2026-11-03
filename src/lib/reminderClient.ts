import type {
  DailyStatusType,
  ReminderBackendStatus,
  ReminderLogEntry,
  UserSettings,
} from '../types/finance';

export async function fetchReminderBackendStatus(): Promise<ReminderBackendStatus | null> {
  try {
    const res = await fetch('/api/reminders/config-status');
    if (!res.ok) return null;
    return (await res.json()) as ReminderBackendStatus;
  } catch {
    return null;
  }
}

export async function syncReminderSubscription(
  settings: UserSettings,
  todayDate: string,
  todayStatus: DailyStatusType
): Promise<{ configured: boolean; history: ReminderLogEntry[] } | null> {
  try {
    const res = await fetch('/api/reminders/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: settings.clientId,
        email: settings.email,
        userName: settings.userName,
        enabled: settings.reminderEnabled,
        reminderTime: settings.reminderTime,
        timezone: settings.timezone,
        syncedDate: todayDate,
        todayStatus,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      configured: boolean;
      history: ReminderLogEntry[];
    };
    return data;
  } catch {
    return null;
  }
}

export async function sendTestReminderRequest(params: {
  clientId: string;
  email: string;
  timezone: string;
}): Promise<{
  ok: boolean;
  configured: boolean;
  message?: string;
  error?: string;
  logEntry?: ReminderLogEntry;
}> {
  try {
    const res = await fetch('/api/reminders/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as {
      ok: boolean;
      configured: boolean;
      message?: string;
      error?: string;
      logEntry?: ReminderLogEntry;
    };
    return data;
  } catch {
    return {
      ok: false,
      configured: false,
      error: 'Unable to reach reminder backend server. Check your connection.',
    };
  }
}

export async function deleteServerReminderSubscription(clientId: string): Promise<void> {
  try {
    await fetch(`/api/reminders/subscription?clientId=${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    });
  } catch {
    // Ignore offline errors during local reset
  }
}

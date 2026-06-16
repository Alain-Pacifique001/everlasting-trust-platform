import { supabase } from '@/integrations/supabase/client';
import type { UserNotifications } from '@/contexts/PreferencesContext';

export type NotificationCategory = 'price_alert' | 'budget' | 'goal' | 'info';

const CATEGORY_TO_PREF: Record<NotificationCategory, keyof UserNotifications | null> = {
  price_alert: 'marketAlerts',
  budget: 'budgetWarnings',
  goal: 'goalReminders',
  info: null,
};

interface SendArgs {
  userId: string;
  title: string;
  message: string;
  type?: NotificationCategory;
  link?: string | null;
  prefs: UserNotifications;
}

/** Request browser push permission. Returns the resulting permission state. */
export const requestPushPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return await Notification.requestPermission();
};

/**
 * Send a notification to the user, respecting their channel preferences.
 *  - In-app row is inserted only if the relevant category toggle is on.
 *  - Browser push is fired only if `pushNotifications` is on AND permission granted.
 */
export const sendNotification = async ({ userId, title, message, type = 'info', link = null, prefs }: SendArgs) => {
  const prefKey = CATEGORY_TO_PREF[type];
  const categoryEnabled = prefKey ? prefs[prefKey] : true;

  if (categoryEnabled) {
    await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      link,
    });
  }

  if (prefs.pushNotifications && categoryEnabled && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body: message, tag: type });
    } catch {
      /* no-op */
    }
  }

  return { delivered: categoryEnabled };
};

/** Subscribe to live changes to the browser Notification permission. Returns an unsubscribe fn. */
export const watchNotificationPermission = (
  callback: (state: NotificationPermission | 'unsupported') => void,
): (() => void) => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    callback('unsupported');
    return () => {};
  }

  callback(Notification.permission);

  let cleanups: Array<() => void> = [];

  // Permissions API: most reliable cross-tab signal
  if ('permissions' in navigator) {
    (navigator as any).permissions
      .query({ name: 'notifications' as PermissionName })
      .then((status: PermissionStatus) => {
        const handler = () => callback(status.state as NotificationPermission);
        status.addEventListener('change', handler);
        cleanups.push(() => status.removeEventListener('change', handler));
      })
      .catch(() => { /* not supported */ });
  }

  // Fallback: re-check on focus / visibility change (covers OS-level toggles)
  const recheck = () => callback(Notification.permission);
  window.addEventListener('focus', recheck);
  document.addEventListener('visibilitychange', recheck);
  cleanups.push(() => window.removeEventListener('focus', recheck));
  cleanups.push(() => document.removeEventListener('visibilitychange', recheck));

  return () => cleanups.forEach((fn) => fn());
};

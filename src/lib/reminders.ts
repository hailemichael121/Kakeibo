import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { AppSettings } from '../db/db'

const NOTIF_MIDDAY = 1001
const NOTIF_NIGHT = 1002
const NOTIF_WEEKLY = 1003

export type ReminderRoute = 'add' | 'report'

export interface DesktopReminderOptions {
  enabled: boolean
  middayTime: string
  nightTime: string
  weeklyEnabled: boolean
  weeklyDay: number
}

function parseTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10))
  return {
    hour: Number.isFinite(h) && h >= 0 && h <= 23 ? h : 12,
    minute: Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0,
  }
}

export function nextDailyTime(now: Date, hhmm: string): Date {
  const { hour, minute } = parseTime(hhmm)
  const at = new Date(now)
  at.setHours(hour, minute, 0, 0)
  if (at <= now) at.setDate(at.getDate() + 1)
  return at
}

export function nextWeeklyTime(now: Date, day: number, hour = 19, minute = 0): Date {
  const at = new Date(now)
  at.setHours(hour, minute, 0, 0)
  const target = ((day % 7) + 7) % 7
  const diff = ((target - at.getDay()) % 7 + 7) % 7
  at.setDate(at.getDate() + diff)
  if (diff === 0 && at <= now) at.setDate(at.getDate() + 7)
  return at
}

export async function ensureReminderPermissions() {
  if (!Capacitor.isNativePlatform()) return true
  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display === 'granted') return true
    const req = await LocalNotifications.requestPermissions()
    return req.display === 'granted'
  } catch {
    return false
  }
}

export async function cancelKakeiboReminders() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: NOTIF_MIDDAY }, { id: NOTIF_NIGHT }, { id: NOTIF_WEEKLY }] })
    } catch {
      // The notification plugin may not be available in a plain browser.
    }
  }
  try {
    await window.kakeibo?.remindersCancel?.()
  } catch {
    // Desktop reminders are best-effort.
  }
}

export async function scheduleKakeiboReminders(settings: AppSettings) {
  const enabled = settings.remindersEnabled ?? true
  const middayTime = settings.reminderMiddayTime || '12:00'
  const nightTime = settings.reminderNightTime || '21:00'
  const weeklyEnabled = settings.reminderWeeklyEnabled ?? true
  const weeklyDay = settings.reminderWeeklyDay ?? 0

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: NOTIF_MIDDAY }, { id: NOTIF_NIGHT }, { id: NOTIF_WEEKLY }] })
      if (enabled) {
        const ok = await ensureReminderPermissions()
        if (ok) {
          const now = new Date()
          const night = parseTime(nightTime)
          const atMidday = nextDailyTime(now, middayTime)
          const atNight = nextDailyTime(now, nightTime)
          const notifications: LocalNotificationSchema[] = [
            {
              id: NOTIF_MIDDAY,
              title: 'Kakeibo · Midday pause',
              body: 'Take a moment to log any purchases so far today.',
              schedule: { at: atMidday, repeats: true, every: 'day', allowWhileIdle: true },
              extra: { route: 'add' },
            },
            {
              id: NOTIF_NIGHT,
              title: 'Kakeibo · End-of-day check-in',
              body: 'Register today’s spending and reflect gently.',
              schedule: { at: atNight, repeats: true, every: 'day', allowWhileIdle: true },
              extra: { route: 'add' },
            },
          ]
          if (weeklyEnabled) {
            notifications.push({
              id: NOTIF_WEEKLY,
              title: 'Kakeibo · Weekly report',
              body: 'Review your week’s spending and set intentions for next week.',
              schedule: { at: nextWeeklyTime(now, weeklyDay, night.hour, night.minute), repeats: true, every: 'week', allowWhileIdle: true },
              extra: { route: 'report' },
            })
          }
          await LocalNotifications.schedule({ notifications })
        }
      }
    } catch {
      // Notifications are optional; the app still works when permission is denied.
    }
  }

  const desktop = window.kakeibo?.remindersSchedule
  if (desktop) {
    const options: DesktopReminderOptions = { enabled, middayTime, nightTime, weeklyEnabled, weeklyDay }
    try {
      await desktop(options)
    } catch {
      // Desktop reminders are best-effort.
    }
  }
}

export function onReminderTap(handler: (route: ReminderRoute) => void): () => void {
  const cleanups: Array<() => void> = []

  if (Capacitor.isNativePlatform()) {
    void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const extra = event.notification?.extra as { route?: string } | undefined
      if (extra?.route === 'add' || extra?.route === 'report') handler(extra.route)
    }).then((handle) => {
      cleanups.push(() => { void handle.remove() })
    }).catch(() => {
      // Ignore notification listener failures on unsupported platforms.
    })
  }

  const subscribe = window.kakeibo?.onReminderRoute
  if (subscribe) {
    cleanups.push(subscribe((route) => {
      if (route === 'add' || route === 'report') handler(route)
    }))
  }

  return () => { for (const cleanup of cleanups) cleanup() }
}

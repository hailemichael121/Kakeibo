import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { AppSettings } from '../db/db'

const NOTIF_MIDDAY = 1001
const NOTIF_NIGHT = 1002
const NOTIF_WEEKLY = 1003

function parseTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10))
  return { hour: Number.isFinite(h) ? h : 12, minute: Number.isFinite(m) ? m : 0 }
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

export async function scheduleKakeiboReminders(settings: AppSettings) {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_MIDDAY }, { id: NOTIF_NIGHT }, { id: NOTIF_WEEKLY }] })
    if (!settings.remindersEnabled) return
    const ok = await ensureReminderPermissions()
    if (!ok) return

    const now = new Date()
    const midday = parseTime(settings.reminderMiddayTime || '12:00')
    const night = parseTime(settings.reminderNightTime || '21:00')

    // Midday
    const atMidday = new Date(now)
    atMidday.setHours(midday.hour, midday.minute, 0, 0)
    if (atMidday <= now) atMidday.setDate(atMidday.getDate() + 1)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_MIDDAY,
          title: 'Kakeibo · Midday pause',
          body: 'Take a moment to log any purchases so far today.',
          schedule: { at: atMidday, repeats: true, every: 'day' },
        },
      ],
    })

    // Night
    const atNight = new Date(now)
    atNight.setHours(night.hour, night.minute, 0, 0)
    if (atNight <= now) atNight.setDate(atNight.getDate() + 1)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_NIGHT,
          title: 'Kakeibo · End-of-day check-in',
          body: 'Register today’s spending and reflect gently.',
          schedule: { at: atNight, repeats: true, every: 'day' },
        },
      ],
    })

    if (settings.reminderWeeklyEnabled) {
      const weeklyDay = settings.reminderWeeklyDay ?? 0 // 0 Sun
      const atWeekly = new Date(now)
      atWeekly.setHours(19, 0, 0, 0)
      const diff = ((weeklyDay - atWeekly.getDay()) % 7 + 7) % 7
      atWeekly.setDate(atWeekly.getDate() + diff)
      if (diff === 0 && atWeekly <= now) atWeekly.setDate(atWeekly.getDate() + 7)
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIF_WEEKLY,
            title: 'Kakeibo · Weekly report',
            body: 'Review your week’s spending and set intentions for next week.',
            schedule: { at: atWeekly, repeats: true, every: 'week' },
          },
        ],
      })
    }
  } catch (e) {
    // ignore
  }
}

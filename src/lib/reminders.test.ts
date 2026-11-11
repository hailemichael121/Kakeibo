import { describe, expect, it } from 'vitest'
import { nextDailyTime, nextWeeklyTime } from './reminders'

describe('reminder scheduling', () => {
  it('schedules the next daily reminder later today', () => {
    const now = new Date(2026, 0, 10, 8, 30, 0)
    expect(nextDailyTime(now, '12:00').getTime()).toBe(new Date(2026, 0, 10, 12, 0, 0).getTime())
  })

  it('rolls a daily reminder to tomorrow once its time has passed', () => {
    const now = new Date(2026, 0, 10, 13, 0, 0)
    expect(nextDailyTime(now, '12:00').getTime()).toBe(new Date(2026, 0, 11, 12, 0, 0).getTime())
  })

  it('falls back to a safe time when the setting is malformed', () => {
    const now = new Date(2026, 0, 10, 8, 0, 0)
    expect(nextDailyTime(now, 'not-a-time').getTime()).toBe(new Date(2026, 0, 10, 12, 0, 0).getTime())
  })

  it('schedules the next weekly reminder on the requested day', () => {
    const saturday = new Date(2026, 0, 10, 10, 0, 0)
    expect(nextWeeklyTime(saturday, 0, 19, 0).getTime()).toBe(new Date(2026, 0, 11, 19, 0, 0).getTime())
  })

  it('keeps a weekly reminder later the same day', () => {
    const sundayMorning = new Date(2026, 0, 11, 9, 0, 0)
    expect(nextWeeklyTime(sundayMorning, 0, 19, 0).getTime()).toBe(new Date(2026, 0, 11, 19, 0, 0).getTime())
  })

  it('rolls a weekly reminder forward a full week after its time', () => {
    const sundayNight = new Date(2026, 0, 11, 20, 0, 0)
    expect(nextWeeklyTime(sundayNight, 0, 19, 0).getTime()).toBe(new Date(2026, 0, 18, 19, 0, 0).getTime())
  })
})

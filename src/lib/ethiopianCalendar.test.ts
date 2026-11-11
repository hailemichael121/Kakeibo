import { describe, expect, it } from 'vitest'
import { ethiopianMonthLength, ethiopianToGregorian, gregorianToEthiopian } from './ethiopianCalendar'

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

describe('Ethiopian calendar conversion', () => {
  it('maps Ethiopian new year to the correct Gregorian date', () => {
    expect(dateKey(ethiopianToGregorian(2016, 1, 1))).toBe('2023-09-12')
    expect(dateKey(ethiopianToGregorian(2017, 1, 1))).toBe('2024-09-11')
    expect(dateKey(ethiopianToGregorian(2019, 1, 1))).toBe('2026-09-11')
  })

  it('converts Gregorian dates into Ethiopian dates', () => {
    expect(gregorianToEthiopian(new Date(2026, 10, 11, 12))).toEqual({ year: 2019, month: 3, day: 2 })
    expect(gregorianToEthiopian(new Date(2023, 8, 11, 12))).toEqual({ year: 2015, month: 13, day: 6 })
  })

  it('knows the length of regular months and Pagume', () => {
    expect(ethiopianMonthLength(2019, 1)).toBe(30)
    expect(ethiopianMonthLength(2015, 13)).toBe(6)
    expect(ethiopianMonthLength(2016, 13)).toBe(5)
  })

  it('round-trips dates across leap boundaries', () => {
    for (let offset = 0; offset < 900; offset += 1) {
      const date = new Date(2023, 8, 1 + offset, 12)
      const ethiopian = gregorianToEthiopian(date)
      expect(dateKey(ethiopianToGregorian(ethiopian.year, ethiopian.month, ethiopian.day))).toBe(dateKey(date))
    }
  })
})

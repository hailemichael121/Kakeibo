export type CalendarSystem = 'gregorian' | 'ethiopian'
export type CalendarLanguage = 'en' | 'am'

export interface EthiopianDate {
  year: number
  month: number
  day: number
}

const ETHIOPIAN_EPOCH_JDN = 1724221
const UNIX_EPOCH_JDN = 2440588
const DAY_MS = 86_400_000

export const ETHIOPIAN_MONTHS: Record<CalendarLanguage, readonly string[]> = {
  en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
  am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'],
}

export const ETHIOPIAN_WEEKDAYS: Record<CalendarLanguage, readonly string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  am: ['እሁድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'],
}

export const ETHIOPIAN_WEEKDAYS_LONG: Record<CalendarLanguage, readonly string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  am: ['እሁድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'],
}

export function ethiopianMonthLength(year: number, month: number): number {
  if (month === 13) return year % 4 === 3 ? 6 : 5
  return 30
}

export function ethiopianToJdn(year: number, month: number, day: number): number {
  return ETHIOPIAN_EPOCH_JDN + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + (day - 1)
}

export function jdnToEthiopian(jdn: number): EthiopianDate {
  let year = Math.floor((jdn - ETHIOPIAN_EPOCH_JDN) / 365.25) + 1
  while (ethiopianToJdn(year + 1, 1, 1) <= jdn) year += 1
  while (ethiopianToJdn(year, 1, 1) > jdn) year -= 1
  const dayOfYear = jdn - ethiopianToJdn(year, 1, 1)
  return { year, month: Math.floor(dayOfYear / 30) + 1, day: (dayOfYear % 30) + 1 }
}

export function gregorianToJdn(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) / DAY_MS) + UNIX_EPOCH_JDN
}

export function jdnToGregorian(jdn: number): Date {
  const utc = new Date(Date.UTC(1970, 0, 1, 12) + (jdn - UNIX_EPOCH_JDN) * DAY_MS)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12)
}

export function gregorianToEthiopian(date: Date): EthiopianDate {
  return jdnToEthiopian(gregorianToJdn(date))
}

export function ethiopianToGregorian(year: number, month: number, day: number): Date {
  return jdnToGregorian(ethiopianToJdn(year, month, day))
}

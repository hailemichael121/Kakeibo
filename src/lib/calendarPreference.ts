import { useSyncExternalStore } from 'react'
import type { CalendarLanguage, CalendarSystem } from './ethiopianCalendar'

export interface CalendarPreference {
  system: CalendarSystem
  language: CalendarLanguage
}

const STORAGE_KEY = 'kakeibo.calendar-preference'
const DEFAULT_PREFERENCE: CalendarPreference = { system: 'gregorian', language: 'en' }
const listeners = new Set<() => void>()
let cached: CalendarPreference | null = null

function isSystem(value: unknown): value is CalendarSystem {
  return value === 'gregorian' || value === 'ethiopian'
}

function isLanguage(value: unknown): value is CalendarLanguage {
  return value === 'en' || value === 'am'
}

function read(): CalendarPreference {
  if (cached) return cached
  if (typeof window === 'undefined') return DEFAULT_PREFERENCE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CalendarPreference>
      cached = {
        system: isSystem(parsed.system) ? parsed.system : DEFAULT_PREFERENCE.system,
        language: isLanguage(parsed.language) ? parsed.language : DEFAULT_PREFERENCE.language,
      }
    } else {
      cached = DEFAULT_PREFERENCE
    }
  } catch {
    cached = DEFAULT_PREFERENCE
  }
  return cached
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setCalendarPreference(patch: Partial<CalendarPreference>) {
  const next = { ...read(), ...patch }
  cached = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    cached = next
  }
  for (const listener of listeners) listener()
}

export function useCalendarPreference(): CalendarPreference {
  return useSyncExternalStore(subscribe, read, read)
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { setCalendarPreference, useCalendarPreference } from '@/lib/calendarPreference'
import {
  ETHIOPIAN_MONTHS,
  ETHIOPIAN_WEEKDAYS,
  ETHIOPIAN_WEEKDAYS_LONG,
  ethiopianMonthLength,
  ethiopianToGregorian,
  gregorianToEthiopian,
  type CalendarLanguage,
  type CalendarSystem,
} from '@/lib/ethiopianCalendar'

interface CalendarCell {
  key: string
  label: number
  date: Date
}

interface CalendarView {
  year: number
  month: number
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1, 12)
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function viewForDate(value: string, system: CalendarSystem): CalendarView {
  const date = parseDateKey(value)
  if (system === 'ethiopian') {
    const ethiopian = gregorianToEthiopian(date)
    return { year: ethiopian.year, month: ethiopian.month }
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

function shiftView(view: CalendarView, amount: number, system: CalendarSystem): CalendarView {
  if (system === 'gregorian') {
    const next = new Date(view.year, view.month - 1 + amount, 1, 12)
    return { year: next.getFullYear(), month: next.getMonth() + 1 }
  }
  let year = view.year
  let month = view.month + amount
  while (month > 13) { month -= 13; year += 1 }
  while (month < 1) { month += 13; year -= 1 }
  return { year, month }
}

export function DatePicker({ value, onChange, label = 'Choose date', disabled }: {
  value: string
  onChange: (value: string) => void
  label?: string
  disabled?: boolean
}) {
  const preference = useCalendarPreference()
  const system = preference.system
  const language = preference.language
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => viewForDate(value, system))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setView(viewForDate(value, system))
  }, [value, system])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const cells = useMemo<(CalendarCell | null)[]>(() => {
    if (system === 'gregorian') {
      const first = new Date(view.year, view.month - 1, 1, 12)
      const offset = first.getDay()
      const count = new Date(view.year, view.month, 0, 12).getDate()
      const result: (CalendarCell | null)[] = Array.from({ length: offset }, () => null)
      for (let day = 1; day <= count; day += 1) {
        const date = new Date(view.year, view.month - 1, day, 12)
        result.push({ key: dateKey(date), label: day, date })
      }
      return result
    }
    const first = ethiopianToGregorian(view.year, view.month, 1)
    const offset = first.getDay()
    const count = ethiopianMonthLength(view.year, view.month)
    const result: (CalendarCell | null)[] = Array.from({ length: offset }, () => null)
    for (let day = 1; day <= count; day += 1) {
      const date = ethiopianToGregorian(view.year, view.month, day)
      result.push({ key: dateKey(date), label: day, date })
    }
    return result
  }, [system, view])

  const selectedDate = parseDateKey(value)
  const ethiopianSelected = gregorianToEthiopian(selectedDate)
  const selected = dateKey(selectedDate)
  const today = dateKey(new Date())
  const monthTitle = system === 'gregorian'
    ? new Date(view.year, view.month - 1, 1, 12).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : `${ETHIOPIAN_MONTHS[language][view.month - 1]} ${view.year} ${language === 'am' ? 'ዓ.ም.' : 'E.C.'}`
  const display = system === 'gregorian'
    ? selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : `${ETHIOPIAN_WEEKDAYS[language][selectedDate.getDay()]}, ${ETHIOPIAN_MONTHS[language][ethiopianSelected.month - 1]} ${ethiopianSelected.day}, ${ethiopianSelected.year}`
  const weekdays = system === 'gregorian' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ETHIOPIAN_WEEKDAYS[language]
  const ethiopianLabels = system === 'ethiopian'

  function chooseSystem(next: CalendarSystem) {
    if (next === system) return
    setView(viewForDate(value, next))
    setCalendarPreference({ system: next })
  }

  function chooseLanguage(next: CalendarLanguage) {
    if (next === language) return
    setCalendarPreference({ language: next })
  }

  function dayAria(cell: CalendarCell): string {
    if (system === 'ethiopian') {
      const ethiopian = gregorianToEthiopian(cell.date)
      return `${ETHIOPIAN_WEEKDAYS_LONG[language][cell.date.getDay()]}, ${ETHIOPIAN_MONTHS[language][ethiopian.month - 1]} ${ethiopian.day}, ${ethiopian.year}`
    }
    return cell.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  }

  return <div className="date-picker" ref={ref}>
    <button type="button" className="date-picker-trigger" aria-label={`${label}: ${display}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <CalendarDays size={15} />
      <span>{display}</span>
    </button>
    {open && <div className="date-picker-popover liquid-glass" role="dialog" aria-label={label}>
      <div className="date-picker-modes">
        <div className="date-picker-segment" role="group" aria-label="Calendar system">
          <button type="button" aria-pressed={system === 'gregorian'} onClick={() => chooseSystem('gregorian')}>Gregorian</button>
          <button type="button" aria-pressed={system === 'ethiopian'} onClick={() => chooseSystem('ethiopian')}>Ethiopian</button>
        </div>
        {ethiopianLabels && <div className="date-picker-segment" role="group" aria-label="Ethiopian calendar day names">
          <button type="button" aria-pressed={language === 'en'} onClick={() => chooseLanguage('en')}>English</button>
          <button type="button" aria-pressed={language === 'am'} lang="am" onClick={() => chooseLanguage('am')}>አማርኛ</button>
        </div>}
      </div>
      <header className="date-picker-head">
        <button type="button" className="icon-button" aria-label="Previous month" onClick={() => setView((current) => shiftView(current, -1, system))}><ChevronLeft size={16} /></button>
        <b lang={ethiopianLabels ? language : undefined}>{monthTitle}</b>
        <button type="button" className="icon-button" aria-label="Next month" onClick={() => setView((current) => shiftView(current, 1, system))}><ChevronRight size={16} /></button>
      </header>
      <div className={`date-picker-weekdays ${ethiopianLabels ? 'ethiopian' : ''}`} aria-hidden="true" lang={ethiopianLabels ? language : undefined}>{weekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="date-picker-grid">
        {cells.map((cell, index) => cell
          ? <button
              type="button"
              key={cell.key}
              className={`date-picker-day ${cell.key === selected ? 'selected' : ''} ${cell.key === today ? 'today' : ''}`}
              aria-label={dayAria(cell)}
              aria-pressed={cell.key === selected}
              onClick={() => { onChange(cell.key); setOpen(false) }}
            >{cell.label}</button>
          : <span key={`empty-${index}`} />)}
      </div>
      <footer className="date-picker-foot">
        <button type="button" className="text-button" onClick={() => { onChange(today); setOpen(false) }}>Today</button>
      </footer>
    </div>}
  </div>
}

import type { Expense, PauseTag } from '@/db/db'
import { parseAmount } from './amount'

export type ExpenseImportRow = Pick<Expense, 'amount' | 'category' | 'date'> &
  Partial<Pick<Expense, 'id' | 'pause' | 'note' | 'from' | 'to' | 'peopleCount'>>

export type ExpenseImportFormat = 'array' | 'expenses' | 'transactions' | 'backup' | 'sheet'
export type ImportIssueSeverity = 'error' | 'warning'
export type ImportIssueField = 'amount' | 'category' | 'date' | 'peopleCount' | 'pause' | 'id'

export interface ImportPeriod {
  startDay?: number
  endDay?: number
  startDate?: string
  endDate?: string
  label?: string
}

export interface ExpenseImportIssue {
  row: number
  severity: ImportIssueSeverity
  field?: ImportIssueField
  message: string
}

export interface PendingExpenseImportRow {
  row: number
  day: number
  amount: number
  category: string
  id?: string
  pause?: PauseTag
  note?: string
  from?: string
  to?: string
  peopleCount?: number
  reason: string
}

export interface ExpenseImportResult {
  rows: ExpenseImportRow[]
  pending: PendingExpenseImportRow[]
  skipped: number
  issues: ExpenseImportIssue[]
  categories: string[]
  unsupportedCategories: string[]
  format: ExpenseImportFormat
  period: ImportPeriod
  periodStart?: string
  periodEnd?: string
  needsPeriod: boolean
}

export interface ExpenseImportOptions {
  periodStart?: string
  periodEnd?: string
  supportedCategories?: string[]
}

const PAUSE_ALIASES = new Map<string, PauseTag>([
  ['needed it', 'Needed it'],
  ['needed', 'Needed it'],
  ['wanted it', 'Wanted it'],
  ['wanted', 'Wanted it'],
  ['regret', 'Regret'],
  ['regret it', 'Regret'],
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeImportText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export function normalizeImportPeople(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isInteger(number) && number > 0 ? number : null
}

export function normalizeImportDay(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 31 ? value : null
  const raw = String(value ?? '').trim()
  if (!/^\d{1,2}$/.test(raw)) return null
  const day = Number(raw)
  return day >= 1 && day <= 31 ? day : null
}

export function normalizeImportCategory(value: unknown, supportedCategories: string[] = []): string | null {
  const raw = normalizeImportText(value)
  if (!raw) return null
  if (!supportedCategories.length) return raw
  return supportedCategories.find((category) => category.trim().toLowerCase() === raw.toLowerCase()) ?? raw
}

export function normalizeImportPause(value: unknown): { pause?: PauseTag; warning?: string } {
  const raw = normalizeImportText(value)
  if (!raw) return {}
  const pause = PAUSE_ALIASES.get(raw.toLowerCase())
  if (pause) return { pause }
  return { warning: `Pause "${raw}" was not recognized and will be left unrecorded.` }
}

export function normalizeImportId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function noon(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString()
}

export function normalizeImportDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? noon(value) : null
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 10000 || value >= 100000) return null
    const serial = new Date(Math.round((value - 25569) * 86400000))
    return noon(new Date(serial.getUTCFullYear(), serial.getUTCMonth(), serial.getUTCDate()))
  }
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d{1,2}$/.test(raw)) return null
  const day = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (day) {
    const year = Number(day[1])
    const month = Number(day[2]) - 1
    const date = new Date(year, month, Number(day[3]), 12)
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== Number(day[3])) return null
    return date.toISOString()
  }
  const date = new Date(raw)
  return Number.isFinite(date.getTime()) ? noon(date) : null
}

function localDayKey(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value.slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isoFromDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12).toISOString()
}

function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86400000
}

function dayKeyFromNumber(value: number): string {
  const date = new Date(value * 86400000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function isDayOnly(value: unknown): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 31
  return /^\d{1,2}$/.test(String(value ?? '').trim())
}

function parseImportPeriod(value: unknown): ImportPeriod {
  if (!isRecord(value)) return {}
  const startDay = normalizeImportDay(value.startDay)
  const endDay = normalizeImportDay(value.endDay)
  const startDate = normalizeImportDate(value.startDate)
  const endDate = normalizeImportDate(value.endDate)
  const label = normalizeImportText(value.label)
  return {
    ...(startDay !== null ? { startDay } : {}),
    ...(endDay !== null ? { endDay } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(label ? { label } : {}),
  }
}

interface ResolvedPeriod {
  start: string
  end: string
}

function deriveEndDate(start: string, endDay: number): string | null {
  const startDate = new Date(start)
  for (let offset = 0; offset <= 2; offset += 1) {
    const candidate = new Date(startDate.getFullYear(), startDate.getMonth() + offset, endDay, 12)
    if (candidate.getDate() === endDay && candidate.getTime() > startDate.getTime()) return candidate.toISOString()
  }
  return null
}

function deriveStartDate(end: string, startDay: number): string | null {
  const endDate = new Date(end)
  for (let offset = 0; offset >= -2; offset -= 1) {
    const candidate = new Date(endDate.getFullYear(), endDate.getMonth() + offset, startDay, 12)
    if (candidate.getDate() === startDay && candidate.getTime() <= endDate.getTime()) return candidate.toISOString()
  }
  return null
}

function resolveImportPeriod(period: ImportPeriod, options: ExpenseImportOptions): { resolved?: ResolvedPeriod; start?: string; end?: string; reason?: string } {
  let start = options.periodStart ? normalizeImportDate(options.periodStart) : period.startDate ?? null
  let end = options.periodEnd ? normalizeImportDate(options.periodEnd) : period.endDate ?? null

  if (start && !end && period.endDay) end = deriveEndDate(start, period.endDay)
  if (end && !start && period.startDay) start = deriveStartDate(end, period.startDay)
  if (!start && period.startDate) start = normalizeImportDate(period.startDate)
  if (!end && period.endDate) end = normalizeImportDate(period.endDate)

  if (!start || !end) {
    return {
      start: start ?? undefined,
      end: end ?? undefined,
      reason: 'Choose the period that contains these day numbers.',
    }
  }

  const startNumber = dayNumber(localDayKey(start))
  const endNumber = dayNumber(localDayKey(end))
  const inclusiveDays = endNumber - startNumber + 1
  if (inclusiveDays < 1) {
    return { start, end, reason: 'The period end must be on or after its start.' }
  }
  if (inclusiveDays > 31) {
    return { start, end, reason: 'The selected period must be 31 days or fewer.' }
  }
  return { resolved: { start, end }, start, end }
}

function resolveDayInPeriod(day: number, start: string, end: string): { date?: string; reason?: string } {
  const startNumber = dayNumber(localDayKey(start))
  const endNumber = dayNumber(localDayKey(end))
  let found: string | undefined
  for (let value = startNumber; value <= endNumber; value += 1) {
    const key = dayKeyFromNumber(value)
    if (Number(key.slice(-2)) === day) {
      if (found) return { reason: `Day ${day} appears more than once in the selected period.` }
      found = isoFromDayKey(key)
    }
  }
  if (!found) return { reason: `Day ${day} is outside the selected period.` }
  return { date: found }
}

function detectPayload(payload: unknown): { items: unknown[]; format: ExpenseImportFormat; period: ImportPeriod } {
  if (Array.isArray(payload)) return { items: payload, format: 'array', period: {} }
  if (isRecord(payload) && Array.isArray(payload.expenses)) {
    return { items: payload.expenses, format: 'expenses', period: parseImportPeriod(payload.period) }
  }
  if (isRecord(payload) && Array.isArray(payload.transactions)) {
    return { items: payload.transactions, format: 'transactions', period: parseImportPeriod(payload.period) }
  }
  if (isRecord(payload) && isRecord(payload.tables) && Array.isArray(payload.tables.expenses)) {
    return { items: payload.tables.expenses, format: 'backup', period: {} }
  }
  throw new Error('JSON import needs an array of expenses, an expenses array, or a transactions array.')
}

function importId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function parseExpenseJson(text: string, options: ExpenseImportOptions = {}): ExpenseImportResult {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('This JSON file could not be read.')
  }

  const { items, format, period } = detectPayload(payload)
  const supportedCategories = options.supportedCategories ?? []
  const periodResolution = resolveImportPeriod(period, options)
  const rows: ExpenseImportRow[] = []
  const pending: PendingExpenseImportRow[] = []
  const issues: ExpenseImportIssue[] = []
  const categories = new Set<string>()
  const unsupportedCategories = new Set<string>()
  let skipped = 0

  for (const [index, item] of items.entries()) {
    const row = index + 1
    if (!isRecord(item)) {
      skipped += 1
      issues.push({ row, severity: 'error', message: 'This entry is not a JSON object.' })
      continue
    }
    if (item.deletedAt) {
      skipped += 1
      issues.push({ row, severity: 'warning', message: 'Deleted record skipped.' })
      continue
    }
    if (item.includeInTotals === false) {
      skipped += 1
      issues.push({ row, severity: 'warning', message: 'Excluded from totals and skipped.' })
      continue
    }

    const amount = parseAmount(item.amount)
    if (amount === null || amount <= 0) {
      skipped += 1
      issues.push({ row, severity: 'error', field: 'amount', message: 'Amount must be a positive number.' })
      continue
    }

    const category = normalizeImportCategory(item.category, supportedCategories)
    if (!category) {
      skipped += 1
      issues.push({ row, severity: 'error', field: 'category', message: 'Category is required.' })
      continue
    }
    categories.add(category)
    if (supportedCategories.length && !supportedCategories.some((name) => name.trim().toLowerCase() === category.toLowerCase())) {
      unsupportedCategories.add(category)
    }

    const pauseResult = normalizeImportPause(item.pause)
    if (pauseResult.warning) issues.push({ row, severity: 'warning', field: 'pause', message: pauseResult.warning })

    const note = normalizeImportText(item.note) ?? normalizeImportText(item.description)
    const from = normalizeImportText(item.from)
    const to = normalizeImportText(item.to)
    const rawPeople = item.peopleCount ?? item.people_count ?? item.people
    const peopleCount = normalizeImportPeople(rawPeople)
    if (rawPeople !== undefined && rawPeople !== null && String(rawPeople).trim() !== '' && peopleCount === null) {
      issues.push({ row, severity: 'warning', field: 'peopleCount', message: 'People count must be a positive whole number and was left empty.' })
    }

    const rawId = item.id
    let id = normalizeImportId(rawId)
    if (!id) {
      id = importId()
      if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
        issues.push({ row, severity: 'warning', field: 'id', message: 'The supplied ID was not usable; a new one will be generated.' })
      }
    }

    const rawDate = item.date
    const hasDate = rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== ''
    let date: string | null = null
    let day: number | null = null

    if (hasDate) {
      date = normalizeImportDate(rawDate)
      if (!date && isDayOnly(rawDate)) day = normalizeImportDay(rawDate)
      if (!date && day === null) {
        skipped += 1
        issues.push({ row, severity: 'error', field: 'date', message: 'Date could not be read. Use a full date such as 2026-11-01.' })
        continue
      }
    } else if (item.day !== undefined && item.day !== null && String(item.day).trim() !== '') {
      day = normalizeImportDay(item.day)
      if (day === null) {
        skipped += 1
        issues.push({ row, severity: 'error', field: 'date', message: 'Day must be a whole number from 1 to 31.' })
        continue
      }
    } else {
      skipped += 1
      issues.push({ row, severity: 'error', field: 'date', message: 'A date or day is required.' })
      continue
    }

    const partial: PendingExpenseImportRow = {
      row,
      day: day ?? Number(localDayKey(date ?? '').slice(-2)),
      amount,
      category,
      id,
      reason: '',
      ...(pauseResult.pause ? { pause: pauseResult.pause } : {}),
      ...(note ? { note } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(peopleCount ? { peopleCount } : {}),
    }

    if (!date && day !== null) {
      if (!periodResolution.resolved) {
        pending.push({ ...partial, reason: periodResolution.reason ?? 'Choose the period that contains these day numbers.' })
        continue
      }
      const resolvedDay = resolveDayInPeriod(day, periodResolution.resolved.start, periodResolution.resolved.end)
      if (!resolvedDay.date) {
        pending.push({ ...partial, reason: resolvedDay.reason ?? 'Choose a period that contains this day.' })
        continue
      }
      date = resolvedDay.date
    }
    if (!date) {
      skipped += 1
      issues.push({ row, severity: 'error', field: 'date', message: 'Date could not be resolved.' })
      continue
    }

    const imported: ExpenseImportRow = {
      id,
      amount,
      category,
      date,
      ...(pauseResult.pause ? { pause: pauseResult.pause } : {}),
      ...(note ? { note } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(peopleCount ? { peopleCount } : {}),
    }
    rows.push(imported)
  }

  return {
    rows,
    pending,
    skipped,
    issues,
    categories: [...categories],
    unsupportedCategories: [...unsupportedCategories],
    format,
    period,
    periodStart: periodResolution.start ? localDayKey(periodResolution.start) : undefined,
    periodEnd: periodResolution.end ? localDayKey(periodResolution.end) : undefined,
    needsPeriod: pending.length > 0,
  }
}

export function expenseSignature(expense: ExpenseImportRow | Expense): string {
  return [
    Math.round(expense.amount * 100),
    expense.category.trim().toLowerCase(),
    expense.pause ?? '',
    localDayKey(expense.date),
    (expense.note ?? '').trim().toLowerCase(),
    (expense.from ?? '').trim().toLowerCase(),
    (expense.to ?? '').trim().toLowerCase(),
    expense.peopleCount ?? '',
  ].join('|')
}

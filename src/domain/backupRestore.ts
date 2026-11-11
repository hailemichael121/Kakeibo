import { defaultSettings, monthKey, uid, type AppSettings, type Expense, type MonthPlan } from '@/db/db'
import {
  parseExpenseJson,
  type ExpenseImportRow,
  type ImportPeriod,
} from './expenseImport'

export type KakeiboBackupPayload = {
  version: 1
  exportedAt?: string
  tables: {
    expenses: Expense[]
    plans: MonthPlan[]
    reflections: unknown[]
    journals: unknown[]
    settings: AppSettings[]
    audit: unknown[]
  }
}

export type BackupRestoreSource = 'backup' | 'expense-json'

const SEED_CATEGORY_MAP: Record<string, string> = {
  food: 'Survival',
  transport: 'Survival',
  communication: 'Survival',
  family: 'Optional',
  gifts: 'Culture',
  shopping: 'Optional',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isKakeiboBackupPayload(payload: unknown): payload is KakeiboBackupPayload {
  return (
    isRecord(payload)
    && payload.version === 1
    && isRecord(payload.tables)
    && Array.isArray(payload.tables.expenses)
  )
}

export function isExpenseImportPayload(payload: unknown): boolean {
  if (Array.isArray(payload)) return payload.length > 0
  if (!isRecord(payload)) return false
  if (Array.isArray(payload.expenses)) return payload.expenses.length > 0
  if (Array.isArray(payload.transactions)) return payload.transactions.length > 0
  if (payload.type === 'expense-seed') return Array.isArray(payload.transactions) && payload.transactions.length > 0
  return false
}

export function inferSalaryCycleDates(period: ImportPeriod, reference = new Date()): { start: string; end: string } | null {
  const startDay = period.startDay
  const endDay = period.endDay
  if (!startDay || !endDay) return null

  const startDate = period.startDate?.slice(0, 10)
  const endDate = period.endDate?.slice(0, 10)
  if (startDate && endDate) return { start: startDate, end: endDate }

  const year = reference.getFullYear()
  const month = reference.getMonth()
  let cycleStart = new Date(year, month, startDay, 12)
  if (cycleStart.getDate() !== startDay || reference.getTime() < cycleStart.getTime()) {
    cycleStart = new Date(year, month - 1, startDay, 12)
  }
  if (cycleStart.getDate() !== startDay) return null

  let cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, endDay, 12)
  if (cycleEnd.getDate() !== endDay) {
    cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), endDay, 12)
    if (cycleEnd.getTime() <= cycleStart.getTime()) {
      cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, endDay, 12)
    }
  }
  if (cycleEnd.getTime() < cycleStart.getTime()) return null

  const fmt = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

  return { start: fmt(cycleStart), end: fmt(cycleEnd) }
}

function mapImportCategory(category: string, supported: string[]): string {
  const direct = supported.find((name) => name.trim().toLowerCase() === category.trim().toLowerCase())
  if (direct) return direct
  const alias = SEED_CATEGORY_MAP[category.trim().toLowerCase()]
  if (alias && supported.some((name) => name.toLowerCase() === alias.toLowerCase())) return alias
  return category.trim()
}

function toExpenseRecord(row: ExpenseImportRow): Expense {
  const now = new Date().toISOString()
  return {
    id: row.id ?? uid(),
    amount: row.amount,
    category: row.category,
    pause: row.pause ?? null,
    date: row.date,
    ...(row.note ? { note: row.note } : {}),
    from: row.from ?? null,
    to: row.to ?? null,
    peopleCount: row.peopleCount ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

export interface MaterializeBackupOptions {
  supportedCategories?: string[]
  defaultIncome?: number
  defaultFixed?: number
  referenceDate?: Date
}

export function materializeBackupFromExpenseJson(
  text: string,
  options: MaterializeBackupOptions = {},
): { backup: KakeiboBackupPayload; skipped: number; issues: string[] } {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('That is not valid JSON.')
  }

  const supported = options.supportedCategories ?? defaultSettings().categories.map((category) => category.name)
  const period = isRecord(payload.period)
    ? {
        startDay: typeof payload.period.startDay === 'number' ? payload.period.startDay : undefined,
        endDay: typeof payload.period.endDay === 'number' ? payload.period.endDay : undefined,
        startDate: typeof payload.period.startDate === 'string' ? payload.period.startDate : undefined,
        endDate: typeof payload.period.endDate === 'string' ? payload.period.endDate : undefined,
        label: typeof payload.period.label === 'string' ? payload.period.label : undefined,
      }
    : {}

  const inferred = inferSalaryCycleDates(period, options.referenceDate ?? new Date())
  const parsed = parseExpenseJson(text, {
    supportedCategories: supported,
    periodStart: inferred?.start,
    periodEnd: inferred?.end,
  })

  const issues = parsed.issues.map((issue) => `Row ${issue.row}: ${issue.message}`)
  if (parsed.pending.length > 0) {
    throw new Error(
      parsed.pending.length === 1
        ? 'One record still needs a salary period. Add startDate and endDate to the file, or use full dates on each expense.'
        : `${parsed.pending.length} records still need a salary period. Add startDate and endDate to the file, or use full dates on each expense.`,
    )
  }

  const rows = parsed.rows.map((row) => ({
    ...row,
    category: mapImportCategory(row.category, supported),
  }))

  const expenses = rows.map(toExpenseRecord)
  const settingsBase = defaultSettings()
  const currency = typeof payload.currency === 'string' && payload.currency.trim() ? payload.currency.trim() : settingsBase.currency
  const monthStartDay =
    typeof payload.monthStartDay === 'number'
      ? payload.monthStartDay
      : period.startDay ?? settingsBase.monthStartDay

  const planPatch = isRecord(payload.plan) ? payload.plan : {}
  const income =
    typeof planPatch.income === 'number'
      ? planPatch.income
      : typeof payload.income === 'number'
        ? payload.income
        : options.defaultIncome ?? 0
  const fixed =
    typeof planPatch.fixed === 'number'
      ? planPatch.fixed
      : typeof payload.fixed === 'number'
        ? payload.fixed
        : options.defaultFixed ?? 0
  const savingsTarget =
    planPatch.savingsTarget === null
      ? null
      : typeof planPatch.savingsTarget === 'number'
        ? planPatch.savingsTarget
        : null

  const earliest = expenses.map((expense) => expense.date.slice(0, 10)).sort()[0]
  const planMonth = earliest ? monthKey(new Date(`${earliest}T12:00:00`), monthStartDay) : monthKey(new Date(), monthStartDay)
  const now = new Date().toISOString()

  const settings: AppSettings = {
    ...settingsBase,
    currency,
    monthStartDay,
    onboarded: true,
    demoEnabled: false,
    updatedAt: now,
  }

  const plans: MonthPlan[] = [{
    id: planMonth,
    income,
    fixed,
    savingsTarget,
    updatedAt: now,
  }]

  const backup: KakeiboBackupPayload = {
    version: 1,
    exportedAt: now,
    tables: {
      expenses,
      plans,
      reflections: [],
      journals: [],
      settings: [settings],
      audit: [],
    },
  }

  return { backup, skipped: parsed.skipped, issues }
}

export function normalizeRestoredSettings(settings: AppSettings, plans: MonthPlan[], expenseCount: number): AppSettings {
  const hasPlan = plans.some((plan) => plan.income > 0 || plan.fixed > 0)
  const shouldOnboard = settings.onboarded || hasPlan || expenseCount > 0
  return { ...settings, onboarded: shouldOnboard, demoEnabled: false }
}

export function parseBackupText(text: string): { source: BackupRestoreSource; payload: KakeiboBackupPayload } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That is not valid JSON. Paste the whole contents of a Kakeibo backup or expense file.')
  }

  if (isKakeiboBackupPayload(raw)) {
    return { source: 'backup', payload: raw }
  }

  if (!isExpenseImportPayload(raw)) {
    throw new Error('This is not a Kakeibo backup. Use a backup from Settings, or an expenses / transactions JSON file.')
  }

  const { backup } = materializeBackupFromExpenseJson(text)
  return { source: 'expense-json', payload: backup }
}

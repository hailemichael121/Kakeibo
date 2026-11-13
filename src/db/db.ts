import Dexie, { type Table } from 'dexie'

export type CategoryName = 'Survival' | 'Optional' | 'Culture' | 'Extra' | string
export type PauseTag = 'Needed it' | 'Wanted it' | 'Regret'
export type ThemeMode = 'light' | 'dark' | 'auto'

export interface Expense {
  id: string
  amount: number
  category: CategoryName
  pause: PauseTag | null
  date: string
  note?: string
  from?: string | null
  to?: string | null
  peopleCount?: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  demo?: boolean
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  archived: boolean
}

export interface MonthPlan {
  id: string
  income: number
  fixed: number
  savingsTarget: number | null
  startingSpent?: number
  updatedAt: string
  demo?: boolean
}

export interface MonthReflection {
  id: string
  chips: string[]
  note: string
  updatedAt: string
}

export interface JournalEntry {
  id: string
  title: string
  body: string
  date: string
  mood: string
  tags: string[]
  highlights?: JournalHighlight[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface JournalHighlight {
  start: number
  end: number
  color: string
}

export interface AppSettings {
  id: 'app'
  updatedAt?: string
  currency: string
  monthStartDay: number
  theme: ThemeMode
  language: 'en' | 'am'
  categories: Category[]
  demoEnabled: boolean
  onboarded: boolean
  remindersEnabled?: boolean
  reminderMiddayTime?: string // HH:mm
  reminderNightTime?: string // HH:mm
  reminderWeeklyEnabled?: boolean
  reminderWeeklyDay?: number // 0 Sun - 6 Sat
  amountsHidden?: boolean
  lockEnabled?: boolean
  lockPinHash?: string
  lockPinSalt?: string
  lockUseBiometric?: boolean
  lockWebAuthnCredentialId?: string
}

export interface AuditEntry {
  id: string
  entity: 'expense' | 'plan' | 'reflection' | 'journal' | 'settings'
  entityId: string
  action: 'created' | 'updated' | 'deleted' | 'restored'
  timestamp: string
  summary: string
  data: string
}

export interface SyncData {
  expenses: Expense[]
  plans: MonthPlan[]
  reflections: MonthReflection[]
  journals: JournalEntry[]
  settings: AppSettings[]
  audit: AuditEntry[]
}

export interface SyncSnapshot {
  id: string
  at: string
  fileName: string
  before: SyncData
  after: SyncData
}

export class KakeiboDB extends Dexie {
  expenses!: Table<Expense, string>
  plans!: Table<MonthPlan, string>
  reflections!: Table<MonthReflection, string>
  journals!: Table<JournalEntry, string>
  settings!: Table<AppSettings, string>
  audit!: Table<AuditEntry, string>
  syncSnapshots!: Table<SyncSnapshot, string>

  constructor(name = 'kakeibo') {
    super(name)
    this.version(1).stores({
      expenses: 'id, date, category, updatedAt, deletedAt',
      plans: 'id, updatedAt',
      reflections: 'id, updatedAt',
      settings: 'id',
      audit: 'id, timestamp, entity, action',
    })
    this.version(2).stores({
      expenses: 'id, date, category, updatedAt, deletedAt',
      plans: 'id, updatedAt',
      reflections: 'id, updatedAt',
      settings: 'id',
      audit: 'id, timestamp, entity, action',
      syncSnapshots: 'id, at',
    })
    this.version(3).stores({
      expenses: 'id, date, category, updatedAt, deletedAt',
      plans: 'id, updatedAt',
      reflections: 'id, updatedAt',
      journals: 'id, date, updatedAt, deletedAt',
      settings: 'id',
      audit: 'id, timestamp, entity, action',
      syncSnapshots: 'id, at',
    })
  }
}

export const db = new KakeiboDB()
export const uid = () => crypto.randomUUID()

const CATEGORY_DEFAULTS: Category[] = [
  { id: 'survival', name: 'Survival', icon: 'House', color: '#A8B9A5', archived: false },
  { id: 'optional', name: 'Optional', icon: 'ShoppingBag', color: '#D8B68A', archived: false },
  { id: 'culture', name: 'Culture', icon: 'BookOpen', color: '#A8ACCB', archived: false },
  { id: 'extra', name: 'Extra', icon: 'Umbrella', color: '#D39A8B', archived: false },
]

export const defaultSettings = (): AppSettings => ({
  id: 'app',
  currency: 'ETB',
  monthStartDay: 1,
  theme: 'light',
  language: 'en',
  categories: CATEGORY_DEFAULTS.map((category) => ({ ...category })),
  demoEnabled: false,
  onboarded: false,
  remindersEnabled: true,
  reminderMiddayTime: '12:00',
  reminderNightTime: '21:00',
  reminderWeeklyEnabled: true,
  reminderWeeklyDay: 0,
  amountsHidden: true,
  lockEnabled: true,
  lockUseBiometric: true,
})

export function monthKey(date = new Date(), startDay = 1): string {
  const adjusted = date.getDate() < startDay ? new Date(date.getFullYear(), date.getMonth() - 1, 1) : date
  return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, '0')}`
}

export function amountText(amount: number, currency = 'ETB'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

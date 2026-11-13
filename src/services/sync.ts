import { db, uid, type AppSettings, type AuditEntry, type Category, type Expense, type JournalEntry, type MonthPlan, type MonthReflection, type SyncData } from '@/db/db'
import { writeSafetyMirror } from '@/db/safety'

const FORMAT = 'kakeibo-sync'
const VERSION = 1
export const MAX_SYNC_BYTES = 25 * 1024 * 1024

export interface SyncPackage {
  format: typeof FORMAT
  version: typeof VERSION
  exportedAt: string
  data: SyncData
}

export interface TablePreview {
  table: keyof SyncData
  added: number
  updated: number
  kept: number
}

export interface SyncPreview {
  tables: TablePreview[]
  added: number
  updated: number
  kept: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isCategory(value: unknown): value is Category {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && isNonEmptyString(value.icon)
    && typeof value.color === 'string'
    && typeof value.archived === 'boolean'
}

function isExpense(value: unknown): value is Expense {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isMoney(value.amount)
    && isNonEmptyString(value.category)
    && (value.pause === null || ['Needed it', 'Wanted it', 'Regret'].includes(String(value.pause)))
    && isNonEmptyString(value.date)
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt)
    && (value.deletedAt === null || typeof value.deletedAt === 'string')
    && (value.note === undefined || typeof value.note === 'string')
    && (value.from === undefined || value.from === null || typeof value.from === 'string')
    && (value.to === undefined || value.to === null || typeof value.to === 'string')
    && (value.peopleCount === undefined || value.peopleCount === null || (typeof value.peopleCount === 'number' && Number.isInteger(value.peopleCount) && value.peopleCount > 0))
}

function isPlan(value: unknown): value is MonthPlan {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isMoney(value.income)
    && isMoney(value.fixed)
    && (value.savingsTarget === null || isMoney(value.savingsTarget))
    && (value.startingSpent === undefined || isMoney(value.startingSpent))
    && isNonEmptyString(value.updatedAt)
}

function isReflection(value: unknown): value is MonthReflection {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && Array.isArray(value.chips)
    && value.chips.every((chip) => typeof chip === 'string')
    && typeof value.note === 'string'
    && isNonEmptyString(value.updatedAt)
}

function isJournalEntry(value: unknown): value is JournalEntry {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && typeof value.title === 'string'
    && typeof value.body === 'string'
    && isNonEmptyString(value.date)
    && typeof value.mood === 'string'
    && Array.isArray(value.tags)
    && value.tags.every((tag) => typeof tag === 'string')
    && (value.highlights === undefined || (Array.isArray(value.highlights) && value.highlights.every((item) => isRecord(item)
      && Number.isInteger(item.start) && Number.isInteger(item.end)
      && Number(item.start) >= 0 && Number(item.end) > Number(item.start) && Number(item.end) <= String(value.body).length
      && typeof item.color === 'string' && /^#[\da-f]{6}$/i.test(item.color))))
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt)
    && (value.deletedAt === null || typeof value.deletedAt === 'string')
}

function isSettings(value: unknown): value is AppSettings {
  return isRecord(value)
    && value.id === 'app'
    && (value.updatedAt === undefined || typeof value.updatedAt === 'string')
    && isNonEmptyString(value.currency)
    && typeof value.monthStartDay === 'number'
    && (value.theme === 'light' || value.theme === 'dark' || value.theme === 'auto')
    && (value.language === 'en' || value.language === 'am')
    && Array.isArray(value.categories)
    && value.categories.every(isCategory)
    && typeof value.demoEnabled === 'boolean'
    && typeof value.onboarded === 'boolean'
}

function isAudit(value: unknown): value is AuditEntry {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && ['expense', 'plan', 'reflection', 'journal', 'settings'].includes(String(value.entity))
    && isNonEmptyString(value.entityId)
    && ['created', 'updated', 'deleted', 'restored'].includes(String(value.action))
    && isNonEmptyString(value.timestamp)
    && typeof value.summary === 'string'
    && typeof value.data === 'string'
}

function uniqueIds<T extends { id: string }>(items: T[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length
}

export function parseSyncPayload(text: string): SyncPackage {
  if (new TextEncoder().encode(text).byteLength > MAX_SYNC_BYTES) throw new Error('This sync file is larger than 25 MB.')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('This is not a readable Kakeibo sync file.')
  }
  if (!isRecord(value) || value.format !== FORMAT || value.version !== VERSION || !isNonEmptyString(value.exportedAt) || !isRecord(value.data)) {
    throw new Error('This file is not a supported Kakeibo sync file.')
  }
  const { data } = value
  if (!Array.isArray(data.expenses) || !data.expenses.every(isExpense)
    || !Array.isArray(data.plans) || !data.plans.every(isPlan)
    || !Array.isArray(data.reflections) || !data.reflections.every(isReflection)
    || (data.journals !== undefined && (!Array.isArray(data.journals) || !data.journals.every(isJournalEntry)))
    || !Array.isArray(data.settings) || data.settings.length > 1 || !data.settings.every(isSettings)
    || !Array.isArray(data.audit) || !data.audit.every(isAudit)) {
    throw new Error('This sync file contains incomplete or invalid Kakeibo data.')
  }
  const tables: SyncData = {
    expenses: data.expenses,
    plans: data.plans,
    reflections: data.reflections,
    journals: data.journals ?? [],
    settings: data.settings,
    audit: data.audit,
  }
  if (Object.values(tables).some((items) => !uniqueIds(items))) throw new Error('This sync file contains duplicate record IDs.')
  return { format: FORMAT, version: VERSION, exportedAt: value.exportedAt, data: tables }
}

export async function buildSyncFile(): Promise<{ name: string; bytes: Uint8Array }> {
  const data = await readSyncData()
  const payload: SyncPackage = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data }
  const date = new Date().toISOString().slice(0, 10)
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  if (bytes.byteLength > MAX_SYNC_BYTES) throw new Error('This Kakeibo sync file is larger than 25 MB.')
  return { name: `Kakeibo_sync_${date}.json`, bytes }
}

export async function readSyncData(): Promise<SyncData> {
  const [expenses, plans, reflections, journals, settings, audit] = await Promise.all([
    db.expenses.toArray(),
    db.plans.toArray(),
    db.reflections.toArray(),
    db.journals.toArray(),
    db.settings.toArray(),
    db.audit.toArray(),
  ])
  return { expenses, plans, reflections, journals, settings, audit }
}

function timestamp(record: { updatedAt?: string; timestamp?: string }): number {
  return Date.parse(record.updatedAt ?? record.timestamp ?? '') || 0
}

function previewTable<T extends { id: string; updatedAt?: string; timestamp?: string }>(
  table: keyof SyncData,
  local: T[],
  incoming: T[],
): TablePreview {
  const localById = new Map(local.map((record) => [record.id, record]))
  const result: TablePreview = { table, added: 0, updated: 0, kept: 0 }
  for (const record of incoming) {
    const existing = localById.get(record.id)
    if (!existing) result.added += 1
    else if (timestamp(record) > timestamp(existing)) result.updated += 1
    else result.kept += 1
  }
  return result
}

export function previewSync(local: SyncData, incoming: SyncData): SyncPreview {
  const tables: TablePreview[] = [
    previewTable('expenses', local.expenses, incoming.expenses),
    previewTable('plans', local.plans, incoming.plans),
    previewTable('reflections', local.reflections, incoming.reflections),
    previewTable('journals', local.journals, incoming.journals),
    previewTable('settings', local.settings, incoming.settings),
    previewTable('audit', local.audit, incoming.audit),
  ]
  return {
    tables,
    added: tables.reduce((sum, item) => sum + item.added, 0),
    updated: tables.reduce((sum, item) => sum + item.updated, 0),
    kept: tables.reduce((sum, item) => sum + item.kept, 0),
  }
}

async function writeNewer<T extends { id: string; updatedAt?: string; timestamp?: string }>(
  table: { toArray: () => Promise<T[]>; put: (record: T) => Promise<unknown> },
  incoming: T[],
): Promise<void> {
  const localById = new Map((await table.toArray()).map((record) => [record.id, record]))
  for (const record of incoming) {
    const existing = localById.get(record.id)
    if (!existing || timestamp(record) > timestamp(existing)) await table.put(record)
  }
}

function mergeSettings(local: AppSettings | undefined, incoming: AppSettings): AppSettings {
  if (!local) return incoming
  const winner = timestamp(incoming) > timestamp(local) ? incoming : local
  return {
    ...winner,
    theme: local.theme,
    language: local.language,
    onboarded: local.onboarded || incoming.onboarded,
    amountsHidden: local.amountsHidden ?? incoming.amountsHidden,
    lockEnabled: local.lockEnabled ?? incoming.lockEnabled,
    lockPinHash: local.lockPinHash ?? incoming.lockPinHash,
    lockPinSalt: local.lockPinSalt ?? incoming.lockPinSalt,
    lockUseBiometric: local.lockUseBiometric ?? incoming.lockUseBiometric,
    lockWebAuthnCredentialId: local.lockWebAuthnCredentialId ?? incoming.lockWebAuthnCredentialId,
    updatedAt: new Date(Math.max(timestamp(local), timestamp(incoming))).toISOString(),
  }
}

function ordered(data: SyncData): SyncData {
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
  return {
    expenses: byId(data.expenses),
    plans: byId(data.plans),
    reflections: byId(data.reflections),
    journals: byId(data.journals ?? []),
    settings: byId(data.settings),
    audit: byId(data.audit),
  }
}

export async function applySync(payload: SyncPackage, fileName: string): Promise<{ preview: SyncPreview; snapshotId: string }> {
  const result = await db.transaction('rw', [db.expenses, db.plans, db.reflections, db.journals, db.settings, db.audit, db.syncSnapshots], async () => {
    const before = await readSyncData()
    const preview = previewSync(before, payload.data)
    await writeNewer(db.expenses, payload.data.expenses)
    await writeNewer(db.plans, payload.data.plans)
    await writeNewer(db.reflections, payload.data.reflections)
    await writeNewer(db.journals, payload.data.journals)
    await writeNewer(db.audit, payload.data.audit)
    const localSettings = await db.settings.get('app')
    const remoteSettings = payload.data.settings[0]
    if (remoteSettings) await db.settings.put(mergeSettings(localSettings, remoteSettings))
    await db.audit.add({
      id: uid(),
      entity: 'settings',
      entityId: 'app',
      action: 'updated',
      timestamp: new Date().toISOString(),
      summary: `Merged data from ${fileName}`,
      data: JSON.stringify({ added: preview.added, updated: preview.updated, kept: preview.kept }),
    })
    const after = await readSyncData()
    const snapshotId = uid()
    await db.syncSnapshots.clear()
    await db.syncSnapshots.add({ id: snapshotId, at: new Date().toISOString(), fileName, before: ordered(before), after: ordered(after) })
    return { preview, snapshotId }
  })
  await writeSafetyMirror()
  return result
}

export async function undoSync(snapshotId: string): Promise<boolean> {
  const result = await db.transaction('rw', [db.expenses, db.plans, db.reflections, db.journals, db.settings, db.audit, db.syncSnapshots], async () => {
    const snapshot = await db.syncSnapshots.get(snapshotId)
    if (!snapshot) return false
    const current = ordered(await readSyncData())
    if (JSON.stringify(current) !== JSON.stringify(ordered(snapshot.after))) return false

    await Promise.all([
      db.expenses.clear(), db.plans.clear(), db.reflections.clear(), db.journals.clear(), db.settings.clear(), db.audit.clear(),
    ])
    await Promise.all([
      db.expenses.bulkPut(snapshot.before.expenses),
      db.plans.bulkPut(snapshot.before.plans),
      db.reflections.bulkPut(snapshot.before.reflections),
      db.journals.bulkPut(snapshot.before.journals ?? []),
      db.settings.bulkPut(snapshot.before.settings),
      db.audit.bulkPut(snapshot.before.audit),
    ])
    await db.syncSnapshots.delete(snapshotId)
    await db.audit.add({
      id: uid(),
      entity: 'settings',
      entityId: 'app',
      action: 'updated',
      timestamp: new Date().toISOString(),
      summary: `Undid sync from ${snapshot.fileName}`,
      data: JSON.stringify({ snapshotId }),
    })
    return true
  })
  if (result) await writeSafetyMirror()
  return result
}

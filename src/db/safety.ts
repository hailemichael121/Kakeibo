import { db, type AppSettings, type AuditEntry, type Expense, type JournalEntry, type MonthPlan, type MonthReflection } from './db'
import { clearNativeSnapshot, isNativeStorage, readNativeSnapshot, writeNativeSnapshot } from './nativeSql'

const MIRROR_KEY = 'kakeibo.safety.v1'
const MIRROR_VERSION = 1
const MAX_AUDIT_ENTRIES = 500
const MAX_MIRROR_BYTES = 25 * 1024 * 1024

interface MirrorTables {
  expenses: Expense[]
  plans: MonthPlan[]
  reflections: MonthReflection[]
  journals: JournalEntry[]
  settings: AppSettings[]
  audit: AuditEntry[]
}

export interface SafetyMirror {
  version: number
  savedAt: string
  tables: MirrorTables
}

type DesktopSafetyBridge = {
  readSafetyBackup?: () => Promise<string | null>
  writeSafetyBackup?: (data: string) => Promise<boolean>
  clearSafetyBackup?: () => Promise<boolean>
}

function desktopBridge(): DesktopSafetyBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { kakeibo?: DesktopSafetyBridge }).kakeibo
}

function readLocalMirror(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(MIRROR_KEY)
  } catch {
    return null
  }
}

async function readDesktopMirror(): Promise<string | null> {
  try {
    return (await desktopBridge()?.readSafetyBackup?.()) ?? null
  } catch {
    return null
  }
}

function parseMirror(text: string | null): SafetyMirror | null {
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as Partial<SafetyMirror>
    if (parsed.version !== MIRROR_VERSION || !parsed.tables) return null
    return {
      version: MIRROR_VERSION,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      tables: {
        expenses: Array.isArray(parsed.tables.expenses) ? parsed.tables.expenses : [],
        plans: Array.isArray(parsed.tables.plans) ? parsed.tables.plans : [],
        reflections: Array.isArray(parsed.tables.reflections) ? parsed.tables.reflections : [],
        journals: Array.isArray(parsed.tables.journals) ? parsed.tables.journals : [],
        settings: Array.isArray(parsed.tables.settings) ? parsed.tables.settings : [],
        audit: Array.isArray(parsed.tables.audit) ? parsed.tables.audit : [],
      },
    }
  } catch {
    return null
  }
}

export async function readSafetyMirror(): Promise<SafetyMirror | null> {
  return parseMirror(await readDesktopMirror())
    ?? parseMirror(await readNativeSnapshot())
    ?? parseMirror(readLocalMirror())
}

export async function writeSafetyMirror(): Promise<void> {
  try {
    const [expenses, plans, reflections, journals, settings, audit] = await Promise.all([
      db.expenses.toArray(),
      db.plans.toArray(),
      db.reflections.toArray(),
      db.journals.toArray(),
      db.settings.toArray(),
      db.audit.orderBy('timestamp').reverse().limit(MAX_AUDIT_ENTRIES).toArray(),
    ])
    const mirror: SafetyMirror = {
      version: MIRROR_VERSION,
      savedAt: new Date().toISOString(),
      tables: { expenses, plans, reflections, journals, settings, audit },
    }
    const text = JSON.stringify(mirror)
    if (text.length > MAX_MIRROR_BYTES) {
      console.warn('The on-device safety copy is too large; relying on IndexedDB only.')
      return
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MIRROR_KEY, text)
      } catch {
        // localStorage may be unavailable or full; native/file copies still run.
      }
    }
    const bridge = desktopBridge()
    if (bridge?.writeSafetyBackup) {
      try {
        await bridge.writeSafetyBackup(text)
      } catch {
        // The primary IndexedDB write already succeeded.
      }
    }
    await writeNativeSnapshot(text)
  } catch (error) {
    console.warn('Could not update the on-device safety copy', error)
  }
}

export async function clearSafetyMirror(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(MIRROR_KEY)
    } catch {
      // Ignore storage access failures.
    }
  }
  try {
    await desktopBridge()?.clearSafetyBackup?.()
  } catch {
    // Ignore file removal failures.
  }
  await clearNativeSnapshot()
}

let recoveryPromise: Promise<boolean> | undefined

async function databaseIsEmpty(): Promise<boolean> {
  const counts = await Promise.all([
    db.expenses.count(),
    db.plans.count(),
    db.reflections.count(),
    db.journals.count(),
    db.settings.count(),
    db.audit.count(),
    db.syncSnapshots.count(),
  ])
  return counts.every((count) => count === 0)
}

async function latestDatabaseTimestamp(): Promise<string> {
  const [expense, plan, reflection, journal, settings, audit] = await Promise.all([
    db.expenses.orderBy('updatedAt').last(),
    db.plans.orderBy('updatedAt').last(),
    db.reflections.orderBy('updatedAt').last(),
    db.journals.orderBy('updatedAt').last(),
    db.settings.toArray(),
    db.audit.orderBy('timestamp').last(),
  ])
  const timestamps = [
    expense?.updatedAt,
    plan?.updatedAt,
    reflection?.updatedAt,
    journal?.updatedAt,
    ...settings.map((row) => row.updatedAt),
    audit?.timestamp,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
  timestamps.sort()
  return timestamps[timestamps.length - 1] ?? ''
}

async function restoreMirror(mirror: SafetyMirror, replace: boolean): Promise<void> {
  const tables = [db.expenses, db.plans, db.reflections, db.journals, db.settings, db.audit]
  await db.transaction('rw', tables, async () => {
    if (replace) for (const table of tables) await table.clear()
    if (mirror.tables.expenses.length) await db.expenses.bulkPut(mirror.tables.expenses)
    if (mirror.tables.plans.length) await db.plans.bulkPut(mirror.tables.plans)
    if (mirror.tables.reflections.length) await db.reflections.bulkPut(mirror.tables.reflections)
    if (mirror.tables.journals.length) await db.journals.bulkPut(mirror.tables.journals)
    if (mirror.tables.settings.length) await db.settings.bulkPut(mirror.tables.settings)
    if (mirror.tables.audit.length) await db.audit.bulkPut(mirror.tables.audit)
  })
}

function recoverOnce(): Promise<boolean> {
  return (async () => {
    try {
      const empty = await databaseIsEmpty()
      const mirror = await readSafetyMirror()
      if (!mirror) return false
      if (!empty) {
        if (!isNativeStorage()) return false
        const latest = await latestDatabaseTimestamp()
        if (latest && mirror.savedAt <= latest) return false
      }
      await restoreMirror(mirror, !empty)
      return true
    } catch (error) {
      console.warn('Could not restore the on-device safety copy', error)
      return false
    }
  })()
}

export function recoverSafetyMirror(): Promise<boolean> {
  if (!recoveryPromise) recoveryPromise = recoverOnce()
  return recoveryPromise
}

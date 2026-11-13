import { Capacitor } from '@capacitor/core'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

const DATABASE = 'kakeibo_native'
const TABLE = 'kakeibo_state'
const SNAPSHOT_ID = 'snapshot'

let connection: SQLiteDBConnection | null = null
let opening: Promise<SQLiteDBConnection | null> | null = null
let writeQueue: Promise<void> = Promise.resolve()

export function isNativeStorage(): boolean {
  return Capacitor.isNativePlatform()
}

async function openConnection(): Promise<SQLiteDBConnection | null> {
  if (!isNativeStorage()) return null
  if (connection) return connection
  if (!opening) {
    opening = (async () => {
      const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
      const sqlite = new SQLiteConnection(CapacitorSQLite)
      const existing = await sqlite.isConnection(DATABASE, false)
      const database = existing.result
        ? await sqlite.retrieveConnection(DATABASE, false)
        : await sqlite.createConnection(DATABASE, false, 'no-encryption', 1, false)
      const open = await database.isDBOpen()
      if (!open.result) await database.open()
      await database.execute(`CREATE TABLE IF NOT EXISTS ${TABLE} (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL);`)
      connection = database
      return database
    })().catch((error) => {
      console.warn('Could not open the native SQLite database', error)
      opening = null
      return null
    })
  }
  return opening
}

export async function readNativeSnapshot(): Promise<string | null> {
  if (!isNativeStorage()) return null
  try {
    const database = await openConnection()
    if (!database) return null
    const result = await database.query(`SELECT json FROM ${TABLE} WHERE id = ? LIMIT 1;`, [SNAPSHOT_ID])
    const row = result.values?.[0] as { json?: unknown } | undefined
    return typeof row?.json === 'string' ? row.json : null
  } catch (error) {
    console.warn('Could not read the native SQLite snapshot', error)
    return null
  }
}

export function writeNativeSnapshot(text: string): Promise<boolean> {
  if (!isNativeStorage()) return Promise.resolve(false)
  let wrote = false
  writeQueue = writeQueue.then(async () => {
    const database = await openConnection()
    if (!database) return
    await database.run(
      `INSERT OR REPLACE INTO ${TABLE} (id, json, updated_at) VALUES (?, ?, ?);`,
      [SNAPSHOT_ID, text, new Date().toISOString()],
    )
    wrote = true
  }).catch((error) => {
    console.warn('Could not write the native SQLite snapshot', error)
  })
  return writeQueue.then(() => wrote)
}

export async function clearNativeSnapshot(): Promise<void> {
  if (!isNativeStorage()) return
  writeQueue = writeQueue.then(async () => {
    const database = await openConnection()
    if (!database) return
    await database.run(`DELETE FROM ${TABLE} WHERE id = ?;`, [SNAPSHOT_ID])
  }).catch((error) => {
    console.warn('Could not clear the native SQLite snapshot', error)
  })
  await writeQueue
}

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { inferSalaryCycleDates, isExpenseImportPayload, materializeBackupFromExpenseJson, parseBackupText } from './backupRestore'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const USER_EXPENSES = {
  expenses: [
    { amount: 300, category: 'Optional', date: '2026-11-09', note: 'Metshaf gift' },
    { amount: 45, category: 'Survival', date: '2026-11-11', note: 'Taxi to work', to: 'Work', peopleCount: 1 },
  ],
  period: { startDay: 30, endDay: 2, label: 'Salary cycle' },
  currency: 'ETB',
  plan: { income: 18000, fixed: 4200, savingsTarget: null },
}

describe('backupRestore', () => {
  it('detects expense import payloads', () => {
    expect(isExpenseImportPayload({ expenses: [] })).toBe(false)
    expect(isExpenseImportPayload(USER_EXPENSES)).toBe(true)
  })

  it('materializes a full backup from an expenses object', () => {
    const { backup } = materializeBackupFromExpenseJson(JSON.stringify(USER_EXPENSES))
    expect(backup.version).toBe(1)
    expect(backup.tables.expenses).toHaveLength(2)
    expect(backup.tables.settings[0]?.onboarded).toBe(true)
    expect(backup.tables.settings[0]?.currency).toBe('ETB')
    expect(backup.tables.settings[0]?.monthStartDay).toBe(30)
    expect(backup.tables.plans[0]).toMatchObject({ income: 18000, fixed: 4200, savingsTarget: null })
  })

  it('parses expense JSON through parseBackupText', () => {
    const { source, payload } = parseBackupText(JSON.stringify(USER_EXPENSES))
    expect(source).toBe('expense-json')
    expect(payload.tables.expenses[0]?.note).toBe('Metshaf gift')
  })

  it('infers salary cycle dates for day-only seeds', () => {
    const dates = inferSalaryCycleDates({ startDay: 30, endDay: 2 }, new Date('2026-11-11T12:00:00'))
    expect(dates).toEqual({ start: '2026-10-30', end: '2026-11-02' })
  })

  it('materializes an expense-seed with day numbers and skips excluded rows', () => {
    const text = readFileSync(path.join(repoRoot, 'sample-data/expense-seed.salary-cycle.json'), 'utf8')
    const { source, payload } = parseBackupText(text)
    expect(source).toBe('expense-json')
    expect(payload.tables.expenses).toHaveLength(13)
    expect(payload.tables.expenses.some((row) => row.id === 'seed-008')).toBe(false)
    expect(payload.tables.settings[0]?.monthStartDay).toBe(30)
  })
})

import { describe, expect, it } from 'vitest'
import { expenseSignature, normalizeImportDate, normalizeImportPause, parseExpenseJson } from './expenseImport'

describe('parseExpenseJson', () => {
  it('reads a root array and skips invalid amounts or dates', () => {
    const result = parseExpenseJson(JSON.stringify([
      { amount: '1,250.50', category: ' Survival ', pause: 'Needed it', date: '2026-11-01' },
      { amount: 0, category: 'Optional', date: '2026-11-02' },
      { amount: 40, category: 'Optional', date: '2026-02-31' },
      { amount: 70, category: '', date: '2026-11-03' },
      null,
    ]))

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ amount: 1250.5, category: 'Survival', pause: 'Needed it' })
    expect(result.skipped).toBe(4)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(4)
  })

  it('reads an expenses object and preserves optional details', () => {
    const result = parseExpenseJson(JSON.stringify({
      expenses: [
        {
          id: 'expense-1',
          amount: 260,
          category: 'Survival',
          pause: 'Wanted it',
          date: '2026-11-02',
          note: ' Shared transport ',
          from: ' Megenagna ',
          to: ' Bole ',
          peopleCount: 4,
        },
      ],
    }))

    expect(result.rows[0]).toMatchObject({
      id: 'expense-1',
      amount: 260,
      category: 'Survival',
      pause: 'Wanted it',
      note: 'Shared transport',
      from: 'Megenagna',
      to: 'Bole',
      peopleCount: 4,
    })
    expect(result.skipped).toBe(0)
  })

  it('reads a transactions seed with day numbers and period dates', () => {
    const result = parseExpenseJson(JSON.stringify({
      schemaVersion: '1.0',
      type: 'expense-seed',
      currency: 'ETB',
      period: { startDay: 30, endDay: 2, startDate: '2026-10-30', endDate: '2026-11-02', label: 'Salary cycle' },
      transactions: [
        { id: 'seed-001', day: 30, amount: 300, description: 'Metshaf gift', category: 'Gifts', pause: 'Regret it', people: '2' },
        { id: 'seed-002', day: 1, amount: 1200, description: 'Family gathering payment', category: 'Family' },
        { id: 'seed-003', day: 2, amount: 45, description: 'Taxi to work', category: 'Transport', from: 'Work', to: 'Home' },
      ],
    }))

    expect(result.rows).toHaveLength(3)
    expect(result.rows.map((row) => row.date.slice(0, 10))).toEqual(['2026-10-30', '2026-11-01', '2026-11-02'])
    expect(result.rows[0]).toMatchObject({
      id: 'seed-001',
      amount: 300,
      category: 'Gifts',
      note: 'Metshaf gift',
      pause: 'Regret',
      peopleCount: 2,
    })
    expect(result.rows[2]).toMatchObject({ id: 'seed-003', from: 'Work', to: 'Home', note: 'Taxi to work' })
    expect(result.needsPeriod).toBe(false)
  })

  it('asks for a period when day-only records have no reliable dates', () => {
    const text = JSON.stringify({
      period: { startDay: 30, endDay: 2, label: 'Salary cycle' },
      transactions: [
        { id: 'seed-001', day: 30, amount: 300, description: 'Metshaf gift', category: 'Gifts' },
        { id: 'seed-002', day: 1, amount: 1200, description: 'Family gathering payment', category: 'Family' },
        { id: 'seed-003', day: 2, amount: 45, description: 'Taxi to work', category: 'Transport' },
      ],
    })
    const unresolved = parseExpenseJson(text)

    expect(unresolved.rows).toHaveLength(0)
    expect(unresolved.pending).toHaveLength(3)
    expect(unresolved.needsPeriod).toBe(true)
    expect(unresolved.period.label).toBe('Salary cycle')

    const resolved = parseExpenseJson(text, { periodStart: '2026-10-30', periodEnd: '2026-11-02' })
    expect(resolved.rows).toHaveLength(3)
    expect(resolved.pending).toHaveLength(0)
    expect(resolved.rows[1].date.slice(0, 10)).toBe('2026-11-01')
  })

  it('derives the end date from the period start and end day', () => {
    const result = parseExpenseJson(JSON.stringify({
      period: { startDay: 30, endDay: 2, startDate: '2026-10-30' },
      transactions: [{ day: 2, amount: 45, category: 'Transport' }],
    }))

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].date.slice(0, 10)).toBe('2026-11-02')
  })

  it('accepts standalone arrays and description/people aliases', () => {
    const result = parseExpenseJson(JSON.stringify([
      { amount: 180, category: 'Survival', date: '2026-11-01', description: 'Taxi to work', people: 2 },
      { amount: 260, category: 'Survival', date: '2026-11-02', note: 'Shared transport', peopleCount: '3' },
    ]))

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ note: 'Taxi to work', peopleCount: 2 })
    expect(result.rows[1]).toMatchObject({ note: 'Shared transport', peopleCount: 3 })
  })

  it('preserves missing pauses and maps recognized pause aliases', () => {
    const result = parseExpenseJson(JSON.stringify([
      { amount: 10, category: 'Optional', date: '2026-11-05' },
      { amount: 20, category: 'Optional', date: '2026-11-06', pause: 'Regret it' },
      { amount: 30, category: 'Optional', date: '2026-11-07', pause: 'Maybe' },
    ]))

    expect(result.rows[0].pause).toBeUndefined()
    expect(result.rows[1].pause).toBe('Regret')
    expect(result.rows[2].pause).toBeUndefined()
    expect(result.issues.some((issue) => issue.field === 'pause' && issue.severity === 'warning')).toBe(true)
    expect(normalizeImportPause('Regret it').pause).toBe('Regret')
  })

  it('reports unsupported categories without discarding them', () => {
    const result = parseExpenseJson(JSON.stringify({
      transactions: [{ amount: 45, category: 'Transport', date: '2026-11-02', description: 'Taxi' }],
    }), { supportedCategories: ['Survival', 'Optional', 'Culture', 'Extra'] })

    expect(result.rows[0].category).toBe('Transport')
    expect(result.unsupportedCategories).toEqual(['Transport'])
    expect(result.categories).toEqual(['Transport'])
  })

  it('preserves ids and generates ids when they are missing or unusable', () => {
    const result = parseExpenseJson(JSON.stringify([
      { id: 'keep-me', amount: 10, category: 'Optional', date: '2026-11-05' },
      { id: '   ', amount: 20, category: 'Optional', date: '2026-11-06' },
      { id: { unusable: true }, amount: 25, category: 'Optional', date: '2026-11-06' },
      { amount: 30, category: 'Optional', date: '2026-11-07' },
    ]))

    expect(result.rows[0].id).toBe('keep-me')
    expect(result.rows[1].id).toBeTruthy()
    expect(result.rows[2].id).toBeTruthy()
    expect(result.rows[3].id).toBeTruthy()
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(4)
    expect(result.issues.some((issue) => issue.field === 'id' && issue.severity === 'warning')).toBe(true)
  })

  it('ignores people counts that are not positive integers', () => {
    const result = parseExpenseJson(JSON.stringify([
      { amount: 10, category: 'Optional', date: '2026-11-05', peopleCount: 4.8 },
      { amount: 20, category: 'Optional', date: '2026-11-06', peopleCount: 0 },
      { amount: 30, category: 'Optional', date: '2026-11-07', peopleCount: '3' },
    ]))

    expect(result.rows[0].peopleCount).toBeUndefined()
    expect(result.rows[1].peopleCount).toBeUndefined()
    expect(result.rows[2].peopleCount).toBe(3)
    expect(result.issues.filter((issue) => issue.field === 'peopleCount')).toHaveLength(2)
  })

  it('reads a Kakeibo backup expenses table without inventing a pause', () => {
    const result = parseExpenseJson(JSON.stringify({
      version: 1,
      tables: { expenses: [{ id: 'backup-1', amount: 95, category: 'Culture', date: '2026-11-04' }] },
    }))

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ id: 'backup-1', amount: 95, category: 'Culture' })
    expect(result.rows[0].pause).toBeUndefined()
  })

  it('leaves records pending when a day is outside the period', () => {
    const result = parseExpenseJson(JSON.stringify({
      period: { startDate: '2026-10-30', endDate: '2026-11-02' },
      transactions: [{ day: 15, amount: 10, category: 'Optional' }],
    }))

    expect(result.rows).toHaveLength(0)
    expect(result.pending).toHaveLength(1)
    expect(result.pending[0].reason).toContain('outside the selected period')
    expect(result.needsPeriod).toBe(true)
  })

  it('rejects malformed JSON and unsupported structures', () => {
    expect(() => parseExpenseJson('{')).toThrow('could not be read')
    expect(() => parseExpenseJson(JSON.stringify({ rows: [] }))).toThrow('needs an array')
  })

  it('normalizes date-only values to local noon', () => {
    const normalized = normalizeImportDate('2026-11-01')
    expect(normalized).not.toBeNull()
    const date = new Date(normalized!)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(10)
    expect(date.getDate()).toBe(1)
    expect(date.getHours()).toBe(12)
  })

  it('does not treat a bare day as a calendar date', () => {
    expect(normalizeImportDate('30')).toBeNull()
    expect(normalizeImportDate(30)).toBeNull()
  })
})

describe('expenseSignature', () => {
  it('matches equivalent values while ignoring case and surrounding spaces', () => {
    const first = expenseSignature({
      amount: 12.5,
      category: 'Optional',
      pause: 'Wanted it',
      date: '2026-11-01T12:00:00.000Z',
      note: ' Coffee ',
      from: 'Work',
      to: 'Home',
      peopleCount: 2,
    })
    const second = expenseSignature({
      amount: 12.5,
      category: ' optional ',
      pause: 'Wanted it',
      date: '2026-11-01T18:00:00.000Z',
      note: 'coffee',
      from: ' work ',
      to: 'home',
      peopleCount: 2,
    })

    expect(first).toBe(second)
  })

  it('keeps a missing pause distinct from a recorded pause', () => {
    const missing = expenseSignature({ amount: 10, category: 'Optional', date: '2026-11-01T12:00:00.000Z' })
    const recorded = expenseSignature({ amount: 10, category: 'Optional', pause: 'Needed it', date: '2026-11-01T12:00:00.000Z' })

    expect(missing).not.toBe(recorded)
  })
})

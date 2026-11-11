import { describe, expect, it } from 'vitest'
import { expenseSignature, normalizeImportDate, parseExpenseJson } from './expenseImport'

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
  })

  it('reads an expenses object and preserves optional details', () => {
    const result = parseExpenseJson(JSON.stringify({
      expenses: [
        {
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

  it('ignores people counts that are not positive integers', () => {
    const result = parseExpenseJson(JSON.stringify([
      { amount: 10, category: 'Optional', date: '2026-11-05', peopleCount: 4.8 },
      { amount: 20, category: 'Optional', date: '2026-11-06', peopleCount: 0 },
      { amount: 30, category: 'Optional', date: '2026-11-07', peopleCount: '3' },
    ]))

    expect(result.rows[0].peopleCount).toBeUndefined()
    expect(result.rows[1].peopleCount).toBeUndefined()
    expect(result.rows[2].peopleCount).toBe(3)
  })

  it('reads a Kakeibo backup expenses table', () => {
    const result = parseExpenseJson(JSON.stringify({
      version: 1,
      tables: { expenses: [{ amount: 95, category: 'Culture', date: '2026-11-04' }] },
    }))

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ amount: 95, category: 'Culture', pause: 'Needed it' })
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
})

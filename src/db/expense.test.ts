import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { saveExpense } from './repo'

describe('saveExpense optional details', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('stores and reloads optional details', async () => {
    const saved = await saveExpense({
      amount: 260,
      category: 'Survival',
      pause: 'Needed it',
      date: '2026-11-02T12:00:00.000Z',
      note: 'Shared transport',
      from: 'Megenagna',
      to: 'Bole',
      peopleCount: 4,
    })

    const reloaded = await db.expenses.get(saved.id)
    expect(reloaded).toMatchObject({
      note: 'Shared transport',
      from: 'Megenagna',
      to: 'Bole',
      peopleCount: 4,
    })
  })

  it('clears optional details when empty values are saved and keeps an untouched note', async () => {
    const saved = await saveExpense({
      amount: 20,
      category: 'Optional',
      pause: 'Wanted it',
      date: '2026-11-02T12:00:00.000Z',
      note: 'Keep this',
      from: 'Work',
      to: 'Home',
      peopleCount: 2,
    })

    const updated = await saveExpense({
      amount: 25,
      category: 'Optional',
      pause: 'Wanted it',
      date: '2026-11-02T12:00:00.000Z',
      from: '',
      to: null,
      peopleCount: 0,
    }, saved.id)

    expect(updated.note).toBe('Keep this')
    expect(updated.from).toBeNull()
    expect(updated.to).toBeNull()
    expect(updated.peopleCount).toBeNull()
  })
})

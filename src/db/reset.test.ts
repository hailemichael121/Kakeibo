import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ensureSettings, resetAllData, saveExpense, saveJournalEntry, savePlan, saveSettings } from './repo'

describe('factory reset', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('clears every table and restores default settings', async () => {
    await ensureSettings()
    await saveExpense({ amount: 12.5, category: 'Survival', pause: 'Needed it', date: new Date().toISOString() })
    await savePlan({ id: '2026-01', income: 1000, fixed: 200, savingsTarget: 100 })
    await saveJournalEntry({ title: 'A note', body: 'Something to remember.', date: '2026-01-10', mood: 'Hopeful', tags: ['goals'] })
    await saveSettings({ currency: 'USD', onboarded: true, demoEnabled: true })

    const fresh = await resetAllData()

    expect(fresh.currency).toBe('ETB')
    expect(fresh.monthStartDay).toBe(1)
    expect(fresh.onboarded).toBe(false)
    expect(fresh.demoEnabled).toBe(false)
    expect(fresh.categories).toHaveLength(4)
    expect(await db.expenses.count()).toBe(0)
    expect(await db.plans.count()).toBe(0)
    expect(await db.reflections.count()).toBe(0)
    expect(await db.journals.count()).toBe(0)
    expect(await db.audit.count()).toBe(0)
    expect(await db.syncSnapshots.count()).toBe(0)
    expect(await db.settings.count()).toBe(1)
  })
})

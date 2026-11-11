import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from 'playwright/test'

declare global {
  interface Window {
    __reminders?: { enabled: boolean; middayTime: string; nightTime: string; weeklyEnabled: boolean; weeklyDay: number }
  }
}

async function waitForApp(page: Page) {
  await expect(page.locator('.loading-skeleton')).toHaveCount(0)
}

async function completeOnboarding(page: Page) {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Monthly take-home income').fill('5000')
  await page.getByLabel('Fixed costs').fill('1000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Skip target' }).click()
  await expect(page.locator('.onboarding-card')).toHaveCount(0)
}

async function seedImportFile(): Promise<string> {
  const source = JSON.parse(await readFile('sample-data/expenses.seed.json', 'utf8')) as { expenses: Array<Record<string, unknown>> }
  const today = new Date()
  source.expenses = source.expenses.map((expense, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), Math.max(1, today.getDate() - index))
    return {
      ...expense,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    }
  })
  const path = '/tmp/opencode/kakeibo-e2e-seed.json'
  await writeFile(path, JSON.stringify(source))
  return path
}

async function writeJsonFile(name: string, payload: unknown): Promise<string> {
  const path = `/tmp/opencode/${name}.json`
  await writeFile(path, JSON.stringify(payload))
  return path
}

function currentMonthDate(day: number): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function addExpense(page: Page, amount = '12.5', details?: { from: string; to: string; people: string }) {
  await page.locator('.sidebar-add').click()
  await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible()
  for (const key of amount) {
    await page.getByRole('button', { name: key === '.' ? '.' : key, exact: true }).click()
  }
  await page.locator('.category-chips button', { hasText: 'Optional' }).click()
  await page.getByRole('button', { name: /Expense date/ }).click()
  await expect(page.getByRole('dialog', { name: 'Expense date' })).toBeVisible()
  await page.getByRole('dialog', { name: /date/i }).getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Expense date' })).toHaveCount(0)
  if (details) {
    await page.getByRole('button', { name: 'Additional details' }).click()
    await expect(page.locator('#expense-details')).toHaveClass(/open/)
    await page.getByLabel('From', { exact: true }).fill(details.from)
    await page.getByLabel('To', { exact: true }).fill(details.to)
    await page.getByLabel('People', { exact: true }).fill(details.people)
  }
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('status')).toContainText('Expense saved')
}

test.describe('Kakeibo app', () => {
  test('adds an expense with the custom date picker and undoes a custom-confirmed delete', async ({ page }) => {
    await completeOnboarding(page)
    await addExpense(page)

    const row = page.locator('.recent-panel .expense-row').first()
    await expect(row).toContainText('Optional')
    await row.hover()
    await row.locator('button[title="Delete expense"]').click()
    await expect(page.getByRole('alertdialog', { name: 'Delete this expense?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(row).toBeVisible()

    await row.hover()
    await row.locator('button[title="Delete expense"]').click()
    await page.getByRole('alertdialog', { name: 'Delete this expense?' }).getByRole('button', { name: 'Delete expense', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Expense deleted')
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.locator('.recent-panel .expense-row').first()).toContainText('Optional')
  })

  test('optional expense details persist through reload and edit', async ({ page }) => {
    await completeOnboarding(page)
    await addExpense(page, '260', { from: 'Megenagna', to: 'Bole', people: '4' })

    const row = page.locator('.recent-panel .expense-row').first()
    await expect(row).toContainText('Megenagna → Bole')
    await expect(row).toContainText('4 people')

    await page.reload()
    await waitForApp(page)
    const reloaded = page.locator('.recent-panel .expense-row').first()
    await expect(reloaded).toContainText('4 people')
    await reloaded.hover()
    await reloaded.locator('button[title="Edit expense"]').click()
    await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible()
    await page.getByRole('button', { name: 'Additional details' }).click()
    await expect(page.locator('#expense-details')).toHaveClass(/open/)
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('Megenagna')
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('Bole')
    await expect(page.getByLabel('People', { exact: true })).toHaveValue('4')

    await page.getByLabel('From', { exact: true }).fill('Office')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toContainText('Expense updated')
    await expect(page.locator('.recent-panel .expense-row').first()).toContainText('Office → Bole')
  })

  test('typing in optional details does not feed the amount keypad', async ({ page }) => {
    await completeOnboarding(page)
    await page.locator('.sidebar-add').click()
    for (const key of '260') await page.getByRole('button', { name: key, exact: true }).click()
    await page.getByRole('button', { name: 'Additional details' }).click()
    const from = page.getByLabel('From', { exact: true })
    await from.click()
    await from.pressSequentially('Gate 4')
    await expect(from).toHaveValue('Gate 4')
    const people = page.getByLabel('People', { exact: true })
    await people.click()
    await people.pressSequentially('4')
    await expect(people).toHaveValue('4')
    await expect(page.locator('.amount-display strong')).toHaveText('260')
  })

  test('optional expense details stay usable on a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await completeOnboarding(page)
    await page.locator('.mobile-floating-add').click()
    await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible()
    for (const key of '85') await page.getByRole('button', { name: key, exact: true }).click()
    await page.locator('.category-chips button', { hasText: 'Optional' }).click()
    await page.getByRole('button', { name: 'Additional details' }).click()
    await expect(page.locator('#expense-details')).toHaveClass(/open/)
    await page.getByLabel('From', { exact: true }).fill('Home')
    await page.getByLabel('To', { exact: true }).fill('Market')
    await page.getByLabel('People', { exact: true }).fill('2')
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('status')).toContainText('Expense saved')
    await expect(page.locator('.recent-panel .expense-row').first()).toContainText('Home → Market')
    await expect(page.locator('.recent-panel .expense-row').first()).toContainText('2 people')
  })

  test('factory reset requires a custom confirmation and restores the first-run state', async ({ page }) => {
    await completeOnboarding(page)
    await addExpense(page)

    await page.locator('.side-nav button', { hasText: 'Settings' }).click()
    await page.getByRole('heading', { name: 'Your data' }).click()
    await page.getByRole('button', { name: 'Factory reset' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Factory reset Kakeibo?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('permanently deleted')
    await page.getByRole('button', { name: 'Keep my data' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    await page.getByRole('button', { name: 'Factory reset' }).click()
    await page.getByRole('button', { name: 'Reset everything' }).click()
    await expect(page.getByRole('status')).toContainText('Kakeibo has been reset')
    await expect(page.getByText('Welcome to Kakeibo')).toBeVisible()

    await page.reload()
    await waitForApp(page)
    await expect(page.getByText('Welcome to Kakeibo')).toBeVisible()
  })

  test('JSON import preserves optional details and skips duplicates', async ({ page }) => {
    await completeOnboarding(page)
    await addExpense(page, '12.5')
    await page.locator('.side-nav button', { hasText: 'History' }).click()
    const input = page.locator('.history-actions input[type="file"]')
    const preview = page.getByRole('dialog', { name: 'Review import' })
    const seedPath = await seedImportFile()

    await input.setInputFiles(seedPath)
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('4 ready to import')
    await preview.getByRole('button', { name: 'Import 4 expenses' }).click()
    await expect(page.getByRole('status')).toContainText('4 expenses imported')
    const shared = page.locator('.expense-row', { hasText: 'Shared transport' })
    await expect(shared).toContainText('Megenagna → Bole')
    await expect(shared).toContainText('4 people')
    await expect(page.locator('.expense-row')).toHaveCount(5)

    await input.setInputFiles(seedPath)
    await expect(preview).toBeVisible()
    await preview.getByRole('button', { name: 'Import 4 expenses' }).click()
    await expect(page.getByRole('status')).toContainText('No new expenses · 4 duplicates skipped')
    await expect(page.locator('.expense-row')).toHaveCount(5)
  })

  test('imports a transactions seed after choosing its period and mapping categories', async ({ page }) => {
    await completeOnboarding(page)
    await page.locator('.side-nav button', { hasText: 'History' }).click()
    const seedPath = await writeJsonFile('kakeibo-e2e-transactions', {
      schemaVersion: '1.0',
      type: 'expense-seed',
      currency: 'ETB',
      period: { startDay: 2, endDay: 4, label: 'Salary cycle' },
      transactions: [
        { id: 'seed-001', day: 2, amount: 300, description: 'Metshaf gift', category: 'Gifts', pause: 'Regret it', people: '2' },
        { id: 'seed-002', day: 3, amount: 1200, description: 'Family gathering payment', category: 'Family' },
        { id: 'seed-003', day: 4, amount: 45, description: 'Taxi to work', category: 'Transport', from: 'Work', to: 'Home' },
      ],
    })
    const preview = page.getByRole('dialog', { name: 'Review import' })

    await page.locator('.history-actions input[type="file"]').setInputFiles(seedPath)
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('3 records need a period')
    await expect(preview.getByRole('button', { name: 'Import 0 expenses' })).toBeDisabled()

    await preview.getByLabel('Period start', { exact: true }).fill(currentMonthDate(2))
    await expect(preview.getByLabel('Period end', { exact: true })).toHaveValue(currentMonthDate(4))
    await expect(preview).toContainText('3 ready to import')
    await expect(preview).toContainText(currentMonthDate(2))
    await expect(preview.getByRole('button', { name: 'Import 3 expenses' })).toBeDisabled()

    await preview.getByLabel('Map Gifts to a category').selectOption('Extra')
    await preview.getByLabel('Map Family to a category').selectOption('Survival')
    await preview.getByLabel('Map Transport to a category').selectOption('Optional')
    await expect(preview.getByRole('button', { name: 'Import 3 expenses' })).toBeEnabled()
    await preview.getByRole('button', { name: 'Import 3 expenses' }).click()

    await expect(page.getByRole('status')).toContainText('3 expenses imported')
    await expect(page.locator('.expense-row')).toHaveCount(3)
    const gift = page.locator('.expense-row', { hasText: 'Metshaf gift' })
    await expect(gift).toContainText('Extra')
    await expect(gift).toContainText('Regret')
    await expect(gift).toContainText('2 people')
    await expect(page.locator('.expense-row', { hasText: 'Family gathering payment' })).toContainText('Survival')
    await expect(page.locator('.expense-row', { hasText: 'Taxi to work' })).toContainText('Work → Home')
  })

  test('imports a standalone array and resolves day-only dates from a chosen period', async ({ page }) => {
    await completeOnboarding(page)
    await page.locator('.side-nav button', { hasText: 'History' }).click()
    const seedPath = await writeJsonFile('kakeibo-e2e-array', [
      { amount: 180, category: 'Survival', date: currentMonthDate(1), description: 'Taxi to work', people: 2 },
      { amount: 260, category: 'Optional', day: 15, description: 'Shared transport', from: 'Megenagna', to: 'Bole', peopleCount: 4 },
    ])
    const preview = page.getByRole('dialog', { name: 'Review import' })

    await page.locator('.history-actions input[type="file"]').setInputFiles(seedPath)
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('1 record needs a period')
    await expect(preview.getByRole('button', { name: 'Import 1 expense' })).toBeDisabled()

    await preview.getByLabel('Period start', { exact: true }).fill(currentMonthDate(1))
    await preview.getByLabel('Period end', { exact: true }).fill(currentMonthDate(28))
    await expect(preview).toContainText('2 ready to import')
    await expect(preview).toContainText(currentMonthDate(15))
    await expect(preview.getByRole('button', { name: 'Import 2 expenses' })).toBeEnabled()
    await preview.getByRole('button', { name: 'Import 2 expenses' }).click()

    await expect(page.getByRole('status')).toContainText('2 expenses imported')
    await expect(page.locator('.expense-row')).toHaveCount(2)
    const shared = page.locator('.expense-row', { hasText: 'Shared transport' })
    await expect(shared).toContainText('Megenagna → Bole')
    await expect(shared).toContainText('4 people')
    await expect(page.locator('.expense-row', { hasText: 'Taxi to work' })).toContainText('2 people')
  })

  test('imports a backup expenses table without inventing a pause', async ({ page }) => {
    await completeOnboarding(page)
    await page.locator('.side-nav button', { hasText: 'History' }).click()
    const backupPath = await writeJsonFile('kakeibo-e2e-backup-table', {
      version: 1,
      exportedAt: '2026-11-04T12:00:00.000Z',
      tables: {
        expenses: [{ id: 'backup-1', amount: 95, category: 'Culture', date: '2026-11-04', note: 'Museum' }],
      },
    })
    const preview = page.getByRole('dialog', { name: 'Review import' })

    await page.locator('.history-actions input[type="file"]').setInputFiles(backupPath)
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('1 ready to import')
    await preview.getByRole('button', { name: 'Import 1 expense' }).click()

    await expect(page.getByRole('status')).toContainText('1 expense imported')
    const row = page.locator('.expense-row', { hasText: 'Museum' })
    await expect(row).toContainText('Culture')
    await expect(row).not.toContainText('Needed it')
    await expect(row).not.toContainText('Wanted it')
    await expect(row).not.toContainText('Regret')
  })

  test('Excel export and import preserve optional expense details', async ({ page }) => {
    await completeOnboarding(page)
    await addExpense(page, '260', { from: 'Megenagna', to: 'Bole', people: '4' })
    await page.locator('.side-nav button', { hasText: 'History' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Excel' }).click()
    const download = await downloadPromise
    const exportPath = '/tmp/opencode/kakeibo-e2e-export.xlsx'
    await download.saveAs(exportPath)

    const row = page.locator('.expense-row').first()
    await row.hover()
    await row.locator('button[title="Delete expense"]').click()
    await page.getByRole('alertdialog', { name: 'Delete this expense?' }).getByRole('button', { name: 'Delete expense', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Expense deleted')

    await page.locator('.history-actions input[type="file"]').setInputFiles(exportPath)
    const preview = page.getByRole('dialog', { name: 'Review import' })
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('1 ready to import')
    await preview.getByRole('button', { name: 'Import 1 expense' }).click()
    await expect(page.getByRole('status')).toContainText('1 expense imported')
    const imported = page.locator('.expense-row').first()
    await expect(imported).toContainText('Megenagna → Bole')
    await expect(imported).toContainText('4 people')
  })

  test('backup and restore preserve optional expense details', async ({ page }) => {
    await completeOnboarding(page)
    await addExpense(page, '260', { from: 'Megenagna', to: 'Bole', people: '4' })
    await page.locator('.side-nav button', { hasText: 'Settings' }).click()
    await page.getByRole('heading', { name: 'Your data' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Backup data' }).click()
    const download = await downloadPromise
    const backupPath = '/tmp/opencode/kakeibo-e2e-backup.json'
    await download.saveAs(backupPath)

    await page.locator('.side-nav button', { hasText: 'Home' }).click()
    const row = page.locator('.recent-panel .expense-row').first()
    await row.hover()
    await row.locator('button[title="Delete expense"]').click()
    await page.getByRole('alertdialog', { name: 'Delete this expense?' }).getByRole('button', { name: 'Delete expense', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Expense deleted')

    await page.locator('.side-nav button', { hasText: 'Settings' }).click()
    await page.getByRole('heading', { name: 'Your data' }).click()
    await page.locator('.data-actions input[type="file"]').setInputFiles(backupPath)
    const restore = page.getByRole('alertdialog', { name: 'Restore this backup?' })
    await expect(restore).toBeVisible()
    await restore.getByRole('button', { name: 'Restore backup', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Backup restored')
    await page.locator('.side-nav button', { hasText: 'Home' }).click()
    const restored = page.locator('.recent-panel .expense-row').first()
    await expect(restored).toContainText('Megenagna → Bole')
    await expect(restored).toContainText('4 people')
  })

  test('notification routes open the add form or the report screen', async ({ page }) => {
    await page.goto('/?route=add')
    await waitForApp(page)
    await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible()

    await page.goto('/?route=report')
    await waitForApp(page)
    await expect(page.getByText('Every little choice adds up.')).toBeVisible()
  })

  test('journal uses custom date, mood, and discard dialogs', async ({ page }) => {
    await completeOnboarding(page)
    await page.locator('.side-nav button', { hasText: 'Journal' }).click()
    await page.getByRole('button', { name: 'New note' }).click()
    await page.locator('#journal-body').fill('A calm note about a small choice.')
    await page.getByRole('button', { name: /Note date/ }).click()
    await expect(page.getByRole('dialog', { name: 'Note date' })).toBeVisible()
    await page.getByRole('dialog', { name: /date/i }).getByRole('button', { name: 'Today', exact: true }).click()
    await page.locator('.journal-mood-field .custom-select-trigger').click()
    await page.locator('.custom-select-item', { hasText: 'Hopeful' }).click()
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.locator('.journal-reader')).toContainText('A calm note about a small choice.')
    await expect(page.locator('.journal-reader')).toContainText('Hopeful')

    await page.getByRole('button', { name: 'New note' }).click()
    await page.locator('#journal-body').fill('Unsaved draft')
    await page.getByRole('button', { name: 'Back to notes' }).click()
    await expect(page.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeVisible()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.locator('#journal-body')).toHaveCount(0)
  })

  test('reminder settings use the custom time wheel', async ({ page }) => {
    await completeOnboarding(page)
    await page.locator('.side-nav button', { hasText: 'Settings' }).click()
    await page.getByRole('heading', { name: 'Reminders' }).click()
    await page.locator('.time-pill').first().click()
    await expect(page.locator('.time-sheet')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.locator('.time-sheet')).toHaveCount(0)
  })
})

test('desktop bridge schedules reminders and starts a QR sync session', async ({ page }) => {
  await page.addInitScript(() => {
    window.__reminders = undefined
    window.kakeibo = {
      saveFile: async () => ({ saved: true }),
      lanStart: async () => ({
        mode: 'receive',
        url: `http://192.168.1.20:4567/upload/${'a'.repeat(43)}`,
        expiresAt: Date.now() + 300_000,
      }),
      lanStop: async () => {},
      onLanReceived: () => () => {},
      remindersSchedule: async (options) => { window.__reminders = options },
      remindersCancel: async () => {},
      onReminderRoute: () => () => {},
    }
  })
  await completeOnboarding(page)
  await expect.poll(() => page.evaluate(() => window.__reminders?.enabled)).toBe(true)

  await page.locator('.side-nav button', { hasText: 'Settings' }).click()
  await page.getByRole('heading', { name: 'Your data' }).click()
  await page.getByRole('button', { name: 'Sync devices' }).click()
  await page.getByRole('button', { name: 'Show QR to receive from phone' }).click()
  await expect(page.locator('.sync-qr img')).toBeVisible()
  await expect(page.getByText(/Link expires in/)).toBeVisible()
  await page.getByRole('button', { name: 'Stop QR session' }).click()
  await expect(page.locator('.sync-qr img')).toHaveCount(0)
})

test('new categories use a custom prompt with validation', async ({ page }) => {
  await completeOnboarding(page)
  await page.locator('.side-nav button', { hasText: 'Settings' }).click()
  await page.getByRole('heading', { name: 'Your categories' }).click()
  await page.getByRole('button', { name: 'Add category' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Name your new category' })
  await expect(dialog).toBeVisible()
  await page.getByLabel('Category name').fill('Survival')
  await dialog.getByRole('button', { name: 'Add category' }).click()
  await expect(dialog).toContainText('already in use')
  await page.getByLabel('Category name').fill('Family')
  await dialog.getByRole('button', { name: 'Add category' }).click()
  await expect(page.locator('.settings-category', { hasText: 'Family' })).toBeVisible()
})

test('date picker offers Ethiopian calendar with English or Amharic day names', async ({ page }) => {
  await completeOnboarding(page)
  await page.locator('.sidebar-add').click()
  await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible()
  await page.getByRole('button', { name: /Expense date/ }).click()
  const picker = page.getByRole('dialog', { name: 'Expense date' })
  await expect(picker).toBeVisible()

  await picker.getByRole('button', { name: 'Ethiopian', exact: true }).click()
  await expect(picker.getByRole('button', { name: 'Ethiopian', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.locator('.date-picker-head b')).toContainText('E.C.')
  await expect(picker.locator('.date-picker-weekdays')).toContainText('Sun')
  await expect(picker.locator('.date-picker-weekdays')).toContainText('Sat')

  await picker.getByRole('button', { name: 'አማርኛ', exact: true }).click()
  await expect(picker.locator('.date-picker-head b')).toContainText('ዓ.ም.')
  await expect(picker.locator('.date-picker-weekdays')).toContainText('እሁድ')
  await expect(picker.locator('.date-picker-weekdays')).toContainText('ቅዳሜ')

  await picker.locator('.date-picker-day').first().click()
  await expect(picker).toHaveCount(0)
  const trigger = page.getByRole('button', { name: /Expense date/ })
  await expect(trigger).toContainText(/20\d{2}/)

  await trigger.click()
  const reopened = page.getByRole('dialog', { name: 'Expense date' })
  await expect(reopened.getByRole('button', { name: 'Ethiopian', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(reopened.getByRole('button', { name: 'አማርኛ', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await reopened.getByRole('button', { name: 'Gregorian', exact: true }).click()
  await expect(reopened.locator('.date-picker-head b')).not.toContainText('E.C.')
  await expect(reopened.getByRole('button', { name: 'English', exact: true })).toHaveCount(0)
})

test('calendar preference can be set from Appearance settings', async ({ page }) => {
  await completeOnboarding(page)
  await page.locator('.side-nav button', { hasText: 'Settings' }).click()
  await page.getByLabel('Calendar system').click()
  await page.locator('.custom-select-item', { hasText: 'Ethiopian' }).click()
  await expect(page.getByLabel('Ethiopian day names')).toBeVisible()
  await page.getByLabel('Ethiopian day names').click()
  await page.locator('.custom-select-item', { hasText: 'አማርኛ' }).click()

  await page.locator('.side-nav button', { hasText: 'Home' }).click()
  await page.locator('.sidebar-add').click()
  await page.getByRole('button', { name: /Expense date/ }).click()
  const picker = page.getByRole('dialog', { name: 'Expense date' })
  await expect(picker.getByRole('button', { name: 'Ethiopian', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.getByRole('button', { name: 'አማርኛ', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.locator('.date-picker-weekdays')).toContainText('እሁድ')
})

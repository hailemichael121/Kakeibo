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

async function addExpense(page: Page, amount = '12.5') {
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

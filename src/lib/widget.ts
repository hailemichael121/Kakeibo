import { Capacitor } from '@capacitor/core'
import type { AppSettings, Expense, MonthPlan } from '../db/db'
import { calculateBudget } from '../domain/budget'
import { amountText } from '../db/db'
import { amountsHiddenByDefault, maskAmountText } from './privacy'

interface KakeiboWidgetPlugin {
  update: (values: {
    spendableLeft: string
    spendable: string
    spent: string
    currency: string
    amountsHidden?: boolean
    hiddenSpendableLeft?: string
    hiddenSpendable?: string
    hiddenSpent?: string
  }) => Promise<void>
  pin?: () => Promise<{ supported?: boolean; requested?: boolean; reason?: string }>
  closeQuickAdd?: () => Promise<void>
  showKeyboard?: () => Promise<void>
}

export type AddWidgetResult = 'pinned' | 'unsupported' | 'unavailable'

function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function getWidgetPlugin(): Promise<KakeiboWidgetPlugin | undefined> {
  if (!isAndroid()) return undefined
  const { Plugins } = await import('@capacitor/core')
  return (Plugins as unknown as Record<string, KakeiboWidgetPlugin | undefined>).KakeiboWidget
}

export async function updateHomeWidget(plan: MonthPlan | undefined, expenses: Expense[], settings: AppSettings) {
  try {
    const plugin = await getWidgetPlugin()
    if (!plugin) return
    const budget = calculateBudget(plan, expenses)
    const spendableLeft = amountText(budget.spendableLeft, settings.currency)
    const spendable = amountText(budget.spendable, settings.currency)
    const spent = amountText(budget.spent, settings.currency)
    await plugin.update({
      spendableLeft,
      spendable,
      spent,
      currency: settings.currency,
      amountsHidden: amountsHiddenByDefault(settings),
      hiddenSpendableLeft: maskAmountText(spendableLeft),
      hiddenSpendable: maskAmountText(spendable),
      hiddenSpent: maskAmountText(spent),
    })
  } catch {
    // The widget is optional; never block saving data when it is unavailable.
  }
}

export async function closeWidgetQuickAdd() {
  try {
    const plugin = await getWidgetPlugin()
    await plugin?.closeQuickAdd?.()
  } catch {
    // Closing is best-effort; the activity also closes when the task is dismissed.
  }
}

export async function showWidgetKeyboard() {
  try {
    const plugin = await getWidgetPlugin()
    await plugin?.showKeyboard?.()
  } catch {
    // The input still works when the web view handles the keyboard itself.
  }
}

export function canAddHomeWidget(): boolean {
  return isAndroid()
}

export async function addHomeWidget(): Promise<AddWidgetResult> {
  if (!isAndroid()) return 'unavailable'
  try {
    const plugin = await getWidgetPlugin()
    if (!plugin?.pin) return 'unavailable'
    const result = await plugin.pin()
    if (result?.requested) return 'pinned'
    if (result?.supported === false) return 'unsupported'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

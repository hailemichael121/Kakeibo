import { Capacitor } from '@capacitor/core'
import type { AppSettings, Expense, MonthPlan } from '../db/db'
import { calculateBudget } from '../domain/budget'
import { amountText } from '../db/db'
import { amountsHiddenByDefault, maskAmountText } from './privacy'
import { KakeiboWidget } from './nativePlugins'

export type AddWidgetResult = 'pinned' | 'unsupported' | 'unavailable'

function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function updateHomeWidget(plan: MonthPlan | undefined, expenses: Expense[], settings: AppSettings) {
  try {
    if (!isAndroid()) return
    const budget = calculateBudget(plan, expenses)
    const spendableLeft = amountText(budget.spendableLeft, settings.currency)
    const spendable = amountText(budget.spendable, settings.currency)
    const spent = amountText(budget.spent, settings.currency)
    await KakeiboWidget.update({
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
    if (!isAndroid()) return
    await KakeiboWidget.closeQuickAdd?.()
  } catch {
    // Closing is best-effort; the activity also closes when the task is dismissed.
  }
}

export async function showWidgetKeyboard() {
  try {
    if (!isAndroid()) return
    await KakeiboWidget.showKeyboard?.()
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
    if (!KakeiboWidget.pin) return 'unavailable'
    const result = await KakeiboWidget.pin()
    if (result?.requested) return 'pinned'
    if (result?.supported === false) return 'unsupported'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

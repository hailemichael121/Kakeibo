import { Capacitor } from '@capacitor/core'
import type { AppSettings, Expense, MonthPlan } from '../db/db'
import { calculateBudget } from '../domain/budget'
import { amountText } from '../db/db'

export async function updateHomeWidget(plan: MonthPlan | undefined, expenses: Expense[], settings: AppSettings) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return
  try {
    const budget = calculateBudget(plan, expenses)
    const { Plugins } = await import('@capacitor/core')
    const plugin: any = (Plugins as any).KakeiboWidget
    if (!plugin) return
    await plugin.update({
      spendableLeft: amountText(budget.spendableLeft, settings.currency),
      spendable: amountText(budget.spendable, settings.currency),
      spent: amountText(budget.spent, settings.currency),
      currency: settings.currency,
    })
  } catch (e) {
    // ignore
  }
}

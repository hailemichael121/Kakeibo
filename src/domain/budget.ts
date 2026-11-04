import type { Category, Expense, MonthPlan } from '../db/db'

export function calculateBudget(plan: MonthPlan | undefined, expenses: Expense[]) {
  const income = plan?.income ?? 0
  const fixed = plan?.fixed ?? 0
  const savings = plan?.savingsTarget ?? 0
  const startingSpent = plan?.startingSpent ?? 0
  const spendable = income - fixed - savings
  const trackedSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const spent = startingSpent + trackedSpent
  const spendableLeft = spendable - spent
  const byCategory = new Map<string, number>()
  for (const expense of expenses) byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount)
  const needed = expenses.filter((expense) => expense.pause === 'Needed it').reduce((sum, expense) => sum + expense.amount, 0)
  const wanted = expenses.filter((expense) => expense.pause === 'Wanted it').reduce((sum, expense) => sum + expense.amount, 0)
  return { income, fixed, savings, startingSpent, trackedSpent, spendable, spent, spendableLeft, byCategory, needed, wanted }
}

export function categoryPercent(value: number, total: number): number {
  return total > 0 ? Math.min(100, (value / total) * 100) : 0
}

export function categoryById(categories: Category[], name: string): Category | undefined {
  return categories.find((category) => category.name === name)
}

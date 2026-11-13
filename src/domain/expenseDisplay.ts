import type { Expense } from '@/db/db'

/** Row title: custom label when set, otherwise the category name. */
export function expenseDisplayTitle(expense: Pick<Expense, 'category' | 'note'>): string {
  const label = expense.note?.trim()
  return label || expense.category
}

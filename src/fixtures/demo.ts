import type { Expense } from '../db/db'

const daysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(12, 0, 0, 0)
  return date.toISOString()
}

export const DEMO_EXPENSES: Omit<Expense, 'id'>[] = [
  { amount: 460, category: 'Survival', pause: 'Needed it', date: daysAgo(1), note: 'Groceries', createdAt: daysAgo(1), updatedAt: daysAgo(1), deletedAt: null },
  { amount: 180, category: 'Culture', pause: 'Wanted it', date: daysAgo(3), note: 'A new book', createdAt: daysAgo(3), updatedAt: daysAgo(3), deletedAt: null },
  { amount: 95, category: 'Optional', pause: 'Wanted it', date: daysAgo(5), note: 'Coffee with a friend', createdAt: daysAgo(5), updatedAt: daysAgo(5), deletedAt: null },
  { amount: 260, category: 'Survival', pause: 'Needed it', date: daysAgo(8), note: 'Transport', createdAt: daysAgo(8), updatedAt: daysAgo(8), deletedAt: null },
  { amount: 120, category: 'Extra', pause: 'Regret', date: daysAgo(10), note: 'Unexpected repair', createdAt: daysAgo(10), updatedAt: daysAgo(10), deletedAt: null },
  { amount: 220, category: 'Culture', pause: 'Needed it', date: daysAgo(12), note: 'Online course', createdAt: daysAgo(12), updatedAt: daysAgo(12), deletedAt: null },
]

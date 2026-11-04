export interface CalendarExpense {
  date: string
  amount: number
}

export interface DailyExpenseTotal {
  amount: number
  count: number
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getBudgetCalendarDates(month: string, startDay: number): { dates: Date[]; first: Date; last: Date } {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year, monthNumber - 1, startDay)
  const nextStart = new Date(year, monthNumber, startDay)
  const last = new Date(nextStart)
  last.setDate(last.getDate() - 1)
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay())
  const gridEnd = new Date(last)
  gridEnd.setDate(last.getDate() + 6 - last.getDay())
  const dates: Date[] = []
  for (const date = new Date(gridStart); date <= gridEnd; date.setDate(date.getDate() + 1)) dates.push(new Date(date))
  return { dates, first, last }
}

export function summarizeExpensesByLocalDay(expenses: readonly CalendarExpense[]): Map<string, DailyExpenseTotal> {
  const totals = new Map<string, DailyExpenseTotal>()
  for (const expense of expenses) {
    const key = localDateKey(new Date(expense.date))
    const current = totals.get(key) ?? { amount: 0, count: 0 }
    current.amount += expense.amount
    current.count += 1
    totals.set(key, current)
  }
  return totals
}

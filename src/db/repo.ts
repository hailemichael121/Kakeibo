import { db, defaultSettings, uid, type AppSettings, type AuditEntry, type Expense, type JournalEntry, type JournalHighlight, type MonthPlan, type MonthReflection } from './db'

export async function ensureSettings(): Promise<AppSettings> {
  const found = await db.settings.get('app')
  if (found) {
    const merged = {
      ...defaultSettings(),
      ...found,
      categories: found.categories?.length
        ? found.categories.map((category) => category.icon === 'Sparkles' ? { ...category, icon: 'ShoppingBag' } : category)
        : defaultSettings().categories,
      updatedAt: found.updatedAt ?? new Date().toISOString(),
    }
    if (JSON.stringify(merged) !== JSON.stringify(found)) await db.settings.put(merged)
    return merged
  }
  const settings = defaultSettings()
  await db.settings.put(settings)
  return settings
}

export async function recordAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
  await db.audit.add({ ...entry, id: uid(), timestamp: new Date().toISOString() })
}

export type SaveExpenseInput = Pick<Expense, 'amount' | 'category' | 'date'> & Partial<Pick<Expense, 'pause' | 'note' | 'from' | 'to' | 'peopleCount'>> & { demo?: boolean }

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function cleanPeople(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null
  return value
}

export async function saveExpense(input: SaveExpenseInput, id?: string): Promise<Expense> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Enter an amount greater than zero.')
  if (!input.category) throw new Error('Choose a category.')
  const now = new Date().toISOString()
  const existing = id ? await db.expenses.get(id) : undefined
  const note = input.note === undefined ? existing?.note : cleanText(input.note) ?? undefined
  const pause = input.pause === undefined ? existing?.pause ?? null : input.pause
  const expense: Expense = {
    ...input,
    pause,
    note,
    from: input.from === undefined ? existing?.from ?? null : cleanText(input.from),
    to: input.to === undefined ? existing?.to ?? null : cleanText(input.to),
    peopleCount: input.peopleCount === undefined ? existing?.peopleCount ?? null : cleanPeople(input.peopleCount),
    id: id ?? uid(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    ...(input.demo || existing?.demo ? { demo: true } : {}),
  }
  await db.expenses.put(expense)
  await recordAudit({
    entity: 'expense',
    entityId: expense.id,
    action: existing ? 'updated' : 'created',
    summary: `${existing ? 'Updated' : 'Added'} ${input.category} expense · ${input.amount}`,
    data: JSON.stringify(expense),
  })
  return expense
}

export async function deleteExpense(id: string): Promise<void> {
  const expense = await db.expenses.get(id)
  if (!expense || expense.deletedAt) return
  const now = new Date().toISOString()
  await db.expenses.update(id, { deletedAt: now, updatedAt: now })
  await recordAudit({ entity: 'expense', entityId: id, action: 'deleted', summary: `Deleted ${expense.category} expense · ${expense.amount}`, data: JSON.stringify(expense) })
}

export async function restoreExpense(id: string): Promise<void> {
  const expense = await db.expenses.get(id)
  if (!expense?.deletedAt) return
  const now = new Date().toISOString()
  await db.expenses.update(id, { deletedAt: null, updatedAt: now })
  await recordAudit({ entity: 'expense', entityId: id, action: 'restored', summary: `Restored ${expense.category} expense · ${expense.amount}`, data: JSON.stringify(expense) })
}

export async function savePlan(input: Omit<MonthPlan, 'id' | 'updatedAt'> & { id?: string }): Promise<MonthPlan> {
  const id = input.id ?? new Date().toISOString().slice(0, 7)
  const old = await db.plans.get(id)
  const plan: MonthPlan = { ...input, id, updatedAt: new Date().toISOString() }
  await db.plans.put(plan)
  await recordAudit({
    entity: 'plan',
    entityId: id,
    action: old ? 'updated' : 'created',
    summary: `${old ? 'Updated' : 'Created'} ${id} monthly plan`,
    data: JSON.stringify(plan),
  })
  return plan
}

export async function saveReflection(input: Omit<MonthReflection, 'updatedAt'>): Promise<void> {
  const old = await db.reflections.get(input.id)
  const reflection = { ...input, updatedAt: new Date().toISOString() }
  await db.reflections.put(reflection)
  await recordAudit({
    entity: 'reflection',
    entityId: input.id,
    action: old ? 'updated' : 'created',
    summary: `Saved reflection for ${input.id}`,
    data: JSON.stringify(reflection),
  })
}

export async function saveJournalEntry(input: Pick<JournalEntry, 'title' | 'body' | 'date' | 'mood' | 'tags'> & { highlights?: JournalHighlight[] }, id?: string): Promise<JournalEntry> {
  const body = input.body.trim()
  if (!body) throw new Error('Write a few words before saving your note.')
  if (!input.date || Number.isNaN(new Date(`${input.date}T00:00:00`).getTime())) throw new Error('Choose a valid date for your note.')
  const now = new Date().toISOString()
  const existing = id ? await db.journals.get(id) : undefined
  const entry: JournalEntry = {
    ...input,
    title: input.title.trim(),
    body,
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    highlights: (input.highlights ?? []).filter((item) => Number.isInteger(item.start) && Number.isInteger(item.end) && item.start >= 0 && item.end > item.start && item.end <= body.length && /^#[\da-f]{6}$/i.test(item.color)),
    id: id ?? uid(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  }
  await db.journals.put(entry)
  await recordAudit({
    entity: 'journal',
    entityId: entry.id,
    action: existing ? 'updated' : 'created',
    summary: `${existing ? 'Updated' : 'Created'} a journal note`,
    data: JSON.stringify({ id: entry.id, date: entry.date }),
  })
  return entry
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const entry = await db.journals.get(id)
  if (!entry || entry.deletedAt) return
  const now = new Date().toISOString()
  await db.journals.update(id, { deletedAt: now, updatedAt: now })
  await recordAudit({ entity: 'journal', entityId: id, action: 'deleted', summary: 'Moved a journal note to recently deleted', data: JSON.stringify({ id }) })
}

export async function restoreJournalEntry(id: string): Promise<void> {
  const entry = await db.journals.get(id)
  if (!entry?.deletedAt) return
  const now = new Date().toISOString()
  await db.journals.update(id, { deletedAt: null, updatedAt: now })
  await recordAudit({ entity: 'journal', entityId: id, action: 'restored', summary: 'Restored a journal note', data: JSON.stringify({ id }) })
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await ensureSettings()
  const next = { ...current, ...patch, id: 'app' as const, updatedAt: new Date().toISOString() }
  await db.settings.put(next)
  await recordAudit({ entity: 'settings', entityId: 'app', action: 'updated', summary: 'Updated settings', data: JSON.stringify(patch) })
  return next
}

export async function resetAllData(): Promise<AppSettings> {
  await db.transaction('rw', [db.expenses, db.plans, db.reflections, db.journals, db.settings, db.audit, db.syncSnapshots], async () => {
    for (const table of [db.expenses, db.plans, db.reflections, db.journals, db.settings, db.audit, db.syncSnapshots]) await table.clear()
  })
  const settings = defaultSettings()
  await db.settings.put(settings)
  return settings
}

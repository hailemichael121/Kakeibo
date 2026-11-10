import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, Coffee, Download, FileSpreadsheet, Heart, House, Info,
  MoreHorizontal, Pencil, Plus, RefreshCw, Search, SettingsIcon, ShoppingBag, Smartphone, Sun, Trash2, Umbrella, Wallet, X,
   Home, BookOpen as BookOpenIcon, BarChart3 as BarChartIcon, Clock3 as ClockIcon, Heart as HeartIcon
} from 'lucide-react'
import { db, amountText, defaultSettings, monthKey, uid, type AppSettings, type AuditEntry, type Category, type Expense, type MonthPlan } from '@/db/db'
import { ensureSettings, deleteExpense, recordAudit, restoreExpense, saveExpense, savePlan, saveReflection, saveSettings } from '@/db/repo'
import { calculateBudget, categoryPercent } from '@/domain/budget'
import { getBudgetCalendarDates, localDateKey, summarizeExpensesByLocalDay } from '@/domain/calendar'
import { parseAmount } from '@/domain/amount'
import { DEMO_EXPENSES } from '@/fixtures/demo'
import { shareBytes } from '@/services/share'
import { SyncScreen } from './SyncScreen'
import { JournalScreen } from './JournalScreen'
import { applyTheme } from '@/theme'
import { addHomeWidget, canAddHomeWidget, closeWidgetQuickAdd, updateHomeWidget } from '@/lib/widget'
import { WidgetQuickAdd } from './WidgetQuickAdd'
import { scheduleKakeiboReminders } from '@/lib/reminders'
import { TimePicker } from './TimePicker'
import { Toggle } from './Toggle'
import { Select } from './Select'

type Screen = 'Home' | 'Insights' | 'History' | 'Journal' | 'Settings' | 'Ritual' | 'Audit' | 'Sync' | 'About'
const NAV: { name: Exclude<Screen, 'Sync' | 'About'>; icon: typeof Home }[] = [
  { name: 'Home', icon: Home },
  { name: 'Insights', icon: BarChartIcon },
  { name: 'History', icon: ClockIcon },
  { name: 'Journal', icon: BookOpenIcon },
  { name: 'Settings', icon: SettingsIcon },
]
const CATEGORY_ICONS: Record<string, typeof House> = { House, ShoppingBag, BookOpen, Umbrella, Coffee, Heart, Wallet }
const PAUSE_TAGS = ['Needed it', 'Wanted it', 'Regret'] as const
const REFLECT_CHIPS = ['Plan ahead', 'Pause before buying', 'Celebrate progress', 'Spend on what matters']

function localMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function currencyAmount(amount: number, currency: string): string {
  try { return amountText(amount, currency) } catch { return `${currency} ${amount.toLocaleString()}` }
}

function getMonthTitle(value: string): string {
  const [year, month] = value.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function App() {
  const [screen, setScreen] = useState<Screen>('Home')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings())
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [plan, setPlan] = useState<MonthPlan>()
  const [reflection, setReflection] = useState<{ chips: string[]; note: string }>()
  const [previousSpent, setPreviousSpent] = useState(0)
  const [month, setMonth] = useState(localMonth())
  const initializedMonth = useRef(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [editing, setEditing] = useState<Expense>()
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [toast, setToast] = useState<{ text: string; id?: string }>()
  const [ritualStep, setRitualStep] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarDay, setCalendarDay] = useState('')
  const calendarRef = useRef<HTMLDivElement>(null)
  const widgetQuickAdd = useMemo(() => new URLSearchParams(window.location.search).has('widgetQuickAdd'), [])
  const [widgetNudgeVisible, setWidgetNudgeVisible] = useState(() => canAddHomeWidget() && window.localStorage.getItem('kakeibo.widgetNudgeSeen') !== '1')

  const refresh = useCallback(async () => {
    const [nextSettings, allExpenses, monthPlan, logs, allPlans] = await Promise.all([
      ensureSettings(), db.expenses.toArray(), db.plans.get(month), db.audit.orderBy('timestamp').reverse().toArray(), db.plans.toArray(),
    ])
    if (!initializedMonth.current) {
      initializedMonth.current = true
      const currentMonth = monthKey(new Date(), nextSettings.monthStartDay)
      if (currentMonth !== month) setMonth(currentMonth)
    }
    setSettings(nextSettings)
    const activeMonthExpenses = allExpenses.filter((expense) => !expense.deletedAt && monthKey(new Date(expense.date), nextSettings.monthStartDay) === month)
    setExpenses(activeMonthExpenses.sort((a, b) => b.date.localeCompare(a.date)))
    const [year, selectedMonth] = month.split('-').map(Number)
    const priorMonth = monthKey(new Date(year, selectedMonth - 2, nextSettings.monthStartDay), nextSettings.monthStartDay)
    const earlierTracked = allExpenses.filter((expense) => !expense.deletedAt && monthKey(new Date(expense.date), nextSettings.monthStartDay) === priorMonth).reduce((sum, expense) => sum + expense.amount, 0)
    setPreviousSpent(earlierTracked + (allPlans.find((item) => item.id === priorMonth)?.startingSpent ?? 0))
    setPlan(monthPlan)
    const savedReflection = await db.reflections.get(month)
    setReflection(savedReflection ? { chips: savedReflection.chips, note: savedReflection.note } : undefined)
    setAudit(logs)
    applyTheme(nextSettings.theme)
    setIsLoading(false)
    void updateHomeWidget(monthPlan, activeMonthExpenses, nextSettings)
    void scheduleKakeiboReminders(nextSettings)
  }, [month])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const listener = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', listener)
    return () => window.removeEventListener('focus', listener)
  }, [refresh])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault()
        setEditing(undefined)
        setExpenseOpen(true)
      }
      if (event.key === 'Escape') setExpenseOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!calendarOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !calendarRef.current?.contains(event.target)) setCalendarOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setCalendarOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [calendarOpen])

  const budget = useMemo(() => calculateBudget(plan, expenses), [plan, expenses])
  const activeCategories = settings.categories.filter((category) => !category.archived)
  const closeExpense = () => { setExpenseOpen(false); setEditing(undefined) }
  const openNewExpense = () => { setEditing(undefined); setExpenseOpen(true) }
  const notify = (text: string, id?: string) => {
    setToast({ text, id })
    window.setTimeout(() => setToast((current) => current?.text === text ? undefined : current), 4500)
  }

  async function handleSaveExpense(input: Pick<Expense, 'amount' | 'category' | 'pause' | 'date'>, id?: string) {
    try {
      await saveExpense(input, id)
      closeExpense()
      await refresh()
      notify(id ? 'Expense updated' : 'Expense saved')
      void updateHomeWidget(plan, expenses.filter((e) => !e.deletedAt), settings)
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save expense') }
  }

  async function handleDelete(id: string) {
    const item = await db.expenses.get(id)
    if (!item || !window.confirm(`Delete ${currencyAmount(item.amount, settings.currency)} expense? You can undo this.`)) return
    await deleteExpense(id)
    await refresh()
    notify('Expense deleted', id)
    void updateHomeWidget(plan, expenses.filter((e) => !e.deletedAt && e.id !== id), settings)
  }

  async function undoDelete(id: string) {
    await restoreExpense(id)
    await refresh()
    setToast(undefined)
    void updateHomeWidget(plan, expenses.filter((e) => !e.deletedAt), settings)
  }

  async function handleSaveSettings(patch: Partial<AppSettings>) {
    try {
      const next = await saveSettings(patch)
      setSettings(next)
      applyTheme(next.theme)
      await refresh()
      notify('Settings saved')
      void updateHomeWidget(plan, expenses.filter((e) => !e.deletedAt), next)
      void scheduleKakeiboReminders(next)
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save settings') }
  }

  async function handleAddWidget() {
    const result = await addHomeWidget()
    if (result === 'pinned') notify('Follow the prompt on your home screen to place the Kakeibo widget.')
    else if (result === 'unsupported') notify('Your launcher does not support adding widgets from apps. Long-press the home screen and open Widgets.')
    else notify('The home screen widget is available in the Android app.')
  }

  function dismissWidgetNudge() {
    window.localStorage.setItem('kakeibo.widgetNudgeSeen', '1')
    setWidgetNudgeVisible(false)
  }

  async function handleAddWidgetFromNudge() {
    await handleAddWidget()
    dismissWidgetNudge()
  }

  async function handleWidgetQuickAdd(amount: number, category: string): Promise<boolean> {
    try {
      await saveExpense({ amount, category, pause: 'Needed it', date: new Date().toISOString() })
      await refresh()
      window.setTimeout(() => { void closeWidgetQuickAdd() }, 120)
      return true
    } catch {
      return false
    }
  }

  if (widgetQuickAdd) {
    if (isLoading) return <div className="quickadd-backdrop"><section className="quickadd-card quickadd-loading">Preparing quick add…</section></div>
    return <WidgetQuickAdd currency={settings.currency} categories={activeCategories} onClose={() => void closeWidgetQuickAdd()} onSave={handleWidgetQuickAdd} />
  }

  if (isLoading) return <LoadingSkeleton />
  const monthControl = <div className="month-control" ref={calendarRef}>
    <button aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={17} /></button>
    <button className="month-trigger" aria-label="Open month calendar" aria-expanded={calendarOpen} onClick={() => setCalendarOpen((open) => !open)}><CalendarDays size={14} /><span>{getMonthTitle(month)}</span></button>
    <button aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={17} /></button>
    {calendarOpen && <CalendarPopover
      month={month}
      startDay={settings.monthStartDay}
      expenses={expenses}
      categories={activeCategories}
      currency={settings.currency}
      selectedDay={calendarDay}
      onSelectDay={(day, budgetMonth) => {
        setCalendarDay(day)
        if (budgetMonth !== month) setMonth(budgetMonth)
      }}
      onEdit={(expense) => { setEditing(expense); setExpenseOpen(true); setCalendarOpen(false) }}
      onDelete={(id) => void handleDelete(id)}
      onClose={() => setCalendarOpen(false)}
    />}
  </div>
  function shiftMonth(amount: number) {
    const [year, m] = month.split('-').map(Number)
    setMonth(monthKey(new Date(year, m - 1 + amount, settings.monthStartDay), settings.monthStartDay))
    setCalendarDay('')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setScreen('Home')}><img className="brand-logo" src="./kakeibo.png" alt="" /><span>Kakeibo</span></button>
        <button className="new-expense sidebar-add" onClick={openNewExpense}><Plus size={19} /> New expense <kbd>N</kbd></button>
        <nav className="side-nav">
          {NAV.map(({ name, icon: Icon }) => <button key={name} className={screen === name ? 'active' : ''} onClick={() => setScreen(name)}><Icon size={18} strokeWidth={screen === name ? 2.5 : 1.8} /><span>{name}</span></button>)}
          <div className="nav-divider" />
          <button className={screen === 'Ritual' ? 'active' : ''} onClick={() => setScreen('Ritual')}><HeartIcon size={18} fill={screen === 'Ritual' ? 'currentColor' : 'none'} /> Monthly ritual</button>
          <button className={screen === 'Audit' ? 'active' : ''} onClick={() => setScreen('Audit')}><ClockIcon size={18} fill={screen === 'Audit' ? 'currentColor' : 'none'} /> Audit log</button>
        </nav>
        <div className="sidebar-foot"><span className="offline"><i /> Works offline</span><button aria-label="Settings" onClick={() => setScreen('Settings')}><MoreHorizontal size={19} /></button></div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-heading">
            <button className="topbar-logo" aria-label="Kakeibo home" onClick={() => setScreen('Home')}><img src="./kakeibo.png" alt="" /></button>
            <div className="topbar-brand"><h1>Kakeibo</h1><p>A little more mindful</p></div>
            <div className="topbar-page-title"><div className="eyebrow">{screen === 'Home' ? 'A little more mindful' : screen}</div><h1>{screen === 'Home' ? 'Your month, gently.' : screen === 'Ritual' ? 'Your monthly ritual' : screen === 'Audit' ? 'A record of your choices' : screen === 'Sync' ? 'Sync devices' : screen === 'About' ? 'About Kakeibo' : screen}</h1></div>
          </div>
          <div className="top-actions">{monthControl}</div>
        </header>
        {screen === 'Home' && <HomeScreen budget={budget} plan={plan} month={month} expenses={expenses} settings={settings} categories={activeCategories} onAdd={openNewExpense} onEdit={(e) => { setEditing(e); setExpenseOpen(true) }} onDelete={handleDelete} onRitual={() => setScreen('Ritual')} onInsights={() => setScreen('Insights')} onPlanSaved={async (values) => { await savePlan({ ...values, id: month }); await refresh(); void updateHomeWidget(plan, expenses.filter((e) => !e.deletedAt), settings) }} onSetupComplete={() => void handleSaveSettings({ onboarded: true })} showWidgetNudge={widgetNudgeVisible && settings.onboarded} onAddWidget={() => void handleAddWidgetFromNudge()} onDismissWidgetNudge={dismissWidgetNudge} />}
        {screen === 'Insights' && <InsightsScreen expenses={expenses} budget={budget} categories={activeCategories} currency={settings.currency} previousSpent={previousSpent} />}
        {screen === 'History' && <HistoryScreen expenses={expenses} categories={activeCategories} currency={settings.currency} search={search} onSearch={setSearch} filter={filterCategory} onFilter={setFilterCategory} onEdit={(e) => { setEditing(e); setExpenseOpen(true) }} onDelete={handleDelete} onExport={() => void exportExcel(expenses, settings.currency, month, notify)} onPdf={() => void exportPdf(expenses, settings.currency, month, notify)} onImport={(rows) => void importExpenses(rows, settings, refresh, notify)} />}
        {screen === 'Journal' && <JournalScreen onChanged={refresh} notify={notify} />}
        {screen === 'Settings' && <SettingsScreen settings={settings} plan={plan} onSave={handleSaveSettings} onPlanSave={async (values) => { await savePlan({ ...values, id: month }); await refresh(); notify('Monthly plan saved'); void updateHomeWidget(plan, expenses.filter((e) => !e.deletedAt), settings) }} onDemoChange={async (enabled) => { await toggleDemo(enabled, settings, handleSaveSettings, month); await refresh(); void updateHomeWidget(plan, expenses.filter((e) => !e.deletedAt), settings) }} onExport={() => void exportBackup(notify)} onImport={(file) => void importBackup(file, refresh, notify)} onAudit={() => setScreen('Audit')} onSync={() => setScreen('Sync')} onAbout={() => setScreen('About')} onAddWidget={canAddHomeWidget() ? () => void handleAddWidget() : undefined} />}
        {screen === 'Ritual' && <RitualScreen step={ritualStep} onStep={setRitualStep} month={month} plan={plan} reflection={reflection} budget={budget} expenses={expenses} settings={settings} onPlanSaved={async (values) => { await savePlan({ ...values, id: month }); await refresh(); void updateHomeWidget(plan, expenses.filter((e) => !e.deletedAt), settings) }} onReflected={async (chips, note) => { await saveReflection({ id: month, chips, note }); await refresh(); notify('Reflection saved') }} />}
        {screen === 'Audit' && <AuditScreen logs={audit} search={search} onSearch={setSearch} />}
        {screen === 'Sync' && <SyncScreen onBack={() => setScreen('Settings')} onMerged={refresh} notify={notify} />}
        {screen === 'About' && <AboutScreen categories={settings.categories} onBack={() => setScreen('Settings')} />}
        <footer className="page-foot">Your money stays yours. <span>Stored only on this device.</span></footer>
      </main>
      <nav className="mobile-tabs" aria-label="Main navigation">
        {NAV.map(({ name, icon: Icon }) => <button key={name} className={screen === name ? 'active' : ''} onClick={() => setScreen(name)}><Icon size={19} strokeWidth={screen === name ? 2.5 : 1.8} /><span>{name}</span></button>)}
      </nav>
      <button className="mobile-floating-add" aria-label="New expense" title="New expense" onClick={openNewExpense}><Plus size={25} /></button>
      {expenseOpen && <ExpenseSheet expense={editing} categories={activeCategories} currency={settings.currency} onClose={closeExpense} onSave={handleSaveExpense} />}
      {toast && <div className="toast" role="status">{toast.text}{toast.id && <button onClick={() => void undoDelete(toast.id!)}>Undo</button>}<button className="toast-close" aria-label="Dismiss" onClick={() => setToast(undefined)}><X size={15} /></button></div>}
    </div>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function LoadingSkeleton() {
  return <div className="loading-skeleton" role="status" aria-label="Loading Kakeibo" aria-busy="true">
    <aside className="loading-sidebar"><img src="./kakeibo.png" alt="" /><i className="skeleton-line" />{Array.from({ length: 5 }, (_, index) => <i className="skeleton-nav" key={index} />)}</aside>
    <main className="loading-main"><header><img className="skeleton-mark" src="./kakeibo.png" alt="" /><div><i className="skeleton-line short" /><i className="skeleton-line title" /></div></header><section className="skeleton-budget"><div><i className="skeleton-line short" /><i className="skeleton-line amount" /><i className="skeleton-line medium" /></div><i className="skeleton-ring" /></section><section className="skeleton-categories">{Array.from({ length: 4 }, (_, index) => <div className="skeleton-card" key={index}><i className="skeleton-line medium" /><i className="skeleton-line amount" /><i className="skeleton-line" /></div>)}</section><section className="skeleton-lower"><div className="skeleton-card"><i className="skeleton-line medium" /><i className="skeleton-line" /><i className="skeleton-line" /></div><div className="skeleton-card"><i className="skeleton-line medium" /><i className="skeleton-line" /></div></section></main>
    <nav className="loading-tabs" aria-hidden="true"><i /><i /><i /><i /><i /></nav>
  </div>
}

function CategoryIcon({ category, size = 17 }: { category: Category; size?: number }) {
  const Icon = CATEGORY_ICONS[category.icon] ?? MoreHorizontal
  return <span className="category-icon" style={{ backgroundColor: `${category.color}42`, color: category.color }}><Icon size={size} /></span>
}

function SpendRing({ left, spendable, currency, savings }: { left: number; spendable: number; currency: string; savings: number }) {
  const progress = spendable > 0 ? Math.max(0, Math.min(100, (left / spendable) * 100)) : 0
  const circumference = 2 * Math.PI * 40
  return <div className="spend-card glass widget-card spend-card-row">
    <div className="spend-info"><span className="overline">SPENDABLE LEFT</span><strong className="spend-number">{currencyAmount(left, currency)}</strong><span className="spend-caption">after fixed costs{savings ? ' and your savings target' : ''}</span><div className="spend-total">Monthly spendable <b>{currencyAmount(spendable, currency)}</b></div></div>
    <div className="ring ring-side"><svg viewBox="0 0 100 100" aria-label={`${Math.round(progress)} percent spendable left`}><circle className="ring-track" cx="50" cy="50" r="40" /><circle className="ring-progress" cx="50" cy="50" r="40" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress / 100)} /></svg><div className="ring-inner"><span>{Math.round(progress)}%</span><small>left</small></div></div>
  </div>
}



function HomeScreen({ budget, plan, month, expenses, settings, categories, onAdd, onEdit, onDelete, onRitual, onInsights, onPlanSaved, onSetupComplete, showWidgetNudge, onAddWidget, onDismissWidgetNudge }: {
  budget: ReturnType<typeof calculateBudget>; plan?: MonthPlan; month: string; expenses: Expense[]; settings: AppSettings; categories: Category[]
  onAdd: () => void; onEdit: (expense: Expense) => void; onDelete: (id: string) => void; onRitual: () => void; onInsights: () => void; onPlanSaved: (plan: Omit<MonthPlan, 'id' | 'updatedAt'>) => Promise<void>; onSetupComplete: () => void
  showWidgetNudge: boolean; onAddWidget: () => void; onDismissWidgetNudge: () => void
}) {
  const hasPlan = !!plan
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return <div className="page-stack">
    {!settings.onboarded && <OnboardingCard settings={settings} month={month} plan={plan} onSave={onPlanSaved} onComplete={onSetupComplete} />}
    <h2 className="home-greeting">{greeting}</h2>
    {showWidgetNudge && <section className="widget-nudge" aria-label="Home screen widget suggestion">
      <span className="widget-nudge-icon"><Smartphone size={16} /></span>
      <span className="widget-nudge-copy"><b>Use the Kakeibo home widget</b><small>See spendable left at a glance and tap + Add to log an expense without opening the app.</small></span>
      <div className="widget-nudge-actions"><button className="button-primary widget-nudge-add" onClick={onAddWidget}>Add widget</button><button className="icon-button widget-nudge-close" aria-label="Not now" onClick={onDismissWidgetNudge}><X size={15} /></button></div>
    </section>}
    <SpendRing left={budget.spendableLeft} spendable={budget.spendable} currency={settings.currency} savings={budget.savings} />
    {budget.startingSpent > 0 && <p className="starting-spend-note">Spendable left includes {currencyAmount(budget.startingSpent, settings.currency)} spent before Kakeibo.</p>}
    {!hasPlan && <button className="setup-nudge" onClick={onRitual}><span className="nudge-icon"><Heart size={17} /></span><span><b>Begin with your plan</b><small>Add income and fixed costs to see your spendable amount.</small></span><ChevronRight size={19} /></button>}
    <div className="section-head"><div><span className="overline">YOUR MONTH</span><h2>Spending by category</h2></div><button className="text-button" onClick={onInsights}>Insights <ChevronRight size={15} /></button></div>
    <section className="category-grid">{categories.map((category) => {
      const total = budget.byCategory.get(category.name) ?? 0
      return <div key={category.id} className="category-card soft-card"><div className="cat-card-head"><CategoryIcon category={category} /><span className="category-label">{category.name}</span></div><strong>{currencyAmount(total, settings.currency)}</strong><div className="mini-track"><i style={{ width: `${categoryPercent(total, budget.trackedSpent)}%`, background: category.color }} /></div><small>{budget.trackedSpent ? Math.round(categoryPercent(total, budget.trackedSpent)) : 0}% of tracked spending</small></div>
    })}</section>
    <section className="two-col">
      <div className="panel recent-panel"><div className="section-head compact"><div><span className="overline">RECENT</span><h2>Last few choices</h2></div><button className="icon-link" aria-label="Open history" onClick={() => onInsights()}><ChevronRight size={17} /></button></div>
        {expenses.length ? <div className="expense-list compact-list">{expenses.slice(0, 5).map((expense) => <ExpenseRow key={expense.id} expense={expense} category={categories.find((c) => c.name === expense.category)} currency={settings.currency} onEdit={onEdit} onDelete={onDelete} />)}</div> : <EmptyState title="A fresh start." detail="Your choices will find a home here." />}
        <button className="panel-link" onClick={onAdd}><Plus size={16} /> Add an expense</button>
      </div>
      <div className="panel ritual-card"><div className="ritual-art"><img src="./kakeibo.png" alt="Kakeibo" /></div><div><span className="overline">A MONTHLY PAUSE</span><h2>Make room to reflect.</h2><p>A gentle four-step check-in for your money and your life.</p><button className="button-primary" onClick={onRitual}>Open your ritual <ChevronRight size={15} /></button></div></div>
    </section>
  </div>
}

function CalendarPopover({ month, startDay, expenses, categories, currency, selectedDay, onSelectDay, onEdit, onDelete, onClose }: {
  month: string
  startDay: number
  expenses: Expense[]
  categories: Category[]
  currency: string
  selectedDay: string
  onSelectDay: (day: string, budgetMonth: string) => void
  onEdit: (expense: Expense) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const { dates, first, last } = getBudgetCalendarDates(month, startDay)
  const totals = summarizeExpensesByLocalDay(expenses)
  const maxDailySpend = Math.max(0, ...[...totals.values()].map(({ amount }) => amount))
  const dayExpenses = expenses.filter((expense) => localDateKey(new Date(expense.date)) === selectedDay)
  const selectedTotal = totals.get(selectedDay)?.amount ?? 0
  const today = localDateKey(new Date())
  const abbreviatedAmount = (amount: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(amount)
  const periodLabel = startDay === 1
    ? ''
    : `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  return <section className="calendar-popover" role="dialog" aria-label="Monthly expense calendar">
    <header className="calendar-header">
      <div><h2>{getMonthTitle(month)}</h2>{periodLabel && <small>Budget period · {periodLabel}</small>}</div>
      <button className="icon-button" aria-label="Close calendar" onClick={onClose}><X size={17} /></button>
    </header>
    <div className="calendar-grid calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid calendar-days">
      {dates.map((date) => {
        const key = localDateKey(date)
        const total = totals.get(key)
        const belongsToPeriod = date >= first && date <= last
        const level = total && maxDailySpend ? Math.max(1, Math.ceil(total.amount / maxDailySpend * 4)) : 0
        return <button
          key={key}
          className={`calendar-day ${belongsToPeriod ? '' : 'outside-period'} ${key === today ? 'today' : ''} ${selectedDay === key ? 'selected' : ''} ${level ? `spend-level-${level}` : ''}`}
          aria-label={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}${total ? `, ${total.count} expenses, ${currencyAmount(total.amount, currency)}` : ', no expenses'}`}
          aria-pressed={selectedDay === key}
          title={total ? currencyAmount(total.amount, currency) : 'No expenses'}
          onClick={() => onSelectDay(key, monthKey(date, startDay))}
        >
          <span>{date.getDate()}</span>
          {total && <small>{abbreviatedAmount(total.amount)}</small>}
        </button>
      })}
    </div>
    <div className="calendar-legend"><span>Daily spending</span><i className="spend-level-1" /><i className="spend-level-2" /><i className="spend-level-3" /><i className="spend-level-4" /></div>
    {selectedDay && <section className="calendar-day-details" aria-live="polite">
      <header><div><h3>{new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3><small>{dayExpenses.length} {dayExpenses.length === 1 ? 'expense' : 'expenses'} · {currencyAmount(selectedTotal, currency)}</small></div></header>
      {dayExpenses.length
        ? <div className="expense-list compact-list">{dayExpenses.map((expense) => <ExpenseRow key={expense.id} expense={expense} category={categories.find((category) => category.name === expense.category)} currency={currency} onEdit={onEdit} onDelete={onDelete} />)}</div>
        : <p className="calendar-empty">No expenses recorded for this day.</p>}
    </section>}
  </section>
}

function OnboardingCard({ settings, month, plan, onSave, onComplete }: {
  settings: AppSettings; month: string; plan?: MonthPlan
  onSave: (plan: Omit<MonthPlan, 'id' | 'updatedAt'>) => Promise<void>; onComplete: () => void
}) {
  const [income, setIncome] = useState(String(plan?.income ?? ''))
  const [fixed, setFixed] = useState(String(plan?.fixed ?? ''))
  const [startingSpent, setStartingSpent] = useState(String(plan?.startingSpent ?? ''))
  const [savings, setSavings] = useState(plan?.savingsTarget == null ? '' : String(plan.savingsTarget))
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const hasMonthStarted = (() => {
    const [year, selectedMonth] = month.split('-').map(Number)
    const start = new Date(year, selectedMonth - 1, settings.monthStartDay)
    return new Date() >= start && new Date().toDateString() !== start.toDateString()
  })()
  async function finish(skipSavings = false) {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        income: Number(income) || 0,
        fixed: Number(fixed) || 0,
        startingSpent: hasMonthStarted ? Number(startingSpent) || 0 : 0,
        savingsTarget: !skipSavings && savings ? Number(savings) : null,
      })
      onComplete()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your monthly plan.')
    } finally {
      setSaving(false)
    }
  }
  const labels = ['Welcome', 'Your month', 'Savings']
  const spendable = (Number(income) || 0) - (Number(fixed) || 0) - (Number(savings) || 0) - (Number(startingSpent) || 0)
  return <div className="onboarding-card panel">
    <div className="onboard-progress">{labels.map((_, index) => <i key={index} className={index <= step ? 'done' : ''} />)}</div>
    <span className="overline">A GENTLE START · {step + 1} OF 3</span>
    {step === 0 && <>
      <div className="onboard-welcome"><img src="./kakeibo.png" alt="" /><div><h2>Welcome to Kakeibo</h2><p>A household account book, and a little room to notice.</p></div></div>
      <KakeiboGuide categories={settings.categories} compact />
      <p className="onboard-pause-note">A one-tap pause—<b>Needed it</b>, <b>Wanted it</b>, or <b>Regret</b>—helps you notice without judging yourself.</p>
    </>}
    {step === 1 && <>
      <h2>Start with this month as it is.</h2>
      <p>Use your current numbers; you can adjust them any time.</p>
      <div className="onboard-plan-fields">
        <label className="form-field">Monthly take-home income<input autoFocus type="number" min="0" inputMode="decimal" value={income} onChange={(event) => setIncome(event.target.value)} placeholder="0" /></label>
        <label className="form-field">Fixed costs<input type="number" min="0" inputMode="decimal" value={fixed} onChange={(event) => setFixed(event.target.value)} placeholder="0" /></label>
        {hasMonthStarted && <label className="form-field">Already spent this month <small>Optional · before Kakeibo</small><input type="number" min="0" inputMode="decimal" value={startingSpent} onChange={(event) => setStartingSpent(event.target.value)} placeholder="0" /></label>}
      </div>
      {hasMonthStarted && <p className="starting-spend-help">Add a single total if you are joining partway through the month. It reduces spendable money without inventing categories or entries.</p>}
    </>}
    {step === 2 && <>
      <h2>Would you like a savings target?</h2>
      <p>It is completely optional. Kakeibo works fully without one.</p>
      <label className="onboard-amount">{settings.currency}<input autoFocus type="number" min="0" inputMode="decimal" placeholder="Skip if you like" value={savings} onChange={(event) => setSavings(event.target.value)} /></label>
      <div className="onboard-spendable"><span>Spendable left to start</span><b>{currencyAmount(spendable, settings.currency)}</b></div>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="onboard-actions">
      {step > 0 && <button className="button-quiet back-button" onClick={() => setStep(step - 1)}><span className="back-icon"><ChevronLeft size={16} /></span> Back</button>}
      <button className="button-primary" disabled={saving} onClick={() => step === 2 ? void finish() : setStep(step + 1)}>{saving ? 'Saving…' : step === 2 ? 'Start my month' : 'Continue'} <ChevronRight size={16} /></button>
      {step === 2 && <button className="text-button" disabled={saving} onClick={() => { setSavings(''); void finish(true) }}>Skip target</button>}
    </div>
  </div>
}

function KakeiboGuide({ categories, compact = false }: { categories: Category[]; compact?: boolean }) {
  const descriptions: Record<string, string> = {
    survival: 'Everyday needs: housing, utilities, groceries, transport, and health.',
    optional: 'Wants and discretionary choices: eating out, subscriptions, and non-essentials.',
    culture: 'Books, learning, arts, and experiences that enrich your life.',
    extra: 'Irregular or unexpected costs, such as repairs, gifts, or one-offs.',
  }
  return <section className={`kakeibo-guide ${compact ? 'compact' : ''}`}>
    <p><b>Kakeibo</b> (“household account book”) was popularized in Japan by journalist Hani Motoko in 1904. Its purpose is to make money visible: notice what comes in, plan what matters, record choices, then reflect without blame.</p>
    <p>The four categories are a practical budgeting lens, not moral labels. Rename them to fit your life.</p>
    <div className="category-guide-grid">{categories.filter((category) => !category.archived).map((category) => <div key={category.id}><CategoryIcon category={category} size={15} /><span><b>{category.name}</b><small>{descriptions[category.id] ?? 'A flexible category for the way you choose to budget.'}</small></span></div>)}</div>
    {!compact && <>
      <p className="kakeibo-questions">The monthly questions: How much is available? How much would I like to save? How much did I spend? What could I change next month?</p>
      <article className="kakeibo-article">
        <header className="kakeibo-article-heading">
          <span className="overline">A PRACTICE, NOT A TEST</span>
          <h2>Make room to notice your money.</h2>
          <p>Kakeibo brings planning, everyday tracking, and a quiet monthly review together. The aim is not perfect spending; it is learning what feels worthwhile and making small, considered adjustments.</p>
        </header>
        <figure className="kakeibo-article-figure kakeibo-article-cover">
          <img src="/kakeibo-guide/kakeibo-budgeting.webp" alt="A person writes down household expenses in a notebook." decoding="async" />
          <figcaption>A little time with your numbers can make everyday choices easier to see.</figcaption>
        </figure>
        <section className="kakeibo-article-section">
          <h3>A household ledger with a mindful focus</h3>
          <p>Kakeibo became known in Japan in the early 1900s through journalist Hani Motoko. The name describes a household account book. In modern use, it is less a strict formula than a repeatable way to connect income, spending, and personal priorities.</p>
          <p>Rather than trying to change everything at once, begin by observing. A written record and a regular review can make habits visible; any changes can be gradual and specific to your circumstances.</p>
        </section>
        <section className="kakeibo-article-section">
          <h3>Four useful questions each month</h3>
          <div className="kakeibo-question-grid">
            <div><b>What came in?</b><span>Start with the income available for this period.</span></div>
            <div><b>What should be set aside?</b><span>Note fixed costs and, if it suits you, a savings goal.</span></div>
            <div><b>Where did it go?</b><span>Record expenses and review the category totals.</span></div>
            <div><b>What might I change?</b><span>Choose one practical adjustment to try next time.</span></div>
          </div>
        </section>
        <figure className="kakeibo-article-figure">
          <img src="/kakeibo-guide/kakeibo-budgeting-3.webp" alt="Illustration of a repeating six-step Kakeibo practice, from tracking through reflection." decoding="async" />
          <figcaption>The cycle is flexible: repeat it, learn, and adjust it to your life.</figcaption>
        </figure>
        <section className="kakeibo-article-section">
          <h3>How the practice fits this app</h3>
          <ol className="kakeibo-steps">
            <li><b>Start:</b> record income and fixed costs; add a savings target only if you want one.</li>
            <li><b>Track:</b> log a purchase, choose a category, and take a one-tap pause.</li>
            <li><b>End:</b> look over the month’s totals and notice where spending gathered.</li>
            <li><b>Reflect:</b> pick one thing to keep, change, or explore in the coming month.</li>
          </ol>
          <p>These are prompts, not rules. A category is a tool for understanding a purchase, never a score or a judgement.</p>
        </section>
        <figure className="kakeibo-article-figure">
          <img src="/kakeibo-guide/kakeibo-budgeting-1.webp" alt="Diagram showing behavior change as a cycle of learning and returning to action." decoding="async" />
          <figcaption>Change can move in small steps, with learning along the way.</figcaption>
        </figure>
        <section className="kakeibo-article-section kakeibo-article-two-col">
          <div>
            <h3>Who might enjoy it?</h3>
            <p>A reflective budget can suit people who like journaling, gentle routines, flexible plans, or working toward a personal goal.</p>
          </div>
          <div>
            <h3>What to keep in mind</h3>
            <p>Regular entry takes attention, and missed purchases can make a review less complete. Keep the habit small: capture what you can, then return without blame.</p>
          </div>
        </section>
        <figure className="kakeibo-article-figure">
          <img src="/kakeibo-guide/kakeibo-budgeting-2.webp" alt="Illustration of a calm journal, a simple routine, and goal-setting." decoding="async" />
          <figcaption>Make the routine fit the way you already live.</figcaption>
        </figure>
        <section className="kakeibo-article-section">
          <h3>Gentle prompts for your reflection</h3>
          <ul className="kakeibo-reflection-prompts">
            <li>Which purchase felt most useful or meaningful?</li>
            <li>Was there a choice I would approach differently next time?</li>
            <li>What would I like to make room for in the next period?</li>
          </ul>
        </section>
        <p className="kakeibo-source">For further reading: <a href="https://www.pocketsmith.com/methodologies/kakeibo/" target="_blank" rel="noreferrer">PocketSmith’s guide to Kakeibo</a>. The illustrations above are displayed from the supplied local files; the guide text here is an original summary.</p>
      </article>
    </>}
  </section>
}

function AboutScreen({ categories, onBack }: { categories: Category[]; onBack: () => void }) {
  return <div className="settings-stack about-screen">
    <button className="button-quiet back-button" onClick={onBack}><span className="back-icon"><ChevronLeft size={17} /></span> Back to Settings</button>
    <section className="panel settings-group about-guide-panel"><KakeiboGuide categories={categories} /></section>
  </div>
}

function ExpenseRow({ expense, category, currency, onEdit, onDelete }: { expense: Expense; category?: Category; currency: string; onEdit: (expense: Expense) => void; onDelete: (id: string) => void }) {
  const touchStart = useRef<number | null>(null)
  return <div className="expense-row" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null }} onTouchEnd={(event) => {
    if (touchStart.current === null) return
    const distance = event.changedTouches[0]?.clientX - touchStart.current
    touchStart.current = null
    if (distance < -65) onDelete(expense.id)
    else if (distance > 65) onEdit(expense)
  }}><CategoryIcon category={category ?? { id: 'other', name: expense.category, icon: 'ShoppingBag', color: '#A8ACCB', archived: false }} /><div className="expense-main"><strong>{expense.note || expense.category}</strong><small>{expense.category} <span>·</span> {new Date(expense.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} <span>·</span> {expense.pause}</small></div><strong className="expense-amount">{currencyAmount(expense.amount, currency)}</strong><div className="row-actions"><button title="Edit expense" onClick={() => onEdit(expense)}><Pencil size={14} /></button><button title="Delete expense" onClick={() => onDelete(expense.id)}><Trash2 size={14} /></button></div></div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span>◌</span><b>{title}</b><small>{detail}</small></div>
}

function ExpenseSheet({ expense, categories, currency, onClose, onSave }: {
  expense?: Expense; categories: Category[]; currency: string; onClose: () => void
  onSave: (input: Pick<Expense, 'amount' | 'category' | 'pause' | 'date'>, id?: string) => void
}) {
  const [digits, setDigits] = useState(expense ? String(expense.amount) : '')
  const [category, setCategory] = useState(expense?.category ?? categories[0]?.name ?? 'Survival')
  const [pause, setPause] = useState<Expense['pause']>(expense?.pause ?? 'Needed it')
  const [date, setDate] = useState(expense?.date.slice(0, 10) ?? localDay())
  const value = Number(digits)
  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') { e.preventDefault(); key('⌫') }
      else if (e.key === 'Enter') { /* noop, handled by save */ }
      else if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); key(e.key) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [digits])
  function key(value: string) {
    if (value === '⌫') setDigits((current) => current.slice(0, -1))
    else if (value === '.' && digits.includes('.')) return
    else if (digits.length < 12) setDigits((current) => current + value)
  }
  return <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className="expense-sheet" role="dialog" aria-modal="true" aria-label="Add expense"><div className="sheet-handle" /><header className="sheet-head"><div><span className="overline">A MOMENT BEFORE YOU SPEND</span><h2>{expense ? 'Edit this choice' : 'What did you spend?'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header><div className="amount-display"><span>{currency}</span><strong>{digits ? Number(digits).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}</strong></div>
    <div className="keypad">{keypad.map((number) => <button key={number} className={number === '⌫' ? 'delete-key' : ''} onClick={() => key(number)} aria-label={number === '⌫' ? 'Delete digit' : number}>{number === '⌫' ? <ArrowLeft size={18} /> : number}</button>)}</div>
    <div className="sheet-group"><div className="sheet-label">CATEGORY</div><div className="category-chips">{categories.map((item) => <button key={item.id} className={category === item.name ? 'selected' : ''} onClick={() => setCategory(item.name)}><CategoryIcon category={item} size={15} />{item.name}</button>)}</div></div>
    <div className="sheet-group pause-group"><div className="sheet-label">PAUSE · WHAT FEELS TRUE?</div><div className="pause-chips">{PAUSE_TAGS.map((tag) => <button key={tag} className={pause === tag ? 'selected' : ''} onClick={() => setPause(tag)}>{tag === 'Needed it' ? 'Needed it' : tag === 'Wanted it' ? 'Wanted it' : 'Regret'}</button>)}</div></div>
    <label className="date-line"><span>{new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Expense date" /></label>
    <button className="button-primary save-expense" disabled={!Number.isFinite(value) || value <= 0 || !category} onClick={() => onSave({ amount: value, category, pause, date: new Date(`${date}T12:00:00`).toISOString() }, expense?.id)}>{expense ? 'Save changes' : 'Done'} <Check size={17} /></button>
    <p className="sheet-footnote">No judgement. Just noticing.</p>
  </section></div>
}

function InsightsScreen({ expenses, budget, categories, currency, previousSpent }: { expenses: Expense[]; budget: ReturnType<typeof calculateBudget>; categories: Category[]; currency: string; previousSpent: number }) {
  const wantedTotal = budget.wanted + budget.needed
  const wantedPct = wantedTotal ? Math.round((budget.wanted / wantedTotal) * 100) : 0
  const daily = new Array(7).fill(0).map((_, index) => {
    const end = new Date()
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - end.getDay() + index)
    return { day: start.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1), value: expenses.filter((e) => new Date(e.date).toDateString() === start.toDateString()).reduce((sum, e) => sum + e.amount, 0) }
  })
  const max = Math.max(...daily.map((item) => item.value), 1)
  const circles = categories.map((category) => ({ category, value: budget.byCategory.get(category.name) ?? 0 })).filter((item) => item.value > 0)
  const donutCircumference = 2 * Math.PI * 43
  const startingLength = budget.spent ? budget.startingSpent / budget.spent * donutCircumference : 0
  let donutOffset = 0
  return <div className="page-stack">
    <section className="insight-top panel"><div><span className="overline">THIS MONTH</span><h2>Every little choice adds up.</h2><p>Your spending, seen with kindness.</p></div><div className="insight-total"><strong>{currencyAmount(budget.spent, currency)}</strong><small>{budget.startingSpent ? `${currencyAmount(budget.startingSpent, currency)} before Kakeibo` : 'total spent'}</small></div></section>
    <div className="insight-grid">
      <section className="panel chart-panel"><div className="section-head compact"><div><span className="overline">WHERE IT WENT</span><h2>By category</h2></div></div><div className="donut-wrap"><div className="donut"><svg viewBox="0 0 100 100" aria-label="Spending by category"><circle className="donut-track" cx="50" cy="50" r="43" />{circles.map(({ category, value }) => { const length = budget.spent ? value / budget.spent * donutCircumference : 0; const offset = donutOffset; donutOffset += length; return <circle key={category.id} cx="50" cy="50" r="43" fill="none" stroke={category.color} strokeWidth="12" strokeDasharray={`${length} ${donutCircumference - length}`} strokeDashoffset={-offset} /> })}{startingLength > 0 && <circle cx="50" cy="50" r="43" fill="none" stroke="var(--faint)" strokeWidth="12" strokeDasharray={`${startingLength} ${donutCircumference - startingLength}`} strokeDashoffset={-donutOffset} />}</svg><div><strong>{currencyAmount(budget.spent, currency)}</strong><small>spent</small></div></div><div className="donut-legend">{categories.map((c) => <div key={c.id}><i style={{ background: c.color }} /><span>{c.name}</span><b>{currencyAmount(budget.byCategory.get(c.name) ?? 0, currency)}</b></div>)}{budget.startingSpent > 0 && <div><i className="untracked-spend-dot" /><span>Before Kakeibo</span><b>{currencyAmount(budget.startingSpent, currency)}</b></div>}</div></div></section>
      <section className="panel chart-panel"><div className="section-head compact"><div><span className="overline">THIS WEEK</span><h2>A gentle rhythm</h2></div></div><div className="weekly-chart">{daily.map(({ day, value }, i) => <div key={i} className="bar-col"><div className="bar-slot"><i style={{ height: `${value ? Math.max(5, value / max * 100) : 3}%`, opacity: value ? 1 : .22 }} /></div><small>{day}</small></div>)}</div><div className="chart-caption">Spent day by day</div></section>
      <section className="panel ratio-panel"><span className="overline">WANTED VS NEEDED</span><h2>Spend with intention.</h2><div className="ratio-rail"><i style={{ width: `${wantedPct}%` }} /></div><div className="ratio-legend"><span><i className="want-dot" />Wanted <b>{currencyAmount(budget.wanted, currency)}</b></span><span><i className="need-dot" />Needed <b>{currencyAmount(budget.needed, currency)}</b></span></div><small>{budget.wanted || budget.needed ? `${wantedPct}% of tagged spending was wanted.` : 'Your pause tags will show up here.'}</small></section>
      <section className="panel month-compare"><span className="overline">MONTH AT A GLANCE</span><h2>A few kind numbers.</h2><div><span>Income</span><b>{currencyAmount(budget.income, currency)}</b></div><div><span>Fixed costs</span><b>{currencyAmount(budget.fixed, currency)}</b></div><div><span>Savings target</span><b>{budget.savings ? currencyAmount(budget.savings, currency) : 'Not set'}</b></div><div className="compare-last"><span>Spent so far</span><b>{currencyAmount(budget.spent, currency)}</b></div><div className="month-change"><span>Last month</span><b>{currencyAmount(previousSpent, currency)}</b><small>{previousSpent ? `${budget.spent >= previousSpent ? '+' : '−'}${Math.round(Math.abs(budget.spent - previousSpent) / previousSpent * 100)}%` : 'No earlier data'}</small></div></section>
    </div>
  </div>
}

type ImportRow = Pick<Expense, 'amount' | 'category' | 'pause' | 'date'>

function HistoryScreen({ expenses, categories, currency, search, onSearch, filter, onFilter, onEdit, onDelete, onExport, onPdf, onImport }: {
  expenses: Expense[]; categories: Category[]; currency: string; search: string; onSearch: (value: string) => void; filter: string; onFilter: (value: string) => void; onEdit: (expense: Expense) => void; onDelete: (id: string) => void; onExport: () => void; onPdf: () => void; onImport: (rows: ImportRow[]) => void
}) {
  const [preview, setPreview] = useState<{ fileName: string; rows: ImportRow[]; skipped: number }>()
  const [importError, setImportError] = useState('')
  const [reading, setReading] = useState(false)
  const filtered = expenses.filter((expense) => (filter === 'All' || expense.category === filter) && `${expense.category} ${expense.note ?? ''} ${expense.pause}`.toLowerCase().includes(search.toLowerCase()))
  const byDay = new Map<string, Expense[]>()
  for (const expense of filtered) {
    const key = expense.date.slice(0, 10)
    byDay.set(key, [...(byDay.get(key) ?? []), expense])
  }
  return <div className="panel history-panel"><div className="history-toolbar"><label className="search-field"><Search size={16} /><input placeholder="Search expenses" value={search} onChange={(e) => onSearch(e.target.value)} /></label><select value={filter} onChange={(e) => onFilter(e.target.value)}><option>All</option>{categories.map((c) => <option key={c.id}>{c.name}</option>)}</select><div className="history-actions"><button className="button-quiet" onClick={onExport}><FileSpreadsheet size={15} /> Excel</button><button className="button-quiet" onClick={onPdf}><Download size={15} /> PDF</button><label className="button-quiet file-import"><ArrowUpFromLine size={15} /> Import<input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setReading(true); setImportError(''); void parseImportFile(file).then((result) => { if (!result.rows.length) throw new Error('No valid expenses found. Include Amount and Category columns.') ; setPreview({ fileName: file.name, ...result }) }).catch((error: unknown) => setImportError(error instanceof Error ? error.message : 'Could not read this spreadsheet.')).finally(() => setReading(false)) } e.currentTarget.value = '' }} /></label></div></div>
    {byDay.size ? [...byDay.entries()].map(([day, items]) => <section className="history-day" key={day}><div className="day-head"><span>{new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span><b>{currencyAmount(items.reduce((sum, e) => sum + e.amount, 0), currency)}</b></div>{items.map((e) => <ExpenseRow key={e.id} expense={e} category={categories.find((c) => c.name === e.category)} currency={currency} onEdit={onEdit} onDelete={onDelete} />)}</section>) : <EmptyState title={search ? 'Nothing found.' : 'No choices yet.'} detail={search ? 'Try another search.' : 'Add your first expense when you’re ready.'} />}
    {importError && <p className="import-error" role="alert">{importError}</p>}
    {reading && <div className="import-status">Reading your spreadsheet…</div>}
    {preview && <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreview(undefined) }}><section className="import-preview panel" role="dialog" aria-modal="true" aria-label="Review import"><button className="icon-button preview-close" onClick={() => setPreview(undefined)} aria-label="Close"><X size={18} /></button><span className="overline">BEFORE IT COMES IN</span><h2>Review your expenses</h2><p>{preview.fileName} · {preview.rows.length} ready to import{preview.skipped ? ` · ${preview.skipped} blank or invalid rows skipped` : ''}</p><div className="preview-rows"><div className="preview-heading"><span>Date</span><span>Category</span><span>Amount</span></div>{preview.rows.slice(0, 5).map((row, i) => <div key={i}><span>{row.date.slice(0, 10)}</span><span>{row.category}</span><b>{currencyAmount(row.amount, currency)}</b></div>)}{preview.rows.length > 5 && <small>and {preview.rows.length - 5} more…</small>}</div><div className="preview-actions"><button className="button-quiet back-button" onClick={() => setPreview(undefined)}><span className="back-icon"><ChevronLeft size={16} /></span> Back</button><button className="button-primary" onClick={() => { onImport(preview.rows); setPreview(undefined) }}>Import {preview.rows.length} expenses <ArrowDownToLine size={15} /></button></div></section></div>}
  </div>
}

function RitualScreen({ step, onStep, month, plan, reflection, budget, expenses, settings, onPlanSaved, onReflected }: {
  step: number; onStep: (n: number) => void; month: string; plan?: MonthPlan; reflection?: { chips: string[]; note: string }; budget: ReturnType<typeof calculateBudget>; expenses: Expense[]; settings: AppSettings
  onPlanSaved: (plan: Omit<MonthPlan, 'id' | 'updatedAt'>) => Promise<void>; onReflected: (chips: string[], note: string) => Promise<void>
}) {
  const steps = ['Start', 'Track', 'End', 'Reflect']
  const [income, setIncome] = useState(String(plan?.income ?? ''))
  const [fixed, setFixed] = useState(String(plan?.fixed ?? ''))
  const [startingSpent, setStartingSpent] = useState(String(plan?.startingSpent ?? ''))
  const [savings, setSavings] = useState(plan?.savingsTarget == null ? '' : String(plan.savingsTarget))
  const [chips, setChips] = useState<string[]>(reflection?.chips ?? [])
  const [note, setNote] = useState(reflection?.note ?? '')
  useEffect(() => {
    setIncome(String(plan?.income ?? ''))
    setFixed(String(plan?.fixed ?? ''))
    setStartingSpent(String(plan?.startingSpent ?? ''))
    setSavings(plan?.savingsTarget == null ? '' : String(plan.savingsTarget))
  }, [plan])
  useEffect(() => {
    setChips(reflection?.chips ?? [])
    setNote(reflection?.note ?? '')
  }, [reflection])
  const next = () => onStep(Math.min(3, step + 1))
  return <div className="ritual-layout"><div className="ritual-stepper">{steps.map((label, index) => <button key={label} onClick={() => onStep(index)} className={step === index ? 'current' : index < step ? 'complete' : ''}><i>{index < step ? <Check size={14} /> : index + 1}</i><span>{label}</span></button>)}</div><section className="ritual-page panel"><span className="overline">{getMonthTitle(month).toUpperCase()} · STEP {step + 1} OF 4</span>{step === 0 && <><h2>Begin with what you have.</h2><p>What is coming in, and what is already spoken for?</p><label className="form-field">Monthly income<input type="number" min="0" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="0" /></label><label className="form-field">Fixed costs<input type="number" min="0" value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="0" /></label><label className="form-field">Spent earlier this month <small>Optional · before Kakeibo</small><input type="number" min="0" value={startingSpent} onChange={(e) => setStartingSpent(e.target.value)} placeholder="0" /></label><label className="form-field">Savings target <small>Optional</small><input type="number" min="0" value={savings} onChange={(e) => setSavings(e.target.value)} placeholder="Skip if you like" /></label><div className="spendable-preview"><span>Spendable left now</span><b>{currencyAmount((Number(income) || 0) - (Number(fixed) || 0) - (Number(savings) || 0) - (Number(startingSpent) || 0), settings.currency)}</b></div><button className="button-primary" onClick={() => void onPlanSaved({ income: Number(income) || 0, fixed: Number(fixed) || 0, startingSpent: Number(startingSpent) || 0, savingsTarget: savings ? Number(savings) : null }).then(next)}>Save & continue <ChevronRight size={16} /></button></>}
      {step === 1 && <><h2>Notice your choices as they happen.</h2><p>A quick pause is enough. No need to be perfect.</p><div className="track-summary"><div><b>{expenses.length}</b><span>choices made</span></div><div><b>{currencyAmount(budget.spent, settings.currency)}</b><span>spent with care</span></div></div><div className="ritual-tip"><Heart size={19} /><span>Every expense has a one-tap pause: Needed it, Wanted it, or Regret.</span></div><button className="button-primary" onClick={next}>Continue <ChevronRight size={16} /></button></>}
      {step === 2 && <><h2>Look back without judgement.</h2><p>Your month so far, in a few numbers.</p><div className="end-totals">{[['Came in', budget.income], ['Set aside', budget.savings], ['Spent', budget.spent], ['Spendable left', budget.spendableLeft]].map(([label, amount]) => <div key={String(label)}><span>{label}</span><b>{currencyAmount(Number(amount), settings.currency)}</b></div>)}</div><button className="button-primary" onClick={next}>Take a moment <ChevronRight size={16} /></button></>}
      {step === 3 && <><h2>What would you like to carry forward?</h2><p>Pick one or more, or simply leave a note for yourself.</p><div className="reflect-chips">{REFLECT_CHIPS.map((chip) => <button key={chip} className={chips.includes(chip) ? 'selected' : ''} onClick={() => setChips((current) => current.includes(chip) ? current.filter((value) => value !== chip) : [...current, chip])}>{chips.includes(chip) && <Check size={14} />}{chip}</button>)}</div><label className="form-field">A note to future you <small>Optional</small><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Keep it kind and simple…" /></label><button className="button-primary" onClick={() => void onReflected(chips, note)}>Save reflection <Check size={16} /></button></>}
    </section></div>
}

function SettingsScreen({ settings, plan, onSave, onPlanSave, onDemoChange, onExport, onImport, onAudit, onSync, onAbout, onAddWidget }: {
  settings: AppSettings; plan?: MonthPlan; onSave: (patch: Partial<AppSettings>) => Promise<void>; onPlanSave: (plan: Omit<MonthPlan, 'id' | 'updatedAt'>) => Promise<void>; onDemoChange: (enabled: boolean) => void; onExport: () => void; onImport: (file: File) => void; onAudit: () => void; onSync: () => void
  onAbout: () => void
  onAddWidget?: () => void
}) {
  const [settingsOpen, setSettingsOpen] = useState<Record<string, boolean>>({ month: true, categories: false, feel: true, widget: true, reminders: false, data: false, about: false, demo: false })
  const toggle = (key: string) => setSettingsOpen((s) => ({ ...s, [key]: !s[key] }))
  const [categories, setCategories] = useState(settings.categories)
  const [editingId, setEditingId] = useState<string>()
  const [categoryName, setCategoryName] = useState('')
  const [income, setIncome] = useState(String(plan?.income ?? ''))
  const [fixed, setFixed] = useState(String(plan?.fixed ?? ''))
  const [startingSpent, setStartingSpent] = useState(String(plan?.startingSpent ?? ''))
  const [savings, setSavings] = useState(plan?.savingsTarget == null ? '' : String(plan.savingsTarget))
  const [savingsEnabled, setSavingsEnabled] = useState(plan?.savingsTarget != null)
  const [remindersEnabled, setRemindersEnabled] = useState(settings.remindersEnabled ?? true)
  const [reminderMiddayTime, setReminderMiddayTime] = useState(settings.reminderMiddayTime ?? '12:00')
  const [reminderNightTime, setReminderNightTime] = useState(settings.reminderNightTime ?? '21:00')
  const [reminderWeeklyEnabled, setReminderWeeklyEnabled] = useState(settings.reminderWeeklyEnabled ?? true)
  const [reminderWeeklyDay, setReminderWeeklyDay] = useState(String(settings.reminderWeeklyDay ?? 0))
  useEffect(() => { setCategories(settings.categories) }, [settings.categories])
  useEffect(() => { setRemindersEnabled(settings.remindersEnabled ?? true); setReminderMiddayTime(settings.reminderMiddayTime ?? '12:00'); setReminderNightTime(settings.reminderNightTime ?? '21:00'); setReminderWeeklyEnabled(settings.reminderWeeklyEnabled ?? true); setReminderWeeklyDay(String(settings.reminderWeeklyDay ?? 0)); }, [settings]);
  const saveCategoryList = async (next: Category[]) => {
    if (new Set(next.map((category) => category.name.trim().toLocaleLowerCase())).size !== next.length) {
      window.alert('Each category needs a unique name.')
      return
    }
    const renamed = categories.flatMap((previous) => {
      const current = next.find((item) => item.id === previous.id)
      return current && current.name.trim() !== previous.name ? [{ previous: previous.name, current: current.name.trim() }] : []
    })
    for (const change of renamed) {
      const matching = await db.expenses.where('category').equals(change.previous).toArray()
      for (const expense of matching) {
        await db.expenses.update(expense.id, { category: change.current, updatedAt: new Date().toISOString() })
        await recordAudit({ entity: 'expense', entityId: expense.id, action: 'updated', summary: `Moved expense to ${change.current}`, data: JSON.stringify({ from: change.previous, to: change.current }) })
      }
    }
    setCategories(next)
    await onSave({ categories: next })
  }
  function beginEdit(category: Category) { setEditingId(category.id); setCategoryName(category.name) }
  return <div className="settings-stack">
    <section className="panel settings-group"><header className="settings-header-clickable" onClick={() => toggle('month')}><span className="settings-icon"><Wallet size={18} /></span><div><h2>Your month</h2><small>Budget basics and timing</small></div><ChevronRight size={18} className={`chev ${settingsOpen.month ? 'open' : ''}`} /></header>
      {settingsOpen.month && <><div className="settings-row"><span>Monthly income</span><input aria-label="Monthly income" className="settings-number" type="number" min="0" value={income} onChange={(event) => setIncome(event.target.value)} placeholder="0" /></div>
      <div className="settings-row"><span>Fixed costs</span><input aria-label="Fixed costs" className="settings-number" type="number" min="0" value={fixed} onChange={(event) => setFixed(event.target.value)} placeholder="0" /></div>
      <div className="settings-row"><label htmlFor="settings-starting-spent">Spent before Kakeibo <small>Optional</small></label><input id="settings-starting-spent" aria-label="Spent before Kakeibo" className="settings-number" type="number" min="0" value={startingSpent} onChange={(event) => setStartingSpent(event.target.value)} placeholder="0" /></div>
      <div className="settings-row"><label htmlFor="settings-savings">Savings target <small>Optional</small></label><div className="saving-row"><label className="toggle-inline"><input type="checkbox" checked={savingsEnabled} onChange={(event) => { setSavingsEnabled(event.target.checked); if (event.target.checked && savings === '') setSavings('0') }} /><span>On</span></label>{savingsEnabled && <input id="settings-savings" aria-label="Savings target" className="settings-number" type="number" min="0" value={savings} onChange={(event) => setSavings(event.target.value)} placeholder="0" />}</div></div>
      <div className="settings-row"><span>Currency</span><Select value={settings.currency} onChange={(v) => void onSave({ currency: v })} options={[['ETB', 'ETB · Ethiopian birr'], ['USD', 'USD · US dollar'], ['EUR', 'EUR · Euro'], ['GBP', 'GBP · British pound'], ['KES', 'KES · Kenyan shilling'], ['CAD', 'CAD · Canadian dollar']].map(([value, label]) => ({ value, label }))} /></div>
      <div className="settings-row"><span>Month starts on</span><Select value={String(settings.monthStartDay)} onChange={(v) => void onSave({ monthStartDay: Number(v) })} options={[{ value: '1', label: '1st of the month' }, { value: '15', label: '15th of the month' }]} /></div>
      <button className="button-primary plan-save" onClick={() => void onPlanSave({ income: Number(income) || 0, fixed: Number(fixed) || 0, startingSpent: Number(startingSpent) || 0, savingsTarget: savingsEnabled ? Number(savings) || 0 : null })}>Save monthly plan</button></>}
    </section>
    <section className="panel settings-group"><header className="settings-header-clickable" onClick={() => toggle('categories')}><span className="settings-icon"><MoreHorizontal size={18} /></span><div><h2>Your categories</h2><small>Four gentle buckets. Make them yours.</small></div><ChevronRight size={18} className={`chev ${settingsOpen.categories ? 'open' : ''}`} /></header>{settingsOpen.categories && <><div className="settings-categories">{categories.map((category) => <div className={`settings-category ${category.archived ? 'archived' : ''}`} key={category.id}>{editingId === category.id ? <><input autoFocus value={categoryName} onChange={(e) => setCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { void saveCategoryList(categories.map((c) => c.id === category.id ? { ...c, name: categoryName.trim() || c.name } : c)); setEditingId(undefined) } }} /><button onClick={() => { void saveCategoryList(categories.map((c) => c.id === category.id ? { ...c, name: categoryName.trim() || c.name } : c)); setEditingId(undefined) }}><Check size={15} /></button></> : <><CategoryIcon category={category} /><b>{category.name}</b><select aria-label={`Icon for ${category.name}`} value={category.icon} onChange={(e) => void saveCategoryList(categories.map((c) => c.id === category.id ? { ...c, icon: e.target.value } : c))}>{Object.keys(CATEGORY_ICONS).map((icon) => <option key={icon}>{icon}</option>)}</select><input aria-label={`${category.name} color`} type="color" value={category.color} onChange={(e) => void saveCategoryList(categories.map((c) => c.id === category.id ? { ...c, color: e.target.value } : c))} /><button title="Rename" onClick={() => beginEdit(category)}><Pencil size={14} /></button><button title={category.archived ? 'Unarchive' : 'Archive'} onClick={() => void saveCategoryList(categories.map((c) => c.id === category.id ? { ...c, archived: !c.archived } : c))}>{category.archived ? <ArrowUpFromLine size={15} /> : <Trash2 size={14} />}</button></>}</div>)}</div><button className="text-button add-category" onClick={() => { const name = window.prompt('Name your new category'); if (!name?.trim()) return; void saveCategoryList([...categories, { id: uid(), name: name.trim(), icon: 'ShoppingBag', color: '#A8ACCB', archived: false }]) }}><Plus size={16} /> Add category</button></>}</section>
    <section className="panel settings-group"><header className="settings-header-clickable" onClick={() => toggle('feel')}><span className="settings-icon"><Sun size={18} /></span><div><h2>Appearance</h2><small>Quiet, comfortable, and yours.</small></div><ChevronRight size={18} className={`chev ${settingsOpen.feel ? 'open' : ''}`} /></header>{settingsOpen.feel && <><div className="settings-row"><span>Theme</span><Select value={settings.theme} onChange={(v) => void onSave({ theme: v as AppSettings['theme'] })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Match device' }]} /></div></>}</section>
    {onAddWidget && <section className="panel settings-group"><header className="settings-header-clickable" onClick={() => toggle('widget')}><span className="settings-icon"><Plus size={18} /></span><div><h2>Home screen widget</h2><small>See what is left without opening Kakeibo.</small></div><ChevronRight size={18} className={`chev ${settingsOpen.widget ? 'open' : ''}`} /></header>{settingsOpen.widget && <div className="settings-row"><span>Add the spendable-left widget to your home screen</span><button className="button-quiet" onClick={onAddWidget}><Plus size={16} /> Add widget</button></div>}</section>}
    <section className="panel settings-group"><header className="settings-header-clickable" onClick={() => toggle('reminders')}><span className="settings-icon"><Clock3 size={18} /></span><div><h2>Reminders</h2><small>Gentle nudges to register your spending.</small></div><ChevronRight size={18} className={`chev ${settingsOpen.reminders ? 'open' : ''}`} /></header>{settingsOpen.reminders && <><div className="settings-row"><span>Enable reminders</span><Toggle checked={remindersEnabled} onChange={(v) => { setRemindersEnabled(v); void onSave({ remindersEnabled: v }) }} /></div><div className="settings-row"><span>Midday reminder</span><TimePicker value={reminderMiddayTime} onChange={(v) => { setReminderMiddayTime(v); void onSave({ reminderMiddayTime: v }) }} disabled={!remindersEnabled} /></div><div className="settings-row"><span>Night reminder</span><TimePicker value={reminderNightTime} onChange={(v) => { setReminderNightTime(v); void onSave({ reminderNightTime: v }) }} disabled={!remindersEnabled} /></div><div className="settings-row"><span>Weekly report</span><Toggle checked={reminderWeeklyEnabled} onChange={(v) => { setReminderWeeklyEnabled(v); void onSave({ reminderWeeklyEnabled: v }) }} disabled={!remindersEnabled} /></div><div className="settings-row"><span>Weekly report day</span><Select value={reminderWeeklyDay} onChange={(v) => { setReminderWeeklyDay(v); void onSave({ reminderWeeklyDay: Number(v) }) }} disabled={!remindersEnabled || !reminderWeeklyEnabled} options={[{ value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' }, { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' }, { value: '5', label: 'Friday' }, { value: '6', label: 'Saturday' }]} /></div></>}</section>
    <section className="panel settings-group"><header className="settings-header-clickable" onClick={() => toggle('data')}><span className="settings-icon"><ArrowDownToLine size={18} /></span><div><h2>Your data</h2><small>Keep a copy or move it with you.</small></div><ChevronRight size={18} className={`chev ${settingsOpen.data ? 'open' : ''}`} /></header>{settingsOpen.data && <div className="data-actions"><button className="button-quiet" onClick={onExport}><Download size={16} /> Backup data</button><label className="button-quiet file-import"><ArrowUpFromLine size={16} /> Restore backup<input type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) onImport(file); e.currentTarget.value = '' }} /></label><button className="button-quiet" onClick={onSync}><RefreshCw size={16} /> Sync devices</button><button className="button-quiet" onClick={onAudit}><Clock3 size={16} /> View audit log</button></div>}</section>
    <section className="panel settings-group"><header className="settings-header-clickable" onClick={() => toggle('about')}><span className="settings-icon"><Info size={18} /></span><div><h2>About Kakeibo</h2><small>Its roots, purpose, and categories</small></div><ChevronRight size={18} className={`chev ${settingsOpen.about ? 'open' : ''}`} /></header>{settingsOpen.about && <button className="settings-link" onClick={onAbout}><span><b>Explore Kakeibo</b><small>Open the illustrated guide and monthly practice.</small></span><ChevronRight size={18} /></button>}</section>
    <section className="panel settings-group demo-setting"><header className="settings-header-clickable" onClick={() => toggle('demo')}><span className="settings-icon"><CircleHelp size={18} /></span><div><h2>Trying things out?</h2><small>Demo data stays local and is easy to remove.</small></div><ChevronRight size={18} className={`chev ${settingsOpen.demo ? 'open' : ''}`} /></header>{settingsOpen.demo && <div className="settings-row"><span>Seed sample expenses</span><Toggle checked={settings.demoEnabled} onChange={(v) => onDemoChange(v)} /></div>}</section>
    <p className="settings-note">No account. No cloud. Your financial life stays on this device.</p>
  </div>
}

function AuditScreen({ logs, search, onSearch }: { logs: AuditEntry[]; search: string; onSearch: (value: string) => void }) {
  const filtered = logs.filter((log) => `${log.action} ${log.entity} ${log.summary} ${log.timestamp}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="panel audit-panel"><label className="search-field"><Search size={16} /><input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search your activity" /></label>{filtered.length ? <div className="audit-list">{filtered.map((entry) => <div key={entry.id} className="audit-entry"><span className={`audit-dot ${entry.action}`} /><div><b>{entry.summary}</b><small>{entry.entity} · {entry.action}</small></div><time>{new Date(entry.timestamp).toLocaleString()}</time></div>)}</div> : <EmptyState title="A clean slate." detail="Changes will be recorded here, just for you." />}</div>
}

async function exportExcel(expenses: Expense[], currency: string, month: string, notify: (text: string) => void) {
  try {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Kakeibo'
    const sheet = workbook.addWorksheet('Monthly choices')
    sheet.addRow(['Date', 'Amount', 'Currency', 'Category', 'Pause'])
    expenses.forEach((expense) => sheet.addRow([expense.date.slice(0, 10), expense.amount, currency, expense.category, expense.pause]))
    sheet.getRow(1).font = { bold: true, color: { argb: 'FF343D35' } }
    sheet.columns = [{ width: 18 }, { width: 18 }, { width: 12 }, { width: 20 }, { width: 20 }]
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())
    await shareBytes(`Kakeibo_${month}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    notify('Excel export ready')
  } catch (error) { notify(error instanceof Error ? error.message : 'Could not export Excel') }
}

async function exportPdf(expenses: Expense[], currency: string, month: string, notify: (text: string) => void) {
  try {
    const pdf = new jsPDF()
    const totals = new Map<string, number>()
    for (const expense of expenses) totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount)
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
    pdf.setTextColor(52, 61, 53)
    pdf.setFontSize(22)
    pdf.text('Kakeibo', 18, 22)
    pdf.setFontSize(10)
    pdf.setTextColor(115, 124, 115)
    pdf.text(`${getMonthTitle(month)} · Monthly summary`, 18, 30)
    pdf.setDrawColor(218, 222, 214)
    pdf.line(18, 37, 192, 37)
    pdf.setFontSize(10)
    pdf.text('SPENT THIS MONTH', 18, 49)
    pdf.setFontSize(21)
    pdf.setTextColor(52, 61, 53)
    pdf.text(currencyAmount(total, currency), 18, 60)
    pdf.setFontSize(10)
    pdf.setTextColor(115, 124, 115)
    pdf.text(`${expenses.length} mindful ${expenses.length === 1 ? 'choice' : 'choices'}`, 18, 68)
    let y = 86
    const plan = await db.plans.get(month)
    for (const [label, amount] of [['Income', plan?.income], ['Fixed costs', plan?.fixed], ['Savings target', plan?.savingsTarget], ['Spendable', (plan?.income ?? 0) - (plan?.fixed ?? 0) - (plan?.savingsTarget ?? 0)]] as const) {
      pdf.setFontSize(9)
      pdf.text(label, 18, y)
      pdf.text(amount == null ? 'Not set' : currencyAmount(amount, currency), 190, y, { align: 'right' })
      y += 7
    }
    y += 4
    pdf.setTextColor(52, 61, 53)
    pdf.setFontSize(12)
    pdf.text('By category', 18, y)
    y += 11
    for (const [category, amount] of totals) {
      pdf.setFontSize(10)
      pdf.text(category, 18, y)
      pdf.text(currencyAmount(amount, currency), 190, y, { align: 'right' })
      y += 9
    }
    y += 7
    pdf.setDrawColor(218, 222, 214)
    pdf.line(18, y, 192, y)
    y += 10
    pdf.setFontSize(12)
    pdf.text('Recent choices', 18, y)
    y += 8
    for (const expense of expenses.slice(0, 15)) {
      if (y > 275) { pdf.addPage(); y = 20 }
      pdf.setFontSize(9)
      pdf.setTextColor(52, 61, 53)
      pdf.text(`${expense.date.slice(0, 10)}  ·  ${expense.note || expense.category}  ·  ${expense.pause}`, 18, y, { maxWidth: 130 })
      pdf.text(currencyAmount(expense.amount, currency), 190, y, { align: 'right' })
      y += 8
    }
    const bytes = new Uint8Array(pdf.output('arraybuffer'))
    await shareBytes(`Kakeibo_summary_${month}.pdf`, bytes, 'application/pdf')
    notify('PDF summary ready')
  } catch (error) { notify(error instanceof Error ? error.message : 'Could not export PDF') }
}

async function parseImportFile(file: File): Promise<{ rows: ImportRow[]; skipped: number }> {
  let matrix: unknown[][]
  if (/\.csv$/i.test(file.name)) {
    matrix = parseCsvMatrix(await file.text())
  } else {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer() as never)
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new Error('This file has no worksheet.')
    matrix = []
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: unknown[] = []
      row.eachCell({ includeEmpty: true }, (cell, column) => { values[column - 1] = cellValue(cell.value) })
      matrix.push(values)
    })
  }
  const headers = (matrix[0] ?? []).map((value) => String(value ?? '').trim().toLowerCase())
  const index = (name: string) => headers.indexOf(name)
  const amountCol = index('amount')
  const categoryCol = index('category')
  if (amountCol < 0 || categoryCol < 0) throw new Error('Import needs Amount and Category columns.')
  const dateCol = index('date')
  const pauseCol = index('pause')
  const rows: ImportRow[] = []
  let skipped = 0
  for (const [rowNumber, row] of matrix.slice(1).entries()) {
    if (row.every((value) => String(value ?? '').trim() === '')) continue
    const amount = parseAmount(row[amountCol])
    const category = String(row[categoryCol] ?? '').trim()
    if (amount === null || amount <= 0 || !category) { skipped += 1; continue }
    const rawDate = dateCol >= 0 ? row[dateCol] : undefined
    let date = new Date()
    if (rawDate instanceof Date) date = rawDate
    else if (typeof rawDate === 'number' && rawDate > 10000) date = new Date(Math.round((rawDate - 25569) * 86400000))
    else if (String(rawDate ?? '').trim()) date = new Date(String(rawDate))
    if (!Number.isFinite(date.getTime())) throw new Error(`The date in row ${rowNumber + 2} could not be read.`)
    const rawPause = pauseCol >= 0 ? String(row[pauseCol] ?? '').trim() : ''
    const pause = PAUSE_TAGS.includes(rawPause as Expense['pause']) ? rawPause as Expense['pause'] : 'Needed it'
    rows.push({ amount, category, pause, date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString() })
  }
  return { rows, skipped }
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value == null) return ''
  if (typeof value === 'object' && 'result' in value) return value.result ?? ''
  if (typeof value === 'object' && 'richText' in value) return value.richText.map((part) => part.text).join('')
  if (typeof value === 'object' && 'text' in value) return value.text
  return value
}

function parseCsvMatrix(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const delimiters = [',', ';', '\t']
  let delimiter = ','
  let quote = false
  const scores = delimiters.map((candidate) => {
    let score = 0
    for (let i = 0; i < text.length && text[i] !== '\n'; i += 1) {
      if (text[i] === '"') quote = !quote
      else if (!quote && text[i] === candidate) score += 1
    }
    quote = false
    return score
  })
  delimiter = delimiters[scores.indexOf(Math.max(...scores))]
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (char === '"') inQuotes = false
      else field += char
    } else if (char === '"' && field.length === 0) inQuotes = true
    else if (char === delimiter) { row.push(field); field = '' }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field); rows.push(row); row = []; field = ''
    } else field += char
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

async function importExpenses(rows: ImportRow[], settings: AppSettings, refresh: () => Promise<void>, notify: (text: string) => void) {
  try {
    await db.transaction('rw', [db.expenses, db.audit], async () => {
      for (const row of rows) {
        const category = settings.categories.find((item) => item.name.toLowerCase() === row.category.toLowerCase())?.name ?? row.category
        await saveExpense({ ...row, category })
      }
    })
    await refresh()
    notify(`${rows.length} expense${rows.length === 1 ? '' : 's'} imported`)
  } catch (error) { notify(error instanceof Error ? error.message : 'Could not import these expenses') }
}

async function exportBackup(notify: (text: string) => void) {
  try {
    const payload = { version: 1, exportedAt: new Date().toISOString(), tables: { expenses: await db.expenses.toArray(), plans: await db.plans.toArray(), reflections: await db.reflections.toArray(), journals: await db.journals.toArray(), settings: await db.settings.toArray(), audit: await db.audit.toArray() } }
    await shareBytes(`Kakeibo_backup_${localMonth()}.json`, new TextEncoder().encode(JSON.stringify(payload, null, 2)), 'application/json')
    notify('Backup saved')
  } catch (error) { notify(error instanceof Error ? error.message : 'Could not create backup') }
}

async function importBackup(file: File, refresh: () => Promise<void>, notify: (text: string) => void) {
  try {
    const payload = JSON.parse(await file.text()) as { version?: number; tables?: Record<string, unknown[]> }
    if (payload.version !== 1 || !payload.tables || !Array.isArray(payload.tables.expenses)) throw new Error('This is not a Kakeibo backup.')
    if (!window.confirm('Restore this backup? Current data will be replaced.')) return
    await db.transaction('rw', [db.expenses, db.plans, db.reflections, db.journals, db.settings, db.audit], async () => {
      for (const table of [db.expenses, db.plans, db.reflections, db.journals, db.settings, db.audit]) await table.clear()
      for (const name of ['expenses', 'plans', 'reflections', 'journals', 'settings', 'audit']) {
        const rows = payload.tables?.[name]
        if (rows?.length) await db.table(name).bulkPut(rows as never[])
      }
    })
    await refresh()
    notify('Backup restored')
  } catch (error) { notify(error instanceof Error ? error.message : 'Could not restore backup') }
}

async function toggleDemo(enabled: boolean, settings: AppSettings, onSave: (patch: Partial<AppSettings>) => Promise<void>, month: string) {
  if (enabled) {
    const existingDemo = (await db.expenses.toArray()).some((expense) => !expense.deletedAt && expense.demo)
    if (!existingDemo) {
      for (const expense of DEMO_EXPENSES) await saveExpense({ amount: expense.amount, category: expense.category, pause: expense.pause, date: expense.date, note: expense.note, demo: true })
    }
    if (!(await db.plans.get(month))) await savePlan({ id: month, income: 12000, fixed: 3200, savingsTarget: 1500, demo: true })
  } else {
    const candidates = await db.expenses.toArray()
    for (const expense of candidates) if (!expense.deletedAt && expense.demo) await deleteExpense(expense.id)
    const plan = await db.plans.get(month)
    if (plan?.demo) {
      await db.plans.delete(month)
      await recordAudit({ entity: 'plan', entityId: month, action: 'deleted', summary: `Removed demo plan for ${month}`, data: JSON.stringify(plan) })
    }
  }
  await onSave({ ...settings, demoEnabled: enabled })
}

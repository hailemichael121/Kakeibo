import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import type { Category } from '@/db/db'
import { amountText } from '@/db/db'
import { parseAmount } from '@/domain/amount'
import { showWidgetKeyboard } from '@/lib/widget'

interface WidgetQuickAddProps {
  currency: string
  categories: Category[]
  onClose: () => void
  onSave: (amount: number, category: string) => Promise<boolean>
}

export function WidgetQuickAdd({ currency, categories, onClose, onSave }: WidgetQuickAddProps) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[0]?.name ?? 'Survival')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focus = window.setTimeout(() => {
      inputRef.current?.focus()
      void showWidgetKeyboard()
    }, 250)
    const keyboard = window.setTimeout(() => void showWidgetKeyboard(), 800)
    return () => {
      window.clearTimeout(focus)
      window.clearTimeout(keyboard)
    }
  }, [])

  function updateAmount(value: string) {
    const next = value.replace(',', '.').replace(/[^\d.]/g, '')
    if (next.split('.').length > 2) return
    setAmount(next)
    setError('')
  }

  async function submit() {
    const value = parseAmount(amount)
    if (busy || !value || value <= 0 || !category) return
    setBusy(true)
    setError('')
    const saved = await onSave(value, category)
    if (!saved) {
      setBusy(false)
      setError('Could not add this expense. Try again.')
    }
  }

  return (
    <div className="quickadd-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="quickadd-card" role="dialog" aria-modal="true" aria-label="Quick add expense">
        <header className="quickadd-head">
          <div>
            <span className="overline">KAIKEBO · QUICK ADD</span>
            <h2>What did you spend?</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close quick add"><X size={19} /></button>
        </header>

        <label className="quickadd-amount">
          <span>{currency}</span>
          <input
            ref={inputRef}
            value={amount}
            onChange={(event) => updateAmount(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            enterKeyHint="done"
            autoComplete="off"
            autoFocus
            aria-label="Expense amount"
            placeholder="0"
          />
        </label>

        {amount && <p className="quickadd-preview">{amountText(Number(amount) || 0, currency)}</p>}

        <div className="quickadd-category-label">CATEGORY</div>
        <div className="quickadd-categories">
          {categories.map((item) => (
            <button
              key={item.id}
              className={category === item.name ? 'selected' : ''}
              onClick={() => setCategory(item.name)}
            >
              {item.name}
            </button>
          ))}
        </div>

        {error && <p className="quickadd-error">{error}</p>}

        <button
          className="button-primary quickadd-save"
          disabled={busy || !parseAmount(amount) || Number(amount) <= 0 || !category}
          onClick={() => void submit()}
        >
          {busy ? 'Adding…' : 'Add expense'} <Check size={17} />
        </button>
      </section>
    </div>
  )
}

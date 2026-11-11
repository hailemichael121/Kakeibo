import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'

export type DialogTone = 'default' | 'danger'

export interface ConfirmOptions {
  title: string
  message?: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: DialogTone
  notice?: boolean
  icon?: ReactNode
}

export interface PromptOptions extends ConfirmOptions {
  label?: string
  placeholder?: string
  initialValue?: string
  required?: boolean
  multiline?: boolean
  validate?: (value: string) => string | undefined
}

type Request =
  | { id: number; kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { id: number; kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }

let enqueue: ((request: Request) => void) | null = null
let sequence = 0

function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!enqueue) {
      resolve(false)
      return
    }
    enqueue({ id: ++sequence, kind: 'confirm', options, resolve })
  })
}

export const confirmDialog = askConfirm
export const noticeDialog = (options: ConfirmOptions) => askConfirm({ ...options, notice: true })

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!enqueue) {
      resolve(null)
      return
    }
    enqueue({ id: ++sequence, kind: 'prompt', options, resolve })
  })
}

export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([])
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const active = queue[0]

  const finish = useCallback((result: boolean | string | null) => {
    const first = queue[0]
    if (!first) return
    setQueue((current) => current.slice(1))
    if (first.kind === 'confirm') first.resolve(typeof result === 'boolean' ? result : false)
    else first.resolve(typeof result === 'string' ? result : null)
  }, [queue])

  useEffect(() => {
    enqueue = (request) => setQueue((current) => [...current, request])
    return () => { enqueue = null }
  }, [])

  useEffect(() => {
    if (!active) return
    setValue(active.kind === 'prompt' ? (active.options.initialValue ?? '') : '')
    setError('')
    const timer = window.setTimeout(() => {
      if (active.kind === 'prompt') inputRef.current?.focus()
      else document.querySelector<HTMLButtonElement>('[data-dialog-primary]')?.focus()
    }, 30)
    return () => window.clearTimeout(timer)
  }, [active])

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(active.kind === 'prompt' ? null : false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, finish])

  if (!active) return null

  const options = active.options
  const promptOptions = active.kind === 'prompt' ? active.options : null
  const danger = options.tone === 'danger'
  const cancel = () => finish(active.kind === 'prompt' ? null : false)

  function submit() {
    if (!active) return
    if (active.kind === 'prompt') {
      const text = value.trim()
      if (active.options.required && !text) {
        setError(active.options.label ? `${active.options.label} is required.` : 'Enter a value to continue.')
        return
      }
      const validation = active.options.validate?.(text)
      if (validation) {
        setError(validation)
        return
      }
      finish(text)
      return
    }
    finish(true)
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel() }}>
    <section className={`dialog-card liquid-glass ${danger ? 'dialog-danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={options.message ? 'dialog-message' : undefined}>
      <header className="dialog-head">
        <span className={`dialog-icon ${danger ? 'danger' : ''}`}>{options.icon ?? (danger ? <AlertTriangle size={18} /> : <Info size={18} />)}</span>
        <div className="dialog-copy">
          <h2 id="dialog-title">{options.title}</h2>
          {options.message && <p id="dialog-message">{options.message}</p>}
        </div>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={cancel}><X size={16} /></button>
      </header>
      {promptOptions && <div className="dialog-field">
        {promptOptions.label && <label htmlFor="dialog-input">{promptOptions.label}</label>}
        {promptOptions.multiline
          ? <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} id="dialog-input" rows={3} value={value} placeholder={promptOptions.placeholder} onChange={(event) => { setValue(event.target.value); setError('') }} />
          : <input ref={inputRef as React.RefObject<HTMLInputElement>} id="dialog-input" value={value} placeholder={promptOptions.placeholder} onChange={(event) => { setValue(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit() } }} />}
        {error && <p className="dialog-error" role="alert">{error}</p>}
      </div>}
      {options.detail && <p className="dialog-detail">{options.detail}</p>}
      <div className="dialog-actions">
        {!options.notice && <button type="button" className="button-quiet" onClick={cancel}>{options.cancelLabel ?? 'Cancel'}</button>}
        <button type="button" data-dialog-primary className={danger ? 'button-danger' : 'button-primary'} onClick={submit}>{options.confirmLabel ?? 'Continue'}</button>
      </div>
    </section>
  </div>
}

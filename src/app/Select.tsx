import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

type Option = { value: string; label: string }

type SelectProps = {
  value: string
  onChange: (value: string) => void
  options: Option[]
  disabled?: boolean
  ariaLabel?: string
}

export function Select({ value, onChange, options, disabled, ariaLabel }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (disabled) {
    return <div className="custom-select disabled"><span>{current?.label ?? value}</span><ChevronDown size={16} /></div>
  }

  return (
    <div className="custom-select" ref={ref}>
      <button className="custom-select-trigger" aria-label={ariaLabel} onClick={() => setOpen((v) => !v)} type="button">
        <span>{current?.label ?? value}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="custom-select-menu liquid-glass">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`custom-select-item ${opt.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

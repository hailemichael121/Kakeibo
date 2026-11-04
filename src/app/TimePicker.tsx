import { useEffect, useMemo, useRef, useState } from 'react'

type TimePickerProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 60 }, (_, i) => i)

export function TimePicker({ value, onChange, disabled }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const [h, setH] = useState(12)
  const [m, setM] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const [hh, mm] = value.split(':').map((x) => Number.parseInt(x, 10))
    if (Number.isFinite(hh)) setH(hh)
    if (Number.isFinite(mm)) setM(mm)
  }, [value])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const display = useMemo(() => {
    const hh = h.toString().padStart(2, '0')
    const mm = m.toString().padStart(2, '0')
    return `${hh}:${mm}`
  }, [h, m])

  const apply = () => {
    const hh = h.toString().padStart(2, '0')
    const mm = m.toString().padStart(2, '0')
    onChange(`${hh}:${mm}`)
    setOpen(false)
  }

  if (disabled) {
    return <div className="time-pill disabled">{display}</div>
  }

  return (
    <div className="time-picker" ref={ref}>
      <button className="time-pill" onClick={() => setOpen((v) => !v)} type="button">
        {display}
      </button>
      {open && (
        <div className="time-sheet liquid-glass">
          <div className="time-sheet-header">
            <span>Select time</span>
            <button onClick={apply} className="time-apply">Done</button>
          </div>
          <div className="time-wheel-row">
            <div className="time-wheel">
              <div className="time-wheel-fade top" />
              <div className="time-wheel-fade bottom" />
              <div className="time-wheel-highlight" />
              <div className="time-wheel-scroll">
                {hours.map((hour) => (
                  <button
                    key={hour}
                    className={`time-wheel-item ${hour === h ? 'active' : ''}`}
                    onClick={() => setH(hour)}
                  >
                    {hour.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
            <span className="time-colon">:</span>
            <div className="time-wheel">
              <div className="time-wheel-fade top" />
              <div className="time-wheel-fade bottom" />
              <div className="time-wheel-highlight" />
              <div className="time-wheel-scroll">
                {minutes.map((min) => (
                  <button
                    key={min}
                    className={`time-wheel-item ${min === m ? 'active' : ''}`}
                    onClick={() => setM(min)}
                  >
                    {min.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

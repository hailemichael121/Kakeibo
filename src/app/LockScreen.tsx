import { useCallback, useEffect, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { biometricLockStatus, pinIsValid, unlockWithBiometric, verifyAppPin } from '@/lib/lock'
import type { AppSettings } from '@/db/db'

type LockScreenProps = {
  settings: AppSettings
  onUnlocked: () => void
}

export function LockScreen({ settings, onUnlocked }: LockScreenProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [biometricReady, setBiometricReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!settings.lockUseBiometric) return
      const status = await biometricLockStatus()
      if (!cancelled) setBiometricReady(status.available && status.enrolled)
    })()
    return () => { cancelled = true }
  }, [settings.lockUseBiometric])

  const tryBiometric = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const ok = await unlockWithBiometric()
    setBusy(false)
    if (ok) onUnlocked()
    else setError('Could not confirm your fingerprint. Use your PIN instead.')
  }, [busy, onUnlocked])

  useEffect(() => {
    if (!biometricReady || !settings.lockUseBiometric) return
    void tryBiometric()
  }, [biometricReady, settings.lockUseBiometric, tryBiometric])

  async function tryPin(nextPin: string) {
    if (!pinIsValid(nextPin)) return
    setBusy(true)
    setError('')
    const ok = await verifyAppPin(nextPin, settings)
    setBusy(false)
    if (ok) {
      setPin('')
      onUnlocked()
      return
    }
    setPin('')
    setError('That PIN did not match.')
  }

  function pressDigit(digit: string) {
    if (busy) return
    const next = `${pin}${digit}`.slice(0, 4)
    setPin(next)
    setError('')
    if (next.length === 4) void tryPin(next)
  }

  function backspace() {
    if (busy) return
    setPin((value) => value.slice(0, -1))
    setError('')
  }

  return (
    <div className="lock-screen" role="dialog" aria-label="Kakeibo is locked">
      <section className="lock-card panel">
        <img className="lock-logo" src="./kakeibo.png" alt="" />
        <h1>Kakeibo is locked</h1>
        <p>Enter your PIN{biometricReady ? ' or use fingerprint' : ''} to continue.</p>
        <div className="lock-dots" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => <i key={index} className={index < pin.length ? 'filled' : ''} />)}
        </div>
        {error && <p className="lock-error" role="alert">{error}</p>}
        {biometricReady && (
          <button type="button" className="button-quiet lock-bio" disabled={busy} onClick={() => void tryBiometric()}>
            <Fingerprint size={18} /> Use fingerprint
          </button>
        )}
        <div className="lock-keypad" aria-label="PIN keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((key) => (
            <button
              key={key}
              type="button"
              className={key === 'clear' ? 'lock-key muted' : 'lock-key'}
              disabled={busy}
              aria-label={key === 'back' ? 'Backspace' : key === 'clear' ? 'Clear PIN' : key}
              onClick={() => {
                if (key === 'back') backspace()
                else if (key === 'clear') setPin('')
                else pressDigit(key)
              }}
            >
              {key === 'back' ? '⌫' : key === 'clear' ? 'Clear' : key}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

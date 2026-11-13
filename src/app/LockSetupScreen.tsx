import { useEffect, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { buildLockSetupPatch, deviceSupportsBiometric, pinIsValid } from '@/lib/lock'
import type { AppSettings } from '@/db/db'
import { Toggle } from './Toggle'

type LockSetupScreenProps = {
  onSave: (patch: Partial<AppSettings>) => Promise<void>
  /** Existing installs completing the mandatory lock migration. */
  upgrading?: boolean
}

export function LockSetupScreen({ onSave, upgrading = false }: LockSetupScreenProps) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [useBiometric, setUseBiometric] = useState(true)
  const [biometricReady, setBiometricReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const supported = await deviceSupportsBiometric()
      if (!cancelled) {
        setBiometricReady(supported)
        setUseBiometric(supported)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function submit() {
    setError('')
    if (!pinIsValid(pin) || !pinIsValid(confirmPin)) {
      setError('Choose a four-digit PIN.')
      return
    }
    if (pin !== confirmPin) {
      setError('PIN entries do not match.')
      return
    }
    setBusy(true)
    try {
      const patch = await buildLockSetupPatch(pin, biometricReady && useBiometric)
      await onSave(patch)
    } catch {
      setError('Could not save your app lock. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lock-screen lock-setup" role="dialog" aria-label="Protect Kakeibo">
      <section className="lock-card panel">
        <img className="lock-logo" src="./kakeibo.png" alt="" />
        <h1>{upgrading ? 'One quick step' : 'Protect Kakeibo'}</h1>
        <p>
          {upgrading
            ? 'Your budgets and expenses are still on this device. Kakeibo now uses a four-digit PIN before opening, with fingerprint or face when your device supports it.'
            : 'Set a four-digit PIN to open the app. This is required on phone, desktop, and web.'}
          {biometricReady ? (upgrading ? ' Biometric unlock is on by default for you.' : ' Fingerprint or face unlock is on by default when your device supports it.') : ''}
        </p>
        <label className="form-field">
          New PIN
          <input
            id="lock-setup-pin"
            aria-label="New PIN"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        <label className="form-field">
          Confirm PIN
          <input
            aria-label="Confirm PIN"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        {biometricReady && (
          <label className="settings-row lock-bio-toggle">
            <span><Fingerprint size={16} /> Use fingerprint or face (recommended)</span>
            <Toggle checked={useBiometric} onChange={setUseBiometric} />
          </label>
        )}
        {error && <p className="lock-error" role="alert">{error}</p>}
        <button type="button" className="button-primary" disabled={busy} onClick={() => void submit()}>
          Continue
        </button>
      </section>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Fingerprint, Lock } from 'lucide-react'
import type { AppSettings } from '@/db/db'
import { amountsHiddenByDefault } from '@/lib/privacy'
import { biometricLockStatus, createPinHash, pinIsValid, verifyAppPin } from '@/lib/lock'
import { Toggle } from './Toggle'

type AppPrivacySettingsProps = {
  settings: AppSettings
  open: boolean
  onToggleOpen: () => void
  onSave: (patch: Partial<AppSettings>) => Promise<void>
  onLockStateChange: (locked: boolean) => void
}

export function AppPrivacySettings({ settings, open, onToggleOpen, onSave, onLockStateChange }: AppPrivacySettingsProps) {
  const [setupOpen, setSetupOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [useBiometric, setUseBiometric] = useState(settings.lockUseBiometric !== false)
  const [biometricReady, setBiometricReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const status = await biometricLockStatus()
      if (!cancelled) setBiometricReady(status.available && status.enrolled)
    })()
    return () => { cancelled = true }
  }, [])

  async function enableLock() {
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
      const { hash, salt } = await createPinHash(pin)
      await onSave({
        lockEnabled: true,
        lockPinHash: hash,
        lockPinSalt: salt,
        lockUseBiometric: biometricReady && useBiometric,
      })
      setSetupOpen(false)
      setPin('')
      setConfirmPin('')
      onLockStateChange(true)
    } catch {
      setError('Could not turn on app lock.')
    } finally {
      setBusy(false)
    }
  }

  async function disableLock() {
    if (!settings.lockPinHash) {
      await onSave({ lockEnabled: false, lockPinHash: undefined, lockPinSalt: undefined, lockUseBiometric: true })
      onLockStateChange(false)
      return
    }
    const currentPin = pin
    if (!pinIsValid(currentPin) || !(await verifyAppPin(currentPin, settings))) {
      setError('Enter your current PIN to turn off app lock.')
      return
    }
    await onSave({ lockEnabled: false, lockPinHash: undefined, lockPinSalt: undefined, lockUseBiometric: true })
    setPin('')
    setError('')
    onLockStateChange(false)
  }

  return (
    <section className="panel settings-group">
      <header className="settings-header-clickable" onClick={onToggleOpen}>
        <span className="settings-icon"><Lock size={18} /></span>
        <div>
          <h2>Privacy &amp; lock</h2>
          <small>Hide amounts and protect the app</small>
        </div>
        <Chevron className={open} />
      </header>
      {open && (
        <>
          <div className="settings-row">
            <span>Hide amounts by default</span>
            <Toggle
              checked={amountsHiddenByDefault(settings)}
              onChange={(value) => void onSave({ amountsHidden: value })}
            />
          </div>
          <div className="settings-row privacy-lock-status">
            <span>
              App lock
              <small>
                {settings.lockEnabled
                  ? biometricReady && settings.lockUseBiometric
                    ? 'PIN + fingerprint'
                    : 'PIN'
                  : 'Off'}
              </small>
            </span>
            {settings.lockEnabled ? (
              <div className="privacy-lock-actions">
                <button type="button" className="button-quiet" onClick={() => onLockStateChange(true)}>Lock now</button>
                <button type="button" className="button-danger-quiet" onClick={() => void disableLock()}>Turn off</button>
              </div>
            ) : (
              <button type="button" className="button-quiet" onClick={() => setSetupOpen((value) => !value)}>
                <Lock size={15} /> Set up app lock
              </button>
            )}
          </div>
          {setupOpen && !settings.lockEnabled && (
            <div className="privacy-lock-setup">
              <p>Choose a four-digit PIN. On Android, fingerprint unlock is offered when available.</p>
              <label className="form-field">
                New PIN
                <input
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
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </label>
              {biometricReady && (
                <label className="settings-row lock-bio-toggle">
                  <span><Fingerprint size={16} /> Use fingerprint</span>
                  <Toggle checked={useBiometric} onChange={setUseBiometric} />
                </label>
              )}
              {error && <p className="lock-error" role="alert">{error}</p>}
              <button type="button" className="button-primary" disabled={busy} onClick={() => void enableLock()}>
                Turn on app lock
              </button>
            </div>
          )}
          {settings.lockEnabled && (
            <label className="form-field lock-disable-pin">
              Current PIN to turn off
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </label>
          )}
          {settings.lockEnabled && error && <p className="lock-error" role="alert">{error}</p>}
        </>
      )}
    </section>
  )
}

function Chevron({ className }: { className?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className={`chev ${className ? 'open' : ''}`} aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

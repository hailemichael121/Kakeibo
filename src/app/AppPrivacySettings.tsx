import { useEffect, useState } from 'react'
import { Fingerprint, Lock } from 'lucide-react'
import type { AppSettings } from '@/db/db'
import { amountsHiddenByDefault } from '@/lib/privacy'
import {
  appLockIsActive,
  biometricUnlockReady,
  buildLockSetupPatch,
  deviceSupportsBiometric,
  pinIsValid,
  registerWebAuthnLock,
  verifyAppPin,
} from '@/lib/lock'
import { Toggle } from './Toggle'

type AppPrivacySettingsProps = {
  settings: AppSettings
  open: boolean
  onToggleOpen: () => void
  onSave: (patch: Partial<AppSettings>) => Promise<void>
  onLockStateChange: (locked: boolean) => void
}

export function AppPrivacySettings({ settings, open, onToggleOpen, onSave, onLockStateChange }: AppPrivacySettingsProps) {
  const [changePinOpen, setChangePinOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [useBiometric] = useState(settings.lockUseBiometric !== false)
  const [biometricReady, setBiometricReady] = useState(false)
  const [deviceBiometric, setDeviceBiometric] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [ready, supported] = await Promise.all([biometricUnlockReady(settings), deviceSupportsBiometric()])
      if (!cancelled) {
        setBiometricReady(ready)
        setDeviceBiometric(supported)
      }
    })()
    return () => { cancelled = true }
  }, [settings])

  async function changePin() {
    setError('')
    if (!pinIsValid(currentPin) || !(await verifyAppPin(currentPin, settings))) {
      setError('Enter your current PIN correctly.')
      return
    }
    if (!pinIsValid(pin) || !pinIsValid(confirmPin)) {
      setError('Choose a new four-digit PIN.')
      return
    }
    if (pin !== confirmPin) {
      setError('New PIN entries do not match.')
      return
    }
    setBusy(true)
    try {
      const patch = await buildLockSetupPatch(pin, useBiometric)
      await onSave(patch)
      setChangePinOpen(false)
      setCurrentPin('')
      setPin('')
      setConfirmPin('')
    } catch {
      setError('Could not change your PIN.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleBiometric(enabled: boolean) {
    if (!appLockIsActive(settings)) return
    if (enabled && !settings.lockWebAuthnCredentialId) {
      const credentialId = await registerWebAuthnLock()
      await onSave({
        lockUseBiometric: Boolean(credentialId),
        ...(credentialId ? { lockWebAuthnCredentialId: credentialId } : {}),
      })
      return
    }
    await onSave({ lockUseBiometric: enabled })
  }

  const lockLabel = biometricReady && settings.lockUseBiometric !== false
    ? 'PIN + biometrics'
    : 'PIN (required)'

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
              <small>{lockLabel} · always on</small>
            </span>
            <div className="privacy-lock-actions">
              <button type="button" className="button-quiet" onClick={() => onLockStateChange(true)}>Lock now</button>
              <button type="button" className="button-quiet" onClick={() => setChangePinOpen((value) => !value)}>
                Change PIN
              </button>
            </div>
          </div>
          {settings.lockWebAuthnCredentialId || deviceBiometric ? (
            <label className="settings-row lock-bio-toggle">
              <span><Fingerprint size={16} /> Prefer fingerprint or face</span>
              <Toggle
                checked={settings.lockUseBiometric !== false}
                onChange={(value) => void toggleBiometric(value)}
              />
            </label>
          ) : null}
          {changePinOpen && (
            <div className="privacy-lock-setup">
              <p>Choose a new four-digit PIN. Biometric unlock stays on when your device supports it.</p>
              <label className="form-field">
                Current PIN
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={currentPin}
                  onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </label>
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
                Confirm new PIN
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </label>
              {error && <p className="lock-error" role="alert">{error}</p>}
              <button type="button" className="button-primary" disabled={busy} onClick={() => void changePin()}>
                Save new PIN
              </button>
            </div>
          )}
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

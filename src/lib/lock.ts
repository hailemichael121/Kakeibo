import { Capacitor } from '@capacitor/core'
import type { AppSettings } from '@/db/db'

interface KakeiboLockPlugin {
  available: () => Promise<{ available: boolean; enrolled: boolean; reason?: string }>
  authenticate: (options?: { title?: string; subtitle?: string }) => Promise<{ success: boolean; reason?: string }>
}

function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function isDesktopApp(): boolean {
  return Boolean(typeof window !== 'undefined' && window.kakeibo?.isDesktop)
}

async function getLockPlugin(): Promise<KakeiboLockPlugin | undefined> {
  if (!isAndroid()) return undefined
  const { Plugins } = await import('@capacitor/core')
  return (Plugins as unknown as Record<string, KakeiboLockPlugin | undefined>).KakeiboLock
}

async function androidBiometricStatus(): Promise<{ available: boolean; enrolled: boolean }> {
  try {
    const plugin = await getLockPlugin()
    if (!plugin) return { available: false, enrolled: false }
    const result = await plugin.available()
    return { available: Boolean(result.available), enrolled: Boolean(result.enrolled) }
  } catch {
    return { available: false, enrolled: false }
  }
}

export async function deviceSupportsBiometric(): Promise<boolean> {
  if (isAndroid()) {
    const status = await androidBiometricStatus()
    return status.available
  }
  if (!window.PublicKeyCredential || !window.isSecureContext) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function biometricLockStatus(): Promise<{ available: boolean; enrolled: boolean }> {
  if (isAndroid()) return androidBiometricStatus()
  const available = await deviceSupportsBiometric()
  return { available, enrolled: available }
}

export async function biometricUnlockReady(settings: AppSettings): Promise<boolean> {
  if (settings.lockUseBiometric === false) return false
  if (isAndroid()) {
    const status = await androidBiometricStatus()
    return status.available && status.enrolled
  }
  return Boolean(settings.lockWebAuthnCredentialId) && (await deviceSupportsBiometric())
}

export async function unlockWithBiometric(settings: AppSettings): Promise<boolean> {
  if (isAndroid()) {
    try {
      const plugin = await getLockPlugin()
      if (!plugin) return false
      const result = await plugin.authenticate({
        title: 'Unlock Kakeibo',
        subtitle: 'Confirm with your fingerprint or face',
      })
      return Boolean(result.success)
    } catch {
      return false
    }
  }
  if (!settings.lockWebAuthnCredentialId) return false
  try {
    return await unlockWithWebAuthn(settings.lockWebAuthnCredentialId)
  } catch {
    return false
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function webAuthnRpId(): string {
  if (window.location.protocol === 'file:') return 'localhost'
  const host = window.location.hostname
  if (!host) return 'localhost'
  return host
}

const LOCK_USER_ID = base64ToBytes('a2FrZWliby1sb2Nr') // kakeibo-lock

export async function registerWebAuthnLock(): Promise<string | undefined> {
  if (!window.PublicKeyCredential || !window.isSecureContext) return undefined
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      rp: { name: 'Kakeibo', id: webAuthnRpId() },
      user: { id: LOCK_USER_ID as unknown as BufferSource, name: 'kakeibo-lock', displayName: 'Kakeibo app lock' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
        requireResidentKey: false,
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null
  if (!credential) return undefined
  return bytesToBase64(new Uint8Array(credential.rawId))
}

async function unlockWithWebAuthn(credentialIdBase64: string): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      rpId: webAuthnRpId(),
      allowCredentials: [{
        id: base64ToBytes(credentialIdBase64) as unknown as BufferSource,
        type: 'public-key',
        transports: ['internal', 'hybrid'],
      }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  return Boolean(credential)
}

export async function createPinHash(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePinHash(pin, salt)
  return { hash: bytesToBase64(hash), salt: bytesToBase64(salt) }
}

export async function verifyAppPin(pin: string, settings: AppSettings): Promise<boolean> {
  if (!settings.lockPinHash || !settings.lockPinSalt) return false
  const salt = base64ToBytes(settings.lockPinSalt)
  const expected = base64ToBytes(settings.lockPinHash)
  const actual = await derivePinHash(pin, salt)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let index = 0; index < actual.length; index += 1) diff |= actual[index] ^ expected[index]
  return diff === 0
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 120_000, hash: 'SHA-256' },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export function pinIsValid(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export function needsLockSetup(settings: AppSettings): boolean {
  return !settings.lockPinHash
}

export function isLockMigration(settings: AppSettings, hasBudgetData: boolean): boolean {
  return needsLockSetup(settings) && (Boolean(settings.onboarded) || hasBudgetData)
}

export function appLockIsActive(settings: AppSettings): boolean {
  return Boolean(settings.lockPinHash) && settings.lockEnabled !== false
}

/** Keep the PIN already on this device when replacing data from a backup file. */
export function deviceLockFields(settings: AppSettings | undefined): Partial<AppSettings> {
  if (!settings?.lockPinHash || !settings.lockPinSalt) return {}
  return {
    lockEnabled: settings.lockEnabled !== false,
    lockPinHash: settings.lockPinHash,
    lockPinSalt: settings.lockPinSalt,
    lockUseBiometric: settings.lockUseBiometric,
    lockWebAuthnCredentialId: settings.lockWebAuthnCredentialId,
  }
}

export async function buildLockSetupPatch(pin: string, useBiometric: boolean): Promise<Partial<AppSettings>> {
  const { hash, salt } = await createPinHash(pin)
  const patch: Partial<AppSettings> = {
    lockEnabled: true,
    lockPinHash: hash,
    lockPinSalt: salt,
    lockUseBiometric: useBiometric,
  }
  if (useBiometric && (await deviceSupportsBiometric())) {
    if (isAndroid()) {
      const status = await androidBiometricStatus()
      patch.lockUseBiometric = status.available && status.enrolled
    } else {
      const credentialId = await registerWebAuthnLock()
      if (credentialId) {
        patch.lockWebAuthnCredentialId = credentialId
        patch.lockUseBiometric = true
      } else {
        patch.lockUseBiometric = false
      }
    }
  }
  return patch
}

import { Capacitor } from '@capacitor/core'
import type { AppSettings } from '@/db/db'

interface KakeiboLockPlugin {
  available: () => Promise<{ available: boolean; enrolled: boolean; reason?: string }>
  authenticate: (options?: { title?: string; subtitle?: string }) => Promise<{ success: boolean; reason?: string }>
}

function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function getLockPlugin(): Promise<KakeiboLockPlugin | undefined> {
  if (!isAndroid()) return undefined
  const { Plugins } = await import('@capacitor/core')
  return (Plugins as unknown as Record<string, KakeiboLockPlugin | undefined>).KakeiboLock
}

export async function biometricLockStatus(): Promise<{ available: boolean; enrolled: boolean }> {
  try {
    const plugin = await getLockPlugin()
    if (!plugin) return { available: false, enrolled: false }
    const result = await plugin.available()
    return { available: Boolean(result.available), enrolled: Boolean(result.enrolled) }
  } catch {
    return { available: false, enrolled: false }
  }
}

export async function unlockWithBiometric(): Promise<boolean> {
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

import { describe, expect, it } from 'vitest'
import { createPinHash, deviceLockFields, isLockMigration, needsLockSetup, pinIsValid, verifyAppPin } from './lock'
import type { AppSettings } from '@/db/db'

describe('app lock PIN', () => {
  it('accepts only four-digit pins', () => {
    expect(pinIsValid('1234')).toBe(true)
    expect(pinIsValid('123')).toBe(false)
    expect(pinIsValid('12345')).toBe(false)
  })

  it('hashes and verifies a pin', async () => {
    const { hash, salt } = await createPinHash('4321')
    const ok = await verifyAppPin('4321', {
      id: 'app',
      currency: 'ETB',
      monthStartDay: 1,
      theme: 'light',
      language: 'en',
      categories: [],
      demoEnabled: false,
      onboarded: true,
      lockPinHash: hash,
      lockPinSalt: salt,
    })
    expect(ok).toBe(true)
    expect(await verifyAppPin('0000', {
      id: 'app',
      currency: 'ETB',
      monthStartDay: 1,
      theme: 'light',
      language: 'en',
      categories: [],
      demoEnabled: false,
      onboarded: true,
      lockPinHash: hash,
      lockPinSalt: salt,
    })).toBe(false)
  })
})

describe('lock migration detection', () => {
  const base: AppSettings = {
    id: 'app',
    currency: 'ETB',
    monthStartDay: 1,
    theme: 'light',
    language: 'en',
    categories: [],
    demoEnabled: false,
    onboarded: false,
  }

  it('requires setup when no pin exists', () => {
    expect(needsLockSetup(base)).toBe(true)
  })

  it('treats returning users as migration', () => {
    expect(isLockMigration({ ...base, onboarded: true }, false)).toBe(true)
    expect(isLockMigration(base, true)).toBe(true)
    expect(isLockMigration(base, false)).toBe(false)
  })

  it('extracts device lock fields when a pin exists', () => {
    expect(deviceLockFields(base)).toEqual({})
    expect(deviceLockFields({ ...base, lockPinHash: 'h', lockPinSalt: 's' })).toMatchObject({
      lockPinHash: 'h',
      lockPinSalt: 's',
      lockEnabled: true,
    })
  })
})

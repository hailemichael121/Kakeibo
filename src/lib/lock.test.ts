import { describe, expect, it } from 'vitest'
import { createPinHash, pinIsValid, verifyAppPin } from './lock'

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

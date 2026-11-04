import { describe, expect, it } from 'vitest'
import { parseLanLink } from './lanLink'

describe('parseLanLink', () => {
  it('accepts a private Wi-Fi download code', () => {
    const link = `http://192.168.1.24:51873/download/${'a'.repeat(43)}`
    expect(parseLanLink(link).direction).toBe('download')
  })

  it('accepts a private Wi-Fi upload code', () => {
    const link = `http://10.0.0.8:4443/upload/${'z'.repeat(43)}`
    expect(parseLanLink(link).direction).toBe('upload')
  })

  it.each([
    `http://example.com:4443/download/${'a'.repeat(43)}`,
    `http://203.0.113.1:4443/upload/${'a'.repeat(43)}`,
    `https://192.168.1.24:4443/upload/${'a'.repeat(43)}`,
    `http://192.168.1.24:4443/upload/${'short'}`,
  ])('rejects a non-local or malformed link: %s', (link) => {
    expect(() => parseLanLink(link)).toThrow()
  })
})

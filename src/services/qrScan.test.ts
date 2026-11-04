import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { decodeQrPixels } from './qrScan'

function pixelsFor(text: string, scale = 8): { data: Uint8ClampedArray; width: number; height: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const quiet = 4 * scale
  const width = size * scale + quiet * 2
  const data = new Uint8ClampedArray(width * width * 4).fill(255)
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!qr.modules.get(row, column)) continue
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const offset = ((quiet + row * scale + y) * width + quiet + column * scale + x) * 4
          data[offset] = 0
          data[offset + 1] = 0
          data[offset + 2] = 0
          data[offset + 3] = 255
        }
      }
    }
  }
  return { data, width, height: width }
}

describe('decodeQrPixels', () => {
  it('decodes a local Kakeibo transfer URL', () => {
    const url = `http://192.168.1.24:51873/download/${'a'.repeat(43)}`
    const { data, width, height } = pixelsFor(url)
    expect(decodeQrPixels(data, width, height)).toBe(url)
  })

  it('returns null when the image does not contain a QR code', () => {
    expect(decodeQrPixels(new Uint8ClampedArray(64 * 64 * 4).fill(255), 64, 64)).toBeNull()
  })
})

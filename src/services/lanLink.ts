export type LanDirection = 'download' | 'upload'

export function parseLanLink(text: string): { url: URL; direction: LanDirection } {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error('That QR code is not a valid Kakeibo sync link.')
  }
  const octets = url.hostname.split('.').map(Number)
  const privateAddress = octets.length === 4
    && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && (octets[0] === 10
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168))
  const route = url.pathname.match(/^\/(download|upload)\/([A-Za-z0-9_-]{43})$/)
  const direction = route?.[1]
  if (url.protocol !== 'http:' || !privateAddress || !url.port || !route
    || (direction !== 'download' && direction !== 'upload')
    || url.search || url.hash || url.username || url.password) {
    throw new Error('Scan a current Kakeibo QR code while both devices are on the same private Wi-Fi.')
  }
  return { url, direction }
}

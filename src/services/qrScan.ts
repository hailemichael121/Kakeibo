import jsQR from 'jsqr'

export function decodeQrPixels(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

export async function scanQrPhoto(): Promise<string> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 90,
    promptLabelHeader: 'Capture the sync QR code',
  })
  if (!photo.webPath) throw new Error('The camera did not return an image.')
  const response = await fetch(photo.webPath)
  if (!response.ok) throw new Error('The captured image could not be opened.')
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Could not read the captured image.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const code = decodeQrPixels(pixels.data, canvas.width, canvas.height)
    if (!code) throw new Error('No QR code was found in that photo.')
    return code
  } finally {
    bitmap.close()
  }
}

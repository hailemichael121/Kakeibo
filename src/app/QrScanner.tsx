import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { Camera, ChevronLeft, X } from 'lucide-react'
import { decodeQrPixels, scanQrPhoto } from '@/services/qrScan'

async function requestCameraPermission() {
  if (!Capacitor.isNativePlatform()) return
  const { Camera } = await import('@capacitor/camera')
  try {
    const status = await Camera.checkPermissions()
    if (status.camera === 'granted') return
    if (status.camera === 'denied') {
      throw new Error('Camera access is blocked. Open Settings > Apps > Kakeibo > Permissions > Camera and allow it.')
    }
    const requested = await Camera.requestPermissions({ permissions: ['camera'] })
    if (requested.camera !== 'granted') {
      throw new Error('Camera access is needed to scan the QR code. Allow camera permission and try again.')
    }
  } catch (reason) {
    if (reason instanceof Error && /blocked|needed/i.test(reason.message)) throw reason
  }
}

function cameraErrorMessage(reason: unknown) {
  if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
    return 'Camera access was blocked. Allow camera permission for Kakeibo and try again.'
  }
  return reason instanceof Error ? reason.message : 'Camera access was unavailable.'
}

export function QrScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)

  useEffect(() => {
    let stream: MediaStream | undefined
    let timer: number | undefined
    let stopped = false
    let inFlight = false
    const finish = (value: string) => {
      if (stopped) return
      stopped = true
      if (timer !== undefined) window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
      onResult(value)
    }

    async function readFrame() {
      const video = videoRef.current
      if (inFlight || !video || video.readyState < 2 || !video.videoWidth) return
      inFlight = true
      try {
        const scale = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight))
        const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'))
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        const value = decodeQrPixels(pixels.data, canvas.width, canvas.height)
        if (value) finish(value)
      } finally {
        inFlight = false
      }
    }

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Live camera scanning is unavailable.')
        await requestCameraPermission()
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) throw new Error('The camera preview could not be opened.')
        video.srcObject = stream
        await video.play()
        setStarting(false)
        timer = window.setInterval(() => { void readFrame() }, 180)
      } catch (reason) {
        if (stopped) return
        setStarting(false)
        setError(cameraErrorMessage(reason))
      }
    })()

    return () => {
      stopped = true
      if (timer !== undefined) window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onResult])

  async function scanCameraPhoto() {
    if (photoBusy) return
    setPhotoBusy(true)
    setError('')
    try {
      onResult(await scanQrPhoto())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read a QR code from the photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  return createPortal(
    <div className="sync-scan-overlay" role="dialog" aria-modal="true" aria-label="Scan sync QR code">
      <header className="sync-scan-head">
        <div className="sync-scan-heading">
          <span>Sync devices</span>
          <h2>Scan QR code</h2>
        </div>
        <button className="sync-scan-close" aria-label="Close scanner" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="sync-scan-content">
        <video ref={videoRef} autoPlay playsInline muted aria-label="Live QR scanner" />
        <p>{starting && !error ? 'Starting the camera…' : 'Point your camera at the QR code shown on your computer.'}</p>
        {error && <p className="sync-scan-error" role="alert">{error}</p>}
        <div className="sync-scan-controls">
          <button className="button-quiet" disabled={photoBusy} onClick={() => void scanCameraPhoto()}><Camera size={16} />{photoBusy ? 'Reading photo…' : 'Use a camera photo instead'}</button>
          <button className="button-quiet back-button" onClick={onClose}><span className="back-icon"><ChevronLeft size={16} /></span> Back</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

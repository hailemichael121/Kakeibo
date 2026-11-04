import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { ArrowUpFromLine, Check, ChevronLeft, Download, FileUp, QrCode, RefreshCw, ScanLine, Send, ShieldCheck, X } from 'lucide-react'
import { db, type SyncSnapshot } from '@/db/db'
import { parseLanLink } from '@/services/lanLink'
import { shareBytes } from '@/services/share'
import { applySync, buildSyncFile, MAX_SYNC_BYTES, parseSyncPayload, previewSync, readSyncData, undoSync, type SyncPackage, type SyncPreview } from '@/services/sync'
import { QrScanner } from './QrScanner'

type Direction = 'send' | 'receive'
interface PendingSync {
  fileName: string
  payload: SyncPackage
  preview: SyncPreview
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The sync could not be completed.'
}

function fileNameFromResponse(response: Response): string {
  const header = response.headers.get('content-disposition')
  const match = header?.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? `Kakeibo_sync_${new Date().toISOString().slice(0, 10)}.json`
}

export function SyncScreen({ onBack, onMerged, notify }: {
  onBack: () => void
  onMerged: () => Promise<void>
  notify: (message: string) => void
}) {
  const [direction, setDirection] = useState<Direction>('receive')
  const [session, setSession] = useState<KakeiboLanSession>()
  const [qr, setQr] = useState('')
  const [pending, setPending] = useState<PendingSync>()
  const [lastSnapshot, setLastSnapshot] = useState<SyncSnapshot>()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const notifyRef = useRef(notify)

  useEffect(() => { notifyRef.current = notify }, [notify])

  const inspectFile = useCallback(async (file: File) => {
    if (file.size > MAX_SYNC_BYTES) throw new Error('Sync files must be 25 MB or smaller.')
    const payload = parseSyncPayload(await file.text())
    const local = await readSyncData()
    setPending({ fileName: file.name, payload, preview: previewSync(local, payload.data) })
    setSent(false)
    setError('')
  }, [])

  useEffect(() => {
    let active = true
    void db.syncSnapshots.orderBy('at').last().then((snapshot) => {
      if (active) setLastSnapshot(snapshot)
    })
    const unsubscribe = window.kakeibo?.onLanReceived?.((file) => {
      const received = new File([file.data.slice().buffer], file.name, { type: 'application/json' })
      void inspectFile(received)
        .then(() => notifyRef.current('Received from your phone. Review the merge before it changes anything.'))
        .catch((reason: unknown) => setError(messageOf(reason)))
    })
    return () => {
      active = false
      unsubscribe?.()
      void window.kakeibo?.lanStop?.()
    }
  }, [inspectFile])

  async function shareFile() {
    setBusy(true)
    setError('')
    try {
      const file = await buildSyncFile()
      await shareBytes(file.name, file.bytes, 'application/json')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function startDesktopSession() {
    const bridge = window.kakeibo
    if (!bridge?.lanStart) {
      setError('Wi-Fi QR sync is available in the Kakeibo desktop app.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const file = direction === 'send' ? await buildSyncFile() : undefined
      const next = await bridge.lanStart({ mode: direction, name: file?.name, data: file?.bytes })
      if (!next) throw new Error('Could not start Wi-Fi sync.')
      setSession(next)
      setQr(await QRCode.toDataURL(next.url, { width: 420, margin: 2, errorCorrectionLevel: 'Q' }))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function stopSession() {
    setSession(undefined)
    setQr('')
    await window.kakeibo?.lanStop?.()
  }

  async function switchDirection(next: Direction) {
    if (next === direction) return
    if (session) await stopSession()
    setPending(undefined)
    setSent(false)
    setError('')
    setDirection(next)
  }

  const handleScan = useCallback(async (value: string) => {
    setScannerOpen(false)
    setBusy(true)
    setError('')
    try {
      const link = parseLanLink(value)
      const expected = direction === 'receive' ? 'download' : 'upload'
      if (link.direction !== expected) {
        throw new Error(direction === 'receive'
          ? 'That QR is ready to receive from the phone. On the computer, choose “Send to phone” instead.'
          : 'That QR is ready to send to the phone. On the computer, choose “Receive from phone” instead.')
      }
      if (direction === 'receive') {
        const response = await fetch(link.url, { cache: 'no-store' })
        if (!response.ok) throw new Error(`The computer returned ${response.status}. Check that its sync QR is still open.`)
        const length = Number(response.headers.get('content-length') ?? 0)
        if (length > MAX_SYNC_BYTES) throw new Error('This sync file is larger than 25 MB.')
        const blob = await response.blob()
        if (blob.size > MAX_SYNC_BYTES) throw new Error('This sync file is larger than 25 MB.')
        await inspectFile(new File([blob], fileNameFromResponse(response), { type: 'application/json' }))
        notifyRef.current('File received. Review the merge before it changes anything.')
      } else {
        const file = await buildSyncFile()
        const response = await fetch(link.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: new Blob([file.bytes.slice().buffer], { type: 'application/json' }),
        })
        if (!response.ok) throw new Error(`The computer returned ${response.status}. Check that its sync QR is still open.`)
        setSent(true)
        notifyRef.current('Sent to the computer. Review and confirm the merge there.')
      }
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }, [direction, inspectFile])

  async function merge() {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      const result = await applySync(pending.payload, pending.fileName)
      setLastSnapshot(await db.syncSnapshots.get(result.snapshotId))
      setPending(undefined)
      await onMerged()
      notify(`Merged ${result.preview.added} new and ${result.preview.updated} updated records.`)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function undoLastMerge() {
    if (!lastSnapshot || !window.confirm(`Undo the merge from ${lastSnapshot.fileName}? This is only available if no data has changed since that merge.`)) return
    setBusy(true)
    try {
      const undone = await undoSync(lastSnapshot.id)
      if (!undone) {
        notify('Undo was not applied because data changed after the merge. Your newer entries are safe.')
        return
      }
      setLastSnapshot(undefined)
      await onMerged()
      notify('The sync merge was undone.')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  const isDesktop = Boolean(window.kakeibo?.lanStart)
  return <div className="sync-stack">
    <button className="button-quiet back-button sync-back" onClick={onBack}><span className="back-icon"><ChevronLeft size={17} /></span> Back to Settings</button>
    <section className="panel sync-card">
      <div className="row-between sync-title-row"><h2 className="sync-card-title">Move your budget between devices</h2><RefreshCw className="sync-title-icon" size={18} /></div>
      <p>Choose a direction, then scan the computer’s one-time QR code. Or share a sync file yourself—your data stays on your devices.</p>
      <div className="sync-direction" role="group" aria-label="Sync direction">
        <button className={direction === 'receive' ? 'active' : ''} onClick={() => void switchDirection('receive')}><Download size={15} /> Receive on this device</button>
        <button className={direction === 'send' ? 'active' : ''} onClick={() => void switchDirection('send')}><Send size={15} /> Send from this device</button>
      </div>
      {isDesktop
        ? <>
          {!session && <button className="button-primary" disabled={busy} onClick={() => void startDesktopSession()}><QrCode size={16} />{busy ? 'Preparing…' : direction === 'send' ? 'Show QR for phone' : 'Show QR to receive from phone'}</button>}
          {session && <div className="sync-qr"><img src={qr} alt={`One-time Kakeibo sync QR code for ${session.mode}`} /><span className="sync-snapshot">Link expires in {Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 60000))} min</span></div>}
          {session && <p className="sync-snapshot">{direction === 'send' ? 'On the phone, choose Receive and scan this code.' : 'On the phone, choose Send and scan this code.'}</p>}
          {session && <button className="button-quiet" onClick={() => void stopSession()}><X size={15} /> Stop QR session</button>}
        </>
        : <button className="button-primary" disabled={busy} onClick={() => setScannerOpen(true)}><ScanLine size={16} />{busy ? 'Working…' : 'Scan the computer QR code'}</button>}
      {sent && <p className="sync-snapshot" role="status">Sent. The computer will show a preview; it will not merge until confirmed.</p>}
      <div className="sync-warning"><ShieldCheck size={15} /> Use a trusted private Wi-Fi network. The QR link expires after five minutes and the transfer uses local HTTP, not end-to-end encryption. Nothing goes through a cloud service.</div>
      {error && <p className="sync-scan-error" role="alert">{error}</p>}
    </section>

    <section className="panel sync-card">
      <div className="row-between"><h2>Use a sync file</h2><FileUp size={18} /></div>
      <p>For devices on different networks, share this JSON file with a method you trust. The other device previews changes before merging.</p>
      <div className="sync-direction sync-file-actions">
        <button disabled={busy} onClick={() => void shareFile()}><Send size={15} />{busy ? 'Preparing…' : 'Build and share file'}</button>
        <label className="button-quiet file-import"><ArrowUpFromLine size={15} /> Choose sync file<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; const input = event.currentTarget; if (file) void inspectFile(file).catch((reason: unknown) => setError(messageOf(reason))).finally(() => { input.value = '' }) }} /></label>
      </div>
    </section>

    {pending && <section className="panel sync-card" aria-live="polite">
      <div className="row-between"><div><span className="overline">REVIEW BEFORE MERGING</span><h2>{pending.fileName}</h2></div><ShieldCheck size={19} /></div>
      <p>Newer edits win. Local records absent from the file are kept; synced deletions remain as recoverable history. Nothing changes until you confirm.</p>
      <div className="sync-counts"><span>{pending.preview.added} added</span><span>{pending.preview.updated} updated</span><span>{pending.preview.kept} kept on this device</span></div>
      <div className="sync-preview-table">{pending.preview.tables.map((row) => <div key={row.table}><span>{row.table}</span><b>{row.added} added · {row.updated} updated · {row.kept} kept</b></div>)}</div>
      <button className="button-primary" disabled={busy} onClick={() => void merge()}><Check size={16} />{busy ? 'Merging…' : 'Merge and save a safety snapshot'}</button>
      <button className="button-quiet back-button" disabled={busy} onClick={() => setPending(undefined)}><span className="back-icon"><ChevronLeft size={16} /></span> Back</button>
    </section>}

    {lastSnapshot && !pending && <section className="panel sync-card">
      <div className="row-between"><div><span className="overline">LAST MERGE</span><h2>Safety snapshot saved</h2></div><ShieldCheck size={18} /></div>
      <p className="sync-snapshot">{lastSnapshot.fileName} · {new Date(lastSnapshot.at).toLocaleString()}</p>
      <button className="button-quiet" disabled={busy} onClick={() => void undoLastMerge()}>Undo last merge</button>
    </section>}

    {scannerOpen && <QrScanner onResult={(value) => void handleScan(value)} onClose={() => setScannerOpen(false)} />}
  </div>
}

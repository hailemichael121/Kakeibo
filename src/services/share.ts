export async function shareBytes(filename: string, bytes: Uint8Array, mime: string): Promise<void> {
  const saveFile = window.kakeibo?.saveFile
  if (saveFile) {
    const result = await saveFile({ name: filename, data: bytes, mime })
    if (result.canceled) return
    if (!result.saved) throw new Error('File could not be saved.')
    return
  }

  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const [{ Directory, Filesystem }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    const path = `exports/${filename}`
    await Filesystem.writeFile({ path, data: btoa(binary), directory: Directory.Cache, recursive: true })
    const uri = await Filesystem.getUri({ path, directory: Directory.Cache })
    await Share.share({ title: filename, files: [uri.uri] })
    return
  }

  const file = new File([bytes.slice().buffer], filename, { type: mime })
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ title: filename, files: [file] })
    return
  }
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function parseAmount(value: unknown): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  let number = raw.replace(/[^\d,.-]/g, '')
  if (!number || (number.match(/-/g)?.length ?? 0) > 1 || (number.includes('-') && !number.startsWith('-'))) return null
  const comma = number.lastIndexOf(',')
  const dot = number.lastIndexOf('.')

  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    number = number.replace(decimal === ',' ? /\./g : /,/g, '')
    if (decimal === ',') number = number.replace(',', '.')
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? ',' : '.'
    const pieces = number.split(separator)
    if (pieces.length > 2) {
      const last = pieces.pop() ?? ''
      number = pieces.join('') + (last.length > 0 && last.length <= 2 ? `.${last}` : last)
    } else {
      const [whole = '', fractional = ''] = pieces
      number = fractional.length > 0 && fractional.length <= 2 ? `${whole}.${fractional}` : `${whole}${fractional}`
    }
  }

  const parsed = Number(number)
  return Number.isFinite(parsed) ? parsed : null
}

import { amountText } from '@/db/db'

/** Decorative glyphs used when amounts are hidden (Heavenly Stems). */
const HIDDEN_GLYPHS = '甲乙丙丁戊己庚辛壬癸'

export function maskAmountText(text: string): string {
  return text.replace(/[0-9]/g, (digit) => HIDDEN_GLYPHS[Number(digit)] ?? digit)
}

export function plainAmountText(amount: number, currency: string): string {
  try {
    return amountText(amount, currency)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

export function displayAmount(amount: number, currency: string, hidden: boolean): string {
  const plain = plainAmountText(amount, currency)
  return hidden ? maskAmountText(plain) : plain
}

export function displayAmountText(text: string, hidden: boolean): string {
  return hidden ? maskAmountText(text) : text
}

export function amountsHiddenByDefault(settings: { amountsHidden?: boolean }): boolean {
  return settings.amountsHidden !== false
}

import { registerPlugin } from '@capacitor/core'

export interface KakeiboLockPlugin {
  available: () => Promise<{ available: boolean; enrolled: boolean; reason?: string }>
  authenticate: (options?: { title?: string; subtitle?: string }) => Promise<{ success: boolean; reason?: string }>
}

export interface KakeiboWidgetPlugin {
  update: (values: {
    spendableLeft: string
    spendable: string
    spent: string
    currency: string
    amountsHidden?: boolean
    hiddenSpendableLeft?: string
    hiddenSpendable?: string
    hiddenSpent?: string
  }) => Promise<void>
  pin?: () => Promise<{ supported?: boolean; requested?: boolean; reason?: string }>
  closeQuickAdd?: () => Promise<void>
  showKeyboard?: () => Promise<void>
}

export const KakeiboLock = registerPlugin<KakeiboLockPlugin>('KakeiboLock')
export const KakeiboWidget = registerPlugin<KakeiboWidgetPlugin>('KakeiboWidget')

export {}

declare global {
  interface KakeiboLanSession {
    mode: 'send' | 'receive'
    url: string
    expiresAt: number
  }

  interface KakeiboDesktopReminders {
    enabled: boolean
    middayTime: string
    nightTime: string
    weeklyEnabled: boolean
    weeklyDay: number
  }

  interface Window {
    kakeibo?: {
      saveFile: (options: { name: string; data: Uint8Array; mime?: string }) => Promise<{ saved: boolean; path?: string; canceled?: boolean }>
      lanStart?: (options: { mode: 'send' | 'receive'; name?: string; data?: Uint8Array }) => Promise<KakeiboLanSession | null>
      lanStop?: () => Promise<void>
      onLanReceived?: (handler: (file: { name: string; data: Uint8Array }) => void) => () => void
      remindersSchedule?: (options: KakeiboDesktopReminders) => Promise<void>
      remindersCancel?: () => Promise<void>
      onReminderRoute?: (handler: (route: 'add' | 'report') => void) => () => void
    }
  }
}

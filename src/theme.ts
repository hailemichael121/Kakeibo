import type { ThemeMode } from './db/db'

export function applyTheme(theme: ThemeMode): void {
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

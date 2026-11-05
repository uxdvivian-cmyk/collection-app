export type ThemeMode = 'dark' | 'light' | 'system'

const KEY = 'theme'

export function getTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch { /* 私密模式等情況 */ }
  return 'dark' // 預設深色
}

export function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? '#14161c' : '#f3f4f7')
}

export function setTheme(mode: ThemeMode) {
  try { localStorage.setItem(KEY, mode) } catch { /* ignore */ }
  applyTheme(mode)
}

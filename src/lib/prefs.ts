// 只存在這支裝置瀏覽器裡的設定（Google 試算表網址、API 金鑰）。

export function getPref(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

export function setPref(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch { /* 無痕模式等情況 */ }
}

export const PREF_SHEET_URL = 'sheetUrl'
export const PREF_API_KEY = 'sheetsApiKey'

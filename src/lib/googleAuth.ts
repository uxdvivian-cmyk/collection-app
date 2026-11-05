// Google 登入（Google Identity Services 的 token 模式）。只要求 Drive 的「應用程式專用資料夾」權限：
// 這個 App 只能讀寫它自己建立的檔案，看不到你 Drive 裡的其他東西。

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

let gisPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => { gisPromise = null; reject(new Error('無法載入 Google 登入元件（網路不通，或被廣告阻擋程式擋住）')) }
      document.head.appendChild(s)
    })
  }
  return gisPromise
}

let cached: { token: string; exp: number } | null = null
export const hasValidToken = () => !!cached && cached.exp > Date.now() + 60_000
export const clearToken = () => { cached = null }

/** interactive = true：可以跳出登入視窗（要由使用者按下按鈕觸發）；false：只嘗試靜默取得，失敗就丟錯 */
export async function getAccessToken(clientId: string, interactive: boolean): Promise<string> {
  if (hasValidToken()) return cached!.token
  await loadGis()
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r: { error?: string; error_description?: string; access_token: string; expires_in?: number | string }) => {
        if (r.error) return reject(new Error(r.error_description || r.error))
        cached = { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e: { type?: string; message?: string }) =>
        reject(new Error(e?.type === 'popup_closed' ? '登入視窗被關閉' : e?.message || e?.type || '登入失敗')),
    })
    client.requestAccessToken({ prompt: interactive ? '' : 'none' })
  })
}

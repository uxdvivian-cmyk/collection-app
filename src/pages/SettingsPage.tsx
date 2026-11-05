import { useRef, useState } from 'react'
import { db, exportBackup, importBackup } from '../db'
import { parseTitle } from '../lib/friendExcel'
import { getRate, setRate } from '../lib/money'
import { PREF_API_KEY, PREF_SHEET_URL, getPref, setPref } from '../lib/prefs'
import { getTheme, setTheme, type ThemeMode } from '../theme'

export default function SettingsPage() {
  const [mode, setMode] = useState<ThemeMode>(getTheme())
  const [rate, setRateText] = useState(String(getRate()))
  const [msg, setMsg] = useState('')
  const [sheetUrl, setSheetUrl] = useState(getPref(PREF_SHEET_URL))
  const [apiKey, setApiKey] = useState(getPref(PREF_API_KEY))
  const fileRef = useRef<HTMLInputElement>(null)
  const [seriesMsg, setSeriesMsg] = useState('')

  const onTheme = (m: ThemeMode) => { setMode(m); setTheme(m) }

  const onRate = (v: string) => {
    setRateText(v)
    const n = parseFloat(v)
    if (n > 0) setRate(n)
  }

  // 依書名重新判斷系列與卷數：只補上還沒有系列的書，手動設定過的不會被改掉
  const onRescan = async () => {
    const books = await db.books.toArray()
    let n = 0
    await db.transaction('rw', db.books, async () => {
      for (const b of books) {
        if (b.series || b.id === undefined) continue
        const { series, volume } = parseTitle(b.title)
        if (series) {
          await db.books.update(b.id, { series, volume: b.volume ?? volume })
          n++
        }
      }
    })
    setSeriesMsg(n > 0 ? `已為 ${n} 本書補上系列與卷數。` : '沒有需要補的書。')
  }

  const onExport = async () => {
    const blob = new Blob([await exportBackup()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `收藏備份-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('已匯出，請存到「檔案」App（建議放 iCloud Drive）。')
  }

  const onImport = async (f?: File) => {
    if (!f) return
    if (!confirm('匯入會覆蓋目前所有資料，確定嗎？')) return
    try {
      await importBackup(await f.text())
      setMsg('匯入完成。')
    } catch (e) {
      setMsg('匯入失敗：' + (e as Error).message)
    }
  }

  return (
    <section>
      <h1>設定</h1>

      <h2>外觀</h2>
      <div className="seg2 three">
        {(['dark', 'light', 'system'] as const).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => onTheme(m)}>
            {{ dark: '深色', light: '淺色', system: '跟隨系統' }[m]}
          </button>
        ))}
      </div>

      <h2>日幣匯率</h2>
      <label className="lbl">1 日幣 ≈ 幾元台幣（日幣訂單換算台幣用）
        <input type="number" inputMode="decimal" step="0.001" value={rate} onChange={(e) => onRate(e.target.value)} />
      </label>

      <h2>Google 試算表同步（朋友的書單）</h2>
      <label className="lbl">試算表網址（需設為「知道連結的人可檢視」）
        <input type="search" value={sheetUrl} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={(e) => { setSheetUrl(e.target.value); setPref(PREF_SHEET_URL, e.target.value.trim()) }} />
      </label>
      <label className="lbl">Google Sheets API 金鑰（只存在這支手機）
        <input type="search" value={apiKey} placeholder="AIza…" autoComplete="off" onChange={(e) => { setApiKey(e.target.value); setPref(PREF_API_KEY, e.target.value.trim()) }} />
      </label>
      <p className="hint">填好後，到「書」按「匯入」，選「從 Google 試算表同步」。金鑰建立步驟見專案的 docs/google-sheets-setup.md。</p>

      <h2>書的系列</h2>
      <p className="zh">依書名裡的集數（例如「2」「(03)」「上」「-01」）判斷系列。已經有系列的書不會被改動。</p>
      <div className="row">
        <button className="btn ghost" onClick={onRescan}>依書名重新判斷系列</button>
      </div>
      {seriesMsg && <p className="note">{seriesMsg}</p>}

      <h2>備份</h2>
      <p className="zh">資料只存在這支手機的瀏覽器裡，請定期匯出備份。</p>
      <div className="row">
        <button className="btn" onClick={onExport}>匯出備份</button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>匯入備份</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
      </div>
      {msg && <p className="note">{msg}</p>}
    </section>
  )
}

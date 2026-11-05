import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportBackup, importBackup, liveBooks } from '../db'
import { parseTitle } from '../lib/friendExcel'
import { getRate, setRate } from '../lib/money'
import { PREF_API_KEY, PREF_SHEET_URL, getPref, setPref } from '../lib/prefs'
import { getTheme, setTheme, type ThemeMode } from '../theme'
import { PREF_AUTO, PREF_CLIENT_ID, getClientId, getSyncStatus, listBackupSnapshots, onSyncStatus, restoreSnapshot, syncNow, type SnapshotInfo } from '../lib/sync'

export default function SettingsPage() {
  const [mode, setMode] = useState<ThemeMode>(getTheme())
  const [rate, setRateText] = useState(String(getRate()))
  const [msg, setMsg] = useState('')
  const [sheetUrl, setSheetUrl] = useState(getPref(PREF_SHEET_URL))
  const [apiKey, setApiKey] = useState(getPref(PREF_API_KEY))
  const fileRef = useRef<HTMLInputElement>(null)
  const [seriesMsg, setSeriesMsg] = useState('')
  const [clientId, setClientId] = useState(getClientId())
  const [auto, setAuto] = useState(getPref(PREF_AUTO) !== '0')
  const [sync, setSync] = useState(getSyncStatus())
  useEffect(() => onSyncStatus(setSync), [])
  const counts = useLiveQuery(async () => {
    const all = await db.books.toArray()
    return { live: all.filter((b) => !b.deleted).length, deleted: all.filter((b) => b.deleted).length }
  }, [])
  const [snaps, setSnaps] = useState<SnapshotInfo[] | null>(null)
  const [snapMsg, setSnapMsg] = useState('')
  const loadSnaps = async () => {
    setSnapMsg('讀取中…')
    try { setSnaps(await listBackupSnapshots()); setSnapMsg('') } catch (e) { setSnapMsg((e as Error).message) }
  }
  const restoreSnap = async (s: SnapshotInfo) => {
    const day = s.name.replace('snapshot-', '').replace('.json', '')
    if (!confirm(`要把書單還原成「${day}」的樣子嗎？\n那之後新增的書會被移除。還原前會先自動把現在的狀態備份一份。`)) return
    setSnapMsg('還原中…')
    try { const n = await restoreSnapshot(s); setSnapMsg(`已還原，共 ${n} 本。`); setSnaps(null) } catch (e) { setSnapMsg((e as Error).message) }
  }
  const restoreDeleted = async () => {
    if (!confirm('這會把所有標記為已刪除的書放回清單。確定嗎？')) return
    const del = await db.books.filter((b) => !!b.deleted).toArray()
    await db.transaction('rw', db.books, async () => { for (const b of del) await db.books.update(b.id!, { deleted: false }) })
  }

  const onTheme = (m: ThemeMode) => { setMode(m); setTheme(m) }

  const onRate = (v: string) => {
    setRateText(v)
    const n = parseFloat(v)
    if (n > 0) setRate(n)
  }

  // 依書名重新判斷系列與卷數：只補上還沒有系列的書，手動設定過的不會被改掉
  const onRescan = async () => {
    const books = await liveBooks()
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

      <h2>跨裝置同步（Google Drive）</h2>
      <p className="zh">把書自動同步到你的 Google Drive，電腦和手機的資料就會一致。只使用這個 App 專屬的隱藏資料夾，看不到你 Drive 裡的其他檔案。兩個裝置都填同一個用戶端 ID，並用同一個 Google 帳號登入。</p>
      <label className="lbl">Google 用戶端 ID
        <input type="search" value={clientId} placeholder="123456-abc….apps.googleusercontent.com" autoComplete="off"
          onChange={(e) => { setClientId(e.target.value); setPref(PREF_CLIENT_ID, e.target.value.trim()) }} />
      </label>
      <div className="lbl">自動同步
        <div className="seg2">
          <button className={auto ? 'on' : ''} onClick={() => { setAuto(true); setPref(PREF_AUTO, '') }}>開</button>
          <button className={!auto ? 'on' : ''} onClick={() => { setAuto(false); setPref(PREF_AUTO, '0') }}>關</button>
        </div>
      </div>
      <div className="row">
        <button className="btn" disabled={!clientId.trim() || sync.state === 'syncing'} onClick={() => { void syncNow(true).catch(() => undefined) }}>
          {sync.lastAt ? '立即同步' : '登入並同步'}
        </button>
      </div>
      <p className={sync.state === 'error' || sync.state === 'needs-login' ? 'err' : 'note'} role="status">
        {sync.state === 'syncing' ? '同步中…' : sync.message}
      </p>
      {sync.lastAt > 0 && <p className="zh">上次同步：{new Date(sync.lastAt).toLocaleString('zh-TW')}{sync.dirty ? ' · 有尚未同步的變更' : ''}</p>}
      {counts && (
        <p className="zh">
          這台裝置上目前有 {counts.live} 本書{counts.deleted > 0 ? `（另有 ${counts.deleted} 本被標記為已刪除，不會顯示）` : ''}。
        </p>
      )}
      {counts && counts.deleted > 0 && (
        <div className="row"><button className="btn ghost" onClick={restoreDeleted}>找回被標記為刪除的書</button></div>
      )}
      <p className="hint">用戶端 ID 的建立步驟見專案的 docs/google-drive-sync-setup.md。</p>

      <h2>雲端備份快照</h2>
      <p className="zh">同步時每天會自動多存一份快照到你的 Google Drive，保留最近 14 份。不小心刪錯書時，可以還原成某一天的樣子。</p>
      <div className="row"><button className="btn ghost" disabled={!clientId.trim()} onClick={loadSnaps}>查看備份</button></div>
      {snapMsg && <p className="note" role="status">{snapMsg}</p>}
      {snaps && snaps.length === 0 && <p className="zh">還沒有快照。每天第一次同步成功後就會出現。</p>}
      {snaps && snaps.map((s) => (
        <div className="item" key={s.id}>
          <div className="top">
            <div className="l"><div className="name">{s.name.replace('snapshot-', '').replace('.json', '')}</div></div>
            <button className="btn sm ghost" onClick={() => restoreSnap(s)}>還原</button>
          </div>
        </div>
      ))}

      <h2>Google 試算表同步（朋友的書單）</h2>
      <label className="lbl">試算表網址（需設為「知道連結的人可檢視」）
        <input type="search" value={sheetUrl} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={(e) => { setSheetUrl(e.target.value); setPref(PREF_SHEET_URL, e.target.value.trim()) }} />
      </label>
      <label className="lbl">Google API 金鑰（讀朋友的試算表、掃 ISBN 查書；只存在這支手機）
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

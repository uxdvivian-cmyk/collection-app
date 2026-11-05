// 跨裝置同步：把書、周邊、訂單存到你 Google Drive 的「應用程式專用資料夾」裡的一個 JSON 檔。
// 每筆資料以 uid 識別、以 updatedAt 較新者為準；刪除以 deleted 標記同步。

import type { Table } from 'dexie'
import { db, dirtyListeners, withoutTracking } from '../db'
import { clearToken, getAccessToken } from './googleAuth'
import { getPref, setPref } from './prefs'

export const PREF_CLIENT_ID = 'googleClientId'
/** 預設的 Google 用戶端 ID（公開資訊，不是密碼）。內建後，新的瀏覽器不用再手動貼，登入就能同步。 */
export const DEFAULT_CLIENT_ID = '805654477096-rlv4e1fbrvpdbihvacqm62oefarj2ln8.apps.googleusercontent.com'
export const getClientId = () => getPref(PREF_CLIENT_ID) || DEFAULT_CLIENT_ID
export const PREF_AUTO = 'syncAuto' // '0' 關閉，其餘（含空）為開啟
const PREF_FILE_ID = 'driveFileId'
const PREF_LAST = 'lastSyncAt'
const FILE_NAME = 'collection.json'
const SNAP_PREFIX = 'snapshot-'
const SNAP_KEEP = 14 // 保留最近幾份每日快照
const PREF_SNAP_DAY = 'lastSnapshotDay'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export interface SyncResult { uploaded: number; downloaded: number; at: number }
export type SyncState = 'idle' | 'syncing' | 'error' | 'needs-login'
export interface SyncStatus { state: SyncState; message: string; lastAt: number; dirty: boolean }

// ── 要同步的資料表 ──
type Rec = { id?: number; uid?: string; updatedAt?: number; deleted?: boolean }
const TABLES = ['books', 'goods', 'orders'] as const
type TableName = (typeof TABLES)[number]
type Data = Record<TableName, Rec[]>
const emptyData = (): Data => ({ books: [], goods: [], orders: [] })
const tableOf = (name: TableName) => db[name] as unknown as Table<Rec, number>
const count = (d: Data) => TABLES.reduce((n, t) => n + d[t].length, 0)

// ── 狀態（給設定頁顯示）──
let status: SyncStatus = { state: 'idle', message: '', lastAt: Number(getPref(PREF_LAST)) || 0, dirty: false }
const listeners = new Set<(s: SyncStatus) => void>()
const setStatus = (p: Partial<SyncStatus>) => { status = { ...status, ...p }; listeners.forEach((f) => f(status)) }
export const getSyncStatus = () => status
export function onSyncStatus(f: (s: SyncStatus) => void) { listeners.add(f); return () => { listeners.delete(f) } }

// ── 合併：同一個 uid 取 updatedAt 較新的；一樣新就保留本機 ──
export function mergeRecords<T extends Rec>(local: T[], remote: T[]) {
  const merged = new Map<string, T>()
  for (const l of local) if (l.uid) merged.set(l.uid, l)
  const download = new Set<string>()
  for (const r of remote) {
    if (!r.uid) continue
    const l = merged.get(r.uid)
    if (!l || (r.updatedAt ?? 0) > (l.updatedAt ?? 0)) { merged.set(r.uid, r); download.add(r.uid) }
  }
  const remoteBy = new Map(remote.filter((r) => r.uid).map((r) => [r.uid!, r]))
  const upload = [...merged.values()].filter((m) => {
    const r = remoteBy.get(m.uid!)
    return !r || (m.updatedAt ?? 0) > (r.updatedAt ?? 0)
  })
  return { merged: [...merged.values()], download, upload }
}

// ── Google Drive ──
async function drive(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } })
  if (res.status === 401) { clearToken(); throw new Error('登入已過期，請重新登入') }
  return res
}

async function findFileId(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`)
  const res = await drive(token, `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)`)
  if (!res.ok) throw new Error(`Google Drive 讀取失敗（${res.status}）`)
  return (await res.json()).files?.[0]?.id ?? null
}

/** 舊版檔案只有 books；缺的資料表當作空的 */
async function download(token: string, id: string): Promise<Data | null> {
  const res = await drive(token, `${API}/files/${id}?alt=media`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Google Drive 讀取失敗（${res.status}）`)
  const j = await res.json()
  const d = emptyData()
  for (const t of TABLES) d[t] = Array.isArray(j[t]) ? j[t] : []
  return d
}

async function upload(token: string, id: string | null, data: Data, name = FILE_NAME): Promise<string> {
  const strip = (rows: Rec[]) => rows.map(({ id: _i, ...r }) => r)
  const body = JSON.stringify({ version: 2, savedAt: new Date().toISOString(), books: strip(data.books), goods: strip(data.goods), orders: strip(data.orders) })
  if (id) {
    const res = await drive(token, `${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
    if (!res.ok) throw new Error(`Google Drive 寫入失敗（${res.status}）`)
    return id
  }
  const boundary = 'collection' + Math.random().toString(36).slice(2)
  const meta = JSON.stringify({ name, parents: ['appDataFolder'] })
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
  const res = await drive(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  })
  if (!res.ok) throw new Error(`Google Drive 建立檔案失敗（${res.status}）`)
  return (await res.json()).id
}

// ── 每日快照（備份）：同步會把刪除也同步出去，所以每天多留一份，誤刪時可以還原 ──
export interface SnapshotInfo { id: string; name: string }

async function listSnapshots(token: string): Promise<SnapshotInfo[]> {
  const q = encodeURIComponent(`name contains '${SNAP_PREFIX}'`)
  const res = await drive(token, `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,name)&pageSize=100`)
  if (!res.ok) throw new Error(`Google Drive 讀取失敗（${res.status}）`)
  const files: SnapshotInfo[] = (await res.json()).files ?? []
  return files.sort((a, b) => b.name.localeCompare(a.name)) // 新的在前
}

const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD（本地時間）

/** 每天第一次同步：把「今天開始前」的雲端狀態存成快照，並只保留最近幾份 */
async function dailySnapshot(token: string, before: Data) {
  const day = today()
  if (getPref(PREF_SNAP_DAY) === day || count(before) === 0) return
  const snaps = await listSnapshots(token)
  const hasToday = snaps.some((s) => s.name === `${SNAP_PREFIX}${day}.json`)
  if (!hasToday) await upload(token, null, before, `${SNAP_PREFIX}${day}.json`)
  // 總共保留 SNAP_KEEP 份：今天的還沒存的話，舊的只留 SNAP_KEEP - 1 份
  for (const old of snaps.slice(hasToday ? SNAP_KEEP : SNAP_KEEP - 1)) await drive(token, `${API}/files/${old.id}`, { method: 'DELETE' })
  setPref(PREF_SNAP_DAY, day)
}

/** 列出雲端快照（需要登入，由按鈕觸發） */
export async function listBackupSnapshots(): Promise<SnapshotInfo[]> {
  const clientId = getClientId()
  if (!clientId) throw new Error('尚未設定 Google 用戶端 ID')
  return listSnapshots(await getAccessToken(clientId, true))
}

async function readLocal(): Promise<Data> {
  const d = emptyData()
  for (const t of TABLES) d[t] = await tableOf(t).toArray()
  return d
}

/** 還原成某份快照：快照裡有的放回去，之後新增的標為刪除；還原前會先把目前的狀態另存一份 */
export async function restoreSnapshot(s: SnapshotInfo): Promise<number> {
  const clientId = getClientId()
  if (!clientId) throw new Error('尚未設定 Google 用戶端 ID')
  const token = await getAccessToken(clientId, true)
  const snap = await download(token, s.id)
  if (!snap) throw new Error('找不到這份快照')
  const local = await readLocal()
  const stamp = new Date().toLocaleTimeString('sv-SE').replace(/:/g, '')
  await upload(token, null, local, `${SNAP_PREFIX}${today()}-還原前-${stamp}.json`)
  const now = Date.now()
  let restored = 0
  for (const t of TABLES) {
    const table = tableOf(t)
    const inSnap = new Map(snap[t].filter((r) => r.uid).map((r) => [r.uid!, r]))
    const localBy = new Map(local[t].filter((r) => r.uid).map((r) => [r.uid!, r]))
    await db.transaction('rw', table, async () => {
      for (const l of local[t]) if (l.uid && !inSnap.has(l.uid) && !l.deleted) await table.update(l.id!, { deleted: true, updatedAt: now })
      for (const [uid, rec] of inSnap) {
        const { id: _drop, ...rest } = rec
        const ex = localBy.get(uid)
        if (ex?.id !== undefined) await table.put({ ...rest, id: ex.id, updatedAt: now })
        else await table.add({ ...rest, updatedAt: now })
      }
    })
    restored += inSnap.size
  }
  await syncNow(true).catch(() => undefined) // 立刻把還原後的狀態推上去
  return restored
}

// ── 同步 ──
let running: Promise<SyncResult> | null = null

/** interactive = true 才會跳出 Google 登入視窗（必須由使用者按鈕觸發） */
export function syncNow(interactive: boolean): Promise<SyncResult> {
  if (running) return running
  running = (async () => {
    const clientId = getClientId()
    if (!clientId) throw new Error('尚未設定 Google 用戶端 ID')
    setStatus({ state: 'syncing', message: '同步中…' })
    try {
      const token = await getAccessToken(clientId, interactive)
      let fileId = getPref(PREF_FILE_ID) || (await findFileId(token))
      let remote = fileId ? await download(token, fileId) : null
      if (fileId && !remote) { fileId = await findFileId(token); remote = fileId ? await download(token, fileId) : null }

      const local = await readLocal()
      const mergedAll = emptyData()
      let downloaded = 0
      let uploaded = 0

      for (const t of TABLES) {
        const { merged, download: toDownload, upload: toUpload } = mergeRecords(local[t], remote?.[t] ?? [])
        mergedAll[t] = merged
        downloaded += toDownload.size
        uploaded += toUpload.length
        if (toDownload.size) {
          const table = tableOf(t)
          const byUid = new Map(merged.map((r) => [r.uid!, r]))
          await withoutTracking(() =>
            db.transaction('rw', table, async () => {
              for (const uid of toDownload) {
                const rec = byUid.get(uid)!
                const existing = await table.where('uid').equals(uid).first()
                const { id: _drop, ...rest } = rec
                if (existing?.id !== undefined) await table.put({ ...rest, id: existing.id })
                else await table.add(rest)
              }
            }),
          )
        }
      }

      if (remote) await dailySnapshot(token, remote).catch(() => undefined) // 備份失敗不影響同步
      if (!remote || uploaded > 0) fileId = await upload(token, fileId, mergedAll)
      if (fileId) setPref(PREF_FILE_ID, fileId)

      const at = Date.now()
      setPref(PREF_LAST, String(at))
      setStatus({ state: 'idle', message: `已同步（下載 ${downloaded} 筆、上傳 ${uploaded} 筆）`, lastAt: at, dirty: false })
      return { uploaded, downloaded, at }
    } catch (e) {
      const msg = (e as Error).message
      const needsLogin = !interactive && /interaction|consent|login|popup|過期|登入/i.test(msg)
      setStatus({ state: needsLogin ? 'needs-login' : 'error', message: needsLogin ? '需要重新登入，請到設定按「登入並同步」' : msg })
      throw e
    } finally {
      running = null
    }
  })()
  return running
}

// ── 自動同步：開啟 App 時、資料變更後（延遲幾秒合併成一次）──
let timer: ReturnType<typeof setTimeout> | undefined
let started = false
const autoOn = () => !!getClientId() && getPref(PREF_AUTO) !== '0'

export function initAutoSync() {
  if (started) return
  started = true
  dirtyListeners.add(() => {
    if (!autoOn()) return
    setStatus({ dirty: true })
    clearTimeout(timer)
    timer = setTimeout(() => { void syncNow(false).catch(() => undefined) }, 4000)
  })
  if (autoOn()) setTimeout(() => { void syncNow(false).catch(() => undefined) }, 1500)
}

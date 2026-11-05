// 跨裝置同步：把書存到你 Google Drive 的「應用程式專用資料夾」裡的一個 JSON 檔。
// 每筆資料以 uid 識別、以 updatedAt 較新者為準；刪除以 deleted 標記同步。

import { db, dirtyListeners, withoutTracking } from '../db'
import type { Book } from '../types'
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

// ── 狀態（給設定頁顯示）──
let status: SyncStatus = { state: 'idle', message: '', lastAt: Number(getPref(PREF_LAST)) || 0, dirty: false }
const listeners = new Set<(s: SyncStatus) => void>()
const setStatus = (p: Partial<SyncStatus>) => { status = { ...status, ...p }; listeners.forEach((f) => f(status)) }
export const getSyncStatus = () => status
export function onSyncStatus(f: (s: SyncStatus) => void) { listeners.add(f); return () => { listeners.delete(f) } }

// ── 合併：同一個 uid 取 updatedAt 較新的；一樣新就保留本機 ──
export function mergeBooks(local: Book[], remote: Book[]) {
  const merged = new Map<string, Book>()
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

async function download(token: string, id: string): Promise<{ books: Book[] } | null> {
  const res = await drive(token, `${API}/files/${id}?alt=media`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Google Drive 讀取失敗（${res.status}）`)
  const j = await res.json()
  return { books: Array.isArray(j.books) ? j.books : [] }
}

async function upload(token: string, id: string | null, books: Book[], name = FILE_NAME): Promise<string> {
  const body = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), books: books.map(({ id: _i, ...r }) => r) })
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
async function dailySnapshot(token: string, before: Book[]) {
  const day = today()
  if (getPref(PREF_SNAP_DAY) === day || before.length === 0) return
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

/** 還原成某份快照：快照裡有的書放回去，之後新增的書標為刪除；還原前會先把目前的狀態另存一份 */
export async function restoreSnapshot(s: SnapshotInfo): Promise<number> {
  const clientId = getClientId()
  if (!clientId) throw new Error('尚未設定 Google 用戶端 ID')
  const token = await getAccessToken(clientId, true)
  const snap = await download(token, s.id)
  if (!snap) throw new Error('找不到這份快照')
  const local = await db.books.toArray()
  const stamp = new Date().toLocaleTimeString('sv-SE').replace(/:/g, '')
  await upload(token, null, local, `${SNAP_PREFIX}${today()}-還原前-${stamp}.json`)
  const now = Date.now()
  const inSnap = new Map(snap.books.filter((b) => b.uid).map((b) => [b.uid!, b]))
  const localBy = new Map(local.filter((b) => b.uid).map((b) => [b.uid!, b]))
  await db.transaction('rw', db.books, async () => {
    for (const l of local) if (l.uid && !inSnap.has(l.uid) && !l.deleted) await db.books.update(l.id!, { deleted: true, updatedAt: now })
    for (const [uid, rec] of inSnap) {
      const { id: _drop, ...rest } = rec
      const ex = localBy.get(uid)
      if (ex?.id !== undefined) await db.books.put({ ...rest, id: ex.id, updatedAt: now })
      else await db.books.add({ ...rest, updatedAt: now })
    }
  })
  await syncNow(true).catch(() => undefined) // 立刻把還原後的狀態推上去
  return inSnap.size
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

      const local = await db.books.toArray()
      const { merged, download: toDownload, upload: toUpload } = mergeBooks(local, remote?.books ?? [])

      if (toDownload.size) {
        const byUid = new Map(merged.map((b) => [b.uid!, b]))
        await withoutTracking(() =>
          db.transaction('rw', db.books, async () => {
            for (const uid of toDownload) {
              const rec = byUid.get(uid)!
              const existing = await db.books.where('uid').equals(uid).first()
              const { id: _drop, ...rest } = rec
              if (existing?.id !== undefined) await db.books.put({ ...rest, id: existing.id })
              else await db.books.add(rest)
            }
          }),
        )
      }

      if (remote) await dailySnapshot(token, remote.books).catch(() => undefined) // 備份失敗不影響同步
      if (!remote || toUpload.length) fileId = await upload(token, fileId, merged)
      if (fileId) setPref(PREF_FILE_ID, fileId)

      const at = Date.now()
      setPref(PREF_LAST, String(at))
      setStatus({ state: 'idle', message: `已同步（下載 ${toDownload.size} 筆、上傳 ${toUpload.length} 筆）`, lastAt: at, dirty: false })
      return { uploaded: toUpload.length, downloaded: toDownload.size, at }
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

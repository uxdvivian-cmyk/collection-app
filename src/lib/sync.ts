// 跨裝置同步：把書存到你 Google Drive 的「應用程式專用資料夾」裡的一個 JSON 檔。
// 每筆資料以 uid 識別、以 updatedAt 較新者為準；刪除以 deleted 標記同步。

import { db, dirtyListeners, withoutTracking } from '../db'
import type { Book } from '../types'
import { clearToken, getAccessToken } from './googleAuth'
import { getPref, setPref } from './prefs'

export const PREF_CLIENT_ID = 'googleClientId'
export const PREF_AUTO = 'syncAuto' // '0' 關閉，其餘（含空）為開啟
const PREF_FILE_ID = 'driveFileId'
const PREF_LAST = 'lastSyncAt'
const FILE_NAME = 'collection.json'
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

async function upload(token: string, id: string | null, books: Book[]): Promise<string> {
  const body = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), books: books.map(({ id: _i, ...r }) => r) })
  if (id) {
    const res = await drive(token, `${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
    if (!res.ok) throw new Error(`Google Drive 寫入失敗（${res.status}）`)
    return id
  }
  const boundary = 'collection' + Math.random().toString(36).slice(2)
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
  const res = await drive(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  })
  if (!res.ok) throw new Error(`Google Drive 建立檔案失敗（${res.status}）`)
  return (await res.json()).id
}

// ── 同步 ──
let running: Promise<SyncResult> | null = null

/** interactive = true 才會跳出 Google 登入視窗（必須由使用者按鈕觸發） */
export function syncNow(interactive: boolean): Promise<SyncResult> {
  if (running) return running
  running = (async () => {
    const clientId = getPref(PREF_CLIENT_ID)
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
const autoOn = () => !!getPref(PREF_CLIENT_ID) && getPref(PREF_AUTO) !== '0'

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

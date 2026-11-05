import { useEffect, useState } from 'react'
import { getClientId, getSyncStatus, onSyncStatus, syncNow } from '../lib/sync'

/** 這個瀏覽器還沒登入同步（或登入過期）時，在書頁最上面提示，一鍵登入並把書單拉回來。 */
export default function SyncBanner() {
  const [s, setS] = useState(getSyncStatus())
  useEffect(() => onSyncStatus(setS), [])

  const needs = !!getClientId() && (s.lastAt === 0 || s.state === 'needs-login')
  if (!needs) return null

  return (
    <div className="syncbar" role="status">
      <div>
        <b>{s.lastAt === 0 ? '這個瀏覽器還沒登入同步' : '同步需要重新登入'}</b>
        <div className="zh">
          {s.state === 'syncing' ? '同步中…' : s.state === 'error' ? s.message : '登入 Google 後，其他裝置的書單會自動回來，這裡新增的書也不會遺失。'}
        </div>
      </div>
      <button className="btn sm" disabled={s.state === 'syncing'} onClick={() => { void syncNow(true).catch(() => undefined) }}>登入並同步</button>
    </div>
  )
}

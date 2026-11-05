import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import readXlsxFile from 'read-excel-file/browser'
import { db } from '../db'
import type { Book, Condition } from '../types'
import { CONDITION_LABEL } from '../lib/labels'
import { twd } from '../lib/money'
import { PREF_API_KEY, PREF_SHEET_URL, getPref } from '../lib/prefs'
import { fetchSheets } from '../lib/googleSheet'
import { normTitle, parseWorkbook, toBook, type ParsedRow, type ParsedSheet } from '../lib/friendExcel'
import Modal from './Modal'

type RawSheets = { sheet: string; data: readonly (readonly unknown[])[] }[]

type Phase =
  | { name: 'pick' }
  | { name: 'loading' }
  | { name: 'preview'; sheets: ParsedSheet[]; existing: Set<string>; matches: Map<string, number> }
  | { name: 'done'; added: number; updated: number }
  | { name: 'error'; message: string }

const SKIP_LABEL: Record<string, string> = {
  'skip-zero': '0 元（待同人分頁）', 'skip-negative': '扣款／非書', 'skip-private': '私人帳務', 'skip-total': '總計',
}

/** 已收到的列，若有同名且還在預購中的書，就更新那一本而不是新增。 */
function findMatches(sheets: ParsedSheet[], books: Book[], existing: Set<string>): Map<string, number> {
  const pool = new Map<string, number[]>()
  for (const b of books) {
    if (!b.preorder || b.bookSource !== 'friend' || b.id === undefined) continue
    const k = normTitle(b.title)
    pool.set(k, [...(pool.get(k) ?? []), b.id])
  }
  const out = new Map<string, number>()
  for (const s of sheets) {
    for (const r of s.rows) {
      if (r.status !== 'import' || r.preorder || existing.has(r.key)) continue
      const ids = pool.get(normTitle(r.title))
      if (ids?.length) out.set(r.key, ids.shift()!)
    }
  }
  return out
}

export default function ImportExcel({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ name: 'pick' })
  const [condition, setCondition] = useState<Condition>('used')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const sheetUrl = getPref(PREF_SHEET_URL)
  const apiKey = getPref(PREF_API_KEY)
  const canSync = !!sheetUrl && !!apiKey

  const toPreview = async (raw: RawSheets) => {
    const sheets = parseWorkbook(raw)
    const books = await db.books.toArray()
    const existing = new Set(books.map((b) => b.importKey).filter((k): k is string => !!k))
    const matches = findMatches(sheets, books, existing)
    const sel = new Set<string>()
    for (const s of sheets) for (const r of s.rows) if (r.status === 'import' && !existing.has(r.key)) sel.add(r.key)
    setSelected(sel)
    setPhase({ name: 'preview', sheets, existing, matches })
  }

  const run = async (load: () => Promise<RawSheets>) => {
    setPhase({ name: 'loading' })
    try {
      await toPreview(await load())
    } catch (e) {
      setPhase({ name: 'error', message: (e as Error).message })
    }
  }

  const onFile = (file?: File) => { if (file) void run(() => readXlsxFile(file)) }
  const onSync = () => void run(() => fetchSheets(sheetUrl, apiKey))

  const toggle = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }

  const preview = phase.name === 'preview' ? phase : null

  const stats = useMemo(() => {
    if (!preview) return null
    const rows = preview.sheets.flatMap((s) => s.rows)
    const picked = rows.filter((r) => selected.has(r.key))
    const updates = picked.filter((r) => preview.matches.has(r.key))
    const fresh = picked.filter((r) => !preview.matches.has(r.key))
    return {
      updates: updates.length,
      fresh: fresh.length,
      total: fresh.reduce((s, r) => s + (r.price ?? 0), 0),
      received: fresh.filter((r) => !r.preorder).length,
      pending: fresh.filter((r) => r.preorder).length,
      skipped: rows.filter((r) => r.status.startsWith('skip')),
      already: rows.filter((r) => preview.existing.has(r.key)).length,
    }
  }, [preview, selected])

  const doImport = async () => {
    if (!preview) return
    const rows = preview.sheets.flatMap((s) => s.rows).filter((r) => selected.has(r.key))
    const fresh = rows.filter((r) => !preview.matches.has(r.key))
    const updates = rows.filter((r) => preview.matches.has(r.key))
    await db.transaction('rw', db.books, async () => {
      await db.books.bulkAdd(fresh.map((r) => toBook(r, condition)))
      for (const r of updates) {
        const b = toBook(r, condition)
        // 預購中 → 已收到：保留你手動改過的分類、tag、品相，只更新到貨與價格資訊
        await db.books.update(preview.matches.get(r.key)!, {
          preorder: undefined, expectedMonth: undefined, acquiredDate: b.acquiredDate, importKey: b.importKey,
          unitPrice: b.unitPrice, quantity: b.quantity, listPrice: b.listPrice, listPriceEstimated: b.listPriceEstimated,
          ...(b.note ? { note: b.note } : {}),
        })
      }
    })
    setPhase({ name: 'done', added: fresh.length, updated: updates.length })
  }

  const rowLine = (r: ParsedRow) => {
    const dup = preview!.existing.has(r.key)
    const upd = preview!.matches.has(r.key)
    return (
      <label key={r.key} className={'imp-row' + (dup ? ' dim' : '')}>
        <input type="checkbox" checked={selected.has(r.key)} disabled={dup} onChange={() => toggle(r.key)} />
        <span className="imp-main">
          <span className="name">{r.title}</span>
          <span className="zh">
            {r.series ? `系列：${r.series}${r.volume ? ` 第${r.volume}卷` : ''}` : '單本'}
            {r.note ? ` · ${r.note}` : ''}
          </span>
          {(r.flags.length > 0 || dup || upd) && (
            <span className="imp-flag">{dup ? '已匯入過' : upd ? '將把預購中的同名書更新為已收到' : r.flags.join('；')}</span>
          )}
        </span>
        <span className="imp-price">{r.price !== undefined ? twd(r.price) : '—'}</span>
      </label>
    )
  }

  let body
  let actions
  if (phase.name === 'pick' || phase.name === 'loading') {
    body = (
      <>
        <p className="zh">朋友的書單，每個分頁的欄位為「書名、價格、附註、本數」。</p>
        <ul className="zh imp-rules">
          <li>分頁名稱「日期＋寄」：你已收到的書。</li>
          <li>「已讀完」「正在讀」等分頁：還在朋友那邊，記為預購中；之後出現在日期分頁，會自動把同名的預購中更新為已收到。</li>
          <li>「推薦再給」：不匯入。0 元的列（同人誌、贈品）先略過；門票、餐飲等私人帳務也略過。</li>
        </ul>
        <input ref={fileRef} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => onFile(e.target.files?.[0])} />
        <div className="row">
          <button className="btn" disabled={phase.name === 'loading' || !canSync} onClick={onSync}>從 Google 試算表同步</button>
          <button className="btn ghost" disabled={phase.name === 'loading'} onClick={() => fileRef.current?.click()}>選擇 Excel 檔</button>
        </div>
        {!canSync && (
          <p className="hint">
            還不能同步：「設定」裡還缺{!sheetUrl && '試算表網址'}{!sheetUrl && !apiKey && '、'}{!apiKey && 'API 金鑰'}。{' '}
            <Link to="/settings" onClick={onClose}>前往設定</Link>
          </p>
        )}
        {phase.name === 'loading' && <p className="note">讀取中…</p>}
      </>
    )
    actions = <button onClick={onClose}>取消</button>
  } else if (phase.name === 'preview' && stats) {
    const { sheets } = phase
    body = (
      <>
        <div className="lbl">新增書的品相
          <div className="seg2">
            {(['used', 'new'] as Condition[]).map((c) => (
              <button key={c} type="button" className={condition === c ? 'on' : ''} onClick={() => setCondition(c)}>{CONDITION_LABEL[c]}</button>
            ))}
          </div>
        </div>
        <p className="zh">
          新增 <b>{stats.fresh}</b> 本，共 <b>{twd(Math.round(stats.total))}</b>（已收到 {stats.received} 本、預購中 {stats.pending} 本）。
          {stats.updates > 0 && <> 另有 <b>{stats.updates}</b> 本預購中的書更新為已收到。</>}
          {' '}分類預設 BL，原價依實付 ÷ 0.7 推算（備註有折數則依折數），匯入後可逐本修改。
        </p>

        {sheets.filter((s) => s.kind !== 'ignored').map((s) => {
          const importable = s.rows.filter((r) => r.status === 'import')
          const picked = importable.filter((r) => selected.has(r.key)).length
          return (
            <details key={s.name} className="imp-sheet">
              <summary>
                <span className="name">{s.kind === 'received' ? `${s.date} 寄出` : s.name}</span>
                <span className="zh">{s.kind === 'pending' ? '還在朋友那邊 · ' : ''}{picked} / {importable.length} 本</span>
              </summary>
              {importable.map(rowLine)}
            </details>
          )
        })}

        <details className="imp-sheet">
          <summary>
            <span className="name">略過的項目</span>
            <span className="zh">{stats.skipped.length} 列</span>
          </summary>
          {stats.skipped.map((r) => (
            <div key={r.key} className="imp-row dim">
              <span className="imp-main"><span className="name">{r.title}</span><span className="zh">{r.sheet} · {SKIP_LABEL[r.status]}</span></span>
              <span className="imp-price">{r.price !== undefined ? r.price : ''}</span>
            </div>
          ))}
        </details>
        {stats.already > 0 && <p className="zh">已匯入過的 {stats.already} 列不會重複匯入。</p>}
      </>
    )
    const n = stats.fresh + stats.updates
    actions = (
      <>
        <button onClick={onClose}>取消</button>
        <button className="go" disabled={n === 0} onClick={doImport}>{n === 0 ? '沒有新的內容' : `套用 ${n} 筆`}</button>
      </>
    )
  } else if (phase.name === 'done') {
    body = <p className="note">已新增 {phase.added} 本{phase.updated > 0 ? `，更新 ${phase.updated} 本為已收到` : ''}。</p>
    actions = <button className="go" onClick={onClose}>完成</button>
  } else {
    body = <p className="err" role="alert">無法讀取：{phase.name === 'error' ? phase.message : ''}</p>
    actions = <><button onClick={() => setPhase({ name: 'pick' })}>返回</button><button onClick={onClose}>關閉</button></>
  }

  return <Modal title="匯入／同步朋友的書單" onClose={onClose} actions={actions} wide>{body}</Modal>
}

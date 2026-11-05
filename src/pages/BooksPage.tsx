import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { liveBooks } from '../db'
import type { Book, BookGenre } from '../types'
import { GENRES, GENRE_LABEL } from '../lib/labels'
import { totalCost, twd } from '../lib/money'
import { useBookActions } from '../lib/bookActions'
import BookCard from '../components/BookCard'
import ImportExcel from '../components/ImportExcel'
import IsbnScanner from '../components/IsbnScanner'
import SyncBanner from '../components/SyncBanner'
import SearchInput from '../components/SearchInput'

type GenreFilter = 'all' | BookGenre

/** 已有卷數中間缺的卷（不知道全套有幾卷，所以只看最小到最大之間的空缺） */
function missingVolumes(owned: Book[]): number[] {
  const vols = [...new Set(owned.map((b) => b.volume).filter((v): v is number => typeof v === 'number'))].sort((a, b) => a - b)
  if (vols.length < 2) return []
  const have = new Set(vols)
  const out: number[] = []
  for (let n = vols[0]; n <= vols[vols.length - 1]; n++) if (!have.has(n)) out.push(n)
  return out
}

export default function BooksPage() {
  const books = useLiveQuery(() => liveBooks(), [])
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState<GenreFilter>('all')
  const [onlyPre, setOnlyPre] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scanning, setScanning] = useState(false)

  const tagPool = useMemo(() => [...new Set((books ?? []).flatMap((b) => b.tags))], [books])
  const { actionsFor, openCreate, modal } = useBookActions(tagPool, books ?? [])

  if (!books) return null

  const ql = q.trim().toLowerCase()
  const list = books.filter((b) => {
    if (b.status === 'sold') return false
    if (genre !== 'all' && b.genre !== genre) return false
    if (onlyPre && !b.preorder) return false
    if (!ql) return true
    return [b.title, b.series ?? '', b.author ?? '', b.isbn ?? '', b.note ?? '', ...b.tags, ...b.zhKeywords].join(' ').toLowerCase().includes(ql)
  })

  const total = list.reduce((s, b) => s + totalCost(b), 0)
  const pre = list.filter((b) => b.preorder).reduce((s, b) => s + totalCost(b), 0)

  // 同一系列有 2 本以上時，併成一個群組（一張卡片、沒有群組標題，每列仍是完整書名＋集數）。
  // 群組出現在該系列第一本書的位置，其餘單本維持原順序。
  const seriesSize = new Map<string, number>()
  for (const b of books) if (b.series && b.status !== 'sold') seriesSize.set(b.series, (seriesSize.get(b.series) ?? 0) + 1)
  type Block = { key: string; items: Book[] }
  const blocks: Block[] = []
  const byKey = new Map<string, Block>()
  for (const b of list) {
    const grouped = !!b.series && (seriesSize.get(b.series) ?? 0) >= 2
    const key = grouped ? `s:${b.series}` : `b:${b.id}`
    let blk = byKey.get(key)
    if (!blk) { blk = { key, items: [] }; byKey.set(key, blk); blocks.push(blk) }
    blk.items.push(b)
  }

  return (
    <section>
      <SyncBanner />
      <div className="hrow">
        <h1>書</h1>
        <span className="grp">
          <button className="btn sm ghost" onClick={() => setImporting(true)}>匯入</button>
          <button className="btn sm ghost" onClick={() => setScanning(true)}>掃 ISBN</button>
          <button className="btn sm" onClick={() => openCreate()}>＋ 新增</button>
        </span>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="搜書名、作者、ISBN、tag" ariaLabel="搜尋書" />
      <div className="chips">
        <button className={genre === 'all' ? 'chip on' : 'chip'} onClick={() => setGenre('all')}>全部</button>
        {GENRES.map((g) => (
          <button key={g} className={genre === g ? 'chip on' : 'chip'} onClick={() => setGenre(g)}>{GENRE_LABEL[g]}</button>
        ))}
        <span className="sep" />
        <button className={onlyPre ? 'chip on' : 'chip'} aria-pressed={onlyPre} onClick={() => setOnlyPre(!onlyPre)}>預購中</button>
      </div>
      <div className="sum">
        <span>共 <b>{list.length}</b> 本</span>
        {genre === 'all' && pre > 0 && <span>其中預購中 <b>{twd(pre)}</b></span>}
        <span className="tot">總花費 <b>{twd(total)}</b></span>
      </div>

      {list.length === 0 && (
        <div className="empty">
          <p className="name">{books.length === 0 ? '還沒有書' : '沒有符合的書'}</p>
          {books.length === 0 && <p className="zh">按右上角「＋ 新增」開始記錄，或「掃 ISBN」查書，也可以用「匯入」匯入朋友的書單。</p>}
        </div>
      )}

      {[
        { title: '系列', blocks: blocks.filter((blk) => !!blk.items[0].series) },
        { title: '單本', blocks: blocks.filter((blk) => !blk.items[0].series) },
      ].filter((sec) => sec.blocks.length > 0).map((sec) => (
        <div key={sec.title}>
          <div className="sec-head">
            <h2>{sec.title}</h2>
            <span className="zh">{sec.blocks.reduce((n, blk) => n + blk.items.length, 0)} 本</span>
          </div>
          {sec.blocks.map((blk) => {
            if (blk.items.length === 1 && !blk.key.startsWith('s:')) {
              const b = blk.items[0]
              return <BookCard key={blk.key} book={b} actions={actionsFor(b)} />
            }
            const items = [...blk.items].sort((x, y) => (x.volume ?? 0) - (y.volume ?? 0))
            const gap = missingVolumes(books.filter((b) => b.series === items[0].series && b.status !== 'sold'))
            return (
              <div className="sg-card" key={blk.key}>
                {items.map((b) => <BookCard key={b.id} book={b} actions={actionsFor(b)} />)}
                {gap.length > 0 && <div className="gnote">缺 第 {gap.join('、')} 卷</div>}
              </div>
            )
          })}
        </div>
      ))}
      {modal}
      {importing && <ImportExcel onClose={() => setImporting(false)} />}
      {scanning && <IsbnScanner books={books} onClose={() => setScanning(false)} onAdd={(prefill) => { setScanning(false); openCreate(prefill) }} />}
    </section>
  )
}

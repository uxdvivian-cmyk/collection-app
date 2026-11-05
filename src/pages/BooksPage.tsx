import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Book, BookGenre } from '../types'
import { volumeLabel } from '../lib/series'
import { GENRES, GENRE_LABEL } from '../lib/labels'
import { totalCost, twd } from '../lib/money'
import { useBookActions } from '../lib/bookActions'
import BookCard from '../components/BookCard'
import ImportExcel from '../components/ImportExcel'

type GenreFilter = 'all' | BookGenre

export default function BooksPage() {
  const books = useLiveQuery(() => db.books.toArray(), [])
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState<GenreFilter>('all')
  const [onlyPre, setOnlyPre] = useState(false)
  const [importing, setImporting] = useState(false)

  const tagPool = useMemo(() => [...new Set((books ?? []).flatMap((b) => b.tags))], [books])
  const { actionsFor, openCreate, modal } = useBookActions(tagPool)

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

  // 一個系列有 2 本以上才分組顯示；單本與只有一本的系列直接列出完整書名
  const seriesSize = new Map<string, number>()
  for (const b of books) if (b.series && b.status !== 'sold') seriesSize.set(b.series, (seriesSize.get(b.series) ?? 0) + 1)
  const groups = new Map<string, Book[]>()
  const singles: Book[] = []
  for (const b of list) {
    if (b.series && (seriesSize.get(b.series) ?? 0) >= 2) groups.set(b.series, [...(groups.get(b.series) ?? []), b])
    else singles.push(b)
  }

  return (
    <section>
      <div className="hrow">
        <h1>書</h1>
        <span className="grp">
          <button className="btn sm ghost" onClick={() => setImporting(true)}>匯入 Excel</button>
          <button className="btn sm" onClick={openCreate}>＋ 新增</button>
        </span>
      </div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜書名、作者、ISBN、tag" aria-label="搜尋書" />
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
          {books.length === 0 && <p className="zh">按右上角「＋ 新增」開始記錄，或用「匯入 Excel」匯入朋友的書單。ISBN 掃描會在下一步加入。</p>}
        </div>
      )}

      {[...groups.entries()].map(([name, items]) => (
        <div className="sg" key={name}>
          <div className="ghead"><span className="gname">{name}</span></div>
          {items
            .sort((x, y) => (x.volume ?? 0) - (y.volume ?? 0))
            .map((b) => <BookCard key={b.id} book={b} label={volumeLabel(b)} actions={actionsFor(b)} />)}
        </div>
      ))}
      {singles.length > 0 && groups.size > 0 && <div className="ghead"><span className="gname">其他</span></div>}
      {singles.map((b) => <BookCard key={b.id} book={b} actions={actionsFor(b)} />)}
      {modal}
      {importing && <ImportExcel onClose={() => setImporting(false)} />}
    </section>
  )
}

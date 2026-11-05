import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { liveBooks, liveGoods } from '../db'
import { totalCost, twd } from '../lib/money'
import { useBookActions } from '../lib/bookActions'
import { useGoodsActions } from '../lib/goodsActions'
import BookCard from '../components/BookCard'
import GoodsCard from '../components/GoodsCard'
import SearchInput from '../components/SearchInput'
import SyncBanner from '../components/SyncBanner'

type Filter = 'all' | 'book' | 'goods'
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: '全部' }, { id: 'book', label: '同人誌' }, { id: 'goods', label: '同人周邊' }]

export default function DoujinPage() {
  const allBooks = useLiveQuery(() => liveBooks(), [])
  const allGoods = useLiveQuery(() => liveGoods(), [])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)

  const tagPool = useMemo(() => [...new Set([...(allBooks ?? []).flatMap((b) => b.tags), ...(allGoods ?? []).flatMap((g) => g.tags)])], [allBooks, allGoods])
  const bookActions = useBookActions(tagPool, allBooks ?? [])
  const goodsActions = useGoodsActions(tagPool)

  if (!allBooks || !allGoods) return null
  const ql = q.trim().toLowerCase()
  const books = filter === 'goods' ? [] : allBooks.filter((b) => b.collection === 'doujin' && b.status !== 'sold' &&
    (!ql || [b.title, b.series ?? '', b.author ?? '', b.note ?? '', ...b.tags, ...b.zhKeywords].join(' ').toLowerCase().includes(ql)))
  const goods = filter === 'book' ? [] : allGoods.filter((g) => g.collection === 'doujin' && g.status !== 'sold' &&
    (!ql || [g.name, g.category, g.note ?? '', ...g.tags, ...g.zhKeywords].join(' ').toLowerCase().includes(ql)))
  const total = [...books, ...goods].reduce((s, x) => s + totalCost(x), 0)
  const empty = books.length + goods.length === 0

  return (
    <section>
      <SyncBanner />
      <div className="hrow">
        <h1>同人</h1>
        <button className="btn sm" onClick={() => setAdding((v) => !v)}>＋ 新增</button>
      </div>
      {adding && (
        <div className="chips">
          <button className="chip" onClick={() => { setAdding(false); bookActions.openCreate({ collection: 'doujin' }) }}>同人誌</button>
          <button className="chip" onClick={() => { setAdding(false); goodsActions.openCreate('doujin') }}>同人周邊</button>
        </div>
      )}
      <SearchInput value={q} onChange={setQ} placeholder="搜品名、社團、作者、tag" ariaLabel="搜尋同人" />
      <div className="chips">
        {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? 'chip on' : 'chip'} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      <div className="sum">
        <span>共 <b>{books.length + goods.length}</b> 筆</span>
        <span className="tot">總花費 <b>{twd(total)}</b></span>
      </div>
      {empty && (
        <div className="empty">
          <p className="name">還沒有同人</p>
          <p className="zh">到「貼文字」解析訂單後，在每一列按「同人」，或按右上角「＋ 新增」。</p>
        </div>
      )}
      {books.length > 0 && <h2>同人誌</h2>}
      {books.map((b) => <BookCard key={b.id} book={b} actions={bookActions.actionsFor(b)} />)}
      {goods.length > 0 && <h2>同人周邊</h2>}
      {goods.map((g) => <GoodsCard key={g.id} goods={g} actions={goodsActions.actionsFor(g)} />)}
      {bookActions.modal}
      {goodsActions.modal}
    </section>
  )
}

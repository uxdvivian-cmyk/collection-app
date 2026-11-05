import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { liveGoods } from '../db'
import { totalCost, twd } from '../lib/money'
import { useGoodsActions } from '../lib/goodsActions'
import GoodsCard from '../components/GoodsCard'
import SearchInput from '../components/SearchInput'
import SyncBanner from '../components/SyncBanner'

type Filter = 'all' | 'preorder' | 'arrived' | 'used'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'preorder', label: '預購' }, { id: 'arrived', label: '已到貨' }, { id: 'used', label: '二手' },
]

export default function GoodsPage() {
  const goods = useLiveQuery(() => liveGoods(), [])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const tagPool = useMemo(() => [...new Set((goods ?? []).flatMap((g) => g.tags))], [goods])
  const { actionsFor, openCreate, modal } = useGoodsActions(tagPool)

  if (!goods) return null

  const ql = q.trim().toLowerCase()
  const list = goods
    .filter((g) => {
      if (g.collection === 'doujin' || g.status === 'sold') return false
      if (filter === 'preorder' && !g.preorder) return false
      if (filter === 'arrived' && g.preorder) return false
      if (filter === 'used' && g.condition !== 'used') return false
      if (!ql) return true
      return [g.name, g.category, g.source ?? '', g.note ?? '', ...g.tags, ...g.zhKeywords].join(' ').toLowerCase().includes(ql)
    })
    .sort((a, b) => b.createdAt - a.createdAt)

  const total = list.reduce((s, g) => s + totalCost(g), 0)
  const pre = list.filter((g) => g.preorder).reduce((s, g) => s + totalCost(g), 0)

  return (
    <section>
      <SyncBanner />
      <div className="hrow">
        <h1>周邊</h1>
        <button className="btn sm" onClick={openCreate}>＋ 新增</button>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="搜品名、中文關鍵字、類別、tag" ariaLabel="搜尋周邊" />
      <div className="chips">
        {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? 'chip on' : 'chip'} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      <div className="sum">
        <span>共 <b>{list.length}</b> 筆</span>
        {filter === 'all' && pre > 0 && <span>其中預購中 <b>{twd(pre)}</b></span>}
        <span className="tot">總花費 <b>{twd(total)}</b></span>
      </div>

      {list.length === 0 && (
        <div className="empty">
          <p className="name">{goods.length === 0 ? '還沒有周邊' : '沒有符合的周邊'}</p>
          {goods.length === 0 && <p className="zh">到「貼文字」貼上露天、BOOTH、Animate 的訂單文字，或按右上角「＋ 新增」。</p>}
        </div>
      )}
      {list.map((g) => <GoodsCard key={g.id} goods={g} actions={actionsFor(g)} />)}
      {modal}
    </section>
  )
}

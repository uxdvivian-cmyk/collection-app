import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { liveBooks, liveGoods } from '../db'
import { CONDITION_LABEL, GENRE_LABEL } from '../lib/labels'
import { totalCost, twd } from '../lib/money'
import { useBookActions } from '../lib/bookActions'
import { useGoodsActions } from '../lib/goodsActions'
import BookCard from '../components/BookCard'
import GoodsCard from '../components/GoodsCard'
import SearchInput from '../components/SearchInput'

type Scope = 'book' | 'goods' | 'doujin'
type Tab = 'forsale' | 'sold'

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'book', label: '書' },
  { id: 'goods', label: '周邊' },
  { id: 'doujin', label: '同人' },
]

export default function SalePage() {
  const books = useLiveQuery(() => liveBooks(), [])
  const goods = useLiveQuery(() => liveGoods(), [])
  const [scope, setScope] = useState<Scope>('book')
  const [tab, setTab] = useState<Tab>('forsale')
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState('')

  const tagPool = useMemo(() => [...new Set([...(books ?? []).flatMap((b) => b.tags), ...(goods ?? []).flatMap((g) => g.tags)])], [books, goods])
  const bookActions = useBookActions(tagPool, books ?? [])
  const goodsActions = useGoodsActions(tagPool)

  if (!books || !goods) return null

  const ql = q.trim().toLowerCase()
  const bookList = scope !== 'goods'
    ? books.filter((b) => (scope === 'doujin') === (b.collection === 'doujin') && b.status === tab && (!ql || [b.title, b.series ?? '', ...b.tags, ...b.zhKeywords].join(' ').toLowerCase().includes(ql)))
    : []
  const goodsList = scope !== 'book'
    ? goods.filter((g) => (scope === 'doujin') === (g.collection === 'doujin') && g.status === tab && (!ql || [g.name, g.category, ...g.tags, ...g.zhKeywords].join(' ').toLowerCase().includes(ql)))
    : []
  const rows: { price: number; cost: number; line: string }[] = [
    ...bookList.map((b) => ({ price: tab === 'forsale' ? b.askPrice ?? 0 : b.soldPrice ?? 0, cost: totalCost(b), line: `・${b.title}（${GENRE_LABEL[b.genre]}／${CONDITION_LABEL[b.condition]}）　${twd(b.askPrice ?? 0)}` })),
    ...goodsList.map((g) => ({ price: tab === 'forsale' ? g.askPrice ?? 0 : g.soldPrice ?? 0, cost: totalCost(g), line: `・${g.name}（${g.category}／${CONDITION_LABEL[g.condition]}${g.quantity > 1 ? `×${g.quantity}` : ''}）　${twd(g.askPrice ?? 0)}` })),
  ]

  const revenue = rows.reduce((s, r) => s + r.price, 0)
  const profit = revenue - rows.reduce((s, r) => s + r.cost, 0)
  const scopeLabel = SCOPES.find((s) => s.id === scope)!.label

  const exportText = rows.length && tab === 'forsale'
    ? `【出清｜${scopeLabel}】共 ${rows.length} 件，可議價、可合購\n${rows.map((r) => r.line).join('\n')}\n\n私訊洽詢，面交或寄送皆可。`
    : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied('已複製')
    } catch {
      setCopied('請長按選取後複製')
    }
  }

  return (
    <section>
      <h1>出清</h1>
      <SearchInput value={q} onChange={setQ} placeholder="搜尋出清品項" ariaLabel="搜尋出清" />
      <div className="chips">
        <span className="grp">
          {SCOPES.map((s) => <button key={s.id} className={scope === s.id ? 'chip on' : 'chip'} onClick={() => setScope(s.id)}>{s.label}</button>)}
        </span>
        <span className="sep" />
        <span className="grp">
          <button className={tab === 'forsale' ? 'chip on' : 'chip'} onClick={() => setTab('forsale')}>待出清</button>
          <button className={tab === 'sold' ? 'chip on' : 'chip'} onClick={() => setTab('sold')}>已售出</button>
        </span>
      </div>

      {(
        <div className="sum">
          {tab === 'forsale'
            ? <span>待出清 {rows.length} 筆，預定 {twd(revenue)}</span>
            : (
              <span>
                已售出 <b>{rows.length}</b> 筆，收入 <b>{twd(revenue)}</b>，獲利{' '}
                <b className={profit >= 0 ? 'gain' : 'loss'}>{profit >= 0 ? '+' : ''}{profit.toLocaleString()}</b>
              </span>
            )}
        </div>
      )}

      {rows.length === 0 && (
        <div className="empty"><p className="zh">還沒有品項。到「{scopeLabel}」頁按某一筆右邊的「⋯」來標記。</p></div>
      )}
      {bookList.map((b) => <BookCard key={b.id} book={b} actions={bookActions.actionsFor(b)} inSale />)}
      {goodsList.map((g) => <GoodsCard key={g.id} goods={g} actions={goodsActions.actionsFor(g)} inSale />)}

      {exportText && (
        <>
          <h2>出清清單文字（可貼到 FB 社團、PTT、蝦皮）</h2>
          <textarea readOnly value={exportText} aria-label="出清清單文字" />
          <div className="row"><button className="btn" onClick={copy}>複製文字</button><span className="zh">{copied}</span></div>
        </>
      )}
      {bookActions.modal}
      {goodsActions.modal}
    </section>
  )
}

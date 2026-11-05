import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { liveBooks } from '../db'
import { CONDITION_LABEL, GENRE_LABEL } from '../lib/labels'
import { totalCost, twd } from '../lib/money'
import { useBookActions } from '../lib/bookActions'
import BookCard from '../components/BookCard'
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
  const [scope, setScope] = useState<Scope>('book')
  const [tab, setTab] = useState<Tab>('forsale')
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState('')

  const tagPool = useMemo(() => [...new Set((books ?? []).flatMap((b) => b.tags))], [books])
  const { actionsFor, modal } = useBookActions(tagPool, books ?? [])

  if (!books) return null

  const ql = q.trim().toLowerCase()
  const list = scope === 'book'
    ? books.filter((b) => b.status === tab && (!ql || [b.title, b.series ?? '', ...b.tags, ...b.zhKeywords].join(' ').toLowerCase().includes(ql)))
    : []

  const sumText = tab === 'forsale'
    ? `待出清 ${list.length} 筆，預定 ${twd(list.reduce((s, b) => s + (b.askPrice ?? 0), 0))}`
    : (() => {
        const rev = list.reduce((s, b) => s + (b.soldPrice ?? 0), 0)
        const profit = rev - list.reduce((s, b) => s + totalCost(b), 0)
        return { rev, profit, n: list.length }
      })()

  const exportText = list.length && tab === 'forsale'
    ? `【出清｜書】共 ${list.length} 件，可議價、可合購\n` +
      list.map((b) => `・${b.title}（${GENRE_LABEL[b.genre]}／${CONDITION_LABEL[b.condition]}）　${twd(b.askPrice ?? 0)}`).join('\n') +
      '\n\n私訊洽詢，面交或寄送皆可。'
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

      {scope === 'book' ? (
        <div className="sum">
          {typeof sumText === 'string'
            ? <span>{sumText}</span>
            : (
              <span>
                已售出 <b>{sumText.n}</b> 筆，收入 <b>{twd(sumText.rev)}</b>，獲利{' '}
                <b className={sumText.profit >= 0 ? 'gain' : 'loss'}>{sumText.profit >= 0 ? '+' : ''}{sumText.profit.toLocaleString()}</b>
              </span>
            )}
        </div>
      ) : (
        <div className="empty"><p className="zh">周邊與同人的出清會在做完周邊、同人後加入。</p></div>
      )}

      {scope === 'book' && list.length === 0 && (
        <div className="empty"><p className="zh">還沒有品項。到「書」頁按某一筆右邊的「⋯」來標記。</p></div>
      )}
      {list.map((b) => <BookCard key={b.id} book={b} actions={actionsFor(b)} inSale />)}

      {exportText && (
        <>
          <h2>出清清單文字（可貼到 FB 社團、PTT、蝦皮）</h2>
          <textarea readOnly value={exportText} aria-label="出清清單文字" />
          <div className="row"><button className="btn" onClick={copy}>複製文字</button><span className="zh">{copied}</span></div>
        </>
      )}
      {modal}
    </section>
  )
}

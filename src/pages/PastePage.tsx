import { useState } from 'react'
import { Link } from 'react-router-dom'
import { commitDrafts, makeDrafts, type DraftOrder } from '../lib/importOrders'
import { getRate, toTWD, twd } from '../lib/money'
import { parseOrders } from '../lib/orderParser'
import CategoryPicker from '../components/CategoryPicker'
import SyncBanner from '../components/SyncBanner'

export default function PastePage() {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<DraftOrder[] | null>(null)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState<{ goods: number; books: number } | null>(null)

  const parse = async () => {
    setDone(null)
    const orders = parseOrders(text)
    if (!orders.length) {
      setDrafts(null)
      setMsg('認不出任何品項（需要每個品項那行有價格，例如「¥1,200」或「NT$ 350」）。可以改成下面「手動加一列」自己填。')
      return
    }
    setMsg('')
    setDrafts(await makeDrafts(orders))
  }

  const patchOrder = (key: string, p: Partial<DraftOrder>) => setDrafts((ds) => ds && ds.map((o) => (o.key === key ? { ...o, ...p } : o)))
  const patchItem = (ok: string, ik: string, p: Record<string, unknown>) =>
    setDrafts((ds) => ds && ds.map((o) => (o.key === ok ? { ...o, items: o.items.map((i) => (i.key === ik ? { ...i, ...p } : i)) } : o)))

  const addRow = (ok: string) => setDrafts((ds) => ds && ds.map((o) => o.key === ok ? { ...o, items: [...o.items, { kind: 'goods', name: '', category: '其他', quantity: 1, unitPrice: 0, preorder: false, tags: [], key: `${ok}m${o.items.length}-${Date.now()}`, selected: true }] } : o))
  const startManual = () => { setMsg(''); setDrafts([{ key: 'm0', source: '其他', date: new Date().toISOString().slice(0, 10), currency: 'TWD', domesticShipping: 0, intlShipping: 0, items: [] }]) }

  const picked = drafts?.flatMap((o) => o.items.filter((i) => i.selected)) ?? []
  const goodsN = picked.filter((i) => i.kind === 'goods').length
  const doujinN = picked.filter((i) => i.doujin).length

  const importNow = async () => {
    if (!drafts) return
    const r = await commitDrafts(drafts)
    setDone(r)
    setDrafts(null)
    setText('')
  }

  return (
    <section>
      <SyncBanner />
      <h1>貼文字入庫</h1>
      <p className="zh">整段貼上訂單文字（個資不會被讀取）。露天、BOOTH、Animate、讀冊、コミコミ有專屬解析；其他平台或代購會用通用解析，抓每行的價格與數量，你確認後再入庫。買的是書會自動進「書」；同人誌、同人周邊在每一列按「同人」切換；品名裡有詞庫的日文詞，會自動帶出中文關鍵字。</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="貼上訂單文字" placeholder="在這裡貼上訂單文字…" />
      <div className="row"><button className="btn" disabled={!text.trim()} onClick={parse}>解析</button></div>
      {msg && <p className="err" role="alert">{msg}</p>}
      {!drafts && <p className="zh"><button type="button" className="linkbtn" onClick={startManual}>沒有訂單文字？直接手動輸入</button></p>}

      {done && (
        <div className="empty">
          <p className="note">已匯入：周邊 {done.goods} 筆、書 {done.books} 本。</p>
          <p className="zh"><Link to="/goods">看周邊</Link>　<Link to="/">看書</Link></p>
        </div>
      )}

      {drafts && (
        <>
          <h2>解析結果：確認後才入庫</h2>
          {drafts.map((o) => {
            const n = o.items.filter((i) => i.selected).length
            const domTWD = toTWD(o.domesticShipping, o.currency, getRate())
            return (
              <div className="draft" key={o.key}>
                <div className="name">{o.source === '其他' || o.key.startsWith('m') ? '訂單' : o.source}{o.orderNo ? ` · ${o.orderNo}` : ''}</div>
                {(o.source === '其他' || o.key.startsWith('m')) && (
                  <div className="two">
                    <label>來源（平台／代購名）<input value={o.source === '其他' ? '' : o.source} placeholder="例：○○代購" onChange={(e) => patchOrder(o.key, { source: e.target.value.trim() || '其他' })} /></label>
                    <label>幣別<select value={o.currency} onChange={(e) => patchOrder(o.key, { currency: e.target.value as 'JPY' | 'TWD' })}><option value="TWD">台幣</option><option value="JPY">日幣</option></select></label>
                  </div>
                )}
                <div className="two">
                  <label>訂單日期<input type="date" value={o.date} onChange={(e) => patchOrder(o.key, { date: e.target.value })} /></label>
                  <label>國際／轉運運費（台幣，選填）<input type="number" inputMode="numeric" value={o.intlShipping || ''} onChange={(e) => patchOrder(o.key, { intlShipping: Number(e.target.value) || 0 })} /></label>
                </div>
                <label>國內運費（{o.currency === 'JPY' ? '日幣' : '台幣'}）<input type="number" inputMode="numeric" value={o.domesticShipping || ''} onChange={(e) => patchOrder(o.key, { domesticShipping: Number(e.target.value) || 0 })} /></label>
                <p className="zh">
                  國內運費 {twd(domTWD)}（折扣、點數一律不計）；運費會平均分攤到勾選的 {n} 筆。
                </p>
                {o.items.map((i) => (
                  <div className={'imp-row' + (i.deferred ? ' dim' : '')} key={i.key}>
                    <input type="checkbox" checked={i.selected} disabled={!!i.deferred} aria-label="匯入這筆" onChange={(e) => patchItem(o.key, i.key, { selected: e.target.checked })} />
                    <div className="imp-main">
                      <input type="search" value={i.name} aria-label="名稱" onChange={(e) => patchItem(o.key, i.key, { name: e.target.value })} />
                      <div className="tags">
                        {!i.deferred
                          ? <button type="button" className="tag tagbtn" aria-label="切換周邊或書" onClick={() => patchItem(o.key, i.key, { kind: i.kind === 'book' ? 'goods' : 'book' })}>{i.kind === 'book' ? '書' : '周邊'} ⇄</button>
                          : <span className="tag">周邊</span>}
                        {!i.deferred && <button type="button" className={'tag tagbtn' + (i.doujin ? ' on' : '')} aria-pressed={!!i.doujin} aria-label="切換同人" onClick={() => patchItem(o.key, i.key, { doujin: !i.doujin })}>{i.doujin ? '同人 ✓' : '同人'}</button>}
                        {i.condition === 'used' && <span className="tag used">二手</span>}
                        {i.preorder && <span className="tag pre">預購中{i.expectedMonth ? ' ' + i.expectedMonth : ''}</span>}
                        <span className="tag">{o.currency === 'JPY' ? '¥' + i.unitPrice.toLocaleString() : 'NT$ ' + i.unitPrice.toLocaleString()}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
                        {i.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
                      </div>
                      {!i.deferred && (
                        <div className="two">
                          <label>數量<input type="number" inputMode="numeric" min={1} value={i.quantity} onChange={(e) => patchItem(o.key, i.key, { quantity: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} /></label>
                          <label>單價（{o.currency === 'JPY' ? '日幣' : '台幣'}）<input type="number" inputMode="numeric" value={i.unitPrice || ''} onChange={(e) => patchItem(o.key, i.key, { unitPrice: Number(e.target.value) || 0 })} /></label>
                        </div>
                      )}
                      {i.kind === 'goods' && !i.deferred && <CategoryPicker value={i.category} onChange={(c) => patchItem(o.key, i.key, { category: c })} />}
                      {i.note && <span className="zh">{i.note}</span>}
                      {i.duplicateOf && <span className="imp-flag">可能重複：已有「{i.duplicateOf}」，預設不匯入</span>}
                      {i.deferred && <span className="imp-flag">{i.deferred}</span>}
                    </div>
                  </div>
                ))}
                <div className="row"><button type="button" className="btn ghost" onClick={() => addRow(o.key)}>＋ 手動加一列</button></div>
              </div>
            )
          })}
          <div className="row">
            <button className="btn" disabled={picked.length === 0} onClick={importNow}>
              {picked.length === 0 ? '沒有勾選的品項' : `匯入 ${picked.length} 筆（周邊 ${goodsN}、書 ${picked.length - goodsN}${doujinN ? `；其中同人 ${doujinN}` : ''}）`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

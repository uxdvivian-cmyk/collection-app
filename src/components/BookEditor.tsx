import { useState } from 'react'
import { db } from '../db'
import type { Book, BookGenre, BookSource, Condition, Currency } from '../types'
import { CONDITION_LABEL, FRIEND_DISCOUNT, GENRES, GENRE_LABEL, SOURCES, SOURCE_LABEL } from '../lib/labels'
import Modal from './Modal'
import TagPicker from './TagPicker'

interface Props {
  book?: Book // 沒有就是新增
  tagPool: string[]
  onClose: () => void
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s))

export default function BookEditor({ book, tagPool, onClose }: Props) {
  const [title, setTitle] = useState(book?.title ?? '')
  const [genre, setGenre] = useState<BookGenre>(book?.genre ?? 'BL')
  const [condition, setCondition] = useState<Condition>(book?.condition ?? 'new')
  const [source, setSource] = useState<BookSource>(book?.bookSource ?? 'online')
  const [series, setSeries] = useState(book?.series ?? '')
  const [volume, setVolume] = useState(book?.volume?.toString() ?? '')
  const [seriesTotal, setSeriesTotal] = useState(book?.seriesTotal?.toString() ?? '')
  const [tags, setTags] = useState<string[]>(book?.tags ?? [])
  const [currency, setCurrency] = useState<Currency>(book?.currency ?? 'TWD')
  const [price, setPrice] = useState(book?.unitPrice?.toString() ?? '')
  const [listPrice, setListPrice] = useState(book?.listPrice?.toString() ?? '')
  const [preorder, setPreorder] = useState(book?.preorder ?? false)
  const [month, setMonth] = useState(book?.expectedMonth ?? '')
  const [note, setNote] = useState(book?.note ?? '')
  const [saleValue, setSaleValue] = useState((book?.status === 'sold' ? book.soldPrice : book?.askPrice)?.toString() ?? '')
  const [error, setError] = useState('')

  const save = async () => {
    const t = title.trim()
    const p = num(price)
    if (!t) return setError('請輸入書名')
    if (p === undefined || Number.isNaN(p) || p < 0) return setError('請輸入價格')

    let lp = num(listPrice)
    let estimated = false
    if (lp === undefined && source === 'friend') {
      lp = Math.round(p / FRIEND_DISCOUNT) // 朋友二手書：原價 = 實付 ÷ 0.7
      estimated = true
    }

    const common = {
      title: t, genre, condition, bookSource: source,
      series: series.trim() || undefined,
      volume: num(volume),
      seriesTotal: num(seriesTotal),
      tags, currency, unitPrice: p,
      listPrice: lp, listPriceEstimated: lp !== undefined ? estimated : undefined,
      preorder: preorder || undefined,
      expectedMonth: preorder ? month || undefined : undefined,
      note: note.trim() || undefined,
    }
    const sv = num(saleValue)

    if (book?.id !== undefined) {
      await db.books.update(book.id, {
        ...common,
        ...(book.status === 'forsale' && sv !== undefined ? { askPrice: sv } : {}),
        ...(book.status === 'sold' && sv !== undefined ? { soldPrice: sv } : {}),
      })
    } else {
      await db.books.add({
        ...common, collection: 'general', status: 'owned', quantity: 1,
        zhKeywords: [], createdAt: Date.now(),
      })
    }
    onClose()
  }

  return (
    <Modal
      title={book ? '編輯' : '新增書籍'}
      onClose={onClose}
      actions={<><button onClick={onClose}>取消</button><button className="go" onClick={save}>儲存</button></>}
    >
      <label>書名<input type="search" value={title} onChange={(e) => setTitle(e.target.value)} /></label>

      <div className="lbl">分類
        <div className="seg2 three">
          {GENRES.map((g) => <button key={g} type="button" className={genre === g ? 'on' : ''} onClick={() => setGenre(g)}>{GENRE_LABEL[g]}</button>)}
        </div>
      </div>

      <div className="lbl">品相
        <div className="seg2">
          {(['new', 'used'] as Condition[]).map((c) => <button key={c} type="button" className={condition === c ? 'on' : ''} onClick={() => setCondition(c)}>{CONDITION_LABEL[c]}</button>)}
        </div>
      </div>

      <div className="lbl">來源
        <div className="seg2 four">
          {SOURCES.map((s) => <button key={s} type="button" className={source === s ? 'on' : ''} onClick={() => setSource(s)}>{SOURCE_LABEL[s]}</button>)}
        </div>
      </div>

      <label>系列名稱（單本留空）<input type="search" value={series} onChange={(e) => setSeries(e.target.value)} /></label>
      <div className="two">
        <label>第幾卷<input type="number" inputMode="numeric" value={volume} onChange={(e) => setVolume(e.target.value)} /></label>
        <label>系列總卷數（選填）<input type="number" inputMode="numeric" value={seriesTotal} onChange={(e) => setSeriesTotal(e.target.value)} /></label>
      </div>

      <div className="lbl">Tag
        <TagPicker tags={tags} pool={tagPool} onChange={setTags} />
      </div>

      <div className="lbl">幣別
        <div className="seg2">
          {(['TWD', 'JPY'] as Currency[]).map((c) => <button key={c} type="button" className={currency === c ? 'on' : ''} onClick={() => setCurrency(c)}>{c === 'TWD' ? '台幣' : '日幣'}</button>)}
        </div>
      </div>
      <div className="two">
        <label>實付價（{currency}）<input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>原價（選填）<input type="number" inputMode="decimal" value={listPrice} onChange={(e) => setListPrice(e.target.value)} /></label>
      </div>
      {source === 'friend' && !listPrice && <p className="hint">朋友的二手書，原價留空會自動推算為實付 ÷ 0.7。</p>}

      <div className="lbl">到貨狀態
        <div className="seg2">
          <button type="button" className={!preorder ? 'on' : ''} onClick={() => setPreorder(false)}>已收到</button>
          <button type="button" className={preorder ? 'on' : ''} onClick={() => setPreorder(true)}>預購中</button>
        </div>
      </div>
      {preorder && <label>預計到貨月（選填）<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>}

      <label>備註（選填）<input type="search" value={note} onChange={(e) => setNote(e.target.value)} /></label>

      {book?.status === 'forsale' && (
        <label>預定出清價（NT$，整筆）<input type="number" inputMode="numeric" value={saleValue} onChange={(e) => setSaleValue(e.target.value)} /></label>
      )}
      {book?.status === 'sold' && (
        <label>實際售出價（NT$，整筆）<input type="number" inputMode="numeric" value={saleValue} onChange={(e) => setSaleValue(e.target.value)} /></label>
      )}

      {error && <p className="err" role="alert">{error}</p>}
    </Modal>
  )
}

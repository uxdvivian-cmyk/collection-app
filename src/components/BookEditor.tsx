import { useState } from 'react'
import { db } from '../db'
import type { Book, BookGenre, BookSource, Condition, Currency } from '../types'
import { CONDITION_LABEL, FRIEND_DISCOUNT, GENRES, GENRE_LABEL, SOURCES, SOURCE_LABEL } from '../lib/labels'
import { findDuplicates, type DupHit } from '../lib/duplicates'
import { normalizeIsbn } from '../lib/isbn'
import DupList from './DupList'
import GlossaryAdd from './GlossaryAdd'
import Modal from './Modal'
import TagPicker from './TagPicker'

interface Props {
  book?: Book // 沒有就是新增
  prefill?: Partial<Book> // 新增時預先帶入（例如掃 ISBN 查到的資料）
  books: Book[] // 全部的書，用來比對重複
  tagPool: string[]
  onClose: () => void
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s))

export default function BookEditor({ book, prefill, books, tagPool, onClose }: Props) {
  const init: Partial<Book> = book ?? prefill ?? {}
  const [title, setTitle] = useState(init.title ?? '')
  const isbn = init.isbn ?? '' // 由掃描帶入，不在這裡手動編輯；用來比對重複
  const [zh, setZh] = useState(init.zhKeywords?.join(' ') ?? '')
  const [genre, setGenre] = useState<BookGenre>(init.genre ?? 'BL')
  const [condition, setCondition] = useState<Condition>(init.condition ?? 'new')
  const [source, setSource] = useState<BookSource>(init.bookSource ?? 'online')
  const [series, setSeries] = useState(init.series ?? '')
  const [volume, setVolume] = useState(init.volume?.toString() ?? '')
  const [tags, setTags] = useState<string[]>(init.tags ?? [])
  const [currency, setCurrency] = useState<Currency>(init.currency ?? 'TWD')
  const [price, setPrice] = useState(init.unitPrice?.toString() ?? '')
  const [listPrice, setListPrice] = useState(init.listPrice?.toString() ?? '')
  const [preorder, setPreorder] = useState(init.preorder ?? false)
  const [month, setMonth] = useState(init.expectedMonth ?? '')
  const [note, setNote] = useState(init.note ?? '')
  const [saleValue, setSaleValue] = useState((book?.status === 'sold' ? book.soldPrice : book?.askPrice)?.toString() ?? '')
  const [error, setError] = useState('')
  const [dups, setDups] = useState<DupHit[]>([])

  const save = async () => {
    const t = title.trim()
    const p = num(price)
    if (!t) return setError('請輸入書名')
    if (p === undefined || Number.isNaN(p) || p < 0) return setError('請輸入價格')
    const isbnRaw = isbn.trim()
    const isbn13 = isbnRaw ? normalizeIsbn(isbnRaw) : null
    if (isbnRaw && !isbn13) return setError('ISBN 不正確，請檢查數字（或清空）')
    setError('')

    // 新增時先比對重複：有疑似重複就先警告，再按一次才會新增
    if (!book && dups.length === 0) {
      const hits = findDuplicates({ isbn: isbn13 ?? undefined, title: t, series: series.trim() || undefined, volume: num(volume) }, books)
      if (hits.length) { setDups(hits); return }
    }

    let lp = num(listPrice)
    let estimated = false
    if (lp === undefined && source === 'friend') {
      lp = Math.round(p / FRIEND_DISCOUNT) // 朋友二手書：原價 = 實付 ÷ 0.7
      estimated = true
    }

    const common = {
      title: t, zhKeywords: zh.split(/\s+/).filter(Boolean), isbn: isbn13 ?? undefined, genre, condition, bookSource: source,
      series: series.trim() || undefined,
      volume: num(volume),
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
        author: prefill?.author, publisher: prefill?.publisher, coverUrl: prefill?.coverUrl, language: prefill?.language,
        createdAt: Date.now(),
      })
    }
    onClose()
  }

  return (
    <Modal
      title={book ? '編輯' : '新增書籍'}
      onClose={onClose}
      actions={<><button onClick={onClose}>取消</button><button className="go" onClick={save}>{dups.length ? '仍要新增' : '儲存'}</button></>}
    >
      {dups.length > 0 && (
        <div className="warnbox" role="alert">
          <b>你可能已經有這本</b>
          <DupList hits={dups} />
          <p className="zh">確定要再買一本，按右下角「仍要新增」；不是的話請取消。</p>
        </div>
      )}

      <label>書名<input type="search" value={title} onChange={(e) => { setTitle(e.target.value); setDups([]) }} /></label>
      {isbn && <p className="hint">ISBN {isbn}</p>}
      <label>中文關鍵字（選填，用空白分開，搜尋用）<input type="search" value={zh} onChange={(e) => setZh(e.target.value)} /></label>
      <GlossaryAdd name={title} zh={zh} />

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

      <div className="two sv">
        <label>系列名稱（單本留空）<input type="search" value={series} onChange={(e) => { setSeries(e.target.value); setDups([]) }} /></label>
        <label>第幾卷<input type="number" inputMode="numeric" value={volume} onChange={(e) => { setVolume(e.target.value); setDups([]) }} /></label>
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

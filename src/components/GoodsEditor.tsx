import { useState } from 'react'
import { db } from '../db'
import type { Condition, Currency, Goods } from '../types'
import { CONDITION_LABEL } from '../lib/labels'
import { getRate } from '../lib/money'
import CategoryPicker from './CategoryPicker'
import Modal from './Modal'
import TagPicker from './TagPicker'

interface Props {
  goods?: Goods // 沒有就是新增
  tagPool: string[]
  onClose: () => void
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s))

export default function GoodsEditor({ goods, tagPool, onClose }: Props) {
  const [name, setName] = useState(goods?.name ?? '')
  const [zh, setZh] = useState(goods?.zhKeywords.join(' ') ?? '')
  const [category, setCategory] = useState(goods?.category ?? '壓克力牌')
  const [condition, setCondition] = useState<Condition>(goods?.condition ?? 'new')
  const [source, setSource] = useState(goods?.source ?? '')
  const [tags, setTags] = useState<string[]>(goods?.tags ?? [])
  const [currency, setCurrency] = useState<Currency>(goods?.currency ?? 'TWD')
  const [price, setPrice] = useState(goods?.unitPrice?.toString() ?? '')
  const [qty, setQty] = useState((goods?.quantity ?? 1).toString())
  const [preorder, setPreorder] = useState(goods?.preorder ?? false)
  const [month, setMonth] = useState(goods?.expectedMonth ?? '')
  const [note, setNote] = useState(goods?.note ?? '')
  const [saleValue, setSaleValue] = useState((goods?.status === 'sold' ? goods.soldPrice : goods?.askPrice)?.toString() ?? '')
  const [error, setError] = useState('')

  const save = async () => {
    const n = name.trim()
    const p = num(price)
    const q = Number(qty)
    if (!n) return setError('請輸入名稱')
    if (p === undefined || Number.isNaN(p) || p < 0) return setError('請輸入單價')
    if (!(q >= 1)) return setError('數量至少是 1')

    const common = {
      name: n, zhKeywords: zh.split(/\s+/).filter(Boolean), category, condition,
      source: source.trim() || undefined, tags, currency, unitPrice: p, quantity: Math.round(q),
      preorder: preorder || undefined, expectedMonth: preorder ? month || undefined : undefined,
      note: note.trim() || undefined,
    }
    const sv = num(saleValue)
    if (goods?.id !== undefined) {
      await db.goods.update(goods.id, {
        ...common,
        ...(goods.currency !== currency ? { fxRate: currency === 'JPY' ? getRate() : undefined } : {}),
        ...(goods.status === 'forsale' && sv !== undefined ? { askPrice: sv } : {}),
        ...(goods.status === 'sold' && sv !== undefined ? { soldPrice: sv } : {}),
      })
    } else {
      await db.goods.add({
        ...common, collection: 'general', status: 'owned',
        fxRate: currency === 'JPY' ? getRate() : undefined, createdAt: Date.now(),
      })
    }
    onClose()
  }

  return (
    <Modal
      title={goods ? '編輯' : '新增周邊'}
      onClose={onClose}
      actions={<><button onClick={onClose}>取消</button><button className="go" onClick={save}>儲存</button></>}
    >
      <label>名稱<input type="search" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>中文關鍵字（用空白分開，搜尋用）<input type="search" value={zh} onChange={(e) => setZh(e.target.value)} /></label>

      <div className="lbl">類別
        <CategoryPicker value={category} onChange={setCategory} />
      </div>

      <div className="lbl">品相
        <div className="seg2">
          {(['new', 'used'] as Condition[]).map((c) => <button key={c} type="button" className={condition === c ? 'on' : ''} onClick={() => setCondition(c)}>{CONDITION_LABEL[c]}</button>)}
        </div>
      </div>

      <label>來源店家（選填）<input type="search" value={source} onChange={(e) => setSource(e.target.value)} /></label>

      <div className="lbl">Tag（作品、角色、社團…）
        <TagPicker tags={tags} pool={tagPool} onChange={setTags} />
      </div>

      <div className="lbl">幣別
        <div className="seg2">
          {(['TWD', 'JPY'] as Currency[]).map((c) => <button key={c} type="button" className={currency === c ? 'on' : ''} onClick={() => setCurrency(c)}>{c === 'TWD' ? '台幣' : '日幣'}</button>)}
        </div>
      </div>
      <div className="two">
        <label>單價（{currency}）<input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>數量<input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      </div>

      <div className="lbl">到貨狀態
        <div className="seg2">
          <button type="button" className={!preorder ? 'on' : ''} onClick={() => setPreorder(false)}>已收到</button>
          <button type="button" className={preorder ? 'on' : ''} onClick={() => setPreorder(true)}>預購中</button>
        </div>
      </div>
      {preorder && <label>預計到貨月（選填）<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>}

      <label>備註（選填）<input type="search" value={note} onChange={(e) => setNote(e.target.value)} /></label>

      {goods?.status === 'forsale' && (
        <label>預定出清價（NT$，整筆）<input type="number" inputMode="numeric" value={saleValue} onChange={(e) => setSaleValue(e.target.value)} /></label>
      )}
      {goods?.status === 'sold' && (
        <label>實際售出價（NT$，整筆）<input type="number" inputMode="numeric" value={saleValue} onChange={(e) => setSaleValue(e.target.value)} /></label>
      )}

      {error && <p className="err" role="alert">{error}</p>}
    </Modal>
  )
}

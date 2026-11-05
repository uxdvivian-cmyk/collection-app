import type { Book } from '../types'
import { CONDITION_LABEL, GENRE_LABEL, SOURCE_LABEL } from '../lib/labels'
import { totalCost, twd } from '../lib/money'
import ItemMenu, { type MenuAction } from './ItemMenu'

interface Props {
  book: Book
  actions: MenuAction[]
  inSale?: boolean // 出清頁：主價顯示預定出清價／售出價，小字顯示原價
  label?: string // 在系列群組內時，用卷數取代完整書名
}

export default function BookCard({ book: b, actions, inSale, label }: Props) {
  const sold = b.status === 'sold'
  const saleView = sold || (inSale && b.status === 'forsale')
  const price = sold ? (b.soldPrice ?? totalCost(b)) : saleView ? (b.askPrice ?? totalCost(b)) : totalCost(b)
  const subs: string[] = []
  if (saleView) {
    // 出清頁：主價是預定出清價／售出價，小字是原價（沒有原價才退而顯示購入價）
    subs.push(b.listPrice !== undefined ? `原價 ${twd(b.listPrice)}${b.listPriceEstimated ? '（推算）' : ''}` : `購入 ${twd(totalCost(b))}`)
  } else {
    if (b.currency === 'JPY') subs.push('¥' + (b.unitPrice * b.quantity).toLocaleString())
    if (b.listPrice !== undefined) subs.push(`原價 ${twd(b.listPrice)}${b.listPriceEstimated ? '（推算）' : ''}`)
  }

  return (
    <div className="item">
      <div className="top">
        <div className="l">
          <div className="name">{label ?? b.title}</div>
          {b.note && <div className="zh">{b.note}</div>}
          <div className="tags">
            <span className="tag">{GENRE_LABEL[b.genre]}</span>
            <span className={b.condition === 'used' ? 'tag used' : 'tag'}>{CONDITION_LABEL[b.condition]}</span>
            {b.preorder && <span className="tag pre">預購中{b.expectedMonth ? ' ' + b.expectedMonth : ''}</span>}
            {b.status === 'forsale' && <span className="tag sale">待出清</span>}
            <span className="tag">{SOURCE_LABEL[b.bookSource]}</span>
            {b.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        </div>
        <div className="r">
          <div className="p">{twd(price)}</div>
          {subs.length > 0 && <div className="s">{subs.join(' · ')}</div>}
          <ItemMenu actions={actions} />
        </div>
      </div>
    </div>
  )
}

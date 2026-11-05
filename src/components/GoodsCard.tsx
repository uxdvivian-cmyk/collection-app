import type { Goods } from '../types'
import { CONDITION_LABEL } from '../lib/labels'
import { totalCost, twd } from '../lib/money'
import ItemMenu, { type MenuAction } from './ItemMenu'

interface Props {
  goods: Goods
  actions: MenuAction[]
  inSale?: boolean // 出清頁：主價顯示預定出清價／售出價，小字顯示購入價
}

export default function GoodsCard({ goods: g, actions, inSale }: Props) {
  const sold = g.status === 'sold'
  const saleView = sold || (inSale && g.status === 'forsale')
  const cost = totalCost(g)
  const price = sold ? (g.soldPrice ?? cost) : saleView ? (g.askPrice ?? cost) : cost
  const subs: string[] = []
  if (saleView) subs.push(`購入 ${twd(cost)}`)
  else {
    if (g.currency === 'JPY') subs.push('¥' + (g.unitPrice * g.quantity).toLocaleString())
    if (g.quantity > 1) subs.push(`${g.quantity} 件`)
    const ship = Math.round((g.shippingShare ?? 0) + (g.intlShippingShare ?? 0))
    if (ship > 0) subs.push(`含運 ${ship}`)
  }

  return (
    <div className="item">
      <div className="top">
        <div className="l">
          <div className="name">{g.name}</div>
          {g.zhKeywords.length > 0 && <div className="zh">{g.zhKeywords.join(' ')}</div>}
          {g.note && <div className="zh">{g.note}</div>}
          <div className="tags">
            <span className="tag">{g.category}</span>
            <span className={g.condition === 'used' ? 'tag used' : 'tag'}>{CONDITION_LABEL[g.condition]}</span>
            {g.preorder && <span className="tag pre">預購中{g.expectedMonth ? ' ' + g.expectedMonth : ''}</span>}
            {g.status === 'forsale' && <span className="tag sale">待出清</span>}
            {g.source && <span className="tag">{g.source}</span>}
            {g.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
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

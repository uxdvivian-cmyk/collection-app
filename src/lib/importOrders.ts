import { db, liveBooks, liveGoods } from '../db'
import type { Book, Goods } from '../types'
import { parseTitle, normTitle } from './friendExcel'
import { getRate, toTWD } from './money'
import type { ParsedItem, ParsedOrder } from './orderParser'

/** 周邊的重複比對：品名相同（忽略空白與大小寫），或其中一個包含另一個（至少 6 個字）。已售出的不算。 */
export function findGoodsDuplicate(name: string, goods: Goods[]): Goods | undefined {
  const n = normTitle(name)
  if (!n) return undefined
  return goods.find((g) => {
    if (g.status === 'sold') return false
    const m = normTitle(g.name)
    return m === n || (n.length >= 6 && m.length >= 6 && (m.includes(n) || n.includes(m)))
  })
}

export interface DraftItem extends ParsedItem {
  key: string
  selected: boolean
  duplicateOf?: string // 疑似重複的既有品項名稱
}
export interface DraftOrder extends Omit<ParsedOrder, 'items'> {
  key: string
  intlShipping: number // 國際／轉運運費（台幣，選填）
  items: DraftItem[]
}

/** 把解析結果變成可編輯的草稿，並標出疑似重複的品項（重複的預設不勾） */
export async function makeDrafts(orders: ParsedOrder[]): Promise<DraftOrder[]> {
  const [goods, books] = [await liveGoods(), await liveBooks()]
  return orders.map((o, oi) => ({
    ...o, key: `o${oi}`, intlShipping: 0,
    items: o.items.map((it, ii) => {
      let dup: string | undefined
      if (it.kind === 'goods') dup = findGoodsDuplicate(it.name, goods)?.name
      else {
        const n = normTitle(it.name)
        dup = books.find((b) => b.status !== 'sold' && normTitle(b.title) === n)?.title
      }
      return { ...it, key: `o${oi}i${ii}`, selected: !it.deferred && !dup, duplicateOf: dup }
    }),
  }))
}

/**
 * 寫入資料庫：每筆訂單一筆 Order，品項分別存成周邊或書。
 * 國內運費、國際運費各自平均分攤到該訂單「有勾選」的每一列；折扣一律不計。
 */
export async function commitDrafts(orders: DraftOrder[]): Promise<{ goods: number; books: number }> {
  let goodsN = 0
  let booksN = 0
  await db.transaction('rw', db.orders, db.goods, db.books, async () => {
    for (const o of orders) {
      const picked = o.items.filter((i) => i.selected)
      if (!picked.length) continue
      const fx = o.currency === 'JPY' ? getRate() : 1
      const orderId = await db.orders.add({
        source: o.source, orderNo: o.orderNo, date: o.date, currency: o.currency, fxRate: fx,
        domesticShipping: o.domesticShipping, intlShipping: o.intlShipping || undefined,
      })
      const order = await db.orders.get(orderId)
      const domShare = toTWD(o.domesticShipping, o.currency, fx) / picked.length
      const intlShare = o.intlShipping / picked.length

      for (const it of picked) {
        const common = {
          orderUid: order?.uid, collection: 'general' as const, status: 'owned' as const,
          quantity: it.quantity, unitPrice: it.unitPrice, currency: o.currency,
          fxRate: o.currency === 'JPY' ? fx : undefined,
          shippingShare: Math.round(domShare) || undefined, intlShippingShare: Math.round(intlShare) || undefined,
          preorder: it.preorder || undefined, expectedMonth: it.preorder ? it.expectedMonth : undefined,
          note: it.note, createdAt: Date.now(),
        }
        if (it.kind === 'book') {
          const { series, volume } = parseTitle(it.name)
          await db.books.add({
            ...common, title: it.name, genre: 'BL', condition: 'new', bookSource: 'online',
            series, volume, tags: it.tags, zhKeywords: [],
          } as Omit<Book, 'id'>)
          booksN++
        } else {
          await db.goods.add({
            ...common, name: it.name, zhKeywords: [], category: it.category, condition: 'new',
            source: o.source, tags: it.tags,
          } as Omit<Goods, 'id'>)
          goodsN++
        }
      }
    }
  })
  return { goods: goodsN, books: booksN }
}

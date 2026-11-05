// 朋友的二手書 Excel：每個分頁一批書，欄位為「書名、價格、附註、本數」。
// 分頁名稱「YYYYMMDD寄」= 已寄出、你已收到；「推薦再給」不匯入；其餘（已讀完、正在讀…）還在朋友那邊，視為預購中。

import type { Book, Condition } from '../types'
import { FRIEND_DISCOUNT } from './labels'

export type RowStatus =
  | 'import' // 預設匯入
  | 'skip-private' // 私人帳務（門票、餐飲、訂閱…），不是書，直接略過
  | 'skip-zero' // 0 元（同人誌、贈品），等同人分頁完成後再匯入
  | 'skip-negative' // 負數（扣款、退款、非書的支出）
  | 'skip-total' // 總計列

export type SheetKind = 'received' | 'pending' | 'ignored'

export interface ParsedRow {
  key: string
  sheet: string
  title: string
  price?: number // 這一列的總價（台幣）
  quantity: number
  note?: string
  series?: string
  volume?: number
  seriesTotal?: number
  listPrice?: number
  acquiredDate?: string
  preorder: boolean
  status: RowStatus
  flags: string[]
}

export interface ParsedSheet {
  name: string
  kind: SheetKind
  date?: string
  rows: ParsedRow[]
}

const NON_BOOK = /票|吃飯|綠茶|摩斯|運費|pizza|youtube|訂閱|會員/i
const CN_DIGIT: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

/** 比對書名用：去掉所有空白、轉小寫 */
export const normTitle = (t: string) => t.replace(/\s+/g, '').toLowerCase()

export const cleanTitle = (raw: string) => raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

/** 備註裡的折扣，例如「九折」「受潮(5折)」→ 0.9、0.5；沒有則回傳 undefined */
export function discountFromNote(note?: string): number | undefined {
  if (!note) return undefined
  const m = note.match(/(\d(?:\.\d)?|[一二三四五六七八九])\s*折/)
  if (!m) return undefined
  const n = CN_DIGIT[m[1]] ?? parseFloat(m[1])
  return n > 0 && n < 10 ? n / 10 : undefined
}

/** 從書名拆出系列與卷數。拆不出來就當單本。 */
export function parseTitle(title: string): { series?: string; volume?: number; seriesTotal?: number } {
  const t = title
  if (/[+＋]/.test(t) || /同捆/.test(t)) return {} // 合輯、同捆：當單本
  if (/(?:^|[\s\-－(（])全[)）]?$/.test(t)) return {} // 「全」：一本完結
  let m = t.match(/^(.+?)\s*[(（]?\s*([上下])\s*[)）]?$/)
  if (m && /[\s(（]/.test(t.slice(m[1].length))) return { series: m[1].trim(), volume: m[2] === '上' ? 1 : 2, seriesTotal: 2 }
  m = t.match(/^(.+?)\s*[(（]\s*(\d{1,3})\s*[)）]\s*([^\d]*)$/) // 蜜果(05) 特別版、為了…英雄 (1)
  if (m) return { series: m[1].trim(), volume: Number(m[2]) }
  m = t.match(/^(.+?)\s+(\d{1,3})\s*([^\d\s][^\d]*)?$/) // 讓我討厭你 4、異世界社畜 4限定版
  if (m) return { series: m[1].trim(), volume: Number(m[2]) }
  return {}
}

function sheetKind(name: string): { kind: SheetKind; date?: string } {
  const m = name.trim().match(/^(\d{4})(\d{2})(\d{2})\s*寄/)
  if (m) return { kind: 'received', date: `${m[1]}-${m[2]}-${m[3]}` }
  if (name.includes('推薦再給')) return { kind: 'ignored' }
  return { kind: 'pending' }
}

export function parseWorkbook(sheets: { sheet: string; data: readonly (readonly unknown[])[] }[]): ParsedSheet[] {
  return sheets.map(({ sheet, data }) => {
    const { kind, date } = sheetKind(sheet)
    const out: ParsedSheet = { name: sheet, kind, date, rows: [] }
    if (kind === 'ignored') return out
    const seen = new Map<string, number>()

    data.forEach((r, idx) => {
      if (idx === 0 && String(r[0] ?? '').trim() === '書名') return // 標題列
      const title = cleanTitle(String(r[0] ?? ''))
      if (!title) return
      const price = typeof r[1] === 'number' ? r[1] : undefined
      const note = r[2] != null && String(r[2]).trim() ? String(r[2]).trim() : undefined
      const qty = typeof r[3] === 'number' && r[3] >= 1 ? Math.round(r[3]) : 1

      const occKey = `${sheet}|${title}|${price ?? ''}`
      const occ = (seen.get(occKey) ?? 0) + 1
      seen.set(occKey, occ)

      const row: ParsedRow = {
        key: `${occKey}|${occ}`, sheet, title, price, quantity: qty, note,
        acquiredDate: date, preorder: kind === 'pending', status: 'import', flags: [],
        ...parseTitle(title),
      }

      if (title === '總計') row.status = 'skip-total'
      else if (price !== undefined && price < 0) row.status = 'skip-negative'
      else if (price === 0) row.status = 'skip-zero'
      else if (NON_BOOK.test(title)) row.status = 'skip-private'
      else {
        if (price === undefined) row.flags.push('價格未填')
        else {
          const disc = discountFromNote(note)
          row.listPrice = Math.round(price / (disc ?? FRIEND_DISCOUNT))
          if (disc) row.flags.push(`備註有「${Math.round(disc * 10)}折」，原價依此推算`)
        }
        if (qty > 1) row.flags.push(`本數 ${qty}，價格視為整列總價`)
      }
      out.rows.push(row)
    })
    return out
  })
}

/** 轉成要寫入資料庫的書。品相由使用者在匯入時選。 */
export function toBook(r: ParsedRow, condition: Condition): Omit<Book, 'id'> {
  return {
    title: r.title, genre: 'BL', condition, bookSource: 'friend',
    series: r.series, volume: r.volume, seriesTotal: r.seriesTotal,
    tags: [], zhKeywords: [],
    collection: 'general', status: 'owned', quantity: r.quantity,
    currency: 'TWD', unitPrice: r.price !== undefined ? r.price / r.quantity : 0,
    listPrice: r.listPrice, listPriceEstimated: r.listPrice !== undefined ? true : undefined,
    preorder: r.preorder || undefined,
    acquiredDate: r.acquiredDate,
    note: r.note,
    importKey: r.key,
    createdAt: Date.now(),
  }
}

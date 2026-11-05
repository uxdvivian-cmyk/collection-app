// 資料模型：周邊 / 書 共用的基礎概念放在 Base，各自再延伸。

export type Currency = 'TWD' | 'JPY'

/** 收藏狀態。預購中另用 preorder 旗標表示，與出清狀態互不影響 */
export type ItemStatus = 'owned' | 'forsale' | 'sold'

/** 周邊品相：新品拆封後不自動變更，賣出前由使用者手動改 */
export type Condition = 'new' | 'used'

/** 收藏區：一般，或同人（同人區內再分書與周邊） */
export type Collection = 'general' | 'doujin'

/** 訂單：運費均攤的單位 */
export interface Order {
  id?: number
  source: string // 蝦皮 / 露天 / BOOTH / Animate ...
  orderNo?: string
  date: string // YYYY-MM-DD
  currency: Currency
  fxRate?: number // 匯入當天的大約匯率（1 外幣 = ? TWD），TWD 訂單為 1
  domesticShipping: number // 國內運費（原幣）。有套用免運券 = 0。折扣一律不計
  intlShipping?: number // 國際／轉運運費（選填，訂單層級）
  note?: string
}

interface Base {
  id?: number // 只在這支裝置有意義（自動編號）；跨裝置同步靠 uid
  uid?: string // 跨裝置識別碼（建立時自動產生）
  updatedAt?: number // 最後修改時間（毫秒），同步時以較新的為準
  deleted?: boolean // 已刪除（保留紀錄，讓刪除也能同步到其他裝置）
  orderId?: number
  collection: Collection
  status: ItemStatus
  preorder?: boolean // 預購中（還沒收到，含「還在朋友那邊」），價格仍計入總花費；到貨後取消
  expectedMonth?: string // 預計到貨／發售月 YYYY-MM（選填，預購中才用）
  quantity: number
  unitPrice: number // 商品單價（原幣、折扣前）
  currency: Currency
  fxRate?: number
  shippingShare?: number // 分攤的國內運費（原幣）
  intlShippingShare?: number // 分攤的國際運費（原幣）
  askPrice?: number // 待出清的預定出清價（整筆，TWD）
  soldPrice?: number // 實際售出價（整筆，TWD）
  soldDate?: string
  note?: string
  createdAt: number
}

/** 周邊（collection 為 doujin 時即同人周邊） */
export interface Goods extends Base {
  name: string // 日文原名
  zhKeywords: string[] // 中文關鍵字，可搜尋
  category: string
  condition: Condition
  work?: string
  character?: string
  tags: string[] // 社團 / 作者等
  photo?: Blob
}

export type BookGenre = 'BL' | 'nonBL' | 'novel'
export type BookSource = 'friend' | 'duku' | 'online' | 'store' // 朋友 / 讀冊 / 網購 / 實體

export interface Book extends Base {
  isbn?: string
  title: string
  author?: string
  publisher?: string
  series?: string
  volume?: number
  acquiredDate?: string // 收到日（朋友的 Excel：分頁名稱的寄出日）
  importKey?: string // 匯入時的識別碼，避免重複匯入
  language?: 'zh' | 'ja' | 'en'
  genre: BookGenre // 預設 BL
  condition: Condition // 新品 / 二手
  bookSource: BookSource
  listPrice?: number // 原價
  listPriceEstimated?: boolean // 朋友二手書：原價 = 實付 ÷ 0.7 的推算值
  coverUrl?: string
  zhKeywords: string[]
  tags: string[]
}

/** 中日對照詞庫：作品、角色 */
export interface GlossaryEntry {
  id?: number
  kind: 'work' | 'character' | 'maker' | 'other'
  ja: string
  zh: string[]
}

export interface Category {
  id?: number
  name: string
  builtin: boolean
}

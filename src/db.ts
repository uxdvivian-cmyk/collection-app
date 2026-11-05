import Dexie, { type Table } from 'dexie'
import type { Book, Category, GlossaryEntry, Goods, Order } from './types'

export const DEFAULT_CATEGORIES = [
  '壓克力牌', '小卡', '明信片', '複製畫', '徽章',
  '簽名板', '海報', '壓克力杯墊', '克羅塔', '飯友',
  '娃娃', '書籤', '貼紙', '色紙', '拍立得', '透卡', '其他',
]

class CollectionDB extends Dexie {
  orders!: Table<Order, number>
  goods!: Table<Goods, number>
  books!: Table<Book, number>
  glossary!: Table<GlossaryEntry, number>
  categories!: Table<Category, number>

  constructor() {
    super('collection')
    this.version(1).stores({
      orders: '++id, source, date',
      goods: '++id, orderId, collection, category, status, work, character',
      books: '++id, isbn, collection, series, genre, status',
      glossary: '++id, kind, ja',
      categories: '++id, &name',
    })
    // v2：書加上 importKey 索引（防止 Excel 重複匯入）
    this.version(2).stores({
      books: '++id, isbn, collection, series, genre, status, importKey',
    })
    // v3：跨裝置同步需要的 uid、updatedAt；舊資料補上
    this.version(3).stores({
      books: '++id, isbn, collection, series, genre, status, importKey, uid, updatedAt',
    }).upgrade((tx) =>
      tx.table('books').toCollection().modify((b: Book) => {
        b.uid ??= b.importKey ? `imp:${b.importKey}` : newUid() // Excel 匯入的書用固定 uid，兩台裝置各自匯入也能對上
        b.updatedAt ??= b.createdAt ?? Date.now()
      }),
    )
  }
}

export const newUid = () => crypto.randomUUID()

// ── 同步用：每筆資料自動帶 uid 與 updatedAt；有變更時通知同步模組 ──
let applyingSync = false
/** 同步模組在寫入「從別台裝置收到的資料」時使用：不改 updatedAt、不觸發再次同步 */
export async function withoutTracking<T>(fn: () => Promise<T>): Promise<T> {
  applyingSync = true
  try { return await fn() } finally { applyingSync = false }
}
export const dirtyListeners = new Set<() => void>()
const notifyDirty = () => { if (!applyingSync) dirtyListeners.forEach((f) => f()) }

export const db = new CollectionDB()

db.books.hook('creating', function (_pk, obj) {
  obj.uid ??= newUid()
  obj.updatedAt ??= Date.now()
  this.onsuccess = notifyDirty
})
db.books.hook('updating', function (mods) {
  if (applyingSync) return undefined
  this.onsuccess = notifyDirty
  return 'updatedAt' in mods ? undefined : { updatedAt: Date.now() }
})

/** 沒被刪除的書 */
export const liveBooks = () => db.books.filter((b) => !b.deleted).toArray()

export async function seedDefaults() {
  if ((await db.categories.count()) === 0) {
    await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((name) => ({ name, builtin: true })))
  }
}

/** 匯出全部資料為 JSON（照片 Blob 先不含，之後做照片時再處理） */
export async function exportBackup() {
  const strip = <T extends { photo?: Blob }>(rows: T[]) => rows.map(({ photo: _p, ...r }) => r)
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    orders: await db.orders.toArray(),
    goods: strip(await db.goods.toArray()),
    books: await db.books.toArray(),
    glossary: await db.glossary.toArray(),
    categories: await db.categories.toArray(),
  })
}

export async function importBackup(json: string) {
  const d = JSON.parse(json)
  if (d.version !== 1) throw new Error('不支援的備份版本')
  await db.transaction('rw', [db.orders, db.goods, db.books, db.glossary, db.categories], async () => {
    await Promise.all([db.orders.clear(), db.goods.clear(), db.books.clear(), db.glossary.clear(), db.categories.clear()])
    await db.orders.bulkAdd(d.orders ?? [])
    await db.goods.bulkAdd(d.goods ?? [])
    await db.books.bulkAdd(d.books ?? [])
    await db.glossary.bulkAdd(d.glossary ?? [])
    await db.categories.bulkAdd(d.categories ?? [])
  })
}

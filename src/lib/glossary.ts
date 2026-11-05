import { db, liveBooks, liveGlossary, liveGoods } from '../db'
import type { GlossaryEntry } from '../types'
import { normTitle } from './friendExcel'

/** 品名裡出現詞庫中的日文詞，就帶出對應的中文關鍵字（去重）。 */
export function zhFor(name: string, entries: GlossaryEntry[]): string[] {
  const n = normTitle(name)
  const out: string[] = []
  for (const e of entries) {
    if (e.deleted || normTitle(e.ja).length < 2) continue
    if (n.includes(normTitle(e.ja))) for (const z of e.zh) if (!out.includes(z)) out.push(z)
  }
  return out
}

/** 把目前的詞庫套用到所有書與周邊：只「補上」缺的中文關鍵字，不會刪掉你自己填的。回傳更新了幾筆。 */
export async function applyGlossaryToAll(): Promise<number> {
  const [entries, goods, books] = [await liveGlossary(), await liveGoods(), await liveBooks()]
  let n = 0
  await db.transaction('rw', db.goods, db.books, async () => {
    for (const g of goods) {
      const add = zhFor(g.name, entries).filter((z) => !g.zhKeywords.includes(z))
      if (add.length) { await db.goods.update(g.id!, { zhKeywords: [...g.zhKeywords, ...add] }); n++ }
    }
    for (const b of books) {
      const add = zhFor(b.title, entries).filter((z) => !b.zhKeywords.includes(z))
      if (add.length) { await db.books.update(b.id!, { zhKeywords: [...b.zhKeywords, ...add] }); n++ }
    }
  })
  return n
}

/** 新增或更新一筆詞庫：同一個日文詞已存在就合併中文 */
export async function addGlossary(ja: string, zh: string[]): Promise<void> {
  const term = ja.trim()
  if (term.length < 2 || !zh.length) return
  const existing = (await liveGlossary()).find((e) => normTitle(e.ja) === normTitle(term))
  if (existing?.id !== undefined) await db.glossary.update(existing.id, { zh: [...new Set([...existing.zh, ...zh])] })
  else await db.glossary.add({ kind: 'other', ja: term, zh })
}

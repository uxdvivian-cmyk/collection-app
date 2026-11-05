import type { Book } from '../types'

/** 系列底下的卡片標題：去掉重複的系列名，只留卷數／版本，例如「戀嚐隱密情事 上」→「上」、「蜜果(05) 特別版」→「第 5 卷 特別版」 */
export function volumeLabel(b: Book): string {
  const s = b.series
  if (!s || !b.title.startsWith(s)) return b.title
  const rest = b.title.slice(s.length).trim()
  if (!rest) return b.title
  const m = rest.match(/^[(（]?\s*(\d{1,3})\s*[)）]?\s*(.*)$/)
  if (m) return `第 ${Number(m[1])} 卷${m[2] ? ' ' + m[2] : ''}`
  return rest
}

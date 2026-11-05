import type { Book } from '../types'
import { normTitle } from './friendExcel'

export interface DupHit {
  book: Book
  reason: string
}

interface Candidate {
  isbn?: string
  title: string
  series?: string
  volume?: number
}

/** 找出可能重複的書（已售出的不算）。依序判斷：相同 ISBN、同系列同卷、書名相同、書名相似。 */
export function findDuplicates(c: Candidate, books: Book[], ignoreId?: number): DupHit[] {
  const t = normTitle(c.title)
  const s = c.series ? normTitle(c.series) : ''
  const hits: DupHit[] = []

  for (const b of books) {
    if (b.id === ignoreId || b.status === 'sold') continue
    let reason = ''
    const bt = normTitle(b.title)

    if (c.isbn && b.isbn === c.isbn) reason = '相同 ISBN'
    else if (s && c.volume !== undefined && b.series && normTitle(b.series) === s && b.volume === c.volume) reason = '同系列同一卷'
    else if (t && bt === t) reason = '書名相同'
    else if (t.length >= 5 && bt.length >= 5 && (bt.includes(t) || t.includes(bt))) reason = '書名相似'

    if (reason) hits.push({ book: b, reason })
  }
  return hits
}

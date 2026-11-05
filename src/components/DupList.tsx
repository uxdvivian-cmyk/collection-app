import type { DupHit } from '../lib/duplicates'
import { CONDITION_LABEL, SOURCE_LABEL } from '../lib/labels'

/** 疑似重複的書清單：書名、狀態與判斷原因。 */
export default function DupList({ hits }: { hits: DupHit[] }) {
  return (
    <ul className="dup-list">
      {hits.slice(0, 5).map(({ book: b, reason }) => (
        <li key={b.id}>
          <span className="name">{b.title}</span>
          <span className="tags">
            <span className="tag">{reason}</span>
            <span className={b.condition === 'used' ? 'tag used' : 'tag'}>{CONDITION_LABEL[b.condition]}</span>
            {b.preorder && <span className="tag pre">預購中</span>}
            {b.status === 'forsale' && <span className="tag sale">待出清</span>}
            <span className="tag">{SOURCE_LABEL[b.bookSource]}</span>
          </span>
        </li>
      ))}
      {hits.length > 5 && <li className="zh">還有 {hits.length - 5} 本相似的…</li>}
    </ul>
  )
}

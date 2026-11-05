import { useState } from 'react'

interface Props {
  tags: string[]
  pool: string[] // 現有的所有 tag
  onChange: (tags: string[]) => void
}

/** Tag 欄位：點輸入框才出現現有 tag 選單，可搜尋；沒有符合時可直接新增。 */
export default function TagPicker({ tags, pool, onChange }: Props) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)

  const query = q.trim()
  const ql = query.toLowerCase()
  const candidates = pool.filter((t) => !tags.includes(t) && (!ql || t.toLowerCase().includes(ql))).slice(0, 12)
  const exact = [...pool, ...tags].some((t) => t.toLowerCase() === ql)

  const add = (t: string) => {
    const v = t.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setQ('')
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  return (
    <div className="tagwrap">
      <div className="tagbox">
        {tags.map((t) => (
          <button key={t} type="button" className="chip on" aria-label={`移除 ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            #{t} ×
          </button>
        ))}
        <input
          type="search"
          value={q}
          placeholder="點這裡搜尋現有 tag，或直接輸入新增"
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(q) } }}
        />
      </div>
      {focused && (
        <div className="menu tagmenu" role="listbox" onPointerDown={(e) => e.preventDefault()}>
          {candidates.map((t) => <button key={t} type="button" onClick={() => add(t)}>#{t}</button>)}
          {query && !exact && <button type="button" className="add" onClick={() => add(query)}>＋ 新增「{query}」</button>}
          {!candidates.length && !query && <div className="hint">現有 tag 都已套用。輸入文字可新增。</div>}
        </div>
      )}
    </div>
  )
}

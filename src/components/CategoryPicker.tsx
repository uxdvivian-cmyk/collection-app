import { useState } from 'react'
import { DEFAULT_CATEGORIES } from '../db'

/** 類別選擇：平常只顯示目前的類別，點開才展開所有類別（不佔版面、不用原生下拉選單）。 */
export default function CategoryPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const list = DEFAULT_CATEGORIES.includes(value) ? DEFAULT_CATEGORIES : [value, ...DEFAULT_CATEGORIES]
  return (
    <div className="catpick">
      <button type="button" className="chip on" aria-expanded={open} onClick={() => setOpen(!open)}>{value} ▾</button>
      {open && (
        <div className="chips">
          {list.map((c) => (
            <button key={c} type="button" className={c === value ? 'chip on' : 'chip'} onClick={() => { onChange(c); setOpen(false) }}>{c}</button>
          ))}
        </div>
      )}
    </div>
  )
}

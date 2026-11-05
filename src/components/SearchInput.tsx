import { useRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel: string
}

/** 搜尋框：有文字時右邊出現 ✕，點了清空並讓輸入框保持focus（手機鍵盤不會收起）。 */
export default function SearchInput({ value, onChange, placeholder, ariaLabel }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="searchwrap">
      <input ref={ref} type="search" value={value} placeholder={placeholder} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button
          type="button"
          className="clear"
          aria-label="清除搜尋"
          // 按下時不要讓輸入框失去 focus，鍵盤才會維持升起
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(''); ref.current?.focus() }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

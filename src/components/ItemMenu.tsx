import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuAction {
  label: string
  onSelect: () => void
  danger?: boolean
}

/** 「⋯」按鈕與彈出選單。點外面或按 Esc 關閉。 */
export default function ItemMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [up, setUp] = useState(false) // 下方放不下時改往上展開

  // 展開前先量一下：按鈕下方的空間不夠放選單，而上方比較寬，就往上展開
  useLayoutEffect(() => {
    if (!open || !ref.current || !menuRef.current) { setUp(false); return }
    const btn = ref.current.getBoundingClientRect()
    const h = menuRef.current.getBoundingClientRect().height
    const vh = window.visualViewport?.height ?? window.innerHeight
    const below = vh - btn.bottom
    setUp(below < h + 12 && btn.top > below)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="more" ref={ref}>
      <button className="chip iconbtn" aria-label="更多選項" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div className={up ? 'menu up' : 'menu'} role="menu" ref={menuRef}>
          {actions.map((a) => (
            <button key={a.label} role="menuitem" className={a.danger ? 'danger' : ''} onClick={() => { setOpen(false); a.onSelect() }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

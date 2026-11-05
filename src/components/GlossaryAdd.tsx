import { useMemo, useState } from 'react'
import { addGlossary } from '../lib/glossary'

/** 「用這筆建立詞庫」：從品名挑一個日文詞，和上面填的中文關鍵字配成一組，之後同一個詞自動套用。 */
export default function GlossaryAdd({ name, zh }: { name: string; zh: string }) {
  const tokens = useMemo(
    () => [...new Set(name.split(/[\s　（）()「」『』［］\[\]【】・,，、。！？!?:：／/～~\-]+/).filter((t) => t.length >= 2))],
    [name],
  )
  const [term, setTerm] = useState('')
  const [msg, setMsg] = useState('')
  const zhList = zh.split(/\s+/).filter(Boolean)

  const add = async () => {
    if (!term) return setMsg('請先點一個品名裡的詞')
    if (!zhList.length) return setMsg('請先在上面填中文關鍵字')
    await addGlossary(term, zhList)
    setMsg(`已加入詞庫：${term} → ${zhList.join('、')}`)
  }

  if (tokens.length === 0) return null
  return (
    <details className="glossadd">
      <summary>用這筆建立詞庫（之後同一個詞自動帶出中文）</summary>
      <p className="zh">點品名裡的一個詞（例如作品名或角色名），再按「加入詞庫」，會用上面的中文關鍵字配成一組。</p>
      <div className="chips">
        {tokens.map((t) => <button key={t} type="button" className={term === t ? 'chip on' : 'chip'} onClick={() => setTerm(t)}>{t}</button>)}
      </div>
      <button type="button" className="btn sm ghost" onClick={add}>加入詞庫</button>
      {msg && <p className="note">{msg}</p>}
    </details>
  )
}

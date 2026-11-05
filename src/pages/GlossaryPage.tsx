import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, liveGlossary } from '../db'
import { addGlossary, applyGlossaryToAll } from '../lib/glossary'
import SearchInput from '../components/SearchInput'

export default function GlossaryPage() {
  const entries = useLiveQuery(() => liveGlossary(), [])
  const [ja, setJa] = useState('')
  const [zh, setZh] = useState('')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')

  if (!entries) return null
  const ql = q.trim().toLowerCase()
  const list = entries
    .filter((e) => !ql || (e.ja + ' ' + e.zh.join(' ')).toLowerCase().includes(ql))
    .sort((a, b) => a.ja.localeCompare(b.ja))

  const add = async () => {
    const zhList = zh.split(/\s+/).filter(Boolean)
    if (ja.trim().length < 2) return setMsg('日文詞至少 2 個字')
    if (!zhList.length) return setMsg('請填中文關鍵字（可多個，用空白分開）')
    await addGlossary(ja, zhList)
    setJa(''); setZh(''); setMsg('已加入。')
  }

  const apply = async () => {
    const n = await applyGlossaryToAll()
    setMsg(n > 0 ? `已為 ${n} 筆品項補上中文關鍵字。` : '沒有需要補的品項。')
  }

  return (
    <section>
      <div className="hrow">
        <h1>中日詞庫</h1>
        <Link className="btn sm ghost" to="/settings">返回設定</Link>
      </div>
      <p className="zh">品名裡出現這裡的日文詞，就會自動帶出中文關鍵字（貼文字入庫時套用）；搜尋時日文和中文都找得到。</p>

      <div className="draft">
        <div className="two">
          <label>日文詞<input type="search" value={ja} onChange={(e) => setJa(e.target.value)} placeholder="例：ブルーロック" /></label>
          <label>中文（空白分開）<input type="search" value={zh} onChange={(e) => setZh(e.target.value)} placeholder="例：藍色監獄" /></label>
        </div>
        <div className="row">
          <button className="btn" onClick={add}>加入詞庫</button>
          <button className="btn ghost" onClick={apply}>套用到全部品項</button>
        </div>
        {msg && <p className="note" role="status">{msg}</p>}
      </div>

      <SearchInput value={q} onChange={setQ} placeholder="搜尋詞庫" ariaLabel="搜尋詞庫" />
      <div className="sum"><span>共 <b>{list.length}</b> 組</span></div>
      {list.length === 0 && <div className="empty"><p className="zh">詞庫還是空的。上面加入第一組，或在編輯品項時按「用這筆建立詞庫」。</p></div>}
      {list.map((e) => (
        <div className="item" key={e.id}>
          <div className="top">
            <div className="l">
              <div className="name">{e.ja}</div>
              <div className="zh">{e.zh.join('　')}</div>
            </div>
            <button className="btn sm ghost danger-text" aria-label={`刪除 ${e.ja}`} onClick={() => { void db.glossary.update(e.id!, { deleted: true }) }}>刪除</button>
          </div>
        </div>
      ))}
    </section>
  )
}

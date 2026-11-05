import { useEffect, useRef, useState } from 'react'
import type { Book } from '../types'
import { findDuplicates, type DupHit } from '../lib/duplicates'
import { parseTitle } from '../lib/friendExcel'
import { lookupIsbn, normalizeIsbn, type BookInfo } from '../lib/isbn'
import DupList from './DupList'
import Modal from './Modal'

interface Props {
  books: Book[]
  onAdd: (prefill: Partial<Book>) => void // 查到後要新增：帶著資料開啟新增視窗
  onClose: () => void
}

type Phase =
  | { name: 'scan' }
  | { name: 'looking'; isbn: string }
  | { name: 'result'; isbn: string; info: BookInfo | null; hits: DupHit[] }

function prefillFrom(isbn: string, info: BookInfo | null): Partial<Book> {
  const parsed = info ? parseTitle(info.title) : {}
  return {
    isbn, title: info?.title ?? '', author: info?.author, publisher: info?.publisher,
    coverUrl: info?.coverUrl, language: info?.language,
    series: info?.series ?? parsed.series, volume: info?.volume ?? parsed.volume,
    genre: 'BL', condition: 'new',
  }
}

export default function IsbnScanner({ books, onAdd, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: 'scan' })
  const [camError, setCamError] = useState('')
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  const handle = async (raw: string) => {
    const isbn = normalizeIsbn(raw)
    if (!isbn) {
      setManualError('這不是有效的 ISBN。書背的條碼要以 978 或 979 開頭。')
      return false
    }
    setManualError('')
    setPhase({ name: 'looking', isbn })
    const info = await lookupIsbn(isbn)
    const parsed = info ? parseTitle(info.title) : {}
    const hits = findDuplicates(
      { isbn, title: info?.title ?? '', series: info?.series ?? parsed.series, volume: info?.volume ?? parsed.volume },
      books,
    )
    // 查得到書名、也沒有重複：直接帶著資料開啟新增視窗，不用再多按一次
    if (info && hits.length === 0) {
      onAdd(prefillFrom(isbn, info))
      return true
    }
    setPhase({ name: 'result', isbn, info, hits })
    return true
  }

  // 掃描中才開相機；離開掃描畫面或關閉視窗就關掉
  useEffect(() => {
    if (phase.name !== 'scan') return
    let stopped = false
    let controls: { stop: () => void } | undefined
    ;(async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'), import('@zxing/library'),
        ])
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13])
        const reader = new BrowserMultiFormatReader(hints)
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (result) => {
            if (!result || stopped) return
            if (normalizeIsbn(result.getText())) {
              stopped = true
              controls?.stop()
              void handle(result.getText())
            }
          },
        )
        if (stopped) controls.stop()
      } catch (e) {
        const msg = (e as Error).name === 'NotAllowedError'
          ? '沒有相機權限。請在瀏覽器允許使用相機，或改用下方輸入 ISBN。'
          : '無法開啟相機。可以改用下方輸入 ISBN。'
        setCamError(msg)
      }
    })()
    return () => { stopped = true; controls?.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.name])

  const prefillOf = (r: Extract<Phase, { name: 'result' }>): Partial<Book> => prefillFrom(r.isbn, r.info)

  let body
  let actions
  if (phase.name === 'scan' || phase.name === 'looking') {
    const looking = phase.name === 'looking'
    body = (
      <>
        <div className="scanbox">
          <video ref={videoRef} playsInline muted />
          <div className="scanline" aria-hidden="true" />
        </div>
        <p className="zh">把書背的 ISBN 條碼（978 開頭那一條）放進框內，掃到會自動查詢。</p>
        {camError && <p className="err" role="alert">{camError}</p>}
        <label>或直接輸入 ISBN
          <span className="inline">
            <input type="search" inputMode="numeric" value={manual} placeholder="978…" onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handle(manual) }} />
            <button className="btn sm" disabled={!manual.trim() || looking} onClick={() => void handle(manual)}>查詢</button>
          </span>
        </label>
        {manualError && <p className="err" role="alert">{manualError}</p>}
        {looking && <p className="note">查詢中…</p>}
      </>
    )
    actions = <button onClick={onClose}>取消</button>
  } else {
    const { info, hits, isbn } = phase
    body = (
      <>
        <div className="item">
          <div className="name">{info?.title ?? '查不到這本書的資料'}</div>
          <div className="zh">
            ISBN {isbn}
            {info?.author ? ` · ${info.author}` : ''}
            {info?.publisher ? ` · ${info.publisher}` : ''}
          </div>
          {!info && (
            <div className="zh">
              免費的書籍資料庫沒有收錄這個版本。可以先用下面的連結查書名，再按「新增這本」自己輸入。
              <br />
              <a href={`https://search.books.com.tw/search/query/key/${isbn}/cat/all`} target="_blank" rel="noreferrer">博客來</a>
              {' · '}
              <a href={`https://www.google.com/search?q=${isbn}`} target="_blank" rel="noreferrer">Google</a>
            </div>
          )}
        </div>
        {hits.length > 0 ? (
          <div className="warnbox" role="alert">
            <b>你已經有這本或很像的書</b>
            <DupList hits={hits} />
          </div>
        ) : (
          <p className="note">你還沒有這本，也沒有相似的書。</p>
        )}
      </>
    )
    actions = (
      <>
        <button onClick={onClose}>關閉</button>
        <button onClick={() => { setCamError(''); setManual(''); setPhase({ name: 'scan' }) }}>再掃一本</button>
        <button className={hits.length > 0 ? '' : 'go'} onClick={() => onAdd(prefillOf(phase))}>{hits.length > 0 ? '仍要新增' : '新增這本'}</button>
      </>
    )
  }

  return <Modal title="掃 ISBN 查有沒有" onClose={onClose} actions={actions}>{body}</Modal>
}

import { useState, type ReactNode } from 'react'
import { db } from '../db'
import type { Book } from '../types'
import { twd } from './money'
import type { MenuAction } from '../components/ItemMenu'
import BookEditor from '../components/BookEditor'
import PriceModal from '../components/PriceModal'
import ConfirmModal from '../components/ConfirmModal'

type Dialog =
  | { kind: 'edit'; book?: Book; prefill?: Partial<Book> }
  | { kind: 'forsale'; book: Book }
  | { kind: 'sold'; book: Book }
  | { kind: 'delete'; book: Book }

/** 書的「⋯」選單動作與對應的彈出視窗（書頁與出清頁共用）。 */
export function useBookActions(tagPool: string[], books: Book[]) {
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = () => setDialog(null)

  const actionsFor = (b: Book): MenuAction[] => {
    const list: MenuAction[] = [{ label: '編輯', onSelect: () => setDialog({ kind: 'edit', book: b }) }]
    if (b.status === 'owned') list.push({ label: '標為待出清', onSelect: () => setDialog({ kind: 'forsale', book: b }) })
    if (b.status !== 'sold') list.push({ label: '移到已售出', onSelect: () => setDialog({ kind: 'sold', book: b }) })
    if (b.status !== 'owned') {
      list.push({ label: '還原為收藏中', onSelect: () => { void db.books.update(b.id!, { status: 'owned', askPrice: undefined, soldPrice: undefined, soldDate: undefined }) } })
    }
    list.push({ label: '移除', danger: true, onSelect: () => setDialog({ kind: 'delete', book: b }) })
    return list
  }

  const openCreate = (prefill?: Partial<Book>) => setDialog({ kind: 'edit', prefill })

  let modal: ReactNode = null
  if (dialog?.kind === 'edit') {
    modal = <BookEditor book={dialog.book} prefill={dialog.prefill} books={books} tagPool={tagPool} onClose={close} />
  } else if (dialog?.kind === 'forsale') {
    const b = dialog.book
    modal = (
      <PriceModal title="標為待出清" label="預定出清價" subject={b.title} initial={b.askPrice} onClose={close}
        onConfirm={(p) => { void db.books.update(b.id!, { status: 'forsale', askPrice: p }); close() }} />
    )
  } else if (dialog?.kind === 'sold') {
    const b = dialog.book
    modal = (
      <PriceModal title="移到已售出" label="實際售出價" subject={b.title} initial={b.askPrice ?? b.soldPrice} onClose={close}
        onConfirm={(p) => { void db.books.update(b.id!, { status: 'sold', soldPrice: p, soldDate: new Date().toISOString().slice(0, 10) }); close() }} />
    )
  } else if (dialog?.kind === 'delete') {
    const b = dialog.book
    modal = (
      <ConfirmModal title="移除這一筆？" danger confirmText="確定移除" onClose={close}
        message={`「${b.title}」會從收藏刪除，不計入統計。這個動作無法復原。`}
        onConfirm={() => { void db.books.update(b.id!, { deleted: true }); close() }} />
    )
  }

  return { actionsFor, openCreate, modal, twd }
}

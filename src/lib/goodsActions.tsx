import { useState, type ReactNode } from 'react'
import { db } from '../db'
import type { Collection, Goods } from '../types'
import type { MenuAction } from '../components/ItemMenu'
import GoodsEditor from '../components/GoodsEditor'
import PriceModal from '../components/PriceModal'
import ConfirmModal from '../components/ConfirmModal'

type Dialog =
  | { kind: 'edit'; goods?: Goods; collection?: Collection }
  | { kind: 'forsale'; goods: Goods }
  | { kind: 'sold'; goods: Goods }
  | { kind: 'delete'; goods: Goods }

/** 周邊的「⋯」選單動作與對應的彈出視窗（周邊頁與出清頁共用）。 */
export function useGoodsActions(tagPool: string[]) {
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = () => setDialog(null)

  const actionsFor = (g: Goods): MenuAction[] => {
    const list: MenuAction[] = [{ label: '編輯', onSelect: () => setDialog({ kind: 'edit', goods: g }) }]
    if (g.status === 'owned') list.push({ label: '標為待出清', onSelect: () => setDialog({ kind: 'forsale', goods: g }) })
    if (g.status !== 'sold') list.push({ label: '移到已售出', onSelect: () => setDialog({ kind: 'sold', goods: g }) })
    if (g.status !== 'owned') {
      list.push({ label: '還原為收藏中', onSelect: () => { void db.goods.update(g.id!, { status: 'owned', askPrice: undefined, soldPrice: undefined, soldDate: undefined }) } })
    }
    list.push({ label: '移除', danger: true, onSelect: () => setDialog({ kind: 'delete', goods: g }) })
    return list
  }

  const openCreate = (collection?: Collection) => setDialog({ kind: 'edit', collection })

  let modal: ReactNode = null
  if (dialog?.kind === 'edit') {
    modal = <GoodsEditor goods={dialog.goods} tagPool={tagPool} collection={dialog.collection} onClose={close} />
  } else if (dialog?.kind === 'forsale') {
    const g = dialog.goods
    modal = (
      <PriceModal title="標為待出清" label="預定出清價" subject={g.name} initial={g.askPrice} onClose={close}
        onConfirm={(p) => { void db.goods.update(g.id!, { status: 'forsale', askPrice: p }); close() }} />
    )
  } else if (dialog?.kind === 'sold') {
    const g = dialog.goods
    modal = (
      <PriceModal title="移到已售出" label="實際售出價" subject={g.name} initial={g.askPrice ?? g.soldPrice} onClose={close}
        onConfirm={(p) => { void db.goods.update(g.id!, { status: 'sold', soldPrice: p, soldDate: new Date().toISOString().slice(0, 10) }); close() }} />
    )
  } else if (dialog?.kind === 'delete') {
    const g = dialog.goods
    modal = (
      <ConfirmModal title="移除這一筆？" danger confirmText="確定移除" onClose={close}
        message={`「${g.name}」會從收藏刪除，不計入統計。這個動作無法復原。`}
        onConfirm={() => { void db.goods.update(g.id!, { deleted: true }); close() }} />
    )
  }

  return { actionsFor, openCreate, modal }
}

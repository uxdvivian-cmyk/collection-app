import { useState } from 'react'
import Modal from './Modal'

interface Props {
  title: string
  label: string
  subject: string
  initial?: number
  confirmText?: string
  onConfirm: (price: number) => void
  onClose: () => void
}

/** 標為待出清（預定出清價）／移到已售出（實際售價）共用的輸入視窗。 */
export default function PriceModal({ title, label, subject, initial, confirmText = '確認', onConfirm, onClose }: Props) {
  const [v, setV] = useState(initial?.toString() ?? '')
  const n = Number(v)
  const ok = v.trim() !== '' && n >= 0 && !Number.isNaN(n)

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={<><button onClick={onClose}>取消</button><button className="go" disabled={!ok} onClick={() => onConfirm(n)}>{confirmText}</button></>}
    >
      <p className="zh">{subject}</p>
      <label>{label}（NT$，整筆）
        <input type="number" inputMode="numeric" autoFocus value={v} onChange={(e) => setV(e.target.value)} />
      </label>
    </Modal>
  )
}

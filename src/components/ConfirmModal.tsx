import Modal from './Modal'

interface Props {
  title: string
  message: string
  confirmText: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmModal({ title, message, confirmText, danger, onConfirm, onClose }: Props) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={<><button onClick={onClose}>取消</button><button className={danger ? 'go danger' : 'go'} onClick={onConfirm}>{confirmText}</button></>}
    >
      <p className="zh">{message}</p>
    </Modal>
  )
}

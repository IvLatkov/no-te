import Modal from './Modal'

export default function ConfirmModal({ title, message, onConfirm, onClose, error, busy = false }) {
  return (
    <Modal title={title} onClose={onClose} error={error}>
      <p className="confirmation-message">{message}</p>
      <div className="modal-actions">
        <button
          autoFocus
          data-autofocus
          type="button"
          disabled={busy}
          className="button secondary"
          onClick={onClose}
        >
          Cancel
        </button>
        <button type="button" className="button danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  )
}

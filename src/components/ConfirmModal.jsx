import Modal from './Modal'

export default function ConfirmModal({ title, message, onConfirm, onClose, error }) {
  return (
    <Modal title={title} onClose={onClose} error={error}>
      <p className="confirmation-message">{message}</p>
      <div className="modal-actions">
        <button
          autoFocus
          data-autofocus
          type="button"
          className="button secondary"
          onClick={onClose}
        >
          Cancel
        </button>
        <button type="button" className="button danger" onClick={onConfirm}>
          Delete
        </button>
      </div>
    </Modal>
  )
}

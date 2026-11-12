import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, error, className = '' }) {
  const dialog = useRef(null)
  // Capture before children's autoFocus runs during the commit phase.
  const previousFocus = useRef(typeof document === 'undefined' ? null : document.activeElement)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    const initialFocus =
      element.querySelector('[data-autofocus], [autofocus]') ||
      element.querySelector(
        'input:not([type="checkbox"]):not([type="radio"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
      )
    initialFocus?.focus()
    return () => {
      element.close()
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog
      className={`modal ${className}`}
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-body">
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {error && (
          <p className="storage-error" role="alert">
            {error}
          </p>
        )}
        {children}
      </div>
    </dialog>
  )
}

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, error, className = '' }) {
  const dialog = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    element.showModal()
    return () => { element.close(); previousFocus?.focus() }
  }, [])

  return (
    <dialog className={`modal ${className}`} ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-body">
        <div className="modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
        {error && <p className="storage-error" role="alert">{error}</p>}
        {children}
      </div>
    </dialog>
  )
}

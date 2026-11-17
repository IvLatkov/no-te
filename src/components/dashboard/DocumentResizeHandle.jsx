import { useEffect, useId, useRef } from 'react'
import { MoveDiagonal2 } from 'lucide-react'
import { resetDocumentSize, resizeDocumentWindow } from './documentWindow.js'

export default function DocumentResizeHandle() {
  const hintId = useId()
  const button = useRef(null)
  const drag = useRef(null)
  const frame = useRef(null)

  function paint() {
    frame.current = null
    const current = drag.current
    if (current) resizeDocumentWindow(current.dialog, current.width, current.height, current.origin)
  }
  function finish(event) {
    if (drag.current && event?.pointerId !== undefined && event.pointerId !== drag.current.pointerId) return
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    paint()
    const current = drag.current
    drag.current = null
    if (current) {
      current.dialog.classList.remove('is-resizing')
      if (current.target.hasPointerCapture?.(current.pointerId)) current.target.releasePointerCapture(current.pointerId)
    }
  }

  useEffect(() => {
    function viewportChanged() {
      const dialog = button.current?.closest('dialog')
      if (dialog?.style.width) resizeDocumentWindow(dialog, parseFloat(dialog.style.width), parseFloat(dialog.style.height))
    }
    window.addEventListener('resize', viewportChanged)
    return () => {
      window.removeEventListener('resize', viewportChanged)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      drag.current?.dialog.classList.remove('is-resizing')
    }
  }, [])

  return (
    <div className="document-resize-footer">
      <span>Drag corner to resize</span>
      <span id={hintId} className="visually-hidden">Drag to resize the window. Arrow keys adjust its width and height; Home resets its size.</span>
      <button
        ref={button}
        type="button"
        className="document-resize-handle"
        aria-label="Resize documentation window"
        aria-describedby={hintId}
        title="Drag to resize; arrow keys adjust size; Home resets"
        onPointerDown={event => {
          if (event.button !== 0 || drag.current) return
          const dialog = event.currentTarget.closest('dialog')
          if (!dialog) return
          event.preventDefault()
          event.currentTarget.focus({ preventScroll: true })
          const origin = dialog.getBoundingClientRect()
          drag.current = { dialog, origin, target: event.currentTarget, pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: origin.width, height: origin.height }
          dialog.classList.add('is-resizing')
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={event => {
          const current = drag.current
          if (!current || event.pointerId !== current.pointerId) return
          current.width = current.origin.width + event.clientX - current.x
          current.height = current.origin.height + event.clientY - current.y
          if (frame.current === null) frame.current = requestAnimationFrame(paint)
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onKeyDown={event => {
          const dialog = event.currentTarget.closest('dialog')
          if (!dialog) return
          if (event.key === 'Home') {
            event.preventDefault()
            resetDocumentSize(dialog)
            return
          }
          const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
          const direction = directions[event.key]
          if (!direction) return
          event.preventDefault()
          const bounds = dialog.getBoundingClientRect()
          const step = event.shiftKey ? 8 : 32
          resizeDocumentWindow(dialog, bounds.width + direction[0] * step, bounds.height + direction[1] * step, bounds)
        }}
      ><MoveDiagonal2 size={18} aria-hidden="true" /></button>
    </div>
  )
}

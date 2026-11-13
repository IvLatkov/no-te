import { useCallback, useEffect, useRef } from 'react'
import {
  createNoteDragScroller,
  leavesDragRegion,
} from '../components/documentation/noteDragScroll'

export default function useNoteDragScroll(draggingId) {
  const panel = useRef(null)
  const scroller = useRef(null)
  useEffect(() => {
    const controller = createNoteDragScroller()
    scroller.current = controller
    const element = panel.current
    const invalidate = () => controller.invalidate()
    const externalScroll = (event) => {
      if (event.target !== element) invalidate()
    }
    const stop = () => controller.stop()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidate)
    for (const target of [
      element,
      element?.querySelector('.folder-tree'),
      element?.querySelector('.notes-list'),
    ])
      if (target) observer?.observe(target)
    window.addEventListener('resize', invalidate)
    window.addEventListener('scroll', externalScroll, true)
    window.addEventListener('blur', stop)
    document.addEventListener('drop', stop, true)
    document.addEventListener('dragend', stop, true)
    return () => {
      controller.stop()
      observer?.disconnect()
      scroller.current = null
      window.removeEventListener('resize', invalidate)
      window.removeEventListener('scroll', externalScroll, true)
      window.removeEventListener('blur', stop)
      document.removeEventListener('drop', stop, true)
      document.removeEventListener('dragend', stop, true)
    }
  }, [])
  useEffect(() => {
    if (!draggingId) scroller.current?.stop()
  }, [draggingId])
  return {
    ref: panel,
    onDragOver: useCallback(
      (event) => {
        if (draggingId) scroller.current?.update(event.currentTarget, event.clientX, event.clientY)
      },
      [draggingId],
    ),
    onDragLeave: useCallback((event) => {
      if (leavesDragRegion(event)) scroller.current?.stop()
    }, []),
  }
}

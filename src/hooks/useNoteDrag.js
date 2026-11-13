import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { validateNoteFolder } from '../data/organization'
import { leavesDragRegion } from '../components/documentation/noteDragScroll'

const dragType = 'application/x-no-te-note'

export default function useNoteDrag({ store, folders, readOnly, onMoved }) {
  const [draggingId, setDraggingId] = useState(null)
  const [movingId, setMovingId] = useState(null)
  const [target, setTarget] = useState(undefined)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const drag = useRef(null)
  const hovered = useRef(undefined)
  const pending = useRef(false)
  const mounted = useRef(false)
  const enabled = typeof store.moveNote === 'function'
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      drag.current = null
    }
  }, [])
  const setHovered = useCallback((id) => {
    if (hovered.current === id) return
    hovered.current = id
    setTarget(id)
  }, [])
  const endDrag = useCallback(() => {
    drag.current = null
    setDraggingId(null)
    setHovered(undefined)
  }, [setHovered])
  const validation = useCallback(
    (noteId, folderId) => {
      if (!enabled || readOnly || movingId)
        return 'Notes cannot be moved while another operation is loading or saving.'
      const note = store.getSnapshot().notes.find((item) => item.id === noteId)
      if (!note) return 'This note is unavailable. Reload before moving it.'
      try {
        validateNoteFolder({ ...note, folderId }, folders)
        return ''
      } catch (failure) {
        return failure.message
      }
    },
    [enabled, readOnly, movingId, store, folders],
  )
  const name = useCallback(
    (folderId) => {
      return folders.find((folder) => folder.id === folderId)?.name || 'Unfiled'
    },
    [folders],
  )
  const moveNote = useCallback(
    async (noteId, folderId) => {
      if (pending.current) return false
      const failure = validation(noteId, folderId)
      if (failure) {
        setError(failure)
        return false
      }
      pending.current = true
      setMovingId(noteId)
      setError('')
      setMessage(`Moving note to ${name(folderId)}…`)
      try {
        const saved = await store.moveNote(noteId, folderId)
        if (!mounted.current) return false
        if (!saved) {
          setError(
            store.getSnapshot().error || 'The note could not be moved. Reload before retrying.',
          )
          setMessage('')
          return false
        }
        onMoved(folderId)
        setMessage(`Moved “${saved.title || 'Untitled note'}” to ${name(folderId)}.`)
        return true
      } catch (failure) {
        if (mounted.current) {
          setError(failure.message)
          setMessage('')
        }
        return false
      } finally {
        pending.current = false
        if (mounted.current) setMovingId(null)
      }
    },
    [validation, store, onMoved, name],
  )
  const startDrag = useCallback(
    (event, noteId) => {
      if (!enabled || readOnly || pending.current) {
        event.preventDefault()
        return
      }
      const payload = { noteId, token: crypto.randomUUID() }
      event.dataTransfer.setData(dragType, JSON.stringify(payload))
      event.dataTransfer.effectAllowed = 'move'
      drag.current = payload
      setDraggingId(noteId)
      setHovered(undefined)
      setMessage('')
      setError('')
    },
    [enabled, readOnly, setHovered],
  )
  const hoveredNote = store.getSnapshot().notes.find((note) => note.id === draggingId)
  const feedback = useMemo(
    () =>
      new Map(
        [null, ...folders.map((folder) => folder.id)].map((id) => [
          id,
          draggingId ? validation(hoveredNote?.id || draggingId, id) : '',
        ]),
      ),
    [folders, draggingId, hoveredNote, validation],
  )
  function destinationProps(folderId) {
    const failure = feedback.get(folderId)
    const over = target === folderId
    return {
      'data-note-drop': draggingId
        ? `${over ? 'over-' : ''}${failure ? 'invalid' : 'valid'}`
        : undefined,
      title: draggingId ? failure || `Move note to ${name(folderId)}` : undefined,
    }
  }
  const hoverDestination = useCallback(
    (event, folderId) => {
      if (!drag.current) return
      event.preventDefault()
      event.dataTransfer.dropEffect = validation(drag.current.noteId, folderId) ? 'none' : 'move'
      setHovered(folderId)
    },
    [validation, setHovered],
  )
  const leaveDestination = useCallback(
    (event, folderId) => {
      if (!leavesDragRegion(event)) return false
      if (hovered.current === folderId) setHovered(undefined)
      return true
    },
    [setHovered],
  )
  const dropDestination = useCallback(
    (event, folderId) => {
      const active = drag.current
      if (!active) return
      event.preventDefault()
      event.stopPropagation()
      let payload
      try {
        payload = JSON.parse(event.dataTransfer.getData(dragType))
      } catch {
        endDrag()
        return
      }
      endDrag()
      if (payload.noteId !== active.noteId || payload.token !== active.token) {
        setError('Only a note dragged from this workspace can be moved.')
        return
      }
      void moveNote(active.noteId, folderId)
    },
    [endDrag, moveNote],
  )
  const hint =
    draggingId && target !== undefined
      ? validation(draggingId, target) || `Release to move note to ${name(target)}.`
      : ''
  return {
    enabled,
    draggingId,
    movingId,
    message: hint || message,
    error,
    startDrag,
    endDrag,
    moveNote,
    destinationProps,
    hoverDestination,
    leaveDestination,
    dropDestination,
    canDrop: useCallback((id) => !!draggingId && !feedback.get(id), [draggingId, feedback]),
    clearError: () => setError(''),
  }
}

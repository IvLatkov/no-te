export function resetDocumentSize(dialog) {
  if (!dialog) return
  for (const property of ['width', 'height', 'position', 'left', 'top', 'margin']) dialog.style.removeProperty(property)
}

export function resizeDocumentWindow(dialog, width, height, origin = dialog.getBoundingClientRect()) {
  const viewport = dialog.ownerDocument.defaultView
  const maxWidth = Math.max(1, viewport.innerWidth - 24)
  const maxHeight = Math.max(1, viewport.innerHeight - 24)
  const nextWidth = Math.max(Math.min(520, maxWidth), Math.min(width, maxWidth))
  const nextHeight = Math.max(Math.min(320, maxHeight), Math.min(height, maxHeight))
  Object.assign(dialog.style, {
    position: 'fixed', margin: '0px',
    width: `${nextWidth}px`, height: `${nextHeight}px`,
    left: `${Math.max(12, Math.min(origin.left, viewport.innerWidth - nextWidth - 12))}px`,
    top: `${Math.max(12, Math.min(origin.top, viewport.innerHeight - nextHeight - 12))}px`,
  })
}

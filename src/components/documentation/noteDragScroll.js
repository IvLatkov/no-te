// No React state and no retained drag events: at most one animation frame owns
// scrolling. A stationary pointer at a limit stays idle until geometry changes.
export function createNoteDragScroller({
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
} = {}) {
  let panel,
    point,
    frame = null,
    blocked = false,
    lastTime,
    lastAttempt
  function schedule() {
    if (panel && point && frame === null && !blocked) frame = requestFrame(tick)
  }
  function tick(timestamp) {
    frame = null
    if (!panel || !point) return
    // Batch all layout reads before the one optional write.
    const rect = panel.getBoundingClientRect()
    const top = panel.scrollTop
    const max = Math.max(0, panel.scrollHeight - panel.clientHeight)
    const viewport = panel.ownerDocument?.defaultView
    const upper = Math.max(0, rect.top)
    const lower = Math.min(rect.bottom, viewport?.innerHeight ?? Infinity)
    const edge = Math.min(36, (lower - upper) / 4)
    if (
      !rect.height ||
      !edge ||
      point.x < rect.left ||
      point.x > rect.right ||
      point.y < upper ||
      point.y > lower
    ) {
      blocked = true
      return
    }
    const direction = point.y < upper + edge ? -1 : point.y > lower - edge ? 1 : 0
    if (
      !direction ||
      (direction < 0 && top <= 0) ||
      (direction > 0 && top >= max) ||
      lastAttempt === top
    ) {
      blocked = true
      return
    }
    const now = Number.isFinite(timestamp) ? timestamp : performance.now()
    const elapsed = lastTime === undefined ? 16 : Math.min(40, Math.max(8, now - lastTime))
    lastTime = now
    const proximity =
      direction < 0 ? (upper + edge - point.y) / edge : (point.y - lower + edge) / edge
    const next = Math.min(
      max,
      Math.max(0, top + direction * elapsed * 0.5 * Math.min(1, proximity)),
    )
    if (next === top) {
      blocked = true
      return
    }
    lastAttempt = top
    panel.scrollTop = next
    if (next === 0 || next === max) blocked = true
    else schedule()
  }
  return {
    update(element, x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      const changed = panel !== element || !point || point.x !== x || point.y !== y
      if (changed) {
        blocked = false
        lastTime = undefined
        lastAttempt = undefined
      }
      panel = element
      point = { x, y }
      schedule()
    },
    invalidate() {
      blocked = false
      lastTime = undefined
      lastAttempt = undefined
      schedule()
    },
    stop() {
      if (frame !== null) cancelFrame(frame)
      frame = null
      panel = undefined
      point = undefined
      blocked = false
      lastTime = undefined
      lastAttempt = undefined
    },
  }
}

// Native dragleave often has no relatedTarget. Hit-testing the pointer avoids
// treating transitions between a row's icon, button and label as a real leave.
export function leavesDragRegion(event) {
  const element = event.currentTarget
  const NodeType = element.ownerDocument.defaultView?.Node
  if (NodeType && event.relatedTarget instanceof NodeType) return !element.contains(event.relatedTarget)
  const hit = element.ownerDocument.elementFromPoint?.(event.clientX, event.clientY)
  return !hit || !element.contains(hit)
}

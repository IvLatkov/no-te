import test from 'node:test'
import assert from 'node:assert/strict'
import { createNoteDragScroller } from '../src/components/documentation/noteDragScroll.js'

function harness({ top = 0, max = 400, stationary = false } = {}) {
  const frames = new Map()
  let id = 0,
    reads = 0,
    writes = 0,
    now = 0
  const panel = {
    ownerDocument: { defaultView: { innerHeight: 600 } },
    clientHeight: 200,
    scrollHeight: 200 + max,
    getBoundingClientRect() {
      reads += 1
      return { top: 100, bottom: 300, left: 50, right: 250, height: 200 }
    },
    get scrollTop() {
      return top
    },
    set scrollTop(value) {
      writes += 1
      if (!stationary) top = Math.min(panel.scrollHeight - panel.clientHeight, Math.max(0, value))
    },
  }
  const scroller = createNoteDragScroller({
    requestFrame(callback) {
      frames.set(++id, callback)
      return id
    },
    cancelFrame(handle) {
      frames.delete(handle)
    },
  })
  return {
    panel,
    scroller,
    frames,
    reads: () => reads,
    writes: () => writes,
    step() {
      const entry = frames.entries().next().value
      if (!entry) return
      frames.delete(entry[0])
      entry[1]((now += 16))
    },
  }
}

test('edge scrolling uses one loop, clamps at the limit, then remains idle for stationary drag events', () => {
  const h = harness({ max: 25 })
  for (let i = 0; i < 100; i++) h.scroller.update(h.panel, 150, 298)
  assert.equal(h.frames.size, 1)
  for (let i = 0; i < 20; i++) {
    h.step()
    assert.ok(h.frames.size <= 1)
  }
  assert.equal(h.panel.scrollTop, 25)
  assert.equal(h.frames.size, 0)
  const reads = h.reads(),
    writes = h.writes()
  for (let i = 0; i < 100; i++) h.scroller.update(h.panel, 150, 298)
  assert.equal(h.frames.size, 0)
  assert.equal(h.reads(), reads)
  assert.equal(h.writes(), writes)
  h.scroller.update(h.panel, 150, 102)
  for (let i = 0; i < 20; i++) h.step()
  assert.equal(h.panel.scrollTop, 0)
  assert.equal(h.frames.size, 0)
})

test('middle/outside pointer positions never scroll and stopping cancels pending work', () => {
  for (const [x, y] of [
    [150, 200],
    [10, 298],
    [150, 99],
    [150, 301],
  ]) {
    const h = harness()
    h.scroller.update(h.panel, x, y)
    h.step()
    assert.equal(h.writes(), 0)
    assert.equal(h.frames.size, 0)
  }
  const h = harness()
  h.scroller.update(h.panel, 150, 298)
  assert.equal(h.frames.size, 1)
  h.scroller.stop()
  h.step()
  assert.equal(h.frames.size, 0)
  assert.equal(h.writes(), 0)
})

test('a nonmoving container stops after one attempted write and resized content can restart scrolling', () => {
  const h = harness({ stationary: true })
  h.scroller.update(h.panel, 150, 298)
  h.step()
  h.step()
  assert.equal(h.writes(), 1)
  assert.equal(h.frames.size, 0)
  const bottom = harness({ top: 25, max: 25 })
  bottom.scroller.update(bottom.panel, 150, 298)
  bottom.step()
  assert.equal(bottom.writes(), 0)
  bottom.panel.scrollHeight += 100
  bottom.scroller.invalidate()
  bottom.step()
  assert.ok(bottom.panel.scrollTop > 25)
  bottom.scroller.stop()
})

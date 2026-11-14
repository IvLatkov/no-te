import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

export async function uiHarness(
  cacheName = 'test-task-documentation-ui',
  { module = '/src/LocalWorkspace.jsx', props = {}, onRender, strictMode = false } = {},
) {
  // Legacy regression suites deliberately exercise the preserved offline workspace.
  // Auth integration suites explicitly load the production /src/App.jsx entry.
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  for (const name of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLDialogElement',
    'Element',
    'Node',
    'Text',
    'DocumentFragment',
    'MutationObserver',
    'DOMParser',
    'Event',
    'MouseEvent',
    'KeyboardEvent',
    'FileReader',
    'localStorage',
    'getComputedStyle',
  ]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'getComputedStyle' ? dom.window[name].bind(dom.window) : dom.window[name],
    })
  }
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
  globalThis.cancelAnimationFrame = clearTimeout
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  // Behavior tests only: jsdom has no native dialog modality or layout engine.
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
  dom.window.Range.prototype.getClientRects = () => []
  dom.window.Range.prototype.getBoundingClientRect = () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
  })
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = React
  // Mocked UI tests must never initialize a real client from .env.local.
  const server = await createServer({
    envDir: false,
    cacheDir: `node_modules/.vite/${cacheName}`,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  const { default: App } = await server.ssrLoadModule(module)
  let root
  return {
    dom,
    act,
    async mount() {
      if (root) await act(async () => root.unmount())
      root = createRoot(document.getElementById('root'))
      await act(async () =>
        root.render(
          onRender
            ? React.createElement(
                React.Profiler,
                { id: 'test-workspace', onRender },
                React.createElement(App, props),
              )
            : strictMode
              ? React.createElement(React.StrictMode, null, React.createElement(App, props))
              : React.createElement(App, props),
        ),
      )
    },
    byText(text, scope = document) {
      const element = [...scope.querySelectorAll('button')].find(
        (button) => button.textContent.trim() === text,
      )
      assert.ok(element, `Button ${text} exists`)
      return element
    },
    byLabel(label, scope = document) {
      const element = [...scope.querySelectorAll('button')].find(
        (button) => button.getAttribute('aria-label') === label,
      )
      assert.ok(element, `Button ${label} exists`)
      return element
    },
    async click(element) {
      assert.ok(element, 'Click target exists')
      await act(async () => {
        element.click()
      })
    },
    async input(element, value) {
      assert.ok(element, 'Input exists')
      await act(async () => {
        const prototype =
          element.tagName === 'TEXTAREA'
            ? dom.window.HTMLTextAreaElement.prototype
            : dom.window.HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
    },
    async select(element, value) {
      await act(async () => {
        element.value = value
        element.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      })
    },
    async submit(scope = document) {
      await act(async () => {
        ;[...scope.querySelectorAll('dialog form')]
          .at(-1)
          .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
      })
    },
    async waitFor(predicate) {
      for (let index = 0; index < 100; index++) {
        if (predicate()) return
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20))
        })
      }
      assert.ok(predicate(), 'Expected UI appears')
    },
    editor: () => document.querySelector('.note-prose')?.editor,
    async close() {
      if (root) await act(async () => root.unmount())
      await server.close()
      dom.window.close()
    },
  }
}

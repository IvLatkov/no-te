import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
const tokens = Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(([, name, value]) => [name, value]))

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => {
    const channel = parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(foreground, background) {
  const values = [luminance(tokens[foreground]), luminance(tokens[background])].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('approved cream, dusty-blue and cobalt pairings retain their AAA/AA ratings', (context) => {
  const pairings = [
    ['Headings on cream', '--text-primary', '--background', 7],
    ['Body on cream', '--text-secondary', '--background', 7],
    ['Navigation on dusty blue', '--text-primary', '--secondary', 7],
    ['White button labels on cobalt', '--text-on-solid', '--accent', 4.5],
    ['Cobalt links on cream', '--accent', '--background', 4.5],
  ]
  for (const [name, foreground, background, minimum] of pairings) {
    const ratio = contrast(foreground, background)
    assert.ok(ratio >= minimum, `${name} must retain ${minimum === 7 ? 'AAA' : 'AA'} contrast`)
    context.diagnostic(`${name}: ${ratio.toFixed(2)}:1`)
  }
})

test('theme keeps headings, body text, actions and feedback readable on their actual surfaces', () => {
  for (const surface of ['--background', '--surface-base', '--surface-dialog', '--surface-raised']) {
    for (const foreground of ['--text-primary', '--text-secondary', '--text-muted', '--accent-text']) {
      assert.ok(contrast(foreground, surface) >= 4.5, `${foreground} on ${surface} must meet WCAG AA`)
    }
  }
  for (const foreground of ['--text-primary', '--text-secondary']) {
    assert.ok(contrast(foreground, '--secondary') >= 4.5, 'Sidebar text must remain readable on dusty blue')
  }
  for (const button of ['--accent', '--button-primary-hover', '--danger', '--danger-hover']) {
    assert.ok(contrast('--text-on-solid', button) >= 4.5, `Button label on ${button} must meet WCAG AA`)
  }
  for (const status of ['error', 'success', 'warning']) {
    assert.ok(contrast(`--${status}-text`, `--${status}-background`) >= 4.5, `${status} feedback must remain readable`)
  }
})

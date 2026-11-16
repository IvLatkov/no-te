import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [css, themeCss] = await Promise.all(['index', 'theme'].map(name => readFile(new URL(`../src/${name}.css`, import.meta.url), 'utf8')))

function themeTokens(theme) {
  const values = {}
  for (const [, selector, body] of [...themeCss.matchAll(/([^{}]+)\{([^{}]+)\}/g), ...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]) {
    if (!selector.includes(':root') && !(theme === 'dark' && selector.includes("[data-theme='dark']"))) continue
    for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) values[name] = value.trim()
  }
  function resolve(name, seen = new Set()) {
    assert.ok(!seen.has(name), `Theme token cycle at ${name}`)
    const value = values[name]
    const alias = /^var\((--[\w-]+)\)$/.exec(value)
    return alias ? resolve(alias[1], new Set([...seen, name])) : value
  }
  return Object.fromEntries(Object.keys(values).map(name => [name, resolve(name)]))
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => {
    const channel = parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(foreground, background, theme = 'light') {
  const tokens = themeTokens(theme)
  const values = [luminance(tokens[foreground]), luminance(tokens[background])].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('approved cream, dusty-blue and cobalt pairings retain their AAA/AA ratings', (context) => {
  const pairings = [
    ['Headings on cream', '--text-primary', '--background', 7],
    ['Body on cream', '--text-secondary', '--background', 7],
    ['Navigation on dusty blue', '--hero-text', '--hero-bg', 7],
    ['White button labels on cobalt', '--text-on-solid', '--accent', 4.5],
    ['Cobalt links on cream', '--accent', '--background', 4.5],
  ]
  for (const [name, foreground, background, minimum] of pairings) {
    const ratio = contrast(foreground, background)
    assert.ok(ratio >= minimum, `${name} must retain ${minimum === 7 ? 'AAA' : 'AA'} contrast`)
    context.diagnostic(`${name}: ${ratio.toFixed(2)}:1`)
  }
})

for (const theme of ['light', 'dark']) test(`${theme} theme keeps text, actions, hero and feedback readable`, () => {
  for (const surface of ['--background', '--surface-base', '--surface-dialog', '--surface-raised']) {
    for (const foreground of ['--text-primary', '--text-secondary', '--text-muted']) {
      assert.ok(contrast(foreground, surface, theme) >= 4.5, `${foreground} on ${surface} must meet WCAG AA`)
    }
  }
  for (const surface of ['--background', '--surface-base']) {
    assert.ok(contrast('--accent-text', surface, theme) >= 4.5, 'Links on cream/slate and cards must meet WCAG AA')
  }
  assert.ok(contrast('--accent-text-hover', '--surface-subtle', theme) >= 4.5, 'Active controls on tinted blue must stay readable')
  assert.ok(contrast('--hero-text', '--hero-bg', theme) >= 4.5, 'Sidebar/hero headings must stay readable')
  assert.ok(contrast('--hero-body', '--hero-bg', theme) >= 4.5, 'Sidebar/hero body must stay readable')
  for (const button of ['--accent', '--button-primary-hover', '--danger', '--danger-hover']) {
    assert.ok(contrast('--text-on-solid', button, theme) >= 4.5, `Button label on ${button} must meet WCAG AA`)
  }
  for (const status of ['error', 'success', 'warning']) {
    assert.ok(contrast(`--${status}-text`, `--${status}-background`, theme) >= 4.5, `${status} feedback must remain readable`)
  }
})

test('dark lifted-blue links retain approximately 9.8:1 contrast on slate', context => {
  const ratio = contrast('--accent-text', '--background', 'dark')
  assert.ok(ratio >= 9.7)
  context.diagnostic(`Lifted blue on slate: ${ratio.toFixed(2)}:1`)
})

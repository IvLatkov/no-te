// Runs before paint; keep the key and valid values aligned with theme/preferences.js.
(() => {
  let preference
  try { preference = localStorage.getItem('no-te.appearance') } catch { /* Session-only theme. */ }
  const theme = preference === 'light' || preference === 'dark'
    ? preference
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F172A' : '#F5F5F0')
})()

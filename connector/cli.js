import { createInterface, emitKeypressEvents } from 'node:readline'
import { realpath } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'
import { loadConfig, saveConfig, repositoryBinding, configPath } from './config.js'
import { createAuth, credentialStore, memoryStore, supabaseClient } from './auth.js'
import { createService } from './service.js'
import { createServer } from './server.js'
import { fail, safeError } from './errors.js'

async function prompt(label, hidden = false) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) fail('TERMINAL_REQUIRED', 'Login and configuration require your interactive terminal. Never provide credentials in arguments or chat.')
  if (!hidden) {
    const input = createInterface({ input: process.stdin, output: process.stderr })
    try { return await new Promise(resolve => input.question(label, answer => resolve(answer.trim()))) } finally { input.close() }
  }
  process.stderr.write(label)
  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve, reject) => {
    let value = ''
    const cleanup = () => { process.stdin.off('keypress', keypress); process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write('\n') }
    const keypress = (str, key) => {
      if (key?.ctrl && key.name === 'c') { cleanup(); reject(new Error('Cancelled')); return }
      if (key?.name === 'return') { cleanup(); resolve(value); return }
      if (key?.name === 'backspace') value = [...value].slice(0, -1).join('')
      else if (str && !key?.ctrl && [...str].every(character => character.charCodeAt(0) >= 32)) value += str
    }
    process.stdin.on('keypress', keypress)
  })
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!['configure', 'login', 'logout', 'serve', 'check'].includes(command)) fail('USAGE', 'Usage: node connector/cli.js configure|login [--session-only]|logout|serve [--repo PATH]|check [--repo PATH]')
  const sessionOnly = command === 'login' && args.length === 1 && args[0] === '--session-only'
  const repositoryArgs = ['serve', 'check'].includes(command) && args.length === 2 && args[0] === '--repo'
  if (args.length && !sessionOnly && !repositoryArgs) fail('USAGE', 'Unexpected arguments. Credentials must only be entered at interactive prompts.')
  if (command === 'configure') {
    const url = await prompt('Supabase HTTPS project URL: ')
    const publishableKey = await prompt('Supabase publishable key (never a secret key): ')
    const repository = await realpath(await prompt('Absolute local repository path: '))
    const projectId = await prompt('Permitted No-Te project UUID: ')
    // Keep existing mappings only after validating the existing configuration.
    let previous
    try { previous = await loadConfig() } catch { /* First-time setup. */ }
    if (previous && (previous.url !== url || previous.publishableKey !== publishableKey)) fail('CONFIGURATION', 'Existing configuration uses a different Supabase project. Review it privately before replacing it.')
    const mappings = (previous?.mappings || []).filter(mapping => mapping.repository.toLowerCase() !== repository.toLowerCase())
    await saveConfig({ url, publishableKey, mappings: [...mappings, { repository, projectId }] })
    process.stderr.write(`Private configuration saved outside Git: ${configPath}\n`)
    return
  }
  const config = await loadConfig()
  let ephemeral
  if (process.env.NO_TE_MCP_SESSION) {
    try { ephemeral = z.object({ access_token: z.string(), refresh_token: z.string() }).strict().parse(JSON.parse(process.env.NO_TE_MCP_SESSION)) } catch { fail('LOGIN_REQUIRED', 'Invalid in-memory session. Restart interactive session-only login.') }
    delete process.env.NO_TE_MCP_SESSION
  }
  const store = sessionOnly || ephemeral ? memoryStore(ephemeral) : await credentialStore(config)
  const client = supabaseClient(config)
  const auth = createAuth(client, store)
  if (command === 'login') {
    const email = await prompt('Supabase account email: ')
    const password = await prompt('Password (hidden): ', true)
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session) fail('LOGIN_FAILED', 'Sign-in failed. Check credentials and connectivity. No session was saved.')
    try {
      await store.write({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
      await auth.ensure()
    } catch (error) {
      await client.auth.signOut({ scope: 'local' }).catch(() => {})
      throw error
    }
    process.stderr.write('Authenticated identity verified.\n')
    if (sessionOnly) {
      if (process.platform !== 'win32') fail('SESSION_PLATFORM', 'Session-only terminal wrapper currently supports Windows.')
      process.stderr.write('Session-only PowerShell: run Codex CLI here after the manual MCP setup. Credentials remain in process memory/environment, never files. Exit this shell to sign out. Existing VS Code GUI processes do not inherit this session.\n')
      const env = { ...process.env, NO_TE_MCP_SESSION: JSON.stringify(await store.read()) }
      try {
        await new Promise((resolve, reject) => {
          const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile'], { stdio: 'inherit', env, shell: false })
          child.once('error', reject)
          child.once('exit', resolve)
        })
      } finally { delete env.NO_TE_MCP_SESSION; await auth.logout() }
    }
    return
  }
  if (command === 'logout') { await auth.logout(); process.stderr.write('Local credentials cleared; logout completed.\n'); return }
  const binding = await repositoryBinding(config, repositoryArgs ? args[1] : process.cwd())
  const service = createService(auth, binding.projectId)
  if (command === 'check') {
    await service.listProjects()
    process.stderr.write('Authenticated identity and permitted project read verified. Completion RPC has not been executed or verified against production.\n')
    return
  }
  serveStdio(() => createServer(service), { onerror: () => process.stderr.write('No-Te MCP protocol error.\n') })
}

main().catch(error => {
  const safe = safeError(error)
  process.stderr.write(`${safe.code}: ${safe.message}\n`)
  process.exitCode = 1
})

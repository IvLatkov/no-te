import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { fail } from './errors.js'

export const configPath = path.join(process.env.LOCALAPPDATA || path.join(homedir(), '.config'), 'NoTe', 'mcp', 'config.json')
const schema = z.object({
  url: z.url(),
  publishableKey: z.string().min(20),
  mappings: z.array(z.object({ repository: z.string().min(1), projectId: z.uuid() }).strict()).min(1),
}).strict()

export function validateConfig(value) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) fail('CONFIGURATION', 'Invalid private connector configuration. Run the configure command.')
  const config = parsed.data
  const url = new URL(config.url)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    fail('CONFIGURATION', 'Use the HTTPS Supabase project origin without credentials, paths or query parameters.')
  }
  let role
  try { role = JSON.parse(Buffer.from(config.publishableKey.split('.')[1], 'base64url').toString()).role } catch { /* Publishable keys are opaque. */ }
  if (!config.publishableKey.startsWith('sb_publishable_') && role !== 'anon') {
    fail('CONFIGURATION', 'Only a Supabase publishable key or legacy anon key is allowed. Never supply privileged credentials.')
  }
  return config
}

export async function loadConfig(file = configPath) {
  let raw
  try { raw = JSON.parse(await readFile(file, 'utf8')) } catch { fail('CONFIGURATION', 'Private configuration is missing or unreadable. Run: node connector/cli.js configure') }
  return validateConfig(raw)
}

export async function repositoryBinding(config, repository) {
  const canonical = await realpath(repository)
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value
  const matches = []
  for (const mapping of config.mappings) {
    if (normalize(await realpath(mapping.repository)) === normalize(canonical)) matches.push(mapping)
  }
  if (matches.length !== 1) fail('PROJECT_MAPPING', 'This repository must have exactly one explicit private project mapping. Run configure and review the project ID.')
  return { repository: canonical, projectId: matches[0].projectId }
}

export async function saveConfig(value, file = configPath) {
  const config = validateConfig(value)
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
}

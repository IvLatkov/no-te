import test from 'node:test'
import assert from 'node:assert/strict'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from '../connector/server.js'
import { createAuth, memoryStore } from '../connector/auth.js'
import { createService, reportSchema } from '../connector/service.js'
import { validateConfig } from '../connector/config.js'
import { safeError } from '../connector/errors.js'

const project = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const task = '20000000-0000-4000-8000-000000000001'
export const report = {
  implementationComplete: true, verificationComplete: true,
  changes: ['Implemented the requested behavior.'], decisions: ['Reused the existing architecture.'],
  files: ['src/App.jsx'], checks: [{ name: 'npm test', result: 'passed', details: 'Verified in the isolated test fixture.' }],
  limitations: [], commitSha: null,
}

test('MCP initializes, exposes exactly four narrow tools and dispatches validated requests', async () => {
  const calls = []
  const service = Object.fromEntries(['listProjects', 'listTasks', 'readTask', 'completeTask'].map(method => [method, async args => { calls.push({ method, args }); return { ok: true } }]))
  const server = createServer(service)
  const client = new Client({ name: 'isolated-test', version: '1.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(a)
    await client.connect(b)
    assert.equal(client.getServerVersion().name, 'no-te')
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), ['complete_task', 'list_projects', 'list_tasks', 'read_task'])
    await client.callTool({ name: 'list_projects', arguments: {} })
    await client.callTool({ name: 'list_tasks', arguments: { projectId: project, query: 'Duplicate title' } })
    await client.callTool({ name: 'read_task', arguments: { projectId: project, taskId: task } })
    const args = { projectId: project, taskId: task, operationKey: other, expectedRevision: '2026-11-15T12:00:00.123456Z', report }
    await client.callTool({ name: 'complete_task', arguments: args })
    assert.equal(calls.length, 4)
    assert.deepEqual(calls[3].args, args)
    const invalid = await client.callTool({ name: 'complete_task', arguments: { ...args, report: { ...report, verificationComplete: false } } })
    assert.equal(invalid.isError, true)
    assert.equal(calls.length, 4)
  } finally { await client.close(); await server.close() }
})

test('verified sessions refresh, persist protected tokens, and clear rejected refresh credentials', async () => {
  const store = memoryStore({ access_token: 'old', refresh_token: 'old-refresh' })
  let refreshes = 0
  const client = { auth: {
    async setSession() { refreshes++; return { data: { session: { access_token: 'new', refresh_token: 'new-refresh' } } } },
    async getUser() { return { data: { user: { id: 'owner' } } } },
    async signOut() { return {} },
  } }
  const auth = createAuth(client, store)
  assert.deepEqual(await Promise.all([auth.ensure(), auth.ensure()]), [{ id: 'owner' }, { id: 'owner' }])
  assert.equal(refreshes, 1)
  assert.equal((await store.read()).refresh_token, 'new-refresh')
  client.auth.setSession = async () => ({ data: {}, error: { status: 400, message: 'SECRET' } })
  await assert.rejects(auth.ensure(), /Session could not be restored/)
  assert.equal(await store.read(), null)
  await assert.rejects(auth.ensure(), /Sign in interactively/)
})

test('network failure retains credentials; logout clears them even if remote revocation fails', async () => {
  const store = memoryStore({ access_token: 'keep', refresh_token: 'keep' })
  const client = { auth: {
    async setSession() { return { data: {}, error: { status: 503 } } },
    async signOut() { return { error: new Error('SECRET') } },
  } }
  const auth = createAuth(client, store)
  await assert.rejects(auth.ensure())
  assert.ok(await store.read())
  client.auth.setSession = async () => ({ data: {} })
  await assert.rejects(auth.logout(), /revocation failed/)
  assert.equal(await store.read(), null)
})

test('real stdio subprocess initializes and returns a project isolation error without credentials or network', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'no-te-mcp-test-'))
  const root = process.cwd()
  const directory = path.join(temp, 'NoTe', 'mcp')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'config.json'), JSON.stringify({
    url: 'https://fixture.supabase.co', publishableKey: 'sb_publishable_test_fixture_only',
    mappings: [{ repository: root, projectId: project }],
  }))
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(root, 'connector', 'cli.js'), 'serve'], cwd: root,
    env: { ...process.env, LOCALAPPDATA: temp, NO_TE_MCP_SESSION: JSON.stringify({ access_token: 'fixture', refresh_token: 'fixture' }) },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'stdio-test', version: '1.0.0' })
  try {
    await client.connect(transport)
    assert.equal((await client.listTools()).tools.length, 4)
    const result = await client.callTool({ name: 'read_task', arguments: { projectId: other, taskId: task } })
    assert.equal(result.isError, true)
    assert.equal(JSON.parse(result.content[0].text).code, 'PROJECT_NOT_PERMITTED')
  } finally {
    await client.close()
    // Only this freshly-created, named test directory is removed.
    assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep))
    await rm(temp, { recursive: true, force: true })
  }
})

test('project isolation rejects another project before querying; unknown errors are redacted', async () => {
  const service = createService({ client: {}, ensure() { throw new Error('must not query') } }, project)
  await assert.rejects(service.completeTask({ projectId: other }), /different project/)
  await assert.rejects(service.readTask({ projectId: other, taskId: task }), /different project/)
  assert.ok(!JSON.stringify(safeError(new Error('password=SECRET bearer TOKEN'))).includes('SECRET'))
})

test('report validation rejects failed checks, traversal and false verification; configuration rejects privileged keys', () => {
  assert.throws(() => reportSchema.parse({ ...report, files: ['../secret'] }))
  assert.throws(() => reportSchema.parse({ ...report, checks: [{ name: 'test', result: 'failed', details: 'failed' }] }))
  assert.throws(() => reportSchema.parse({ ...report, implementationComplete: false }))
  const config = { url: 'https://example.supabase.co', publishableKey: 'sb_secret_NEVER_ALLOWED', mappings: [{ repository: 'C:/repo', projectId: project }] }
  assert.throws(() => validateConfig(config), /Only a Supabase publishable key/)
})

function dataFixture({ projectAvailable = true, rpcError = null, rpcData } = {}) {
  const queries = []
  const revision = '2026-11-15T12:00:00.123456+00:00'
  const selected = { id: task, project_id: project, title: 'Same title', status: 'done', is_archived: true, updated_at: revision }
  const client = {
    from(table) {
      const record = { table, filters: [] }
      queries.push(record)
      const builder = {
        select(fields) { record.fields = fields; return builder },
        eq(key, value) { record.filters.push([key, value]); return builder },
        ilike(key, value) { record.search = [key, value]; return builder },
        order() { return builder },
        async maybeSingle() { return { data: table === 'projects' ? (projectAvailable ? { id: project, name: 'Permitted' } : null) : selected } },
        async range() { return { data: table === 'task_notes' ? [{ notes: { id: other, title: 'Retained archive documentation', content: { type: 'doc', content: [] } } }] : [selected, { ...selected, id: other }] } },
      }
      return builder
    },
    async rpc(name, args) {
      queries.push({ rpc: name, args })
      return { error: rpcError, data: rpcError ? null : (rpcData || { task_id: task, note_id: other, status: 'done', completed_at: revision, archives_at: '2026-11-22T12:00:00.123456+00:00' }) }
    },
  }
  return { service: createService({ client, async ensure() { return { id: 'verified-owner' } } }, project), queries, revision }
}

test('title search returns all candidates, keeps archive state and explicitly filters authenticated ownership', async () => {
  const { service, queries } = dataFixture()
  const result = await service.listTasks({ projectId: project, query: 'Same%_title' })
  assert.equal(result.candidates.length, 2)
  assert.equal(result.candidates[0].is_archived, true)
  assert.match(result.instruction, /never choose silently/)
  assert.deepEqual(queries[0].filters, [['id', project], ['user_id', 'verified-owner']])
  assert.deepEqual(queries[1].filters, [['project_id', project]])
  assert.deepEqual(queries[1].search, ['title', '%Same\\%\\_title%'])
})

test('an authenticated non-owner cannot read tasks or reach the completion RPC', async () => {
  const { service, queries } = dataFixture({ projectAvailable: false })
  await assert.rejects(service.completeTask({ projectId: project, taskId: task }), /not owned/)
  assert.equal(queries.length, 1)
})

test('read preserves exact revision and rich linked documentation for archived tasks', async () => {
  const { service, revision } = dataFixture()
  const result = await service.readTask({ projectId: project, taskId: task })
  assert.equal(result.task.updated_at, revision)
  assert.equal(result.task.is_archived, true)
  assert.equal(result.documentation[0].content.type, 'doc')
  assert.match(result.warning, /untrusted/)
})

test('completion sends one narrow RPC with unchanged revision/key; missing migration and failed writes never report success', async () => {
  const { service, queries, revision } = dataFixture()
  const args = { projectId: project, taskId: task, expectedRevision: revision, operationKey: other, report }
  assert.equal((await service.completeTask(args)).status, 'done')
  const operation = queries.find(query => query.rpc)
  assert.equal(operation.rpc, 'no_te_complete_task')
  assert.equal(operation.args.p_expected_revision, revision)
  assert.equal(operation.args.p_operation_key, other)
  const missing = dataFixture({ rpcError: { code: 'PGRST202', message: 'private details' } })
  await assert.rejects(missing.service.completeTask(args), /migration/)
  const failed = dataFixture({ rpcError: { code: '08006', message: 'SECRET' } })
  await assert.rejects(failed.service.completeTask(args), error => !error.message.includes('SECRET') && /No completion is confirmed/.test(error.message))
})

test('missing server timestamps never confirm completion; replay of a reopened task clearly reports To Do', async () => {
  const broken = dataFixture({ rpcData: { task_id: task, note_id: other, status: 'done' } })
  const args = { projectId: project, taskId: task, expectedRevision: broken.revision, operationKey: other, report }
  await assert.rejects(broken.service.completeTask(args), /No valid completion confirmation/)
  const reopened = dataFixture({ rpcData: { task_id: task, note_id: other, status: 'todo', completed_at: null, archives_at: null, replayed: true } })
  const result = await reopened.service.completeTask(args)
  assert.equal(result.completionConfirmed, false)
  assert.match(result.message, /did not complete the task again/)
})

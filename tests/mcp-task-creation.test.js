import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { createService, createTaskSchema } from '../connector/service.js'
import { createServer } from '../connector/server.js'

const project = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'
const description = 'Requested behaviour: add a compact pause control.\nAcceptance criteria:\n- Pausing stops movement.\n- Resuming preserves progress.'
const input = () => ({ projectId: project, title: 'Add pause control', description, operationKey: randomUUID() })
const report = {
  implementationComplete: true, verificationComplete: true,
  changes: ['Added pause behavior in this isolated fixture.'], decisions: ['Reused existing components.'],
  files: ['src/pause.js'], checks: [{ name: 'fixture check', result: 'passed', details: 'Observed fixture result only.' }],
  limitations: [], commitSha: null,
}

const migrations = await Promise.all(['task-workflow.sql', 'mcp-completion.sql', 'mcp-task-creation.sql'].map(name =>
  readFile(new URL(`../database-local/${name}`, import.meta.url), 'utf8').catch(() => null)))

test('creation input rejects protected fields and requires a real UUID v4 operation key', async () => {
  for (const field of ['id', 'userId', 'user_id', 'owner', 'ownerId', 'status', 'created_at', 'updated_at', 'completedAt', 'completed_at', 'archivesAt', 'archives_at', 'archive_grace_started_at', 'implementation_notes', 'arbitrary']) {
    const args = { ...input(), [field]: 'not permitted' }
    assert.equal(createTaskSchema.safeParse(args).success, false, field)
    const service = createService({ client: {}, ensure() { throw new Error('Must reject before auth/database') } }, project)
    await assert.rejects(service.createTask(args), error => error.code === 'INVALID_TASK_INPUT')
  }
  for (const args of [
    { ...input(), title: '   ' }, { ...input(), title: 'x'.repeat(201) },
    { ...input(), description: '' }, { ...input(), description: 'x'.repeat(20001) },
    { ...input(), operationKey: 'make-one-up' }, { ...input(), operationKey: '00000000-0000-0000-0000-000000000000' },
  ]) assert.equal(createTaskSchema.safeParse(args).success, false)
})

test('create_task MCP dispatch is strict and stays compatible with existing tools', async () => {
  const calls = []
  const server = createServer({ async createTask(args) { calls.push(args); return { ok: true } } })
  const client = new Client({ name: 'creation-test', version: '1.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(a)
    await client.connect(b)
    const args = input()
    await client.callTool({ name: 'create_task', arguments: args })
    assert.deepEqual(calls, [args])
    for (const fields of [{ status: 'done' }, { user_id: bob }, { completed_at: '2000-01-01' }]) {
      const invalid = await client.callTool({ name: 'create_task', arguments: { ...args, ...fields } })
      assert.equal(invalid.isError, true)
    }
    assert.equal(calls.length, 1)
  } finally { await client.close(); await server.close() }
})

test('creation refuses unmapped projects and authenticated non-owners before any RPC', async () => {
  const service = createService({ client: {}, ensure() { throw new Error('Must not authenticate another project') } }, project)
  await assert.rejects(service.createTask({ ...input(), projectId: other }), error => error.code === 'PROJECT_NOT_PERMITTED')
  const nonOwner = createService({
    async ensure() { return { id: bob } },
    client: { from(table) {
      assert.equal(table, 'projects')
      const chain = { select() { return chain }, eq(field, value) {
        if (field === 'user_id') assert.equal(value, bob)
        return chain
      }, async maybeSingle() { return { data: null } } }
      return chain
    } },
  }, project)
  await assert.rejects(nonOwner.createTask(input()), error => error.code === 'NOT_AUTHORIZED')
})

test('creation validates saved fields and reports missing migration or uncertain responses honestly', async () => {
  const args = input()
  const original = {
    task_id: randomUUID(), project_id: project, title: args.title, description,
    status: 'todo', created_at: '2026-11-15T12:00:00.123456+00:00', updated_at: '2026-11-15T12:00:00.123456+00:00',
    completed_at: null, archives_at: null, replayed: false,
  }
  let response = { data: original }
  const chain = { select() { return chain }, eq() { return chain }, async maybeSingle() { return { data: { id: project } } } }
  const client = { from() { return chain }, async rpc(name, parameters) {
    assert.equal(name, 'no_te_create_task')
    assert.deepEqual(parameters, { p_project_id: project, p_title: args.title, p_description: description, p_operation_key: args.operationKey })
    return response
  } }
  const service = createService({ client, async ensure() { return { id: alice } } }, project)
  assert.equal((await service.createTask(args)).updated_at, original.updated_at)
  for (const patch of [{ task_id: 'not-an-id' }, { project_id: other }, { updated_at: null }, { status: 'done' }, { completed_at: original.created_at }, { title: 'Different task' }]) {
    response = { data: { ...original, ...patch } }
    await assert.rejects(service.createTask(args), error => error.code === 'CREATION_UNCONFIRMED')
  }
  response = { data: null, error: { code: 'PGRST202' } }
  await assert.rejects(service.createTask(args), error => error.code === 'MIGRATION_REQUIRED' && /creation/.test(error.message))
  response = { data: null, error: { code: '08006', message: 'PRIVATE TOKEN' } }
  await assert.rejects(service.createTask(args), error => /No task creation is confirmed/.test(error.message) && !error.message.includes('TOKEN'))
})

async function isolatedDatabase({ beforeCreation } = {}) {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth;
      create role authenticated; create role anon;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon;
      create table public.projects(id uuid primary key,user_id uuid not null,name text default 'Fixture',description text default '');
      create table public.tasks(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),
        title text not null,description text not null default '',status text not null default 'todo' check(status in ('todo','done')),
        implementation_notes text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
      create function public.no_te_set_updated_at_641() returns trigger language plpgsql as $$ begin new.updated_at=statement_timestamp(); return new; end $$;
      create trigger no_te_updated_at_641 before insert or update on public.tasks for each row execute function public.no_te_set_updated_at_641();
      create table public.notes(id uuid primary key default gen_random_uuid(),user_id uuid not null,project_id uuid references public.projects,
        title text not null,content jsonb not null,updated_at timestamptz default statement_timestamp());
      create table public.task_notes(task_id uuid references public.tasks on delete cascade,note_id uuid references public.notes on delete cascade,primary key(task_id,note_id));
      alter table public.projects enable row level security;
      alter table public.tasks enable row level security;
      alter table public.notes enable row level security;
      alter table public.task_notes enable row level security;
      create policy own_projects on public.projects to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      create policy own_tasks on public.tasks to authenticated
        using(exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()))
        with check(exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()));
      create policy own_notes on public.notes to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      create policy own_links on public.task_notes to authenticated
        using(exists(select 1 from public.tasks t where t.id=task_id) and exists(select 1 from public.notes n where n.id=note_id))
        with check(exists(select 1 from public.tasks t where t.id=task_id) and exists(select 1 from public.notes n where n.id=note_id));
      grant select,insert,update,delete on public.projects,public.tasks,public.notes,public.task_notes to authenticated;
      insert into public.projects(id,user_id) values('${project}','${alice}'),('${other}','${bob}');
      insert into public.notes(user_id,project_id,title,content) values('${alice}','${project}','Independent guide','{"type":"doc","content":[]}');
    `)
    await db.exec(migrations[0])
    await db.exec(migrations[1])
    if (beforeCreation) await beforeCreation(db)
    await db.exec(migrations[2])
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice])
    await db.exec('set role authenticated')
    return db
  } catch (error) { await db.close(); throw error }
}

test('creation migration rejects replica-only and disabled prerequisite triggers', {
  skip: migrations.some(sql => !sql) && 'Supply the private database-local migrations to run isolated SQL tests.',
}, async () => {
  for (const trigger of ['no_te_task_completion', 'no_te_updated_at_641']) {
    for (const command of ['enable replica', 'disable']) {
      await assert.rejects(isolatedDatabase({ beforeCreation: db =>
        db.exec(`alter table public.tasks ${command} trigger ${trigger}`),
      }), /Review\/apply task workflow and server timestamp setup first/)
    }
  }
})

test('creation migration accepts always-enabled triggers and indexes project cascades', {
  skip: migrations.some(sql => !sql) && 'Supply the private database-local migrations to run isolated SQL tests.',
}, async () => {
  const db = await isolatedDatabase({ beforeCreation: db => db.exec(`
    alter table public.tasks enable always trigger no_te_task_completion;
    alter table public.tasks enable always trigger no_te_updated_at_641;
  `) })
  try {
    await db.exec('reset role')
    const indexes = (await db.query(`select indexdef from pg_indexes
      where schemaname='no_te_connector' and tablename='task_creations'`)).rows
    assert.ok(indexes.some(row => /USING btree \(project_id\)/.test(row.indexdef)))
  } finally { await db.close() }
})

test('one-time creation migration rejects an old ledger and leaves its data intact', {
  skip: migrations.some(sql => !sql) && 'Supply the private database-local migrations to run isolated SQL tests.',
}, async () => {
  let checked = false
  await assert.rejects(isolatedDatabase({ beforeCreation: async db => {
    await db.exec(`create schema if not exists no_te_connector;
      create table no_te_connector.task_creations(marker text);
      insert into no_te_connector.task_creations values('keep old draft data');`)
    await assert.rejects(db.exec(migrations[2]), /TASK_CREATION_LEDGER_EXISTS/)
    await db.exec('rollback')
    assert.deepEqual((await db.query('select marker from no_te_connector.task_creations')).rows,
      [{ marker: 'keep old draft data' }])
    checked = true
  } }), /TASK_CREATION_LEDGER_EXISTS/)
  assert.equal(checked, true)
})

test('one-time migration reruns refuse safely without changing saved task or retry ledger', {
  skip: migrations.some(sql => !sql) && 'Supply the private database-local migrations to run isolated SQL tests.',
}, async () => {
  const db = await isolatedDatabase()
  try {
    const key = randomUUID()
    const call = () => db.query('select public.no_te_create_task($1,$2,$3,$4) as result',
      [project, 'Preserve saved task', description, key])
    const saved = (await call()).rows[0].result
    await db.exec('reset role')
    await assert.rejects(db.exec(migrations[2]), /TASK_CREATION_LEDGER_EXISTS/)
    await db.exec('rollback; set role authenticated')
    assert.deepEqual((await call()).rows[0].result, { ...saved, replayed: true })
    assert.equal((await db.query('select count(*)::int as n from no_te_connector.task_creations')).rows[0].n, 1)
  } finally { await db.close() }
})

// Minimal Supabase transport adapter over real isolated SQL, not production.
function sqlClient(db) {
  return {
    from(table) {
      assert.ok(['projects', 'task_workflow', 'task_notes'].includes(table))
      const filters = []
      const values = []
      const query = async single => {
        const source = table === 'task_notes'
          ? 'public.task_notes l join public.notes n on n.id=l.note_id' : `public.${table}`
        const fields = table === 'task_notes' ? 'l.note_id,to_jsonb(n) as notes' : '*'
        const where = filters.length ? ` where ${filters.join(' and ')}` : ''
        // Match PostgREST JSON timestamps without JS Date's millisecond truncation.
        const result = await db.query(`select to_jsonb(saved) as payload from (select ${fields} from ${source}${where}) saved`, values)
        const rows = result.rows.map(row => row.payload)
        return { data: single ? rows[0] : rows }
      }
      const chain = {
        select() { return chain },
        eq(field, value) {
          assert.ok(['id', 'project_id', 'user_id', 'task_id'].includes(field))
          values.push(value); filters.push(`${field}=$${values.length}`)
          return chain
        },
        order() { return chain },
        maybeSingle() { return query(true) },
        range() { return query(false) },
      }
      return chain
    },
    async rpc(name, args) {
      try {
        let result
        if (name === 'no_te_create_task') result = await db.query('select public.no_te_create_task($1,$2,$3,$4) as result', [args.p_project_id, args.p_title, args.p_description, args.p_operation_key])
        else {
          assert.equal(name, 'no_te_complete_task')
          result = await db.query('select public.no_te_complete_task($1,$2,$3,$4,$5::jsonb) as result', [args.p_project_id, args.p_task_id, args.p_expected_revision, args.p_operation_key, JSON.stringify(args.p_report)])
        }
        return { data: result.rows[0].result }
      } catch (error) { return { data: null, error: { code: error.code, message: error.message } } }
    },
  }
}

test('isolated SQL creation: generated fields, concurrent attempts, conflicts, authorization, rollback and deletion tombstone', {
  skip: migrations.some(sql => !sql) && 'Supply the private database-local migrations to run isolated SQL tests.',
}, async () => {
  const db = await isolatedDatabase()
  const rpc = sqlClient(db).rpc
  const args = { p_project_id: project, p_title: 'Same title', p_description: description, p_operation_key: randomUUID() }
  try {
    // Concurrent callers issue equal keys. PGlite queues its single connection;
    // production cross-connection exclusion additionally relies on the advisory lock + PK.
    const results = await Promise.all(Array.from({ length: 8 }, () => rpc('no_te_create_task', args)))
    assert.ok(results.every(result => !result.error), JSON.stringify(results))
    assert.equal(new Set(results.map(result => result.data.task_id)).size, 1)
    assert.equal(results.filter(result => !result.data.replayed).length, 1)
    const created = results[0].data
    assert.equal(created.status, 'todo')
    assert.equal(created.project_id, project)
    assert.equal(created.completed_at, null)
    assert.equal(created.archives_at, null)
    const saved = (await db.query("select id,to_jsonb(updated_at)#>>'{}' as revision from public.tasks")).rows[0]
    assert.equal(created.task_id, saved.id)
    assert.equal(created.updated_at, saved.revision)
    const signature = (await db.query("select prosecdef,proargnames from pg_proc where oid='public.no_te_create_task(uuid,text,text,uuid)'::regprocedure")).rows[0]
    assert.equal(signature.prosecdef, false)
    assert.deepEqual(signature.proargnames, ['p_project_id', 'p_title', 'p_description', 'p_operation_key'])
    assert.equal((await db.query('select count(*)::int as n from public.tasks')).rows[0].n, 1)
    const conflicting = await Promise.all([
      rpc('no_te_create_task', { ...args, p_title: 'Changed title' }),
      rpc('no_te_create_task', { ...args, p_description: 'Changed criteria' }),
    ])
    assert.ok(conflicting.every(result => result.error.message === 'IDEMPOTENCY_CONFLICT'))
    const newKeySameTitle = await rpc('no_te_create_task', { ...args, p_operation_key: randomUUID() })
    assert.notEqual(newKeySameTitle.data.task_id, created.task_id)
    for (const patch of [{ p_title: ' ' }, { p_description: '' }, { p_title: 'x'.repeat(201) }, { p_operation_key: '00000000-0000-0000-0000-000000000000' }]) {
      assert.equal((await rpc('no_te_create_task', { ...args, ...patch })).error.message, 'INVALID_TASK_INPUT')
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [bob])
    assert.equal((await rpc('no_te_create_task', args)).error.message, 'NOT_AUTHORIZED')
    assert.equal((await db.query('select * from no_te_connector.task_creations')).rows.length, 0)
    await db.exec('reset role; set role anon')
    assert.equal((await rpc('no_te_create_task', args)).error.code, '42501')
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice])
    // Late ledger failure must roll back the task inserted earlier in the RPC.
    await db.exec(`create function public.fixture_creation_failure() returns trigger language plpgsql as $$ begin
      if new.payload->>'title'='Rollback task' then raise exception 'Injected ledger failure'; end if; return new; end $$;
      create trigger fixture_creation_failure before insert on no_te_connector.task_creations for each row execute function public.fixture_creation_failure();`)
    await db.exec('set role authenticated')
    assert.match((await rpc('no_te_create_task', { ...args, p_title: 'Rollback task', p_operation_key: randomUUID() })).error.message, /Injected ledger failure/)
    assert.equal((await db.query('select count(*)::int as n from public.tasks')).rows[0].n, 2)
    await db.query('delete from public.tasks where id=$1', [created.task_id])
    assert.equal((await rpc('no_te_create_task', args)).error.message, 'CREATED_TASK_UNAVAILABLE')
    assert.equal((await db.query('select count(*)::int as n from public.tasks')).rows[0].n, 1)
  } finally { await db.close() }
})

test('isolated create → uncertain response → retry → read → failed completion → linked documentation → Done', {
  skip: migrations.some(sql => !sql) && 'Supply the private database-local migrations to run isolated SQL tests.',
}, async () => {
  const db = await isolatedDatabase()
  const client = sqlClient(db)
  const service = createService({ client, async ensure() { return { id: alice } } }, project)
  const server = createServer(service)
  const mcp = new Client({ name: 'workflow-test', version: '1.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const call = async (name, args) => {
    const response = await mcp.callTool({ name, arguments: args })
    return { ...JSON.parse(response.content[0].text), isError: response.isError }
  }
  try {
    await server.connect(a); await mcp.connect(b)
    const args = input()
    const realRpc = client.rpc
    let loseResponse = true
    client.rpc = async (name, parameters) => {
      const saved = await realRpc(name, parameters)
      if (loseResponse && name === 'no_te_create_task') {
        loseResponse = false
        throw new Error('Simulated network disconnect AFTER successful commit')
      }
      return saved
    }
    const uncertain = await call('create_task', args)
    assert.equal(uncertain.isError, true)
    assert.equal(uncertain.code, 'CREATION_UNCONFIRMED')
    assert.match(uncertain.message, /Do not claim the work is tracked/)
    const created = await call('create_task', args)
    assert.equal(created.isError, undefined)
    assert.equal(created.replayed, true)
    assert.equal((await db.query('select count(*)::int as n from public.tasks')).rows[0].n, 1)
    const read = await call('read_task', { projectId: project, taskId: created.task_id })
    assert.equal(read.task.description, description)
    assert.equal(read.task.status, 'todo')
    assert.equal(read.documentation.length, 0)
    const completion = { projectId: project, taskId: created.task_id, expectedRevision: created.updated_at, operationKey: randomUUID(), report }
    // Concurrent requirements change: reconciliation is necessary, not a blind revision replacement.
    await db.query("update public.tasks set description=description||' Updated criteria.' where id=$1", [created.task_id])
    const failed = await call('complete_task', completion)
    assert.equal(failed.isError, true)
    assert.equal(failed.code, 'REVISION_CONFLICT')
    assert.equal((await db.query('select status from public.tasks')).rows[0].status, 'todo')
    assert.equal((await db.query('select count(*)::int as n from public.task_notes')).rows[0].n, 0)
    const reviewed = await call('read_task', { projectId: project, taskId: created.task_id })
    assert.match(reviewed.task.description, /Updated criteria/)
    const done = await call('complete_task', { ...completion, expectedRevision: reviewed.task.updated_at })
    assert.equal(done.completionConfirmed, true)
    assert.equal(done.status, 'done')
    const documented = await call('read_task', { projectId: project, taskId: created.task_id })
    assert.equal(documented.documentation.length, 1)
    assert.equal(documented.documentation[0].content.type, 'doc')
    assert.match(JSON.stringify(documented.documentation[0].content), /Changes are uncommitted/)
    assert.equal((await db.query("select count(*)::int as n from public.notes where title='Independent guide'")).rows[0].n, 1)
    const replay = await call('create_task', args)
    assert.equal(replay.task_id, created.task_id)
    assert.equal(replay.status, 'done')
    assert.equal(replay.updated_at, documented.task.updated_at)
    assert.equal(replay.completed_at, done.completed_at)
  } finally { await mcp.close(); await server.close(); await db.close() }
})

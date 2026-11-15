import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const workflow = await readFile(new URL('../database-local/task-workflow.sql', import.meta.url), 'utf8').catch(() => null)
const migration = await readFile(new URL('../database-local/mcp-completion.sql', import.meta.url), 'utf8').catch(() => null)
const alice = '00000000-0000-0000-0000-000000000001'
const bob = '00000000-0000-0000-0000-000000000002'
const project = '10000000-0000-0000-0000-000000000001'
const foreign = '10000000-0000-0000-0000-000000000002'
const task = '20000000-0000-0000-0000-000000000001'
const second = '20000000-0000-0000-0000-000000000002'
const key = '30000000-0000-0000-0000-000000000001'
const report = {
  implementationComplete: true, verificationComplete: true,
  changes: ['Implemented requested changes.'], decisions: ['Existing components reused.'], files: ['src/App.jsx'],
  checks: [{ name: 'isolated check', result: 'passed', details: 'Fixture result, not a claim about external work.' }],
  limitations: [], commitSha: null,
}

test('isolated completion RPC: RLS, revisions, atomic documentation-first completion, retry safety and archive survival', {
  skip: (!workflow || !migration) && 'Local-only SQL is intentionally excluded from Git. Supply reviewed database-local migrations for the isolated integration test.',
}, async () => {
  const db = new PGlite()
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]
  const revision = async id => (await one('select updated_at::text as revision from public.tasks where id=$1', [id])).revision
  const complete = (id, rev, operation = key, content = report, scope = project) => db.query(
    'select public.no_te_complete_task($1,$2,$3,$4,$5::jsonb) as result', [scope, id, rev, operation, JSON.stringify(content)])
  try {
    await db.exec(`
      create schema auth;
      create role authenticated; create role anon;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon;
      create table public.projects(id uuid primary key,user_id uuid not null);
      create table public.tasks(id uuid primary key,project_id uuid references public.projects(id),title text not null,
        description text default '',status text not null default 'todo',implementation_notes text default '',
        created_at timestamptz default statement_timestamp(),updated_at timestamptz default statement_timestamp());
      create function public.fixture_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=statement_timestamp(); return new; end $$;
      create trigger fixture_updated_at before update on public.tasks for each row execute function public.fixture_updated_at();
      create table public.notes(id uuid primary key default gen_random_uuid(),user_id uuid not null,project_id uuid references public.projects,
        title text not null,content jsonb not null,created_at timestamptz default statement_timestamp(),updated_at timestamptz default statement_timestamp());
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
      insert into public.projects values('${project}','${alice}'),('${foreign}','${bob}');
      insert into public.tasks(id,project_id,title) values('${task}','${project}','Implement feature'),('${second}','${project}','Rollback fixture');
      insert into public.notes(user_id,project_id,title,content) values('${alice}','${project}','Independent guide','{"type":"doc","content":[]}');
      -- Assert documentation and relationship already exist when the task status changes.
      create function public.fixture_documentation_first() returns trigger language plpgsql as $$ begin
        if old.status='todo' and new.status='done' and not exists(select 1 from public.task_notes where task_id=new.id) then
          raise exception 'Documentation must precede Done'; end if; return new; end $$;
      create trigger fixture_documentation_first before update on public.tasks for each row execute function public.fixture_documentation_first();
    `)
    await db.exec(workflow)
    await db.exec(migration)
    await db.exec(migration) // Additive migration is repeatable without deleting records.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice])
    await db.exec('set role authenticated')
    const rev = await revision(task)
    await assert.rejects(complete(task, '2000-01-01'), /REVISION_CONFLICT/)
    await assert.rejects(complete(task, rev, key, { ...report, verificationComplete: false }), /INVALID_REPORT/)
    await assert.rejects(complete(task, rev, key, { ...report, files: ['../secret'] }), /INVALID_REPORT/)
    assert.equal((await one('select count(*)::int as n from public.notes')).n, 1)
    const result = (await complete(task, rev)).rows[0].result
    assert.equal(result.status, 'done')
    assert.equal(result.replayed, false)
    assert.equal(new Date(result.archives_at) - new Date(result.completed_at), 168 * 3600000)
    const saved = await one('select * from public.notes where id=$1', [result.note_id])
    assert.equal(saved.content.type, 'doc')
    assert.match(JSON.stringify(saved.content), /Changes are uncommitted/)
    assert.match(JSON.stringify(saved.content), /src\/App.jsx/)
    assert.deepEqual((await complete(task, rev)).rows[0].result, { ...result, replayed: true })
    await assert.rejects(complete(task, rev, key, { ...report, changes: ['Different content'] }), /IDEMPOTENCY_CONFLICT/)
    await assert.rejects(complete(second, await revision(second), key), /IDEMPOTENCY_CONFLICT/)
    assert.equal((await one('select count(*)::int as n from public.notes')).n, 2)
    await db.query("update public.tasks set title='Edited after completion' where id=$1", [task])
    assert.equal(String((await one('select completed_at from public.tasks where id=$1', [task])).completed_at), String(new Date(result.completed_at)))
    await db.query("update public.tasks set status='todo' where id=$1", [task])
    const replayAfterReopen = (await complete(task, rev)).rows[0].result
    assert.equal(replayAfterReopen.status, 'todo')
    assert.equal(replayAfterReopen.completed_at, null)
    const completedAgain = (await complete(task, await revision(task), '30000000-0000-0000-0000-000000000002')).rows[0].result
    assert.equal(completedAgain.status, 'done')
    assert.notEqual(completedAgain.note_id, result.note_id)

    // Force a late task write failure: the preceding note/link writes MUST roll back.
    await db.exec('reset role')
    await db.exec(`create function public.fixture_reject() returns trigger language plpgsql as $$ begin
      if new.id='${second}' and new.status='done' then raise exception 'Injected failure'; end if; return new; end $$;
      create trigger fixture_reject before update on public.tasks for each row execute function public.fixture_reject();`)
    await db.exec('set role authenticated')
    const count = (await one('select count(*)::int as n from public.notes')).n
    await assert.rejects(complete(second, await revision(second), '30000000-0000-0000-0000-000000000003'), /Injected failure/)
    assert.equal((await one('select count(*)::int as n from public.notes')).n, count)
    assert.equal((await one('select status from public.tasks where id=$1', [second])).status, 'todo')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [bob])
    await assert.rejects(complete(task, rev), /NOT_AUTHORIZED/)
    await assert.rejects(complete(task, rev, key, report, foreign), /NOT_AUTHORIZED/)
    assert.equal((await db.query('select * from no_te_connector.completions')).rows.length, 0)
    await db.exec('reset role; set role anon')
    await assert.rejects(complete(task, rev), /permission denied/)
    await db.exec('reset role')
    // Fixture-only server-time boundary, never executed against Supabase.
    await db.exec(`alter table public.tasks disable trigger no_te_task_completion;
      update public.tasks set completed_at=statement_timestamp()-interval '168 hours',archives_at=statement_timestamp() where id='${task}';
      alter table public.tasks enable trigger no_te_task_completion;`)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice])
    await db.exec('set role authenticated')
    assert.equal((await one('select is_archived from public.task_workflow where id=$1', [task])).is_archived, true)
    assert.equal((await one('select count(*)::int as n from public.task_notes where task_id=$1', [task])).n, 2)
    assert.equal((await one("select count(*)::int as n from public.notes where title='Independent guide'")).n, 1)
    assert.ok((await one('select content from public.notes where id=$1', [result.note_id])).content)
  } finally { await db.close() }
})

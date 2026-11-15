import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../database-local/task-workflow.sql', import.meta.url), 'utf8').catch(() => null)

test('isolated PostgreSQL: authoritative completion, grace, elapsed archive, RLS and non-destructive restoration', {
  skip: !migration && 'Local-only migration is intentionally excluded from Git; supply database-local/task-workflow.sql to run this integration test.',
}, async () => {
  const db = new PGlite()
  const alice = '00000000-0000-0000-0000-000000000001'
  const bob = '00000000-0000-0000-0000-000000000002'
  const project = '10000000-0000-0000-0000-000000000001'
  const foreign = '10000000-0000-0000-0000-000000000002'
  const task = '20000000-0000-0000-0000-000000000001'
  const legacy = '20000000-0000-0000-0000-000000000002'
  try {
    await db.exec(`
      create schema auth;
      create role authenticated; create role anon;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated, anon;
      create table public.projects(id uuid primary key, user_id uuid not null);
      create table public.tasks(id uuid primary key default gen_random_uuid(), project_id uuid references public.projects,
        title text not null, description text default '', status text not null default 'todo' check(status in ('todo','done')),
        implementation_notes text default '', created_at timestamptz default now(), updated_at timestamptz default now());
      create table public.notes(id uuid primary key default gen_random_uuid(), content jsonb);
      create table public.task_notes(task_id uuid references public.tasks, note_id uuid references public.notes, primary key(task_id,note_id));
      create table public.task_tags(task_id uuid references public.tasks, tag_id uuid, primary key(task_id,tag_id));
      alter table public.projects enable row level security;
      alter table public.tasks enable row level security;
      create policy own_projects on public.projects for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      create policy own_tasks on public.tasks for all to authenticated
        using(exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()))
        with check(exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()));
      grant select,insert,update,delete on public.projects,public.tasks to authenticated;
      insert into public.projects values ('${project}','${alice}'),('${foreign}','${bob}');
      insert into public.tasks(id,project_id,title,status,implementation_notes) values
        ('${task}','${project}','Task','todo','Keep implementation'),('${legacy}','${project}','Historical','done','Keep legacy');
      insert into public.notes(content) values ('{"type":"doc","content":[]}');
      insert into public.task_notes select '${task}', id from public.notes;
      insert into public.task_tags values ('${task}', gen_random_uuid());
    `)
    await db.exec(migration)
    const one = async (sql, values = []) => (await db.query(sql, values)).rows[0]
    const old = await one('select * from public.task_workflow where id=$1', [legacy])
    assert.equal(old.completed_at, null)
    assert.ok(old.archive_grace_started_at)
    assert.equal(new Date(old.archives_at) - new Date(old.archive_grace_started_at), 168 * 3600000)
    await db.exec(migration)
    assert.equal(String((await one('select archive_grace_started_at from public.tasks where id=$1', [legacy])).archive_grace_started_at), String(old.archive_grace_started_at))
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice])
    await db.exec('set role authenticated')
    await db.query("update public.tasks set status='done', completed_at='1900-01-01', archives_at='2100-01-01' where id=$1", [task])
    const done = await one('select * from public.task_workflow where id=$1', [task])
    assert.equal(done.is_archived, false)
    assert.equal(new Date(done.archives_at) - new Date(done.completed_at), 168 * 3600000)
    assert.ok(new Date(done.completed_at).getUTCFullYear() > 2000)
    await db.query("update public.tasks set title='Edited', completed_at='1900-01-01', archives_at='2100-01-01' where id=$1", [task])
    const edited = await one('select * from public.tasks where id=$1', [task])
    assert.equal(String(edited.completed_at), String(done.completed_at))
    assert.equal(String(edited.archives_at), String(done.archives_at))
    await assert.rejects(db.query("insert into public.tasks(project_id,title,status) values($1,'No','done')", [project]))
    await assert.rejects(db.query('update public.tasks set project_id=$1 where id=$2', [foreign, task]))
    await db.exec('reset role')
    // Fixture-only admin clock setup, on this isolated in-memory database.
    // Never run this fixture setup on Supabase.
    await db.exec(`alter table public.tasks disable trigger no_te_task_completion;
      update public.tasks set completed_at=statement_timestamp()-interval '168 hours'+interval '10 seconds',
        archives_at=statement_timestamp()+interval '10 seconds' where id='${task}';
      alter table public.tasks enable trigger no_te_task_completion;`)
    assert.equal((await one('select is_archived from public.task_workflow where id=$1', [task])).is_archived, false)
    const boundary = await db.exec(`alter table public.tasks disable trigger no_te_task_completion;
      update public.tasks set completed_at=statement_timestamp()-interval '168 hours', archives_at=statement_timestamp() where id='${task}';
      alter table public.tasks enable trigger no_te_task_completion;
      select is_archived from public.task_workflow where id='${task}';`)
    assert.equal(boundary.at(-1).rows[0].is_archived, true)
    assert.equal((await one('select count(*)::int as n from public.task_notes')).n, 1)
    assert.equal((await one('select count(*)::int as n from public.task_tags')).n, 1)
    assert.equal((await one('select implementation_notes from public.tasks where id=$1', [task])).implementation_notes, 'Keep implementation')
    await db.exec('set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [bob])
    assert.equal((await db.query('select * from public.task_workflow')).rows.length, 0)
    assert.equal((await db.query("update public.tasks set status='todo' where id=$1 returning id", [task])).rows.length, 0)
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice])
    await db.query("update public.tasks set status='todo' where id=$1", [task])
    const restored = await one('select * from public.task_workflow where id=$1', [task])
    assert.equal(restored.completed_at, null)
    assert.equal(restored.archives_at, null)
    assert.equal(restored.archive_grace_started_at, null)
    assert.equal(restored.is_archived, false)
    await db.query("update public.tasks set status='done' where id=$1", [task])
    const again = await one('select * from public.task_workflow where id=$1', [task])
    assert.ok(new Date(again.completed_at) >= new Date(done.completed_at))
    assert.equal(new Date(again.archives_at) - new Date(again.completed_at), 168 * 3600000)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select * from public.task_workflow'))
  } finally {
    await db.close()
  }
})

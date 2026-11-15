// A small RLS-shaped test double, not proof of the deployed database policies.
export function cloudSupabase() {
  let session = null
  let clock = 0
  const listeners = new Set()
  const db = {
    projects: [],
    tasks: [],
    notes: [],
    folders: [],
    tags: [],
    task_notes: [],
    task_tags: [],
    note_tags: [],
    calls: [],
    failure: null,
    pause: null,
    serverTime: null,
    workflowAvailable: true,
    emit(id, event, token) {
      session = id
        ? {
            access_token: token || `test-${id}`,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id, email: `${id}@example.com` },
          }
        : null
      for (const callback of listeners)
        callback(event || (id ? 'SIGNED_IN' : 'SIGNED_OUT'), session)
    },
    auth: {
      async getUser(token) {
        const id = token?.startsWith('test-') ? token.slice(5).split('#')[0] : null
        const user = id ? { id, email: `${id}@example.com` } : session?.user
        return { data: { user }, error: user ? null : { status: 401 } }
      },
      async getSession() {
        return { data: { session }, error: null }
      },
      onAuthStateChange(callback) {
        listeners.add(callback)
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }
      },
      async signOut() {
        db.emit(null)
        return { error: null }
      },
    },
    schema(schema) {
      if (schema !== 'public') throw new Error('Unexpected schema')
      return { from: (table) => query(table) }
    },
  }
  const timestamp = () => new Date(Date.now() + ++clock * 1000).toISOString()
  const featureStart = new Date().toISOString()
  const serverTime = () => db.serverTime ?? Date.now()
  function completion(row) {
    const completed_at = row.completed_at ?? null
    const archive_grace_started_at = row.status === 'done' ? row.archive_grace_started_at ?? (completed_at ? null : featureStart) : null
    const archives_at = row.status === 'done' ? row.archives_at ?? new Date(Date.parse(completed_at || archive_grace_started_at) + 168 * 3600000).toISOString() : null
    return { completed_at, archive_grace_started_at, archives_at }
  }
  function workflowRow(row) {
    const metadata = completion(row)
    return { ...row, ...metadata, is_archived: row.status === 'done' && Date.parse(metadata.archives_at) <= serverTime(), server_now: new Date(serverTime()).toISOString(), archive_seconds_remaining: row.status === 'done' ? Math.max(0, (Date.parse(metadata.archives_at) - serverTime()) / 1000) : null }
  }
  function query(table) {
    const workflow = table === 'task_workflow'
    if (workflow) table = 'tasks'
    const state = { table, op: 'select', filters: [], fields: '*', signal: null }
    const builder = {
      select(fields) {
        state.fields = fields
        return builder
      },
      insert(values) {
        state.op = 'insert'
        state.values = values
        return builder
      },
      upsert(values, options) {
        state.op = 'upsert'
        state.values = values
        state.conflict = options.onConflict
        return builder
      },
      update(values) {
        state.op = 'update'
        state.values = values
        return builder
      },
      delete() {
        state.op = 'delete'
        return builder
      },
      eq(field, value) {
        state.filters.push([field, value])
        return builder
      },
      is(field, value) {
        return builder.eq(field, value)
      },
      in(field, value) {
        state.filters.push([field, value])
        return builder
      },
      order() {
        return builder
      },
      limit(n) {
        state.limit = n
        return builder
      },
      range(start, end) {
        state.range = [start, end]
        return builder
      },
      single() {
        state.single = true
        return builder
      },
      maybeSingle() {
        state.single = true
        return builder
      },
      abortSignal(signal) {
        state.signal = signal
        return builder
      },
      setHeader(name, value) {
        if (name === 'Authorization') state.actor = value.slice('Bearer test-'.length).split('#')[0]
        return builder
      },
      then(resolve, reject) {
        return execute().then(resolve, reject)
      },
    }
    async function execute() {
      db.calls.push({ ...state })
      if (db.pause) await db.pause(state)
      if (state.response) return state.response
      if (!db.workflowAvailable && (workflow || (table === 'tasks' && state.fields.includes('completed_at')))) return { data: null, error: { code: 'PGRST205' } }
      const failure = db.failure?.(state)
      if (failure instanceof Error) throw failure
      if (failure) return { data: null, error: failure }
      const actor = state.actor ?? session?.user.id
      if (!actor) return { data: null, error: { status: 401 } }
      if (
        ![
          'projects',
          'tasks',
          'notes',
          'folders',
          'tags',
          'task_notes',
          'task_tags',
          'note_tags',
        ].includes(table)
      )
        throw new Error(`Unexpected relationship API: ${table}`)
      const owned = (name, id) =>
        name === 'tasks'
          ? db.tasks.some(
              (task) =>
                task.id === id &&
                db.projects.some(
                  (project) => project.id === task.project_id && project.user_id === actor,
                ),
            )
          : db[name].some((row) => row.id === id && row.user_id === actor)
      const owns = (row) =>
        ['projects', 'notes', 'folders', 'tags'].includes(table)
          ? row.user_id === actor
          : table === 'tasks'
            ? owned('projects', row.project_id)
            : table === 'task_notes'
              ? owned('tasks', row.task_id) && owned('notes', row.note_id)
              : table === 'task_tags'
                ? owned('tasks', row.task_id) && owned('tags', row.tag_id)
                : owned('notes', row.note_id) && owned('tags', row.tag_id)
      const matches = (row) =>
        owns(row) &&
        state.filters.every(([field, value]) =>
          Array.isArray(value) ? value.includes(row[field]) : row[field] === value,
        )
      let rows
      if (state.op === 'insert' || state.op === 'upsert') {
        const now = timestamp()
        const row = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...state.values }
        if (['projects', 'notes', 'folders', 'tags'].includes(table)) row.user_id ??= actor
        if (table === 'tasks') Object.assign(row, { completed_at: null, archive_grace_started_at: null, archives_at: null })
        if (!owns(row)) return { data: null, error: { code: '42501' } }
        if (state.op === 'upsert') {
          const keys = state.conflict.split(',')
          const existing = db[table].find((item) => keys.every((key) => item[key] === row[key]))
          if (existing) return { data: [], error: null }
        } else if (db[table].some((item) => item.id === row.id))
          return { data: null, error: { code: '23505' } }
        if (
          table === 'tags' &&
          db.tags.some((tag) => tag.user_id === row.user_id && tag.name === row.name)
        )
          return { data: null, error: { code: '23505' } }
        db[table].push(row)
        rows = [row]
      } else {
        rows = db[table].filter(matches)
        if (state.op === 'update')
          for (const row of rows) {
            const previous = table === 'tasks' ? completion(row) : null
            const oldStatus = row.status
            Object.assign(row, state.values, { updated_at: timestamp() })
            if (table === 'tasks') {
              if (row.status === 'todo') Object.assign(row, { completed_at: null, archive_grace_started_at: null, archives_at: null })
              else if (oldStatus === 'todo') Object.assign(row, { completed_at: new Date(serverTime()).toISOString(), archive_grace_started_at: null, archives_at: new Date(serverTime() + 168 * 3600000).toISOString() })
              else Object.assign(row, previous)
            }
          }
        if (state.op === 'delete') {
          db[table] = db[table].filter((row) => !rows.includes(row))
          if (table === 'projects')
            db.tasks = db.tasks.filter(
              (task) => !rows.some((project) => project.id === task.project_id),
            )
          if (table === 'projects') {
            for (const note of db.notes)
              if (rows.some((project) => project.id === note.project_id)) note.project_id = null
            for (const folder of db.folders)
              if (rows.some((project) => project.id === folder.project_id)) folder.project_id = null
          }
          if (table === 'folders')
            for (const note of db.notes)
              if (rows.some((folder) => folder.id === note.folder_id)) note.folder_id = null
          for (const relation of ['task_notes', 'task_tags', 'note_tags'])
            db[relation] = db[relation].filter(
              (row) =>
                (!row.task_id || db.tasks.some((task) => task.id === row.task_id)) &&
                (!row.note_id || db.notes.some((note) => note.id === row.note_id)) &&
                (!row.tag_id || db.tags.some((tag) => tag.id === row.tag_id)),
            )
        }
      }
      const count = rows.length
      if (state.limit) rows = rows.slice(0, state.limit)
      if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1)
      const data = rows.map((source) =>
        Object.fromEntries(state.fields.split(',').map((field) => [field, (workflow ? workflowRow(source) : table === 'tasks' ? { ...source, ...completion(source) } : source)[field]])),
      )
      return { data: structuredClone(state.single ? (data[0] ?? null) : data), error: null, count }
    }
    return builder
  }
  return db
}

// A small RLS-shaped test double, not proof of the deployed database policies.
export function cloudSupabase() {
  let session = null
  let clock = 0
  const listeners = new Set()
  const db = {
    projects: [],
    tasks: [],
    calls: [],
    failure: null,
    pause: null,
    emit(id) {
      session = id
        ? {
            access_token: `test-${id}`,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id, email: `${id}@example.com` },
          }
        : null
      for (const callback of listeners) callback(id ? 'SIGNED_IN' : 'SIGNED_OUT', session)
    },
    auth: {
      async getUser() {
        return { data: { user: session?.user }, error: session ? null : { status: 401 } }
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
  function query(table) {
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
      then(resolve, reject) {
        return execute().then(resolve, reject)
      },
    }
    async function execute() {
      db.calls.push({ ...state })
      if (db.pause) await db.pause(state)
      if (state.response) return state.response
      const failure = db.failure?.(state)
      if (failure instanceof Error) throw failure
      if (failure) return { data: null, error: failure }
      if (!session) return { data: null, error: { status: 401 } }
      if (!['projects', 'tasks'].includes(table))
        throw new Error(`Unexpected relationship API: ${table}`)
      const owns = (row) =>
        table === 'projects'
          ? row.user_id === session.user.id
          : db.projects.some(
              (project) => project.id === row.project_id && project.user_id === session.user.id,
            )
      const matches = (row) =>
        owns(row) &&
        state.filters.every(([field, value]) =>
          Array.isArray(value) ? value.includes(row[field]) : row[field] === value,
        )
      let rows
      if (state.op === 'insert') {
        const now = timestamp()
        const row = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...state.values }
        if (table === 'projects') row.user_id ??= session.user.id
        if (!owns(row)) return { data: null, error: { code: '42501' } }
        db[table].push(row)
        rows = [row]
      } else {
        rows = db[table].filter(matches)
        if (state.op === 'update')
          for (const row of rows) Object.assign(row, state.values, { updated_at: timestamp() })
        if (state.op === 'delete') {
          db[table] = db[table].filter((row) => !rows.includes(row))
          if (table === 'projects')
            db.tasks = db.tasks.filter(
              (task) => !rows.some((project) => project.id === task.project_id),
            )
        }
      }
      const count = rows.length
      if (state.limit) rows = rows.slice(0, state.limit)
      if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1)
      const data = rows.map((row) =>
        Object.fromEntries(state.fields.split(',').map((field) => [field, row[field]])),
      )
      return { data: structuredClone(state.single ? (data[0] ?? null) : data), error: null, count }
    }
    return builder
  }
  return db
}

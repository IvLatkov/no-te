export class ConnectorError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function fail(code, message) {
  throw new ConnectorError(code, message)
}

export function safeError(error) {
  return error instanceof ConnectorError
    ? { code: error.code, message: error.message }
    : { code: 'REQUEST_FAILED', message: 'Request failed. Check connectivity and retry. No completion is confirmed; reuse the same operation key and content after a timeout.' }
}

export function checkDatabase(error) {
  if (!error) return
  if (['PGRST301', 'PGRST302', 'PGRST303'].includes(error.code)) {
    fail('LOGIN_REQUIRED', 'Database authentication expired or was rejected. Retry to refresh the session; sign in interactively again if it remains unavailable.')
  }
  if (['PGRST202', '42P01', '42703', '42883'].includes(error.code)) {
    fail('MIGRATION_REQUIRED', 'The connector completion migration or task workflow schema is missing. Ask the database owner to review the local migration; do not complete the task manually as a workaround.')
  }
  const messages = {
    REVISION_CONFLICT: 'Task changed. Read it again and review changes before starting a new completion operation.',
    IDEMPOTENCY_CONFLICT: 'Operation key was already used with different content. Do not retry it with modified arguments.',
    TASK_NOT_TODO: 'Task is no longer To Do. Read its current state before proceeding.',
    INVALID_REPORT: 'Completion requires a complete report and successful verification.',
    NOT_AUTHORIZED: 'Task or project is unavailable to this authenticated owner.',
  }
  if (messages[error.message]) fail(error.message, messages[error.message])
  if (error.code === '42501') fail('NOT_AUTHORIZED', messages.NOT_AUTHORIZED)
  fail('DATABASE_FAILED', 'Database request failed. No completion is confirmed. For an uncertain response, retry the exact operation key and content.')
}

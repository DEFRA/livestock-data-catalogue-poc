// The ECS version the fields follow, as CDP's logging guide asks
const ECS_VERSION = '8.11.0'

// CDP adds a random request ID to every request. Anything else in the
// header isn't logged.
const REQUEST_ID = /^[\w-]{1,100}$/

function requestFields(req) {
  const requestId = req?.get('x-cdp-request-id')
  return typeof requestId === 'string' && REQUEST_ID.test(requestId)
    ? { http: { request: { headers: { 'x-cdp-request-id': requestId } } } }
    : {}
}

// Writes one line of ECS JSON to stdout, where CDP collects it. JSON keeps
// every message on one line. Callers pass fixed text and codes only: never
// a password, a cookie, form data or personal data.
export function logEvent({ level, message, req, ...fields }) {
  console.log(
    JSON.stringify({
      '@timestamp': new Date().toISOString(),
      'log.level': level,
      message,
      'ecs.version': ECS_VERSION,
      ...fields,
      ...requestFields(req)
    })
  )
}

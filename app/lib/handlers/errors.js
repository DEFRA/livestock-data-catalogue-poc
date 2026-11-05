import { logEvent } from '../log.js'

export function pageNotFound(req, res) {
  res.status(404).render('page-not-found')
}

function isClientError(error) {
  return error.status >= 400 && error.status < 500
}

// One page for every unexpected error, with no details for the user.
// The log line has the error message only: never request data, which
// could hold personal data, and no control characters, which could forge
// or colour log lines.
export function problemWithTheService(error, req, res, next) {
  if (res.headersSent) {
    next(error)
    return
  }
  if (isClientError(error)) {
    pageNotFound(req, res)
    return
  }
  logEvent({
    level: 'error',
    message: 'Unexpected error',
    error: {
      message: String(error.message).replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    },
    req
  })
  res.status(500).render('problem-with-the-service')
}

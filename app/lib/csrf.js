import { randomBytes, timingSafeEqual } from 'node:crypto'

import { logEvent } from './log.js'

export const CSRF_FIELD = 'csrfToken'

export function newCsrfToken() {
  return randomBytes(32).toString('base64url')
}

function sameText(first, second) {
  const firstBuffer = Buffer.from(first)
  const secondBuffer = Buffer.from(second)
  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  )
}

// Browsers say where a request came from in Sec-Fetch-Site. A form post
// must come from the prototype's own pages. A browser that doesn't send
// the header is checked by the token alone.
function isFromThisSite(req) {
  const site = req.get('sec-fetch-site')
  return site === undefined || site === 'same-origin'
}

function hasValidToken(req, expectedToken) {
  const token = req.body?.[CSRF_FIELD]
  return (
    typeof expectedToken === 'string' &&
    typeof token === 'string' &&
    sameText(token, expectedToken)
  )
}

// Every form that changes something carries a token from this browser's
// session (the synchroniser token pattern), so another site can't post it
export function requireValidForm(expectedTokenOf) {
  return function checkForm(req, res, next) {
    if (isFromThisSite(req) && hasValidToken(req, expectedTokenOf(req))) {
      next()
      return
    }
    logEvent({
      level: 'warn',
      message: 'Form refused: it did not come from this prototype',
      event: { category: ['web'], type: ['denied'], outcome: 'failure' },
      req
    })
    res.status(403).render('problem-with-the-service')
  }
}

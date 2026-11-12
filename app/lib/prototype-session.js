import { randomBytes } from 'node:crypto'

// Each browser's changes are kept in memory on the server for research
// sessions, never in the data files. The Kit's own session can't be used:
// on CDP its cookie can't be marked Secure, because the platform's proxy
// isn't trusted (USE_HTTPS=false in the Dockerfile).
const COOKIE_NAME = 'prototype-session'

// Changes last 4 hours after the last change, then they're deleted
export const SESSION_LIFETIME = 4 * 60 * 60 * 1000

// A limit on memory: when it's reached, the session changed longest ago
// is deleted
const MOST_SESSIONS = 500

// 32 random bytes in base64url, so a session ID can't be guessed
const SESSION_ID = /^[\w-]{43}$/

function isProduction(environment) {
  return environment.NODE_ENV?.toLowerCase() === 'production'
}

export function createPrototypeSessions({
  clock = Date.now,
  environment = process.env
} = {}) {
  const sessions = new Map()
  const cookieOptions = Object.freeze({
    httpOnly: true,
    // Browsers only accept Secure cookies over https, which the prototype
    // only has on CDP
    secure: isProduction(environment),
    sameSite: 'lax',
    path: '/'
  })

  function removeExpired(now) {
    for (const [id, session] of sessions) {
      if (now - session.changedAt >= SESSION_LIFETIME) {
        sessions.delete(id)
      }
    }
  }

  function read(req) {
    const id = req.cookies?.[COOKIE_NAME]
    if (typeof id !== 'string' || !SESSION_ID.test(id)) {
      return undefined
    }
    const session = sessions.get(id)
    if (
      session === undefined ||
      clock() - session.changedAt >= SESSION_LIFETIME
    ) {
      sessions.delete(id)
      return undefined
    }
    return { id, data: structuredClone(session.data) }
  }

  function write(res, current, data) {
    const now = clock()
    removeExpired(now)
    const id = current?.id ?? randomBytes(32).toString('base64url')
    sessions.delete(id)
    if (sessions.size >= MOST_SESSIONS) {
      sessions.delete(sessions.keys().next().value)
    }
    sessions.set(id, { data: structuredClone(data), changedAt: now })
    res.cookie(COOKIE_NAME, id, { ...cookieOptions, maxAge: SESSION_LIFETIME })
    return { id, data: structuredClone(data) }
  }

  // Gives each request req.prototypeSession, with the data saved for this
  // browser (or undefined) and a save function
  function middleware(req, res, next) {
    let current = read(req)
    req.prototypeSession = {
      get data() {
        return current?.data
      },
      save(data) {
        current = write(res, current, data)
      }
    }
    next()
  }

  return { middleware, cookieName: COOKIE_NAME }
}

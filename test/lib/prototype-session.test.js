import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  SESSION_LIFETIME,
  createPrototypeSessions
} from '../../app/lib/prototype-session.js'

// A request and response with just what the middleware uses
function exchange(sessions, cookieValue) {
  const req = { cookies: { [sessions.cookieName]: cookieValue } }
  const cookies = []
  const res = {
    cookie: (name, value, options) => cookies.push({ name, value, options })
  }
  sessions.middleware(req, res, () => {})
  return { session: req.prototypeSession, cookies }
}

function sessionsAt(time, environment = { NODE_ENV: 'test' }) {
  return createPrototypeSessions({ clock: () => time.now, environment })
}

describe('the prototype session', () => {
  test('has no data until something is saved', () => {
    const sessions = sessionsAt({ now: 0 })
    const { session, cookies } = exchange(sessions, undefined)

    assert.equal(session.data, undefined)
    assert.deepEqual(cookies, [])
  })

  test('saves data under a new random ID in an httpOnly, SameSite Lax cookie that lasts 4 hours', () => {
    const sessions = sessionsAt({ now: 0 })
    const { session, cookies } = exchange(sessions, undefined)
    session.save({ personaId: 'data-steward' })

    assert.equal(cookies.length, 1)
    const [cookie] = cookies
    assert.equal(cookie.name, 'prototype-session')
    assert.match(cookie.value, /^[\w-]{43}$/)
    assert.deepEqual(cookie.options, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_LIFETIME
    })
    assert.equal(SESSION_LIFETIME, 4 * 60 * 60 * 1000)
    assert.deepEqual(exchange(sessions, cookie.value).session.data, {
      personaId: 'data-steward'
    })
  })

  test('marks the cookie Secure in production, where CDP serves the prototype over https', () => {
    const sessions = sessionsAt({ now: 0 }, { NODE_ENV: 'production' })
    const { session, cookies } = exchange(sessions, undefined)
    session.save({})

    assert.equal(cookies[0].options.secure, true)
  })

  test('gives each browser its own data', () => {
    const sessions = sessionsAt({ now: 0 })
    const first = exchange(sessions, undefined)
    first.session.save({ personaId: 'data-steward' })
    const second = exchange(sessions, undefined)
    second.session.save({ personaId: 'catalogue-administrator' })

    assert.notEqual(first.cookies[0].value, second.cookies[0].value)
    assert.deepEqual(exchange(sessions, first.cookies[0].value).session.data, {
      personaId: 'data-steward'
    })
  })

  test('keeps the same ID when data is saved again', () => {
    const sessions = sessionsAt({ now: 0 })
    const first = exchange(sessions, undefined)
    first.session.save({ count: 1 })
    const second = exchange(sessions, first.cookies[0].value)
    second.session.save({ count: 2 })

    assert.equal(second.cookies[0].value, first.cookies[0].value)
    assert.deepEqual(second.session.data, { count: 2 })
  })

  test('only changes saved data when it is saved, not when a copy is changed', () => {
    const sessions = sessionsAt({ now: 0 })
    const first = exchange(sessions, undefined)
    const data = { list: ['a'] }
    first.session.save(data)
    data.list.push('b')
    const read = exchange(sessions, first.cookies[0].value).session.data
    read.list.push('c')

    assert.deepEqual(exchange(sessions, first.cookies[0].value).session.data, {
      list: ['a']
    })
  })

  test('deletes the data 4 hours after the last change', () => {
    const time = { now: 0 }
    const sessions = sessionsAt(time)
    const { session, cookies } = exchange(sessions, undefined)
    session.save({ kept: true })

    time.now = SESSION_LIFETIME - 1
    assert.deepEqual(exchange(sessions, cookies[0].value).session.data, {
      kept: true
    })
    time.now = SESSION_LIFETIME
    assert.equal(exchange(sessions, cookies[0].value).session.data, undefined)
  })

  test('starts a new session, not the old ID, when data is saved after it has expired', () => {
    const time = { now: 0 }
    const sessions = sessionsAt(time)
    const first = exchange(sessions, undefined)
    first.session.save({})
    time.now = SESSION_LIFETIME
    const later = exchange(sessions, first.cookies[0].value)
    later.session.save({})

    assert.notEqual(later.cookies[0].value, first.cookies[0].value)
  })

  test('ignores a cookie that is not a session ID, or that the prototype did not issue', () => {
    const sessions = sessionsAt({ now: 0 })

    for (const value of [
      'short',
      'a'.repeat(44),
      `${'a'.repeat(42)}!`,
      ['x']
    ]) {
      assert.equal(exchange(sessions, value).session.data, undefined)
    }
    assert.equal(exchange(sessions, 'a'.repeat(43)).session.data, undefined)
  })

  test('keeps at most 500 sessions, deleting the one changed longest ago', () => {
    const time = { now: 0 }
    const sessions = sessionsAt(time)
    const ids = []
    for (let count = 0; count < 501; count += 1) {
      time.now += 1
      const { session, cookies } = exchange(sessions, undefined)
      session.save({ count })
      ids.push(cookies[0].value)
    }

    assert.equal(exchange(sessions, ids[0]).session.data, undefined)
    assert.deepEqual(exchange(sessions, ids[1]).session.data, { count: 1 })
    assert.deepEqual(exchange(sessions, ids[500]).session.data, { count: 500 })
  })

  test('when full, deletes a session nobody has changed before one somebody has', () => {
    const time = { now: 0 }
    const sessions = sessionsAt(time)
    const real = exchange(sessions, undefined)
    real.session.save({ real: true })
    for (let count = 0; count < 600; count += 1) {
      time.now += 1
      exchange(sessions, undefined).session.save({}, { isDisposable: true })
    }

    assert.deepEqual(exchange(sessions, real.cookies[0].value).session.data, {
      real: true
    })
  })

  test('renewing keeps the data under a new ID, and the old ID stops working', () => {
    const sessions = sessionsAt({ now: 0 })
    const first = exchange(sessions, undefined)
    first.session.save({ personaId: 'catalogue-user' })
    const later = exchange(sessions, first.cookies[0].value)
    later.session.renew({ personaId: 'data-steward' })

    assert.notEqual(later.cookies[0].value, first.cookies[0].value)
    assert.deepEqual(exchange(sessions, later.cookies[0].value).session.data, {
      personaId: 'data-steward'
    })
    assert.equal(
      exchange(sessions, first.cookies[0].value).session.data,
      undefined
    )
  })

  test('ending deletes the data and clears the cookie', () => {
    const sessions = sessionsAt({ now: 0 })
    const first = exchange(sessions, undefined)
    first.session.save({ personaId: 'data-steward' })
    const req = { cookies: { [sessions.cookieName]: first.cookies[0].value } }
    const cleared = []
    const res = { clearCookie: (name) => cleared.push(name) }
    sessions.middleware(req, res, () => {})
    req.prototypeSession.end()

    assert.equal(req.prototypeSession.data, undefined)
    assert.deepEqual(cleared, ['prototype-session'])
    assert.equal(
      exchange(sessions, first.cookies[0].value).session.data,
      undefined
    )
  })

  test('removes expired sessions when another is saved', () => {
    const time = { now: 0 }
    const sessions = sessionsAt(time)
    const old = exchange(sessions, undefined)
    old.session.save({})
    time.now = SESSION_LIFETIME + 1
    exchange(sessions, undefined).session.save({})
    time.now = 0

    assert.equal(
      exchange(sessions, old.cookies[0].value).session.data,
      undefined
    )
  })
})

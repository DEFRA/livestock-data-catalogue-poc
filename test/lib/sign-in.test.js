import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'

import {
  createSignIn,
  isSignInRequired,
  passwordsFrom,
  safeReturnUrl
} from '../../app/lib/sign-in.js'

const PASSWORD = 'made-up-test-password'
const ON_CDP = { NODE_ENV: 'production', PASSWORD }
const COOKIE = 'prototype-sign-in'
const EIGHT_HOURS = 8 * 60 * 60 * 1000
const SIGNED_COOKIE = /^\d+\.[\w-]{22}\.[\w-]{43}$/

// The cookie the Prototype Kit's own password page sets
function kitCookieFor(password) {
  return createHash('sha256').update(password).digest('hex')
}

// Signs in as a browser would, and returns the cookie the prototype sets
function cookieFrom(signIn, password = PASSWORD) {
  const response = fakeResponse()
  signIn(
    fakeRequest({ path: '/sign-in', method: 'POST', body: { password } }),
    response
  )
  return response.cookieSet.value
}

function fakeRequest({
  path = '/data-assets',
  method = 'GET',
  query = {},
  body,
  cookies = {},
  headers = {},
  ip = '203.0.113.10'
} = {}) {
  return {
    path,
    originalUrl: path,
    method,
    query,
    body,
    cookies,
    ip,
    get: (name) => headers[name.toLowerCase()]
  }
}

// The ECS JSON lines the prototype has logged
function logged() {
  return console.log.mock.calls.map((call) => JSON.parse(call.arguments[0]))
}

function fakeResponse() {
  const response = {
    locals: {},
    statusCode: 200,
    status(code) {
      response.statusCode = code
      return response
    },
    redirect(...args) {
      response.redirected = args
    },
    render(view, locals) {
      response.rendered = { view, locals }
    },
    cookie(name, value, options) {
      response.cookieSet = { name, value, options }
    },
    clearCookie(name, options) {
      response.cookieCleared = { name, options }
    }
  }
  return response
}

describe('the passwords for the prototype', () => {
  test('come from PASSWORD and the variables listed in PASSWORD_KEYS, as in the Prototype Kit', () => {
    assert.deepEqual(
      passwordsFrom({
        PASSWORD: 'main',
        PASSWORD_KEYS: 'PASSWORD_01, PASSWORD_02',
        PASSWORD_01: 'research-1',
        PASSWORD_02: 'research-2'
      }),
      ['research-1', 'research-2', 'main']
    )
  })

  test('leave out keys that are not variable names, and variables that are empty or missing', () => {
    assert.deepEqual(
      passwordsFrom({
        PASSWORD_KEYS: '1BAD,PASSWORD_01,,PASSWORD_02',
        PASSWORD_01: '',
        PASSWORD_02: 'research-2'
      }),
      ['research-2']
    )
  })

  test('are none when nothing is set', () => {
    assert.deepEqual(passwordsFrom({}), [])
  })
})

describe('when sign-in is needed', () => {
  test('on CDP, where NODE_ENV is production', () => {
    assert.equal(isSignInRequired({ NODE_ENV: 'production' }), true)
    assert.equal(isSignInRequired({ NODE_ENV: 'PRODUCTION' }), true)
  })

  test('not when USE_AUTH is false, as CDP documents', () => {
    assert.equal(
      isSignInRequired({ NODE_ENV: 'production', USE_AUTH: 'false' }),
      false
    )
    assert.equal(
      isSignInRequired({ NODE_ENV: 'production', USE_AUTH: 'FALSE' }),
      false
    )
  })

  test('for any other USE_AUTH value, so a mistyped value keeps the password', () => {
    assert.equal(
      isSignInRequired({ NODE_ENV: 'production', USE_AUTH: 'no' }),
      true
    )
  })

  test('not on a developer machine or in the tests', () => {
    assert.equal(isSignInRequired({}), false)
    assert.equal(isSignInRequired({ NODE_ENV: 'development' }), false)
    assert.equal(isSignInRequired({ NODE_ENV: 'test' }), false)
  })
})

describe('the address to return to after signing in', () => {
  test('keeps a catalogue page, with its query', () => {
    assert.equal(safeReturnUrl('/'), '/')
    assert.equal(
      safeReturnUrl('/data-assets?q=cattle&page=2'),
      '/data-assets?q=cattle&page=2'
    )
    assert.equal(safeReturnUrl('/data-assets/DA11111'), '/data-assets/DA11111')
  })

  for (const address of [
    'https://example.com/',
    '//example.com/',
    '/\\example.com/',
    '/\t/example.com/',
    '/.//example.com/',
    '/%2e//example.com/',
    '/data-assets/..//example.com/',
    '/./\\example.com/',
    'javascript:alert(1)',
    'data-assets',
    ''
  ]) {
    test(`never leaves the prototype: ${JSON.stringify(address)}`, () => {
      assert.equal(safeReturnUrl(address), '/')
    })
  }

  test('is the home page for any page that is not a catalogue page', () => {
    for (const address of [
      '/cookies',
      '/no-such-page',
      '/data-assets/',
      '/data-assets/not-an-identifier',
      '/data-assets/DA11111/more',
      '/manage-prototype'
    ]) {
      assert.equal(safeReturnUrl(address), '/', address)
    }
  })

  test('gives the same address when given its own answer', () => {
    for (const address of [
      '/data-assets?q=cattle',
      '/data-assets/DA11111',
      '/.//example.com/',
      '/data-assets/./DA11111'
    ]) {
      const answer = safeReturnUrl(address)

      assert.equal(safeReturnUrl(answer), answer, address)
    }
  })

  test('is the home page for a value that is not text', () => {
    assert.equal(safeReturnUrl(['/data-assets', '//example.com']), '/')
    assert.equal(safeReturnUrl(undefined), '/')
  })

  test('never goes back to signing in or out', () => {
    for (const address of ['/sign-in', '/sign-in?returnUrl=/', '/sign-out']) {
      assert.equal(safeReturnUrl(address), '/', address)
    }
  })

  test('is the home page for an address too long to be a real page', () => {
    assert.equal(safeReturnUrl(`/data-assets?q=${'a'.repeat(2000)}`), '/')
  })
})

describe('the sign-in check', () => {
  beforeEach(() => {
    mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('lets every request through when sign-in is not needed', () => {
    const { requireSignIn } = createSignIn({ environment: {} })
    const next = mock.fn()

    requireSignIn(fakeRequest(), fakeResponse(), next)

    assert.equal(next.mock.callCount(), 1)
  })

  test('sends someone who has not signed in to the sign-in page, then back to the page they wanted', () => {
    const { requireSignIn } = createSignIn({ environment: ON_CDP })
    const request = fakeRequest({ path: '/data-assets/DA11111' })
    request.originalUrl = '/data-assets/DA11111?from=home'
    const response = fakeResponse()

    requireSignIn(request, response, mock.fn())

    assert.deepEqual(response.redirected, [
      '/sign-in?returnUrl=%2Fdata-assets%2FDA11111%3Ffrom%3Dhome'
    ])
  })

  test('sends someone to the sign-in page with no return address when they wanted the home page', () => {
    const { requireSignIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    requireSignIn(fakeRequest({ path: '/' }), response, mock.fn())

    assert.deepEqual(response.redirected, ['/sign-in'])
  })

  test('does not return to a form someone posted before signing in', () => {
    const { requireSignIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    requireSignIn(
      fakeRequest({ path: '/data-assets', method: 'POST' }),
      response,
      mock.fn()
    )

    assert.deepEqual(response.redirected, ['/sign-in'])
  })

  test('lets someone who has signed in through, and says they have', () => {
    const { requireSignIn, signIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()
    const next = mock.fn()

    requireSignIn(
      fakeRequest({ cookies: { [COOKIE]: cookieFrom(signIn) } }),
      response,
      next
    )

    assert.equal(next.mock.callCount(), 1)
    assert.equal(response.locals.signedIn, true)
  })

  test('accepts a cookie from another copy of the prototype with the same passwords', () => {
    const first = createSignIn({ environment: ON_CDP })
    const second = createSignIn({ environment: ON_CDP })
    const next = mock.fn()

    second.requireSignIn(
      fakeRequest({ cookies: { [COOKIE]: cookieFrom(first.signIn) } }),
      fakeResponse(),
      next
    )

    assert.equal(next.mock.callCount(), 1)
  })

  test('does not accept a cookie for a password that is no longer set', () => {
    const before = createSignIn({
      environment: { ...ON_CDP, PASSWORD: 'made-up-old-password' }
    })
    const { requireSignIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()
    const next = mock.fn()

    requireSignIn(
      fakeRequest({
        cookies: { [COOKIE]: cookieFrom(before.signIn, 'made-up-old-password') }
      }),
      response,
      next
    )

    assert.equal(next.mock.callCount(), 0)
    assert.deepEqual(response.redirected, ['/sign-in?returnUrl=%2Fdata-assets'])
  })

  test('stops accepting a cookie after 8 hours, because the server checks its time', () => {
    let now = Date.parse('2026-11-05T09:00:00Z')
    const { requireSignIn, signIn } = createSignIn({
      environment: ON_CDP,
      clock: () => now
    })
    const request = fakeRequest({ cookies: { [COOKIE]: cookieFrom(signIn) } })
    const next = mock.fn()

    now += EIGHT_HOURS - 1
    requireSignIn(request, fakeResponse(), next)
    now += 1
    requireSignIn(request, fakeResponse(), next)

    assert.equal(next.mock.callCount(), 1)
  })

  test('accepts a cookie from a copy whose clock is up to a minute ahead, and no more', () => {
    const signedInAt = Date.parse('2026-11-05T09:00:00Z')
    let now = signedInAt
    const { requireSignIn, signIn } = createSignIn({
      environment: ON_CDP,
      clock: () => now
    })
    const request = fakeRequest({ cookies: { [COOKIE]: cookieFrom(signIn) } })
    const next = mock.fn()

    now = signedInAt - 60 * 1000
    requireSignIn(request, fakeResponse(), next)
    now = signedInAt - 60 * 1000 - 1
    requireSignIn(request, fakeResponse(), next)

    assert.equal(next.mock.callCount(), 1)
  })

  test('does not accept a cookie that has been changed', () => {
    const { requireSignIn, signIn } = createSignIn({ environment: ON_CDP })
    const cookie = cookieFrom(signIn)
    const [issuedAt, nonce, signature] = cookie.split('.')
    const changeFirst = (text) => (text[0] === 'A' ? 'B' : 'A') + text.slice(1)
    const next = mock.fn()

    for (const changed of [
      `${Number(issuedAt) + 1}.${nonce}.${signature}`,
      `${issuedAt}.${changeFirst(nonce)}.${signature}`,
      `${issuedAt}.${nonce}.${changeFirst(signature)}`,
      `${cookie}.more`,
      ''
    ]) {
      requireSignIn(
        fakeRequest({ cookies: { [COOKIE]: changed } }),
        fakeResponse(),
        next
      )
    }

    assert.equal(next.mock.callCount(), 0)
  })

  test("does not accept the Kit's own cookie, so the Kit's password page can't sign anyone in", () => {
    const { requireSignIn } = createSignIn({ environment: ON_CDP })
    const next = mock.fn()

    requireSignIn(
      fakeRequest({ cookies: { authentication: kitCookieFor(PASSWORD) } }),
      fakeResponse(),
      next
    )

    assert.equal(next.mock.callCount(), 0)
  })

  test('does not accept the password itself as the cookie', () => {
    const { requireSignIn } = createSignIn({ environment: ON_CDP })
    const next = mock.fn()

    requireSignIn(
      fakeRequest({ cookies: { [COOKIE]: PASSWORD } }),
      fakeResponse(),
      next
    )

    assert.equal(next.mock.callCount(), 0)
  })

  for (const path of [
    '/sign-in',
    '/signed-out',
    '/accessibility-statement',
    '/cookies',
    '/privacy',
    '/report-a-problem'
  ]) {
    test(`lets anyone open ${path}`, () => {
      const { requireSignIn } = createSignIn({ environment: ON_CDP })
      const response = fakeResponse()
      const next = mock.fn()

      requireSignIn(fakeRequest({ path }), response, next)

      assert.equal(next.mock.callCount(), 1)
      assert.equal(response.locals.signedIn, false)
    })
  }

  test('lets nobody in, and says what is wrong once in the logs, when no password is set', () => {
    const { requireSignIn } = createSignIn({
      environment: { NODE_ENV: 'production' }
    })
    const next = mock.fn()
    const responses = [fakeResponse(), fakeResponse()]

    for (const response of responses) {
      requireSignIn(fakeRequest({ path: '/cookies' }), response, next)
    }

    assert.equal(next.mock.callCount(), 0)
    for (const response of responses) {
      assert.equal(response.statusCode, 500)
      assert.equal(response.rendered.view, 'problem-with-the-service')
    }
    assert.deepEqual(
      logged().map((entry) => [entry['log.level'], entry.message, entry.event]),
      [
        [
          'error',
          'The prototype has no password of 16 characters or more, so nobody can sign in. Set the PASSWORD secret in the CDP Portal.',
          { category: ['configuration'], outcome: 'failure' }
        ]
      ]
    )
  })
})

describe('signing in', () => {
  beforeEach(() => {
    mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('sets a signed cookie for 8 hours, holding neither the password nor its hash, and returns to the page', () => {
    const { signIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    signIn(
      fakeRequest({
        path: '/sign-in',
        method: 'POST',
        body: { password: PASSWORD, returnUrl: '/data-assets?q=cattle' }
      }),
      response
    )

    assert.equal(response.cookieSet.name, COOKIE)
    assert.match(response.cookieSet.value, SIGNED_COOKIE)
    assert.ok(!response.cookieSet.value.includes(PASSWORD))
    assert.ok(!response.cookieSet.value.includes(kitCookieFor(PASSWORD)))
    assert.deepEqual(response.cookieSet.options, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: EIGHT_HOURS
    })
    assert.deepEqual(response.redirected, [303, '/data-assets?q=cattle'])
  })

  test('gives every sign-in a different cookie', () => {
    const { signIn } = createSignIn({ environment: ON_CDP })

    assert.notEqual(cookieFrom(signIn), cookieFrom(signIn))
  })

  test('accepts a research password listed in PASSWORD_KEYS', () => {
    const { signIn } = createSignIn({
      environment: {
        ...ON_CDP,
        PASSWORD_KEYS: 'PASSWORD_01',
        PASSWORD_01: 'made-up-research-password'
      }
    })
    const response = fakeResponse()

    signIn(
      fakeRequest({
        path: '/sign-in',
        method: 'POST',
        body: { password: 'made-up-research-password' }
      }),
      response
    )

    assert.match(response.cookieSet.value, SIGNED_COOKIE)
    assert.deepEqual(response.redirected, [303, '/'])
  })

  test('asks for the password when it is empty, and signs nobody in', () => {
    const { signIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    signIn(
      fakeRequest({ path: '/sign-in', method: 'POST', body: { password: '' } }),
      response
    )

    assert.equal(response.cookieSet, undefined)
    assert.equal(response.rendered.view, 'sign-in')
    assert.equal(response.rendered.locals.errorMessage, 'Enter the password')
  })

  test('asks for the correct password, logs it without the password, and signs nobody in', () => {
    const { signIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    signIn(
      fakeRequest({
        path: '/sign-in',
        method: 'POST',
        body: { password: 'a-wrong-password', returnUrl: '/data-assets' }
      }),
      response
    )

    assert.equal(response.cookieSet, undefined)
    assert.equal(
      response.rendered.locals.errorMessage,
      'Enter the correct password'
    )
    assert.equal(response.rendered.locals.returnUrl, '/data-assets')
    assert.deepEqual(
      logged().map((entry) => [entry['log.level'], entry.message, entry.event]),
      [
        [
          'warn',
          'Sign-in failed: the password was not correct',
          {
            category: ['authentication'],
            type: ['start'],
            action: 'sign-in',
            outcome: 'failure',
            reason: 'wrong password'
          }
        ]
      ]
    )
    assert.ok(
      !console.log.mock.calls[0].arguments[0].includes('a-wrong-password')
    )
  })

  test('logs a sign-in that works, with the request ID and without the password or cookie', () => {
    const { signIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    signIn(
      fakeRequest({
        path: '/sign-in',
        method: 'POST',
        body: { password: PASSWORD },
        headers: { 'x-cdp-request-id': 'made-up-request-id' }
      }),
      response
    )

    const [entry] = logged()
    const [line] = console.log.mock.calls[0].arguments
    assert.equal(entry['log.level'], 'info')
    assert.equal(entry.message, 'Signed in')
    assert.deepEqual(entry.event, {
      category: ['authentication'],
      type: ['start'],
      action: 'sign-in',
      outcome: 'success'
    })
    assert.equal(
      entry.http.request.headers['x-cdp-request-id'],
      'made-up-request-id'
    )
    assert.ok(!line.includes(PASSWORD))
    assert.ok(!line.includes(response.cookieSet.value))
  })

  test('treats a password that is not text as empty', () => {
    const { signIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    signIn(
      fakeRequest({
        path: '/sign-in',
        method: 'POST',
        body: { password: [PASSWORD] }
      }),
      response
    )

    assert.equal(response.cookieSet, undefined)
    assert.equal(response.rendered.locals.errorMessage, 'Enter the password')
  })

  test('returns only to a page of the prototype', () => {
    const { signIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    signIn(
      fakeRequest({
        path: '/sign-in',
        method: 'POST',
        body: { password: PASSWORD, returnUrl: '//example.com/' }
      }),
      response
    )

    assert.deepEqual(response.redirected, [303, '/'])
  })

  test('ignores a sign-in sent from another site, logs it, and signs nobody in', () => {
    const { signIn } = createSignIn({ environment: ON_CDP })

    for (const site of ['cross-site', 'same-site']) {
      const response = fakeResponse()
      signIn(
        fakeRequest({
          path: '/sign-in',
          method: 'POST',
          body: { password: PASSWORD, returnUrl: '/data-assets' },
          headers: { 'sec-fetch-site': site }
        }),
        response
      )

      assert.equal(response.cookieSet, undefined, site)
      assert.deepEqual(response.redirected, [303, '/sign-in'], site)
    }
    assert.deepEqual(
      logged().map((entry) => [entry.message, entry.event.reason]),
      Array(2).fill([
        'Sign-in refused: the request came from another site',
        'request from another site'
      ])
    )
  })

  test("accepts a sign-in from the prototype's own page, the address bar, or a browser that doesn't say", () => {
    const { signIn } = createSignIn({ environment: ON_CDP })

    for (const site of ['same-origin', 'none', undefined]) {
      const response = fakeResponse()
      signIn(
        fakeRequest({
          path: '/sign-in',
          method: 'POST',
          body: { password: PASSWORD },
          headers: { 'sec-fetch-site': site }
        }),
        response
      )

      assert.match(response.cookieSet.value, SIGNED_COOKIE, String(site))
    }
  })

  test('goes to the home page when sign-in is not needed', () => {
    const { signIn, showSignIn } = createSignIn({ environment: {} })
    const posted = fakeResponse()
    const shown = fakeResponse()

    signIn(fakeRequest({ path: '/sign-in', method: 'POST', body: {} }), posted)
    showSignIn(fakeRequest({ path: '/sign-in' }), shown)

    assert.deepEqual(posted.redirected, [303, '/'])
    assert.deepEqual(shown.redirected, ['/'])
  })
})

describe('limiting wrong passwords', () => {
  const TOO_MANY =
    'You have entered the wrong password too many times. Wait 1 minute, then try again.'
  let now

  beforeEach(() => {
    mock.method(console, 'log', () => {})
    now = Date.parse('2026-11-05T09:00:00Z')
  })

  afterEach(() => {
    mock.restoreAll()
  })

  function attempt(signIn, password, ip = '203.0.113.10') {
    const response = fakeResponse()
    signIn(
      fakeRequest({ path: '/sign-in', method: 'POST', body: { password }, ip }),
      response
    )
    return response
  }

  function attemptWrong(signIn, times, ip) {
    return Array.from(
      { length: times },
      () => attempt(signIn, 'a-wrong-password', ip).statusCode
    )
  }

  test('refuses an 11th wrong password in a minute from one address, and even the right one, with status 429', () => {
    const { signIn } = createSignIn({ environment: ON_CDP, clock: () => now })

    assert.deepEqual(attemptWrong(signIn, 10), Array(10).fill(200))
    for (const password of ['a-wrong-password', PASSWORD]) {
      const response = attempt(signIn, password)

      assert.equal(response.statusCode, 429)
      assert.equal(response.rendered.view, 'sign-in')
      assert.equal(response.rendered.locals.errorMessage, TOO_MANY)
      assert.equal(response.cookieSet, undefined)
    }
  })

  test('logs every refused attempt', () => {
    const { signIn } = createSignIn({ environment: ON_CDP, clock: () => now })

    attemptWrong(signIn, 11)

    const entry = logged().at(-1)
    assert.equal(entry['log.level'], 'warn')
    assert.equal(entry.message, 'Sign-in refused: too many wrong passwords')
    assert.equal(entry.event.outcome, 'failure')
    assert.equal(entry.event.reason, 'too many wrong passwords')
  })

  test('lets the address try again a minute after its first wrong password', () => {
    const { signIn } = createSignIn({ environment: ON_CDP, clock: () => now })

    attemptWrong(signIn, 10)
    now += 60 * 1000 - 1
    assert.equal(attempt(signIn, PASSWORD).statusCode, 429)
    now += 1

    assert.match(attempt(signIn, PASSWORD).cookieSet.value, SIGNED_COOKIE)
  })

  test('starts counting again after a minute', () => {
    const { signIn } = createSignIn({ environment: ON_CDP, clock: () => now })

    attemptWrong(signIn, 10)
    now += 60 * 1000

    assert.deepEqual(attemptWrong(signIn, 11), [...Array(10).fill(200), 429])
  })

  test('counts each address on its own', () => {
    const { signIn } = createSignIn({ environment: ON_CDP, clock: () => now })

    attemptWrong(signIn, 10, '203.0.113.10')

    assert.match(
      attempt(signIn, PASSWORD, '203.0.113.20').cookieSet.value,
      SIGNED_COOKIE
    )
  })

  test('forgets the wrong passwords after the right one', () => {
    const { signIn } = createSignIn({ environment: ON_CDP, clock: () => now })

    attemptWrong(signIn, 9)
    attempt(signIn, PASSWORD)

    assert.deepEqual(attemptWrong(signIn, 10), Array(10).fill(200))
  })

  test('does not count an empty password', () => {
    const { signIn } = createSignIn({ environment: ON_CDP, clock: () => now })

    for (let count = 0; count < 15; count++) {
      const response = attempt(signIn, '')

      assert.equal(response.statusCode, 200)
      assert.equal(response.rendered.locals.errorMessage, 'Enter the password')
    }
  })

  test('keeps track of at most 1,000 addresses, forgetting the oldest first', () => {
    const { signIn } = createSignIn({ environment: ON_CDP, clock: () => now })
    const address = (number) => `2001:db8::${number.toString(16)}`

    for (let number = 0; number < 1000; number++) {
      attemptWrong(signIn, 10, address(number))
    }
    attemptWrong(signIn, 1, address(1000))

    assert.match(
      attempt(signIn, PASSWORD, address(0)).cookieSet.value,
      SIGNED_COOKIE
    )
    assert.equal(attempt(signIn, PASSWORD, address(1)).statusCode, 429)
  })
})

describe('passwords shorter than 16 characters', () => {
  beforeEach(() => {
    mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('cannot be used to sign in, and the logs say so once', () => {
    const { signIn } = createSignIn({
      environment: {
        ...ON_CDP,
        PASSWORD_KEYS: 'PASSWORD_01',
        PASSWORD_01: 'short-password'
      }
    })
    const short = fakeResponse()
    const long = fakeResponse()

    signIn(
      fakeRequest({ method: 'POST', body: { password: 'short-password' } }),
      short
    )
    signIn(fakeRequest({ method: 'POST', body: { password: PASSWORD } }), long)

    assert.equal(short.cookieSet, undefined)
    assert.match(long.cookieSet.value, SIGNED_COOKIE)
    assert.deepEqual(
      logged()
        .filter((entry) => entry.event.category[0] === 'configuration')
        .map((entry) => [entry['log.level'], entry.message]),
      [
        [
          'warn',
          'A password is shorter than 16 characters, so it cannot be used to sign in. Set longer passwords in the CDP Portal.'
        ]
      ]
    )
  })

  test('let nobody in when every password is too short', () => {
    const { requireSignIn } = createSignIn({
      environment: { NODE_ENV: 'production', PASSWORD: 'fifteen-letters' }
    })
    const response = fakeResponse()
    const next = mock.fn()

    requireSignIn(fakeRequest({ path: '/cookies' }), response, next)

    assert.equal(next.mock.callCount(), 0)
    assert.equal(response.rendered.view, 'problem-with-the-service')
  })

  test('are not reported on a developer machine, where nobody signs in', () => {
    createSignIn({ environment: { PASSWORD: 'short-password' } })

    assert.equal(console.log.mock.callCount(), 0)
  })
})

describe('the sign-in page', () => {
  beforeEach(() => {
    mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('shows the form, with the page to return to', () => {
    const { showSignIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    showSignIn(
      fakeRequest({ path: '/sign-in', query: { returnUrl: '/data-assets' } }),
      response
    )

    assert.equal(response.rendered.view, 'sign-in')
    assert.equal(response.rendered.locals.returnUrl, '/data-assets')
    assert.equal(response.rendered.locals.errorMessage, undefined)
  })

  test('goes straight to the page for someone who has already signed in', () => {
    const { showSignIn, signIn } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    showSignIn(
      fakeRequest({
        path: '/sign-in',
        query: { returnUrl: '/data-assets' },
        cookies: { [COOKIE]: cookieFrom(signIn) }
      }),
      response
    )

    assert.deepEqual(response.redirected, ['/data-assets'])
  })
})

describe('signing out', () => {
  beforeEach(() => {
    mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('removes the cookie and shows that you have signed out', () => {
    const { signOut } = createSignIn({ environment: ON_CDP })
    const response = fakeResponse()

    signOut(fakeRequest({ path: '/sign-out' }), response)

    assert.deepEqual(response.cookieCleared, {
      name: COOKIE,
      options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' }
    })
    assert.deepEqual(response.redirected, ['/signed-out'])
  })

  test('ignores a sign-out sent from another site, so you stay signed in', () => {
    const { signOut } = createSignIn({ environment: ON_CDP })

    for (const site of ['cross-site', 'same-site']) {
      const response = fakeResponse()
      signOut(
        fakeRequest({
          path: '/sign-out',
          headers: { 'sec-fetch-site': site }
        }),
        response
      )

      assert.equal(response.cookieCleared, undefined, site)
      assert.deepEqual(response.redirected, ['/'], site)
    }
  })

  test("signs out from the prototype's own pages, the address bar, or a browser that doesn't say", () => {
    const { signOut } = createSignIn({ environment: ON_CDP })

    for (const site of ['same-origin', 'none', undefined]) {
      const response = fakeResponse()
      signOut(
        fakeRequest({
          path: '/sign-out',
          headers: { 'sec-fetch-site': site }
        }),
        response
      )

      assert.equal(response.cookieCleared.name, COOKIE, String(site))
    }
  })

  test('logs signing out', () => {
    const { signOut } = createSignIn({ environment: ON_CDP })

    signOut(fakeRequest({ path: '/sign-out' }), fakeResponse())

    assert.deepEqual(
      logged().map((entry) => [entry['log.level'], entry.message, entry.event]),
      [
        [
          'info',
          'Signed out',
          {
            category: ['authentication'],
            type: ['end'],
            action: 'sign-out',
            outcome: 'success'
          }
        ]
      ]
    )
  })
})

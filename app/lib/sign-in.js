import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'node:crypto'

import { isDataAssetIdentifier } from './identifiers.js'
import { logEvent } from './log.js'

const SIGN_IN_PATH = '/sign-in'
const SIGNED_OUT_PATH = '/signed-out'

// Our own cookie, listed on the cookies page. The Kit's password page sets a
// cookie with another name, which is never accepted here.
const COOKIE_NAME = 'prototype-sign-in'
const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/'
})

// A sign-in lasts one working day. The server checks the time in the cookie,
// so a copied cookie stops working too, not only the browser's.
const SIGNED_IN_FOR = 8 * 60 * 60 * 1000
// CDP can run several copies of the prototype, whose clocks can differ a little
const CLOCK_DIFFERENCE_ALLOWED = 60 * 1000

// The cookie is "time.random.signature", signed with HMAC-SHA256
const SIGNED_COOKIE = /^(\d{1,15})\.([\w-]{22})\.([\w-]{43})$/

// The signing key comes from the passwords through scrypt, with settings from
// the OWASP Password Storage Cheat Sheet. So every copy of the prototype gets
// the same key with no extra secret, changing a password ends every sign-in,
// and a copied cookie is slow to test password guesses against.
const KEY_SALT = 'livestock-data-catalogue-poc sign-in'
const SCRYPT_OPTIONS = Object.freeze({
  N: 2 ** 15,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024
})
const signingKeys = new Map()

// A shared password must be long enough that it can't be guessed. Shorter
// ones are ignored, and with none left nobody can sign in.
const SHORTEST_PASSWORD = 16

// At most 10 wrong passwords a minute from one address, so the password
// can't be guessed quickly. On CDP the address is the platform proxy's until
// the prototype is told how many proxies there are, so the limit is shared.
const WRONG_PASSWORDS_ALLOWED = 10
const WRONG_PASSWORD_WINDOW = 60 * 1000
const ADDRESSES_TRACKED = 1000
const TOO_MANY_WRONG_PASSWORDS =
  'You have entered the wrong password too many times. Wait 1 minute, then try again.'

// Sign-ins and sign-outs are logged as ECS authentication events, so CDP's
// logs show when people sign in, and any run of wrong passwords
const SIGN_IN_EVENT = Object.freeze({
  category: ['authentication'],
  type: ['start'],
  action: 'sign-in'
})

// Anyone can sign in or out, and read the support pages, which the footer
// links to from the sign-in page
const OPEN_PATHS = new Set([
  SIGN_IN_PATH,
  SIGNED_OUT_PATH,
  '/accessibility-statement',
  '/cookies',
  '/privacy',
  '/report-a-problem'
])

const ENVIRONMENT_VARIABLE_NAME = /^[_a-zA-Z][_a-zA-Z0-9]*$/
const LONGEST_RETURN_ADDRESS = 2000
const BASE_ADDRESS = new URL('https://prototype.invalid')

// The same passwords the Kit accepts: PASSWORD, and every variable named in
// PASSWORD_KEYS, which gives research rounds passwords of their own
export function passwordsFrom(environment) {
  const keys = (environment.PASSWORD_KEYS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => ENVIRONMENT_VARIABLE_NAME.test(key))
  return [...keys.map((key) => environment[key]), environment.PASSWORD].filter(
    Boolean
  )
}

// As in the Kit, sign-in is only needed on CDP, where NODE_ENV is production,
// and USE_AUTH=false turns it off. Unlike the Kit, any other USE_AUTH value
// keeps it on, so a mistyped value never removes the password.
export function isSignInRequired(environment) {
  return (
    environment.NODE_ENV?.toLowerCase() === 'production' &&
    environment.USE_AUTH?.toLowerCase() !== 'false'
  )
}

// Only a catalogue page that needs signing in: the home page, the search
// page or a data asset page. The check is on the address after the browser's
// rules have tidied it, so nothing a browser would read as another site, and
// no sign-in or sign-out page, can pass.
export function safeReturnUrl(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.length > LONGEST_RETURN_ADDRESS ||
    !URL.canParse(value, BASE_ADDRESS)
  ) {
    return '/'
  }
  const address = new URL(value, BASE_ADDRESS)
  if (
    address.origin !== BASE_ADDRESS.origin ||
    !isReturnPath(address.pathname)
  ) {
    return '/'
  }
  return `${address.pathname}${address.search}`
}

// After signing in, a visitor goes back to a page they could have
// bookmarked: the home page, search, a data asset, Your data assets, a data
// asset's overview or the prototype settings. Anything else goes home.
function isReturnPath(path) {
  if (path === '/' || path === '/prototype-settings') {
    return true
  }
  const parts = path.split('/').slice(1)
  const [page, identifier, ...rest] =
    parts[0] === 'manage' ? parts.slice(1) : parts
  return (
    page === 'data-assets' &&
    rest.length === 0 &&
    (identifier === undefined || isDataAssetIdentifier(identifier))
  )
}

function sameText(first, second) {
  const firstBuffer = Buffer.from(first)
  const secondBuffer = Buffer.from(second)
  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  )
}

// Browsers say where a request came from in Sec-Fetch-Site. Signing in or
// out only counts from the prototype's own pages or the address bar, so
// another site can't sign people in or out. A browser that doesn't send the
// header can't be checked, so it is let through.
function isFromThisSite(req) {
  const site = req.get('sec-fetch-site')
  return site === undefined || site === 'same-origin' || site === 'none'
}

function signInAddress(returnUrl) {
  return returnUrl === '/'
    ? SIGN_IN_PATH
    : `${SIGN_IN_PATH}?${new URLSearchParams({ returnUrl })}`
}

function digest(text) {
  return createHash('sha256').update(text).digest()
}

function signingKey(passwords) {
  const secret = JSON.stringify(passwords)
  if (!signingKeys.has(secret)) {
    signingKeys.set(secret, scryptSync(secret, KEY_SALT, 32, SCRYPT_OPTIONS))
  }
  return signingKeys.get(secret)
}

function signature(key, text) {
  return createHmac('sha256', key).update(text).digest('base64url')
}

function newSignedCookie(key, now) {
  const text = `${now}.${randomBytes(16).toString('base64url')}`
  return `${text}.${signature(key, text)}`
}

function isSignedCookie(key, cookie, now) {
  const parts = SIGNED_COOKIE.exec(cookie)
  if (parts === null) {
    return false
  }
  const [, issuedAt, random, givenSignature] = parts
  const age = now - Number(issuedAt)
  return (
    age >= -CLOCK_DIFFERENCE_ALLOWED &&
    age < SIGNED_IN_FOR &&
    sameText(givenSignature, signature(key, `${issuedAt}.${random}`))
  )
}

// The prototype's password check, which replaces the Kit's own so that the
// sign-in page can have the Defra layout. The Kit's check is turned off in
// app/config.json, and the passwords are CDP secrets.
export function createSignIn({
  environment = process.env,
  clock = Date.now
} = {}) {
  const required = isSignInRequired(environment)
  const allPasswords = passwordsFrom(environment)
  const passwords = allPasswords.filter(
    (password) => password.length >= SHORTEST_PASSWORD
  )
  if (required && passwords.length < allPasswords.length) {
    logEvent({
      level: 'warn',
      message:
        'A password is shorter than 16 characters, so it cannot be used to sign in. Set longer passwords in the CDP Portal.',
      event: { category: ['configuration'], outcome: 'failure' }
    })
  }
  // Digests have one length, so comparing them takes the same time
  // whatever the password's length
  const passwordDigests = passwords.map(digest)
  const key =
    required && passwords.length > 0 ? signingKey(passwords) : undefined
  const wrongPasswords = new Map()
  let reportedNoPassword = false

  function hasTooManyWrongPasswords(address, now) {
    const record = wrongPasswords.get(address)
    return (
      record !== undefined &&
      now - record.since < WRONG_PASSWORD_WINDOW &&
      record.count >= WRONG_PASSWORDS_ALLOWED
    )
  }

  function countWrongPassword(address, now) {
    const record = wrongPasswords.get(address)
    if (record !== undefined && now - record.since < WRONG_PASSWORD_WINDOW) {
      record.count += 1
      return
    }
    for (const [knownAddress, { since }] of wrongPasswords) {
      if (now - since >= WRONG_PASSWORD_WINDOW) {
        wrongPasswords.delete(knownAddress)
      }
    }
    if (wrongPasswords.size >= ADDRESSES_TRACKED) {
      wrongPasswords.delete(wrongPasswords.keys().next().value)
    }
    wrongPasswords.set(address, { since: now, count: 1 })
  }

  function isSignedIn(req) {
    const cookie = req.cookies?.[COOKIE_NAME]
    return typeof cookie === 'string' && isSignedCookie(key, cookie, clock())
  }

  function showSignInPage(res, { returnUrl, errorMessage }) {
    res.render('sign-in', {
      returnUrl,
      errorMessage,
      hasErrors: errorMessage !== undefined
    })
  }

  function requireSignIn(req, res, next) {
    if (!required) {
      next()
      return
    }
    if (key === undefined) {
      if (!reportedNoPassword) {
        logEvent({
          level: 'error',
          message:
            'The prototype has no password of 16 characters or more, so nobody can sign in. Set the PASSWORD secret in the CDP Portal.',
          event: { category: ['configuration'], outcome: 'failure' },
          req
        })
        reportedNoPassword = true
      }
      res.status(500).render('problem-with-the-service')
      return
    }
    res.locals.signedIn = isSignedIn(req)
    if (res.locals.signedIn || OPEN_PATHS.has(req.path)) {
      next()
      return
    }
    const returnUrl =
      req.method === 'GET' ? safeReturnUrl(req.originalUrl) : '/'
    res.redirect(signInAddress(returnUrl))
  }

  function showSignIn(req, res) {
    const returnUrl = safeReturnUrl(req.query.returnUrl)
    if (!required || isSignedIn(req)) {
      res.redirect(returnUrl)
      return
    }
    showSignInPage(res, { returnUrl })
  }

  function signIn(req, res) {
    const returnUrl = safeReturnUrl(req.body?.returnUrl)
    if (!required) {
      res.redirect(303, '/')
      return
    }
    if (!isFromThisSite(req)) {
      logEvent({
        level: 'warn',
        message: 'Sign-in refused: the request came from another site',
        event: {
          ...SIGN_IN_EVENT,
          outcome: 'failure',
          reason: 'request from another site'
        },
        req
      })
      res.redirect(303, SIGN_IN_PATH)
      return
    }
    const now = clock()
    if (hasTooManyWrongPasswords(req.ip, now)) {
      logEvent({
        level: 'warn',
        message: 'Sign-in refused: too many wrong passwords',
        event: {
          ...SIGN_IN_EVENT,
          outcome: 'failure',
          reason: 'too many wrong passwords'
        },
        req
      })
      res.status(429)
      showSignInPage(res, { returnUrl, errorMessage: TOO_MANY_WRONG_PASSWORDS })
      return
    }
    const password =
      typeof req.body?.password === 'string' ? req.body.password : ''
    if (password === '') {
      showSignInPage(res, { returnUrl, errorMessage: 'Enter the password' })
      return
    }
    const given = digest(password)
    if (!passwordDigests.some((known) => timingSafeEqual(given, known))) {
      countWrongPassword(req.ip, now)
      logEvent({
        level: 'warn',
        message: 'Sign-in failed: the password was not correct',
        event: {
          ...SIGN_IN_EVENT,
          outcome: 'failure',
          reason: 'wrong password'
        },
        req
      })
      showSignInPage(res, {
        returnUrl,
        errorMessage: 'Enter the correct password'
      })
      return
    }
    wrongPasswords.delete(req.ip)
    res.cookie(COOKIE_NAME, newSignedCookie(key, now), {
      ...COOKIE_OPTIONS,
      maxAge: SIGNED_IN_FOR
    })
    logEvent({
      level: 'info',
      message: 'Signed in',
      event: { ...SIGN_IN_EVENT, outcome: 'success' },
      req
    })
    res.redirect(303, returnUrl)
  }

  function signOut(req, res) {
    if (!isFromThisSite(req)) {
      res.redirect('/')
      return
    }
    res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS })
    logEvent({
      level: 'info',
      message: 'Signed out',
      event: {
        category: ['authentication'],
        type: ['end'],
        action: 'sign-out',
        outcome: 'success'
      },
      req
    })
    res.redirect(SIGNED_OUT_PATH)
  }

  return { requireSignIn, showSignIn, signIn, signOut }
}

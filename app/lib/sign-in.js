import { timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'

import { isDataAssetIdentifier } from './identifiers.js'

// The Prototype Kit's own password encryption, so the cookie matches the one
// the Kit sets, and the prototype adds no cryptography of its own
const { encryptPassword } = createRequire(import.meta.url)(
  'govuk-prototype-kit/lib/utils'
)

const SIGN_IN_PATH = '/sign-in'
const SIGNED_OUT_PATH = '/signed-out'

// The Kit's cookie, listed on the cookies page
const COOKIE_NAME = 'authentication'
const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/'
})
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000

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

function isReturnPath(path) {
  const [, page, identifier, ...rest] = path.split('/')
  if (page === '' && identifier === undefined) {
    return true
  }
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

function signInAddress(returnUrl) {
  return returnUrl === '/'
    ? SIGN_IN_PATH
    : `${SIGN_IN_PATH}?${new URLSearchParams({ returnUrl })}`
}

// The prototype's password check, which replaces the Kit's own so that the
// sign-in page can have the Defra layout. The Kit's check is turned off in
// app/config.json, and the passwords are CDP secrets.
export function createSignIn({ environment = process.env } = {}) {
  const required = isSignInRequired(environment)
  const passwordHashes = passwordsFrom(environment).map(encryptPassword)
  let reportedNoPassword = false

  function isSignedIn(req) {
    const cookie = req.cookies?.[COOKIE_NAME]
    return (
      typeof cookie === 'string' &&
      passwordHashes.some((hash) => sameText(cookie, hash))
    )
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
    if (passwordHashes.length === 0) {
      if (!reportedNoPassword) {
        console.error(
          'The prototype has no password, so nobody can sign in. Set the PASSWORD secret in the CDP Portal.'
        )
        reportedNoPassword = true
      }
      res.status(503).render('problem-with-the-service')
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
    const password =
      typeof req.body?.password === 'string' ? req.body.password : ''
    if (password === '') {
      showSignInPage(res, { returnUrl, errorMessage: 'Enter the password' })
      return
    }
    const hash = encryptPassword(password)
    if (!passwordHashes.some((passwordHash) => sameText(hash, passwordHash))) {
      console.warn('Sign-in failed: the password was not correct')
      showSignInPage(res, {
        returnUrl,
        errorMessage: 'The password is not correct'
      })
      return
    }
    res.cookie(COOKIE_NAME, hash, {
      ...COOKIE_OPTIONS,
      maxAge: COOKIE_MAX_AGE
    })
    res.redirect(303, returnUrl)
  }

  function signOut(req, res) {
    res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS })
    res.redirect(SIGNED_OUT_PATH)
  }

  return { requireSignIn, showSignIn, signIn, signOut }
}

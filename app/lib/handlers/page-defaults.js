import { randomBytes } from 'node:crypto'

import { DEFRA_COLOUR } from '../brand.js'

// Only the prototype's own files, and the GOV.UK template's one inline
// script, which carries a new random nonce on every page. No inline styles,
// plugins, other sites' forms or framing.
function contentSecurityPolicy(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
}

// Runs before every page the catalogue serves
export function pageDefaults(req, res, next) {
  // Express has already named itself in this response, so remove it here.
  // Turning it off for the app also stops it in files the Kit serves itself.
  res.removeHeader('X-Powered-By')
  req.app.disable('x-powered-by')
  // GOV.UK Frontend's template adds the nonce to its inline script
  const nonce = randomBytes(16).toString('base64')
  res.locals.cspNonce = nonce
  res.set({
    'Content-Security-Policy': contentSecurityPolicy(nonce),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Pages for signed-in people mustn't stay in a shared computer's cache
    'Cache-Control': 'no-store',
    'Strict-Transport-Security': 'max-age=31536000'
  })
  res.locals.themeColor = DEFRA_COLOUR
  next()
}

import { managesDataAssets } from '../personas.js'
import { csrfTokenFor, currentPersona } from '../working-copy.js'

// What every page's layout needs from this browser's session: whether to
// show "Your data assets", and the token forms carry
export function sessionLocals(req, res, next) {
  res.locals.managesDataAssets = managesDataAssets(currentPersona(req))
  res.locals.csrfToken = csrfTokenFor(req)
  next()
}

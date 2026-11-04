import { DEFRA_COLOUR } from '../brand.js'

// Runs before every page the catalogue serves
export function pageDefaults(req, res, next) {
  // Express has already named itself in this response, so remove it here.
  // Turning it off for the app also stops it in files the Kit serves itself.
  res.removeHeader('X-Powered-By')
  req.app.disable('x-powered-by')
  res.locals.themeColor = DEFRA_COLOUR
  next()
}

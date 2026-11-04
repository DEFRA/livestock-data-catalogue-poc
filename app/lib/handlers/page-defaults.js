import { DEFRA_COLOUR } from '../brand.js'

// Runs before every page the catalogue serves
export function pageDefaults(req, res, next) {
  res.removeHeader('X-Powered-By')
  res.locals.themeColor = DEFRA_COLOUR
  next()
}

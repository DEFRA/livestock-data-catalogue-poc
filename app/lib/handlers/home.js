import { browseLists } from '../browse.js'
import { catalogueFor } from '../working-copy.js'

export function showHome(req, res) {
  res.render('index', browseLists(catalogueFor(req)))
}

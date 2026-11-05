import { browseLists } from '../browse.js'
import { catalogue } from '../catalogue-data.js'

export function showHome(req, res) {
  res.render('index', browseLists(catalogue))
}

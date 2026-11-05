import { catalogue } from '../catalogue-data.js'
import { today } from '../clock.js'
import { dataAssetPage } from '../data-asset-view.js'
import { isDataAssetIdentifier } from '../identifiers.js'
import { findVisibleDataAsset } from '../visibility.js'
import { pageNotFound } from './errors.js'

// The identifier is checked against the S05 pattern before any lookup.
// Unknown, draft and retired data assets all show Page not found.
export function showDataAsset(req, res) {
  const { identifier } = req.params
  const dataAsset = isDataAssetIdentifier(identifier)
    ? findVisibleDataAsset(catalogue, identifier)
    : undefined
  if (!dataAsset) {
    pageNotFound(req, res)
    return
  }
  res.render('data-assets/data-asset', {
    navigationItem: 'data-asset',
    pageName: dataAsset.titleName,
    ...dataAssetPage(catalogue, dataAsset, { today: today() })
  })
}

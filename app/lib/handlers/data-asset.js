import { today } from '../clock.js'
import { dataAssetPage } from '../data-asset-view.js'
import { isDataAssetIdentifier } from '../identifiers.js'
import { manageHref } from '../manage/context.js'
import { canManage } from '../personas.js'
import { findVisibleDataAsset } from '../visibility.js'
import { catalogueFor, currentPersona } from '../working-copy.js'
import { pageNotFound } from './errors.js'

// The identifier is checked against the S05 pattern before any lookup.
// Unknown, draft and retired data assets all show Page not found.
export function showDataAsset(req, res) {
  const { identifier } = req.params
  const catalogue = catalogueFor(req)
  const dataAsset = isDataAssetIdentifier(identifier)
    ? findVisibleDataAsset(catalogue, identifier)
    : undefined
  if (!dataAsset) {
    pageNotFound(req, res)
    return
  }
  const now = today()
  res.render('data-assets/data-asset', {
    navigationItem: 'data-asset',
    pageName: dataAsset.titleName,
    manageHref: canManage(catalogue, currentPersona(req), dataAsset, now)
      ? manageHref(identifier)
      : undefined,
    ...dataAssetPage(catalogue, dataAsset, { today: now })
  })
}

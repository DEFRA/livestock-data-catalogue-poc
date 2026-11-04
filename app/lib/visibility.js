// S11: Draft and Retired records are hidden from catalogue users. Any
// other state, including one we don't recognise, counts as hidden.
const VISIBLE_PUBLICATION_STATES = new Set(['PUBLISHED', 'DEPRECATED'])

export function isVisible(dataAsset) {
  return VISIBLE_PUBLICATION_STATES.has(dataAsset?.publicationStateCode)
}

export function visibleDataAssets(catalogue) {
  return catalogue.collections.dataAssets.filter(isVisible)
}

export function findVisibleDataAsset(catalogue, identifier) {
  const dataAsset = catalogue.dataAssetsByIdentifier.get(identifier)
  return isVisible(dataAsset) ? dataAsset : undefined
}

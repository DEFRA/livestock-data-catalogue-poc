import { readCollections } from '../../app/lib/catalogue-data.js'

// A fixed date, so tests don't depend on when they run
export const TODAY = '2026-11-04'

// A fresh, changeable copy of the mock data for each test
export function catalogueCopy() {
  return readCollections()
}

export function dataAssetIn(collections, identifier) {
  return collections.dataAssets.find(
    (dataAsset) => dataAsset.identifier === identifier
  )
}

import { nameFor } from './reference-data.js'
import { searchHref } from './search.js'
import { dataAssetSummary } from './summaries.js'
import { visibleDataAssets } from './visibility.js'

const RECENTLY_UPDATED_COUNT = 5

function byText(first, second) {
  return first.text.localeCompare(second.text, 'en-GB')
}

function countsBy(dataAssets, valueOf) {
  const counts = new Map()
  for (const dataAsset of dataAssets) {
    const value = valueOf(dataAsset)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
}

function mostRecentlyUpdatedFirst(first, second) {
  return (
    second.modificationDate.localeCompare(first.modificationDate) ||
    first.titleName.localeCompare(second.titleName, 'en-GB')
  )
}

// The home page's browse lists. They count and list visible data assets only.
export function browseLists(catalogue) {
  const dataAssets = visibleDataAssets(catalogue)
  return {
    domains: countsBy(dataAssets, (dataAsset) => dataAsset.domainCode)
      .map(([code, count]) => ({
        text: nameFor(catalogue, 'domains', code),
        href: searchHref({ selected: { domain: [code] } }),
        count
      }))
      .sort(byText),
    organisations: countsBy(
      dataAssets,
      (dataAsset) => dataAsset.organisationName
    )
      .map(([name, count]) => ({
        text: name,
        href: searchHref({ selected: { organisation: [name] } }),
        count
      }))
      .sort(byText),
    recentlyUpdated: [...dataAssets]
      .sort(mostRecentlyUpdatedFirst)
      .slice(0, RECENTLY_UPDATED_COUNT)
      .map((dataAsset) => dataAssetSummary(catalogue, dataAsset))
  }
}

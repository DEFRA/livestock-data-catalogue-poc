import { catalogue } from '../catalogue-data.js'
import { countOf } from '../formatting.js'
import {
  filterOptions,
  findDataAssets,
  readSearchQuery,
  searchHref
} from '../search.js'
import { dataAssetSummary } from '../summaries.js'

const PAGE_NAME = 'Search data assets'

function filterGroups(filters, search) {
  return filters.map((filter) => ({
    parameter: filter.parameter,
    legend: filter.legend,
    items: filter.options.map((option) => ({
      value: option.value,
      text: option.text,
      checked: search.selected[filter.parameter].includes(option.value)
    }))
  }))
}

function pagination(found, search) {
  if (found.totalPages < 2) {
    return undefined
  }
  const href = (page) =>
    searchHref({ terms: search.terms, selected: search.selected, page })
  return {
    previous: found.page > 1 ? { href: href(found.page - 1) } : undefined,
    next:
      found.page < found.totalPages
        ? { href: href(found.page + 1) }
        : undefined,
    items: Array.from({ length: found.totalPages }, (_, index) => ({
      number: index + 1,
      href: href(index + 1),
      current: index + 1 === found.page
    }))
  }
}

function resultsFor(search) {
  const found = findDataAssets(catalogue, search)
  return {
    pageName:
      found.totalPages > 1
        ? `${PAGE_NAME} (page ${found.page} of ${found.totalPages})`
        : PAGE_NAME,
    resultCount: countOf(found.total, 'data asset', 'data assets'),
    results: found.dataAssets.map((dataAsset) =>
      dataAssetSummary(catalogue, dataAsset)
    ),
    pagination: pagination(found, search)
  }
}

export function searchDataAssets(req, res) {
  const filters = filterOptions(catalogue)
  const search = readSearchQuery(req.query, filters)
  const hasSelectedFilters = Object.values(search.selected).some(
    (values) => values.length > 0
  )
  res.render('data-assets/index', {
    navigationItem: 'data-assets',
    pageName: PAGE_NAME,
    hasErrors: search.error !== undefined,
    errorMessage: search.error,
    typedTerms: search.typedTerms,
    filterGroups: filterGroups(filters, search),
    clearFiltersHref: hasSelectedFilters
      ? searchHref({ terms: search.terms })
      : undefined,
    ...(search.error ? {} : resultsFor(search))
  })
}

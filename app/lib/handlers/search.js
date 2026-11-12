import { countOf } from '../formatting.js'
import {
  filterOptions,
  findDataAssets,
  readSearchQuery,
  searchHref
} from '../search.js'
import { dataAssetSummary } from '../summaries.js'
import { catalogueFor } from '../working-copy.js'

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

function resultsFor(catalogue, found, search) {
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

// A page number that is out of range or not valid goes to page 1 of the
// same search, as the GOV.UK Pagination guidance says
function isPageToCorrect(query, found) {
  return query.page !== undefined && query.page !== String(found.page)
}

export function searchDataAssets(req, res) {
  const catalogue = catalogueFor(req)
  const filters = filterOptions(catalogue)
  const search = readSearchQuery(req.query, filters)
  const found = search.error ? undefined : findDataAssets(catalogue, search)
  if (found !== undefined && isPageToCorrect(req.query, found)) {
    res.redirect(
      searchHref({
        terms: search.terms,
        selected: search.selected,
        page: found.page
      })
    )
    return
  }
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
    ...(found === undefined ? {} : resultsFor(catalogue, found, search))
  })
}

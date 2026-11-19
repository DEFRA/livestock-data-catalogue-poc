import { countOf } from '../formatting.js'
import {
  countFilterOptions,
  filterOptions,
  findDataAssets,
  readSearchQuery,
  searchHref,
  selectedFilterLinks
} from '../search.js'
import { dataAssetSummary } from '../summaries.js'
import { catalogueFor } from '../working-copy.js'

const PAGE_NAME = 'Search data assets'

// Each option shows how many data assets it would find. Options that would
// find nothing are hidden, unless chosen, so the filters stay short. Without
// counts (when the search terms aren't valid) every option shows.
function filterGroups(filters, search, counts) {
  return filters.map((filter) => {
    const chosen = search.selected[filter.parameter]
    const optionCount = (option) => counts?.[filter.parameter][option.value]
    return {
      parameter: filter.parameter,
      legend: filter.legend,
      items: filter.options
        .filter(
          (option) => chosen.includes(option.value) || optionCount(option) !== 0
        )
        .map((option) => {
          const count = optionCount(option)
          return {
            value: option.value,
            text:
              count === undefined ? option.text : `${option.text} (${count})`,
            checked: chosen.includes(option.value)
          }
        })
    }
  })
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
  const isValidSearch = search.error === undefined
  const found = isValidSearch ? findDataAssets(catalogue, search) : undefined
  if (isValidSearch && isPageToCorrect(req.query, found)) {
    res.redirect(
      searchHref({
        terms: search.terms,
        selected: search.selected,
        page: found.page
      })
    )
    return
  }
  const groups = filterGroups(
    filters,
    search,
    isValidSearch ? countFilterOptions(catalogue, filters, search) : undefined
  )
  const hasSelectedFilters = Object.values(search.selected).some(
    (values) => values.length > 0
  )
  res.render('data-assets/index', {
    navigationItem: 'data-assets',
    pageName: PAGE_NAME,
    hasErrors: !isValidSearch,
    errorMessage: search.error,
    typedTerms: search.typedTerms,
    filterGroups: groups,
    hasFilterOptions: groups.some((group) => group.items.length > 0),
    selectedFilters: isValidSearch ? selectedFilterLinks(filters, search) : [],
    clearFiltersHref: hasSelectedFilters
      ? searchHref({ terms: search.terms })
      : undefined,
    ...(isValidSearch ? resultsFor(catalogue, found, search) : {})
  })
}

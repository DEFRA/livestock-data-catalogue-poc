import { nameFor } from './reference-data.js'
import { visibleDataAssets } from './visibility.js'

export const MAXIMUM_SEARCH_TERMS_LENGTH = 100
export const RESULTS_PER_PAGE = 10

const PAGE_NUMBER_PATTERN = /^[1-9]\d{0,5}$/

function referenceName(listName) {
  return (catalogue, code) => nameFor(catalogue, listName, code)
}

// Organisations and delivery groups are keyed by name, so the value shows
function nameIsValue(catalogue, value) {
  return value
}

// The filters on the search page, with the query parameter for each.
// Values are codes or business keys from the catalogue.
export const FILTERS = Object.freeze([
  {
    parameter: 'type',
    legend: 'Data asset type',
    valuesOf: (dataAsset) => [dataAsset.dataAssetTypeCode],
    nameOf: referenceName('dataAssetTypes')
  },
  {
    parameter: 'domain',
    legend: 'Domain',
    valuesOf: (dataAsset) => [dataAsset.domainCode],
    nameOf: referenceName('domains')
  },
  {
    parameter: 'category',
    legend: 'Category',
    valuesOf: (dataAsset) => dataAsset.categoryCodes ?? [],
    nameOf: referenceName('categories')
  },
  {
    parameter: 'organisation',
    legend: 'Owning organisation',
    valuesOf: (dataAsset) => [dataAsset.organisationName],
    nameOf: nameIsValue
  },
  {
    parameter: 'delivery-group',
    legend: 'Delivery group',
    valuesOf: (dataAsset) => [dataAsset.deliveryGroupName],
    nameOf: nameIsValue
  }
])

function byText(first, second) {
  return first.text.localeCompare(second.text, 'en-GB')
}

// Each filter's options: only values that at least 1 visible data asset
// uses, in alphabetical order
export function filterOptions(catalogue) {
  const dataAssets = visibleDataAssets(catalogue)
  return FILTERS.map((filter) => {
    const values = new Set(dataAssets.flatMap(filter.valuesOf).filter(Boolean))
    const options = [...values]
      .map((value) => ({ value, text: filter.nameOf(catalogue, value) }))
      .sort(byText)
    return { ...filter, options }
  })
}

function selectedValues(queryValue, options) {
  const allowed = new Set(options.map((option) => option.value))
  const values = [queryValue]
    .flat()
    .filter((value) => typeof value === 'string' && allowed.has(value))
  return [...new Set(values)]
}

// Reads the search page's query string. Only allow-listed values are kept:
// unknown filter values and page numbers are ignored.
export function readSearchQuery(query, filters) {
  const typedTerms = typeof query.q === 'string' ? query.q : ''
  const terms = typedTerms.trim().replace(/\s+/g, ' ')
  const tooLong =
    [...terms.normalize('NFC')].length > MAXIMUM_SEARCH_TERMS_LENGTH
  return {
    typedTerms,
    terms,
    error: tooLong
      ? `Search terms must be ${MAXIMUM_SEARCH_TERMS_LENGTH} characters or fewer`
      : undefined,
    selected: Object.fromEntries(
      filters.map((filter) => [
        filter.parameter,
        selectedValues(query[filter.parameter], filter.options)
      ])
    ),
    requestedPage:
      typeof query.page === 'string' && PAGE_NUMBER_PATTERN.test(query.page)
        ? Number(query.page)
        : 1
  }
}

function lowerCase(text) {
  return text.normalize('NFC').toLocaleLowerCase('en-GB')
}

// Text as words with a space before each, so a search word only matches the
// start of a word: "move" finds "movement", but "old" doesn't find "holding".
// Anything other than a letter or number separates words, in the data and
// in the search terms alike.
function searchableText(text) {
  return ` ${lowerCase(text).replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')}`
}

function wordsIn(terms) {
  return searchableText(terms).split(' ').filter(Boolean)
}

// How well a data asset matches every word: title matches first, then
// keyword matches, then description matches. Undefined means no match.
function relevance(dataAsset, words) {
  const title = searchableText(dataAsset.titleName)
  const keywords = searchableText((dataAsset.keywordNames ?? []).join(' '))
  const description = searchableText(dataAsset.description)
  const containsEveryWord = (...texts) =>
    words.every((word) => texts.some((text) => text.includes(` ${word}`)))
  if (!containsEveryWord(title, keywords, description)) {
    return undefined
  }
  if (containsEveryWord(title)) {
    return 0
  }
  return containsEveryWord(keywords) ? 1 : 2
}

function matchesFilters(dataAsset, selected) {
  return FILTERS.every((filter) => {
    const wanted = selected[filter.parameter] ?? []
    return (
      wanted.length === 0 ||
      filter.valuesOf(dataAsset).some((value) => wanted.includes(value))
    )
  })
}

export function findDataAssets(catalogue, search) {
  const words = wordsIn(search.terms)
  const matching = visibleDataAssets(catalogue)
    .filter((dataAsset) => matchesFilters(dataAsset, search.selected))
    .map((dataAsset) => ({ dataAsset, rank: relevance(dataAsset, words) }))
    .filter((match) => match.rank !== undefined)
    .sort(
      (first, second) =>
        first.rank - second.rank ||
        first.dataAsset.titleName.localeCompare(
          second.dataAsset.titleName,
          'en-GB'
        )
    )
    .map((match) => match.dataAsset)

  const totalPages = Math.max(1, Math.ceil(matching.length / RESULTS_PER_PAGE))
  const page = search.requestedPage <= totalPages ? search.requestedPage : 1
  return {
    total: matching.length,
    page,
    totalPages,
    dataAssets: matching.slice(
      (page - 1) * RESULTS_PER_PAGE,
      page * RESULTS_PER_PAGE
    )
  }
}

// The address of a search, built only from validated values
export function searchHref({ terms = '', selected = {}, page = 1 } = {}) {
  const parameters = new URLSearchParams()
  if (terms) {
    parameters.append('q', terms)
  }
  for (const filter of FILTERS) {
    for (const value of selected[filter.parameter] ?? []) {
      parameters.append(filter.parameter, value)
    }
  }
  if (page > 1) {
    parameters.append('page', String(page))
  }
  const query = parameters.toString()
  return query ? `/data-assets?${query}` : '/data-assets'
}

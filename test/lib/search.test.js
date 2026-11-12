import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { browseLists } from '../../app/lib/browse.js'
import { buildCatalogue, catalogue } from '../../app/lib/catalogue-data.js'
import {
  countOf,
  formatDate,
  formatDateTime
} from '../../app/lib/formatting.js'
import {
  FILTERS,
  RESULTS_PER_PAGE,
  filterOptions,
  findDataAssets,
  readSearchQuery,
  searchHref
} from '../../app/lib/search.js'
import { catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

const FILTER_OPTIONS = filterOptions(catalogue)

function search(query = {}, fromCatalogue = catalogue) {
  return findDataAssets(
    fromCatalogue,
    readSearchQuery(query, filterOptions(fromCatalogue))
  )
}

function titlesFound(query, fromCatalogue) {
  return search(query, fromCatalogue).dataAssets.map(
    (dataAsset) => dataAsset.titleName
  )
}

function allTitlesFound(query) {
  const firstPage = search(query)
  const titles = firstPage.dataAssets.map((dataAsset) => dataAsset.titleName)
  for (let page = 2; page <= firstPage.totalPages; page++) {
    titles.push(
      ...search({ ...query, page: String(page) }).dataAssets.map(
        (dataAsset) => dataAsset.titleName
      )
    )
  }
  return titles
}

describe('searching for data assets', () => {
  describe('search terms', () => {
    test('finds a data asset by a word in its title, ignoring case', () => {
      assert.deepEqual(titlesFound({ q: 'BREED' }), ['Breed Reference Data'])
    })

    test('finds a data asset by a Welsh keyword', () => {
      assert.deepEqual(titlesFound({ q: 'gwartheg' }), ['Animal Movement'])
    })

    test('finds a data asset by a word in its description', () => {
      assert.deepEqual(titlesFound({ q: 'tuberculosis' }), [
        'Bovine TB Test Results'
      ])
    })

    test('matches the start of words, so a short word does not match the middle of another', () => {
      assert.deepEqual(titlesFound({ q: 'move' }).slice(0, 3), [
        'Animal Movement',
        'Livestock Movement Statistics',
        'Movement Restrictions'
      ])
      assert.deepEqual(titlesFound({ q: 'old' }), [])
    })

    test('needs every word to match', () => {
      assert.deepEqual(titlesFound({ q: 'animal deaths' }), ['Animal Deaths'])
      assert.deepEqual(titlesFound({ q: 'animal unicorn' }), [])
    })

    test('ranks title matches first, then keyword matches, then description matches', () => {
      assert.deepEqual(titlesFound({ q: 'movement' }).slice(0, 3), [
        'Animal Movement',
        'Livestock Movement Statistics',
        'Movement Restrictions'
      ])
      assert.deepEqual(titlesFound({ q: 'holding' }), [
        'Holding Address',
        'Livestock Holding',
        'Animal Movement',
        'Keeper',
        'Livestock Keeper',
        'Bovine TB Test Results',
        'Movement Restrictions'
      ])
    })

    test('ignores extra spaces between and around words', () => {
      assert.deepEqual(titlesFound({ q: '   animal    deaths  ' }), [
        'Animal Deaths'
      ])
    })

    test('ignores punctuation in search terms, as it does in the data', () => {
      assert.deepEqual(titlesFound({ q: 'cattle, sheep' }), [
        'Animal Deaths',
        'Animal Movement',
        'Animal Registrations',
        'Breed Reference Data'
      ])
      assert.deepEqual(titlesFound({ q: 'Bovine TB.' }), [
        'Bovine TB Test Results'
      ])
    })

    test('treats regular expression characters as plain text', () => {
      assert.deepEqual(
        titlesFound({ q: 'movement.*' }),
        titlesFound({ q: 'movement' })
      )
      assert.deepEqual(
        titlesFound({ q: '(animal' }),
        titlesFound({ q: 'animal' })
      )
      assert.deepEqual(titlesFound({ q: '[a-z]+' }), titlesFound({ q: 'a z' }))
    })

    test('finds every data asset when the search terms have no letters or numbers', () => {
      const found = search({ q: '?!' })

      assert.equal(found.total, search({}).total)
      assert.equal(
        readSearchQuery({ q: '?!' }, FILTER_OPTIONS).error,
        undefined
      )
    })

    test('matches accented letters however they are typed', () => {
      const collections = catalogueCopy()
      dataAssetIn(collections, 'DA11111').titleName = 'Symudiadau Dŵr'
      const changed = buildCatalogue(collections)

      assert.deepEqual(titlesFound({ q: 'dw\u0302r' }, changed), [
        'Symudiadau Dŵr'
      ])
    })

    test('accepts search terms of 100 characters', () => {
      const query = readSearchQuery({ q: 'a'.repeat(100) }, FILTER_OPTIONS)

      assert.equal(query.error, undefined)
    })

    test('rejects search terms of 101 characters', () => {
      const query = readSearchQuery({ q: 'a'.repeat(101) }, FILTER_OPTIONS)

      assert.equal(query.error, 'Search terms must be 100 characters or fewer')
      assert.equal(query.typedTerms, 'a'.repeat(101))
    })

    test('counts characters, not the code units JavaScript stores them in', () => {
      const atLimit = readSearchQuery({ q: '🐄'.repeat(100) }, FILTER_OPTIONS)
      const overLimit = readSearchQuery({ q: '🐄'.repeat(101) }, FILTER_OPTIONS)

      assert.equal(atLimit.error, undefined)
      assert.equal(
        overLimit.error,
        'Search terms must be 100 characters or fewer'
      )
    })

    test('counts the length after removing extra spaces', () => {
      const query = readSearchQuery(
        { q: `  ${'a'.repeat(100)}  ` },
        FILTER_OPTIONS
      )

      assert.equal(query.error, undefined)
    })

    test('ignores search terms that are not text', () => {
      const query = readSearchQuery({ q: ['animal', 'deaths'] }, FILTER_OPTIONS)

      assert.equal(query.terms, '')
      assert.equal(query.typedTerms, '')
    })
  })

  describe('filters', () => {
    const filterCases = [
      [
        { type: 'REFERENCE_DATA' },
        ['Breed Reference Data', 'Species Reference Data']
      ],
      [{ domain: 'ADDRESS' }, ['Holding Address']],
      [{ category: 'BREEDS' }, ['Breed Reference Data']],
      [{ organisation: 'Welsh Government' }, ['Animal Registrations']],
      [
        { 'delivery-group': 'Animal and Plant Delivery Group' },
        ['Animal Movement', 'Bovine TB Test Results', 'Livestock Holding']
      ]
    ]

    for (const [query, expected] of filterCases) {
      test(`filters by ${Object.keys(query)[0]}`, () => {
        assert.deepEqual(titlesFound(query), expected)
      })
    }

    test('widens the results with more options in one filter', () => {
      assert.deepEqual(
        titlesFound({ domain: ['ADDRESS', 'OPERATIONAL_INTELLIGENCE'] }),
        ['Holding Address', 'Livestock Movement Statistics']
      )
    })

    test('narrows the results across filters', () => {
      assert.deepEqual(
        titlesFound({ type: 'MASTER_DATA', domain: 'HOLDING' }),
        ['Keeper', 'Livestock Holding', 'Livestock Keeper']
      )
    })

    test('combines filters with search terms', () => {
      assert.deepEqual(
        titlesFound({ q: 'movement', type: 'TRANSACTIONAL_DATA' }),
        ['Animal Movement', 'Movement Restrictions']
      )
    })

    test('ignores filter values that are not known codes', () => {
      const query = readSearchQuery(
        { type: ['MASTER_DATA', 'WEATHER'], domain: 'DROP TABLE' },
        FILTER_OPTIONS
      )

      assert.deepEqual(query.selected.type, ['MASTER_DATA'])
      assert.deepEqual(query.selected.domain, [])
    })

    test('ignores filter values that are not text', () => {
      const query = readSearchQuery(
        { type: { $ne: 'x' }, domain: [['HOLDING']] },
        FILTER_OPTIONS
      )

      assert.deepEqual(query.selected.type, [])
      assert.deepEqual(query.selected.domain, [])
    })

    test('ignores a repeated filter value', () => {
      const query = readSearchQuery(
        { type: ['MASTER_DATA', 'MASTER_DATA'] },
        FILTER_OPTIONS
      )

      assert.deepEqual(query.selected.type, ['MASTER_DATA'])
    })

    test('offers only values that visible data assets use, in alphabetical order', () => {
      const domains = FILTER_OPTIONS.find(
        (filter) => filter.parameter === 'domain'
      ).options

      assert.deepEqual(
        domains.map((option) => option.text),
        [
          'Address',
          'Animal',
          'Disease & Testing',
          'Holding',
          'Operational Intelligence',
          'Reference Data',
          'Restrictions & Markers'
        ]
      )
    })

    test('does not offer an organisation that owns no visible data asset', () => {
      const organisations = FILTER_OPTIONS.find(
        (filter) => filter.parameter === 'organisation'
      ).options

      assert.ok(
        !organisations.some(
          (option) =>
            option.value === 'Agriculture and Horticulture Development Board'
        )
      )
    })

    test('has a filter for each of the 5 attributes in the plan', () => {
      assert.deepEqual(
        FILTERS.map((filter) => filter.parameter),
        ['type', 'domain', 'category', 'organisation', 'delivery-group']
      )
    })
  })

  describe('visibility', () => {
    test('never returns draft or retired data assets', () => {
      const titles = allTitlesFound({})

      assert.equal(titles.length, 12)
      assert.ok(!titles.includes('Animal Identity'))
      assert.ok(!titles.includes('Old Holdings'))
      assert.deepEqual(titlesFound({ q: 'Animal Identity' }), [])
      assert.deepEqual(titlesFound({ q: 'Old Holdings' }), [])
    })

    test('returns deprecated data assets', () => {
      assert.deepEqual(titlesFound({ q: 'keeper' }).slice(0, 2), [
        'Keeper',
        'Livestock Keeper'
      ])
    })
  })

  describe('pages', () => {
    test(`shows ${RESULTS_PER_PAGE} results a page, in title order without search terms`, () => {
      const firstPage = search({})

      assert.equal(firstPage.total, 12)
      assert.equal(firstPage.totalPages, 2)
      assert.equal(firstPage.dataAssets.length, 10)
      assert.equal(firstPage.dataAssets[0].titleName, 'Animal Deaths')
      assert.deepEqual(
        search({ page: '2' }).dataAssets.map(
          (dataAsset) => dataAsset.titleName
        ),
        ['Movement Restrictions', 'Species Reference Data']
      )
    })

    for (const page of ['0', '-1', 'two', '1.5', '3', '9999999', '']) {
      test(`shows page 1 for the page number "${page}"`, () => {
        assert.equal(search({ page }).page, 1)
      })
    }

    test('shows page 1 for a page number that is not text', () => {
      assert.equal(search({ page: ['2'] }).page, 1)
    })

    test('shows 1 page when nothing matches', () => {
      assert.deepEqual(search({ q: 'unicorn' }), {
        total: 0,
        page: 1,
        totalPages: 1,
        dataAssets: []
      })
    })
  })

  describe('search addresses', () => {
    test('include the search terms, every selected filter value and the page', () => {
      assert.equal(
        searchHref({
          terms: 'animal movement',
          selected: { type: ['MASTER_DATA'], domain: ['HOLDING'] },
          page: 2
        }),
        '/data-assets?q=animal+movement&type=MASTER_DATA&domain=HOLDING&page=2'
      )
    })

    test('leave out page 1 and empty values', () => {
      assert.equal(
        searchHref({ terms: '', selected: { type: [] }, page: 1 }),
        '/data-assets'
      )
      assert.equal(searchHref(), '/data-assets')
    })

    test('encode characters that are special in an address', () => {
      assert.equal(
        searchHref({ terms: 'a&b=c#d' }),
        '/data-assets?q=a%26b%3Dc%23d'
      )
    })
  })
})

describe('browsing on the home page', () => {
  const lists = browseLists(catalogue)

  test('counts visible data assets in each domain', () => {
    assert.deepEqual(
      lists.domains.map((domain) => [domain.text, domain.count]),
      [
        ['Address', 1],
        ['Animal', 3],
        ['Disease & Testing', 1],
        ['Holding', 3],
        ['Operational Intelligence', 1],
        ['Reference Data', 2],
        ['Restrictions & Markers', 1]
      ]
    )
    assert.equal(lists.domains[0].href, '/data-assets?domain=ADDRESS')
  })

  test('counts visible data assets for each owning organisation', () => {
    assert.deepEqual(
      lists.organisations.map((organisation) => [
        organisation.text,
        organisation.count
      ]),
      [
        ['Animal and Plant Health Agency', 3],
        ['Department for Environment, Food and Rural Affairs', 1],
        ['Livestock Information Ltd', 2],
        ['Rural Payments Agency', 4],
        ['Scottish Government', 1],
        ['Welsh Government', 1]
      ]
    )
    assert.equal(
      lists.organisations[3].href,
      '/data-assets?organisation=Rural+Payments+Agency'
    )
  })

  test('lists the 5 most recently updated visible data assets', () => {
    assert.deepEqual(
      lists.recentlyUpdated.map((dataAsset) => [
        dataAsset.titleName,
        dataAsset.modificationDate
      ]),
      [
        ['Animal Deaths', '2026-10-31'],
        ['Bovine TB Test Results', '2026-10-30'],
        ['Animal Movement', '2026-10-28'],
        ['Livestock Keeper', '2026-10-24'],
        ['Livestock Holding', '2026-10-21']
      ]
    )
  })

  test('lists data assets updated on the same day in title order', () => {
    const collections = catalogueCopy()
    dataAssetIn(collections, 'DA1111F').modificationDate = '2026-10-31'

    const changed = browseLists(buildCatalogue(collections))

    assert.deepEqual(
      changed.recentlyUpdated
        .slice(0, 2)
        .map((dataAsset) => dataAsset.titleName),
      ['Animal Deaths', 'Livestock Movement Statistics']
    )
  })

  test('never counts or lists a draft or retired data asset, even when it was updated most recently', () => {
    const collections = catalogueCopy()
    dataAssetIn(collections, 'DA11112').modificationDate = '2026-11-01'
    dataAssetIn(collections, 'DA11112').domainCode = 'ASSURANCE'
    dataAssetIn(collections, 'DA11116').modificationDate = '2026-11-02'

    const changed = browseLists(buildCatalogue(collections))

    assert.ok(
      !changed.recentlyUpdated.some((dataAsset) =>
        ['Animal Identity', 'Old Holdings'].includes(dataAsset.titleName)
      )
    )
    assert.ok(!changed.domains.some((domain) => domain.text === 'Assurance'))
  })

  test('summarises each data asset with the first sentence of its description', () => {
    assert.equal(
      lists.recentlyUpdated[2].summary,
      'Movements of cattle, sheep, goats and pigs between holdings.'
    )
    assert.equal(lists.recentlyUpdated[2].href, '/data-assets/DA11111')
  })
})

describe('formatting', () => {
  test('gives a date and time in UK time, in the GOV.UK style', () => {
    assert.equal(
      formatDateTime('2026-11-12T10:38:00Z'),
      '12 November 2026, 10:38am'
    )
    assert.equal(formatDateTime('2026-07-01T13:05:00Z'), '1 July 2026, 2:05pm')
    assert.equal(
      formatDateTime('2026-11-12T12:00:00Z'),
      '12 November 2026, midday'
    )
    assert.equal(
      formatDateTime('2026-11-12T00:00:00Z'),
      '12 November 2026, midnight'
    )
  })

  test('shows dates the GOV.UK way', () => {
    assert.equal(formatDate('2026-05-20'), '20 May 2026')
    assert.equal(formatDate('2026-03-29'), '29 March 2026')
    assert.equal(formatDate('9999-12-31'), '31 December 9999')
  })

  test('counts in words', () => {
    assert.equal(countOf(1, 'data asset', 'data assets'), '1 data asset')
    assert.equal(countOf(0, 'data asset', 'data assets'), '0 data assets')
    assert.equal(countOf(12, 'data asset', 'data assets'), '12 data assets')
  })
})

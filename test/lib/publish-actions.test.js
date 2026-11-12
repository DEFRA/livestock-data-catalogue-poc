import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { publicationActions } from '../../app/lib/manage/publish.js'
import { publicationChecks } from '../../app/schemas/catalogue/publication.js'
import { TODAY, catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

const ADDRESS = '/manage/data-assets/DA11111'

function actionsFor(update, { canAssignRoles = true } = {}) {
  const dataAsset = dataAssetIn(catalogueCopy(), 'DA11111')
  update(dataAsset)
  return publicationActions(
    { identifier: 'DA11111', canAssignRoles },
    publicationChecks(dataAsset, { today: TODAY })
  ).map(({ text, href }) => [text, href.replace(ADDRESS, '')])
}

describe('what to do before publishing (S26)', () => {
  test('nothing for a data asset that passes every check', () => {
    assert.deepEqual(
      actionsFor(() => {}),
      []
    )
  })

  test('dates in the wrong order link to the page that corrects them', () => {
    assert.deepEqual(
      actionsFor((dataAsset) => {
        dataAsset.creationDate = '2026-11-01'
        dataAsset.acceptanceDate = '2026-10-01'
        dataAsset.modificationDate = '2026-10-31'
        dataAsset.validFromDate = '2026-01-02'
        dataAsset.validToDate = '2026-01-01'
        dataAsset.coverageStartDate = '2025-02-01'
        dataAsset.coverageEndDate = '2025-01-01'
        dataAsset.lastReviewedDate = '2026-10-01'
        dataAsset.nextReviewDate = '2026-09-01'
      }),
      [
        [
          'correct the date the data asset was created, which is after the date it was accepted',
          '/dates/created'
        ],
        [
          'correct the date the data was last changed, which is before the date it was created',
          '/dates/last-changed'
        ],
        [
          'correct the date the data asset is valid to, which is before the date it is valid from',
          '/dates/valid'
        ],
        [
          'correct the period the data covers, which ends before it starts',
          '/dates/coverage'
        ],
        [
          'correct the next review date, which is before the last review',
          '/review/record'
        ]
      ]
    )
  })

  test('an incomplete distribution links to each question about it, once', () => {
    assert.deepEqual(
      actionsFor((dataAsset) => {
        const [distribution] = dataAsset.distributions
        delete distribution.distributionTypeCode
        delete distribution.accessMethodCode
        delete distribution.authenticationMethodCode
        delete distribution.distributionFormatCode
        delete distribution.licenceCode
        distribution.accessReference = 'not an address'
        distribution.downloadReference = 'not one either'
      }),
      [
        [
          'say what type of distribution Movements API is',
          '/distributions/0/type'
        ],
        ['say how Movements API is accessed', '/distributions/0/access-method'],
        [
          'say what authentication Movements API needs',
          '/distributions/0/authentication'
        ],
        [
          'give the distribution Movements API a format',
          '/distributions/0/format'
        ],
        [
          'give the distribution Movements API a licence',
          '/distributions/0/licence'
        ],
        ['correct the addresses of Movements API', '/distributions/0/addresses']
      ]
    )
  })

  test('a broker address that is not valid links to the addresses', () => {
    assert.deepEqual(
      actionsFor((dataAsset) => {
        dataAsset.distributions[1].brokerReference = 'not an address'
      }),
      [
        [
          'correct the addresses of Movement events',
          '/distributions/1/addresses'
        ]
      ]
    )
  })

  test('a missing data owner and data steward: a catalogue administrator adds them, a data steward asks', () => {
    const removeRoles = (dataAsset) => {
      dataAsset.governanceAssignments = []
    }

    assert.deepEqual(actionsFor(removeRoles), [
      ['add a data owner', '/responsibility/data-owner/add'],
      ['add a data steward', '/responsibility/data-steward/add']
    ])
    assert.deepEqual(actionsFor(removeRoles, { canAssignRoles: false }), [
      ['ask a catalogue administrator to add a data owner', '/responsibility'],
      ['ask a catalogue administrator to add a data steward', '/responsibility']
    ])
  })

  test('a missing Metadata Date is fixed by saving the title again', () => {
    assert.deepEqual(
      actionsFor((dataAsset) => {
        delete dataAsset.metadataDate
      }),
      [['save the title again to date this entry', '/about/title']]
    )
  })
})

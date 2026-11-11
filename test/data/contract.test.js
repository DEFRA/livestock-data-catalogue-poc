import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { findSchemaErrors } from '../../schemas/catalogue/index.js'
import { catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

function errorsAfter(change) {
  const collections = catalogueCopy()
  change(collections)
  return findSchemaErrors(collections)
}

function assertRejected(errors, expectedText) {
  assert.ok(
    errors.some((error) => error.includes(expectedText)),
    `expected an error mentioning ${expectedText}, got: ${errors.join('; ') || 'no errors'}`
  )
}

describe('the data contract', () => {
  test('every record in every file matches its collection schema', () => {
    assert.deepEqual(findSchemaErrors(catalogueCopy()), [])
  })

  test('a draft data asset needs only an identifier, title, description, owner and publication state', () => {
    const errors = errorsAfter((collections) => {
      const draft = dataAssetIn(collections, 'DA11112')
      collections.dataAssets.splice(collections.dataAssets.indexOf(draft), 1, {
        identifier: draft.identifier,
        titleName: draft.titleName,
        description: draft.description,
        organisationName: draft.organisationName,
        publicationStateCode: 'DRAFT',
        systemCreatedDateTime: draft.systemCreatedDateTime,
        systemCreatedByUserId: draft.systemCreatedByUserId,
        systemUpdatedDateTime: draft.systemUpdatedDateTime,
        systemUpdatedByUserId: draft.systemUpdatedByUserId
      })
    })

    assert.deepEqual(errors, [])
  })

  for (const field of [
    'identifier',
    'titleName',
    'description',
    'organisationName',
    'publicationStateCode'
  ]) {
    test(`rejects a data asset with no ${field}`, () => {
      const errors = errorsAfter((collections) => {
        delete dataAssetIn(collections, 'DA11112')[field]
      })

      assertRejected(errors, `"[1].${field}" is required`)
    })
  }

  for (const field of [
    'name',
    'securityClassificationCode',
    'retentionPeriodDescription'
  ]) {
    test(`rejects an information asset with no ${field}`, () => {
      const errors = errorsAfter((collections) => {
        delete collections.informationAssets[0][field]
      })

      assertRejected(
        errors,
        `informationAssets[0][${field}]: "[0].${field}" is required`
      )
    })
  }

  for (const identifier of [
    'DA1111I',
    'DA1111L',
    'DA11110',
    'DA111111',
    'da11111'
  ]) {
    test(`rejects the data asset identifier ${identifier}`, () => {
      const errors = errorsAfter((collections) => {
        dataAssetIn(collections, 'DA11111').identifier = identifier
      })

      assertRejected(errors, '"[0].identifier" with value')
    })
  }

  test('rejects a field that is not in the contract', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11111').summaryDescription =
        'Not in model V0.11'
    })

    assertRejected(errors, '"[0].summaryDescription" is not allowed')
  })

  test('rejects a date that does not exist', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11111').creationDate = '2026-02-30'
    })

    assertRejected(errors, '"[0].creationDate" contains an invalid value')
  })

  test('rejects a date that is not in ISO 8601 format', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11111').creationDate = '01/04/2024'
    })

    assertRejected(
      errors,
      '"[0].creationDate" with value "01/04/2024" fails to match'
    )
  })

  // V0.11 asks only that each of these is a valid URI, with no rule on its
  // scheme (S01, S13, S15, S18, S23 and S24)
  const ADDRESS_ATTRIBUTES = [
    [
      'an organisation website',
      'websiteReference',
      (collections) => collections.organisations[0]
    ],
    [
      'a data service endpoint',
      'endpointReference',
      (collections) => collections.dataServices[0]
    ],
    [
      'a category vocabulary',
      'vocabularyReference',
      (collections) => collections.categories[0]
    ],
    [
      'a jurisdiction reference',
      'reference',
      (collections) => collections.jurisdictions[0]
    ],
    [
      'a licence reference',
      'reference',
      (collections) => collections.licences[0]
    ],
    [
      'a distribution access address',
      'accessReference',
      (collections) => dataAssetIn(collections, 'DA11111').distributions[0]
    ],
    [
      'a distribution download address',
      'downloadReference',
      (collections) => dataAssetIn(collections, 'DA11111').distributions[0]
    ],
    [
      'a distribution broker address',
      'brokerReference',
      (collections) => dataAssetIn(collections, 'DA11111').distributions[1]
    ]
  ]

  for (const [description, field, recordIn] of ADDRESS_ATTRIBUTES) {
    test(`accepts ${description} with a scheme other than https`, () => {
      const errors = errorsAfter((collections) => {
        recordIn(collections)[field] = 'sftp://files.example.org/livestock/'
      })

      assert.deepEqual(errors, [])
    })

    test(`rejects ${description} that is not a well-formed URI`, () => {
      const errors = errorsAfter((collections) => {
        recordIn(collections)[field] = 'files.example.org/livestock'
      })

      assertRejected(errors, `${field}" must be a valid uri`)
    })
  }

  for (const [description, address] of [
    ['a space in it', 'https://api.example.org/animal movements'],
    ['a space at the start', ' https://api.example.org/movements'],
    ['a line break at the end', 'https://api.example.org/movements\n'],
    ['a tab in it', 'https://api.example.org/\tmovements'],
    ['a null character in it', 'https://api.example.org/\u0000movements']
  ]) {
    test(`rejects an address with ${description}`, () => {
      const errors = errorsAfter((collections) => {
        dataAssetIn(collections, 'DA11111').distributions[0].accessReference =
          address
      })

      assertRejected(errors, 'accessReference" must be a valid uri')
    })
  }

  test('rejects an email address with characters that could change a mailto: link', () => {
    for (const address of [
      'jo.bloggs?cc=someone@example.com',
      'jo.bloggs&body=hello@example.com',
      'jo.bloggs#top@example.com',
      'jo.bloggs%20@example.com'
    ]) {
      const errors = errorsAfter((collections) => {
        collections.people[0].emailAddressReference = address
      })

      assertRejected(
        errors,
        'emailAddressReference" with value "' + address + '" fails to match'
      )
    }
  })

  test('accepts an email address with an apostrophe or a plus sign', () => {
    const errors = errorsAfter((collections) => {
      collections.people[0].emailAddressReference =
        "jo.o'bloggs+data@example.com"
    })

    assert.ok(
      !errors.some((error) => error.includes('emailAddressReference')),
      errors.join('; ')
    )
  })

  test('rejects a negative byte size', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11113').distributions[0].byteSizeQuantity = -1
    })

    assertRejected(
      errors,
      'byteSizeQuantity" must be greater than or equal to 0'
    )
  })

  test('rejects a review frequency of less than 1 month', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11111').reviewFrequencyMonthQuantity = 0
    })

    assertRejected(
      errors,
      'reviewFrequencyMonthQuantity" must be greater than or equal to 1'
    )
  })

  test('rejects the same category twice on one data asset', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11111').categoryCodes.push('MOVEMENT')
    })

    assertRejected(errors, 'categoryCodes[4]" contains a duplicate value')
  })

  test('rejects the same keyword twice on one data asset, ignoring case', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11111').keywordNames.push('CATTLE')
    })

    assertRejected(errors, 'keywordNames[4]" contains a duplicate value')
  })

  test('rejects a keyword with no language code', () => {
    const errors = errorsAfter((collections) => {
      delete collections.keywords[0].languageCode
    })

    assertRejected(errors, '"[0].languageCode" is required')
  })

  for (const languageCode of ['EN', 'eng', 'en-GB', '', 'xx', 'fr']) {
    test(`rejects the keyword language code "${languageCode}", which is not on the list of allowed languages`, () => {
      const errors = errorsAfter((collections) => {
        collections.keywords[0].languageCode = languageCode
      })

      assertRejected(errors, '"[0].languageCode"')
    })
  }

  test('rejects the same jurisdiction twice on one data asset', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11111').jurisdictionCodes.push('GB-ENG')
    })

    assertRejected(errors, 'jurisdictionCodes[1]" contains a duplicate value')
  })

  test('rejects the same relationship twice', () => {
    const errors = errorsAfter((collections) => {
      const relationships = dataAssetIn(collections, 'DA11111').relationships
      relationships.push({ ...relationships[1] })
    })

    assertRejected(errors, 'relationships[2]" contains a duplicate value')
  })

  test('rejects a person whose email address is not well formed', () => {
    const errors = errorsAfter((collections) => {
      collections.people[0].emailAddressReference = 'jo.bloggs'
    })

    assertRejected(errors, 'emailAddressReference" must be a valid email')
  })

  test('rejects a core record without its system attributes', () => {
    const errors = errorsAfter((collections) => {
      delete collections.organisations[0].systemCreatedByUserId
    })

    assertRejected(
      errors,
      'organisations[0][systemCreatedByUserId]: "[0].systemCreatedByUserId" is required'
    )
  })

  test('rejects a reference value with no name', () => {
    const errors = errorsAfter((collections) => {
      delete collections.domains[0].name
    })

    assertRejected(errors, 'domains[0][name]')
  })

  test('rejects a licence with a description, which S23 does not give it', () => {
    const errors = errorsAfter((collections) => {
      collections.licences[0].description = 'Free to reuse with attribution'
    })

    assertRejected(
      errors,
      'licences[0][description]: "[0].description" is not allowed'
    )
  })

  test('rejects a code list with no values', () => {
    const errors = errorsAfter((collections) => {
      collections.codeLists.securityClassifications = []
    })

    assertRejected(errors, 'codeLists[securityClassifications]')
  })

  test('rejects a missing collection', () => {
    const errors = errorsAfter((collections) => {
      delete collections.licences
    })

    assertRejected(errors, 'licences: "value" is required')
  })
})

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

  for (const field of ['titleName', 'description', 'organisationName']) {
    test(`rejects a data asset with no ${field}`, () => {
      const errors = errorsAfter((collections) => {
        delete dataAssetIn(collections, 'DA11112')[field]
      })

      assertRejected(errors, `"[1].${field}" is required`)
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

  test('rejects an access address that is not https', () => {
    const errors = errorsAfter((collections) => {
      dataAssetIn(collections, 'DA11111').distributions[0].accessReference =
        'http://api.example.org/movements'
    })

    assertRejected(
      errors,
      'accessReference" must be a valid uri with a scheme matching the https pattern'
    )
  })

  test('rejects a script address in a website reference', () => {
    const errors = errorsAfter((collections) => {
      collections.organisations[0].websiteReference = 'javascript:alert(1)'
    })

    assertRejected(errors, 'websiteReference" must be a valid uri')
  })

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

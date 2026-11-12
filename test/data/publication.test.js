import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { outstandingForPublication } from '../../app/schemas/catalogue/publication.js'
import { TODAY, catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

function animalMovement() {
  return dataAssetIn(catalogueCopy(), 'DA11111')
}

function outstanding(dataAsset, today = TODAY) {
  return outstandingForPublication(dataAsset, { today })
}

describe('the publication checks (S26)', () => {
  test('a complete data asset has nothing outstanding', () => {
    assert.deepEqual(outstanding(animalMovement()), [])
  })

  test('lists each mandatory attribute that is missing', () => {
    const dataAsset = animalMovement()
    delete dataAsset.provenanceDescription
    delete dataAsset.updateFrequencyCode

    assert.deepEqual(outstanding(dataAsset), [
      'Provenance Description is outstanding',
      'Update Frequency Code is outstanding'
    ])
  })

  test('does not need a Valid To Date, because a data asset can be valid with no end date (S06)', () => {
    const dataAsset = animalMovement()
    delete dataAsset.validToDate

    assert.deepEqual(outstanding(dataAsset), [])
  })

  for (const [field, message] of [
    ['categoryCodes', 'At least one Category is required'],
    ['keywordNames', 'At least one Keyword is required'],
    ['jurisdictionCodes', 'At least one Jurisdiction is required']
  ]) {
    test(`needs ${field} to have at least one value`, () => {
      const dataAsset = animalMovement()
      dataAsset[field] = []

      assert.deepEqual(outstanding(dataAsset), [message])
    })
  }

  test('needs a current Data Owner', () => {
    const dataAsset = animalMovement()
    dataAsset.governanceAssignments[0].effectiveToDate = '2026-01-31'

    assert.deepEqual(outstanding(dataAsset), [
      'Exactly one current Data Owner is required'
    ])
  })

  test('needs a current Data Steward', () => {
    const dataAsset = animalMovement()
    dataAsset.governanceAssignments = dataAsset.governanceAssignments.filter(
      (assignment) => assignment.governanceRoleCode === 'DATA_OWNER'
    )

    assert.deepEqual(outstanding(dataAsset), [
      'At least one current Data Steward is required'
    ])
  })

  test('does not count a Data Steward whose assignment has not started', () => {
    const dataAsset = animalMovement()
    dataAsset.governanceAssignments = dataAsset.governanceAssignments.filter(
      (assignment) => assignment.personName !== 'Sam Specimen'
    )

    assert.deepEqual(outstanding(dataAsset), [
      'At least one current Data Steward is required'
    ])
    assert.deepEqual(outstanding(dataAsset, '2027-01-04'), [])
  })

  test('counts an assignment as current on the day it ends', () => {
    const dataAsset = animalMovement()
    dataAsset.governanceAssignments[0].effectiveToDate = TODAY

    assert.deepEqual(outstanding(dataAsset), [])
  })

  test('lists dates that conflict', () => {
    const dataAsset = animalMovement()
    dataAsset.validToDate = '2024-01-01'

    assert.deepEqual(outstanding(dataAsset), [
      'Valid To Date cannot be before Valid From Date'
    ])
  })

  test('needs at least one distribution', () => {
    const dataAsset = animalMovement()
    dataAsset.distributions = []

    assert.deepEqual(outstanding(dataAsset), [
      'At least one Distribution is required'
    ])
  })

  test('needs a distribution even when the access rights say none is available', () => {
    const dataAsset = animalMovement()
    dataAsset.distributions = []
    dataAsset.accessRightsDescription =
      'No distribution is available. Ask the Data Owner for access.'

    assert.deepEqual(outstanding(dataAsset), [
      'At least one Distribution is required'
    ])
  })

  test('needs a format and a licence for each distribution', () => {
    const dataAsset = animalMovement()
    delete dataAsset.distributions[0].distributionFormatCode
    delete dataAsset.distributions[1].licenceCode

    assert.deepEqual(outstanding(dataAsset), [
      'Distribution "Movements API" needs a Format',
      'Distribution "Movement events" needs a Licence'
    ])
  })

  test('accepts NOT_APPLICABLE as the licence for every distribution (S23)', () => {
    const dataAsset = animalMovement()
    for (const distribution of dataAsset.distributions) {
      distribution.licenceCode = 'NOT_APPLICABLE'
    }

    assert.deepEqual(outstanding(dataAsset), [])
  })

  test('needs a type, access method and authentication method for each distribution', () => {
    const dataAsset = animalMovement()
    delete dataAsset.distributions[0].distributionTypeCode
    delete dataAsset.distributions[0].accessMethodCode
    delete dataAsset.distributions[0].authenticationMethodCode

    assert.deepEqual(outstanding(dataAsset), [
      'Distribution "Movements API": Distribution Type Code is outstanding',
      'Distribution "Movements API": Access Method Code is outstanding',
      'Distribution "Movements API": Authentication Method Code is outstanding'
    ])
  })

  test('accepts distribution references that are valid URIs, with any scheme', () => {
    const dataAsset = animalMovement()
    dataAsset.distributions[0].downloadReference =
      'sftp://files.example.org/movements.csv'

    assert.deepEqual(outstanding(dataAsset), [])
  })

  test('lists each distribution reference that is not a valid URI', () => {
    const dataAsset = animalMovement()
    dataAsset.distributions[0].accessReference = 'api.example.org/movements'
    dataAsset.distributions[0].downloadReference =
      'https://files.example.org/animal movements.csv'
    dataAsset.distributions[1].brokerReference = 'broker.example.org'

    assert.deepEqual(outstanding(dataAsset), [
      'Distribution "Movements API": Access Reference is not a valid URI',
      'Distribution "Movements API": Download Reference is not a valid URI',
      'Distribution "Movement events": Broker Reference is not a valid URI'
    ])
  })

  test('needs an information asset for the security classification and retention period', () => {
    const dataAsset = animalMovement()
    delete dataAsset.informationAssetName

    assert.deepEqual(outstanding(dataAsset), [
      'Security Classification and Retention Period are required'
    ])
  })

  test('reports every outstanding check at once', () => {
    const dataAsset = animalMovement()
    dataAsset.categoryCodes = []
    dataAsset.governanceAssignments = []

    assert.deepEqual(outstanding(dataAsset), [
      'At least one Category is required',
      'Exactly one current Data Owner is required',
      'At least one current Data Steward is required'
    ])
  })

  test('does not need an Acceptance Date, which the catalogue sets when it is first published (LDAT-252, question 29)', () => {
    const dataAsset = animalMovement()
    delete dataAsset.acceptanceDate

    assert.deepEqual(outstanding(dataAsset), [])
  })

  test('does not need a Data Custodian', () => {
    const dataAsset = animalMovement()
    delete dataAsset.custodians

    assert.deepEqual(outstanding(dataAsset), [])
  })

  test('does not need a source relationship', () => {
    const dataAsset = animalMovement()
    delete dataAsset.relationships

    assert.deepEqual(outstanding(dataAsset), [])
  })
})

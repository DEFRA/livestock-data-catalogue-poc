import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  buildCatalogue,
  catalogue,
  personKey
} from '../../app/lib/catalogue-data.js'
import { today } from '../../app/lib/clock.js'
import {
  isDataAssetIdentifier,
  nextDataAssetIdentifier
} from '../../app/lib/identifiers.js'
import {
  nameFor,
  referenceValue,
  referenceValues
} from '../../app/lib/reference-data.js'
import {
  findVisibleDataAsset,
  isVisible,
  visibleDataAssets
} from '../../app/lib/visibility.js'
import { catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

describe('reading the catalogue', () => {
  test('loads every collection and finds records by their business keys', () => {
    assert.equal(catalogue.collections.dataAssets.length, 14)
    assert.equal(
      catalogue.dataAssetsByIdentifier.get('DA11111').titleName,
      'Animal Movement'
    )
    assert.equal(
      catalogue.organisationsByName.get('Rural Payments Agency')
        .abbreviatedName,
      'RPA'
    )
    assert.equal(
      catalogue.peopleByKey.get(personKey('Jo Bloggs', 'jo.bloggs@example.com'))
        .organisationName,
      'Animal and Plant Health Agency'
    )
    assert.equal(
      catalogue.dataServicesByTitle.get('Breed Codes API').endpointReference,
      'https://api.example.org/breeds'
    )
    assert.equal(
      catalogue.peopleByEntraId.get('8d8f18d7-ef4f-4188-b706-90c58a9d0fb3')
        .name,
      'Jo Bloggs'
    )
    assert.equal(
      catalogue.informationAssetsByName.get('Animal Disease Records')
        .securityClassificationCode,
      'OFFICIAL_SENSITIVE'
    )
    assert.equal(
      catalogue.deliveryGroupsByName.get('Animal and Plant Delivery Group')
        .organisationName,
      'Digital, Data and Technology Services'
    )
  })

  test('cannot be changed once loaded', () => {
    const dataAsset = catalogue.dataAssetsByIdentifier.get('DA11111')

    assert.throws(() => {
      dataAsset.titleName = 'Changed'
    }, TypeError)
    assert.throws(() => {
      dataAsset.distributions.push({ name: 'Another' })
    }, TypeError)
  })
})

describe('visibility (S11)', () => {
  test('shows published and deprecated data assets', () => {
    assert.equal(
      isVisible(catalogue.dataAssetsByIdentifier.get('DA11111')),
      true
    )
    assert.equal(
      isVisible(catalogue.dataAssetsByIdentifier.get('DA11114')),
      true
    )
  })

  test('hides draft and retired data assets', () => {
    assert.equal(
      isVisible(catalogue.dataAssetsByIdentifier.get('DA11112')),
      false
    )
    assert.equal(
      isVisible(catalogue.dataAssetsByIdentifier.get('DA11116')),
      false
    )
  })

  test('hides a data asset with an unknown publication state', () => {
    assert.equal(isVisible({ publicationStateCode: 'UNDER_REVIEW' }), false)
    assert.equal(isVisible({}), false)
    assert.equal(isVisible(undefined), false)
  })

  test('lists only visible data assets', () => {
    const identifiers = visibleDataAssets(catalogue).map(
      (dataAsset) => dataAsset.identifier
    )

    assert.equal(identifiers.length, 12)
    assert.ok(!identifiers.includes('DA11112'))
    assert.ok(!identifiers.includes('DA11116'))
  })

  test('finds a visible data asset by its identifier, and nothing for a hidden or unknown one', () => {
    assert.equal(
      findVisibleDataAsset(catalogue, 'DA11111').titleName,
      'Animal Movement'
    )
    assert.equal(findVisibleDataAsset(catalogue, 'DA11112'), undefined)
    assert.equal(findVisibleDataAsset(catalogue, 'DA99999'), undefined)
  })
})

describe('reference data', () => {
  test('names a code from its reference collection', () => {
    assert.equal(
      nameFor(catalogue, 'domains', 'DISEASE_AND_TESTING'),
      'Disease & Testing'
    )
  })

  test('names a code from a code list', () => {
    assert.equal(
      nameFor(catalogue, 'securityClassifications', 'OFFICIAL_SENSITIVE'),
      'OFFICIAL-SENSITIVE'
    )
    assert.equal(
      nameFor(catalogue, 'updateFrequencies', 'REAL_TIME'),
      'Real time'
    )
  })

  test('gives the whole reference value when a page needs more than its name', () => {
    assert.equal(
      referenceValue(catalogue, 'distributionFormats', 'JSON').mediaType,
      'application/json'
    )
  })

  test('fails clearly when a code is missing from its list', () => {
    assert.throws(() => nameFor(catalogue, 'domains', 'WEATHER'), {
      message: 'No domains value has the code WEATHER'
    })
  })

  test('fails clearly when the list does not exist', () => {
    assert.throws(() => nameFor(catalogue, 'colours', 'RED'), {
      message: 'No colours value has the code RED'
    })
  })

  test('lists every value of a code list, in the order of the list', () => {
    assert.deepEqual(
      referenceValues(catalogue, 'relationshipTypes').map(
        (value) => value.code
      ),
      ['DERIVED_FROM', 'RELATED_TO', 'REFERENCED_BY', 'REPLACES', 'REPLACED_BY']
    )
  })

  test('fails clearly when a list to read in full does not exist', () => {
    assert.throws(() => referenceValues(catalogue, 'colours'), {
      message: 'There is no colours list'
    })
  })
})

describe('data asset identifiers (S05)', () => {
  test('accepts DA and 5 characters from 1 to 9 and A to Z, without I or L', () => {
    for (const identifier of ['DA11111', 'DA1111A', 'DAZZZZZ', 'DA1HJKM']) {
      assert.equal(isDataAssetIdentifier(identifier), true, identifier)
    }
  })

  test('rejects anything else', () => {
    for (const identifier of [
      'DA1111I',
      'DA1111L',
      'DA11110',
      'da11111',
      'DA111111',
      'DA1111',
      ' DA11111',
      '',
      undefined,
      ['DA11111']
    ]) {
      assert.equal(isDataAssetIdentifier(identifier), false, String(identifier))
    }
  })

  test('issues the identifier after the highest one, counting 1 to 9 then A to Z without I or L', () => {
    assert.equal(nextDataAssetIdentifier(['DA11111']), 'DA11112')
    assert.equal(nextDataAssetIdentifier(['DA11119']), 'DA1111A')
    assert.equal(nextDataAssetIdentifier(['DA1111H']), 'DA1111J')
    assert.equal(nextDataAssetIdentifier(['DA1111K']), 'DA1111M')
    assert.equal(nextDataAssetIdentifier(['DA1111Z']), 'DA11121')
  })

  test('never reuses an identifier, even when lower ones are free', () => {
    assert.equal(
      nextDataAssetIdentifier(['DA11111', 'DA1111C', 'DA11115']),
      'DA1111D'
    )
  })

  test('starts at DA11111, ignores anything that is not an identifier, and stops after DAZZZZZ', () => {
    assert.equal(nextDataAssetIdentifier([]), 'DA11111')
    assert.equal(nextDataAssetIdentifier(['DB99999', 'DA1111I']), 'DA11111')
    assert.equal(nextDataAssetIdentifier(['DAZZZZY']), 'DAZZZZZ')
    assert.equal(nextDataAssetIdentifier(['DAZZZZZ']), undefined)
  })
})

describe('the clock', () => {
  test('gives the date in the UK, not in UTC', () => {
    assert.equal(today(new Date('2026-06-30T23:30:00Z')), '2026-07-01')
    assert.equal(today(new Date('2026-12-31T23:30:00Z')), '2026-12-31')
  })

  test('gives today by default', () => {
    assert.match(today(), /^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('building a catalogue from other data', () => {
  test('uses the records it is given', () => {
    const collections = catalogueCopy()
    dataAssetIn(collections, 'DA11111').titleName = 'Changed title'

    const changed = buildCatalogue(collections)

    assert.equal(
      changed.dataAssetsByIdentifier.get('DA11111').titleName,
      'Changed title'
    )
    assert.equal(
      catalogue.dataAssetsByIdentifier.get('DA11111').titleName,
      'Animal Movement'
    )
  })
})

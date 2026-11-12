import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildCatalogue } from '../../app/lib/catalogue-data.js'
import {
  PERSONAS,
  canAssignRoles,
  canCreate,
  canManage,
  managedDataAssets,
  managesDataAssets,
  personaDescription,
  personaFor
} from '../../app/lib/personas.js'
import { TODAY, catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

const STEWARD = personaFor('data-steward')
const ADMINISTRATOR = personaFor('catalogue-administrator')
const USER = personaFor('catalogue-user')

function identifiersManagedBy(persona, catalogue, today = TODAY) {
  return managedDataAssets(catalogue, persona, today)
    .map((dataAsset) => dataAsset.identifier)
    .sort()
}

describe('personas', () => {
  test('are a catalogue user, a data steward and a catalogue administrator', () => {
    assert.deepEqual(
      PERSONAS.map((persona) => persona.id),
      ['catalogue-user', 'data-steward', 'catalogue-administrator']
    )
  })

  test('a catalogue user, the default, for an unknown or missing choice', () => {
    assert.equal(personaFor(undefined), USER)
    assert.equal(personaFor('root'), USER)
    assert.equal(personaFor('constructor'), USER)
  })

  test('are described by the made-up person and their role', () => {
    const catalogue = buildCatalogue(catalogueCopy())

    assert.equal(
      personaDescription(catalogue, STEWARD),
      'Sam Specimen, data steward, Animal and Plant Health Agency'
    )
    assert.equal(personaDescription(catalogue, USER), 'A catalogue user')
  })

  test('only a catalogue administrator creates data assets and says who is responsible (question 24)', () => {
    assert.deepEqual(
      PERSONAS.map((persona) => [
        persona.id,
        managesDataAssets(persona),
        canCreate(persona),
        canAssignRoles(persona)
      ]),
      [
        ['catalogue-user', false, false, false],
        ['data-steward', true, false, false],
        ['catalogue-administrator', true, true, true]
      ]
    )
  })
})

describe('who manages a data asset', () => {
  test('a catalogue administrator manages every data asset, in any state', () => {
    const catalogue = buildCatalogue(catalogueCopy())

    assert.equal(
      identifiersManagedBy(ADMINISTRATOR, catalogue).length,
      catalogue.collections.dataAssets.length
    )
  })

  test('a data steward manages the data assets where they are a current data owner or data steward', () => {
    const catalogue = buildCatalogue(catalogueCopy())

    assert.deepEqual(identifiersManagedBy(STEWARD, catalogue), [
      'DA11111',
      'DA11112',
      'DA11117',
      'DA11118'
    ])
  })

  test('a catalogue user manages nothing', () => {
    const catalogue = buildCatalogue(catalogueCopy())

    assert.deepEqual(identifiersManagedBy(USER, catalogue), [])
  })

  test('a data steward does not manage a data asset before their assignment starts or after it ends', () => {
    const collections = catalogueCopy()
    const [assignment] = dataAssetIn(
      collections,
      'DA11117'
    ).governanceAssignments.filter(
      (candidate) => candidate.personName === 'Sam Specimen'
    )
    assignment.effectiveFromDate = '2026-11-05'
    const catalogue = buildCatalogue(collections)
    const dataAsset = catalogue.dataAssetsByIdentifier.get('DA11117')

    assert.equal(canManage(catalogue, STEWARD, dataAsset, TODAY), false)
    assert.equal(canManage(catalogue, STEWARD, dataAsset, '2026-11-05'), true)
  })

  test('a data steward stops managing a data asset after their assignment ends', () => {
    const collections = catalogueCopy()
    const [assignment] = dataAssetIn(
      collections,
      'DA11118'
    ).governanceAssignments.filter(
      (candidate) => candidate.personName === 'Sam Specimen'
    )
    assignment.effectiveToDate = '2026-11-03'
    const catalogue = buildCatalogue(collections)

    assert.deepEqual(identifiersManagedBy(STEWARD, catalogue), [
      'DA11111',
      'DA11112',
      'DA11117'
    ])
  })
})

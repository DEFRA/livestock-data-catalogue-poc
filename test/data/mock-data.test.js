import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { isVisible } from '../../app/lib/visibility.js'
import { catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

// Domains reserved for examples (RFC 2606 and RFC 6761), which nobody can
// register, so a made-up link or email address can never reach anyone
const RESERVED_FOR_EXAMPLES = /(^|\.)example\.(com|net|org)$|\.example$/

function domainOf(address) {
  return address.includes('://')
    ? new URL(address).hostname
    : address.slice(address.lastIndexOf('@') + 1)
}

// Every address in the mock data that is made up. Organisation websites
// and licence references are real, public addresses, so they're left out.
function madeUpAddresses(collections) {
  const people = collections.people.map(
    (person) => person.emailAddressReference
  )
  const dataServices = collections.dataServices.map(
    (dataService) => dataService.endpointReference
  )
  const dataAssets = collections.dataAssets.flatMap((dataAsset) => [
    ...(dataAsset.governanceAssignments ?? []).map(
      (assignment) => assignment.personEmailAddressReference
    ),
    ...(dataAsset.relationships ?? [])
      .map((relationship) => relationship.targetResourceIdentifier)
      .filter((target) => target.includes('://')),
    ...(dataAsset.distributions ?? []).flatMap((distribution) => [
      distribution.accessReference,
      distribution.downloadReference,
      distribution.brokerReference
    ])
  ])
  return [...people, ...dataServices, ...dataAssets].filter(Boolean)
}

// S06: the Metadata Date is set to today when the catalogue metadata
// changes, so it can't be before the record's last update. That update
// is in UTC, and today's date in London is never before the UTC date.
function metadataDatesBeforeLastUpdate(collections) {
  return collections.dataAssets
    .filter(isVisible)
    .filter(
      (dataAsset) =>
        dataAsset.metadataDate < dataAsset.systemUpdatedDateTime.slice(0, 10)
    )
    .map((dataAsset) => dataAsset.identifier)
}

describe('the mock data', () => {
  test('uses only domains reserved for examples in made-up email and web addresses', () => {
    const addresses = madeUpAddresses(catalogueCopy())

    assert.ok(addresses.length > 0)
    assert.deepEqual(
      addresses.filter(
        (address) => !RESERVED_FOR_EXAMPLES.test(domainOf(address))
      ),
      []
    )
  })

  test('finds a made-up address on a domain that is not reserved for examples', () => {
    const collections = catalogueCopy()
    collections.people[0].emailAddressReference = 'jo.bloggs@example.co.uk'

    assert.deepEqual(
      madeUpAddresses(collections).filter(
        (address) => !RESERVED_FOR_EXAMPLES.test(domainOf(address))
      ),
      ['jo.bloggs@example.co.uk']
    )
  })

  test('gives each visible data asset a metadata date no earlier than its last update (S06)', () => {
    assert.deepEqual(metadataDatesBeforeLastUpdate(catalogueCopy()), [])
  })

  test('finds a visible data asset whose metadata date is before its last update', () => {
    const collections = catalogueCopy()
    dataAssetIn(collections, 'DA11111').metadataDate = '2026-10-27'

    assert.deepEqual(metadataDatesBeforeLastUpdate(collections), ['DA11111'])
  })
})

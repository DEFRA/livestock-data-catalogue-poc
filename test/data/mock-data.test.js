import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { catalogueCopy } from '../helpers/catalogue.js'

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
})

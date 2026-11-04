import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildCatalogue, catalogue } from '../../app/lib/catalogue-data.js'
import { dataAssetPage, formatByteSize } from '../../app/lib/data-asset-view.js'
import { TODAY, catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

function pageFor(
  identifier,
  { today = TODAY, fromCatalogue = catalogue } = {}
) {
  return dataAssetPage(
    fromCatalogue,
    fromCatalogue.dataAssetsByIdentifier.get(identifier),
    { today }
  )
}

function section(page, heading) {
  return page.sections.find((candidate) => candidate.heading === heading)
}

function row(rows, key) {
  return rows.find((candidate) => candidate.key === key)
}

function pageAfter(identifier, change, today = TODAY) {
  const collections = catalogueCopy()
  change(dataAssetIn(collections, identifier), collections)
  return pageFor(identifier, {
    today,
    fromCatalogue: buildCatalogue(collections)
  })
}

describe('the data asset page content', () => {
  describe('about the data asset', () => {
    const about = section(pageFor('DA11111'), 'About this data asset').rows

    test('shows names, never codes', () => {
      assert.equal(row(about, 'Data asset type').text, 'Transactional Data')
      assert.equal(row(about, 'Domain').text, 'Animal')
      assert.deepEqual(row(about, 'Categories').items, [
        'Animal Movement',
        'Cattle',
        'Sheep',
        'Pigs'
      ])
    })

    test('shows the keywords, identifier and version', () => {
      assert.deepEqual(row(about, 'Keywords').items, [
        'Cattle',
        'gwartheg',
        'Holding',
        'Movement'
      ])
      assert.equal(row(about, 'Identifier').text, 'DA11111')
      assert.equal(row(about, 'Version').text, '2.3')
    })

    test('leaves out rows without a value', () => {
      const restrictions = section(
        pageFor('DA11118'),
        'About this data asset'
      ).rows

      assert.equal(row(restrictions, 'Version'), undefined)
    })
  })

  describe('coverage and dates', () => {
    test('shows coverage and dates the GOV.UK way', () => {
      const coverage = section(pageFor('DA11111'), 'Coverage and dates').rows

      assert.deepEqual(row(coverage, 'Jurisdictions').items, ['England'])
      assert.equal(row(coverage, 'Time period').text, 'From 1 April 2024')
      assert.equal(row(coverage, 'Valid from').text, '1 April 2024')
      assert.equal(row(coverage, 'Update frequency').text, 'Real time')
      assert.equal(
        row(coverage, 'Last reviewed').text,
        '15 April 2026 by Jo Bloggs'
      )
      assert.equal(row(coverage, 'Next review').text, '15 April 2027')
    })

    test('shows the agreed open-ended value as Open-ended', () => {
      const coverage = section(pageFor('DA11111'), 'Coverage and dates').rows

      assert.equal(row(coverage, 'Valid to').text, 'Open-ended')
    })

    test('shows an end of validity as a date', () => {
      const coverage = section(pageFor('DA11114'), 'Coverage and dates').rows

      assert.equal(row(coverage, 'Valid to').text, '31 March 2027')
    })

    test('leaves out the end of validity when there is none', () => {
      const coverage = section(
        pageAfter('DA11111', (dataAsset) => {
          delete dataAsset.validToDate
        }),
        'Coverage and dates'
      ).rows

      assert.equal(row(coverage, 'Valid to'), undefined)
    })

    test('shows a time period with a start and an end, or an end only', () => {
      const both = pageAfter('DA11111', (dataAsset) => {
        dataAsset.temporalEndDate = '2026-03-31'
      })
      const endOnly = pageAfter('DA11111', (dataAsset) => {
        delete dataAsset.temporalStartDate
        dataAsset.temporalEndDate = '2026-03-31'
      })

      assert.equal(
        row(section(both, 'Coverage and dates').rows, 'Time period').text,
        '1 April 2024 to 31 March 2026'
      )
      assert.equal(
        row(section(endOnly, 'Coverage and dates').rows, 'Time period').text,
        'Until 31 March 2026'
      )
    })

    test('shows when it was last reviewed without a name when there is none', () => {
      const coverage = section(pageFor('DA11117'), 'Coverage and dates').rows

      assert.equal(row(coverage, 'Last reviewed').text, '1 July 2026')
    })
  })

  describe('responsibility (S17)', () => {
    test('shows the owner, linking to its search, and the delivery group', () => {
      const responsibility = section(pageFor('DA11111'), 'Responsibility').rows

      assert.deepEqual(row(responsibility, 'Owning organisation').link, {
        href: '/data-assets?organisation=Animal+and+Plant+Health+Agency',
        text: 'Animal and Plant Health Agency'
      })
      assert.deepEqual(row(responsibility, 'Delivery group').link, {
        href: '/data-assets?delivery-group=Animal+and+Plant+Delivery+Group',
        text: 'Animal and Plant Delivery Group'
      })
    })

    test('shows the current Data Owner with their organisation and email address', () => {
      const responsibility = section(pageFor('DA11111'), 'Responsibility').rows

      assert.deepEqual(row(responsibility, 'Data Owner').people, [
        {
          name: 'Jo Bloggs',
          organisationName: 'Animal and Plant Health Agency',
          emailAddress: 'jo.bloggs@example.com',
          emailHref: 'mailto:jo.bloggs@example.com'
        }
      ])
    })

    test('encodes the email address in its mailto: link', () => {
      const collections = catalogueCopy()
      const address = "jo.o'bloggs+data@example.com"
      collections.people.find(
        (person) => person.name === 'Jo Bloggs'
      ).emailAddressReference = address
      for (const dataAsset of collections.dataAssets) {
        for (const assignment of dataAsset.governanceAssignments ?? []) {
          if (assignment.personName === 'Jo Bloggs') {
            assignment.personEmailAddressReference = address
          }
        }
      }
      const page = pageFor('DA11111', {
        fromCatalogue: buildCatalogue(collections)
      })

      assert.equal(
        row(section(page, 'Responsibility').rows, 'Data Owner').people[0]
          .emailHref,
        "mailto:jo.o'bloggs%2Bdata@example.com"
      )
    })

    test('does not show a Data Steward whose assignment has not started', () => {
      const stewards = row(
        section(pageFor('DA11111'), 'Responsibility').rows,
        'Data Stewards'
      ).people

      assert.deepEqual(
        stewards.map((person) => person.name),
        ['Sam Smith']
      )
    })

    test('shows a Data Steward once their assignment has started', () => {
      const later = pageFor('DA11111', { today: '2027-01-04' })
      const stewards = row(
        section(later, 'Responsibility').rows,
        'Data Stewards'
      ).people

      assert.deepEqual(
        stewards.map((person) => person.name),
        ['Sam Smith', 'Alex Example']
      )
    })

    test('does not show a Data Steward whose assignment has ended', () => {
      const stewards = row(
        section(pageFor('DA11117'), 'Responsibility').rows,
        'Data Stewards'
      ).people

      assert.deepEqual(
        stewards.map((person) => person.name),
        ['Taylor Test']
      )
    })

    test('shows the current Data Custodian organisation', () => {
      const responsibility = section(pageFor('DA11115'), 'Responsibility').rows

      assert.equal(
        row(responsibility, 'Data Custodian').text,
        'Agriculture and Horticulture Development Board'
      )
    })

    test('leaves out the Data Custodian and delivery group when there are none', () => {
      const responsibility = section(pageFor('DA1111B'), 'Responsibility').rows

      assert.equal(row(responsibility, 'Data Custodian'), undefined)
      assert.equal(row(responsibility, 'Delivery group'), undefined)
    })

    test('leaves out a role with nobody currently in it', () => {
      const responsibility = section(
        pageAfter('DA11111', (dataAsset) => {
          dataAsset.governanceAssignments[0].effectiveToDate = '2026-01-31'
        }),
        'Responsibility'
      ).rows

      assert.equal(row(responsibility, 'Data Owner'), undefined)
    })
  })

  describe('access and use (S25)', () => {
    test('shows the security classification and retention period with the information asset they come from', () => {
      const access = section(pageFor('DA11117'), 'Access and use').rows

      assert.deepEqual(row(access, 'Security classification'), {
        key: 'Security classification',
        text: 'OFFICIAL-SENSITIVE',
        source: 'From the information asset Animal Disease Records'
      })
      assert.equal(
        row(access, 'Retention period').text,
        '10 years after the case is closed'
      )
    })

    test('shows the access rights, provenance, creator and lifecycle state', () => {
      const access = section(pageFor('DA11118'), 'Access and use').rows

      assert.match(
        row(access, 'Access rights').text,
        /^No distribution is available yet/
      )
      assert.equal(
        row(access, 'Provenance').text,
        'Recorded by APHA when it places or lifts a restriction'
      )
      assert.equal(row(access, 'Creator').text, 'APHA')
      assert.equal(row(access, 'Lifecycle state').text, 'In Development')
    })

    test('leaves out the security classification when there is no information asset', () => {
      const access = section(
        pageAfter('DA11111', (dataAsset) => {
          delete dataAsset.informationAssetName
        }),
        'Access and use'
      ).rows

      assert.equal(row(access, 'Security classification'), undefined)
    })
  })

  describe('distributions (S18 to S24)', () => {
    test('shows each distribution with names for its codes', () => {
      const [api] = pageFor('DA11111').distributions

      assert.equal(api.name, 'Movements API')
      assert.equal(row(api.rows, 'Type').text, 'API')
      assert.equal(row(api.rows, 'Access method').text, 'REST API')
      assert.equal(row(api.rows, 'Format').text, 'JSON (application/json)')
      assert.equal(row(api.rows, 'Authentication').text, 'OAuth 2.0')
      assert.equal(row(api.rows, 'Licence').text, 'Memorandum of Understanding')
      assert.equal(
        row(api.rows, 'Data service').text,
        'Livestock Movements API'
      )
      assert.deepEqual(row(api.rows, 'Access link').link, {
        href: 'https://api.example.org/movements',
        text: 'https://api.example.org/movements'
      })
    })

    test('shows the broker and topic for an event stream, with the broker as text', () => {
      const events = pageFor('DA11111').distributions[1]

      assert.equal(
        row(events.rows, 'Broker').text,
        'amqps://broker.example.org'
      )
      assert.equal(row(events.rows, 'Topic').text, 'animal.movement.v1')
      assert.equal(
        row(events.rows, 'Format').text,
        'JSON CloudEvents (application/cloudevents+json)'
      )
    })

    test('shows "None" for a distribution that needs no authentication', () => {
      const [speciesList] = pageFor('DA1111B').distributions

      assert.equal(row(speciesList.rows, 'Authentication').text, 'None')
    })

    test('links to the licence and shows its version', () => {
      const [speciesList] = pageFor('DA1111B').distributions

      assert.deepEqual(row(speciesList.rows, 'Licence').link, {
        href: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
        text: 'Open Government Licence 3.0'
      })
    })

    test('shows the download link and the size', () => {
      const [extract] = pageFor('DA11113').distributions

      assert.equal(
        row(extract.rows, 'Download link').link.href,
        'https://files.example.org/holdings/holdings-2026-10.csv'
      )
      assert.equal(row(extract.rows, 'Size').text, '2.5 MB')
    })

    test('shows a hard copy with its description and no link', () => {
      const [report] = pageFor('DA1111F').distributions

      assert.equal(row(report.rows, 'Format').text, 'Hard Copy')
      assert.match(
        row(report.rows, 'Description').text,
        /There is no online copy/
      )
      assert.equal(row(report.rows, 'Access link'), undefined)
      assert.equal(row(report.rows, 'Download link'), undefined)
    })

    test('never turns an address that is not https into a link', () => {
      const page = pageAfter('DA11111', (dataAsset) => {
        dataAsset.distributions[0].accessReference = 'javascript:alert(1)'
      })

      assert.deepEqual(row(page.distributions[0].rows, 'Access link'), {
        key: 'Access link',
        text: 'javascript:alert(1)'
      })
    })

    test('has no distributions when the data asset has none', () => {
      const page = pageFor('DA11118')

      assert.deepEqual(page.distributions, [])
      assert.match(
        page.accessRightsDescription,
        /^No distribution is available yet/
      )
    })
  })

  describe('related data assets and resources (S16)', () => {
    test('groups related resources by relationship type, linking to visible data assets and https addresses', () => {
      assert.deepEqual(pageFor('DA11111').relatedGroups, [
        {
          heading: 'Derived from',
          links: [
            {
              href: 'https://example.org/keeper-reports',
              text: 'Keeper movement reports'
            }
          ]
        },
        {
          heading: 'Related to',
          links: [{ href: '/data-assets/DA11113', text: 'Livestock Holding' }]
        }
      ])
    })

    test('leaves out a related data asset that is not visible', () => {
      const groups = pageFor('DA11113').relatedGroups

      assert.deepEqual(
        groups.map((group) => group.heading),
        ['Derived from']
      )
    })

    test('shows a relationship type that is new to the code list, in the list order', () => {
      const collections = catalogueCopy()
      collections.codeLists.relationshipTypes.push({
        code: 'SUPPLEMENTS',
        name: 'Supplements'
      })
      dataAssetIn(collections, 'DA11111').relationships.push({
        relationshipTypeCode: 'SUPPLEMENTS',
        targetResourceIdentifier: 'DA11113'
      })
      const groups = pageFor('DA11111', {
        fromCatalogue: buildCatalogue(collections)
      }).relatedGroups

      assert.deepEqual(
        groups.map((group) => group.heading),
        ['Derived from', 'Related to', 'Supplements']
      )
    })

    test('shows the address when an external resource has no description', () => {
      const page = pageAfter('DA11111', (dataAsset) => {
        delete dataAsset.relationships[0].description
      })

      assert.deepEqual(page.relatedGroups[0].links, [
        {
          href: 'https://example.org/keeper-reports',
          text: 'https://example.org/keeper-reports'
        }
      ])
    })

    test('leaves out an external resource whose address is not https', () => {
      const page = pageAfter('DA11111', (dataAsset) => {
        dataAsset.relationships[0].targetResourceIdentifier =
          'javascript:alert(1)'
      })

      assert.deepEqual(
        page.relatedGroups.map((group) => group.heading),
        ['Related to']
      )
    })

    test('has no related groups when there are no relationships', () => {
      assert.deepEqual(pageFor('DA11115').relatedGroups, [])
    })
  })

  describe('deprecation (S11, S16)', () => {
    test('marks a deprecated data asset and names the data asset that replaces it', () => {
      const page = pageFor('DA11114')

      assert.equal(page.isDeprecated, true)
      assert.deepEqual(page.replacement, {
        href: '/data-assets/DA1111A',
        titleName: 'Livestock Keeper'
      })
    })

    test('names no replacement when the replacement is not visible', () => {
      const page = pageAfter('DA11114', (dataAsset, collections) => {
        dataAssetIn(collections, 'DA1111A').publicationStateCode = 'DRAFT'
      })

      assert.equal(page.isDeprecated, true)
      assert.equal(page.replacement, undefined)
    })

    test('does not mark a published data asset as deprecated', () => {
      const page = pageFor('DA1111A')

      assert.equal(page.isDeprecated, false)
      assert.equal(page.replacement, undefined)
    })
  })
})

describe('byte sizes', () => {
  test('are shown in bytes, KB, MB or GB', () => {
    assert.equal(formatByteSize(0), '0 bytes')
    assert.equal(formatByteSize(999), '999 bytes')
    assert.equal(formatByteSize(18000), '18 KB')
    assert.equal(formatByteSize(2500000), '2.5 MB')
    assert.equal(formatByteSize(48000000), '48 MB')
    assert.equal(formatByteSize(1234567890), '1.2 GB')
  })
})

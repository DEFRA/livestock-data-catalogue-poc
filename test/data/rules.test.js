import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { findRuleBreaches } from '../../schemas/catalogue/rules.js'
import { TODAY, catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

function breachesAfter(change, today = TODAY) {
  const collections = catalogueCopy()
  change(collections)
  return findRuleBreaches(collections, { today })
}

function assertBreach(breaches, expected) {
  assert.ok(
    breaches.includes(expected),
    `expected "${expected}", got: ${breaches.join('; ') || 'no breaches'}`
  )
}

describe('the rules that span records', () => {
  test('the mock data breaks none of them', () => {
    assert.deepEqual(findRuleBreaches(catalogueCopy(), { today: TODAY }), [])
  })

  test('the mock data still breaks none of them when future assignments have started', () => {
    assert.deepEqual(
      findRuleBreaches(catalogueCopy(), { today: '2028-01-01' }),
      []
    )
  })

  describe('unique keys', () => {
    test('rejects 2 data assets whose titles differ only in case', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11113').titleName = 'ANIMAL MOVEMENT'
      })

      assertBreach(breaches, 'Duplicate data asset title: ANIMAL MOVEMENT')
    })

    test('rejects 2 data assets with the same identifier', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11113').identifier = 'DA11111'
      })

      assertBreach(breaches, 'Duplicate data asset identifier: DA11111')
    })

    test('rejects 2 distributions in one data asset whose names differ only in case (S18)', () => {
      const breaches = breachesAfter((collections) => {
        const distributions = dataAssetIn(collections, 'DA11111').distributions
        distributions[1].name = distributions[0].name.toUpperCase()
      })

      assertBreach(
        breaches,
        'Duplicate distribution name in data asset DA11111: MOVEMENTS API'
      )
    })

    test('allows 2 data assets to have distributions with the same name (S18)', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11113').distributions[0].name = dataAssetIn(
          collections,
          'DA11111'
        ).distributions[0].name
      })

      assert.deepEqual(breaches, [])
    })

    test('rejects the same Data Custodian twice from the same date, ignoring case (S17)', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11115').custodians.push({
          organisationName: 'AGRICULTURE AND HORTICULTURE DEVELOPMENT BOARD',
          effectiveFromDate: '2022-03-01'
        })
      })

      assertBreach(
        breaches,
        'Duplicate Data Custodian in data asset DA11115: AGRICULTURE AND HORTICULTURE DEVELOPMENT BOARD from 2022-03-01'
      )
    })

    test('allows the same Data Custodian again from a different date (S17)', () => {
      const breaches = breachesAfter((collections) => {
        const custodians = dataAssetIn(collections, 'DA11115').custodians
        custodians[0].effectiveToDate = '2025-12-31'
        custodians.push({
          organisationName: custodians[0].organisationName,
          effectiveFromDate: '2026-01-01'
        })
      })

      assert.deepEqual(breaches, [])
    })

    test('rejects 2 people with the same name and email address, ignoring case', () => {
      const breaches = breachesAfter((collections) => {
        collections.people.push({ ...collections.people[0], name: 'JO BLOGGS' })
      })

      assertBreach(
        breaches,
        'Duplicate person: JO BLOGGS <jo.bloggs@example.com>'
      )
    })

    test('allows 2 people with the same name and different email addresses', () => {
      const breaches = breachesAfter((collections) => {
        collections.people.push({
          ...collections.people[0],
          emailAddressReference: 'jo.bloggs2@example.com'
        })
      })

      assert.deepEqual(breaches, [])
    })

    test('rejects 2 reference values with the same name, ignoring case', () => {
      const breaches = breachesAfter((collections) => {
        collections.domains.push({ code: 'NEW_VALUE', name: 'animal' })
      })

      assertBreach(breaches, 'Duplicate domains name: animal')
    })

    for (const [records, collectionName, field, name, key] of [
      [
        'organisations',
        'organisations',
        'name',
        'Rural Payments Agency',
        'organisation name'
      ],
      [
        'delivery groups',
        'deliveryGroups',
        'name',
        'Animal and Plant Delivery Group',
        'delivery group name'
      ],
      [
        'data services',
        'dataServices',
        'titleName',
        'Livestock Movements API',
        'data service title'
      ],
      [
        'information assets',
        'informationAssets',
        'name',
        'Animal Disease Records',
        'information asset name'
      ],
      ['keywords', 'keywords', 'name', 'Cattle', 'keyword name']
    ]) {
      test(`rejects 2 ${records} whose names differ only in case`, () => {
        const breaches = breachesAfter((collections) => {
          const original = collections[collectionName].find(
            (record) => record[field] === name
          )
          collections[collectionName].push({
            ...original,
            [field]: name.toUpperCase()
          })
        })

        assertBreach(breaches, `Duplicate ${key}: ${name.toUpperCase()}`)
      })
    }

    test('rejects 2 code list values with the same code', () => {
      const breaches = breachesAfter((collections) => {
        collections.codeLists.securityClassifications.push({
          code: 'OFFICIAL',
          name: 'Official again'
        })
      })

      assertBreach(breaches, 'Duplicate securityClassifications code: OFFICIAL')
    })
  })

  describe('foreign keys', () => {
    test('rejects a data asset owned by an organisation that does not exist', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').organisationName =
          'Department of Livestock'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 refers to an unknown organisation: Department of Livestock'
      )
    })

    test('rejects a code that is not in its reference collection', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').domainCode = 'WEATHER'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 refers to an unknown domains code: WEATHER'
      )
    })

    test('rejects a code that is not in its code list', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').updateFrequencyCode = 'HOURLY'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 refers to an unknown updateFrequencies code: HOURLY'
      )
    })

    test('rejects a security classification that is not in its code list', () => {
      const breaches = breachesAfter((collections) => {
        collections.informationAssets[0].securityClassificationCode =
          'CONFIDENTIAL'
      })

      assertBreach(
        breaches,
        'Information asset Livestock Traceability Records refers to an unknown securityClassifications code: CONFIDENTIAL'
      )
    })

    test('rejects a keyword that is not in the keyword collection', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').keywordNames.push('Weather')
      })

      assertBreach(
        breaches,
        'Data asset DA11111 refers to an unknown keyword: Weather'
      )
    })

    test('rejects a governance assignment for a person who does not exist', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(
          collections,
          'DA11111'
        ).governanceAssignments[0].personEmailAddressReference =
          'someone.else@example.com'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 refers to an unknown person: Jo Bloggs\nsomeone.else@example.com'
      )
    })

    test('rejects a Data Custodian that is not an organisation', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').custodians[0].organisationName =
          'Jo Bloggs'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 refers to an unknown custodian organisation: Jo Bloggs'
      )
    })

    test('rejects a distribution delivered by a data service that does not exist', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(
          collections,
          'DA11111'
        ).distributions[0].dataServiceTitleName = 'Holdings API'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 distribution "Movements API" refers to an unknown data service: Holdings API'
      )
    })

    test('rejects a distribution with a licence that does not exist', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').distributions[0].licenceCode =
          'CC_BY'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 distribution "Movements API" refers to an unknown licences code: CC_BY'
      )
    })

    test('rejects a relationship to a data asset that does not exist', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(
          collections,
          'DA11111'
        ).relationships[1].targetResourceIdentifier = 'DA99999'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 refers to an unknown related data asset: DA99999'
      )
    })

    test('rejects a relationship target that is neither a data asset identifier nor an https address', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(
          collections,
          'DA11111'
        ).relationships[1].targetResourceIdentifier = 'Livestock Holding'
      })

      assertBreach(
        breaches,
        'Data asset DA11111 has a relationship target that is neither a data asset identifier nor an https address: Livestock Holding'
      )
    })

    test('rejects an organisation whose parent does not exist', () => {
      const breaches = breachesAfter((collections) => {
        collections.organisations[1].parentOrganisationName =
          'Department of Livestock'
      })

      assertBreach(
        breaches,
        'Organisation Animal and Plant Health Agency refers to an unknown parent organisation: Department of Livestock'
      )
    })

    for (const [description, change, expected] of [
      [
        'an organisation with a type that does not exist',
        (collections) => {
          collections.organisations[0].organisationTypeCode = 'CHARITY'
        },
        'Organisation Department for Environment, Food and Rural Affairs refers to an unknown organisationTypes code: CHARITY'
      ],
      [
        'a person in an organisation that does not exist',
        (collections) => {
          collections.people[0].organisationName = 'Department of Livestock'
        },
        'Person Jo Bloggs refers to an unknown organisation: Department of Livestock'
      ],
      [
        'a delivery group in an organisation that does not exist',
        (collections) => {
          collections.deliveryGroups[0].organisationName =
            'Department of Livestock'
        },
        'Delivery group Animal and Plant Delivery Group refers to an unknown organisation: Department of Livestock'
      ],
      [
        'a data asset with a delivery group that does not exist',
        (collections) => {
          dataAssetIn(collections, 'DA11111').deliveryGroupName =
            'Holdings Delivery Group'
        },
        'Data asset DA11111 refers to an unknown delivery group: Holdings Delivery Group'
      ],
      [
        'a data asset with an information asset that does not exist',
        (collections) => {
          dataAssetIn(collections, 'DA11111').informationAssetName =
            'Movement Records'
        },
        'Data asset DA11111 refers to an unknown information asset: Movement Records'
      ],
      [
        'a publication state that does not exist',
        (collections) => {
          dataAssetIn(collections, 'DA11111').publicationStateCode = 'ARCHIVED'
        },
        'Data asset DA11111 refers to an unknown publicationStates code: ARCHIVED'
      ],
      [
        'a data asset type that does not exist',
        (collections) => {
          dataAssetIn(collections, 'DA11111').dataAssetTypeCode = 'EVENT_STREAM'
        },
        'Data asset DA11111 refers to an unknown dataAssetTypes code: EVENT_STREAM'
      ],
      [
        'a lifecycle state that does not exist',
        (collections) => {
          dataAssetIn(collections, 'DA11111').lifecycleStateCode = 'ARCHIVED'
        },
        'Data asset DA11111 refers to an unknown dataAssetLifecycleStates code: ARCHIVED'
      ],
      [
        'a category that does not exist',
        (collections) => {
          dataAssetIn(collections, 'DA11111').categoryCodes.push('GOATS')
        },
        'Data asset DA11111 refers to an unknown categories code: GOATS'
      ],
      [
        'a jurisdiction that does not exist',
        (collections) => {
          dataAssetIn(collections, 'DA11111').jurisdictionCodes.push('IE')
        },
        'Data asset DA11111 refers to an unknown jurisdictions code: IE'
      ],
      [
        'a relationship type that does not exist',
        (collections) => {
          dataAssetIn(
            collections,
            'DA11111'
          ).relationships[1].relationshipTypeCode = 'SUPPLEMENTS'
        },
        'Data asset DA11111 refers to an unknown relationshipTypes code: SUPPLEMENTS'
      ],
      [
        'a governance role that does not exist',
        (collections) => {
          dataAssetIn(
            collections,
            'DA11111'
          ).governanceAssignments[1].governanceRoleCode = 'DATA_CUSTODIAN'
        },
        'Data asset DA11111 refers to an unknown dataAssetGovernanceRoles code: DATA_CUSTODIAN'
      ],
      [
        'a distribution type that does not exist',
        (collections) => {
          dataAssetIn(
            collections,
            'DA11111'
          ).distributions[0].distributionTypeCode = 'STREAM'
        },
        'Data asset DA11111 distribution "Movements API" refers to an unknown distributionTypes code: STREAM'
      ],
      [
        'an access method that does not exist',
        (collections) => {
          dataAssetIn(
            collections,
            'DA11111'
          ).distributions[0].accessMethodCode = 'GRAPHQL'
        },
        'Data asset DA11111 distribution "Movements API" refers to an unknown accessMethods code: GRAPHQL'
      ],
      [
        'a format that does not exist',
        (collections) => {
          dataAssetIn(
            collections,
            'DA11111'
          ).distributions[0].distributionFormatCode = 'PDF'
        },
        'Data asset DA11111 distribution "Movements API" refers to an unknown distributionFormats code: PDF'
      ],
      [
        'an authentication method that does not exist',
        (collections) => {
          dataAssetIn(
            collections,
            'DA11111'
          ).distributions[0].authenticationMethodCode = 'SAML'
        },
        'Data asset DA11111 distribution "Movements API" refers to an unknown authenticationMethods code: SAML'
      ]
    ]) {
      test(`rejects ${description}`, () => {
        assertBreach(breachesAfter(change), expected)
      })
    }
  })

  describe('the organisation hierarchy', () => {
    test('rejects an organisation that is its own ancestor', () => {
      const breaches = breachesAfter((collections) => {
        collections.organisations[0].parentOrganisationName =
          'Animal and Plant Health Agency'
      })

      assertBreach(
        breaches,
        'Organisation Department for Environment, Food and Rural Affairs is its own ancestor'
      )
      assertBreach(
        breaches,
        'Organisation Animal and Plant Health Agency is its own ancestor'
      )
    })

    test('rejects an organisation that is its own parent', () => {
      const breaches = breachesAfter((collections) => {
        collections.organisations[0].parentOrganisationName =
          collections.organisations[0].name
      })

      assertBreach(
        breaches,
        'Organisation Department for Environment, Food and Rural Affairs is its own ancestor'
      )
    })
  })

  describe('dates', () => {
    const datePairs = [
      [
        'acceptanceDate',
        'creationDate',
        'Acceptance Date cannot be before Creation Date'
      ],
      [
        'modificationDate',
        'creationDate',
        'Modification Date cannot be before Creation Date'
      ],
      [
        'validToDate',
        'validFromDate',
        'Valid To Date cannot be before Valid From Date'
      ],
      [
        'coverageEndDate',
        'coverageStartDate',
        'Coverage End Date cannot be before Coverage Start Date'
      ],
      [
        'nextReviewDate',
        'lastReviewedDate',
        'Next Review Date cannot be before Last Reviewed Date'
      ]
    ]

    for (const [later, earlier, message] of datePairs) {
      test(`rejects a data asset whose ${later} is before its ${earlier}`, () => {
        const breaches = breachesAfter((collections) => {
          const dataAsset = dataAssetIn(collections, 'DA11111')
          dataAsset[earlier] = '2026-02-01'
          dataAsset[later] = '2026-01-01'
        })

        assertBreach(breaches, `Data asset DA11111: ${message}`)
      })
    }

    test('checks dates on draft data assets too', () => {
      const breaches = breachesAfter((collections) => {
        const draft = dataAssetIn(collections, 'DA11112')
        draft.creationDate = '2026-02-01'
        draft.acceptanceDate = '2026-01-01'
      })

      assertBreach(
        breaches,
        'Data asset DA11112: Acceptance Date cannot be before Creation Date'
      )
    })

    test('rejects a governance assignment that ends before it starts', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(
          collections,
          'DA11117'
        ).governanceAssignments[1].effectiveToDate = '2020-12-31'
      })

      assertBreach(
        breaches,
        'Data asset DA11117: Effective To Date cannot be before Effective From Date'
      )
    })
  })

  describe('governance', () => {
    test('rejects 2 current Data Owners', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').governanceAssignments.push({
          personName: 'Sam Specimen',
          personEmailAddressReference: 'sam.specimen@example.com',
          governanceRoleCode: 'DATA_OWNER',
          effectiveFromDate: '2025-01-01'
        })
      })

      assertBreach(
        breaches,
        'Data asset DA11111 has overlapping Data Owner assignments'
      )
      assertBreach(
        breaches,
        'Data asset DA11111 cannot be published: Exactly one current Data Owner is required'
      )
    })

    test('allows a new Data Owner once the previous one has ended', () => {
      const breaches = breachesAfter((collections) => {
        const assignments = dataAssetIn(
          collections,
          'DA11111'
        ).governanceAssignments
        assignments[0].effectiveToDate = '2025-12-31'
        assignments.push({
          personName: 'Sam Specimen',
          personEmailAddressReference: 'sam.specimen@example.com',
          governanceRoleCode: 'DATA_OWNER',
          effectiveFromDate: '2026-01-01'
        })
      })

      assert.deepEqual(breaches, [])
    })

    test('rejects overlapping periods for the same person and role', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').governanceAssignments.push({
          personName: 'Sam Specimen',
          personEmailAddressReference: 'sam.specimen@example.com',
          governanceRoleCode: 'DATA_STEWARD',
          effectiveFromDate: '2025-06-01'
        })
      })

      assertBreach(
        breaches,
        'Data asset DA11111 has overlapping assignments for Sam Specimen <sam.specimen@example.com> as DATA_STEWARD'
      )
    })

    test('does not mix up 2 people with the same name', () => {
      const breaches = breachesAfter((collections) => {
        const samSpecimen = collections.people.find(
          (person) => person.name === 'Sam Specimen'
        )
        collections.people.push({
          ...samSpecimen,
          emailAddressReference: 'sam.specimen2@example.com'
        })
        dataAssetIn(collections, 'DA11111').governanceAssignments.push({
          personName: 'Sam Specimen',
          personEmailAddressReference: 'sam.specimen2@example.com',
          governanceRoleCode: 'DATA_STEWARD',
          effectiveFromDate: '2025-06-01'
        })
      })

      assert.deepEqual(breaches, [])
    })

    test('allows several organisations to be Data Custodians at once (S17)', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').custodians.push({
          organisationName: 'Rural Payments Agency',
          effectiveFromDate: '2025-01-01'
        })
      })

      assert.deepEqual(breaches, [])
    })
  })

  describe('publication', () => {
    test('rejects a published data asset that fails the publication checks', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11111').categoryCodes = []
      })

      assertBreach(
        breaches,
        'Data asset DA11111 cannot be published: At least one Category is required'
      )
    })

    test('rejects a deprecated data asset that fails the publication checks', () => {
      const breaches = breachesAfter((collections) => {
        delete dataAssetIn(collections, 'DA11114').distributions[0].licenceCode
      })

      assertBreach(
        breaches,
        'Data asset DA11114 cannot be published: Distribution "Keeper API version 1" needs a Licence'
      )
    })

    test('does not apply the publication checks to draft or retired data assets', () => {
      const breaches = breachesAfter((collections) => {
        dataAssetIn(collections, 'DA11112').keywordNames = []
        dataAssetIn(collections, 'DA11116').keywordNames = []
      })

      assert.deepEqual(breaches, [])
    })
  })
})

import {
  CODE_LISTS,
  REFERENCE_COLLECTIONS,
  personKey
} from '../../app/lib/catalogue-data.js'
import { isDataAssetIdentifier } from '../../app/lib/identifiers.js'
import { isVisible } from '../../app/lib/visibility.js'
import { dateConflicts, outstandingForPublication } from './publication.js'

const LATEST_DATE = '9999-12-31'

function exactly(value) {
  return value
}

function lowerCased(value) {
  return value.toLowerCase()
}

function duplicates(values, normalise) {
  const seen = new Set()
  return values.filter((value) => {
    const key = normalise(value)
    const repeated = seen.has(key)
    seen.add(key)
    return repeated
  })
}

function uniqueKeyBreaches(collections) {
  const { dataAssets } = collections
  const checks = [
    [
      'data asset identifier',
      dataAssets.map((dataAsset) => dataAsset.identifier),
      exactly
    ],
    [
      'data asset title',
      dataAssets.map((dataAsset) => dataAsset.titleName),
      lowerCased
    ],
    [
      'organisation name',
      collections.organisations.map((organisation) => organisation.name),
      lowerCased
    ],
    [
      'person',
      collections.people.map(
        (person) => `${person.name} <${person.emailAddressReference}>`
      ),
      lowerCased
    ],
    [
      'delivery group name',
      collections.deliveryGroups.map((deliveryGroup) => deliveryGroup.name),
      lowerCased
    ],
    // A distribution's key is its data asset and its name (S18), so names
    // must be unique within each data asset, but not across them
    ...dataAssets.map((dataAsset) => [
      `distribution name in data asset ${dataAsset.identifier}`,
      (dataAsset.distributions ?? []).map((distribution) => distribution.name),
      lowerCased
    ]),
    [
      'data service title',
      collections.dataServices.map((dataService) => dataService.titleName),
      lowerCased
    ],
    [
      'information asset name',
      collections.informationAssets.map(
        (informationAsset) => informationAsset.name
      ),
      lowerCased
    ],
    [
      'keyword name',
      collections.keywords.map((keyword) => keyword.name),
      lowerCased
    ]
  ]
  const referenceValues = [
    ...REFERENCE_COLLECTIONS.map((name) => [name, collections[name]]),
    ...CODE_LISTS.map((name) => [name, collections.codeLists[name]])
  ]
  for (const [listName, values] of referenceValues) {
    checks.push([
      `${listName} code`,
      values.map((value) => value.code),
      exactly
    ])
    checks.push([
      `${listName} name`,
      values.map((value) => value.name),
      lowerCased
    ])
  }
  return checks.flatMap(([description, values, normalise]) =>
    duplicates(values, normalise).map(
      (value) => `Duplicate ${description}: ${value}`
    )
  )
}

function codeSets(collections) {
  return new Map([
    ...REFERENCE_COLLECTIONS.map((name) => [
      name,
      new Set(collections[name].map((value) => value.code))
    ]),
    ...CODE_LISTS.map((name) => [
      name,
      new Set(collections.codeLists[name].map((value) => value.code))
    ])
  ])
}

function isHttpsAddress(value) {
  return URL.canParse(value) && new URL(value).protocol === 'https:'
}

// Checks that names and codes refer to records that exist
function referenceChecker(collections) {
  const breaches = []
  const codes = codeSets(collections)
  const known = {
    organisations: new Set(
      collections.organisations.map((organisation) => organisation.name)
    ),
    people: new Set(
      collections.people.map((person) =>
        personKey(person.name, person.emailAddressReference)
      )
    ),
    deliveryGroups: new Set(
      collections.deliveryGroups.map((deliveryGroup) => deliveryGroup.name)
    ),
    dataServices: new Set(
      collections.dataServices.map((dataService) => dataService.titleName)
    ),
    informationAssets: new Set(
      collections.informationAssets.map(
        (informationAsset) => informationAsset.name
      )
    ),
    keywords: new Set(collections.keywords.map((keyword) => keyword.name)),
    dataAssets: new Set(
      collections.dataAssets.map((dataAsset) => dataAsset.identifier)
    )
  }

  const check = {
    breaches,
    name(owner, value, collectionName, description) {
      if (value !== undefined && !known[collectionName].has(value)) {
        breaches.push(`${owner} refers to an unknown ${description}: ${value}`)
      }
    },
    code(owner, value, listName) {
      if (value !== undefined && !codes.get(listName).has(value)) {
        breaches.push(
          `${owner} refers to an unknown ${listName} code: ${value}`
        )
      }
    },
    // A target inside the catalogue is held as its data asset identifier,
    // and anything else as an https address (LDAT-235, question 9)
    relationshipTarget(owner, target) {
      if (isDataAssetIdentifier(target)) {
        check.name(owner, target, 'dataAssets', 'related data asset')
      } else if (!isHttpsAddress(target)) {
        breaches.push(
          `${owner} has a relationship target that is neither a data asset identifier nor an https address: ${target}`
        )
      }
    }
  }
  return check
}

function checkSupportingRecords(check, collections) {
  for (const organisation of collections.organisations) {
    const owner = `Organisation ${organisation.name}`
    check.name(
      owner,
      organisation.parentOrganisationName,
      'organisations',
      'parent organisation'
    )
    check.code(owner, organisation.organisationTypeCode, 'organisationTypes')
  }
  for (const person of collections.people) {
    check.name(
      `Person ${person.name}`,
      person.organisationName,
      'organisations',
      'organisation'
    )
  }
  for (const deliveryGroup of collections.deliveryGroups) {
    check.name(
      `Delivery group ${deliveryGroup.name}`,
      deliveryGroup.organisationName,
      'organisations',
      'organisation'
    )
  }
  for (const informationAsset of collections.informationAssets) {
    check.code(
      `Information asset ${informationAsset.name}`,
      informationAsset.securityClassificationCode,
      'securityClassifications'
    )
  }
}

function checkDataAssetAttributes(check, owner, dataAsset) {
  check.name(owner, dataAsset.organisationName, 'organisations', 'organisation')
  check.name(
    owner,
    dataAsset.deliveryGroupName,
    'deliveryGroups',
    'delivery group'
  )
  check.name(
    owner,
    dataAsset.informationAssetName,
    'informationAssets',
    'information asset'
  )
  check.code(owner, dataAsset.publicationStateCode, 'publicationStates')
  check.code(owner, dataAsset.dataAssetTypeCode, 'dataAssetTypes')
  check.code(owner, dataAsset.domainCode, 'domains')
  check.code(owner, dataAsset.lifecycleStateCode, 'dataAssetLifecycleStates')
  check.code(owner, dataAsset.updateFrequencyCode, 'updateFrequencies')
  dataAsset.categoryCodes?.forEach((value) =>
    check.code(owner, value, 'categories')
  )
  dataAsset.jurisdictionCodes?.forEach((value) =>
    check.code(owner, value, 'jurisdictions')
  )
  dataAsset.keywordNames?.forEach((value) =>
    check.name(owner, value, 'keywords', 'keyword')
  )
}

function checkDataAssetLinks(check, owner, dataAsset) {
  for (const relationship of dataAsset.relationships ?? []) {
    check.code(owner, relationship.relationshipTypeCode, 'relationshipTypes')
    check.relationshipTarget(owner, relationship.targetResourceIdentifier)
  }
  for (const assignment of dataAsset.governanceAssignments ?? []) {
    check.name(
      owner,
      personKey(assignment.personName, assignment.personEmailAddressReference),
      'people',
      'person'
    )
    check.code(owner, assignment.governanceRoleCode, 'dataAssetGovernanceRoles')
  }
  for (const custodian of dataAsset.custodians ?? []) {
    check.name(
      owner,
      custodian.organisationName,
      'organisations',
      'custodian organisation'
    )
  }
}

function checkDistribution(check, owner, distribution) {
  const distributionOwner = `${owner} distribution "${distribution.name}"`
  check.code(
    distributionOwner,
    distribution.distributionTypeCode,
    'distributionTypes'
  )
  check.code(distributionOwner, distribution.accessMethodCode, 'accessMethods')
  check.code(
    distributionOwner,
    distribution.distributionFormatCode,
    'distributionFormats'
  )
  check.code(
    distributionOwner,
    distribution.authenticationMethodCode,
    'authenticationMethods'
  )
  check.code(distributionOwner, distribution.licenceCode, 'licences')
  check.name(
    distributionOwner,
    distribution.dataServiceTitleName,
    'dataServices',
    'data service'
  )
}

function foreignKeyBreaches(collections) {
  const check = referenceChecker(collections)
  checkSupportingRecords(check, collections)
  for (const dataAsset of collections.dataAssets) {
    const owner = `Data asset ${dataAsset.identifier}`
    checkDataAssetAttributes(check, owner, dataAsset)
    checkDataAssetLinks(check, owner, dataAsset)
    for (const distribution of dataAsset.distributions ?? []) {
      checkDistribution(check, owner, distribution)
    }
  }
  return check.breaches
}

function hierarchyBreaches(collections) {
  const parents = new Map(
    collections.organisations.map((organisation) => [
      organisation.name,
      organisation.parentOrganisationName
    ])
  )
  return collections.organisations
    .filter((organisation) => {
      const visited = new Set()
      let current = organisation.parentOrganisationName
      while (current !== undefined && !visited.has(current)) {
        if (current === organisation.name) {
          return true
        }
        visited.add(current)
        current = parents.get(current)
      }
      return false
    })
    .map(
      (organisation) => `Organisation ${organisation.name} is its own ancestor`
    )
}

function periodBreaches(owner, periods) {
  return periods
    .filter(
      (period) =>
        period.effectiveToDate !== undefined &&
        period.effectiveToDate < period.effectiveFromDate
    )
    .map(
      () => `${owner}: Effective To Date cannot be before Effective From Date`
    )
}

function dateBreaches(collections) {
  return collections.dataAssets.flatMap((dataAsset) => {
    const owner = `Data asset ${dataAsset.identifier}`
    return [
      ...dateConflicts(dataAsset).map((conflict) => `${owner}: ${conflict}`),
      ...periodBreaches(owner, dataAsset.governanceAssignments ?? []),
      ...periodBreaches(owner, dataAsset.custodians ?? [])
    ]
  })
}

function periodsOverlap(first, second) {
  return (
    first.effectiveFromDate <= (second.effectiveToDate ?? LATEST_DATE) &&
    second.effectiveFromDate <= (first.effectiveToDate ?? LATEST_DATE)
  )
}

function anyOverlap(periods) {
  return periods.some((period, index) =>
    periods.slice(index + 1).some((other) => periodsOverlap(period, other))
  )
}

function governanceBreaches(collections) {
  return collections.dataAssets.flatMap((dataAsset) => {
    const owner = `Data asset ${dataAsset.identifier}`
    const assignments = dataAsset.governanceAssignments ?? []
    const breaches = []
    // Owners never overlap, so there is at most 1 current Data Owner (S17)
    if (
      anyOverlap(
        assignments.filter(
          (assignment) => assignment.governanceRoleCode === 'DATA_OWNER'
        )
      )
    ) {
      breaches.push(`${owner} has overlapping Data Owner assignments`)
    }
    // A person is identified by their name and email address together (S03)
    const byPersonAndRole = Map.groupBy(assignments, (assignment) =>
      [
        personKey(
          assignment.personName,
          assignment.personEmailAddressReference
        ),
        assignment.governanceRoleCode
      ].join('\n')
    )
    for (const periods of byPersonAndRole.values()) {
      if (anyOverlap(periods)) {
        const [
          { personName, personEmailAddressReference, governanceRoleCode }
        ] = periods
        breaches.push(
          `${owner} has overlapping assignments for ${personName} <${personEmailAddressReference}> as ${governanceRoleCode}`
        )
      }
    }
    if (anyOverlap(dataAsset.custodians ?? [])) {
      breaches.push(`${owner} has overlapping Data Custodians`)
    }
    return breaches
  })
}

function publicationBreaches(collections, today) {
  return collections.dataAssets
    .filter(isVisible)
    .flatMap((dataAsset) =>
      outstandingForPublication(dataAsset, { today }).map(
        (outstanding) =>
          `Data asset ${dataAsset.identifier} cannot be published: ${outstanding}`
      )
    )
}

// The rules in the Phase 1 stories that span records, which a schema
// for one document can't check
export function findRuleBreaches(collections, { today }) {
  return [
    ...uniqueKeyBreaches(collections),
    ...foreignKeyBreaches(collections),
    ...hierarchyBreaches(collections),
    ...dateBreaches(collections),
    ...governanceBreaches(collections),
    ...publicationBreaches(collections, today)
  ]
}

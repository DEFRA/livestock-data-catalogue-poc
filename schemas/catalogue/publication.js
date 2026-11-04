import { isCurrentOn } from '../../app/lib/periods.js'

// S06, S08 to S12: needed before a data asset can be published. Valid To
// Date is optional: without one, a data asset is valid with no end date.
const PUBLISH_ATTRIBUTES = [
  ['accessRightsDescription', 'Access Rights Description'],
  ['provenanceDescription', 'Provenance Description'],
  ['creatorReference', 'Creator Reference'],
  ['creationDate', 'Creation Date'],
  ['acceptanceDate', 'Acceptance Date'],
  ['modificationDate', 'Modification Date'],
  ['validFromDate', 'Valid From Date'],
  ['metadataDate', 'Metadata Date'],
  ['dataAssetTypeCode', 'Data Asset Type Code'],
  ['domainCode', 'Domain Code'],
  ['lifecycleStateCode', 'Lifecycle State Code'],
  ['updateFrequencyCode', 'Update Frequency Code']
]

// S19, S20 and S22. S26 has its own messages for Format and Licence
const DISTRIBUTION_PUBLISH_ATTRIBUTES = [
  ['distributionTypeCode', 'Distribution Type Code'],
  ['accessMethodCode', 'Access Method Code'],
  ['authenticationMethodCode', 'Authentication Method Code']
]

// S06: the later date cannot be before the earlier one
const DATE_PAIRS = [
  ['acceptanceDate', 'Acceptance Date', 'creationDate', 'Creation Date'],
  ['modificationDate', 'Modification Date', 'creationDate', 'Creation Date'],
  ['validToDate', 'Valid To Date', 'validFromDate', 'Valid From Date'],
  [
    'coverageEndDate',
    'Coverage End Date',
    'coverageStartDate',
    'Coverage Start Date'
  ],
  [
    'nextReviewDate',
    'Next Review Date',
    'lastReviewedDate',
    'Last Reviewed Date'
  ]
]

// S26 lets a data asset with no distribution be published when its access
// rights say none is available. The prototype looks for this phrase.
const NO_DISTRIBUTION_STATEMENT = 'no distribution is available'

export function dateConflicts(dataAsset) {
  return DATE_PAIRS.filter(
    ([later, , earlier]) =>
      dataAsset[later] &&
      dataAsset[earlier] &&
      dataAsset[later] < dataAsset[earlier]
  ).map(
    ([, laterName, , earlierName]) =>
      `${laterName} cannot be before ${earlierName}`
  )
}

function missingAttributes(document, attributes) {
  return attributes
    .filter(([field]) => document[field] === undefined)
    .map(([, name]) => name)
}

function currentAssignments(dataAsset, roleCode, date) {
  return (dataAsset.governanceAssignments ?? []).filter(
    (assignment) =>
      assignment.governanceRoleCode === roleCode &&
      isCurrentOn(assignment, date)
  )
}

function linkChecks(dataAsset) {
  const checks = [
    ['categoryCodes', 'At least one Category is required'],
    ['keywordNames', 'At least one Keyword is required'],
    ['jurisdictionCodes', 'At least one Jurisdiction is required']
  ]
  return checks
    .filter(([field]) => !dataAsset[field]?.length)
    .map(([, message]) => message)
}

function governanceChecks(dataAsset, date) {
  const outstanding = []
  if (currentAssignments(dataAsset, 'DATA_OWNER', date).length !== 1) {
    outstanding.push('Exactly one current Data Owner is required')
  }
  if (currentAssignments(dataAsset, 'DATA_STEWARD', date).length === 0) {
    outstanding.push('At least one current Data Steward is required')
  }
  return outstanding
}

function saysNoDistributionIsAvailable(dataAsset) {
  return (
    dataAsset.accessRightsDescription
      ?.toLowerCase()
      .includes(NO_DISTRIBUTION_STATEMENT) ?? false
  )
}

function distributionChecks(dataAsset) {
  const distributions = dataAsset.distributions ?? []
  if (distributions.length === 0) {
    return saysNoDistributionIsAvailable(dataAsset)
      ? []
      : ['At least one Distribution is required']
  }
  return distributions.flatMap((distribution) => {
    const outstanding = missingAttributes(
      distribution,
      DISTRIBUTION_PUBLISH_ATTRIBUTES
    ).map(
      (name) => `Distribution "${distribution.name}": ${name} is outstanding`
    )
    if (!distribution.distributionFormatCode) {
      outstanding.push(`Distribution "${distribution.name}" needs a Format`)
    }
    if (!distribution.licenceCode) {
      outstanding.push(`Distribution "${distribution.name}" needs a Licence`)
    }
    return outstanding
  })
}

// S26: every check that stops a data asset being published, reported at once
export function outstandingForPublication(dataAsset, { today }) {
  return [
    ...missingAttributes(dataAsset, PUBLISH_ATTRIBUTES).map(
      (name) => `${name} is outstanding`
    ),
    ...linkChecks(dataAsset),
    ...governanceChecks(dataAsset, today),
    ...dateConflicts(dataAsset),
    ...distributionChecks(dataAsset),
    ...(dataAsset.informationAssetName
      ? []
      : ['Security Classification and Retention Period are required'])
  ]
}

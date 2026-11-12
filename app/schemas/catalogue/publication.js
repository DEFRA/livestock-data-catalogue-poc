import { isCurrentOn } from '../../lib/periods.js'
import { anyAddress } from './common.js'

// Each check names the section of the register and maintain journeys
// that fixes it, so the task list and the publish page can link to it

// S06, S08 to S12: needed before a data asset can be published. Valid To
// Date is optional: without one, a data asset is valid with no end date.
// The catalogue sets the Acceptance Date when a data asset is first
// published, so it isn't needed before (LDAT-252, question 29).
const PUBLISH_ATTRIBUTES = [
  [
    'accessRightsDescription',
    'Access Rights Description',
    'access-and-provenance'
  ],
  ['provenanceDescription', 'Provenance Description', 'access-and-provenance'],
  ['creatorReference', 'Creator Reference', 'access-and-provenance'],
  ['creationDate', 'Creation Date', 'dates'],
  ['modificationDate', 'Modification Date', 'dates'],
  ['validFromDate', 'Valid From Date', 'dates'],
  ['metadataDate', 'Metadata Date', 'dates'],
  ['dataAssetTypeCode', 'Data Asset Type Code', 'about'],
  ['domainCode', 'Domain Code', 'about'],
  ['lifecycleStateCode', 'Lifecycle State Code', 'status'],
  ['updateFrequencyCode', 'Update Frequency Code', 'status']
]

// S19, S20 and S22. S26 has its own messages for Format and Licence
const DISTRIBUTION_PUBLISH_ATTRIBUTES = [
  ['distributionTypeCode', 'Distribution Type Code'],
  ['accessMethodCode', 'Access Method Code'],
  ['authenticationMethodCode', 'Authentication Method Code']
]

// S18 and S26: each address a distribution has must be a valid URI
const DISTRIBUTION_REFERENCES = [
  ['accessReference', 'Access Reference'],
  ['downloadReference', 'Download Reference'],
  ['brokerReference', 'Broker Reference']
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

function dateConflictChecks(dataAsset) {
  return DATE_PAIRS.filter(
    ([later, , earlier]) =>
      dataAsset[later] &&
      dataAsset[earlier] &&
      dataAsset[later] < dataAsset[earlier]
  ).map(([later, laterName, , earlierName]) => ({
    kind: 'dates',
    field: later,
    section: later === 'nextReviewDate' ? 'review' : 'dates',
    message: `${laterName} cannot be before ${earlierName}`
  }))
}

export function dateConflicts(dataAsset) {
  return dateConflictChecks(dataAsset).map((check) => check.message)
}

function attributeChecks(dataAsset) {
  return PUBLISH_ATTRIBUTES.filter(
    ([field]) => dataAsset[field] === undefined
  ).map(([field, name, section]) => ({
    kind: 'attribute',
    field,
    section,
    message: `${name} is outstanding`
  }))
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
    .map(([field, message]) => ({
      kind: 'link',
      field,
      section: 'classification',
      message
    }))
}

function governanceChecks(dataAsset, date) {
  const outstanding = []
  if (currentAssignments(dataAsset, 'DATA_OWNER', date).length !== 1) {
    outstanding.push({
      kind: 'governance',
      field: 'DATA_OWNER',
      section: 'responsibility',
      message: 'Exactly one current Data Owner is required'
    })
  }
  if (currentAssignments(dataAsset, 'DATA_STEWARD', date).length === 0) {
    outstanding.push({
      kind: 'governance',
      field: 'DATA_STEWARD',
      section: 'responsibility',
      message: 'At least one current Data Steward is required'
    })
  }
  return outstanding
}

function invalidReferences(distribution) {
  return DISTRIBUTION_REFERENCES.filter(
    ([field]) =>
      distribution[field] !== undefined &&
      anyAddress.validate(distribution[field]).error !== undefined
  )
}

function distributionCheck(position, distribution, details) {
  return {
    kind: 'distribution',
    section: 'distributions',
    position,
    distributionName: distribution.name,
    ...details
  }
}

function checksForDistribution(distribution, position) {
  const { name } = distribution
  const checks = DISTRIBUTION_PUBLISH_ATTRIBUTES.filter(
    ([field]) => distribution[field] === undefined
  ).map(([field, attributeName]) =>
    distributionCheck(position, distribution, {
      field,
      message: `Distribution "${name}": ${attributeName} is outstanding`
    })
  )
  if (!distribution.distributionFormatCode) {
    checks.push(
      distributionCheck(position, distribution, {
        field: 'distributionFormatCode',
        message: `Distribution "${name}" needs a Format`
      })
    )
  }
  if (!distribution.licenceCode) {
    checks.push(
      distributionCheck(position, distribution, {
        field: 'licenceCode',
        message: `Distribution "${name}" needs a Licence`
      })
    )
  }
  for (const [field, referenceName] of invalidReferences(distribution)) {
    checks.push(
      distributionCheck(position, distribution, {
        field,
        message: `Distribution "${name}": ${referenceName} is not a valid URI`
      })
    )
  }
  return checks
}

function distributionChecks(dataAsset) {
  const distributions = dataAsset.distributions ?? []
  if (distributions.length === 0) {
    return [
      {
        kind: 'distributions',
        section: 'distributions',
        message: 'At least one Distribution is required'
      }
    ]
  }
  return distributions.flatMap(checksForDistribution)
}

function informationAssetChecks(dataAsset) {
  return dataAsset.informationAssetName
    ? []
    : [
        {
          kind: 'informationAsset',
          section: 'information-asset',
          message: 'Security Classification and Retention Period are required'
        }
      ]
}

// S26: every check that stops a data asset being published, reported at
// once, with the section that fixes it
export function publicationChecks(dataAsset, { today }) {
  return [
    ...attributeChecks(dataAsset),
    ...linkChecks(dataAsset),
    ...governanceChecks(dataAsset, today),
    ...dateConflictChecks(dataAsset),
    ...distributionChecks(dataAsset),
    ...informationAssetChecks(dataAsset)
  ]
}

export function outstandingForPublication(dataAsset, { today }) {
  return publicationChecks(dataAsset, { today }).map((check) => check.message)
}

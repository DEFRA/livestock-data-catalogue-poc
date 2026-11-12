import { formatDate } from './formatting.js'

const LONGEST_VALUE = 100
const NOT_PROVIDED = 'Not provided'

// Material changes (LDAT-252, question 28): a field needed to publish, a
// governance or custodian assignment, the publication or lifecycle state,
// or a distribution. Optional fields, the delivery group and
// relationships aren't material, so they aren't listed.
const DATA_ASSET_FIELDS = [
  { field: 'titleName', label: 'Title' },
  { field: 'description', label: 'Description' },
  { field: 'organisationName', label: 'Owning organisation' },
  {
    field: 'publicationStateCode',
    label: 'Publication state',
    list: 'publicationStates'
  },
  {
    field: 'lifecycleStateCode',
    label: 'Lifecycle state',
    list: 'dataAssetLifecycleStates'
  },
  {
    field: 'dataAssetTypeCode',
    label: 'Data asset type',
    list: 'dataAssetTypes'
  },
  { field: 'domainCode', label: 'Domain', list: 'domains' },
  {
    field: 'updateFrequencyCode',
    label: 'Update frequency',
    list: 'updateFrequencies'
  },
  { field: 'accessRightsDescription', label: 'Access rights' },
  { field: 'provenanceDescription', label: 'Provenance' },
  { field: 'creatorReference', label: 'Creator', person: true },
  { field: 'creationDate', label: 'Creation date', date: true },
  { field: 'acceptanceDate', label: 'Acceptance date', date: true },
  {
    field: 'modificationDate',
    label: 'Date the data last changed',
    date: true
  },
  { field: 'validFromDate', label: 'Valid from', date: true },
  { field: 'informationAssetName', label: 'Information asset' },
  { field: 'categoryCodes', label: 'Categories', list: 'categories' },
  { field: 'keywordNames', label: 'Keywords' },
  { field: 'jurisdictionCodes', label: 'Jurisdictions', list: 'jurisdictions' }
]

const DISTRIBUTION_FIELDS = [
  { field: 'description', label: 'description' },
  { field: 'distributionTypeCode', label: 'type', list: 'distributionTypes' },
  { field: 'accessMethodCode', label: 'access method', list: 'accessMethods' },
  {
    field: 'distributionFormatCode',
    label: 'format',
    list: 'distributionFormats'
  },
  {
    field: 'authenticationMethodCode',
    label: 'authentication',
    list: 'authenticationMethods'
  },
  { field: 'licenceCode', label: 'licence', list: 'licences' },
  { field: 'dataServiceTitleName', label: 'data service' },
  { field: 'accessReference', label: 'access address' },
  { field: 'downloadReference', label: 'download address' },
  { field: 'brokerReference', label: 'broker address' },
  { field: 'topicName', label: 'topic' },
  { field: 'versionNumber', label: 'version' },
  { field: 'byteSizeQuantity', label: 'size in bytes' }
]

const ROLE_NAMES = { DATA_OWNER: 'Data owner', DATA_STEWARD: 'Data steward' }

function shortened(text) {
  return text.length > LONGEST_VALUE
    ? `${text.slice(0, LONGEST_VALUE - 1)}…`
    : text
}

function singleValueText(catalogue, spec, value) {
  if (spec.list) {
    return catalogue.referenceLists.get(spec.list).get(value)?.name ?? value
  }
  if (spec.person) {
    return catalogue.peopleByEntraId.get(value)?.name ?? value
  }
  return spec.date ? formatDate(value) : String(value)
}

function valueText(catalogue, spec, value) {
  const values = [value ?? []].flat()
  return values.length
    ? shortened(
        values.map((one) => singleValueText(catalogue, spec, one)).join(', ')
      )
    : NOT_PROVIDED
}

function fieldChanges(catalogue, specs, before, after, prefix = '') {
  return specs
    .filter(
      (spec) =>
        JSON.stringify(before[spec.field]) !== JSON.stringify(after[spec.field])
    )
    .map(
      (spec) =>
        `${prefix}${spec.label} changed from ${valueText(catalogue, spec, before[spec.field])} to ${valueText(catalogue, spec, after[spec.field])}`
    )
}

function periodText(period) {
  return period.effectiveToDate
    ? `from ${formatDate(period.effectiveFromDate)} to ${formatDate(period.effectiveToDate)}`
    : `from ${formatDate(period.effectiveFromDate)}`
}

// Items are matched by their key, so each one is added, removed or changed
function itemChanges(beforeItems, afterItems, { keyOf, describe }) {
  const beforeByKey = new Map(
    (beforeItems ?? []).map((item) => [keyOf(item), item])
  )
  const afterByKey = new Map(
    (afterItems ?? []).map((item) => [keyOf(item), item])
  )
  return [
    ...[...beforeByKey]
      .filter(([key]) => !afterByKey.has(key))
      .map(([, item]) => `${describe(item)} removed`),
    ...[...afterByKey]
      .filter(([key]) => !beforeByKey.has(key))
      .map(([, item]) => `${describe(item)} added, ${periodText(item)}`),
    ...[...afterByKey]
      .filter(
        ([key, item]) =>
          beforeByKey.has(key) &&
          beforeByKey.get(key).effectiveToDate !== item.effectiveToDate
      )
      .map(([, item]) => `${describe(item)} now ${periodText(item)}`)
  ]
}

function assignmentChanges(before, after) {
  return itemChanges(
    before.governanceAssignments,
    after.governanceAssignments,
    {
      keyOf: (assignment) =>
        [
          assignment.personName,
          assignment.personEmailAddressReference,
          assignment.governanceRoleCode,
          assignment.effectiveFromDate
        ].join('\n'),
      describe: (assignment) =>
        `${ROLE_NAMES[assignment.governanceRoleCode] ?? assignment.governanceRoleCode} ${assignment.personName}`
    }
  )
}

function custodianChanges(before, after) {
  return itemChanges(before.custodians, after.custodians, {
    keyOf: (custodian) =>
      `${custodian.organisationName}\n${custodian.effectiveFromDate}`,
    describe: (custodian) => `Data custodian ${custodian.organisationName}`
  })
}

function addedOrRemoved(beforeList, afterList) {
  const beforeNames = new Set(beforeList.map((item) => item.name))
  const afterNames = new Set(afterList.map((item) => item.name))
  return [
    ...[...beforeNames]
      .filter((name) => !afterNames.has(name))
      .map((name) => `Distribution ${name} removed`),
    ...[...afterNames]
      .filter((name) => !beforeNames.has(name))
      .map((name) => `Distribution ${name} added`)
  ]
}

// A page adds or removes one distribution, or changes one in its place, so
// a distribution with a new name is the same one renamed
function distributionChanges(catalogue, before, after) {
  const beforeList = before.distributions ?? []
  const afterList = after.distributions ?? []
  if (beforeList.length !== afterList.length) {
    return addedOrRemoved(beforeList, afterList)
  }
  return afterList.flatMap((distribution, position) => {
    const previous = beforeList[position]
    return [
      ...(previous.name === distribution.name
        ? []
        : [`Distribution ${previous.name} renamed ${distribution.name}`]),
      ...fieldChanges(
        catalogue,
        DISTRIBUTION_FIELDS,
        previous,
        distribution,
        `Distribution ${distribution.name}: `
      )
    ]
  })
}

// What changed in a data asset, in words, for its change history. The
// catalogue gives names for codes and people.
export function describeChanges(catalogue, before, after) {
  return [
    ...fieldChanges(catalogue, DATA_ASSET_FIELDS, before, after),
    ...assignmentChanges(before, after),
    ...custodianChanges(before, after),
    ...distributionChanges(catalogue, before, after)
  ]
}

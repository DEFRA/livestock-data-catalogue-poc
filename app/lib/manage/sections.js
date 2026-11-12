import { publicationChecks } from '../../schemas/catalogue/publication.js'
import { personKey } from '../catalogue-data.js'
import { formatDate } from '../formatting.js'
import { isCurrentOn } from '../periods.js'
import { referenceValue } from '../reference-data.js'
import { canChangeResponsibility, isEditable, manageHref } from './context.js'
import { relationshipTargetText } from './relation-pages.js'

// The sections of the overview's task list (decision D23). A required
// section is complete when none of the S26 checks for it are outstanding.
export const SECTIONS = Object.freeze([
  {
    id: 'about',
    title: 'About the data asset',
    group: 'Describe the data asset',
    startedBy: [
      'titleName',
      'description',
      'dataAssetTypeCode',
      'domainCode',
      'versionNumber'
    ]
  },
  {
    id: 'classification',
    title: 'Categories, keywords and jurisdictions',
    group: 'Describe the data asset',
    startedBy: ['categoryCodes', 'keywordNames', 'jurisdictionCodes']
  },
  {
    id: 'status',
    title: 'Status and updates',
    group: 'Describe the data asset',
    startedBy: ['lifecycleStateCode', 'updateFrequencyCode']
  },
  {
    id: 'access-and-provenance',
    title: 'Access rights and provenance',
    group: 'Describe the data asset',
    startedBy: [
      'accessRightsDescription',
      'provenanceDescription',
      'creatorReference'
    ]
  },
  {
    id: 'dates',
    title: 'Dates and coverage',
    group: 'Describe the data asset',
    startedBy: [
      'creationDate',
      'modificationDate',
      'validFromDate',
      'validToDate',
      'coverageStartDate',
      'coverageEndDate',
      'spatialCoverageDescription'
    ]
  },
  {
    id: 'responsibility',
    title: 'Who is responsible',
    group: 'Responsibility and access',
    startedBy: ['governanceAssignments', 'custodians', 'deliveryGroupName']
  },
  {
    id: 'distributions',
    title: 'Distributions',
    group: 'Responsibility and access',
    startedBy: ['distributions']
  },
  {
    id: 'information-asset',
    title: 'Information asset',
    group: 'Responsibility and access',
    startedBy: ['informationAssetName']
  },
  {
    id: 'related-resources',
    title: 'Related resources',
    group: 'Optional',
    optional: true,
    startedBy: ['relationships']
  },
  {
    id: 'review',
    title: 'Review',
    group: 'Optional',
    optional: true,
    startedBy: ['lastReviewedDate', 'nextReviewDate']
  }
])

export function sectionWithId(id) {
  return SECTIONS.find((section) => section.id === id)
}

function isStarted(section, dataAsset) {
  return section.startedBy.some((field) =>
    Array.isArray(dataAsset[field])
      ? dataAsset[field].length > 0
      : dataAsset[field] !== undefined
  )
}

// Not yet started, In progress or Completed: a section is complete when
// none of its S26 checks are outstanding, or for an optional section, when
// it has anything in it
function statusOf(section, dataAsset, checks) {
  const started = isStarted(section, dataAsset)
  if (checks.some((check) => check.section === section.id)) {
    return started ? 'In progress' : 'Not yet started'
  }
  return section.optional && !started ? 'Not yet started' : 'Completed'
}

// Every section's status, and whether the data asset can be published
export function taskList(dataAsset, today) {
  const checks = publicationChecks(dataAsset, { today })
  const sections = SECTIONS.map((section) => ({
    ...section,
    status: statusOf(section, dataAsset, checks)
  }))
  const required = sections.filter((section) => !section.optional)
  return {
    sections,
    checks,
    requiredCount: required.length,
    completedCount: required.filter((section) => section.status === 'Completed')
      .length,
    canPublish: checks.length === 0
  }
}

function optionalName(catalogue, listName, code) {
  return code === undefined
    ? undefined
    : referenceValue(catalogue, listName, code).name
}

function personName(catalogue, entraObjectId) {
  return entraObjectId === undefined
    ? undefined
    : catalogue.peopleByEntraId.get(entraObjectId)?.name
}

function names(catalogue, listName, codes) {
  return (codes ?? []).map((code) => optionalName(catalogue, listName, code))
}

// A summary list row. Its value is text or a list of items. Its Change
// link only shows while the data asset can be changed.
function row(context, key, value, question, hiddenText = key.toLowerCase()) {
  const items = Array.isArray(value) ? value : undefined
  return {
    key,
    text: items ? undefined : (value ?? 'Not provided'),
    items: items?.length ? items : undefined,
    ...(items && items.length === 0 ? { text: 'Not provided' } : {}),
    changeHref:
      question && isEditable(context)
        ? manageHref(context.identifier, question)
        : undefined,
    hiddenText
  }
}

function dateText(date) {
  return date === undefined ? undefined : formatDate(date)
}

function periodText(start, end) {
  if (start && end) {
    return `${formatDate(start)} to ${formatDate(end)}`
  }
  return start ? `From ${formatDate(start)}` : dateText(end)
}

function aboutRows(context) {
  const { catalogue, dataAsset } = context
  return [
    row(context, 'Title', dataAsset.titleName, 'about/title'),
    row(context, 'Description', dataAsset.description, 'about/description'),
    row(context, 'Owning organisation', dataAsset.organisationName),
    row(
      context,
      'Data asset type',
      optionalName(catalogue, 'dataAssetTypes', dataAsset.dataAssetTypeCode),
      'about/type'
    ),
    row(
      context,
      'Domain',
      optionalName(catalogue, 'domains', dataAsset.domainCode),
      'about/domain'
    ),
    row(context, 'Version', dataAsset.versionNumber, 'about/version'),
    row(context, 'Identifier', dataAsset.identifier)
  ]
}

function classificationRows(context) {
  const { catalogue, dataAsset } = context
  return [
    row(
      context,
      'Categories',
      names(catalogue, 'categories', dataAsset.categoryCodes),
      'classification/categories'
    ),
    row(
      context,
      'Keywords',
      (dataAsset.keywordNames ?? []).map((name) => {
        const languageCode = catalogue.keywordsByName.get(name)?.languageCode
        return languageCode && languageCode !== 'en'
          ? { text: name, lang: languageCode }
          : { text: name }
      }),
      'classification/keywords'
    ),
    row(
      context,
      'Jurisdictions',
      names(catalogue, 'jurisdictions', dataAsset.jurisdictionCodes),
      'classification/jurisdictions'
    )
  ]
}

function statusRows(context) {
  const { catalogue, dataAsset } = context
  return [
    row(
      context,
      'Lifecycle state',
      optionalName(
        catalogue,
        'dataAssetLifecycleStates',
        dataAsset.lifecycleStateCode
      ),
      'status/lifecycle'
    ),
    row(
      context,
      'Update frequency',
      optionalName(
        catalogue,
        'updateFrequencies',
        dataAsset.updateFrequencyCode
      ),
      'status/update-frequency'
    )
  ]
}

function accessRows(context) {
  const { catalogue, dataAsset } = context
  return [
    row(
      context,
      'Access rights',
      dataAsset.accessRightsDescription,
      'access-and-provenance/access-rights'
    ),
    row(
      context,
      'Provenance',
      dataAsset.provenanceDescription,
      'access-and-provenance/provenance'
    ),
    row(
      context,
      'Creator',
      personName(catalogue, dataAsset.creatorReference),
      'access-and-provenance/creator'
    )
  ]
}

function datesRows(context) {
  const { dataAsset } = context
  return [
    row(context, 'Created', dateText(dataAsset.creationDate), 'dates/created'),
    row(
      context,
      'Accepted',
      dateText(dataAsset.acceptanceDate) ?? 'Set when it is first published'
    ),
    row(
      context,
      'Data last changed',
      dateText(dataAsset.modificationDate),
      'dates/last-changed'
    ),
    row(
      context,
      'Valid',
      dataAsset.validFromDate &&
        (dataAsset.validToDate
          ? periodText(dataAsset.validFromDate, dataAsset.validToDate)
          : `From ${formatDate(dataAsset.validFromDate)}, with no end date`),
      'dates/valid',
      'dates it is valid'
    ),
    row(
      context,
      'Period covered',
      periodText(dataAsset.coverageStartDate, dataAsset.coverageEndDate),
      'dates/coverage'
    ),
    row(
      context,
      'Area covered',
      dataAsset.spatialCoverageDescription,
      'dates/area'
    ),
    row(
      context,
      'Catalogue entry last changed',
      dateText(dataAsset.metadataDate)
    )
  ]
}

function reviewRows(context) {
  const { catalogue, dataAsset } = context
  const frequency = dataAsset.reviewFrequencyMonthQuantity
  return [
    row(
      context,
      'Review frequency',
      frequency === undefined
        ? undefined
        : `Every ${frequency} ${frequency === 1 ? 'month' : 'months'}`,
      'review/frequency'
    ),
    row(context, 'Last reviewed', dateText(dataAsset.lastReviewedDate)),
    row(
      context,
      'Reviewed by',
      personName(catalogue, dataAsset.lastReviewedByName)
    ),
    row(context, 'Next review due', dateText(dataAsset.nextReviewDate)),
    row(context, 'Approved by', personName(catalogue, dataAsset.approvedByName))
  ]
}

function informationAssetRows(context) {
  const { catalogue, dataAsset } = context
  const informationAsset = catalogue.informationAssetsByName.get(
    dataAsset.informationAssetName
  )
  return [
    row(
      context,
      'Information asset',
      dataAsset.informationAssetName,
      'information-asset/choose'
    ),
    row(
      context,
      'Security classification',
      informationAsset &&
        optionalName(
          catalogue,
          'securityClassifications',
          informationAsset.securityClassificationCode
        )
    ),
    row(
      context,
      'Retention period',
      informationAsset?.retentionPeriodDescription
    )
  ]
}

const SIMPLE_SECTIONS = Object.freeze({
  about: aboutRows,
  classification: classificationRows,
  status: statusRows,
  'access-and-provenance': accessRows,
  dates: datesRows,
  review: reviewRows,
  'information-asset': informationAssetRows
})

function peopleCard(context, { title, roleName }, assignments, actions) {
  const canChange = canChangeResponsibility(context)
  return {
    title,
    actions: canChange ? actions : [],
    rows: assignments.length
      ? assignments.map(({ assignment, position }) => ({
          key: assignment.personName,
          text: `${context.catalogue.peopleByKey.get(personKey(assignment.personName, assignment.personEmailAddressReference)).organisationName}, from ${formatDate(assignment.effectiveFromDate)}`,
          changeHref: canChange
            ? manageHref(
                context.identifier,
                'responsibility',
                'assignments',
                String(position),
                'end'
              )
            : undefined,
          changeText: 'End',
          hiddenText: `${assignment.personName}'s assignment`
        }))
      : [{ key: roleName, text: 'None added' }]
  }
}

function currentWithPositions(list, today, predicate = () => true) {
  return (list ?? [])
    .map((item, position) => ({ item, position }))
    .filter(({ item }) => predicate(item) && isCurrentOn(item, today))
}

function assignmentsWithRole(context, roleCode) {
  return currentWithPositions(
    context.dataAsset.governanceAssignments,
    context.today,
    (assignment) => assignment.governanceRoleCode === roleCode
  ).map(({ item, position }) => ({ assignment: item, position }))
}

function custodiansCard(context) {
  const canChange = canChangeResponsibility(context)
  const custodians = currentWithPositions(
    context.dataAsset.custodians,
    context.today
  )
  return {
    title: 'Data custodians',
    actions: canChange
      ? [
          {
            href: manageHref(
              context.identifier,
              'responsibility',
              'data-custodian',
              'add'
            ),
            text: 'Add a data custodian'
          }
        ]
      : [],
    rows: custodians.length
      ? custodians.map(({ item, position }) => ({
          key: item.organisationName,
          text: `From ${formatDate(item.effectiveFromDate)}`,
          changeHref: canChange
            ? manageHref(
                context.identifier,
                'responsibility',
                'custodians',
                String(position),
                'end'
              )
            : undefined,
          changeText: 'End',
          hiddenText: `${item.organisationName} as data custodian`
        }))
      : [{ key: 'Data custodian', text: 'None added' }]
  }
}

function previousAssignments(context) {
  const { dataAsset, today } = context
  const notCurrent = (period) => !isCurrentOn(period, today)
  return [
    ...(dataAsset.governanceAssignments ?? [])
      .filter(notCurrent)
      .map((assignment) => [
        assignment.personName,
        assignment.governanceRoleCode === 'DATA_OWNER'
          ? 'Data owner'
          : 'Data steward',
        periodText(assignment.effectiveFromDate, assignment.effectiveToDate)
      ]),
    ...(dataAsset.custodians ?? [])
      .filter(notCurrent)
      .map((custodian) => [
        custodian.organisationName,
        'Data custodian',
        periodText(custodian.effectiveFromDate, custodian.effectiveToDate)
      ])
  ]
}

function responsibilitySummary(context) {
  const owners = assignmentsWithRole(context, 'DATA_OWNER')
  const ownerAction = owners.some(
    ({ assignment }) => assignment.effectiveToDate === undefined
  )
    ? { path: 'change-data-owner', text: 'Change the data owner' }
    : { path: 'data-owner/add', text: 'Add a data owner' }
  return {
    rows: [
      row(
        context,
        'Delivery group',
        context.dataAsset.deliveryGroupName ?? 'None',
        'responsibility/delivery-group'
      )
    ],
    cards: [
      peopleCard(
        context,
        { title: 'Data owner', roleName: 'Data owner' },
        owners,
        [
          {
            href: manageHref(
              context.identifier,
              'responsibility',
              ownerAction.path
            ),
            text: ownerAction.text
          }
        ]
      ),
      peopleCard(
        context,
        { title: 'Data stewards', roleName: 'Data steward' },
        assignmentsWithRole(context, 'DATA_STEWARD'),
        [
          {
            href: manageHref(
              context.identifier,
              'responsibility',
              'data-steward',
              'add'
            ),
            text: 'Add a data steward'
          }
        ]
      ),
      custodiansCard(context)
    ],
    inset: canChangeResponsibility(context)
      ? 'A data custodian is recommended, but you can publish without one.'
      : 'Ask a catalogue administrator to change who is responsible for this data asset.',
    previous: previousAssignments(context)
  }
}

function distributionRows(context, distribution, position) {
  const { catalogue } = context
  const question = (name) =>
    isEditable(context)
      ? manageHref(context.identifier, 'distributions', String(position), name)
      : undefined
  const entry = (key, value, name) => ({
    key,
    text: value ?? 'Not provided',
    changeHref: question(name),
    hiddenText: `${key.toLowerCase()} of ${distribution.name}`
  })
  const licence =
    distribution.licenceCode &&
    referenceValue(catalogue, 'licences', distribution.licenceCode)
  return [
    entry('Name', distribution.name, 'name'),
    entry('Description', distribution.description, 'name'),
    entry(
      'Type',
      optionalName(
        catalogue,
        'distributionTypes',
        distribution.distributionTypeCode
      ),
      'type'
    ),
    entry(
      'Access method',
      optionalName(catalogue, 'accessMethods', distribution.accessMethodCode),
      'access-method'
    ),
    entry(
      'Format',
      optionalName(
        catalogue,
        'distributionFormats',
        distribution.distributionFormatCode
      ),
      'format'
    ),
    entry(
      'Authentication',
      optionalName(
        catalogue,
        'authenticationMethods',
        distribution.authenticationMethodCode
      ),
      'authentication'
    ),
    entry(
      'Licence',
      licence &&
        [licence.name, licence.versionNumber].filter(Boolean).join(' '),
      'licence'
    ),
    entry('Access address', distribution.accessReference, 'addresses'),
    entry('Download address', distribution.downloadReference, 'addresses'),
    ...(distribution.distributionTypeCode === 'EVENT_STREAM'
      ? [
          entry('Broker address', distribution.brokerReference, 'addresses'),
          entry('Topic', distribution.topicName, 'addresses')
        ]
      : []),
    entry('Data service', distribution.dataServiceTitleName, 'data-service'),
    entry('Version', distribution.versionNumber, 'version-and-size'),
    entry(
      'Size',
      distribution.byteSizeQuantity === undefined
        ? undefined
        : `${distribution.byteSizeQuantity} bytes`,
      'version-and-size'
    )
  ]
}

function distributionsSummary(context) {
  const checks = publicationChecks(context.dataAsset, { today: context.today })
  return {
    cards: (context.dataAsset.distributions ?? []).map(
      (distribution, position) => ({
        title: distribution.name,
        isIncomplete: checks.some((check) => check.position === position),
        actions: isEditable(context)
          ? [
              {
                href: manageHref(
                  context.identifier,
                  'distributions',
                  String(position),
                  'remove'
                ),
                text: 'Remove',
                hiddenText: distribution.name
              }
            ]
          : [],
        rows: distributionRows(context, distribution, position)
      })
    ),
    buttons: isEditable(context)
      ? [
          {
            href: manageHref(context.identifier, 'distributions', 'add'),
            text: 'Add a distribution'
          }
        ]
      : [],
    emptyText:
      'There are no distributions for this data asset. You need at least 1 to publish it.'
  }
}

function relatedSummary(context) {
  const { catalogue, dataAsset } = context
  return {
    rows: (dataAsset.relationships ?? []).map((relationship, position) => ({
      key: optionalName(
        catalogue,
        'relationshipTypes',
        relationship.relationshipTypeCode
      ),
      text: relationshipTargetText(catalogue, relationship),
      items: relationship.description
        ? [
            relationshipTargetText(catalogue, relationship),
            relationship.description
          ]
        : undefined,
      changeHref: isEditable(context)
        ? manageHref(
            context.identifier,
            'related-resources',
            String(position),
            'remove'
          )
        : undefined,
      changeText: 'Remove',
      hiddenText: relationshipTargetText(catalogue, relationship)
    })),
    buttons: isEditable(context)
      ? [
          {
            href: manageHref(context.identifier, 'related-resources', 'add'),
            text: 'Add a related resource'
          }
        ]
      : [],
    emptyText: 'There are no related resources.'
  }
}

// Everything a section's summary page shows
export function sectionSummary(context, section) {
  if (SIMPLE_SECTIONS[section.id]) {
    const summary = { rows: SIMPLE_SECTIONS[section.id](context) }
    if (section.id === 'review' && isEditable(context)) {
      summary.buttons = [
        {
          href: manageHref(context.identifier, 'review', 'record'),
          text: 'Record a review'
        }
      ]
    }
    return summary
  }
  if (section.id === 'responsibility') {
    return responsibilitySummary(context)
  }
  return section.id === 'distributions'
    ? distributionsSummary(context)
    : relatedSummary(context)
}

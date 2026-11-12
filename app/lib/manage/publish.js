import { manageHref } from './context.js'

// Each S26 check as something the user can do, linking to the page that
// fixes it (section 6.9 of the journeys 2 and 3 plan)

const FIELD_ACTIONS = Object.freeze({
  accessRightsDescription: [
    'say who can access and use the data',
    'access-and-provenance/access-rights'
  ],
  provenanceDescription: [
    'say where the data comes from',
    'access-and-provenance/provenance'
  ],
  creatorReference: [
    'say who created the data',
    'access-and-provenance/creator'
  ],
  creationDate: ['give the date the data asset was created', 'dates/created'],
  modificationDate: [
    'give the date the data was last changed',
    'dates/last-changed'
  ],
  validFromDate: ['give the date the data asset is valid from', 'dates/valid'],
  metadataDate: ['save the title again to date this entry', 'about/title'],
  dataAssetTypeCode: ['say what type of data it is', 'about/type'],
  domainCode: ['choose its livestock domain', 'about/domain'],
  lifecycleStateCode: [
    'say what stage the data asset is at',
    'status/lifecycle'
  ],
  updateFrequencyCode: [
    'say how often the data is updated',
    'status/update-frequency'
  ],
  categoryCodes: ['add at least one category', 'classification/categories'],
  keywordNames: ['add at least one keyword', 'classification/keywords'],
  jurisdictionCodes: [
    'say where the data asset applies',
    'classification/jurisdictions'
  ]
})

const DATE_ACTIONS = Object.freeze({
  acceptanceDate: [
    'correct the date the data asset was created, which is after the date it was accepted',
    'dates/created'
  ],
  modificationDate: [
    'correct the date the data was last changed, which is before the date it was created',
    'dates/last-changed'
  ],
  validToDate: [
    'correct the date the data asset is valid to, which is before the date it is valid from',
    'dates/valid'
  ],
  coverageEndDate: [
    'correct the period the data covers, which ends before it starts',
    'dates/coverage'
  ],
  nextReviewDate: [
    'correct the next review date, which is before the last review',
    'review/record'
  ]
})

const ROLES = Object.freeze({
  DATA_OWNER: ['a data owner', 'data-owner'],
  DATA_STEWARD: ['a data steward', 'data-steward']
})

const DISTRIBUTION_ACTIONS = Object.freeze({
  distributionTypeCode: (name) => [
    `say what type of distribution ${name} is`,
    'type'
  ],
  accessMethodCode: (name) => [`say how ${name} is accessed`, 'access-method'],
  authenticationMethodCode: (name) => [
    `say what authentication ${name} needs`,
    'authentication'
  ],
  distributionFormatCode: (name) => [
    `give the distribution ${name} a format`,
    'format'
  ],
  licenceCode: (name) => [`give the distribution ${name} a licence`, 'licence'],
  accessReference: (name) => [`correct the addresses of ${name}`, 'addresses'],
  downloadReference: (name) => [
    `correct the addresses of ${name}`,
    'addresses'
  ],
  brokerReference: (name) => [`correct the addresses of ${name}`, 'addresses']
})

// Only a catalogue administrator can add one, so a data steward is sent
// to the section that says who is responsible
function governanceAction(context, check) {
  const [role, path] = ROLES[check.field]
  return context.canAssignRoles
    ? {
        text: `add ${role}`,
        href: manageHref(context.identifier, 'responsibility', path, 'add')
      }
    : {
        text: `ask a catalogue administrator to add ${role}`,
        href: manageHref(context.identifier, 'responsibility')
      }
}

function distributionAction(context, check) {
  const [text, question] = DISTRIBUTION_ACTIONS[check.field](
    check.distributionName
  )
  return {
    text,
    href: manageHref(
      context.identifier,
      'distributions',
      String(check.position),
      question
    )
  }
}

function pathAction(context, [text, path]) {
  return { text, href: manageHref(context.identifier, path) }
}

function actionFor(context, check) {
  switch (check.kind) {
    case 'governance':
      return governanceAction(context, check)
    case 'distribution':
      return distributionAction(context, check)
    case 'dates':
      return pathAction(context, DATE_ACTIONS[check.field])
    case 'distributions':
      return pathAction(context, [
        'add at least one distribution',
        'distributions/add'
      ])
    case 'informationAsset':
      return pathAction(context, [
        'choose the information asset that governs this data asset',
        'information-asset/choose'
      ])
    default:
      return pathAction(context, FIELD_ACTIONS[check.field])
  }
}

// The same action can come from 2 checks, such as 2 invalid addresses on
// one distribution, so each is listed once
export function publicationActions(context, checks) {
  const actions = new Map()
  for (const check of checks) {
    const action = actionFor(context, check)
    actions.set(`${action.text}\n${action.href}`, action)
  }
  return [...actions.values()]
}

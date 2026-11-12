// Made-up answers for the manage pages, and steps that fill them in
// through the forms, as a participant would

export const JO_BLOGGS = '8d8f18d7-ef4f-4188-b706-90c58a9d0fb3'
export const SAM_SPECIMEN = '7bff5498-dd64-4e3b-949b-e6c6e8b1c023'
export const ALEX_EXAMPLE = '87701706-bbda-4745-b73e-462eaab66f2d'

export function dateAnswer(name, isoDate) {
  const [year, month, day] = isoDate ? isoDate.split('-') : ['', '', '']
  return {
    [`${name}-day`]: day,
    [`${name}-month`]: month,
    [`${name}-year`]: year
  }
}

export const NEW_DATA_ASSET = Object.freeze({
  titleName: 'Made-up cattle records',
  description: 'Made-up records of cattle, for research sessions.',
  organisationName: 'Animal and Plant Health Agency'
})

// Every answer S26 needs to publish, in the order the checks list them
export const REQUIRED_ANSWERS = Object.freeze([
  [
    'access-and-provenance/access-rights',
    { accessRightsDescription: 'Defra staff.' }
  ],
  ['access-and-provenance/provenance', { provenanceDescription: 'Made up.' }],
  ['access-and-provenance/creator', { creatorReference: JO_BLOGGS }],
  ['dates/created', dateAnswer('creationDate', '2024-02-01')],
  ['dates/last-changed', dateAnswer('modificationDate', '2025-03-03')],
  [
    'dates/valid',
    {
      ...dateAnswer('validFromDate', '2024-02-01'),
      ...dateAnswer('validToDate', undefined)
    }
  ],
  ['about/type', { dataAssetTypeCode: 'MASTER_DATA' }],
  ['about/domain', { domainCode: 'ANIMAL' }],
  ['status/lifecycle', { lifecycleStateCode: 'ACTIVE' }],
  ['status/update-frequency', { updateFrequencyCode: 'DAILY' }],
  ['classification/categories', { categoryCodes: 'CATTLE' }],
  ['classification/keywords', { keywords: 'cattle' }],
  ['classification/jurisdictions', { jurisdictionCodes: 'GB-ENG' }],
  [
    'responsibility/data-owner/add',
    { person: JO_BLOGGS, ...dateAnswer('effectiveFromDate', '2025-01-01') }
  ],
  [
    'responsibility/data-steward/add',
    { person: SAM_SPECIMEN, ...dateAnswer('effectiveFromDate', '2025-01-01') }
  ],
  [
    'information-asset/choose',
    { informationAssetName: 'Animal Disease Records' }
  ]
])

export const DISTRIBUTION_ANSWERS = Object.freeze([
  ['type', { distributionTypeCode: 'API' }],
  ['access-method', { accessMethodCode: 'REST_API' }],
  ['format', { distributionFormatCode: 'JSON' }],
  ['authentication', { authenticationMethodCode: 'OAUTH2' }],
  ['licence', { licenceCode: 'OGL' }],
  [
    'addresses',
    { accessReference: 'https://api.example.org/cattle', downloadReference: '' }
  ],
  ['data-service', { dataServiceTitleName: 'none' }],
  ['version-and-size', { versionNumber: '', byteSizeQuantity: '' }]
])

// Saves an answer, failing loudly if the page shows an error instead
export async function answer(visitor, path, answers) {
  const page = await visitor.post(path, answers)
  if (page.status !== 303) {
    const errors = [
      ...page.document.querySelectorAll('.govuk-error-summary__list a')
    ].map((link) => link.textContent.trim())
    throw new Error(`${path} gave ${page.status}: ${errors.join(', ')}`)
  }
  return page
}

// Creates a draft as a catalogue administrator, and gives its address
export async function createDraft(visitor, answers = NEW_DATA_ASSET) {
  const page = await answer(visitor, '/manage/data-assets/create', answers)
  return page.headers.get('location').split('?')[0]
}

export async function addDistribution(visitor, address, name = 'Cattle API') {
  const added = await answer(visitor, `${address}/distributions/add`, {
    name,
    description: ''
  })
  let next = added.headers.get('location')
  for (const [question, answers] of DISTRIBUTION_ANSWERS) {
    if (!next.includes(`/${question}?adding=yes`)) {
      throw new Error(`Expected ${question}, but was sent to ${next}`)
    }
    next = (await answer(visitor, next, answers)).headers.get('location')
  }
  return next
}

export async function completeDraft(visitor, address) {
  for (const [path, answers] of REQUIRED_ANSWERS) {
    await answer(visitor, `${address}/${path}`, answers)
  }
  await addDistribution(visitor, address)
}

export async function publishedDataAsset(visitor) {
  const address = await createDraft(visitor)
  await completeDraft(visitor, address)
  await answer(visitor, `${address}/publish`, {})
  return address
}

export function textsOf(page, selector) {
  return [...page.document.querySelectorAll(selector)].map((element) =>
    element.textContent.trim().replace(/\s+/g, ' ')
  )
}

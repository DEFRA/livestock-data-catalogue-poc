import { readFileSync } from 'node:fs'

export const COLLECTION_FILES = Object.freeze({
  dataAssets: 'data-assets.json',
  organisations: 'organisations.json',
  people: 'people.json',
  deliveryGroups: 'delivery-groups.json',
  dataServices: 'data-services.json',
  informationAssets: 'information-assets.json',
  keywords: 'keywords.json',
  organisationTypes: 'organisation-types.json',
  dataAssetTypes: 'data-asset-types.json',
  domains: 'domains.json',
  dataAssetLifecycleStates: 'data-asset-lifecycle-states.json',
  publicationStates: 'publication-states.json',
  categories: 'categories.json',
  jurisdictions: 'jurisdictions.json',
  dataAssetGovernanceRoles: 'data-asset-governance-roles.json',
  distributionTypes: 'distribution-types.json',
  accessMethods: 'access-methods.json',
  distributionFormats: 'distribution-formats.json',
  authenticationMethods: 'authentication-methods.json',
  licences: 'licences.json',
  codeLists: 'code-lists.json'
})

export const REFERENCE_COLLECTIONS = Object.freeze([
  'organisationTypes',
  'dataAssetTypes',
  'domains',
  'dataAssetLifecycleStates',
  'publicationStates',
  'categories',
  'jurisdictions',
  'dataAssetGovernanceRoles',
  'distributionTypes',
  'accessMethods',
  'distributionFormats',
  'authenticationMethods',
  'licences'
])

export const CODE_LISTS = Object.freeze([
  'updateFrequencies',
  'relationshipTypes',
  'securityClassifications'
])

const DATA_DIRECTORY = new URL('../data/catalogue/', import.meta.url)

export function readCollections(directory = DATA_DIRECTORY) {
  return Object.fromEntries(
    Object.entries(COLLECTION_FILES).map(([collectionName, fileName]) => [
      collectionName,
      JSON.parse(readFileSync(new URL(fileName, directory), 'utf8'))
    ])
  )
}

export function personKey(name, emailAddressReference) {
  return `${name}\n${emailAddressReference}`
}

function byKey(documents, keyOf) {
  return new Map(documents.map((document) => [keyOf(document), document]))
}

function referenceLists(collections) {
  const lists = REFERENCE_COLLECTIONS.map((name) => [name, collections[name]])
  const codeLists = CODE_LISTS.map((name) => [
    name,
    collections.codeLists[name]
  ])
  return new Map(
    [...lists, ...codeLists].map(([name, values]) => [
      name,
      byKey(values, (value) => value.code)
    ])
  )
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

export function buildCatalogue(collections) {
  deepFreeze(collections)
  return Object.freeze({
    collections,
    dataAssetsByIdentifier: byKey(
      collections.dataAssets,
      (dataAsset) => dataAsset.identifier
    ),
    organisationsByName: byKey(
      collections.organisations,
      (organisation) => organisation.name
    ),
    peopleByKey: byKey(collections.people, (person) =>
      personKey(person.name, person.emailAddressReference)
    ),
    deliveryGroupsByName: byKey(
      collections.deliveryGroups,
      (deliveryGroup) => deliveryGroup.name
    ),
    dataServicesByTitle: byKey(
      collections.dataServices,
      (dataService) => dataService.titleName
    ),
    informationAssetsByName: byKey(
      collections.informationAssets,
      (informationAsset) => informationAsset.name
    ),
    referenceLists: referenceLists(collections)
  })
}

// Read once at start-up: the prototype fails to start if a file is
// missing or isn't valid JSON
export const catalogue = buildCatalogue(readCollections())

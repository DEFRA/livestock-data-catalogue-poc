import Joi from 'joi'

import {
  codeListsSchema,
  categorySchema,
  distributionFormatSchema,
  jurisdictionSchema,
  licenceSchema,
  plainReferenceSchema
} from './reference.js'
import {
  dataServiceSchema,
  deliveryGroupSchema,
  informationAssetSchema,
  keywordSchema,
  organisationSchema,
  personSchema
} from './core.js'
import { dataAssetSchema } from './data-asset.js'

// The data contract: one schema for each collection in app/data/catalogue
export const COLLECTION_SCHEMAS = Object.freeze({
  dataAssets: dataAssetSchema,
  organisations: organisationSchema,
  people: personSchema,
  deliveryGroups: deliveryGroupSchema,
  dataServices: dataServiceSchema,
  informationAssets: informationAssetSchema,
  keywords: keywordSchema,
  organisationTypes: plainReferenceSchema,
  dataAssetTypes: plainReferenceSchema,
  domains: plainReferenceSchema,
  dataAssetLifecycleStates: plainReferenceSchema,
  publicationStates: plainReferenceSchema,
  categories: categorySchema,
  jurisdictions: jurisdictionSchema,
  dataAssetGovernanceRoles: plainReferenceSchema,
  distributionTypes: plainReferenceSchema,
  accessMethods: plainReferenceSchema,
  distributionFormats: distributionFormatSchema,
  authenticationMethods: plainReferenceSchema,
  licences: licenceSchema
})

function describe(collectionName, details) {
  return details.map(
    (detail) =>
      `${collectionName}${detail.path.map((part) => `[${part}]`).join('')}: ${detail.message}`
  )
}

export function findSchemaErrors(collections) {
  const collectionErrors = Object.entries(COLLECTION_SCHEMAS).flatMap(
    ([collectionName, schema]) => {
      const { error } = Joi.array()
        .items(schema)
        .required()
        .validate(collections[collectionName], { abortEarly: false })
      return error ? describe(collectionName, error.details) : []
    }
  )
  const { error } = codeListsSchema
    .required()
    .validate(collections.codeLists, { abortEarly: false })
  return [
    ...collectionErrors,
    ...(error ? describe('codeLists', error.details) : [])
  ]
}

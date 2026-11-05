import Joi from 'joi'

import { anyAddress, code, text } from './common.js'

const MEDIA_TYPE_PATTERN = /^[a-z]+\/[a-z0-9.+-]+$/

function referenceSchema(extraFields = {}) {
  return Joi.object({
    code: code.required(),
    name: text.required(),
    description: text,
    ...extraFields
  })
}

export const plainReferenceSchema = referenceSchema()

export const categorySchema = referenceSchema({
  vocabularyReference: anyAddress
})

export const jurisdictionSchema = referenceSchema({ reference: anyAddress })

export const distributionFormatSchema = referenceSchema({
  mediaType: Joi.string().pattern(MEDIA_TYPE_PATTERN)
})

// S23 gives Licence a version and a reference, but no description
export const licenceSchema = Joi.object({
  code: code.required(),
  name: text.required(),
  versionNumber: text,
  reference: anyAddress
})

const codeListValues = Joi.array().items(plainReferenceSchema).min(1)

export const codeListsSchema = Joi.object({
  updateFrequencies: codeListValues.required(),
  relationshipTypes: codeListValues.required(),
  securityClassifications: codeListValues.required()
})

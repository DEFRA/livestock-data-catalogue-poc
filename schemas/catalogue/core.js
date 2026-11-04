import Joi from 'joi'

import {
  code,
  emailAddress,
  httpsAddress,
  systemAttributes,
  text
} from './common.js'

export const organisationSchema = Joi.object({
  name: text.required(),
  abbreviatedName: text,
  description: text,
  websiteReference: httpsAddress,
  parentOrganisationName: text,
  organisationTypeCode: code.required(),
  ...systemAttributes
})

export const personSchema = Joi.object({
  name: text.required(),
  emailAddressReference: emailAddress.required(),
  organisationName: text.required(),
  ...systemAttributes
})

export const deliveryGroupSchema = Joi.object({
  name: text.required(),
  organisationName: text.required(),
  description: text,
  ...systemAttributes
})

export const dataServiceSchema = Joi.object({
  titleName: text.required(),
  description: text,
  endpointReference: httpsAddress,
  serviceType: text,
  ...systemAttributes
})

export const informationAssetSchema = Joi.object({
  name: text.required(),
  securityClassificationCode: code.required(),
  retentionPeriodDescription: text.required(),
  ...systemAttributes
})

export const keywordSchema = Joi.object({
  name: text.required()
})

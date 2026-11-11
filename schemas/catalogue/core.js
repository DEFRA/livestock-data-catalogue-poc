import Joi from 'joi'

import {
  anyAddress,
  code,
  emailAddress,
  systemAttributes,
  text
} from './common.js'

export const organisationSchema = Joi.object({
  name: text.required(),
  abbreviatedName: text,
  description: text,
  websiteReference: anyAddress,
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
  endpointReference: anyAddress,
  serviceType: text,
  ...systemAttributes
})

export const informationAssetSchema = Joi.object({
  name: text.required(),
  securityClassificationCode: code.required(),
  retentionPeriodDescription: text.required(),
  ...systemAttributes
})

// An ISO 639-1 code, such as "cy" for Welsh, so the page can mark a
// keyword in another language for screen readers (WCAG 2.2 SC 3.1.2)
export const keywordSchema = Joi.object({
  name: text.required(),
  languageCode: Joi.string()
    .pattern(/^[a-z]{2}$/)
    .required()
})

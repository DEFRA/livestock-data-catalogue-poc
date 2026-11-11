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

// ISO 639-1 codes for the languages of the UK and Ireland: English, Welsh,
// Scottish Gaelic and Irish. An allow-list, so a page never gets a lang
// attribute that screen readers can't use (WCAG 2.2 SC 3.1.2). Add a code
// here when a keyword needs another language.
export const KEYWORD_LANGUAGE_CODES = ['en', 'cy', 'gd', 'ga']

export const keywordSchema = Joi.object({
  name: text.required(),
  languageCode: Joi.string()
    .valid(...KEYWORD_LANGUAGE_CODES)
    .required()
})

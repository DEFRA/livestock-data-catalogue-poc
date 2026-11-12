import Joi from 'joi'

import {
  anyAddress,
  code,
  emailAddress,
  entraObjectId,
  name,
  systemAttributes,
  text
} from './common.js'

export const organisationSchema = Joi.object({
  name: name.required(),
  abbreviatedName: name,
  description: text,
  websiteReference: anyAddress,
  parentOrganisationName: name,
  organisationTypeCode: code.required(),
  ...systemAttributes
})

export const personSchema = Joi.object({
  name: name.required(),
  emailAddressReference: emailAddress.required(),
  entraObjectId: entraObjectId.required(),
  organisationName: name.required(),
  ...systemAttributes
})

export const deliveryGroupSchema = Joi.object({
  name: name.required(),
  organisationName: name.required(),
  description: text,
  ...systemAttributes
})

// S24, without the Service Type the data architect dropped (LDAT-252,
// question 33)
export const dataServiceSchema = Joi.object({
  titleName: name.required(),
  description: text,
  endpointReference: anyAddress,
  ...systemAttributes
})

export const informationAssetSchema = Joi.object({
  name: name.required(),
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
  name: name.required(),
  languageCode: Joi.string()
    .valid(...KEYWORD_LANGUAGE_CODES)
    .required()
})

import Joi from 'joi'

import { DATA_ASSET_IDENTIFIER_PATTERN } from '../../app/lib/identifiers.js'
import {
  anyAddress,
  code,
  date,
  emailAddress,
  httpsAddress,
  ignoringCase,
  systemAttributes,
  text,
  wholeNumber
} from './common.js'

const relationship = Joi.object({
  targetResourceIdentifier: text.required(),
  relationshipTypeCode: code.required(),
  description: text
})

const governanceAssignment = Joi.object({
  personName: text.required(),
  personEmailAddressReference: emailAddress.required(),
  governanceRoleCode: code.required(),
  effectiveFromDate: date.required(),
  effectiveToDate: date
})

const custodian = Joi.object({
  organisationName: text.required(),
  effectiveFromDate: date.required(),
  effectiveToDate: date
})

const distribution = Joi.object({
  name: text.required(),
  description: text,
  distributionTypeCode: code,
  accessMethodCode: code,
  distributionFormatCode: code,
  authenticationMethodCode: code,
  licenceCode: code,
  dataServiceTitleName: text,
  accessReference: httpsAddress,
  downloadReference: httpsAddress,
  brokerReference: anyAddress,
  byteSizeQuantity: wholeNumber.min(0),
  topicName: text,
  versionNumber: text
})

// Only the attributes needed to save a draft are required here (S05, S11).
// The attributes needed to publish are checked in publication.js (S26).
export const dataAssetSchema = Joi.object({
  identifier: Joi.string().pattern(DATA_ASSET_IDENTIFIER_PATTERN).required(),
  titleName: text.required(),
  description: text.required(),
  organisationName: text.required(),
  publicationStateCode: code.required(),
  accessRightsDescription: text,
  provenanceDescription: text,
  creatorReference: text,
  creationDate: date,
  acceptanceDate: date,
  modificationDate: date,
  validFromDate: date,
  validToDate: date,
  metadataDate: date,
  lastReviewedDate: date,
  nextReviewDate: date,
  reviewFrequencyMonthQuantity: wholeNumber.min(1),
  lastReviewedByName: text,
  approvedByName: text,
  versionNumber: text,
  spatialCoverageDescription: text,
  coverageStartDate: date,
  coverageEndDate: date,
  deletionDate: date,
  deliveryGroupName: text,
  dataAssetTypeCode: code,
  domainCode: code,
  lifecycleStateCode: code,
  updateFrequencyCode: code,
  informationAssetName: text,
  categoryCodes: Joi.array().items(code).unique(),
  keywordNames: Joi.array().items(text).unique(ignoringCase),
  jurisdictionCodes: Joi.array().items(code).unique(),
  relationships: Joi.array()
    .items(relationship)
    .unique(
      (first, second) =>
        first.targetResourceIdentifier === second.targetResourceIdentifier &&
        first.relationshipTypeCode === second.relationshipTypeCode
    ),
  governanceAssignments: Joi.array().items(governanceAssignment),
  custodians: Joi.array().items(custodian),
  distributions: Joi.array().items(distribution),
  ...systemAttributes
})

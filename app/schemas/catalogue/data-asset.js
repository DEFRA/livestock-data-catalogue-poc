import Joi from 'joi'

import { DATA_ASSET_IDENTIFIER_PATTERN } from '../../lib/identifiers.js'
import {
  anyAddress,
  code,
  date,
  emailAddress,
  entraObjectId,
  ignoringCase,
  LONGEST_ADDRESS,
  name,
  systemAttributes,
  text,
  wholeNumber
} from './common.js'

const relationship = Joi.object({
  // A data asset identifier or an address, so as long as an address can be
  targetResourceIdentifier: Joi.string().max(LONGEST_ADDRESS).required(),
  relationshipTypeCode: code.required(),
  description: text
})

const governanceAssignment = Joi.object({
  personName: name.required(),
  personEmailAddressReference: emailAddress.required(),
  governanceRoleCode: code.required(),
  effectiveFromDate: date.required(),
  effectiveToDate: date
})

const custodian = Joi.object({
  organisationName: name.required(),
  effectiveFromDate: date.required(),
  effectiveToDate: date
})

const distribution = Joi.object({
  name: name.required(),
  description: text,
  distributionTypeCode: code,
  accessMethodCode: code,
  distributionFormatCode: code,
  authenticationMethodCode: code,
  licenceCode: code,
  dataServiceTitleName: name,
  accessReference: anyAddress,
  downloadReference: anyAddress,
  brokerReference: anyAddress,
  byteSizeQuantity: wholeNumber.min(0),
  topicName: name,
  versionNumber: name
})

// Only the attributes needed to save a draft are required here (S05, S11).
// The attributes needed to publish are checked in publication.js (S26).
export const dataAssetSchema = Joi.object({
  identifier: Joi.string().pattern(DATA_ASSET_IDENTIFIER_PATTERN).required(),
  titleName: name.required(),
  description: text.required(),
  organisationName: name.required(),
  publicationStateCode: code.required(),
  accessRightsDescription: text,
  provenanceDescription: text,
  // The creator, last reviewer and approver are people, held by their
  // Microsoft Entra ID (LDAT-252, question 38). The names are V0.11's until
  // the model changes.
  creatorReference: entraObjectId,
  creationDate: date,
  acceptanceDate: date,
  modificationDate: date,
  validFromDate: date,
  validToDate: date,
  metadataDate: date,
  lastReviewedDate: date,
  nextReviewDate: date,
  reviewFrequencyMonthQuantity: wholeNumber.min(1),
  lastReviewedByName: entraObjectId,
  approvedByName: entraObjectId,
  versionNumber: name,
  spatialCoverageDescription: text,
  coverageStartDate: date,
  coverageEndDate: date,
  deletionDate: date,
  deliveryGroupName: name,
  dataAssetTypeCode: code,
  domainCode: code,
  lifecycleStateCode: code,
  updateFrequencyCode: code,
  informationAssetName: name,
  categoryCodes: Joi.array().items(code).unique(),
  keywordNames: Joi.array().items(name).unique(ignoringCase),
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

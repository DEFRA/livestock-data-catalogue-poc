import { isDeepStrictEqual } from 'node:util'

import { today as todayInLondon } from '../clock.js'
import { isDataAssetIdentifier } from '../identifiers.js'
import {
  canAssignRoles,
  canCreate,
  canManage,
  managesDataAssets
} from '../personas.js'
import { catalogueFor, currentPersona } from '../working-copy.js'

// Thrown when a page, or an item on it, doesn't exist for this persona.
// Every such case shows Page not found, so nothing says whether a data
// asset exists that the persona can't manage.
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.status = 404
  }
}

export const EDITABLE_STATES = Object.freeze(['DRAFT', 'PUBLISHED'])

export function manageHref(identifier, ...path) {
  return ['/manage/data-assets', identifier, ...path].join('/')
}

function contextFor(req) {
  const persona = currentPersona(req)
  return {
    req,
    persona,
    catalogue: catalogueFor(req),
    today: todayInLondon(),
    canAssignRoles: canAssignRoles(persona),
    canCreate: canCreate(persona)
  }
}

// The manage pages are only for personas who manage data assets
export function requireManager(req, res, next) {
  const context = contextFor(req)
  if (!managesDataAssets(context.persona)) {
    throw new NotFoundError()
  }
  req.manage = context
  next()
}

export function requireCreator(req, res, next) {
  if (!req.manage.canCreate) {
    throw new NotFoundError()
  }
  next()
}

// Loads the data asset in the address, and checks the persona can manage
// it, before anything else happens
export function requireManagedDataAsset(req, res, next) {
  const { identifier } = req.params
  const { catalogue, persona, today } = req.manage
  const dataAsset = isDataAssetIdentifier(identifier)
    ? catalogue.dataAssetsByIdentifier.get(identifier)
    : undefined
  if (!dataAsset || !canManage(catalogue, persona, dataAsset, today)) {
    throw new NotFoundError()
  }
  req.manage.dataAsset = dataAsset
  req.manage.identifier = identifier
  next()
}

export function isEditable(context) {
  return EDITABLE_STATES.includes(context.dataAsset.publicationStateCode)
}

// A date and time in the data's format, YYYY-MM-DDThh:mm:ssZ
export function systemDateTime(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function withoutEmptyValues(document) {
  for (const [key, value] of Object.entries(document)) {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete document[key]
    }
  }
  return document
}

// Every saved change sets the Metadata Date (S06) and the system
// attributes. Changing a published data asset sends it back to Draft, so
// it must pass the checks and be published again (LDAT-252, question 25).
export function stamped(context, document, { backToDraft = true } = {}) {
  withoutEmptyValues(document)
  document.metadataDate = context.today
  document.systemUpdatedDateTime = systemDateTime()
  document.systemUpdatedByUserId = context.persona.entraObjectId
  if (backToDraft && document.publicationStateCode === 'PUBLISHED') {
    document.publicationStateCode = 'DRAFT'
  }
  return document
}

export function editedDataAsset(context, update, options) {
  const document = structuredClone(context.dataAsset)
  update(document)
  return stamped(context, document, options)
}

// Saving the same answers again changes nothing, so a published data
// asset stays published and the history gets no new row
export function editChange(context, update, extra = {}) {
  const before = withoutEmptyValues(structuredClone(context.dataAsset))
  const after = structuredClone(context.dataAsset)
  update(after)
  withoutEmptyValues(after)
  if (isDeepStrictEqual(before, after) && Object.keys(extra).length === 0) {
    return undefined
  }
  return {
    action: 'edit',
    identifier: context.identifier,
    dataAsset: stamped(context, after),
    ...extra
  }
}

// An item's position in a list, from the address. Anything that isn't a
// whole number in range shows Page not found.
export function itemAt(list, positionText) {
  const position = /^\d{1,3}$/.test(positionText) ? Number(positionText) : NaN
  if (!Number.isInteger(position) || position >= (list?.length ?? 0)) {
    throw new NotFoundError()
  }
  return { item: list[position], position }
}

// Only a catalogue administrator assigns governance roles (LDAT-252,
// question 24)
export function canChangeResponsibility(context) {
  return context.canAssignRoles && isEditable(context)
}

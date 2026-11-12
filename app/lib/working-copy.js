import { findSchemaErrors } from '../schemas/catalogue/index.js'
import { findRuleBreaches } from '../schemas/catalogue/rules.js'
import { buildCatalogue, catalogue as baseCatalogue } from './catalogue-data.js'
import { today as todayInLondon } from './clock.js'
import { newCsrfToken } from './csrf.js'
import { describeChanges } from './history.js'
import { logEvent } from './log.js'
import { DEFAULT_PERSONA_ID, personFor, personaFor } from './personas.js'

// Limits that keep each session small (decision D33). The size limit,
// times the 500 sessions the store keeps, must fit in the container's
// memory.
export const MOST_NEW_DATA_ASSETS = 20
const MOST_HISTORY_ENTRIES = 1000
const MOST_ADDED = Object.freeze({
  keywords: 300,
  informationAssets: 20,
  dataServices: 20
})
const MOST_SESSION_CHARACTERS = 500_000

// Publishing, deprecating, retiring and deleting add little or nothing,
// so only these are checked
const GROWING_ACTIONS = new Set(['create', 'edit'])

// A change that would take the session over its limits. The page says so,
// and nothing is saved.
export class SessionFullError extends Error {}

function isTooBig(changes) {
  return (
    Object.entries(MOST_ADDED).some(
      ([listName, most]) => changes[listName].length > most
    ) ||
    JSON.stringify({ ...changes, history: undefined }).length >
      MOST_SESSION_CHARACTERS
  )
}

function emptyChanges(
  personaId = DEFAULT_PERSONA_ID,
  csrfToken = newCsrfToken()
) {
  return {
    personaId,
    csrfToken,
    dataAssets: {},
    deletedIdentifiers: [],
    issuedIdentifiers: [],
    keywords: [],
    informationAssets: [],
    dataServices: [],
    history: []
  }
}

export function sessionChanges(req) {
  return req.prototypeSession.data
}

// Pages with forms need a session for their CSRF token
export function ensureSessionChanges(req) {
  if (sessionChanges(req) === undefined) {
    req.prototypeSession.save(emptyChanges(), { isDisposable: true })
  }
  return sessionChanges(req)
}

export function csrfTokenFor(req) {
  return sessionChanges(req)?.csrfToken
}

export function currentPersona(req) {
  return personaFor(sessionChanges(req)?.personaId)
}

// Choosing who you are gives the session a new ID and form token, so an
// ID or token known before can't be used to act as this persona
export function choosePersona(req, personaId) {
  req.prototypeSession.renew({
    ...ensureSessionChanges(req),
    personaId,
    csrfToken: newCsrfToken()
  })
}

// Removes every change, but keeps the persona and the form token
export function resetChanges(req) {
  const changes = ensureSessionChanges(req)
  req.prototypeSession.save(emptyChanges(changes.personaId, changes.csrfToken))
  workingCatalogues.delete(req)
}

function hasDataChanges(changes) {
  return (
    changes !== undefined &&
    (Object.keys(changes.dataAssets).length > 0 ||
      changes.deletedIdentifiers.length > 0 ||
      changes.keywords.length > 0 ||
      changes.informationAssets.length > 0 ||
      changes.dataServices.length > 0)
  )
}

// The catalogue as this session sees it: the read-only mock data with the
// session's changes on top. Without changes, it's the mock data itself.
export function buildWorkingCatalogue(base, changes) {
  if (!hasDataChanges(changes)) {
    return base
  }
  const deleted = new Set(changes.deletedIdentifiers)
  const baseIdentifiers = new Set(
    base.collections.dataAssets.map((dataAsset) => dataAsset.identifier)
  )
  const dataAssets = [
    ...base.collections.dataAssets.map(
      (dataAsset) => changes.dataAssets[dataAsset.identifier] ?? dataAsset
    ),
    ...Object.values(changes.dataAssets).filter(
      (dataAsset) => !baseIdentifiers.has(dataAsset.identifier)
    )
  ].filter((dataAsset) => !deleted.has(dataAsset.identifier))
  return buildCatalogue(
    structuredClone({
      ...base.collections,
      dataAssets,
      keywords: [...base.collections.keywords, ...changes.keywords],
      informationAssets: [
        ...base.collections.informationAssets,
        ...changes.informationAssets
      ],
      dataServices: [...base.collections.dataServices, ...changes.dataServices]
    })
  )
}

const workingCatalogues = new WeakMap()

export function catalogueFor(req) {
  if (!workingCatalogues.has(req)) {
    workingCatalogues.set(
      req,
      buildWorkingCatalogue(baseCatalogue, sessionChanges(req))
    )
  }
  return workingCatalogues.get(req)
}

// The next 3 functions serve the manage pages, which only a persona saved
// in the session can reach, so the session always exists

// Every identifier issued so far, including deleted ones, which are never
// reused (S05). S05 uses DA1111C as its example of a deleted identifier.
export function issuedIdentifiers(req) {
  return [
    ...baseCatalogue.collections.dataAssets.map(
      (dataAsset) => dataAsset.identifier
    ),
    'DA1111C',
    ...sessionChanges(req).issuedIdentifiers
  ]
}

export function newDataAssetCount(req) {
  return sessionChanges(req).issuedIdentifiers.length
}

function withChange(changes, change) {
  const next = structuredClone(changes)
  const { identifier } = change
  if (change.action === 'delete') {
    next.deletedIdentifiers.push(identifier)
    delete next.dataAssets[identifier]
  } else {
    next.dataAssets[identifier] = change.dataAsset
  }
  if (change.action === 'create') {
    next.issuedIdentifiers.push(identifier)
  }
  next.keywords.push(...(change.keywords ?? []))
  next.informationAssets.push(...(change.informationAssets ?? []))
  next.dataServices.push(...(change.dataServices ?? []))
  return next
}

function problemsIn(workingCatalogue, today) {
  return [
    ...findSchemaErrors(workingCatalogue.collections),
    ...findRuleBreaches(workingCatalogue.collections, { today })
  ]
}

function historyEntries(req, change, before, after) {
  const persona = currentPersona(req)
  const madeBy = `${personFor(after, persona)?.name}, ${persona.roleName}`
  const dateTime = new Date().toISOString()
  const descriptions =
    change.action === 'create'
      ? ['Data asset created']
      : describeChanges(
          after,
          before.dataAssetsByIdentifier.get(change.identifier),
          change.dataAsset
        )
  return descriptions.map((description) => ({
    identifier: change.identifier,
    dateTime,
    madeBy,
    description
  }))
}

// Saves a change to this session's working copy, but only if the whole
// working copy still meets the data contract and the rules in the stories.
// Problems the mock data already had don't count, so that a rule that
// depends on today's date can't stop every change. Anything else fails
// closed: the change isn't saved.
export function commitChange(req, change) {
  const changes = sessionChanges(req)
  const before = catalogueFor(req)
  const candidate = withChange(changes, change)
  if (GROWING_ACTIONS.has(change.action) && isTooBig(candidate)) {
    throw new SessionFullError('The change would make the session too big')
  }
  const after = buildWorkingCatalogue(baseCatalogue, candidate)
  const today = todayInLondon()
  const known = new Set(problemsIn(before, today))
  const problems = problemsIn(after, today).filter(
    (problem) => !known.has(problem)
  )
  if (problems.length > 0) {
    throw new Error(
      `The change would break ${problems.length} of the catalogue's data rules`
    )
  }
  if (change.action !== 'delete') {
    candidate.history = [
      ...candidate.history,
      ...historyEntries(req, change, before, after)
    ].slice(-MOST_HISTORY_ENTRIES)
  }
  req.prototypeSession.save(candidate)
  workingCatalogues.delete(req)
  logEvent({
    level: 'info',
    message: 'Prototype change saved',
    event: {
      category: ['database'],
      type: ['change'],
      action: `data-asset-${change.action}`,
      outcome: 'success'
    },
    labels: {
      dataAssetIdentifier: change.identifier,
      personaRole: currentPersona(req).roleName
    },
    req
  })
}

export function historyFor(req, identifier) {
  return sessionChanges(req).history.filter(
    (entry) => entry.identifier === identifier
  )
}

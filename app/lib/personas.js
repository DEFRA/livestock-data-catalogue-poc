import { personKey } from './catalogue-data.js'
import { isCurrentOn } from './periods.js'

// The prototype has one shared password and no accounts, so researchers
// choose who a participant is on the Prototype settings page. Both named
// personas are made-up people in people.json.
export const PERSONAS = Object.freeze([
  Object.freeze({
    id: 'catalogue-user',
    roleName: 'catalogue user',
    hint: 'Can find and view published data assets only'
  }),
  Object.freeze({
    id: 'data-steward',
    roleName: 'data steward',
    entraObjectId: '7bff5498-dd64-4e3b-949b-e6c6e8b1c023',
    hint: 'Sam Specimen, Animal and Plant Health Agency. Manages the data assets they are assigned to'
  }),
  Object.freeze({
    id: 'catalogue-administrator',
    roleName: 'catalogue administrator',
    entraObjectId: '40044d45-47b9-47bc-9e16-ab6cbf0baf31',
    hint: 'Jamie Placeholder, Defra. Creates data assets and says who is responsible for them'
  })
])

export const DEFAULT_PERSONA_ID = 'catalogue-user'

const ADMINISTRATOR_ID = 'catalogue-administrator'

// Roles that make a data steward one of the people assigned to a data
// asset (LDAT-252, question 24; who counts is question 40)
const MANAGING_ROLE_CODES = new Set(['DATA_OWNER', 'DATA_STEWARD'])

export function personaFor(id) {
  return (
    PERSONAS.find((persona) => persona.id === id) ??
    PERSONAS.find((persona) => persona.id === DEFAULT_PERSONA_ID)
  )
}

export function personFor(catalogue, persona) {
  return persona.entraObjectId === undefined
    ? undefined
    : catalogue.peopleByEntraId.get(persona.entraObjectId)
}

// "Sam Specimen, data steward, Animal and Plant Health Agency"
export function personaDescription(catalogue, persona) {
  const person = personFor(catalogue, persona)
  return person
    ? `${person.name}, ${persona.roleName}, ${person.organisationName}`
    : `A ${persona.roleName}`
}

export function managesDataAssets(persona) {
  return persona.entraObjectId !== undefined
}

// Only a catalogue administrator creates data assets and assigns governance
// roles (LDAT-252, question 24; who creates is question 39)
export function canCreate(persona) {
  return persona.id === ADMINISTRATOR_ID
}

export function canAssignRoles(persona) {
  return persona.id === ADMINISTRATOR_ID
}

function isAssigned(person, dataAsset, today) {
  const key = personKey(person.name, person.emailAddressReference)
  return (dataAsset.governanceAssignments ?? []).some(
    (assignment) =>
      MANAGING_ROLE_CODES.has(assignment.governanceRoleCode) &&
      personKey(
        assignment.personName,
        assignment.personEmailAddressReference
      ) === key &&
      isCurrentOn(assignment, today)
  )
}

// A catalogue administrator manages every data asset. Anyone else manages
// a data asset only while they're its current Data Owner or Data Steward.
export function canManage(catalogue, persona, dataAsset, today) {
  if (persona.id === ADMINISTRATOR_ID) {
    return true
  }
  const person = personFor(catalogue, persona)
  return person !== undefined && isAssigned(person, dataAsset, today)
}

export function managedDataAssets(catalogue, persona, today) {
  return catalogue.collections.dataAssets.filter((dataAsset) =>
    canManage(catalogue, persona, dataAsset, today)
  )
}

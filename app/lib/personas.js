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
    hint: 'Creates data assets, and manages the ones they are a data steward of'
  }),
  Object.freeze({
    id: 'catalogue-administrator',
    roleName: 'catalogue administrator',
    entraObjectId: '40044d45-47b9-47bc-9e16-ab6cbf0baf31',
    hint: 'Manages every data asset and says who is responsible for them'
  })
])

export const DEFAULT_PERSONA_ID = 'catalogue-user'

const STEWARD_ID = 'data-steward'
const ADMINISTRATOR_ID = 'catalogue-administrator'

// Only a current Data Steward manages a data asset. Being its Data Owner,
// or working for one of its data custodians, isn't enough (LDAT-252,
// answer 40).
const MANAGING_ROLE_CODE = 'DATA_STEWARD'

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

// Only a data steward creates a data asset, and becomes its first Data
// Steward (LDAT-252, answer 39)
export function canCreate(persona) {
  return persona.id === STEWARD_ID
}

// Only a catalogue administrator assigns governance roles (LDAT-252,
// answer 24)
export function canAssignRoles(persona) {
  return persona.id === ADMINISTRATOR_ID
}

function isAssigned(person, dataAsset, today) {
  const key = personKey(person.name, person.emailAddressReference)
  return (dataAsset.governanceAssignments ?? []).some(
    (assignment) =>
      assignment.governanceRoleCode === MANAGING_ROLE_CODE &&
      personKey(
        assignment.personName,
        assignment.personEmailAddressReference
      ) === key &&
      isCurrentOn(assignment, today)
  )
}

// Anyone but a catalogue administrator manages a data asset only while
// they're its current Data Steward (LDAT-252, answer 40). A catalogue
// administrator manages every data asset, to say who is responsible for it
// and change its details. That is provisional: whether an administrator
// should change the details too is an open question to the data architect.
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

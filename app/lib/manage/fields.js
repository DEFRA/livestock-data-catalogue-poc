import {
  LONGEST_ADDRESS,
  LONGEST_NAME,
  LONGEST_TEXT,
  anyAddress
} from '../../schemas/catalogue/common.js'
import { referenceValues } from '../reference-data.js'

const NUMBER_FORMAT = new Intl.NumberFormat('en-GB')

function tooLong(errorName, maxLength) {
  return `${errorName} must be ${NUMBER_FORMAT.format(maxLength)} characters or fewer`
}

// A short text answer: titles, names and other short text (200 characters)
export function textField(name, label, options = {}) {
  const maxLength = options.maxLength ?? LONGEST_NAME
  return {
    type: 'text',
    name,
    label,
    maxLength,
    tooLong: tooLong(options.errorName ?? label, maxLength),
    ...options
  }
}

// A long text answer, with the Character count component (2,000 characters)
export function longTextField(name, label, options = {}) {
  return {
    type: 'characterCount',
    name,
    label,
    maxLength: LONGEST_TEXT,
    tooLong: tooLong(options.errorName ?? label, LONGEST_TEXT),
    ...options
  }
}

// Any valid URI, as V0.11 asks, up to 2,048 characters
export function addressField(name, label, { example, ...options } = {}) {
  const errorName = options.errorName ?? label
  return textField(name, label, {
    maxLength: LONGEST_ADDRESS,
    spellcheck: false,
    check: (value) =>
      anyAddress.validate(value).error
        ? `Enter the ${errorName.toLowerCase()} in the correct format, like ${example}`
        : undefined,
    ...options
  })
}

export function radiosField(name, label, options, settings = {}) {
  return { type: 'radios', name, label, options, ...settings }
}

export function checkboxesField(name, label, options, settings = {}) {
  return { type: 'checkboxes', name, label, options, ...settings }
}

export function dateField(name, label, settings = {}) {
  return {
    type: 'date',
    name,
    label,
    hint: 'For example, 27 3 2024',
    ...settings
  }
}

export const OR_DIVIDER = Object.freeze({ divider: 'or' })

// A reference collection or code list as options: its names, never codes
export function referenceOptions(catalogue, listName, { withHints } = {}) {
  return referenceValues(catalogue, listName).map((value) => ({
    value: value.code,
    text: value.name,
    hint: withHints ? value.description : undefined
  }))
}

function byText(first, second) {
  return first.text.localeCompare(second.text, 'en-GB')
}

// People are chosen from the catalogue's list, never typed, so nobody
// types a person's name or email address (LDAT-252, question 38)
export function peopleOptions(catalogue) {
  return catalogue.collections.people
    .map((person) => ({
      value: person.entraObjectId,
      text: person.name,
      hint: person.organisationName
    }))
    .sort(byText)
}

export function organisationOptions(catalogue) {
  return catalogue.collections.organisations
    .map((organisation) => ({
      value: organisation.name,
      text: organisation.name
    }))
    .sort(byText)
}

export const YES_NO_OPTIONS = Object.freeze([
  Object.freeze({ value: 'yes', text: 'Yes' }),
  Object.freeze({ value: 'no', text: 'No' })
])

// Answers as the form shows them: dates split into day, month and year
export function dateParts(isoDate) {
  if (isoDate === undefined) {
    return { day: '', month: '', year: '' }
  }
  const [year, month, day] = isoDate.split('-')
  return { day: String(Number(day)), month: String(Number(month)), year }
}

export function sameTextIgnoringCase(first, second) {
  return (
    first.trim().toLocaleLowerCase('en-GB') ===
    second.trim().toLocaleLowerCase('en-GB')
  )
}

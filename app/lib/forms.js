import { CSRF_FIELD } from './csrf.js'
import { logEvent } from './log.js'

// A form post that no page in the prototype could send: an unexpected
// field, or a list or object where a page sends text
export class TamperedFormError extends Error {
  constructor(message) {
    super(message)
    this.status = 400
  }
}

const DATE_PARTS = ['day', 'month', 'year']

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
]

function dateKeys(name) {
  return DATE_PARTS.map((part) => `${name}-${part}`)
}

function childFields(field) {
  return (field.options ?? [])
    .map((option) => option.conditional)
    .filter(Boolean)
}

function allFields(fields) {
  return fields.flatMap((field) => [field, ...childFields(field)])
}

function formKeys(field) {
  return field.type === 'date' ? dateKeys(field.name) : [field.name]
}

function textFrom(body, key) {
  const value = Object.hasOwn(body, key) ? body[key] : undefined
  if (value !== undefined && typeof value !== 'string') {
    throw new TamperedFormError(`The field ${key} is not text`)
  }
  return value?.trim() ?? ''
}

function listFrom(body, key) {
  const value = Object.hasOwn(body, key) ? body[key] : []
  const values = [value].flat()
  if (values.some((item) => typeof item !== 'string')) {
    throw new TamperedFormError(`The field ${key} is not a list of text`)
  }
  return [...new Set(values)]
}

function rawAnswer(body, field) {
  if (field.type === 'date') {
    return Object.fromEntries(
      DATE_PARTS.map((part) => [part, textFrom(body, `${field.name}-${part}`)])
    )
  }
  return field.type === 'checkboxes'
    ? listFrom(body, field.name)
    : textFrom(body, field.name)
}

// Reads only the fields the page sends. Anything else means the form was
// changed, so the post is refused and nothing is saved.
export function readAnswers(body, fields) {
  const formBody = body ?? {}
  const expected = new Set([CSRF_FIELD, ...allFields(fields).flatMap(formKeys)])
  const unexpected = Object.keys(formBody).filter((key) => !expected.has(key))
  if (unexpected.length > 0) {
    throw new TamperedFormError('The form has fields no page sends')
  }
  return Object.fromEntries(
    allFields(fields).map((field) => [field.name, rawAnswer(formBody, field)])
  )
}

function monthNumber(text) {
  if (/^\d{1,2}$/.test(text)) {
    return Number(text)
  }
  const index = MONTH_NAMES.findIndex(
    (name) => text.length >= 3 && name.startsWith(text.toLowerCase())
  )
  return index + 1
}

function isRealDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function twoDigits(number) {
  return String(number).padStart(2, '0')
}

// The GOV.UK Dates pattern: missing information first, then impossible
// dates. Month names, in full or shortened, are accepted.
export function parseDate(parts, field) {
  const missing = DATE_PARTS.filter((part) => parts[part] === '')
  if (missing.length === DATE_PARTS.length) {
    return field.required
      ? { error: field.required, part: 'day' }
      : { value: undefined }
  }
  if (missing.length > 0) {
    return {
      error: `${field.dateName} must include a ${missing.join(' and ')}`,
      part: missing[0]
    }
  }
  const day = /^\d{1,2}$/.test(parts.day) ? Number(parts.day) : NaN
  const month = monthNumber(parts.month)
  const year = /^\d{4}$/.test(parts.year) ? Number(parts.year) : NaN
  if (!isRealDate(year, month, day)) {
    return { error: `${field.dateName} must be a real date`, part: 'day' }
  }
  return { value: `${year}-${twoDigits(month)}-${twoDigits(day)}` }
}

function optionValues(field) {
  return new Set(
    (field.options ?? [])
      .filter((option) => !option.divider)
      .map((option) => option.value)
  )
}

function logUnexpectedChoice(req, field) {
  logEvent({
    level: 'warn',
    message: `A form sent a choice that isn't one of the options for ${field.name}`,
    event: { category: ['web'], type: ['denied'], outcome: 'failure' },
    req
  })
}

function checkChoice(field, raw, req) {
  const known = optionValues(field)
  const chosen = [raw].flat().filter((value) => value !== '')
  if (chosen.some((value) => !known.has(value))) {
    logUnexpectedChoice(req, field)
    return {
      error: field.required ?? field.invalid ?? 'Select one of the options'
    }
  }
  if (chosen.length === 0) {
    return field.required ? { error: field.required } : { value: undefined }
  }
  return { value: field.type === 'checkboxes' ? chosen : chosen[0] }
}

function checkText(field, raw) {
  if (raw === '') {
    return field.required ? { error: field.required } : { value: undefined }
  }
  if (field.maxLength && raw.length > field.maxLength) {
    return { error: field.tooLong }
  }
  const problem = field.check?.(raw)
  return problem ? { error: problem } : { value: raw }
}

function checkField(field, raw, req) {
  if (field.type === 'date') {
    return parseDate(raw, field)
  }
  if (field.type === 'radios' || field.type === 'checkboxes') {
    return checkChoice(field, raw, req)
  }
  return checkText(field, raw)
}

function errorHref(field, result) {
  return field.type === 'date'
    ? `#${field.name}-${result.part}`
    : `#${field.name}`
}

function fieldsToCheck(fields, raw) {
  return fields.flatMap((field) => {
    const shown = (field.options ?? []).filter(
      (option) => option.conditional && raw[field.name] === option.value
    )
    return [field, ...shown.map((option) => option.conditional)]
  })
}

// Checks every answer on the page, so the error summary lists every
// problem at once. Values come back trimmed, with dates as YYYY-MM-DD.
export function checkAnswers(fields, raw, req) {
  const values = {}
  const errors = []
  for (const field of fieldsToCheck(fields, raw)) {
    const result = checkField(field, raw[field.name], req)
    if (result.error) {
      errors.push({
        name: field.name,
        text: result.error,
        href: errorHref(field, result)
      })
    } else {
      values[field.name] = result.value
    }
  }
  return { values, errors }
}

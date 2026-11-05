import Joi from 'joi'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

// A pattern alone would accept impossible dates such as 2026-02-30
function isRealDate(value) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value.slice(0, 10))
  )
}

function realDate(value, helpers) {
  return isRealDate(value) ? value : helpers.error('any.invalid')
}

export const text = Joi.string()

export const date = Joi.string().pattern(DATE_PATTERN).custom(realDate)

export const dateTime = Joi.string().pattern(DATE_TIME_PATTERN).custom(realDate)

// V0.11 asks only that an address is a valid URI, so any scheme is allowed.
// It must be absolute, with no spaces or control characters. Only https
// addresses become links (app/lib/data-asset-view.js).
export const anyAddress = Joi.string().uri()

export const code = Joi.string().pattern(/^[A-Z0-9]+(?:[_-][A-Z0-9]+)*$/)

// A valid address that uses only characters that can't change a mailto:
// link, such as ? or &, which could add recipients or text to an email
export const emailAddress = Joi.string()
  .email({ tlds: { allow: false } })
  .pattern(/^[A-Za-z0-9._'+-]+@[A-Za-z0-9.-]+$/)

export const wholeNumber = Joi.number().integer()

export const userId = Joi.string().guid({ version: 'uuidv4' })

export const systemAttributes = {
  systemCreatedDateTime: dateTime.required(),
  systemCreatedByUserId: userId.required(),
  systemUpdatedDateTime: dateTime.required(),
  systemUpdatedByUserId: userId.required()
}

export function ignoringCase(first, second) {
  return first.toLowerCase() === second.toLowerCase()
}

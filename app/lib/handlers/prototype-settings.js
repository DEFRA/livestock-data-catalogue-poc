import { checkAnswers, readAnswers } from '../forms.js'
import { PERSONAS, personaDescription, personaFor } from '../personas.js'
import {
  catalogueFor,
  choosePersona,
  ensureSessionChanges,
  resetChanges
} from '../working-copy.js'

// A page for researchers, not part of the service: who the participant is
// in this session, and a way to remove every change (decision D20)

const NOTICES = Object.freeze({
  saved: 'Your settings have been saved',
  reset: 'Your changes have been removed'
})

function personaField(catalogue) {
  return {
    type: 'radios',
    name: 'personaId',
    label: 'Who are you in this session?',
    options: PERSONAS.map((persona) => ({
      value: persona.id,
      text: personaDescription(catalogue, persona),
      hint: persona.hint
    })),
    required: 'Select who you are in this session'
  }
}

function noticeFor(done) {
  return typeof done === 'string' && Object.hasOwn(NOTICES, done)
    ? NOTICES[done]
    : undefined
}

function render(req, res, { values, errors = [] }) {
  const catalogue = catalogueFor(req)
  res.locals.csrfToken = ensureSessionChanges(req).csrfToken
  res.render('prototype-settings', {
    pageName: 'Prototype settings',
    hasErrors: errors.length > 0,
    errorList: errors.map(({ text, href }) => ({ text, href })),
    errorTexts: Object.fromEntries(
      errors.map((error) => [error.name, error.text])
    ),
    field: personaField(catalogue),
    values,
    notice: noticeFor(req.query.done)
  })
}

export function showPrototypeSettings(req, res) {
  const { personaId } = ensureSessionChanges(req)
  render(req, res, { values: { personaId: personaFor(personaId).id } })
}

export function savePrototypeSettings(req, res) {
  const field = personaField(catalogueFor(req))
  const raw = readAnswers(req.body, [field])
  const { values, errors } = checkAnswers([field], raw, req)
  if (errors.length > 0) {
    render(req, res, { values: raw, errors })
    return
  }
  choosePersona(req, values.personaId)
  res.redirect(303, '/prototype-settings?done=saved')
}

export function resetPrototype(req, res) {
  readAnswers(req.body, [])
  resetChanges(req)
  res.redirect(303, '/prototype-settings?done=reset')
}

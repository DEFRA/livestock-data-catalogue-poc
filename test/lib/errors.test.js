import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'

import { TamperedFormError } from '../../app/lib/forms.js'
import { problemWithTheService } from '../../app/lib/handlers/errors.js'

function fakeRequest(query = {}) {
  return { query, get: () => undefined }
}

function fakeResponse({ headersSent = false } = {}) {
  const response = {
    headersSent,
    statusCode: undefined,
    view: undefined,
    status(code) {
      response.statusCode = code
      return response
    },
    render(view) {
      response.view = view
    }
  }
  return response
}

describe('handling an unexpected error', () => {
  beforeEach(() => {
    mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('a refused form shows Page not found, and is logged as a warning without its values', () => {
    const response = fakeResponse()

    problemWithTheService(
      new TamperedFormError('The form has fields no page sends'),
      fakeRequest(),
      response,
      () => {}
    )

    assert.equal(response.statusCode, 404)
    assert.equal(response.view, 'page-not-found')
    const [line] = console.log.mock.calls.map((call) =>
      JSON.parse(call.arguments[0])
    )
    assert.equal(line['log.level'], 'warn')
    assert.equal(
      line.message,
      'Form refused: it had fields the page does not send'
    )
    assert.deepEqual(line.event.type, ['denied'])
  })

  test('shows the generic problem page with status 500', () => {
    const response = fakeResponse()

    problemWithTheService(
      new Error('No domains value has the code WEATHER'),
      fakeRequest(),
      response,
      () => {}
    )

    assert.equal(response.statusCode, 500)
    assert.equal(response.view, 'problem-with-the-service')
  })

  test('logs the error message as ECS JSON on one line, without the request', () => {
    problemWithTheService(
      new Error('first line\r\nforged line'),
      fakeRequest({ q: 'secret' }),
      fakeResponse(),
      () => {}
    )

    const [[line]] = console.log.mock.calls.map((call) => call.arguments)
    const entry = JSON.parse(line)

    assert.equal(entry['log.level'], 'error')
    assert.equal(entry.message, 'Unexpected error')
    assert.deepEqual(entry.error, { message: 'first line forged line' })
    assert.doesNotMatch(line, /secret/)
  })

  test('replaces every control character in the message, so it cannot forge or colour log lines', () => {
    problemWithTheService(
      new Error('first\u001b[31m red\u2028second\tthird'),
      fakeRequest(),
      fakeResponse(),
      () => {}
    )

    const [[line]] = console.log.mock.calls.map((call) => call.arguments)

    assert.equal(JSON.parse(line).error.message, 'first [31m red second third')
  })

  test('shows Page not found for a request error, without logging it', () => {
    const response = fakeResponse()
    const error = Object.assign(new Error('Failed to decode param'), {
      status: 400
    })

    problemWithTheService(error, fakeRequest(), response, () => {})

    assert.equal(response.statusCode, 404)
    assert.equal(response.view, 'page-not-found')
    assert.equal(console.log.mock.callCount(), 0)
  })

  test('passes the error on when the response has already started', () => {
    const error = new Error('Too late')
    const next = mock.fn()

    problemWithTheService(
      error,
      fakeRequest(),
      fakeResponse({ headersSent: true }),
      next
    )

    assert.deepEqual(next.mock.calls[0].arguments, [error])
  })
})

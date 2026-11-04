import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'

import { problemWithTheService } from '../../app/lib/handlers/errors.js'

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
    mock.method(console, 'error', () => {})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('shows the generic problem page with status 500', () => {
    const response = fakeResponse()

    problemWithTheService(
      new Error('No domains value has the code WEATHER'),
      {},
      response,
      () => {}
    )

    assert.equal(response.statusCode, 500)
    assert.equal(response.view, 'problem-with-the-service')
  })

  test('logs the error message on one line, without the request', () => {
    problemWithTheService(
      new Error('first line\r\nforged line'),
      { query: { q: 'secret' } },
      fakeResponse(),
      () => {}
    )

    assert.deepEqual(
      console.error.mock.calls.map((call) => call.arguments),
      [['Unexpected error: first line forged line']]
    )
  })

  test('shows Page not found for a request error, without logging it', () => {
    const response = fakeResponse()
    const error = Object.assign(new Error('Failed to decode param'), {
      status: 400
    })

    problemWithTheService(error, {}, response, () => {})

    assert.equal(response.statusCode, 404)
    assert.equal(response.view, 'page-not-found')
    assert.equal(console.error.mock.callCount(), 0)
  })

  test('passes the error on when the response has already started', () => {
    const error = new Error('Too late')
    const next = mock.fn()

    problemWithTheService(error, {}, fakeResponse({ headersSent: true }), next)

    assert.deepEqual(next.mock.calls[0].arguments, [error])
  })
})

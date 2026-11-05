import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'

import { logEvent } from '../../app/lib/log.js'

function fakeRequest(headers = {}) {
  return {
    query: { q: 'made-up search words' },
    get: (name) => headers[name.toLowerCase()]
  }
}

function loggedLines() {
  return console.log.mock.calls.map((call) => call.arguments)
}

describe('a log line', () => {
  beforeEach(() => {
    mock.method(console, 'log', () => {})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  test('is one line of ECS JSON on stdout, with the time, level and message', () => {
    logEvent({ level: 'warn', message: 'Sign-in failed' })

    const [[line]] = loggedLines()
    const entry = JSON.parse(line)

    assert.doesNotMatch(line, /\n/)
    assert.equal(entry['log.level'], 'warn')
    assert.equal(entry.message, 'Sign-in failed')
    assert.equal(entry['ecs.version'], '8.11.0')
    assert.ok(
      Math.abs(Date.parse(entry['@timestamp']) - Date.now()) < 60 * 1000
    )
  })

  test('adds the ECS fields it is given', () => {
    logEvent({
      level: 'info',
      message: 'Signed in',
      event: { category: ['authentication'], outcome: 'success' }
    })

    const entry = JSON.parse(loggedLines()[0][0])

    assert.deepEqual(entry.event, {
      category: ['authentication'],
      outcome: 'success'
    })
  })

  test("adds CDP's request ID, so the line can be traced, and nothing else from the request", () => {
    logEvent({
      level: 'info',
      message: 'Signed in',
      req: fakeRequest({ 'x-cdp-request-id': 'b5c1d0e2-made-up-id' })
    })

    const entry = JSON.parse(loggedLines()[0][0])

    assert.deepEqual(entry.http, {
      request: { headers: { 'x-cdp-request-id': 'b5c1d0e2-made-up-id' } }
    })
    assert.doesNotMatch(loggedLines()[0][0], /made-up search words/)
  })

  test('leaves out a request ID that is missing or does not look like one', () => {
    for (const requestId of [undefined, '', 'has spaces', 'a'.repeat(101)]) {
      logEvent({
        level: 'info',
        message: 'Signed in',
        req: fakeRequest({ 'x-cdp-request-id': requestId })
      })
    }
    logEvent({ level: 'info', message: 'Signed in' })

    for (const [line] of loggedLines()) {
      assert.equal(JSON.parse(line).http, undefined)
    }
  })

  test('keeps a message with line breaks on one line', () => {
    logEvent({ level: 'error', message: 'first line\nforged line' })

    const [[line]] = loggedLines()

    assert.doesNotMatch(line, /\n/)
    assert.equal(JSON.parse(line).message, 'first line\nforged line')
  })
})

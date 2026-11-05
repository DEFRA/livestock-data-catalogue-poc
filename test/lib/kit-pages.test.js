import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { pageNotFound } from '../../app/lib/handlers/errors.js'
import { pageDefaults } from '../../app/lib/handlers/page-defaults.js'
import { closeKitPages, pageLoaded } from '../../app/lib/kit-pages.js'

function fakeRouter() {
  const router = {
    calls: [],
    get(...args) {
      router.calls.push(['get', ...args])
    },
    use(...args) {
      router.calls.push(['use', ...args])
    }
  }
  return router
}

describe("closing the Kit's management pages", () => {
  test('shows Page not found for them on CDP, where NODE_ENV is production', () => {
    const router = closeKitPages(fakeRouter(), { NODE_ENV: 'production' })

    assert.deepEqual(router.calls, [
      ['get', '/manage-prototype/page-loaded', pageLoaded],
      ['use', '/manage-prototype', pageDefaults, pageNotFound]
    ])
  })

  test("answers the Kit's page-loaded call with no content", () => {
    const response = {
      sendStatus(code) {
        response.status = code
      }
    }

    pageLoaded({}, response)

    assert.equal(response.status, 204)
  })

  test('leaves them to the Kit on a developer machine and in the tests', () => {
    for (const environment of [
      {},
      { NODE_ENV: 'development' },
      { NODE_ENV: 'test' }
    ]) {
      assert.deepEqual(
        closeKitPages(fakeRouter(), environment).calls,
        [],
        JSON.stringify(environment)
      )
    }
  })
})

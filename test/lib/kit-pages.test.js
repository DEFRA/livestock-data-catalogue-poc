import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { pageNotFound } from '../../app/lib/handlers/errors.js'
import { pageDefaults } from '../../app/lib/handlers/page-defaults.js'
import { closeKitPages } from '../../app/lib/kit-pages.js'

function fakeRouter() {
  const router = {
    uses: [],
    use(...args) {
      router.uses.push(args)
    }
  }
  return router
}

describe("closing the Kit's management pages", () => {
  test('shows Page not found for them on CDP, where NODE_ENV is production', () => {
    const router = closeKitPages(fakeRouter(), { NODE_ENV: 'production' })

    assert.deepEqual(router.uses, [
      ['/manage-prototype', pageDefaults, pageNotFound]
    ])
  })

  test('leaves them to the Kit on a developer machine and in the tests', () => {
    for (const environment of [
      {},
      { NODE_ENV: 'development' },
      { NODE_ENV: 'test' }
    ]) {
      assert.deepEqual(
        closeKitPages(fakeRouter(), environment).uses,
        [],
        JSON.stringify(environment)
      )
    }
  })
})

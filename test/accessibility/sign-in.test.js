import assert from 'node:assert/strict'
import { after, before, describe, mock, test } from 'node:test'

import { findAccessibilityViolations } from '../helpers/accessibility.js'
import { startApp } from '../helpers/app.js'

describe('accessibility of signing in and out', () => {
  let app

  before(async () => {
    mock.method(console, 'warn', () => {})
    app = await startApp({
      environment: {
        NODE_ENV: 'production',
        USE_AUTH: undefined,
        USE_HTTPS: 'false',
        PASSWORD: 'made-up-test-password'
      }
    })
  })

  after(async () => {
    await app.stop()
    mock.restoreAll()
  })

  for (const [state, path, form] of [
    ['the sign-in page', '/sign-in'],
    ['a sign-in error', '/sign-in', { password: 'a-wrong-password' }],
    ['the signed-out page', '/signed-out']
  ]) {
    test(`${state} has no WCAG 2.2 AA violations that axe can find`, async () => {
      const page = await app.getPage(path, { form })

      assert.equal(page.status, 200)
      assert.deepEqual(await findAccessibilityViolations(page.html), [])
    })
  }
})

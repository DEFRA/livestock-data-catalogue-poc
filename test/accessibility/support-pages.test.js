import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { findAccessibilityViolations } from '../helpers/accessibility.js'
import { startApp } from '../helpers/app.js'

describe('accessibility of the support and error pages', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  for (const path of [
    '/report-a-problem',
    '/accessibility-statement',
    '/cookies',
    '/privacy',
    '/no-such-page'
  ]) {
    test(`${path} has no WCAG 2.2 AA violations that axe can find`, async () => {
      const page = await app.getPage(path)

      assert.deepEqual(await findAccessibilityViolations(page.html), [])
    })
  }
})

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { findAccessibilityViolations } from '../helpers/accessibility.js'
import { startApp } from '../helpers/app.js'

const PAGE_STATES = [
  ['a data asset with a Welsh keyword', '/data-assets/DA11111'],
  ['a data asset still in development', '/data-assets/DA11118'],
  ['a deprecated data asset', '/data-assets/DA11114'],
  ['a data asset with a hard copy distribution', '/data-assets/DA1111F']
]

describe('accessibility of the data asset page', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  for (const [state, path] of PAGE_STATES) {
    test(`${state} has no WCAG 2.2 AA violations that axe can find`, async () => {
      const page = await app.getPage(path)

      assert.deepEqual(await findAccessibilityViolations(page.html), [])
    })
  }
})

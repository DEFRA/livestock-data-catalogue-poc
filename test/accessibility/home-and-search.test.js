import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { findAccessibilityViolations } from '../helpers/accessibility.js'
import { startApp } from '../helpers/app.js'

const PAGE_STATES = [
  ['the home page', '/'],
  ['search results', '/data-assets?q=movement&type=TRANSACTIONAL_DATA'],
  ['the second page of results', '/data-assets?page=2'],
  ['no results', '/data-assets?q=unicorn'],
  ['a search error', `/data-assets?q=${'a'.repeat(101)}`]
]

describe('accessibility of the home and search pages', () => {
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

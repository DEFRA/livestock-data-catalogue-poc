import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startApp } from './helpers/app.js'

describe('the prototype app', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('serves the home page', async () => {
    const page = await app.getPage('/')

    assert.equal(page.status, 200)
    assert.ok(page.document.querySelector('h1'))
  })

  test('tells search engines not to index any page', async () => {
    const page = await app.getPage('/')

    assert.equal(page.headers.get('x-robots-tag'), 'noindex')
  })
})

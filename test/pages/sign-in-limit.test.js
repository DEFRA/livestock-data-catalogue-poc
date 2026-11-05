import assert from 'node:assert/strict'
import { after, before, describe, mock, test } from 'node:test'

import { startApp } from '../helpers/app.js'

// A test file of its own, because the wrong passwords it sends would
// refuse the other sign-in tests for a minute
const PASSWORD = 'made-up-test-password'

describe('too many wrong passwords on CDP', () => {
  let app

  before(async () => {
    mock.method(console, 'log', () => {})
    app = await startApp({
      environment: {
        NODE_ENV: 'production',
        USE_AUTH: undefined,
        USE_HTTPS: 'false',
        PASSWORD
      }
    })
  })

  after(async () => {
    await app.stop()
    mock.restoreAll()
  })

  test('after 10 wrong passwords in a minute, even the right one is refused with status 429 and an error', async () => {
    for (let count = 0; count < 10; count++) {
      const page = await app.getPage('/sign-in', {
        form: { password: 'a-wrong-password' }
      })
      assert.equal(page.status, 200)
    }

    const page = await app.getPage('/sign-in', { form: { password: PASSWORD } })

    assert.equal(page.status, 429)
    assert.equal(page.headers.get('set-cookie'), null)
    assert.equal(
      page.document.title,
      'Error: Sign in – Livestock Data Catalogue'
    )
    assert.equal(
      page.document
        .querySelector('.govuk-error-summary__list a')
        .textContent.trim(),
      'You have entered the wrong password too many times. Wait 1 minute, then try again.'
    )
  })
})

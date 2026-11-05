import assert from 'node:assert/strict'
import { after, before, describe, mock, test } from 'node:test'

import { startApp } from '../helpers/app.js'

describe('the prototype on CDP with no password set', () => {
  let app

  before(async () => {
    mock.method(console, 'log', () => {})
    app = await startApp({
      environment: {
        NODE_ENV: 'production',
        USE_AUTH: undefined,
        USE_HTTPS: 'false',
        PASSWORD: undefined,
        PASSWORD_KEYS: undefined
      }
    })
  })

  after(async () => {
    await app.stop()
    mock.restoreAll()
  })

  test('lets nobody in, showing the problem page', async () => {
    for (const path of ['/', '/sign-in', '/cookies']) {
      const page = await app.getPage(path)

      assert.equal(page.status, 500, path)
      assert.equal(
        page.document.title,
        'Sorry, there is a problem with the service – Livestock Data Catalogue',
        path
      )
    }
  })

  test("still answers CDP's health check, because the container is alive", async () => {
    const page = await app.getPage('/health')

    assert.equal(page.status, 200)
    assert.deepEqual(JSON.parse(page.html), { message: 'success' })
  })
})

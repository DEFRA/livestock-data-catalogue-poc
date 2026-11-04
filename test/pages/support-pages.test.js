import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'

describe('the support and error pages', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  for (const [path, heading] of [
    ['/report-a-problem', 'Report a problem'],
    [
      '/accessibility-statement',
      'Accessibility statement for the Livestock Data Catalogue prototype'
    ],
    ['/cookies', 'Cookies'],
    ['/privacy', 'Privacy']
  ]) {
    test(`${path} shows its page`, async () => {
      const page = await app.getPage(path)

      assert.equal(page.status, 200)
      assert.equal(
        page.document.querySelector('h1').textContent.trim(),
        heading
      )
    })
  }

  test('the cookies page lists the authentication cookie with its purpose and expiry', async () => {
    const page = await app.getPage('/cookies')
    const cells = [
      ...page.document.querySelectorAll(
        'tbody tr:first-child th, tbody tr:first-child td'
      )
    ].map((cell) => cell.textContent.trim())

    assert.deepEqual(cells, [
      'authentication',
      "Remembers that you have entered the prototype's password",
      '30 days'
    ])
  })

  test('shows Page not found, with status 404, for an address that does not exist', async () => {
    const page = await app.getPage('/no-such-page')

    assert.equal(page.status, 404)
    assert.equal(
      page.document.querySelector('h1').textContent.trim(),
      'Page not found'
    )
    assert.match(
      page.document.querySelector('main').textContent,
      /If you typed the web address, check it is correct\./
    )
  })

  test('shows Page not found for an address with broken encoding', async () => {
    const page = await app.getPage('/data-assets/%E0%A4%A')

    assert.equal(page.status, 404)
    assert.equal(
      page.document.querySelector('h1').textContent.trim(),
      'Page not found'
    )
  })

  test('shows Page not found for a request that is not a GET', async () => {
    const response = await fetch(new URL('/cookies', app.baseUrl), {
      method: 'POST'
    })

    assert.equal(response.status, 404)
  })

  test('does not show what was typed in the address on Page not found', async () => {
    const page = await app.getPage('/%3Cscript%3Ealert(1)%3C/script%3E')

    assert.equal(page.status, 404)
    assert.doesNotMatch(page.html, /<script>alert\(1\)<\/script>/)
  })
})

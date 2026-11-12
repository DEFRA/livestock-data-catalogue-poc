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

  test('the cookies page lists the sign-in cookie with its purpose and expiry', async () => {
    const page = await app.getPage('/cookies')
    const cells = [
      ...page.document.querySelectorAll(
        'tbody tr:first-child th, tbody tr:first-child td'
      )
    ].map((cell) => cell.textContent.trim())

    assert.deepEqual(cells, [
      'prototype-sign-in',
      'Remembers that you have signed in to the prototype',
      '8 hours'
    ])
  })

  test("the cookies page lists the session cookie that keeps a participant's changes", async () => {
    const page = await app.getPage('/cookies')
    const cells = [
      ...page.document.querySelectorAll(
        'tbody tr:nth-child(2) th, tbody tr:nth-child(2) td'
      )
    ].map((cell) => cell.textContent.trim())

    assert.deepEqual(cells, [
      'prototype-session',
      'Remembers who you are in a research session, and the changes you make to data assets',
      '4 hours after your last change'
    ])
  })

  test('the cookies table uses smaller text on small screens, so it fits 320 pixels', async () => {
    const page = await app.getPage('/cookies')

    assert.ok(
      page.document
        .querySelector('table')
        .classList.contains('govuk-table--small-text-until-tablet')
    )
  })

  test('the privacy page says search words are in the web address, which platform logs may keep', async () => {
    const page = await app.getPage('/privacy')
    const text = page.document
      .querySelector('main')
      .textContent.replace(/\s+/g, ' ')

    assert.match(text, /Your search words are part of the web address/)
    assert.match(text, /may keep logs of the web addresses/)
    assert.doesNotMatch(text, /does not collect personal data/)
  })

  test('the privacy page says where changes to data assets are kept and when they are deleted', async () => {
    const page = await app.getPage('/privacy')
    const text = page.document
      .querySelector('main')
      .textContent.replace(/\s+/g, ' ')

    assert.match(
      text,
      /your changes are kept in the prototype's memory, not saved to its data, and only your browser can see them\. They are deleted 4 hours after your last change, when you reset the prototype in Prototype settings, or when the prototype restarts\./
    )
  })

  test("the privacy page says how wrong passwords are limited, and links to Defra's personal information charter", async () => {
    const page = await app.getPage('/privacy')
    const text = page.document
      .querySelector('main')
      .textContent.replace(/\s+/g, ' ')
    const charter = [...page.document.querySelectorAll('main a')].find(
      (link) =>
        link.textContent.trim() === "Defra's personal information charter"
    )

    assert.match(
      text,
      /remembers the network address it came from for 1 minute/
    )
    assert.equal(
      charter?.getAttribute('href'),
      'https://www.gov.uk/government/organisations/department-for-environment-food-rural-affairs/about/personal-information-charter'
    )
    assert.match(text, /Information Commissioner's Office/)
  })

  test('the accessibility statement gives its compliance status and when it was last reviewed', async () => {
    const page = await app.getPage('/accessibility-statement')
    const text = page.document
      .querySelector('main')
      .textContent.replace(/\s+/g, ' ')

    assert.match(
      text,
      /This prototype is partially compliant with the Web Content Accessibility Guidelines version 2\.2 AA standard, because we have not yet finished testing it\. We do not know of any part of it that fails the standard\. We check every page with automated tests\. We have not yet finished checking it by hand or with assistive technologies/
    )
    assert.match(
      text,
      /This statement was prepared on 4 November 2026\. It was last reviewed on 12 November 2026\./
    )
  })

  test('the accessibility statement says how long changes are kept, as there is no way to ask for more time', async () => {
    const page = await app.getPage('/accessibility-statement')

    assert.match(
      page.document.querySelector('main').textContent,
      /Changes you make to data assets are kept for 4 hours after your last change\. This is a research prototype, so there is no way to ask for more time\./
    )
  })

  test('the accessibility statement has no known issues now that Welsh keywords are marked as Welsh', async () => {
    const page = await app.getPage('/accessibility-statement')
    const knownIssues = [...page.document.querySelectorAll('h2')].find(
      (heading) => heading.textContent.trim() === 'Known issues'
    ).nextElementSibling

    assert.equal(
      knownIssues.textContent.trim(),
      'We do not know of any problems at the moment. We will list any we find here.'
    )
  })

  test('the page for unexpected errors says what to do, with no details of the error', async () => {
    const page = await app.renderPage('problem-with-the-service')

    assert.equal(
      page.document.title,
      'Sorry, there is a problem with the service – Livestock Data Catalogue'
    )
    assert.equal(
      page.document.querySelector('h1').textContent.trim(),
      'Sorry, there is a problem with the service'
    )
    assert.deepEqual(
      [...page.document.querySelectorAll('main p')].map((paragraph) =>
        paragraph.textContent.trim().replace(/\s+/g, ' ')
      ),
      ['Try again later.', 'If the problem continues, report a problem.']
    )
    assert.equal(
      page.document.querySelector('main a').getAttribute('href'),
      '/report-a-problem'
    )
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

  // Without the catch-all Page not found, the Kit renders any template whose
  // path matches the address
  for (const path of [
    '/layouts/main',
    '/partials/links',
    '/page-not-found',
    '/problem-with-the-service'
  ]) {
    test(`shows Page not found for ${path}, so the Kit does not render templates by address`, async () => {
      const page = await app.getPage(path)

      assert.equal(page.status, 404)
      assert.equal(
        page.document.querySelector('h1').textContent.trim(),
        'Page not found'
      )
    })
  }

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

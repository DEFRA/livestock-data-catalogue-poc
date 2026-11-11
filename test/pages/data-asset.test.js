import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'

function summaryRows(container) {
  return Object.fromEntries(
    [...container.querySelectorAll('.govuk-summary-list__row')].map(
      (summaryRow) => [
        summaryRow.querySelector('.govuk-summary-list__key').textContent.trim(),
        summaryRow
          .querySelector('.govuk-summary-list__value')
          .textContent.replace(/\s+/g, ' ')
          .trim()
      ]
    )
  )
}

describe('the data asset page', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  describe('a published data asset with distributions', () => {
    let page

    before(async () => {
      page = await app.getPage('/data-assets/DA11111')
    })

    test('shows the title as the heading and in the page title', () => {
      assert.equal(page.status, 200)
      assert.equal(
        page.document.title,
        'Animal Movement – Livestock Data Catalogue'
      )
      assert.equal(
        page.document.querySelector('h1').textContent.trim(),
        'Animal Movement'
      )
      assert.equal(
        page.document.querySelector('.govuk-caption-l').textContent.trim(),
        'Data asset'
      )
    })

    test('has breadcrumbs back to the home page and the search page', () => {
      const links = [
        ...page.document.querySelectorAll('.govuk-breadcrumbs a')
      ].map((link) => [link.textContent.trim(), link.getAttribute('href')])

      assert.deepEqual(links, [
        ['Home', '/'],
        ['Data assets', '/data-assets']
      ])
    })

    test('marks Data assets as the active section in the service navigation', () => {
      const active = page.document.querySelector(
        '.govuk-service-navigation__item--active'
      )

      assert.equal(active.textContent.trim(), 'Data assets')
      assert.equal(
        page.document.querySelector(
          '.govuk-service-navigation [aria-current="page"]'
        ),
        null
      )
    })

    test('shows the description and the metadata, with names and not codes', () => {
      const rows = summaryRows(page.document.querySelector('main'))

      assert.match(
        page.document.querySelector('.govuk-body-l').textContent,
        /^Movements of cattle/
      )
      assert.equal(rows['Data asset type'], 'Transactional Data')
      assert.equal(rows.Domain, 'Animal')
      assert.equal(rows['Update frequency'], 'Real time')
      assert.equal(rows['Valid to'], 'No end date')
      assert.equal(rows['Lifecycle state'], 'Active')
      assert.doesNotMatch(
        page.document.querySelector('main').textContent,
        /TRANSACTIONAL_DATA|REAL_TIME|OAUTH2/
      )
    })

    test('shows the people responsible, with email links', () => {
      const rows = summaryRows(page.document.querySelector('main'))
      const ownerEmail = page.document.querySelector(
        'a[href="mailto:jo.bloggs@example.com"]'
      )

      assert.equal(
        rows['Data owner'],
        'Jo Bloggs, Animal and Plant Health Agency jo.bloggs@example.com'
      )
      assert.equal(ownerEmail.textContent.trim(), 'jo.bloggs@example.com')
      assert.equal(
        rows['Data custodians'],
        'Digital, Data and Technology Services Livestock Information Ltd'
      )
    })

    test('lists every current Data Custodian', () => {
      const custodians = [
        ...page.document.querySelectorAll('.govuk-summary-list__row')
      ].find(
        (summaryRow) =>
          summaryRow
            .querySelector('.govuk-summary-list__key')
            .textContent.trim() === 'Data custodians'
      )

      assert.deepEqual(
        [...custodians.querySelectorAll('.govuk-list li')].map((item) =>
          item.textContent.trim()
        ),
        ['Digital, Data and Technology Services', 'Livestock Information Ltd']
      )
    })

    test('shows the security classification and where it comes from', () => {
      const rows = summaryRows(page.document.querySelector('main'))

      assert.equal(
        rows['Security classification'],
        'OFFICIAL From the information asset Livestock Traceability Records'
      )
    })

    test('shows a summary card for each distribution', () => {
      const cards = [...page.document.querySelectorAll('.govuk-summary-card')]

      assert.deepEqual(
        cards.map((card) =>
          card.querySelector('.govuk-summary-card__title').textContent.trim()
        ),
        ['Movements API', 'Movement events']
      )
      assert.equal(summaryRows(cards[0]).Authentication, 'OAuth 2.0')
      assert.equal(summaryRows(cards[1]).Topic, 'animal.movement.v1')
      assert.equal(
        cards[0]
          .querySelector('a[href="https://api.example.org/movements"]')
          .textContent.trim(),
        'https://api.example.org/movements'
      )
    })

    test('groups related data assets and resources by relationship type', () => {
      assert.deepEqual(
        [...page.document.querySelectorAll('main h3.govuk-heading-s')].map(
          (heading) => heading.textContent.trim()
        ),
        ['Derived from', 'Related to']
      )
      assert.ok(
        page.document.querySelector('main a[href="/data-assets/DA11113"]')
      )
    })
  })

  test('marks a Welsh keyword as Welsh, and leaves English keywords unmarked', async () => {
    const page = await app.getPage('/data-assets/DA11111')
    const keywords = [
      ...page.document.querySelectorAll('main .govuk-summary-list__row')
    ]
      .find((row) => row.querySelector('dt').textContent.trim() === 'Keywords')
      .querySelectorAll('li')

    assert.deepEqual(
      [...keywords].map((keyword) => [
        keyword.textContent.trim(),
        keyword.getAttribute('lang')
      ]),
      [
        ['Cattle', null],
        ['gwartheg', 'cy'],
        ['Holding', null],
        ['Movement', null]
      ]
    )
  })

  test('shows the distribution of a data asset still in development', async () => {
    const page = await app.getPage('/data-assets/DA11118')
    const main = page.document.querySelector('main')

    assert.equal(main.querySelectorAll('.govuk-summary-card').length, 1)
    assert.doesNotMatch(main.textContent, /There are no distributions/)
  })

  test('shows a deprecated data asset with a warning that links to its replacement', async () => {
    const page = await app.getPage('/data-assets/DA11114')
    const warning = page.document.querySelector('.govuk-warning-text')

    assert.equal(
      page.document.querySelector('main .govuk-tag').textContent.trim(),
      'Deprecated'
    )
    assert.match(
      warning.textContent.replace(/\s+/g, ' '),
      /This data asset is being replaced\. Use Livestock Keeper instead\./
    )
    assert.equal(
      warning.querySelector('a').getAttribute('href'),
      '/data-assets/DA1111A'
    )
  })

  test('leaves out a related data asset that is not visible', async () => {
    const page = await app.getPage('/data-assets/DA11113')

    assert.equal(
      page.document.querySelector('main a[href="/data-assets/DA11112"]'),
      null
    )
    assert.doesNotMatch(
      page.document.querySelector('main').textContent,
      /Animal Identity/
    )
  })

  for (const [description, identifier] of [
    ['a draft', 'DA11112'],
    ['a retired', 'DA11116'],
    ['an unknown', 'DA99999'],
    ['a lower-case', 'da11111'],
    ['a malformed', 'DA1111I'],
    ['an over-long', 'DA111111']
  ]) {
    test(`shows Page not found, with status 404, for ${description} identifier`, async () => {
      const page = await app.getPage(`/data-assets/${identifier}`)

      assert.equal(page.status, 404)
      assert.equal(
        page.document.querySelector('h1').textContent.trim(),
        'Page not found'
      )
    })
  }
})

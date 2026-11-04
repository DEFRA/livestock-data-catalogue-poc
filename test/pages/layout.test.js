import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'

const PAGES = [
  ['/', 'Livestock Data Catalogue'],
  [
    '/data-assets',
    'Search data assets (page 1 of 2) – Livestock Data Catalogue'
  ],
  ['/data-assets/DA11111', 'Animal Movement – Livestock Data Catalogue'],
  ['/report-a-problem', 'Report a problem – Livestock Data Catalogue'],
  [
    '/accessibility-statement',
    'Accessibility statement for the Livestock Data Catalogue prototype – Livestock Data Catalogue'
  ],
  ['/cookies', 'Cookies – Livestock Data Catalogue'],
  ['/privacy', 'Privacy – Livestock Data Catalogue'],
  ['/no-such-page', 'Page not found – Livestock Data Catalogue']
]

describe('the layout of every page', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  for (const [path, title] of PAGES) {
    describe(path, () => {
      let page

      before(async () => {
        page = await app.getPage(path)
      })

      test(`has the title "${title}"`, () => {
        assert.equal(page.document.title, title)
      })

      test('has the Generic header and no GOV.UK header, crown or logotype', () => {
        assert.equal(
          page.document
            .querySelector('.govuk-generic-header__homepage-link')
            .textContent.trim(),
          'Defra'
        )
        assert.equal(page.document.querySelector('.govuk-header'), null)
        assert.doesNotMatch(page.document.title, /GOV\.UK/)
        assert.doesNotMatch(
          page.document.querySelector('header').innerHTML,
          /GOV\.UK|govuk-logo|crown/i
        )
        assert.doesNotMatch(
          page.document.querySelector('footer').innerHTML,
          /GOV\.UK|crown|Open Government Licence/i
        )
      })

      test('has the service name in the service navigation', () => {
        const serviceName = page.document.querySelector(
          '.govuk-service-navigation__service-name a'
        )

        assert.equal(serviceName.textContent.trim(), 'Livestock Data Catalogue')
        assert.equal(serviceName.getAttribute('href'), '/')
      })

      test('has an Alpha phase banner that says the data is made up', () => {
        const banner = page.document.querySelector('header .govuk-phase-banner')

        assert.equal(
          banner.querySelector('.govuk-tag').textContent.trim(),
          'Alpha'
        )
        assert.match(
          banner.textContent,
          /This is a prototype with made-up data\./
        )
        assert.equal(
          banner.querySelector('a').getAttribute('href'),
          '/report-a-problem'
        )
      })

      test('has a footer that links to report a problem, accessibility, cookies and privacy', () => {
        const links = [
          ...page.document.querySelectorAll('footer .app-footer a')
        ].map((link) => [link.textContent.trim(), link.getAttribute('href')])

        assert.deepEqual(links, [
          ['Report a problem', '/report-a-problem'],
          ['Accessibility statement', '/accessibility-statement'],
          ['Cookies', '/cookies'],
          ['Privacy', '/privacy']
        ])
        assert.equal(page.document.querySelector('.govuk-footer'), null)
      })

      test('uses the Defra brand colour as the theme colour and has no GOV.UK icons', () => {
        assert.equal(
          page.document
            .querySelector('meta[name="theme-color"]')
            .getAttribute('content'),
          '#008531'
        )
        assert.deepEqual(
          [...page.document.querySelectorAll('link[rel~="icon"]')].map((icon) =>
            icon.getAttribute('href')
          ),
          ['/plugin-assets/govuk-prototype-kit/lib/assets/images/unbranded.ico']
        )
        assert.equal(
          page.document.querySelector(
            'link[rel="apple-touch-icon"], link[rel="manifest"]'
          ),
          null
        )
      })

      test('does not say which web framework it runs on', () => {
        assert.equal(page.headers.get('x-powered-by'), null)
      })

      test('has exactly one main heading', () => {
        assert.equal(page.document.querySelectorAll('h1').length, 1)
      })
    })
  }
})

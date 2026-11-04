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

      test('has the Defra header: the Defra logo and the service name, with no GOV.UK header, crown or logotype', () => {
        const header = page.document.querySelector('.govuk-generic-header')
        const homepageLink = header.querySelector(
          '.govuk-generic-header__homepage-link'
        )
        const logo = homepageLink.querySelector('img')

        assert.ok(header.classList.contains('app-generic-header--defra'))
        assert.equal(homepageLink.getAttribute('href'), '/')
        assert.equal(logo.getAttribute('src'), '/public/images/defra-logo.svg')
        assert.equal(logo.getAttribute('alt'), '')
        assert.equal(
          homepageLink.textContent.replace(/\s+/g, ' ').trim(),
          'Livestock Data Catalogue (Department for Environment, Food and Rural Affairs)'
        )
        assert.equal(
          homepageLink
            .querySelector('.app-generic-header__service-name')
            .textContent.trim(),
          'Livestock Data Catalogue'
        )
        assert.equal(page.document.querySelector('.govuk-header'), null)
        assert.doesNotMatch(page.document.title, /GOV\.UK/)
        assert.doesNotMatch(
          page.document.querySelector('header').innerHTML,
          /GOV\.UK|govuk-logo|crown/i
        )
        // Case matters: the licence links to nationalarchives.gov.uk
        assert.doesNotMatch(
          page.document.querySelector('footer').textContent,
          /GOV\.UK/
        )
        assert.doesNotMatch(
          page.document.querySelector('footer').innerHTML,
          /crown|govuk-footer|govuk-logo/i
        )
      })

      test('has only the navigation in the service navigation, because the header has the service name', () => {
        const navigation = page.document.querySelector(
          '.govuk-service-navigation'
        )

        assert.equal(
          navigation.querySelector('.govuk-service-navigation__service-name'),
          null
        )
        assert.deepEqual(
          [
            ...navigation.querySelectorAll('.govuk-service-navigation__link')
          ].map((link) => [link.textContent.trim(), link.getAttribute('href')]),
          [['Data assets', '/data-assets']]
        )
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

      test('has the Defra footer: support links and the Open Government Licence', () => {
        const footer = page.document.querySelector('footer .app-footer')
        const links = [...footer.querySelectorAll('a')].map((link) => [
          link.textContent.trim(),
          link.getAttribute('href')
        ])

        assert.deepEqual(links, [
          ['Report a problem', '/report-a-problem'],
          ['Accessibility statement', '/accessibility-statement'],
          ['Cookies', '/cookies'],
          ['Privacy', '/privacy'],
          [
            'Open Government Licence v3.0',
            'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'
          ]
        ])
        assert.equal(
          footer.querySelector('a[rel="license"]').textContent.trim(),
          'Open Government Licence v3.0'
        )
        assert.match(
          footer.textContent.replace(/\s+/g, ' '),
          /All content is available under the Open Government Licence v3\.0, except where otherwise stated/
        )
        assert.equal(page.document.querySelector('.govuk-footer'), null)
      })

      test('uses the Defra brand colour as the theme colour, the Defra favicon and no GOV.UK icons', () => {
        assert.equal(
          page.document
            .querySelector('meta[name="theme-color"]')
            .getAttribute('content'),
          '#008531'
        )
        assert.deepEqual(
          [...page.document.querySelectorAll('link[rel~="icon"]')].map(
            (icon) => [icon.getAttribute('href'), icon.getAttribute('type')]
          ),
          [
            ['/public/images/favicon.svg', 'image/svg+xml'],
            ['/public/images/favicon.ico', 'image/x-icon']
          ]
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

  for (const [path, contentType] of [
    ['/public/images/defra-logo.svg', 'image/svg+xml'],
    ['/public/images/favicon.svg', 'image/svg+xml'],
    ['/public/images/favicon.ico', 'image/vnd.microsoft.icon']
  ]) {
    test(`serves the Defra brand file ${path}`, async () => {
      const response = await fetch(new URL(path, app.baseUrl))
      await response.arrayBuffer()

      assert.equal(response.status, 200)
      assert.ok(
        response.headers.get('content-type').startsWith(contentType),
        response.headers.get('content-type')
      )
    })
  }

  test('stops files the Kit serves itself saying which web framework it runs on, once it has served a page', async () => {
    await app.getPage('/')
    const response = await fetch(
      new URL(
        '/plugin-assets/govuk-frontend/dist/govuk/govuk-frontend.min.js',
        app.baseUrl
      )
    )
    await response.arrayBuffer()

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-powered-by'), null)
  })
})

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, describe, mock, test } from 'node:test'

import { startApp } from '../helpers/app.js'

// The prototype as it runs on CDP, with made-up passwords
const PASSWORD = 'made-up-test-password'
const RESEARCH_PASSWORD = 'made-up-research-password'
const SIGNED_IN = `authentication=${createHash('sha256').update(PASSWORD).digest('hex')}`

function texts(document, selector) {
  return [...document.querySelectorAll(selector)].map((element) =>
    element.textContent.trim().replace(/\s+/g, ' ')
  )
}

describe('signing in to the prototype on CDP', () => {
  let app

  before(async () => {
    mock.method(console, 'warn', () => {})
    app = await startApp({
      environment: {
        NODE_ENV: 'production',
        USE_AUTH: undefined,
        USE_HTTPS: 'false',
        PASSWORD,
        PASSWORD_KEYS: 'PASSWORD_01',
        PASSWORD_01: RESEARCH_PASSWORD
      }
    })
  })

  after(async () => {
    await app.stop()
    mock.restoreAll()
  })

  describe('before signing in', () => {
    for (const [path, location] of [
      ['/', '/sign-in'],
      [
        '/data-assets?q=cattle',
        '/sign-in?returnUrl=%2Fdata-assets%3Fq%3Dcattle'
      ],
      ['/data-assets/DA11111', '/sign-in?returnUrl=%2Fdata-assets%2FDA11111'],
      ['/no-such-page', '/sign-in']
    ]) {
      test(`${path} sends you to the sign-in page`, async () => {
        const page = await app.getPage(path)

        assert.equal(page.status, 302)
        assert.equal(page.headers.get('location'), location)
      })
    }

    for (const path of [
      '/accessibility-statement',
      '/cookies',
      '/privacy',
      '/report-a-problem',
      '/signed-out'
    ]) {
      test(`${path} opens without signing in`, async () => {
        const page = await app.getPage(path)

        assert.equal(page.status, 200)
      })
    }

    test('the Defra logo loads without signing in, so the sign-in page is branded', async () => {
      const response = await fetch(
        new URL('/public/images/defra-logo.svg', app.baseUrl)
      )
      await response.arrayBuffer()

      assert.equal(response.status, 200)
    })

    test('the Kit does not send you to its own password page', async () => {
      const page = await app.getPage('/data-assets')

      assert.doesNotMatch(page.headers.get('location'), /manage-prototype/)
    })
  })

  describe('the sign-in page', () => {
    let page

    before(async () => {
      page = await app.getPage('/sign-in?returnUrl=%2Fdata-assets')
    })

    test('has the Defra layout and a title with no GOV.UK branding', () => {
      assert.equal(page.status, 200)
      assert.equal(page.document.title, 'Sign in – Livestock Data Catalogue')
      assert.ok(page.document.querySelector('.app-generic-header--defra'))
      assert.doesNotMatch(page.html, /GOV\.UK Prototype Kit|govuk-header/)
    })

    test('says what the prototype is, and who should sign in', () => {
      assert.equal(
        page.document.querySelector('h1').textContent.trim(),
        'Sign in'
      )
      assert.deepEqual(texts(page.document, 'main p'), [
        'This is a prototype of the Livestock Data Catalogue, used for research. It is not a real service, and its data is made up.',
        'Only sign in if you have been invited to test the prototype. Use the password the research team gave you.'
      ])
    })

    test('asks for the password with the GOV.UK Password input, and remembers the page to return to', () => {
      const form = page.document.querySelector('main form')
      const input = form.querySelector('#password')

      assert.equal(form.getAttribute('method'), 'post')
      assert.equal(form.getAttribute('action'), '/sign-in')
      assert.ok(form.hasAttribute('novalidate'))
      assert.equal(input.getAttribute('type'), 'password')
      assert.equal(input.getAttribute('autocomplete'), 'current-password')
      assert.equal(input.getAttribute('spellcheck'), 'false')
      assert.equal(input.getAttribute('autocapitalize'), 'none')
      assert.ok(input.classList.contains('govuk-password-input__input'))
      assert.equal(
        form.querySelector('label[for="password"]').textContent.trim(),
        'Password'
      )
      assert.equal(
        form.querySelector('input[name="returnUrl"]').getAttribute('value'),
        '/data-assets'
      )
      assert.equal(
        form
          .querySelector('button.govuk-button[type="submit"]')
          .textContent.trim(),
        'Sign in'
      )
    })

    test('has no service navigation, because its pages need signing in', () => {
      assert.equal(
        page.document.querySelector('.govuk-service-navigation'),
        null
      )
    })
  })

  describe('with an empty or wrong password', () => {
    for (const [password, message] of [
      ['', 'Enter the password'],
      ['a-wrong-password', 'The password is not correct']
    ]) {
      test(`shows "${message}", clears the field and signs nobody in`, async () => {
        const page = await app.getPage('/sign-in', {
          form: { password, returnUrl: '/data-assets' }
        })

        assert.equal(page.status, 200)
        assert.equal(page.headers.get('set-cookie'), null)
        assert.equal(
          page.document.title,
          'Error: Sign in – Livestock Data Catalogue'
        )
        assert.deepEqual(texts(page.document, '.govuk-error-summary__list a'), [
          message
        ])
        assert.equal(
          page.document
            .querySelector('.govuk-error-summary__list a')
            .getAttribute('href'),
          '#password'
        )
        assert.deepEqual(texts(page.document, '.govuk-error-message'), [
          `Error: ${message}`
        ])
        assert.equal(
          page.document.querySelector('#password').getAttribute('value'),
          null
        )
        assert.equal(
          page.document
            .querySelector('input[name="returnUrl"]')
            .getAttribute('value'),
          '/data-assets'
        )
      })
    }
  })

  describe('with the right password', () => {
    let response

    before(async () => {
      response = await app.getPage('/sign-in', {
        form: { password: PASSWORD, returnUrl: '/data-assets?q=cattle' }
      })
    })

    test('returns to the page you wanted', () => {
      assert.equal(response.status, 303)
      assert.equal(response.headers.get('location'), '/data-assets?q=cattle')
    })

    test('sets a cookie that is HttpOnly, Secure and SameSite=Lax, for 30 days, and does not hold the password', () => {
      const [cookie] = response.headers.getSetCookie()

      assert.equal(cookie.split(';')[0], SIGNED_IN)
      assert.match(cookie, /; Max-Age=2592000;/)
      assert.match(cookie, /; HttpOnly/)
      assert.match(cookie, /; Secure/)
      assert.match(cookie, /; SameSite=Lax/)
      assert.ok(!cookie.includes(PASSWORD))
    })

    test('also works with a research password', async () => {
      const page = await app.getPage('/sign-in', {
        form: { password: RESEARCH_PASSWORD }
      })

      assert.equal(page.status, 303)
      assert.equal(page.headers.get('location'), '/')
    })

    test('never sends you outside the prototype', async () => {
      const page = await app.getPage('/sign-in', {
        form: { password: PASSWORD, returnUrl: '//example.com/' }
      })

      assert.equal(page.headers.get('location'), '/')
    })
  })

  describe('after signing in', () => {
    test('every page opens, with Sign out in the service navigation', async () => {
      for (const path of ['/', '/data-assets', '/data-assets/DA11111']) {
        const page = await app.getPage(path, { cookie: SIGNED_IN })

        assert.equal(page.status, 200, path)
        assert.deepEqual(
          [
            ...page.document.querySelectorAll('.govuk-service-navigation__link')
          ].map((link) => [link.textContent.trim(), link.getAttribute('href')]),
          [
            ['Data assets', '/data-assets'],
            ['Sign out', '/sign-out']
          ],
          path
        )
      }
    })

    test('the sign-in page goes straight to the page you wanted', async () => {
      const page = await app.getPage('/sign-in?returnUrl=%2Fdata-assets', {
        cookie: SIGNED_IN
      })

      assert.equal(page.status, 302)
      assert.equal(page.headers.get('location'), '/data-assets')
    })

    test('the sign-in page never sends you to another site', async () => {
      const page = await app.getPage(
        `/sign-in?${new URLSearchParams({ returnUrl: '/.//example.com/' })}`,
        { cookie: SIGNED_IN }
      )

      assert.equal(page.status, 302)
      assert.equal(page.headers.get('location'), '/')
    })

    test('signing out removes the cookie and shows that you have signed out', async () => {
      const response = await app.getPage('/sign-out', { cookie: SIGNED_IN })
      const [cookie] = response.headers.getSetCookie()

      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), '/signed-out')
      assert.match(cookie, /^authentication=;/)
      assert.match(cookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/)
    })
  })

  describe('the signed-out page', () => {
    test('says you have signed out, with a link to sign in again', async () => {
      const page = await app.getPage('/signed-out')

      assert.equal(
        page.document.title,
        'You have signed out – Livestock Data Catalogue'
      )
      assert.equal(
        page.document.querySelector('h1').textContent.trim(),
        'You have signed out'
      )
      assert.equal(
        page.document.querySelector('main a').getAttribute('href'),
        '/sign-in'
      )
      assert.equal(
        page.document.querySelector('.govuk-service-navigation'),
        null
      )
    })
  })
})

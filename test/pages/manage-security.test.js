import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'
import { NEW_DATA_ASSET, textsOf } from '../helpers/manage.js'
import { visitor } from '../helpers/session.js'

const MOVEMENT = '/manage/data-assets/DA11111'

async function titleOf(participant) {
  const about = await participant.get(`${MOVEMENT}/about`)
  return textsOf(about, '.govuk-summary-list__row')[0]
}

describe('who can reach the manage pages (criterion 2)', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('a catalogue user sees Page not found on every manage page', async () => {
    const user = visitor(app)
    await user.get('/prototype-settings')
    for (const path of [
      '/manage/data-assets',
      '/manage/data-assets/create',
      MOVEMENT,
      `${MOVEMENT}/about`,
      `${MOVEMENT}/about/title`,
      `${MOVEMENT}/publish`,
      `${MOVEMENT}/history`,
      `${MOVEMENT}/preview`,
      `${MOVEMENT}/distributions/0/name`
    ]) {
      assert.equal((await user.get(path)).status, 404, path)
    }
    assert.equal(
      (await user.post(`${MOVEMENT}/about/title`, { titleName: 'x' })).status,
      404
    )
    assert.equal(
      (await user.post('/manage/data-assets/create', NEW_DATA_ASSET)).status,
      404
    )
  })

  for (const path of [
    '/manage/data-assets/da11111',
    '/manage/data-assets/DA1111I',
    '/manage/data-assets/DA99999',
    '/manage/data-assets/DA1111C',
    `${MOVEMENT}/not-a-section`,
    `${MOVEMENT}/constructor`,
    `${MOVEMENT}/distributions/2/name`,
    `${MOVEMENT}/distributions/-1/name`,
    `${MOVEMENT}/distributions/1e0/name`,
    `${MOVEMENT}/distributions/1000/name`,
    `${MOVEMENT}/related-resources/9/remove`,
    `${MOVEMENT}/responsibility/assignments/99/end`
  ]) {
    test(`shows Page not found for ${path}`, async () => {
      const administrator = visitor(app)
      await administrator.becomes('catalogue-administrator')

      assert.equal((await administrator.get(path)).status, 404)
    })
  }
})

describe('forms are protected against cross-site requests and tampering (criterion 26)', () => {
  let app
  let administrator

  before(async () => {
    app = await startApp()
    administrator = visitor(app)
    await administrator.becomes('catalogue-administrator')
  })

  after(async () => {
    await app.stop()
  })

  test("every form carries this browser's token", async () => {
    for (const path of [
      '/prototype-settings',
      '/manage/data-assets/create',
      `${MOVEMENT}/about/title`,
      `${MOVEMENT}/deprecate`
    ]) {
      const page = await administrator.get(path)
      const tokens = [
        ...page.document.querySelectorAll('main form input[name="csrfToken"]')
      ].map((input) => input.value)

      assert.ok(tokens.length > 0, path)
      assert.ok(
        tokens.every((token) => token === administrator.csrfToken),
        path
      )
    }
  })

  for (const [scenario, form] of [
    ['no token', { titleName: 'Changed' }],
    ['a wrong token', { titleName: 'Changed', csrfToken: 'x'.repeat(43) }],
    ['a token of another length', { titleName: 'Changed', csrfToken: 'short' }],
    ['a list of tokens', { titleName: 'Changed', csrfToken: ['a', 'b'] }]
  ]) {
    test(`refuses a post with ${scenario}, and saves nothing`, async () => {
      const page = await app.getPage(`${MOVEMENT}/about/title`, {
        form,
        cookie: `prototype-session=${administrator.cookies.get('prototype-session')}`
      })

      assert.equal(page.status, 403)
      assert.equal(
        textsOf(page, 'h1')[0],
        'Sorry, there is a problem with the service'
      )
      assert.equal(
        await titleOf(administrator),
        'Title Animal Movement Change title'
      )
    })
  }

  test("refuses another browser's token", async () => {
    const other = visitor(app)
    await other.becomes('catalogue-administrator')
    const page = await administrator.post(`${MOVEMENT}/about/title`, {
      titleName: 'Changed',
      csrfToken: other.csrfToken
    })

    assert.equal(page.status, 403)
  })

  for (const site of ['cross-site', 'same-site']) {
    test(`refuses a post the browser says came from a ${site} page`, async () => {
      const page = await administrator.post(
        `${MOVEMENT}/about/title`,
        { titleName: 'Changed' },
        { headers: { 'sec-fetch-site': site } }
      )

      assert.equal(page.status, 403)
      assert.equal(
        await titleOf(administrator),
        'Title Animal Movement Change title'
      )
    })
  }

  test('accepts a post the browser says came from the prototype itself', async () => {
    const page = await administrator.post(
      '/manage/data-assets/DA11112/about/version',
      { versionNumber: '0.2' },
      { headers: { 'sec-fetch-site': 'same-origin' } }
    )

    assert.equal(page.status, 303)
  })

  test('refuses the settings and reset forms without a token', async () => {
    const cookie = `prototype-session=${administrator.cookies.get('prototype-session')}`

    for (const path of ['/prototype-settings', '/prototype-settings/reset']) {
      const page = await app.getPage(path, {
        form: { personaId: 'catalogue-user' },
        cookie
      })
      assert.equal(page.status, 403, path)
    }
  })

  for (const [scenario, extra] of [
    ['a field the page does not send', { publicationStateCode: 'PUBLISHED' }],
    ['constructor', { 'constructor[prototype][polluted]': 'yes' }],
    ['a nested object', { 'titleName[evil]': 'yes' }]
  ]) {
    test(`refuses a post with ${scenario}, and saves nothing`, async () => {
      const participant = visitor(app)
      await participant.becomes('catalogue-administrator')
      const page = await participant.post(`${MOVEMENT}/about/title`, {
        titleName: 'Changed',
        ...extra
      })

      assert.equal(page.status, 404)
      assert.equal(
        await titleOf(participant),
        'Title Animal Movement Change title'
      )
      assert.equal({}.polluted, undefined)
    })
  }

  test('a __proto__ field, which the form parser drops, changes nothing but the answers the page asks for', async () => {
    const participant = visitor(app)
    await participant.becomes('catalogue-administrator')
    const page = await participant.post(
      '/manage/data-assets/DA11112/about/version',
      {
        versionNumber: '0.3',
        '__proto__[publicationStateCode]': 'PUBLISHED',
        '__proto__[polluted]': 'yes'
      }
    )
    const overview = await participant.get('/manage/data-assets/DA11112')

    assert.equal(page.status, 303)
    assert.ok(textsOf(overview, 'main p').includes('Catalogue entry: Draft'))
    assert.equal({}.polluted, undefined)
    assert.equal({}.publicationStateCode, undefined)
  })

  test('refuses a list where the page sends text', async () => {
    const page = await administrator.post(`${MOVEMENT}/about/title`, [
      ['titleName', 'One'],
      ['titleName', 'Two']
    ])

    assert.equal(page.status, 404)
  })
})

describe('changes stay in one browser (criterion 27)', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('a change in one browser never shows in another', async () => {
    const first = visitor(app)
    const second = visitor(app)
    await first.becomes('catalogue-administrator')
    await second.becomes('catalogue-administrator')
    await first.post(`${MOVEMENT}/about/title`, { titleName: 'First browser' })

    assert.equal(await titleOf(first), 'Title First browser Change title')
    assert.equal(await titleOf(second), 'Title Animal Movement Change title')
    const catalogue = await visitor(app).get('/data-assets/DA11111')
    assert.equal(catalogue.status, 200)
    assert.equal(textsOf(catalogue, 'h1')[0], 'Animal Movement')
  })

  test('sets an httpOnly, SameSite Lax session cookie that lasts 4 hours', async () => {
    const page = await visitor(app).get('/prototype-settings')
    const cookie = page.headers.getSetCookie()[0]

    assert.match(cookie, /^prototype-session=[\w-]{43};/)
    assert.match(cookie, /Max-Age=14400/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Lax/)
  })

  test('a session cookie the prototype did not issue starts a new session', async () => {
    const page = await app.getPage('/prototype-settings', {
      cookie: `prototype-session=${'a'.repeat(43)}`
    })

    assert.notEqual(
      page.headers.getSetCookie()[0].split(';')[0],
      `prototype-session=${'a'.repeat(43)}`
    )
  })
})

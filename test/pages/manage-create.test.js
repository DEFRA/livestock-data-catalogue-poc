import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'
import { NEW_DATA_ASSET, createDraft, textsOf } from '../helpers/manage.js'
import { visitor } from '../helpers/session.js'

describe('your data assets', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('a data steward sees every data asset they are assigned to, in any state, drafts first', async () => {
    const steward = visitor(app)
    await steward.becomes('data-steward')
    const page = await steward.get('/manage/data-assets')
    const rows = [...page.document.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())
    )

    assert.equal(page.status, 200)
    assert.equal(
      textsOf(page, '.govuk-caption-l')[0],
      'Sam Specimen, data steward, Animal and Plant Health Agency'
    )
    assert.deepEqual(
      rows.map(([title, identifier, state]) => [title, identifier, state]),
      [
        ['Animal Identity', 'DA11112', 'Draft'],
        ['Animal Movement', 'DA11111', 'Published'],
        ['Bovine TB Test Results', 'DA11117', 'Published'],
        ['Movement Restrictions', 'DA11118', 'Published']
      ]
    )
    assert.equal(
      page.document.querySelector('tbody a').getAttribute('href'),
      '/manage/data-assets/DA11112'
    )
    assert.equal(page.html.includes('Create a data asset'), false)
  })

  test('a catalogue administrator sees every data asset, and can create one', async () => {
    const administrator = visitor(app)
    await administrator.becomes('catalogue-administrator')
    const page = await administrator.get('/manage/data-assets')

    assert.equal(page.document.querySelectorAll('tbody tr').length, 14)
    assert.equal(
      page.document
        .querySelector('a.govuk-button[href="/manage/data-assets/create"]')
        .textContent.trim(),
      'Create a data asset'
    )
  })

  test('a catalogue user sees Page not found', async () => {
    const page = await visitor(app).get('/manage/data-assets')

    assert.equal(page.status, 404)
  })
})

describe('creating a data asset (S05)', () => {
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

  test('asks for the title, description and owning organisation on one page', async () => {
    const page = await administrator.get('/manage/data-assets/create')

    assert.equal(page.status, 200)
    assert.equal(textsOf(page, 'h1')[0], 'What is the data asset?')
    assert.ok(page.document.querySelector('input[name="titleName"]'))
    assert.ok(page.document.querySelector('textarea[name="description"]'))
    assert.equal(
      page.document.querySelectorAll('input[name="organisationName"]').length,
      8
    )
  })

  test('saves a draft with the next identifier, a 12 month review frequency, and shows its overview', async () => {
    const address = await createDraft(administrator)
    const overview = await administrator.get(`${address}?created=yes`)

    assert.equal(address, '/manage/data-assets/DA1111G')
    assert.deepEqual(textsOf(overview, '.govuk-notification-banner__content'), [
      'Data asset created. Its identifier is DA1111G'
    ])
    assert.equal(textsOf(overview, 'h1')[0], NEW_DATA_ASSET.titleName)
    assert.ok(textsOf(overview, 'main p').includes('Catalogue entry: Draft'))
    const review = await administrator.get(`${address}/review`)
    assert.ok(
      textsOf(review, '.govuk-summary-list__row').some((row) =>
        row.startsWith('Review frequency Every 12 months')
      )
    )
  })

  test('gives the next one DA1111H, and never reuses a deleted identifier', async () => {
    const second = await createDraft(administrator, {
      ...NEW_DATA_ASSET,
      titleName: 'Second made-up asset'
    })
    await administrator.post(`${second}/delete`, { confirm: 'yes' })
    const third = await createDraft(administrator, {
      ...NEW_DATA_ASSET,
      titleName: 'Third made-up asset'
    })

    assert.equal(second, '/manage/data-assets/DA1111H')
    assert.equal(third, '/manage/data-assets/DA1111J')
  })

  test('shows every missing answer at once', async () => {
    const page = await administrator.post('/manage/data-assets/create', {})

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'Enter a title',
      'Enter a description',
      'Select the organisation that owns the data asset'
    ])
  })

  test('refuses a title already in use, ignoring case and spaces at the ends', async () => {
    const page = await administrator.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: '  animal MOVEMENT '
    })

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'A data asset with this title already exists'
    ])
    assert.equal(
      page.document.querySelector('input[name="titleName"]').value,
      '  animal MOVEMENT '.trim()
    )
  })

  test('allows a title of 200 characters, and refuses 201', async () => {
    const tooLong = await administrator.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: 'x'.repeat(201)
    })
    const longest = await administrator.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: 'y'.repeat(200)
    })

    assert.deepEqual(textsOf(tooLong, '.govuk-error-summary__list a'), [
      'Title must be 200 characters or fewer'
    ])
    assert.equal(longest.status, 303)
  })

  test('refuses an organisation that is not an option, and saves nothing', async () => {
    const before = await administrator.get('/manage/data-assets')
    const page = await administrator.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: 'Unknown organisation asset',
      organisationName: 'Made-up Agency'
    })
    const after = await administrator.get('/manage/data-assets')

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'Select the organisation that owns the data asset'
    ])
    assert.equal(
      after.document.querySelectorAll('tbody tr').length,
      before.document.querySelectorAll('tbody tr').length
    )
  })

  test('a data steward cannot create a data asset (question 39)', async () => {
    const steward = visitor(app)
    await steward.becomes('data-steward')

    assert.equal((await steward.get('/manage/data-assets/create')).status, 404)
    assert.equal(
      (await steward.post('/manage/data-assets/create', NEW_DATA_ASSET)).status,
      404
    )
  })
})

describe('the limit on new data assets in a session (D33)', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('allows 20 new data assets, then says how to start again', async () => {
    const administrator = visitor(app)
    await administrator.becomes('catalogue-administrator')
    for (let count = 1; count <= 20; count += 1) {
      await createDraft(administrator, {
        ...NEW_DATA_ASSET,
        titleName: `Made-up asset ${count}`
      })
    }
    const page = await administrator.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: 'Made-up asset 21'
    })

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'You can create up to 20 data assets in a prototype session. Reset the prototype in Prototype settings to start again'
    ])
  })
})

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { today } from '../../app/lib/clock.js'
import { formatDate } from '../../app/lib/formatting.js'
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
    assert.equal(
      page.document
        .querySelector('a.govuk-button[href="/manage/data-assets/create"]')
        .textContent.trim(),
      'Create a data asset'
    )
  })

  test('a catalogue administrator sees every data asset, but cannot create one (answer 39)', async () => {
    const administrator = visitor(app)
    await administrator.becomes('catalogue-administrator')
    const page = await administrator.get('/manage/data-assets')

    assert.equal(page.document.querySelectorAll('tbody tr').length, 14)
    assert.equal(page.html.includes('Create a data asset'), false)
  })

  test('a catalogue user sees Page not found', async () => {
    const page = await visitor(app).get('/manage/data-assets')

    assert.equal(page.status, 404)
  })
})

describe('creating a data asset (S05)', () => {
  let app
  let steward

  before(async () => {
    app = await startApp()
    steward = visitor(app)
    await steward.becomes('data-steward')
  })

  after(async () => {
    await app.stop()
  })

  test('asks for the title, description and owning organisation on one page', async () => {
    const page = await steward.get('/manage/data-assets/create')

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
    const address = await createDraft(steward)
    const overview = await steward.get(`${address}?created=yes`)

    assert.equal(address, '/manage/data-assets/DA1111G')
    assert.deepEqual(textsOf(overview, '.govuk-notification-banner__content'), [
      'Data asset created. Its identifier is DA1111G'
    ])
    assert.equal(textsOf(overview, 'h1')[0], NEW_DATA_ASSET.titleName)
    assert.ok(textsOf(overview, 'main p').includes('Catalogue entry: Draft'))
    const review = await steward.get(`${address}/review`)
    assert.ok(
      textsOf(review, '.govuk-summary-list__row').some((row) =>
        row.startsWith('Review frequency Every 12 months')
      )
    )
  })

  test('gives the next one DA1111H, and never reuses a deleted identifier', async () => {
    const second = await createDraft(steward, {
      ...NEW_DATA_ASSET,
      titleName: 'Second made-up asset'
    })
    await steward.post(`${second}/delete`, { confirm: 'yes' })
    const third = await createDraft(steward, {
      ...NEW_DATA_ASSET,
      titleName: 'Third made-up asset'
    })

    assert.equal(second, '/manage/data-assets/DA1111H')
    assert.equal(third, '/manage/data-assets/DA1111J')
  })

  test('shows every missing answer at once', async () => {
    const page = await steward.post('/manage/data-assets/create', {})

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'Enter a title',
      'Enter a description',
      'Select the organisation that owns the data asset'
    ])
  })

  test('refuses a title already in use, ignoring case and spaces at the ends', async () => {
    const page = await steward.post('/manage/data-assets/create', {
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
    const tooLong = await steward.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: 'x'.repeat(201)
    })
    const longest = await steward.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: 'y'.repeat(200)
    })

    assert.deepEqual(textsOf(tooLong, '.govuk-error-summary__list a'), [
      'Title must be 200 characters or fewer'
    ])
    assert.equal(longest.status, 303)
  })

  test('refuses an organisation that is not an option, and saves nothing', async () => {
    const before = await steward.get('/manage/data-assets')
    const page = await steward.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: 'Unknown organisation asset',
      organisationName: 'Made-up Agency'
    })
    const after = await steward.get('/manage/data-assets')

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'Select the organisation that owns the data asset'
    ])
    assert.equal(
      after.document.querySelectorAll('tbody tr').length,
      before.document.querySelectorAll('tbody tr').length
    )
  })

  test('makes the data steward who creates it its first data steward, from today with no end date, and records it (answer 39)', async () => {
    const createdOn = formatDate(today())
    const address = await createDraft(steward, {
      ...NEW_DATA_ASSET,
      titleName: 'Steward made-up asset'
    })
    const responsibility = await steward.get(`${address}/responsibility`)
    const history = await steward.get(`${address}/history`)
    const list = await steward.get('/manage/data-assets')

    assert.match(
      textsOf(responsibility, '.govuk-summary-card')[1],
      new RegExp(`^Data stewards Sam Specimen .* From ${createdOn}$`)
    )
    assert.equal(
      textsOf(responsibility, '.govuk-details').length,
      0,
      'no assignment has ended or not started yet'
    )
    assert.deepEqual(textsOf(history, 'tbody tr td:nth-child(2)'), [
      'Data asset created',
      `Data steward Sam Specimen added, from ${createdOn}`
    ])
    assert.deepEqual(
      [...new Set(textsOf(history, 'tbody tr td:nth-child(3)'))],
      ['Sam Specimen, data steward']
    )
    assert.ok(textsOf(list, 'tbody a').includes('Steward made-up asset'))
  })

  test('tells the data steward to ask a catalogue administrator for the data owner it needs to publish (answers 24 and 39)', async () => {
    const address = await createDraft(steward, {
      ...NEW_DATA_ASSET,
      titleName: 'Owner needed made-up asset'
    })
    const overview = await steward.get(address)
    const publish = await steward.get(`${address}/publish`)
    const actions = textsOf(publish, 'main li a')

    assert.deepEqual(textsOf(overview, '.govuk-inset-text'), [
      'You need a data owner before you can publish this data asset. Ask a catalogue administrator to add one.'
    ])
    assert.ok(
      actions.includes('ask a catalogue administrator to add a data owner')
    )
    assert.equal(
      actions.some((action) => action.includes('data steward')),
      false
    )
    assert.equal(
      (await steward.get(`${address}/responsibility/data-owner/add`)).status,
      404
    )
  })

  test('a catalogue administrator cannot create a data asset (answer 39)', async () => {
    const administrator = visitor(app)
    await administrator.becomes('catalogue-administrator')
    const before = await administrator.get('/manage/data-assets')

    assert.equal(
      (await administrator.get('/manage/data-assets/create')).status,
      404
    )
    assert.equal(
      (await administrator.post('/manage/data-assets/create', NEW_DATA_ASSET))
        .status,
      404
    )
    const after = await administrator.get('/manage/data-assets')
    assert.equal(
      after.document.querySelectorAll('tbody tr').length,
      before.document.querySelectorAll('tbody tr').length
    )
  })

  test('a catalogue administrator is not told to ask anyone for a data owner', async () => {
    const participant = visitor(app)
    await participant.becomes('data-steward')
    const address = await createDraft(participant, {
      ...NEW_DATA_ASSET,
      titleName: 'Administrator made-up asset'
    })
    await participant.becomes('catalogue-administrator')
    const overview = await participant.get(address)

    assert.deepEqual(textsOf(overview, '.govuk-inset-text'), [])
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
    const steward = visitor(app)
    await steward.becomes('data-steward')
    for (let count = 1; count <= 20; count += 1) {
      await createDraft(steward, {
        ...NEW_DATA_ASSET,
        titleName: `Made-up asset ${count}`
      })
    }
    const page = await steward.post('/manage/data-assets/create', {
      ...NEW_DATA_ASSET,
      titleName: 'Made-up asset 21'
    })

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'You can create up to 20 data assets in a prototype session. Reset the prototype in Prototype settings to start again'
    ])
  })
})

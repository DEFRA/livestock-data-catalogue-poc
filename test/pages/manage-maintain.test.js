import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'
import {
  ALEX_EXAMPLE,
  JO_BLOGGS,
  answer,
  dateAnswer,
  textsOf
} from '../helpers/manage.js'
import { visitor } from '../helpers/session.js'

const MOVEMENT = '/manage/data-assets/DA11111'

function stateOf(page) {
  return textsOf(page, 'main p')
    .find((text) => text.startsWith('Catalogue entry: '))
    .replace('Catalogue entry: ', '')
}

function rowsOf(page) {
  return textsOf(page, '.govuk-summary-list__row')
}

describe('maintaining a data asset (journey 3)', () => {
  let app
  let administrator

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  beforeEach(async () => {
    administrator = visitor(app)
    await administrator.becomes('catalogue-administrator')
  })

  test('a published data asset warns that saving a change takes it out of the catalogue', async () => {
    const overview = await administrator.get(MOVEMENT)
    const section = await administrator.get(`${MOVEMENT}/about`)
    const warning =
      'Saving a change will take this data asset out of the catalogue until you publish it again.'

    assert.equal(stateOf(overview), 'Published')
    assert.match(
      textsOf(overview, '.govuk-warning-text')[0],
      new RegExp(warning)
    )
    assert.match(
      textsOf(section, '.govuk-warning-text')[0],
      new RegExp(warning)
    )
  })

  test('changing a published data asset sends it back to Draft, and catalogue users cannot see it until it is published again (D24)', async () => {
    await answer(administrator, `${MOVEMENT}/about/description`, {
      description: 'A changed made-up description.'
    })

    assert.equal(stateOf(await administrator.get(MOVEMENT)), 'Draft')
    assert.equal((await administrator.get('/data-assets/DA11111')).status, 404)
    await answer(administrator, `${MOVEMENT}/publish`, {})
    const page = await administrator.get('/data-assets/DA11111')
    assert.equal(page.status, 200)
    assert.ok(page.html.includes('A changed made-up description.'))
  })

  test('saving the same keywords again changes nothing, so it stays published (D40)', async () => {
    const page = await administrator.get(`${MOVEMENT}/classification/keywords`)
    await answer(administrator, `${MOVEMENT}/classification/keywords`, {
      keywords: page.document.querySelector('textarea[name="keywords"]').value
    })

    assert.equal(stateOf(await administrator.get(MOVEMENT)), 'Published')
  })

  test('a question page for a published data asset warns that saving takes it out of the catalogue (D24)', async () => {
    const published = await administrator.get(`${MOVEMENT}/about/title`)
    const draft = await administrator.get(
      '/manage/data-assets/DA11112/about/title'
    )
    const deprecate = await administrator.get(`${MOVEMENT}/deprecate`)

    assert.match(
      textsOf(published, '.govuk-warning-text')[0],
      /Saving a change will take this data asset out of the catalogue until you publish it again\./
    )
    assert.deepEqual(textsOf(draft, '.govuk-warning-text'), [])
    assert.match(
      textsOf(deprecate, '.govuk-warning-text')[0],
      /Catalogue users will still see this data asset/
    )
  })

  test('the Deprecated tag is the same colour on the manage pages as in the catalogue', async () => {
    const overview = await administrator.get('/manage/data-assets/DA11114')
    const catalogue = await administrator.get('/data-assets/DA11114')
    const classesOf = (page) =>
      [...page.document.querySelectorAll('main .govuk-tag')]
        .find((tag) => tag.textContent.trim() === 'Deprecated')
        .className.trim()

    assert.equal(classesOf(overview), classesOf(catalogue))
  })

  test("a deprecated data asset's responsibility page asks nobody to change it", async () => {
    const page = await administrator.get(
      '/manage/data-assets/DA11114/responsibility'
    )

    assert.deepEqual(textsOf(page, '.govuk-inset-text'), [])
  })

  test('saving the same answer again changes nothing, so it stays published', async () => {
    await answer(administrator, `${MOVEMENT}/about/title`, {
      titleName: 'Animal Movement'
    })
    const history = await administrator.get(`${MOVEMENT}/history`)

    assert.equal(stateOf(await administrator.get(MOVEMENT)), 'Published')
    assert.equal(history.document.querySelectorAll('tbody tr').length, 0)
  })

  test('renaming keeps the identifier and the distributions, and the owning organisation cannot be changed (S05, Q37)', async () => {
    await answer(administrator, `${MOVEMENT}/about/title`, {
      titleName: 'Animal Movements'
    })
    const about = await administrator.get(`${MOVEMENT}/about`)
    const distributions = await administrator.get(`${MOVEMENT}/distributions`)

    assert.ok(rowsOf(about).includes('Identifier DA11111'))
    assert.ok(
      rowsOf(about).includes(
        'Owning organisation Animal and Plant Health Agency'
      )
    )
    assert.deepEqual(textsOf(distributions, '.govuk-summary-card__title'), [
      'Movements API',
      'Movement events'
    ])
    assert.equal(
      (await administrator.get(`${MOVEMENT}/about/organisation`)).status,
      404
    )
  })

  test('renaming to the title of another data asset is refused, ignoring case', async () => {
    const page = await administrator.post(`${MOVEMENT}/about/title`, {
      titleName: 'LIVESTOCK holding'
    })

    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'A data asset with this title already exists'
    ])
  })

  test('changing the lifecycle state does not change the publication state (S10)', async () => {
    await answer(
      administrator,
      '/manage/data-assets/DA11112/status/lifecycle',
      {
        lifecycleStateCode: 'DEPRECATED'
      }
    )
    const overview = await administrator.get('/manage/data-assets/DA11112')

    assert.equal(stateOf(overview), 'Draft')
    assert.ok(textsOf(overview, 'main p').includes('Data: Deprecated'))
  })

  test('recording a review saves who reviewed it, when, the next review and who approved it (S06)', async () => {
    await answer(administrator, `${MOVEMENT}/review/record`, {
      ...dateAnswer('lastReviewedDate', '2026-11-01'),
      lastReviewedByName: JO_BLOGGS,
      ...dateAnswer('nextReviewDate', '2027-11-01'),
      approvedByName: ALEX_EXAMPLE
    })
    const review = await administrator.get(`${MOVEMENT}/review`)

    assert.deepEqual(rowsOf(review).slice(1), [
      'Last reviewed 1 November 2026',
      'Reviewed by Jo Bloggs',
      'Next review due 1 November 2027',
      'Approved by Alex Example'
    ])
  })

  test('the next review cannot be before the last review', async () => {
    const page = await administrator.post(`${MOVEMENT}/review/record`, {
      ...dateAnswer('lastReviewedDate', '2026-11-01'),
      lastReviewedByName: JO_BLOGGS,
      ...dateAnswer('nextReviewDate', '2026-10-31'),
      approvedByName: 'nobody'
    })

    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'The next review date must be the same as or after the date it was reviewed'
    ])
  })

  test('ending an assignment moves it to the previous and future assignments (S17)', async () => {
    const responsibility = await administrator.get(`${MOVEMENT}/responsibility`)
    const endLink = [
      ...responsibility.document.querySelectorAll('main a')
    ].find((link) => link.getAttribute('href').endsWith('/assignments/1/end'))
    await answer(administrator, endLink.getAttribute('href'), {
      ...dateAnswer('effectiveToDate', '2026-01-31')
    })
    const page = await administrator.get(`${MOVEMENT}/responsibility`)

    assert.match(
      textsOf(page, '.govuk-summary-card')[1],
      /Data steward None added$/
    )
    assert.deepEqual(textsOf(page, '.govuk-details tbody tr'), [
      'Sam Specimen Data steward 1 April 2024 to 31 January 2026',
      'Alex Example Data steward From 4 January 2027'
    ])
  })

  test('changing the data owner ends the current assignment and adds the new one', async () => {
    await answer(
      administrator,
      `${MOVEMENT}/responsibility/change-data-owner`,
      {
        ...dateAnswer('ownerEndDate', '2026-11-30'),
        person: ALEX_EXAMPLE,
        ...dateAnswer('effectiveFromDate', '2026-12-01')
      }
    )
    const history = await administrator.get(`${MOVEMENT}/history`)

    assert.deepEqual(
      textsOf(history, 'tbody tr td:nth-child(2)').filter((text) =>
        text.startsWith('Data owner')
      ),
      [
        'Data owner Alex Example added, from 1 December 2026',
        'Data owner Jo Bloggs now from 1 April 2024 to 30 November 2026'
      ]
    )
  })

  test('the new data owner must start after the current one stops', async () => {
    const page = await administrator.post(
      `${MOVEMENT}/responsibility/change-data-owner`,
      {
        ...dateAnswer('ownerEndDate', '2026-11-30'),
        person: ALEX_EXAMPLE,
        ...dateAnswer('effectiveFromDate', '2026-11-30')
      }
    )

    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'The date the new data owner starts must be after the date Jo Bloggs stops'
    ])
  })

  test('removing a distribution asks to confirm, deletes it and records it in the history (D26)', async () => {
    const question = await administrator.get(
      `${MOVEMENT}/distributions/1/remove`
    )
    await answer(administrator, `${MOVEMENT}/distributions/1/remove`, {
      confirm: 'yes'
    })
    const distributions = await administrator.get(`${MOVEMENT}/distributions`)
    const history = await administrator.get(`${MOVEMENT}/history`)

    assert.equal(
      textsOf(question, 'h1')[0],
      'Are you sure you want to remove Movement events?'
    )
    assert.deepEqual(textsOf(distributions, '.govuk-summary-card__title'), [
      'Movements API'
    ])
    assert.ok(
      textsOf(history, 'tbody tr td:nth-child(2)').includes(
        'Distribution Movement events removed'
      )
    )
  })

  test('the change history shows when, who, and the old and new values of material changes only (D27)', async () => {
    await answer(administrator, `${MOVEMENT}/about/version`, {
      versionNumber: '9.9'
    })
    await answer(administrator, `${MOVEMENT}/status/update-frequency`, {
      updateFrequencyCode: 'WEEKLY'
    })
    const history = await administrator.get(`${MOVEMENT}/history`)
    const rows = [...history.document.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td, th')].map((cell) => cell.textContent.trim())
    )

    assert.deepEqual(
      rows.map(([, change, madeBy]) => [change, madeBy]),
      [
        [
          'Update frequency changed from Real time to Weekly',
          'Jamie Placeholder, catalogue administrator'
        ],
        [
          'Publication state changed from Published to Draft',
          'Jamie Placeholder, catalogue administrator'
        ]
      ]
    )
    assert.match(
      rows[0][0],
      /^\d{1,2} \w+ \d{4}, (\d{1,2}:\d{2}[ap]m|midday|midnight)$/
    )
  })

  test('deprecating keeps it in the catalogue with the Deprecated tag, linking to its replacement (S11, S16)', async () => {
    const question = await administrator.get(`${MOVEMENT}/deprecate`)
    const deprecated = await answer(administrator, `${MOVEMENT}/deprecate`, {
      replacement: 'DA11113'
    })
    const overview = await administrator.follow(deprecated)
    const page = await administrator.get('/data-assets/DA11111')

    assert.equal(textsOf(question, 'h1')[0], 'Deprecate Animal Movement')
    assert.deepEqual(textsOf(overview, '.govuk-notification-banner__content'), [
      'This data asset has been deprecated'
    ])
    assert.equal(page.status, 200)
    assert.ok(textsOf(page, '.govuk-tag').includes('Deprecated'))
    assert.ok(
      page.document.querySelector('main a[href="/data-assets/DA11113"]')
    )
  })

  test('deprecating with no replacement records no replacement', async () => {
    await answer(administrator, '/manage/data-assets/DA11113/deprecate', {
      replacement: 'none'
    })
    const related = await administrator.get(
      '/manage/data-assets/DA11113/related-resources'
    )

    assert.equal(
      textsOf(related, '.govuk-summary-list__key').includes('Replaced by'),
      false
    )
    assert.equal(
      stateOf(await administrator.get('/manage/data-assets/DA11113')),
      'Deprecated'
    )
  })

  test('there is no confirmation page for a data asset that is not published', async () => {
    assert.equal(
      (await administrator.get('/manage/data-assets/DA11112/published')).status,
      404
    )
  })

  test('a deprecated data asset can only be retired (Q42)', async () => {
    const keeper = '/manage/data-assets/DA11114'
    const overview = await administrator.get(keeper)

    assert.equal(stateOf(overview), 'Deprecated')
    const about = await administrator.get(`${keeper}/about`)
    assert.deepEqual(
      [...about.document.querySelectorAll('main a')].map((link) =>
        link.textContent.trim()
      ),
      ['Return to Keeper']
    )
    for (const path of [
      'about/title',
      'publish',
      'deprecate',
      'delete',
      'review/record'
    ]) {
      assert.equal(
        (await administrator.get(`${keeper}/${path}`)).status,
        404,
        path
      )
    }
    assert.equal((await administrator.get(`${keeper}/retire`)).status, 200)
  })

  test('retiring a published data asset removes it from the catalogue, and records when its data was deleted (S11, Q22)', async () => {
    await answer(administrator, `${MOVEMENT}/retire`, {
      isDeleted: 'yes',
      ...dateAnswer('deletionDate', '2026-10-05')
    })
    const overview = await administrator.get(`${MOVEMENT}?changed=retired`)

    assert.equal(stateOf(overview), 'Retired')
    assert.equal((await administrator.get('/data-assets/DA11111')).status, 404)
    const search = await administrator.get('/data-assets?q=animal+movement')
    assert.equal(search.html.includes('href="/data-assets/DA11111"'), false)
    assert.ok(
      textsOf(overview, 'main p').includes(
        'Its data was deleted on 5 October 2026.'
      )
    )
    const dates = await administrator.get(`${MOVEMENT}/dates`)
    assert.ok(rowsOf(dates).includes('Data deleted 5 October 2026'))
  })

  test('a notice in the address only shows when it is true', async () => {
    const page = await administrator.get(
      `${MOVEMENT}?changed=retired&created=yes`
    )

    assert.equal(
      page.document.querySelector('.govuk-notification-banner'),
      null
    )
    assert.equal(
      (await administrator.get(`${MOVEMENT}?changed=constructor`)).status,
      200
    )
  })

  test('the preview shows the catalogue page with a banner and a link back', async () => {
    const preview = await administrator.get(
      '/manage/data-assets/DA11112/preview'
    )

    assert.equal(preview.status, 200)
    assert.match(
      textsOf(preview, '.govuk-notification-banner')[0],
      /This is a preview\. Catalogue users cannot see draft or retired data assets\./
    )
    assert.ok(
      preview.document.querySelector(
        '.govuk-notification-banner a[href="/manage/data-assets/DA11112"]'
      )
    )
  })
})

describe('a data steward maintaining their data assets', () => {
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

  test('can change a data asset they are assigned to', async () => {
    await answer(steward, `${MOVEMENT}/about/description`, {
      description: 'Changed by the data steward.'
    })
    const about = await steward.get(`${MOVEMENT}/about`)

    assert.ok(
      rowsOf(about).some((row) => row.includes('Changed by the data steward.'))
    )
  })

  test('sees who is responsible but cannot change it, except the delivery group (Q24)', async () => {
    const page = await steward.get(`${MOVEMENT}/responsibility`)

    assert.equal(page.status, 200)
    assert.deepEqual(
      [...page.document.querySelectorAll('main a')]
        .map((link) => link.getAttribute('href'))
        .filter((href) => href.includes('/responsibility/')),
      [`${MOVEMENT}/responsibility/delivery-group`]
    )
    for (const path of [
      'responsibility/data-owner/add',
      'responsibility/data-steward/add',
      'responsibility/data-custodian/add',
      'responsibility/change-data-owner',
      'responsibility/assignments/0/end',
      'responsibility/custodians/0/end'
    ]) {
      assert.equal((await steward.get(`${MOVEMENT}/${path}`)).status, 404, path)
    }
  })

  test('is asked to get a catalogue administrator to add a missing data owner', async () => {
    const page = await steward.get('/manage/data-assets/DA11112/publish')

    assert.ok(
      textsOf(page, 'main li a').includes(
        'ask a catalogue administrator to add a data owner'
      )
    )
  })

  test('sees Page not found for a data asset they are not assigned to', async () => {
    for (const path of [
      '/manage/data-assets/DA11113',
      '/manage/data-assets/DA11113/about',
      '/manage/data-assets/DA11113/about/title',
      '/manage/data-assets/DA11113/history'
    ]) {
      assert.equal((await steward.get(path)).status, 404, path)
    }
    assert.equal(
      (
        await steward.post('/manage/data-assets/DA11113/about/title', {
          titleName: 'Not theirs'
        })
      ).status,
      404
    )
  })
})

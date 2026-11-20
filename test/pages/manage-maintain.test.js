import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'
import {
  ALEX_EXAMPLE,
  JO_BLOGGS,
  SAM_SPECIMEN,
  answer,
  dateAnswer,
  textsOf
} from '../helpers/manage.js'
import { visitor } from '../helpers/session.js'

const MOVEMENT = '/manage/data-assets/DA11111'
const KEEPER = '/manage/data-assets/DA11114'
const OLD_HOLDINGS = '/manage/data-assets/DA11116'
const BACK_TO_DRAFT =
  'Saving a change will take this data asset out of the catalogue until you publish it again.'

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

  test('a published data asset warns that some changes take it out of the catalogue, and which sections make them (answer 41)', async () => {
    const overview = await administrator.get(MOVEMENT)
    const about = await administrator.get(`${MOVEMENT}/about`)
    const classification = await administrator.get(`${MOVEMENT}/classification`)
    const review = await administrator.get(`${MOVEMENT}/review`)

    assert.equal(stateOf(overview), 'Published')
    assert.match(
      textsOf(overview, '.govuk-warning-text')[0],
      /Some changes will take this data asset out of the catalogue until you publish it again\. Each question tells you if it will\.$/
    )
    assert.match(
      textsOf(about, '.govuk-warning-text')[0],
      /Changing some of these answers will take this data asset out of the catalogue until you publish it again\. Each question tells you if it will\.$/
    )
    assert.ok(
      textsOf(classification, '.govuk-warning-text')[0].endsWith(BACK_TO_DRAFT)
    )
    assert.deepEqual(textsOf(review, '.govuk-warning-text'), [])
  })

  test('a material change sends a published data asset back to Draft, and catalogue users cannot see it until it is published again (answer 41)', async () => {
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

  test('a question page for a published data asset warns that saving takes it out of the catalogue, only when the change is material (answer 41)', async () => {
    const draft = await administrator.get(
      '/manage/data-assets/DA11112/about/title'
    )
    const deprecate = await administrator.get(`${MOVEMENT}/deprecate`)

    for (const path of [
      'about/title',
      'about/description',
      'classification/keywords',
      'responsibility/data-steward/add',
      'responsibility/assignments/0/end',
      'distributions/add',
      'distributions/0/type',
      'distributions/0/remove',
      'information-asset/choose'
    ]) {
      const page = await administrator.get(`${MOVEMENT}/${path}`)
      assert.ok(
        textsOf(page, '.govuk-warning-text')[0]?.endsWith(BACK_TO_DRAFT),
        path
      )
    }
    for (const path of [
      'about/version',
      'dates/coverage',
      'dates/area',
      'responsibility/delivery-group',
      'related-resources/add',
      'related-resources/0/remove',
      'review/frequency',
      'review/record'
    ]) {
      const page = await administrator.get(`${MOVEMENT}/${path}`)
      assert.deepEqual(textsOf(page, '.govuk-warning-text'), [], path)
      assert.deepEqual(
        textsOf(page, '.govuk-inset-text'),
        ['Catalogue users will see this change as soon as you save it.'],
        path
      )
    }
    const valid = await administrator.get(`${MOVEMENT}/dates/valid`)
    assert.match(
      textsOf(valid, '.govuk-warning-text')[0],
      /Changing your answer to “Valid from” will take this data asset out of the catalogue until you publish it again\.$/
    )
    assert.deepEqual(textsOf(draft, '.govuk-warning-text'), [])
    assert.deepEqual(textsOf(draft, '.govuk-inset-text'), [])
    assert.match(
      textsOf(deprecate, '.govuk-warning-text')[0],
      /Catalogue users will still see this data asset/
    )
  })

  test('a change that is not material keeps a published data asset published, and catalogue users see it straight away (answer 41)', async () => {
    await answer(administrator, `${MOVEMENT}/about/version`, {
      versionNumber: '9.9'
    })
    await answer(administrator, `${MOVEMENT}/responsibility/delivery-group`, {
      deliveryGroupName: 'none'
    })
    await answer(administrator, `${MOVEMENT}/related-resources/0/remove`, {
      confirm: 'yes'
    })
    await answer(administrator, `${MOVEMENT}/review/record`, {
      ...dateAnswer('lastReviewedDate', '2026-11-01'),
      lastReviewedByName: JO_BLOGGS,
      ...dateAnswer('nextReviewDate', '2027-11-01'),
      approvedByName: 'nobody'
    })
    await answer(administrator, `${MOVEMENT}/dates/valid`, {
      ...dateAnswer('validFromDate', '2024-04-01'),
      ...dateAnswer('validToDate', '2030-12-31')
    })
    const catalogue = await administrator.get('/data-assets/DA11111')
    const history = await administrator.get(`${MOVEMENT}/history`)

    assert.equal(stateOf(await administrator.get(MOVEMENT)), 'Published')
    assert.equal(catalogue.status, 200)
    assert.ok(rowsOf(catalogue).includes('Version 9.9'))
    assert.equal(history.document.querySelectorAll('tbody tr').length, 0)
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

  test("a deprecated data asset's responsibility page lets a catalogue administrator change it, without saying it can be published (answer 42)", async () => {
    const page = await administrator.get(`${KEEPER}/responsibility`)

    assert.deepEqual(textsOf(page, '.govuk-inset-text'), [])
    assert.deepEqual(textsOf(page, '.govuk-warning-text'), [])
    for (const path of [
      'change-data-owner',
      'data-steward/add',
      'data-custodian/add',
      'assignments/0/end'
    ]) {
      assert.ok(
        page.document.querySelector(
          `main a[href="${KEEPER}/responsibility/${path}"]`
        ),
        path
      )
    }
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

    // The version isn't material, so it kept the data asset published, and
    // the update frequency sent it back to Draft in the same change
    assert.deepEqual(
      rows.map(([, change, madeBy]) => [change, madeBy]),
      [
        [
          'Publication state changed from Published to Draft',
          'Jamie Placeholder, catalogue administrator'
        ],
        [
          'Update frequency changed from Real time to Weekly',
          'Jamie Placeholder, catalogue administrator'
        ]
      ]
    )
    assert.equal(rows[0][0], rows[1][0])
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

  test('a deprecated data asset can be changed and retired, but not published, deprecated again or deleted (answer 42)', async () => {
    const overview = await administrator.get(KEEPER)
    const about = await administrator.get(`${KEEPER}/about`)

    assert.equal(stateOf(overview), 'Deprecated')
    assert.ok(
      textsOf(overview, 'main p').includes(
        'You can still change it. It stays deprecated, and catalogue users see your changes straight away. You cannot publish it again, but you can retire it.'
      )
    )
    assert.deepEqual(textsOf(overview, '.govuk-warning-text'), [])
    assert.ok(textsOf(about, 'main a').includes('Change title'))
    assert.deepEqual(textsOf(about, '.govuk-warning-text'), [])
    for (const path of [
      'about/title',
      'distributions/0/type',
      'responsibility/data-custodian/add',
      'review/record',
      'retire'
    ]) {
      const page = await administrator.get(`${KEEPER}/${path}`)
      assert.equal(page.status, 200, path)
      assert.deepEqual(
        textsOf(page, '.govuk-warning-text').filter((text) =>
          text.endsWith(BACK_TO_DRAFT)
        ),
        [],
        path
      )
    }
    for (const path of ['publish', 'deprecate', 'delete']) {
      assert.equal(
        (await administrator.get(`${KEEPER}/${path}`)).status,
        404,
        path
      )
      assert.equal(
        (await administrator.post(`${KEEPER}/${path}`, {})).status,
        404,
        path
      )
    }
  })

  test('a question page for a deprecated data asset says the change is seen straight away (answer 42)', async () => {
    const page = await administrator.get(`${KEEPER}/about/description`)

    assert.deepEqual(textsOf(page, '.govuk-warning-text'), [])
    assert.deepEqual(textsOf(page, '.govuk-inset-text'), [
      'Catalogue users will see this change as soon as you save it.'
    ])
  })

  test('a deprecated data asset cannot be left without what it needs to be published, and the page says why (answer 42)', async () => {
    for (const [path, answers, error] of [
      [
        'responsibility/assignments/0/end',
        dateAnswer('effectiveToDate', '2026-01-31'),
        'Catalogue users can still see this data asset, so it must have a data owner. To change who it is, use Change the data owner'
      ],
      [
        'responsibility/assignments/1/end',
        dateAnswer('effectiveToDate', '2026-01-31'),
        'Catalogue users can still see this data asset, so it must have a data steward. Add another data steward before you end this one'
      ],
      [
        'distributions/0/remove',
        { confirm: 'yes' },
        'Catalogue users can still see this data asset, so it must have at least 1 distribution'
      ]
    ]) {
      const page = await administrator.post(`${KEEPER}/${path}`, answers)

      assert.equal(page.status, 200, path)
      assert.deepEqual(
        textsOf(page, '.govuk-error-summary__list a'),
        [error],
        path
      )
    }
    const history = await administrator.get(`${KEEPER}/history`)
    assert.equal(history.document.querySelectorAll('tbody tr').length, 0)
    assert.equal(stateOf(await administrator.get(KEEPER)), 'Deprecated')
  })

  test('a distribution cannot be added to a deprecated data asset, because it is saved before it is complete', async () => {
    const distributions = await administrator.get(`${KEEPER}/distributions`)

    assert.equal(
      distributions.document.querySelector(
        `a[href="${KEEPER}/distributions/add"]`
      ),
      null
    )
    assert.deepEqual(textsOf(distributions, '.govuk-inset-text'), [
      'You cannot add a distribution to a deprecated data asset.'
    ])
    assert.ok(
      distributions.document.querySelector(
        `a[href="${KEEPER}/distributions/0/type"]`
      )
    )
    assert.equal(
      (await administrator.get(`${KEEPER}/distributions/add`)).status,
      404
    )
    assert.equal(
      (
        await administrator.post(`${KEEPER}/distributions/add`, {
          name: 'Keeper file',
          description: ''
        })
      ).status,
      404
    )
  })

  test('changing a deprecated data asset keeps it deprecated and in the catalogue, and records the change (answer 42)', async () => {
    await answer(administrator, `${KEEPER}/about/description`, {
      description: 'A changed made-up description of keepers.'
    })
    await answer(administrator, `${KEEPER}/responsibility/data-custodian/add`, {
      organisationName: 'Rural Payments Agency',
      ...dateAnswer('effectiveFromDate', '2026-01-01')
    })
    const catalogue = await administrator.get('/data-assets/DA11114')
    const history = await administrator.get(`${KEEPER}/history`)

    assert.equal(stateOf(await administrator.get(KEEPER)), 'Deprecated')
    assert.equal(catalogue.status, 200)
    assert.ok(textsOf(catalogue, '.govuk-tag').includes('Deprecated'))
    assert.ok(
      catalogue.html.includes('A changed made-up description of keepers.')
    )
    assert.deepEqual(textsOf(history, 'tbody tr td:nth-child(2)'), [
      'Data custodian Rural Payments Agency added, from 1 January 2026',
      'Description changed from The people and businesses who keep livestock, with the holdings they keep it on. to A changed made-up description of keepers.'
    ])
  })

  test('a deprecated data asset still has only one data owner at a time (S17)', async () => {
    const page = await administrator.post(
      `${KEEPER}/responsibility/data-owner/add`,
      { person: JO_BLOGGS, ...dateAnswer('effectiveFromDate', '2026-01-01') }
    )

    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      "End the current data owner's assignment before you add a new data owner"
    ])
  })

  test('retiring a deprecated data asset makes it read only, including who is responsible and its related resources (answer 42)', async () => {
    await answer(administrator, `${KEEPER}/retire`, {})
    const responsibility = await administrator.get(`${KEEPER}/responsibility`)
    const related = await administrator.get(`${KEEPER}/related-resources`)

    assert.equal(stateOf(await administrator.get(KEEPER)), 'Retired')
    for (const page of [responsibility, related]) {
      assert.deepEqual(
        [...page.document.querySelectorAll('main a')].map((link) =>
          link.textContent.trim()
        ),
        ['Return to Keeper']
      )
    }
    assert.deepEqual(textsOf(responsibility, '.govuk-inset-text'), [])
    assert.ok(
      textsOf(related, '.govuk-summary-list__key').includes('Replaced by')
    )
  })

  test('a retired data asset cannot be changed (answer 42)', async () => {
    const about = await administrator.get(`${OLD_HOLDINGS}/about`)
    const responsibility = await administrator.get(
      `${OLD_HOLDINGS}/responsibility`
    )

    assert.equal(stateOf(await administrator.get(OLD_HOLDINGS)), 'Retired')
    assert.deepEqual(textsOf(about, 'main a'), ['Return to Old Holdings'])
    assert.deepEqual(textsOf(responsibility, 'main a'), [
      'Return to Old Holdings'
    ])
    assert.deepEqual(textsOf(responsibility, '.govuk-inset-text'), [])
    for (const path of [
      'about/title',
      'distributions/add',
      'responsibility/delivery-group',
      'responsibility/data-custodian/add',
      'related-resources/add',
      'review/record',
      'retire'
    ]) {
      assert.equal(
        (await administrator.get(`${OLD_HOLDINGS}/${path}`)).status,
        404,
        path
      )
    }
    assert.equal(
      (
        await administrator.post(`${OLD_HOLDINGS}/about/title`, {
          titleName: 'Changed'
        })
      ).status,
      404
    )
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

describe('who manages a data asset (answer 40)', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('a data owner who is not a data steward of a data asset cannot manage it', async () => {
    const holding = '/manage/data-assets/DA11113'
    const participant = visitor(app)
    await participant.becomes('catalogue-administrator')
    await answer(participant, `${holding}/responsibility/change-data-owner`, {
      ...dateAnswer('ownerEndDate', '2026-01-31'),
      person: SAM_SPECIMEN,
      ...dateAnswer('effectiveFromDate', '2026-02-01')
    })
    const responsibility = await participant.get(`${holding}/responsibility`)
    await participant.becomes('data-steward')
    const list = await participant.get('/manage/data-assets')
    const catalogue = await participant.get('/data-assets/DA11113')

    assert.match(
      textsOf(responsibility, '.govuk-summary-card')[0],
      /^Data owner .*Sam Specimen/
    )
    for (const path of [
      holding,
      `${holding}/about`,
      `${holding}/about/title`,
      `${holding}/history`
    ]) {
      assert.equal((await participant.get(path)).status, 404, path)
    }
    assert.equal(
      (
        await participant.post(`${holding}/about/title`, {
          titleName: 'Not theirs'
        })
      ).status,
      404
    )
    assert.equal(textsOf(list, 'tbody a').includes('Livestock Holding'), false)
    assert.equal(catalogue.html.includes('Manage this data asset'), false)
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

  test('can change a deprecated data asset they are a data steward of, and it stays deprecated (answer 42)', async () => {
    const results = '/manage/data-assets/DA11117'
    await answer(steward, `${results}/deprecate`, { replacement: 'none' })
    await answer(steward, `${results}/about/description`, {
      description: 'Changed by the data steward after deprecating it.'
    })
    const catalogue = await steward.get('/data-assets/DA11117')

    assert.equal(stateOf(await steward.get(results)), 'Deprecated')
    assert.equal(catalogue.status, 200)
    assert.ok(
      catalogue.html.includes(
        'Changed by the data steward after deprecating it.'
      )
    )
    for (const path of [
      'responsibility/data-owner/add',
      'responsibility/data-custodian/add',
      'responsibility/assignments/0/end'
    ]) {
      assert.equal(
        (await steward.post(`${results}/${path}`, {})).status,
        404,
        path
      )
    }
    assert.deepEqual(
      textsOf(
        await steward.get(`${results}/responsibility`),
        '.govuk-inset-text'
      ),
      [
        'Ask a catalogue administrator to change who is responsible for this data asset.'
      ]
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

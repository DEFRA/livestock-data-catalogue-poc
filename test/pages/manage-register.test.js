import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'

import { today } from '../../app/lib/clock.js'
import { formatDate } from '../../app/lib/formatting.js'
import { startApp } from '../helpers/app.js'
import {
  ALEX_EXAMPLE,
  JO_BLOGGS,
  NEW_DATA_ASSET,
  addDistribution,
  answer,
  completeDraft,
  createDraft,
  dateAnswer,
  textsOf
} from '../helpers/manage.js'
import { visitor } from '../helpers/session.js'

function taskStatuses(page) {
  return Object.fromEntries(
    [...page.document.querySelectorAll('.govuk-task-list__item')].map(
      (item) => [
        item
          .querySelector(
            '.govuk-task-list__name-and-hint a, .govuk-task-list__name-and-hint div'
          )
          .textContent.trim(),
        item.querySelector('.govuk-task-list__status').textContent.trim()
      ]
    )
  )
}

function errorsOn(page) {
  return textsOf(page, '.govuk-error-summary__list a')
}

describe('the "Manage this data asset" link on a catalogue page', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('shows for a data steward assigned to the data asset', async () => {
    const steward = visitor(app)
    await steward.becomes('data-steward')
    const page = await steward.get('/data-assets/DA11111')

    assert.equal(
      page.document
        .querySelector('a[href="/manage/data-assets/DA11111"]')
        .textContent.trim(),
      'Manage this data asset'
    )
  })

  test('does not show for a data steward not assigned to it, or a catalogue user', async () => {
    const steward = visitor(app)
    await steward.becomes('data-steward')

    for (const page of [
      await steward.get('/data-assets/DA11113'),
      await visitor(app).get('/data-assets/DA11111')
    ]) {
      assert.equal(page.html.includes('Manage this data asset'), false)
    }
  })
})

describe('registering a data asset (journey 2)', () => {
  let app
  let administrator
  let address

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  beforeEach(async () => {
    administrator = visitor(app)
    await administrator.becomes('catalogue-administrator')
    address = await createDraft(administrator)
  })

  test('the overview lists each section with its status, and publishing cannot start yet', async () => {
    const page = await administrator.get(address)

    assert.deepEqual(taskStatuses(page), {
      'About the data asset': 'In progress',
      'Categories, keywords and jurisdictions': 'Not yet started',
      'Status and updates': 'Not yet started',
      'Access rights and provenance': 'Not yet started',
      'Dates and coverage': 'Not yet started',
      'Who is responsible': 'Not yet started',
      Distributions: 'Not yet started',
      'Information asset': 'Not yet started',
      'Related resources': 'Not yet started',
      Review: 'Not yet started',
      'Check and publish': 'Cannot start yet'
    })
    assert.ok(
      textsOf(page, 'main p').includes(
        'You have completed 0 of 8 required sections.'
      )
    )
  })

  test('a section is Completed when it has everything S26 needs from it', async () => {
    await answer(administrator, `${address}/about/type`, {
      dataAssetTypeCode: 'MASTER_DATA'
    })
    const inProgress = taskStatuses(await administrator.get(address))
    await answer(administrator, `${address}/about/domain`, {
      domainCode: 'ANIMAL'
    })
    const page = await administrator.get(address)

    assert.equal(inProgress['About the data asset'], 'In progress')
    assert.equal(taskStatuses(page)['About the data asset'], 'Completed')
    assert.ok(
      textsOf(page, 'main p').includes(
        'You have completed 1 of 8 required sections.'
      )
    )
  })

  test('saves an answer straight away, sets the Metadata Date to today and goes back to the section', async () => {
    const saved = await answer(administrator, `${address}/about/version`, {
      versionNumber: '2.1'
    })
    const section = await administrator.get(saved.headers.get('location'))

    assert.equal(saved.headers.get('location'), `${address}/about`)
    assert.ok(
      textsOf(section, '.govuk-summary-list__row').includes(
        'Version 2.1 Change version'
      )
    )
    const preview = await administrator.get(`${address}/preview`)
    assert.ok(
      textsOf(preview, '.govuk-summary-list__row').some((row) =>
        row.includes(formatDate(today()))
      )
    )
  })

  test('keeps the answers and shows "Error: " in the title after an error', async () => {
    const page = await administrator.post(`${address}/dates/created`, {
      ...dateAnswer('creationDate', '2025-02-30')
    })

    assert.equal(page.status, 200)
    assert.match(page.document.title, /^Error: /)
    assert.deepEqual(errorsOn(page), [
      'The date the data asset was created must be a real date'
    ])
    assert.equal(
      page.document.querySelector('input[name="creationDate-day"]').value,
      '30'
    )
    assert.equal(
      page.document
        .querySelector('.govuk-error-summary__list a')
        .getAttribute('href'),
      '#creationDate-day'
    )
  })

  for (const [scenario, path, answers, error] of [
    [
      'a value that is not in its list',
      'about/domain',
      { domainCode: 'MADE_UP' },
      'Select the domain'
    ],
    [
      'dates in the wrong order',
      'dates/valid',
      {
        ...dateAnswer('validFromDate', '2025-02-01'),
        ...dateAnswer('validToDate', '2025-01-31')
      },
      'The date the data asset is valid to must be the same as or after the date it is valid from'
    ],
    [
      'a review frequency under 1 month',
      'review/frequency',
      { reviewFrequencyMonthQuantity: '0' },
      'Review frequency must be at least 1 month'
    ],
    [
      'a review frequency over 120 months',
      'review/frequency',
      { reviewFrequencyMonthQuantity: '121' },
      'Review frequency must be 120 months or fewer'
    ],
    [
      'a review frequency that is not a whole number',
      'review/frequency',
      { reviewFrequencyMonthQuantity: '1.5' },
      'Enter the review frequency as a whole number of months'
    ],
    [
      'a description over 2,000 characters',
      'about/description',
      { description: 'x'.repeat(2001) },
      'Description must be 2,000 characters or fewer'
    ]
  ]) {
    test(`does not save ${scenario}`, async () => {
      const page = await administrator.post(`${address}/${path}`, answers)
      const history = await administrator.get(`${address}/history`)

      assert.equal(page.status, 200)
      assert.deepEqual(errorsOn(page), [error])
      assert.equal(history.document.querySelectorAll('tbody tr').length, 1)
    })
  }

  test('does not save an address that is not a valid URI, or a negative size', async () => {
    await addDistribution(administrator, address)
    const badAddress = await administrator.post(
      `${address}/distributions/0/addresses`,
      { accessReference: 'not an address', downloadReference: '' }
    )
    const negative = await administrator.post(
      `${address}/distributions/0/version-and-size`,
      { versionNumber: '', byteSizeQuantity: '-5' }
    )

    assert.equal(badAddress.status, 200)
    assert.match(errorsOn(badAddress)[0], /in the correct format/)
    assert.deepEqual(errorsOn(negative), ['Size cannot be negative'])
  })

  test('adds several data stewards and data custodians, but only one data owner at a time (S17)', async () => {
    const owner = {
      person: JO_BLOGGS,
      ...dateAnswer('effectiveFromDate', '2025-01-01')
    }
    await answer(
      administrator,
      `${address}/responsibility/data-owner/add`,
      owner
    )
    for (const person of [JO_BLOGGS, ALEX_EXAMPLE]) {
      await answer(
        administrator,
        `${address}/responsibility/data-steward/add`,
        {
          person,
          ...dateAnswer('effectiveFromDate', '2025-01-01')
        }
      )
    }
    for (const organisationName of [
      'Rural Payments Agency',
      'Welsh Government'
    ]) {
      await answer(
        administrator,
        `${address}/responsibility/data-custodian/add`,
        { organisationName, ...dateAnswer('effectiveFromDate', '2025-01-01') }
      )
    }
    const secondOwner = await administrator.post(
      `${address}/responsibility/data-owner/add`,
      { person: ALEX_EXAMPLE, ...dateAnswer('effectiveFromDate', '2025-06-01') }
    )
    const section = await administrator.get(`${address}/responsibility`)

    assert.deepEqual(errorsOn(secondOwner), [
      "End the current data owner's assignment before you add a new data owner"
    ])
    assert.deepEqual(textsOf(section, '.govuk-summary-card__title'), [
      'Data owner',
      'Data stewards',
      'Data custodians'
    ])
    const cards = textsOf(section, '.govuk-summary-card')
    assert.match(cards[1], /Jo Bloggs.*Alex Example/)
    assert.match(cards[2], /Rural Payments Agency.*Welsh Government/)
  })

  test('the same person cannot be a data steward twice at once', async () => {
    const steward = {
      person: JO_BLOGGS,
      ...dateAnswer('effectiveFromDate', '2025-01-01')
    }
    await answer(
      administrator,
      `${address}/responsibility/data-steward/add`,
      steward
    )
    const again = await administrator.post(
      `${address}/responsibility/data-steward/add`,
      steward
    )

    assert.deepEqual(errorsOn(again), [
      'Jo Bloggs is already a data steward on these dates'
    ])
  })

  test('each distribution name is unique within the data asset, ignoring case', async () => {
    await addDistribution(administrator, address, 'Cattle API')
    const page = await administrator.post(`${address}/distributions/add`, {
      name: ' cattle api ',
      description: ''
    })

    assert.deepEqual(errorsOn(page), [
      'This data asset already has a distribution with this name'
    ])
  })

  test('the publish page lists every outstanding item at once, each linking to where to fix it, and nothing can be published', async () => {
    const page = await administrator.get(`${address}/publish`)
    const links = [...page.document.querySelectorAll('main li a')].map(
      (link) => [link.textContent.trim(), link.getAttribute('href')]
    )

    assert.equal(
      textsOf(page, 'h1')[0],
      `You cannot publish ${NEW_DATA_ASSET.titleName} yet`
    )
    assert.equal(links.length, 17)
    assert.deepEqual(links[0], [
      'say who can access and use the data',
      `${address}/access-and-provenance/access-rights`
    ])
    assert.ok(
      links.some(
        ([text, href]) =>
          text === 'add a data owner' &&
          href === `${address}/responsibility/data-owner/add`
      )
    )
    assert.ok(
      links.some(
        ([text, href]) =>
          text === 'add at least one distribution' &&
          href === `${address}/distributions/add`
      )
    )
    assert.equal(page.document.querySelector('form'), null)
    const posted = await administrator.post(`${address}/publish`, {})
    assert.equal(posted.status, 200)
    assert.equal(textsOf(posted, 'h1')[0], textsOf(page, 'h1')[0])
    assert.ok(
      textsOf(await administrator.get(address), 'main p').includes(
        'Catalogue entry: Draft'
      )
    )
  })

  test('publishing a complete draft makes it Published, dated today, findable, with its identifier confirmed', async () => {
    await completeDraft(administrator, address)
    const check = await administrator.get(`${address}/publish`)
    const published = await answer(administrator, `${address}/publish`, {})
    const confirmation = await administrator.follow(published)
    const identifier = address.split('/').pop()
    const catalogue = visitor(app)

    assert.equal(
      textsOf(check, 'h1')[0],
      `Check before you publish ${NEW_DATA_ASSET.titleName}`
    )
    assert.deepEqual(textsOf(check, '.govuk-inset-text'), [
      'A data custodian is recommended. You can still publish without one.'
    ])
    assert.equal(published.headers.get('location'), `${address}/published`)
    assert.equal(
      textsOf(confirmation, '.govuk-panel__title')[0],
      'Data asset published'
    )
    assert.match(
      textsOf(confirmation, '.govuk-panel__body')[0],
      new RegExp(identifier)
    )
    const page = await catalogue.get(`/data-assets/${identifier}`)
    assert.equal(page.status, 404, 'another browser does not see the change')
    const own = await administrator.get(`/data-assets/${identifier}`)
    assert.equal(own.status, 200)
    const search = await administrator.get('/data-assets?q=made-up+cattle')
    assert.ok(search.html.includes(NEW_DATA_ASSET.titleName))
    const overview = await administrator.get(address)
    assert.ok(
      textsOf(overview, 'main p').includes('Catalogue entry: Published')
    )
    const dates = await administrator.get(`${address}/dates`)
    assert.ok(
      textsOf(dates, '.govuk-summary-list__row').includes(
        `Accepted ${formatDate(today())}`
      )
    )
  })

  test('a draft can only become Published through the publish page (S11)', async () => {
    const page = await administrator.get(`${address}/status/lifecycle`)
    const values = [
      ...page.document.querySelectorAll('input[name="lifecycleStateCode"]')
    ].map((input) => input.value)

    assert.equal(values.includes('PUBLISHED'), false)
    assert.equal(
      (
        await administrator.post(`${address}/status/lifecycle`, {
          publicationStateCode: 'PUBLISHED'
        })
      ).status,
      404
    )
  })

  test('deleting a draft asks to confirm, then it has gone', async () => {
    const question = await administrator.get(`${address}/delete`)
    const kept = await answer(administrator, `${address}/delete`, {
      confirm: 'no'
    })
    const deleted = await answer(administrator, `${address}/delete`, {
      confirm: 'yes'
    })
    const list = await administrator.follow(deleted)
    const identifier = address.split('/').pop()

    assert.equal(
      textsOf(question, 'h1')[0],
      `Are you sure you want to delete ${NEW_DATA_ASSET.titleName}?`
    )
    assert.equal(kept.headers.get('location'), address)
    assert.equal(
      deleted.headers.get('location'),
      `/manage/data-assets?deleted=${identifier}`
    )
    assert.deepEqual(textsOf(list, '.govuk-notification-banner__content'), [
      `Data asset ${identifier} has been deleted`
    ])
    assert.equal((await administrator.get(address)).status, 404)
  })

  test('a draft another data asset links to cannot be deleted, and the page says why (Q26)', async () => {
    const page = await administrator.get('/manage/data-assets/DA11112/delete')
    const posted = await administrator.post(
      '/manage/data-assets/DA11112/delete',
      { confirm: 'yes' }
    )

    assert.equal(page.status, 200)
    assert.equal(textsOf(page, 'h1')[0], 'You cannot delete Animal Identity')
    assert.deepEqual(textsOf(page, 'main .govuk-list--bullet li'), [
      'Livestock Holding'
    ])
    assert.equal(page.document.querySelector('main form'), null)
    assert.ok(
      page.document.querySelector(
        'main a[href="/manage/data-assets/DA11112/retire"]'
      )
    )
    assert.equal(posted.status, 404)
    assert.equal(
      (await administrator.get('/manage/data-assets/DA11112')).status,
      200
    )
  })

  test('a data asset published before cannot be deleted, even after a change takes it back to Draft (Q26)', async () => {
    await answer(administrator, '/manage/data-assets/DA11115/about/version', {
      versionNumber: '9'
    })
    const overview = await administrator.get('/manage/data-assets/DA11115')

    assert.ok(textsOf(overview, 'main p').includes('Catalogue entry: Draft'))
    assert.equal(
      overview.document.querySelector(
        'a[href="/manage/data-assets/DA11115/delete"]'
      ),
      null
    )
    assert.ok(
      overview.document.querySelector(
        'a[href="/manage/data-assets/DA11115/retire"]'
      )
    )
    assert.equal(
      (await administrator.get('/manage/data-assets/DA11115/delete')).status,
      404
    )
  })

  test('a data steward is not told the title of a linking data asset they cannot see', async () => {
    await answer(administrator, `${address}/related-resources/add`, {
      relationshipTypeCode: 'RELATED_TO',
      target: 'DA11112'
    })
    await administrator.becomes('data-steward')
    const page = await administrator.get('/manage/data-assets/DA11112/delete')

    assert.deepEqual(textsOf(page, 'main .govuk-list--bullet li'), [
      'Livestock Holding',
      'a data asset you do not manage'
    ])
  })

  test('the created notice only shows for a data asset created in this session', async () => {
    const page = await administrator.get(
      '/manage/data-assets/DA11112?created=yes'
    )

    assert.equal(
      page.document.querySelector('.govuk-notification-banner'),
      null
    )
  })

  test('a deleted notice only shows for a data asset deleted in this session', async () => {
    const page = await administrator.get('/manage/data-assets?deleted=DA11111')

    assert.equal(
      page.document.querySelector('.govuk-notification-banner'),
      null
    )
  })

  test('retiring a draft makes it Retired with no checks, and it cannot be published again', async () => {
    const question = await administrator.get(`${address}/retire`)
    const retired = await answer(administrator, `${address}/retire`, {})
    const overview = await administrator.get(retired.headers.get('location'))

    assert.equal(
      textsOf(question, 'h1')[0],
      `Retire ${NEW_DATA_ASSET.titleName}`
    )
    assert.ok(textsOf(overview, 'main p').includes('Catalogue entry: Retired'))
    assert.deepEqual(textsOf(overview, '.govuk-notification-banner__content'), [
      'This data asset has been retired'
    ])
    assert.equal((await administrator.get(`${address}/publish`)).status, 404)
    assert.equal(
      (await administrator.get(`${address}/about/title`)).status,
      404
    )
  })
})

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { findAccessibilityViolations } from '../helpers/accessibility.js'
import { startApp } from '../helpers/app.js'
import { completeDraft, createDraft, dateAnswer } from '../helpers/manage.js'
import { visitor } from '../helpers/session.js'

const MOVEMENT = '/manage/data-assets/DA11111'

describe('accessibility of the manage pages', () => {
  let app
  let administrator
  let steward
  let draft
  let complete

  before(async () => {
    app = await startApp()
    administrator = visitor(app)
    await administrator.becomes('catalogue-administrator')
    steward = visitor(app)
    await steward.becomes('data-steward')
    draft = await createDraft(administrator)
    complete = await createDraft(administrator, {
      titleName: 'Complete made-up asset',
      description: 'Ready to publish.',
      organisationName: 'Rural Payments Agency'
    })
    await completeDraft(administrator, complete)
    await administrator.post(`${MOVEMENT}/about/version`, {
      versionNumber: '3'
    })
  })

  after(async () => {
    await app.stop()
  })

  const get = (who, path) => () => who().get(path())
  const post = (who, path, answers) => () => who().post(path(), answers)
  const asAdministrator = () => administrator
  const asSteward = () => steward
  const fixed = (path) => () => path

  const PAGE_STATES = [
    ['prototype settings', get(asAdministrator, fixed('/prototype-settings'))],
    [
      'prototype settings with an error',
      post(asAdministrator, fixed('/prototype-settings'), {})
    ],
    ['your data assets', get(asSteward, fixed('/manage/data-assets'))],
    [
      'create a data asset',
      get(asAdministrator, fixed('/manage/data-assets/create'))
    ],
    [
      'create a data asset with errors',
      post(asAdministrator, fixed('/manage/data-assets/create'), {})
    ],
    [
      'a new draft overview',
      get(asAdministrator, () => `${draft}?created=yes`)
    ],
    [
      'a published overview',
      get(asSteward, fixed('/manage/data-assets/DA11117'))
    ],
    [
      'a deprecated overview',
      get(asAdministrator, fixed('/manage/data-assets/DA11114'))
    ],
    [
      'a retired overview',
      get(asAdministrator, fixed('/manage/data-assets/DA11116'))
    ],
    ['the about section', get(asAdministrator, fixed(`${MOVEMENT}/about`))],
    ['the dates section', get(asAdministrator, fixed(`${MOVEMENT}/dates`))],
    [
      'who is responsible',
      get(asAdministrator, fixed(`${MOVEMENT}/responsibility`))
    ],
    [
      'who is responsible, read only',
      get(asSteward, fixed(`${MOVEMENT}/responsibility`))
    ],
    [
      'an empty who is responsible',
      get(asAdministrator, () => `${draft}/responsibility`)
    ],
    ['distributions', get(asAdministrator, fixed(`${MOVEMENT}/distributions`))],
    [
      'related resources',
      get(asAdministrator, fixed(`${MOVEMENT}/related-resources`))
    ],
    [
      'no related resources',
      get(asAdministrator, () => `${draft}/related-resources`)
    ],
    [
      'a text question with an error',
      post(asAdministrator, () => `${draft}/about/title`, {})
    ],
    [
      'a character count question',
      get(asAdministrator, () => `${draft}/about/description`)
    ],
    ['a radios question', get(asAdministrator, () => `${draft}/about/type`)],
    [
      'a checkboxes question',
      get(asAdministrator, () => `${draft}/classification/categories`)
    ],
    [
      'the keywords question',
      get(asAdministrator, () => `${draft}/classification/keywords`)
    ],
    [
      'a date question with an error',
      post(
        asAdministrator,
        () => `${draft}/dates/created`,
        dateAnswer('creationDate', '2025-02-30')
      )
    ],
    ['two dates', get(asAdministrator, () => `${draft}/dates/valid`)],
    [
      'add a data owner',
      get(asAdministrator, () => `${draft}/responsibility/data-owner/add`)
    ],
    [
      'change the data owner with errors',
      post(
        asAdministrator,
        fixed(`${MOVEMENT}/responsibility/change-data-owner`),
        {}
      )
    ],
    [
      'end an assignment',
      get(
        asAdministrator,
        fixed(`${MOVEMENT}/responsibility/assignments/0/end`)
      )
    ],
    [
      'distribution addresses',
      get(asAdministrator, fixed(`${MOVEMENT}/distributions/0/addresses`))
    ],
    [
      'add a data service',
      get(
        asAdministrator,
        fixed(`${MOVEMENT}/distributions/0/add-data-service`)
      )
    ],
    [
      'add a related resource',
      get(asAdministrator, fixed(`${MOVEMENT}/related-resources/add`))
    ],
    [
      'add an information asset',
      get(asAdministrator, () => `${draft}/information-asset/add`)
    ],
    [
      'record a review',
      get(asAdministrator, fixed(`${MOVEMENT}/review/record`))
    ],
    [
      'deprecate',
      get(asAdministrator, fixed('/manage/data-assets/DA11113/deprecate'))
    ],
    [
      'retire with a deletion date',
      get(asAdministrator, fixed('/manage/data-assets/DA11113/retire'))
    ],
    ['delete a draft', get(asAdministrator, () => `${draft}/delete`)],
    [
      'a draft that cannot be deleted',
      get(asAdministrator, fixed('/manage/data-assets/DA11112/delete'))
    ],
    [
      'remove a distribution',
      get(asAdministrator, fixed(`${MOVEMENT}/distributions/0/remove`))
    ],
    [
      'publish, with outstanding items',
      get(asAdministrator, () => `${draft}/publish`)
    ],
    [
      'check before publishing',
      get(asAdministrator, () => `${complete}/publish`)
    ],
    ['change history', get(asAdministrator, fixed(`${MOVEMENT}/history`))],
    [
      'an empty change history',
      get(asAdministrator, fixed('/manage/data-assets/DA11113/history'))
    ],
    ['a preview', get(asAdministrator, () => `${draft}/preview`)],
    [
      'a catalogue page with a manage link',
      get(asSteward, fixed('/data-assets/DA11117'))
    ]
  ]

  for (const [state, load] of PAGE_STATES) {
    test(`${state} has no WCAG 2.2 AA violations that axe can find`, async () => {
      const page = await load()

      assert.ok([200].includes(page.status), `${state}: ${page.status}`)
      assert.deepEqual(await findAccessibilityViolations(page.html), [])
    })
  }

  test('the confirmation after publishing has no WCAG 2.2 AA violations that axe can find', async () => {
    const published = await administrator.post(`${complete}/publish`, {})
    const page = await administrator.follow(published)

    assert.equal(page.status, 200)
    assert.deepEqual(await findAccessibilityViolations(page.html), [])
  })
})

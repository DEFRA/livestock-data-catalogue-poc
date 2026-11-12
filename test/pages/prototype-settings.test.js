import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'
import { createDraft, textsOf } from '../helpers/manage.js'
import { visitor } from '../helpers/session.js'

function navigationLinks(page) {
  return textsOf(page, '.govuk-service-navigation__link')
}

describe('the prototype settings page (D20)', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('asks who the participant is, with each persona described, and a catalogue user chosen first', async () => {
    const page = await visitor(app).get('/prototype-settings')

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-radios__label'), [
      'A catalogue user',
      'Sam Specimen, data steward, Animal and Plant Health Agency',
      'Jamie Placeholder, catalogue administrator, Department for Environment, Food and Rural Affairs'
    ])
    assert.equal(
      page.document.querySelector('input[name="personaId"]:checked').value,
      'catalogue-user'
    )
    assert.match(
      textsOf(page, '.govuk-inset-text')[0],
      /This page is not part of the service/
    )
  })

  test('a catalogue user sees no "Your data assets" in the navigation', async () => {
    const page = await visitor(app).get('/')

    assert.ok(!navigationLinks(page).includes('Your data assets'))
  })

  for (const personaId of ['data-steward', 'catalogue-administrator']) {
    test(`saving ${personaId} shows "Your data assets" in the navigation`, async () => {
      const participant = visitor(app)
      const saved = await participant.becomes(personaId)
      const confirmed = await participant.follow(saved)

      assert.equal(
        saved.headers.get('location'),
        '/prototype-settings?done=saved'
      )
      assert.deepEqual(
        textsOf(confirmed, '.govuk-notification-banner__content'),
        ['Your settings have been saved']
      )
      assert.ok(navigationLinks(confirmed).includes('Your data assets'))
      assert.equal(
        confirmed.document.querySelector('input[name="personaId"]:checked')
          .value,
        personaId
      )
    })
  }

  test('marks "Your data assets" as the current page on that page only', async () => {
    const participant = visitor(app)
    await participant.becomes('data-steward')
    const list = await participant.get('/manage/data-assets')
    const overview = await participant.get('/manage/data-assets/DA11111')

    const currentOn = (page) =>
      page.document
        .querySelector('.govuk-service-navigation__item--active a')
        ?.textContent.trim()
    assert.equal(currentOn(list), 'Your data assets')
    assert.equal(
      list.document
        .querySelector('.govuk-service-navigation__item--active a')
        .getAttribute('aria-current'),
      'page'
    )
    assert.equal(currentOn(overview), 'Your data assets')
  })

  test('shows an error when nothing is chosen', async () => {
    const participant = visitor(app)
    await participant.get('/prototype-settings')
    const page = await participant.post('/prototype-settings', {})

    assert.equal(page.status, 200)
    assert.deepEqual(textsOf(page, '.govuk-error-summary__list a'), [
      'Select who you are in this session'
    ])
    assert.match(page.document.title, /^Error: /)
  })

  test('refuses a persona that is not an option', async () => {
    const participant = visitor(app)
    await participant.get('/prototype-settings')
    const page = await participant.post('/prototype-settings', {
      personaId: 'root'
    })

    assert.equal(page.status, 200)
    assert.equal(
      page.document.querySelectorAll('.govuk-error-message').length,
      1
    )
  })

  test('resetting removes every change but keeps who the participant is', async () => {
    const participant = visitor(app)
    await participant.becomes('catalogue-administrator')
    const address = await createDraft(participant)
    await participant.get('/prototype-settings')
    const reset = await participant.post('/prototype-settings/reset', {})
    const confirmed = await participant.follow(reset)

    assert.equal(
      reset.headers.get('location'),
      '/prototype-settings?done=reset'
    )
    assert.deepEqual(
      textsOf(confirmed, '.govuk-notification-banner__content'),
      ['Your changes have been removed']
    )
    assert.equal((await participant.get(address)).status, 404)
    assert.equal(
      (await participant.get('/manage/data-assets/create')).status,
      200
    )
  })

  for (const done of ['constructor', '__proto__', 'unknown']) {
    test(`shows no notice for done=${done}`, async () => {
      const page = await visitor(app).get(`/prototype-settings?done=${done}`)

      assert.equal(page.status, 200)
      assert.equal(
        page.document.querySelector('.govuk-notification-banner'),
        null
      )
    })
  }

  test('says changes are deleted 4 hours after the last change', async () => {
    const page = await visitor(app).get('/prototype-settings')

    assert.ok(
      textsOf(page, 'main p').includes(
        'Changes are only kept in this browser, and are deleted 4 hours after your last change.'
      )
    )
  })
})

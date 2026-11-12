import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'
import {
  addDistribution,
  answer,
  createDraft,
  dateAnswer,
  textsOf
} from '../helpers/manage.js'
import { visitor } from '../helpers/session.js'

const MOVEMENT = '/manage/data-assets/DA11111'

function errorsOn(page) {
  return textsOf(page, '.govuk-error-summary__list a')
}

function rowsOf(page) {
  return textsOf(page, '.govuk-summary-list__row')
}

describe('the other manage questions', () => {
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

  describe('information assets (Q32)', () => {
    test('choosing "Add a new information asset" goes to a page to add one', async () => {
      const page = await answer(
        administrator,
        `${MOVEMENT}/information-asset/choose`,
        { informationAssetName: 'new' }
      )

      assert.equal(
        page.headers.get('location'),
        `${MOVEMENT}/information-asset/add`
      )
    })

    test('a new information asset needs a name, a classification and a retention period, and a name not in use', async () => {
      const empty = await administrator.post(
        `${MOVEMENT}/information-asset/add`,
        {}
      )
      const inUse = await administrator.post(
        `${MOVEMENT}/information-asset/add`,
        {
          name: 'animal disease records',
          securityClassificationCode: 'OFFICIAL',
          retentionPeriodDescription: '7 years'
        }
      )

      assert.deepEqual(errorsOn(empty), [
        'Enter a name',
        'Select the security classification',
        'Enter how long the data is kept'
      ])
      assert.deepEqual(errorsOn(inUse), [
        'An information asset with this name already exists'
      ])
    })

    test('adds a new information asset and links the data asset to it', async () => {
      await answer(administrator, `${MOVEMENT}/information-asset/add`, {
        name: 'Made-up Movement Records',
        securityClassificationCode: 'OFFICIAL',
        retentionPeriodDescription: '7 years'
      })
      const section = await administrator.get(`${MOVEMENT}/information-asset`)
      const choose = await administrator.get(
        `${MOVEMENT}/information-asset/choose`
      )

      assert.ok(
        rowsOf(section).some((row) => row.includes('Made-up Movement Records'))
      )
      assert.ok(
        textsOf(choose, '.govuk-radios__label').includes(
          'Made-up Movement Records'
        )
      )
    })
  })

  describe('related resources (S16)', () => {
    test('adds a data asset and a web page as related resources, and refuses the same relationship twice', async () => {
      await answer(administrator, `${MOVEMENT}/related-resources/add`, {
        relationshipTypeCode: 'RELATED_TO',
        target: 'DA11117',
        description: 'Made-up reason'
      })
      const again = await administrator.post(
        `${MOVEMENT}/related-resources/add`,
        { relationshipTypeCode: 'RELATED_TO', target: 'DA11117' }
      )
      await answer(administrator, `${MOVEMENT}/related-resources/add`, {
        relationshipTypeCode: 'REFERENCED_BY',
        target: 'external',
        targetAddress: 'https://www.example.com/reports'
      })
      const section = await administrator.get(`${MOVEMENT}/related-resources`)

      assert.deepEqual(errorsOn(again), [
        'This data asset already has this relationship'
      ])
      assert.deepEqual(
        textsOf(section, '.govuk-summary-list__value').slice(2),
        [
          'Bovine TB Test Results Made-up reason',
          'https://www.example.com/reports'
        ]
      )
    })

    test('a web page outside the catalogue needs an https address', async () => {
      const missing = await administrator.post(
        `${MOVEMENT}/related-resources/add`,
        { relationshipTypeCode: 'RELATED_TO', target: 'external' }
      )
      const plain = await administrator.post(
        `${MOVEMENT}/related-resources/add`,
        {
          relationshipTypeCode: 'RELATED_TO',
          target: 'external',
          targetAddress: 'http://www.example.com/reports'
        }
      )

      assert.deepEqual(errorsOn(missing), ['Enter the web address'])
      assert.deepEqual(errorsOn(plain), [
        'Enter a web address in the correct format, like https://www.example.com/reports'
      ])
    })

    test('removing a related resource asks to confirm, and No keeps it', async () => {
      const kept = await answer(
        administrator,
        `${MOVEMENT}/related-resources/0/remove`,
        { confirm: 'no' }
      )
      await answer(administrator, `${MOVEMENT}/related-resources/0/remove`, {
        confirm: 'yes'
      })
      const section = await administrator.get(`${MOVEMENT}/related-resources`)

      assert.equal(
        kept.headers.get('location'),
        `${MOVEMENT}/related-resources`
      )
      assert.deepEqual(textsOf(section, '.govuk-summary-list__value'), [
        'Livestock Holding Animals move between the holdings in this data asset'
      ])
    })

    test('a data asset can have up to 20 related resources', async () => {
      const draft = await createDraft(administrator)
      const targets = ['DA11111', 'DA11113', 'DA11115', 'DA11117']
      const types = [
        'DERIVED_FROM',
        'RELATED_TO',
        'REFERENCED_BY',
        'REPLACES',
        'REPLACED_BY'
      ]
      for (const target of targets) {
        for (const relationshipTypeCode of types) {
          await answer(administrator, `${draft}/related-resources/add`, {
            relationshipTypeCode,
            target
          })
        }
      }
      const page = await administrator.post(`${draft}/related-resources/add`, {
        relationshipTypeCode: 'RELATED_TO',
        target: 'DA11118'
      })

      assert.deepEqual(errorsOn(page), [
        'A data asset can have up to 20 related resources'
      ])
    })
  })

  describe('distributions (S18 to S24)', () => {
    test('renaming a distribution refuses a name another one has, and the history says it was renamed', async () => {
      const taken = await administrator.post(
        `${MOVEMENT}/distributions/0/name`,
        { name: 'movement EVENTS', description: '' }
      )
      await answer(administrator, `${MOVEMENT}/distributions/0/name`, {
        name: 'Movements REST API',
        description: ''
      })
      const history = await administrator.get(`${MOVEMENT}/history`)

      assert.deepEqual(errorsOn(taken), [
        'This data asset already has a distribution with this name'
      ])
      assert.ok(
        textsOf(history, 'tbody td').includes(
          'Distribution Movements API renamed Movements REST API'
        )
      )
    })

    test('an event stream also asks for its broker address and topic', async () => {
      await answer(administrator, `${MOVEMENT}/distributions/0/type`, {
        distributionTypeCode: 'EVENT_STREAM'
      })
      const page = await administrator.get(
        `${MOVEMENT}/distributions/0/addresses`
      )
      const invalid = await administrator.post(
        `${MOVEMENT}/distributions/0/addresses`,
        {
          accessReference: '',
          downloadReference: '',
          brokerReference: 'not an address',
          topicName: 'movements'
        }
      )

      assert.ok(page.document.querySelector('input[name="brokerReference"]'))
      assert.ok(page.document.querySelector('input[name="topicName"]'))
      assert.deepEqual(errorsOn(invalid), [
        'Enter the broker address in the correct format, like amqps://broker.example.com'
      ])
    })

    test('the size must be a whole number of bytes', async () => {
      const page = await administrator.post(
        `${MOVEMENT}/distributions/0/version-and-size`,
        { versionNumber: '', byteSizeQuantity: '1.5' }
      )
      await answer(
        administrator,
        `${MOVEMENT}/distributions/0/version-and-size`,
        { versionNumber: '2', byteSizeQuantity: '1024' }
      )
      const section = await administrator.get(`${MOVEMENT}/distributions`)

      assert.deepEqual(errorsOn(page), ['Size must be a whole number of bytes'])
      assert.match(
        textsOf(section, '.govuk-summary-card')[0],
        /1,024 bytes|1024/
      )
    })

    test('adds a new data service with a title and an endpoint, and refuses a title in use (Q33)', async () => {
      const chosen = await answer(
        administrator,
        `${MOVEMENT}/distributions/0/data-service`,
        { dataServiceTitleName: 'new' }
      )
      const empty = await administrator.post(chosen.headers.get('location'), {})
      const inUse = await administrator.post(chosen.headers.get('location'), {
        titleName: 'breed codes api',
        endpointReference: 'https://api.example.org/breeds'
      })
      await answer(administrator, chosen.headers.get('location'), {
        titleName: 'Made-up Movements Service',
        endpointReference: 'https://api.example.org/made-up'
      })
      const section = await administrator.get(`${MOVEMENT}/distributions`)

      assert.equal(
        chosen.headers.get('location'),
        `${MOVEMENT}/distributions/0/add-data-service`
      )
      assert.deepEqual(errorsOn(empty), [
        'Enter a title',
        'Enter the endpoint address'
      ])
      assert.deepEqual(errorsOn(inUse), [
        'A data service with this title already exists'
      ])
      assert.match(
        textsOf(section, '.govuk-summary-card')[0],
        /Made-up Movements Service/
      )
    })

    test('a distribution can be left with no data service', async () => {
      await answer(administrator, `${MOVEMENT}/distributions/0/data-service`, {
        dataServiceTitleName: 'none'
      })
      const page = await administrator.get(
        `${MOVEMENT}/distributions/0/data-service`
      )

      assert.equal(
        page.document.querySelector(
          'input[name="dataServiceTitleName"]:checked'
        ),
        null
      )
    })

    test('removing a distribution asks to confirm, and No keeps it', async () => {
      await answer(administrator, `${MOVEMENT}/distributions/0/remove`, {
        confirm: 'no'
      })
      const section = await administrator.get(`${MOVEMENT}/distributions`)

      assert.equal(textsOf(section, '.govuk-summary-card__title').length, 2)
    })

    test('the preview shows a distribution that is not complete yet', async () => {
      const draft = await createDraft(administrator)
      await answer(administrator, `${draft}/distributions/add`, {
        name: 'Unfinished',
        description: ''
      })
      const preview = await administrator.get(`${draft}/preview`)

      assert.equal(preview.status, 200)
      assert.ok(preview.html.includes('Unfinished'))
    })

    test('marks a distribution that is not complete as Incomplete', async () => {
      const draft = await createDraft(administrator)
      await addDistribution(administrator, draft, 'Complete')
      await answer(administrator, `${draft}/distributions/add`, {
        name: 'Unfinished',
        description: ''
      })
      const section = await administrator.get(`${draft}/distributions`)

      assert.deepEqual(textsOf(section, '.govuk-summary-card__title'), [
        'Complete',
        'Unfinished Incomplete'
      ])
    })

    test('a data asset can have up to 20 distributions', async () => {
      const draft = await createDraft(administrator)
      for (let count = 1; count <= 20; count += 1) {
        await answer(administrator, `${draft}/distributions/add`, {
          name: `Distribution ${count}`,
          description: ''
        })
      }
      const page = await administrator.post(`${draft}/distributions/add`, {
        name: 'Distribution 21',
        description: ''
      })

      assert.deepEqual(errorsOn(page), [
        'A data asset can have up to 20 distributions'
      ])
    })

    test('the adding flow goes back to the previous question', async () => {
      const draft = await createDraft(administrator)
      await addDistribution(administrator, draft)
      const added = await answer(administrator, `${draft}/distributions/add`, {
        name: 'Second',
        description: ''
      })
      const format = await administrator.get(
        `${draft}/distributions/1/format?adding=yes`
      )

      assert.equal(
        added.headers.get('location'),
        `${draft}/distributions/1/type?adding=yes`
      )
      assert.equal(
        format.document.querySelector('.govuk-back-link').getAttribute('href'),
        `${draft}/distributions/1/access-method?adding=yes`
      )
    })
  })

  describe('who is responsible (S07, S17)', () => {
    test('an organisation can be a data custodian only once from a date, and up to 10 data custodians', async () => {
      const draft = await createDraft(administrator)
      const add = (organisationName, date) =>
        administrator.post(`${draft}/responsibility/data-custodian/add`, {
          organisationName,
          ...dateAnswer('effectiveFromDate', date)
        })
      await add('Rural Payments Agency', '2025-01-01')
      const twice = await add('Rural Payments Agency', '2025-01-01')
      for (let month = 2; month <= 10; month += 1) {
        await add(
          'Welsh Government',
          `2025-${String(month).padStart(2, '0')}-01`
        )
      }
      const eleventh = await add('Scottish Government', '2025-01-01')

      assert.deepEqual(errorsOn(twice), [
        'This organisation is already a data custodian from that date'
      ])
      assert.deepEqual(errorsOn(eleventh), [
        'A data asset can have up to 10 data custodians'
      ])
    })

    test('an end date is needed, and cannot be before the start', async () => {
      const empty = await administrator.post(
        `${MOVEMENT}/responsibility/custodians/0/end`,
        {}
      )
      const early = await administrator.post(
        `${MOVEMENT}/responsibility/custodians/0/end`,
        dateAnswer('effectiveToDate', '2000-01-01')
      )

      assert.deepEqual(errorsOn(empty), ['Enter the end date'])
      assert.match(
        errorsOn(early)[0],
        /^The end date must be the same as or after /
      )
    })

    test('changing the data owner refuses a stop date before the current owner started', async () => {
      const page = await administrator.post(
        `${MOVEMENT}/responsibility/change-data-owner`,
        {
          ...dateAnswer('ownerEndDate', '2000-01-01'),
          person: '87701706-bbda-4745-b73e-462eaab66f2d',
          ...dateAnswer('effectiveFromDate', '2000-01-02')
        }
      )

      assert.match(
        errorsOn(page)[0],
        /^The date Jo Bloggs stops must be the same as or after /
      )
    })

    test('an ended data custodian moves to the previous assignments', async () => {
      await answer(
        administrator,
        `${MOVEMENT}/responsibility/custodians/0/end`,
        dateAnswer('effectiveToDate', '2026-01-31')
      )
      const page = await administrator.get(`${MOVEMENT}/responsibility`)

      assert.ok(
        textsOf(page, '.govuk-details tbody tr').includes(
          'Digital, Data and Technology Services Data custodian 1 April 2024 to 31 January 2026'
        )
      )
    })

    test('a data owner whose assignment has ended shows in the previous assignments', async () => {
      await answer(
        administrator,
        `${MOVEMENT}/responsibility/change-data-owner`,
        {
          ...dateAnswer('ownerEndDate', '2026-01-31'),
          person: '87701706-bbda-4745-b73e-462eaab66f2d',
          ...dateAnswer('effectiveFromDate', '2026-02-01')
        }
      )
      const page = await administrator.get(`${MOVEMENT}/responsibility`)

      assert.ok(
        textsOf(page, '.govuk-details tbody tr').includes(
          'Jo Bloggs Data owner 1 April 2024 to 31 January 2026'
        )
      )
      assert.match(textsOf(page, '.govuk-summary-card')[0], /Alex Example/)
    })

    test('there is no "Change the data owner" page without a current data owner', async () => {
      const draft = await createDraft(administrator)

      assert.equal(
        (await administrator.get(`${draft}/responsibility/change-data-owner`))
          .status,
        404
      )
    })

    test('a data asset can have up to 30 governance assignments', async () => {
      const draft = await createDraft(administrator)
      for (let day = 1; day <= 30; day += 1) {
        const from = `2025-01-${String(day).padStart(2, '0')}`
        await answer(
          administrator,
          `${draft}/responsibility/data-steward/add`,
          {
            person: '87701706-bbda-4745-b73e-462eaab66f2d',
            ...dateAnswer('effectiveFromDate', from)
          }
        )
        await answer(
          administrator,
          `${draft}/responsibility/assignments/${day - 1}/end`,
          dateAnswer('effectiveToDate', from)
        )
      }
      const page = await administrator.post(
        `${draft}/responsibility/data-steward/add`,
        {
          person: '87701706-bbda-4745-b73e-462eaab66f2d',
          ...dateAnswer('effectiveFromDate', '2025-02-01')
        }
      )

      assert.deepEqual(errorsOn(page), [
        'A data asset can have up to 30 assignments'
      ])
    })

    test('the delivery group can be set and removed', async () => {
      const page = await administrator.get(
        `${MOVEMENT}/responsibility/delivery-group`
      )
      const [group] = [
        ...page.document.querySelectorAll('input[name="deliveryGroupName"]')
      ]
        .map((input) => input.value)
        .filter((value) => value !== 'none')
      await answer(administrator, `${MOVEMENT}/responsibility/delivery-group`, {
        deliveryGroupName: group
      })
      const set = await administrator.get(`${MOVEMENT}/responsibility`)
      await answer(administrator, `${MOVEMENT}/responsibility/delivery-group`, {
        deliveryGroupName: 'none'
      })
      const removed = await administrator.get(`${MOVEMENT}/responsibility`)

      assert.ok(rowsOf(set)[0].includes(group))
      assert.match(rowsOf(removed)[0], /^Delivery group None/)
      const question = await administrator.get(
        `${MOVEMENT}/responsibility/delivery-group`
      )
      assert.equal(
        question.document.querySelector(
          'input[name="deliveryGroupName"]:checked'
        ),
        null
      )
    })
  })

  describe('keywords and dates (S06, S14)', () => {
    test('reuses a keyword with its own spelling, and adds a new one in English', async () => {
      await answer(administrator, `${MOVEMENT}/classification/keywords`, {
        keywords: 'CATTLE\nmade-up keyword\n\nmade-up keyword'
      })
      const page = await administrator.get(
        `${MOVEMENT}/classification/keywords`
      )

      assert.equal(
        page.document.querySelector('textarea[name="keywords"]').value,
        'Cattle\nmade-up keyword'
      )
    })

    test('each keyword has up to 200 characters, and there are up to 30', async () => {
      const long = await administrator.post(
        `${MOVEMENT}/classification/keywords`,
        { keywords: 'x'.repeat(201) }
      )
      const many = await administrator.post(
        `${MOVEMENT}/classification/keywords`,
        {
          keywords: Array.from({ length: 31 }, (_, index) => `k${index}`).join(
            '\n'
          )
        }
      )

      assert.deepEqual(errorsOn(long), [
        'Each keyword must be 200 characters or fewer'
      ])
      assert.deepEqual(errorsOn(many), ['Enter 30 keywords or fewer'])
    })

    test('the creation date cannot be after the date it was accepted or the data last changed', async () => {
      const afterAccepted = await administrator.post(
        `${MOVEMENT}/dates/created`,
        dateAnswer('creationDate', '2026-11-01')
      )
      const changedBefore = await administrator.post(
        `${MOVEMENT}/dates/last-changed`,
        dateAnswer('modificationDate', '2000-01-01')
      )

      assert.ok(
        errorsOn(afterAccepted).includes(
          'The date the data asset was created must be the same as or before the date it was accepted'
        )
      )
      assert.deepEqual(errorsOn(changedBefore), [
        'The date the data was last changed must be the same as or after the date it was created'
      ])
    })

    test('the creation date cannot be after the date the data last changed, on a draft not yet accepted', async () => {
      const draft = await createDraft(administrator)
      await answer(
        administrator,
        `${draft}/dates/last-changed`,
        dateAnswer('modificationDate', '2025-01-01')
      )
      const page = await administrator.post(
        `${draft}/dates/created`,
        dateAnswer('creationDate', '2025-06-01')
      )

      assert.deepEqual(errorsOn(page), [
        'The date the data asset was created must be the same as or before the date the data was last changed'
      ])
    })

    test('the period the data covers cannot end before it starts', async () => {
      const page = await administrator.post(`${MOVEMENT}/dates/coverage`, {
        ...dateAnswer('coverageStartDate', '2025-02-01'),
        ...dateAnswer('coverageEndDate', '2025-01-31')
      })
      await answer(administrator, `${MOVEMENT}/dates/coverage`, {
        ...dateAnswer('coverageStartDate', '2025-01-01'),
        ...dateAnswer('coverageEndDate', '2025-12-31')
      })
      const section = await administrator.get(`${MOVEMENT}/dates`)

      assert.deepEqual(errorsOn(page), [
        'The end of the period must be the same as or after the start'
      ])
      assert.ok(
        rowsOf(section).some((row) =>
          row.includes('1 January 2025 to 31 December 2025')
        )
      )
    })

    test('shows when the data asset is valid from and to', async () => {
      await answer(administrator, `${MOVEMENT}/dates/valid`, {
        ...dateAnswer('validFromDate', '2024-04-01'),
        ...dateAnswer('validToDate', '2027-03-31')
      })
      const section = await administrator.get(`${MOVEMENT}/dates`)

      assert.ok(
        rowsOf(section).some((row) =>
          row.startsWith('Valid 1 April 2024 to 31 March 2027')
        )
      )
    })

    test('saves the area the data covers', async () => {
      await answer(administrator, `${MOVEMENT}/dates/area`, {
        spatialCoverageDescription: 'England and Wales'
      })
      const section = await administrator.get(`${MOVEMENT}/dates`)

      assert.ok(
        rowsOf(section).some((row) => row.includes('England and Wales'))
      )
    })

    test('the review frequency can be changed or removed', async () => {
      await answer(administrator, `${MOVEMENT}/review/frequency`, {
        reviewFrequencyMonthQuantity: '24'
      })
      const changed = await administrator.get(`${MOVEMENT}/review`)
      await answer(administrator, `${MOVEMENT}/review/frequency`, {
        reviewFrequencyMonthQuantity: ''
      })
      const removed = await administrator.get(`${MOVEMENT}/review`)

      assert.ok(
        rowsOf(changed)[0].startsWith('Review frequency Every 24 months')
      )
      assert.ok(rowsOf(removed)[0].startsWith('Review frequency Not provided'))
    })

    test('says "Every 1 month" for a review frequency of 1', async () => {
      await answer(administrator, `${MOVEMENT}/review/frequency`, {
        reviewFrequencyMonthQuantity: '1'
      })
      const review = await administrator.get(`${MOVEMENT}/review`)

      assert.ok(
        rowsOf(review)[0].startsWith('Review frequency Every 1 month Change')
      )
    })
  })
})

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startApp } from '../helpers/app.js'

function texts(document, selector) {
  return [...document.querySelectorAll(selector)].map((element) =>
    element.textContent.trim()
  )
}

describe('the home page', () => {
  let app
  let page

  before(async () => {
    app = await startApp()
    page = await app.getPage('/')
  })

  after(async () => {
    await app.stop()
  })

  test('shows the service name, what it is for and a search form', () => {
    assert.equal(page.status, 200)
    assert.equal(
      page.document.querySelector('h1').textContent.trim(),
      'Livestock Data Catalogue'
    )
    const form = page.document.querySelector('main form')
    assert.equal(form.getAttribute('method'), 'get')
    assert.equal(form.getAttribute('action'), '/data-assets')
    assert.ok(form.hasAttribute('novalidate'))
    assert.equal(
      form.querySelector('label[for="q"]').textContent.trim(),
      'Search data assets'
    )
    assert.equal(
      form.querySelector('#q-hint').textContent.trim(),
      'For example, animal movement or breed'
    )
    assert.equal(form.querySelector('input#q').getAttribute('name'), 'q')
    assert.equal(
      form.querySelector('input#q').hasAttribute('placeholder'),
      false
    )
  })

  test('shows the number of visible data assets in each domain, linking to the filtered search', () => {
    const table = page.document.querySelectorAll('table')[0]

    assert.equal(
      table.querySelector('caption').textContent.trim(),
      'Browse by domain'
    )
    assert.deepEqual(texts(table, 'tbody th'), [
      'Address',
      'Animal',
      'Disease & Testing',
      'Holding',
      'Operational Intelligence',
      'Reference Data',
      'Restrictions & Markers'
    ])
    assert.deepEqual(texts(table, 'tbody td'), [
      '1',
      '3',
      '1',
      '3',
      '1',
      '2',
      '1'
    ])
    assert.equal(
      table.querySelector('tbody a').getAttribute('href'),
      '/data-assets?domain=ADDRESS'
    )
  })

  test('shows the number of visible data assets for each owning organisation', () => {
    const table = page.document.querySelectorAll('table')[1]

    assert.equal(
      table.querySelector('caption').textContent.trim(),
      'Browse by organisation'
    )
    assert.deepEqual(texts(table, 'tbody td'), ['3', '1', '2', '4', '1', '1'])
    assert.ok(
      !table.textContent.includes(
        'Agriculture and Horticulture Development Board'
      )
    )
  })

  test('shows the 5 most recently updated data assets with their type and date', () => {
    const table = page.document.querySelectorAll('table')[2]

    assert.equal(
      table.querySelector('caption').textContent.trim(),
      'Recently updated'
    )
    assert.deepEqual(texts(table.querySelector('tbody tr'), 'th, td'), [
      'Animal Deaths',
      'Transactional Data',
      '31 October 2026'
    ])
    assert.equal(table.querySelectorAll('tbody tr').length, 5)
  })

  test('uses smaller table text on small screens, so the 3-column table fits 320 pixels', () => {
    const table = page.document.querySelectorAll('table')[2]

    assert.ok(table.classList.contains('govuk-table--small-text-until-tablet'))
  })
})

describe('the search page', () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app.stop()
  })

  test('shows every visible data asset, 10 to a page, with the page number in the title', async () => {
    const page = await app.getPage('/data-assets')

    assert.equal(page.status, 200)
    assert.equal(
      page.document.title,
      'Search data assets (page 1 of 2) – Livestock Data Catalogue'
    )
    assert.equal(
      page.document.querySelector('h1 label').textContent.trim(),
      'Search data assets'
    )
    assert.ok(texts(page.document, 'main p').includes('12 data assets'))
    assert.equal(page.document.querySelectorAll('main h2 a').length, 10)
  })

  test('shows the second page with a link back to the first', async () => {
    const page = await app.getPage('/data-assets?page=2')

    assert.equal(
      page.document.title,
      'Search data assets (page 2 of 2) – Livestock Data Catalogue'
    )
    assert.deepEqual(texts(page.document, 'main h2 a'), [
      'Movement Restrictions',
      'Species Reference Data'
    ])
    assert.equal(
      page.document
        .querySelector('.govuk-pagination__prev a')
        .getAttribute('href'),
      '/data-assets'
    )
    assert.equal(page.document.querySelector('.govuk-pagination__next'), null)
  })

  test('has no previous link on the first page', async () => {
    const page = await app.getPage('/data-assets')

    assert.equal(page.document.querySelector('.govuk-pagination__prev'), null)
    assert.equal(
      page.document
        .querySelector('.govuk-pagination__next a')
        .getAttribute('href'),
      '/data-assets?page=2'
    )
  })

  test('marks Data assets as the current page in the service navigation', async () => {
    const page = await app.getPage('/data-assets')

    assert.equal(
      page.document
        .querySelector('.govuk-service-navigation__link[aria-current="page"]')
        .textContent.trim(),
      'Data assets'
    )
  })

  test('finds data assets by search terms and keeps the terms in the search box', async () => {
    const page = await app.getPage('/data-assets?q=animal+deaths')

    assert.equal(
      page.document.title,
      'Search data assets – Livestock Data Catalogue'
    )
    assert.equal(page.document.querySelector('input#q').value, 'animal deaths')
    assert.ok(texts(page.document, 'main p').includes('1 data asset'))
    assert.deepEqual(texts(page.document, 'main h2 a'), ['Animal Deaths'])
    assert.equal(page.document.querySelector('.govuk-pagination'), null)
  })

  test('shows the start of the description and the type, owner, domain and date of each result', async () => {
    const page = await app.getPage('/data-assets?q=gwartheg')
    const result = page.document.querySelector('main .govuk-list > li')

    assert.match(
      result.textContent,
      /Movements of cattle, sheep, goats and pigs between holdings\./
    )
    assert.match(
      result.textContent,
      /Transactional Data owned by Animal and Plant Health Agency, in the Animal domain\. Last updated 28 October 2026\./
    )
    assert.doesNotMatch(result.textContent, /TRANSACTIONAL_DATA|ANIMAL\b/)
  })

  test('tags a deprecated data asset', async () => {
    const page = await app.getPage('/data-assets?q=keeper')
    const results = [...page.document.querySelectorAll('main .govuk-list > li')]

    assert.equal(results[0].querySelector('h2').textContent.trim(), 'Keeper')
    assert.equal(
      results[0].querySelector('.govuk-tag').textContent.trim(),
      'Deprecated'
    )
    assert.equal(results[1].querySelector('.govuk-tag'), null)
  })

  test('filters the results and keeps the chosen options selected', async () => {
    const page = await app.getPage(
      '/data-assets?type=MASTER_DATA&domain=HOLDING'
    )

    assert.deepEqual(texts(page.document, 'main h2 a'), [
      'Keeper',
      'Livestock Holding',
      'Livestock Keeper'
    ])
    assert.deepEqual(
      [...page.document.querySelectorAll('input[type="checkbox"]:checked')].map(
        (checkbox) => checkbox.value
      ),
      ['MASTER_DATA', 'HOLDING']
    )
  })

  test('offers a link to clear the filters that keeps the search terms', async () => {
    const page = await app.getPage(
      '/data-assets?q=movement&type=TRANSACTIONAL_DATA'
    )
    const clear = [...page.document.querySelectorAll('main a')].find(
      (link) => link.textContent.trim() === 'Clear filters'
    )

    assert.equal(clear.getAttribute('href'), '/data-assets?q=movement')
  })

  test('does not offer to clear filters when none are chosen', async () => {
    const page = await app.getPage('/data-assets')

    assert.ok(!texts(page.document, 'main a').includes('Clear filters'))
  })

  test('has a small checkbox filter for each attribute, with no option chosen by default', async () => {
    const page = await app.getPage('/data-assets')

    assert.deepEqual(texts(page.document, 'main legend'), [
      'Data asset type',
      'Domain',
      'Category',
      'Owning organisation',
      'Delivery group'
    ])
    assert.equal(
      page.document.querySelectorAll('.govuk-checkboxes--small').length,
      5
    )
    assert.equal(
      page.document.querySelectorAll('input[type="checkbox"]:checked').length,
      0
    )
  })

  test('suggests how to improve the search when nothing matches', async () => {
    const page = await app.getPage('/data-assets?q=unicorn')

    assert.ok(texts(page.document, 'main p').includes('0 data assets'))
    assert.ok(
      texts(page.document, 'main p').includes(
        'There are no matching data assets.'
      )
    )
    assert.deepEqual(texts(page.document, 'main .govuk-list--bullet li'), [
      'removing filters',
      'checking your spelling',
      'using fewer words',
      'searching for something less specific'
    ])
  })

  test('shows an error when the search terms are too long, and keeps them', async () => {
    const terms = 'a'.repeat(101)
    const page = await app.getPage(`/data-assets?q=${terms}`)

    assert.equal(page.status, 200)
    assert.equal(
      page.document.title,
      'Error: Search data assets – Livestock Data Catalogue'
    )
    assert.equal(
      page.document
        .querySelector('.govuk-error-summary__title')
        .textContent.trim(),
      'There is a problem'
    )
    const summaryLink = page.document.querySelector(
      '.govuk-error-summary__list a'
    )
    assert.equal(
      summaryLink.textContent.trim(),
      'Search terms must be 100 characters or fewer'
    )
    assert.equal(summaryLink.getAttribute('href'), '#q')
    assert.match(
      page.document.querySelector('#q-error').textContent,
      /Search terms must be 100 characters or fewer/
    )
    assert.equal(page.document.querySelector('input#q').value, terms)
    assert.equal(page.document.querySelectorAll('main h2 a').length, 0)
  })

  test('shows search terms as text, not as HTML', async () => {
    const page = await app.getPage(
      '/data-assets?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E'
    )

    assert.equal(
      page.document.querySelector('input#q').value,
      '<script>alert(1)</script>'
    )
    assert.doesNotMatch(page.html, /<script>alert\(1\)<\/script>/)
  })

  test('shows page 1 when the page number or a filter value is not valid', async () => {
    for (const address of [
      '/data-assets?page=9',
      '/data-assets?page=abc&type=WEATHER',
      '/data-assets?page[]=2'
    ]) {
      const page = await app.getPage(address)

      assert.equal(page.status, 200, address)
      assert.equal(
        page.document.title,
        'Search data assets (page 1 of 2) – Livestock Data Catalogue',
        address
      )
    }
  })

  test('sends a filter value that is not a known code nowhere in the page', async () => {
    const page = await app.getPage('/data-assets?type=%22%3E%3Cimg%20src=x%3E')

    assert.doesNotMatch(page.html, /<img src=x>/)
    assert.equal(
      page.document.querySelectorAll('input[type="checkbox"]:checked').length,
      0
    )
  })
})

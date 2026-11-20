import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildCatalogue } from '../../app/lib/catalogue-data.js'
import { isMaterialAttribute } from '../../app/lib/history.js'
import { ACTION_ROUTES } from '../../app/lib/manage/action-pages.js'
import {
  editChange,
  newPublicationProblems
} from '../../app/lib/manage/context.js'
import { DETAIL_QUESTIONS } from '../../app/lib/manage/detail-pages.js'
import { DISTRIBUTION_ROUTES } from '../../app/lib/manage/distribution-pages.js'
import { textField } from '../../app/lib/manage/fields.js'
import { questionPage } from '../../app/lib/manage/question-page.js'
import { RELATION_ROUTES } from '../../app/lib/manage/relation-pages.js'
import { RESPONSIBILITY_ROUTES } from '../../app/lib/manage/responsibility-pages.js'
import { SECTIONS } from '../../app/lib/manage/sections.js'
import { personaFor } from '../../app/lib/personas.js'
import { TODAY, catalogueCopy } from '../helpers/catalogue.js'

// The question pages that change a data asset's details. Creating,
// deprecating, retiring and deleting set the publication state and have
// warnings of their own.
const QUESTION_ROUTES = {
  ...Object.fromEntries(
    Object.entries(DETAIL_QUESTIONS).flatMap(([section, questions]) =>
      Object.entries(questions).map(([question, page]) => [
        `${section}/${question}`,
        page
      ])
    )
  ),
  ...RESPONSIBILITY_ROUTES,
  ...DISTRIBUTION_ROUTES,
  ...RELATION_ROUTES,
  'review/record': ACTION_ROUTES['review/record']
}

// The context a manage page gets, as a catalogue administrator, for the
// first item in any list on the page
function contextFor(identifier, state) {
  const collections = catalogueCopy()
  const dataAsset = collections.dataAssets.find(
    (candidate) => candidate.identifier === identifier
  )
  dataAsset.publicationStateCode = state ?? dataAsset.publicationStateCode
  return {
    req: { params: { position: '0' }, query: {}, body: {} },
    catalogue: buildCatalogue(collections),
    dataAsset,
    identifier,
    persona: personaFor('catalogue-administrator'),
    today: TODAY,
    canAssignRoles: true
  }
}

function pageAt(path, context = contextFor('DA11111')) {
  return QUESTION_ROUTES[path](context)
}

function materialKind(attributes) {
  const material = attributes.filter(isMaterialAttribute)
  if (material.length === 0) {
    return 'none'
  }
  return material.length === attributes.length ? 'all' : 'some'
}

// Shows or saves a question page through its handler, and gives what the
// page would show
function useQuestionPage(definePage, context, method = 'show', body = {}) {
  const shown = {}
  const res = {
    render(view, locals) {
      Object.assign(shown, { view, ...locals })
    },
    redirect(status, location) {
      Object.assign(shown, { status, location })
    }
  }
  questionPage(definePage)[method]({ manage: context, body }, res)
  return shown
}

describe('what each question page changes (answer 41)', () => {
  test('every question page says which data asset attributes it changes', () => {
    for (const path of Object.keys(QUESTION_ROUTES)) {
      const { changes } = pageAt(path)

      assert.ok(Array.isArray(changes) && changes.length > 0, path)
      assert.ok(
        changes.every((attribute) => typeof attribute === 'string'),
        path
      )
    }
  })

  test('a page that makes material and other changes asks for each material one in a field of the same name', () => {
    for (const path of Object.keys(QUESTION_ROUTES)) {
      const page = pageAt(path)
      if (materialKind(page.changes) === 'some') {
        const fieldNames = page.fields.map((field) => field.name)
        assert.ok(
          page.changes
            .filter(isMaterialAttribute)
            .every((attribute) => fieldNames.includes(attribute)),
          path
        )
      }
    }
  })

  test("each section warns in the same way as its questions' changes", () => {
    for (const section of SECTIONS) {
      const changes = Object.keys(QUESTION_ROUTES)
        .filter((path) => path.startsWith(`${section.id}/`))
        .flatMap((path) => pageAt(path).changes)

      assert.equal(
        materialKind(section.startedBy),
        materialKind(changes),
        section.id
      )
    }
  })
})

describe('the warning on a question page of a published data asset', () => {
  test('names the material answer on a page that also asks for others', () => {
    const shown = useQuestionPage(
      DETAIL_QUESTIONS.dates.valid,
      contextFor('DA11111')
    )

    assert.equal(
      shown.warning,
      'Changing your answer to “Valid from” will take this data asset out of the catalogue until you publish it again.'
    )
    assert.equal(shown.inset, undefined)
  })

  test('warns, to be safe, on a page that does not say what it changes', () => {
    const shown = useQuestionPage(
      () => ({ heading: 'A made-up question', fields: [], values: {} }),
      contextFor('DA11111')
    )

    assert.match(shown.warning, /^Saving a change will take this data asset/)
  })

  test('says a change that is not material is seen straight away', () => {
    const shown = useQuestionPage(
      DETAIL_QUESTIONS.about.version,
      contextFor('DA11111')
    )

    assert.equal(shown.warning, undefined)
    assert.equal(
      shown.inset,
      'Catalogue users will see this change as soon as you save it.'
    )
  })
})

describe('saving a change that would leave a data asset in the catalogue incomplete (answer 42)', () => {
  test('is refused, and the page says the data asset must keep everything it needs to be published', () => {
    const context = contextFor('DA11114')
    const definePage = () => ({
      heading: 'A made-up question',
      fields: [textField('note', 'Note')],
      values: {},
      save: () => ({
        change: editChange(context, (dataAsset) => {
          dataAsset.keywordNames = []
        }),
        redirect: '/somewhere'
      })
    })
    const shown = useQuestionPage(definePage, context, 'save', { note: 'x' })

    assert.equal(shown.location, undefined, 'nothing is saved')
    assert.deepEqual(shown.errorList, [
      {
        text: 'Catalogue users can still see this data asset, so it must keep everything it needs to be published',
        href: '#note'
      }
    ])
  })
})

describe('the checks a change would newly fail on a data asset catalogue users can see', () => {
  const withoutKeywords = (dataAsset) => ({ ...dataAsset, keywordNames: [] })
  const withoutDistributions = (dataAsset) => ({
    ...dataAsset,
    distributions: []
  })

  test('are none for a draft, which catalogue users cannot see', () => {
    const context = contextFor('DA11111', 'DRAFT')

    assert.deepEqual(
      newPublicationProblems(context, withoutKeywords(context.dataAsset)),
      []
    )
  })

  test('leave out checks it already failed while catalogue users could see it', () => {
    const context = contextFor('DA11114')
    context.dataAsset = withoutKeywords(context.dataAsset)

    assert.deepEqual(
      newPublicationProblems(
        context,
        withoutDistributions(context.dataAsset)
      ).map((check) => check.message),
      ['At least one Distribution is required']
    )
  })

  test('include every check, if catalogue users could not see it before', () => {
    const context = contextFor('DA11114', 'DRAFT')
    const after = withoutKeywords({
      ...context.dataAsset,
      publicationStateCode: 'DEPRECATED'
    })
    context.dataAsset = withoutKeywords(context.dataAsset)

    assert.deepEqual(
      newPublicationProblems(context, after).map((check) => check.message),
      ['At least one Keyword is required']
    )
  })

  test('are shown on the page itself when the page has no fields', () => {
    const context = contextFor('DA11114')
    const definePage = () => ({
      heading: 'A made-up question',
      fields: [],
      values: {},
      save: () => ({
        change: editChange(context, (dataAsset) => {
          dataAsset.keywordNames = []
        }),
        redirect: '/somewhere'
      })
    })
    const shown = useQuestionPage(definePage, context, 'save')

    assert.equal(shown.location, undefined, 'nothing is saved')
    assert.deepEqual(shown.errorList, [
      {
        text: 'Catalogue users can still see this data asset, so it must keep everything it needs to be published',
        href: '#main-content'
      }
    ])
  })
})

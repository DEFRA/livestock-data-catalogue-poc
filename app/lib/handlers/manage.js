import { dataAssetPage } from '../data-asset-view.js'
import { formatDateTime } from '../formatting.js'
import { readAnswers } from '../forms.js'
import {
  NotFoundError,
  editedDataAsset,
  isEditable,
  manageHref
} from '../manage/context.js'
import { publicationActions } from '../manage/publish.js'
import {
  SECTIONS,
  sectionSummary,
  sectionWithId,
  taskList
} from '../manage/sections.js'
import { managedDataAssets, personaDescription } from '../personas.js'
import { commitChange, historyFor, sessionChanges } from '../working-copy.js'

const STATE_ORDER = Object.freeze([
  'DRAFT',
  'PUBLISHED',
  'DEPRECATED',
  'RETIRED'
])

const STATE_TAG_CLASSES = Object.freeze({
  DRAFT: 'govuk-tag--grey',
  PUBLISHED: 'govuk-tag--green',
  DEPRECATED: 'govuk-tag--yellow',
  RETIRED: 'govuk-tag--red'
})

function stateName(catalogue, code) {
  return catalogue.referenceLists.get('publicationStates').get(code).name
}

function stateTag(catalogue, code) {
  return {
    text: stateName(catalogue, code),
    classes: STATE_TAG_CLASSES[code]
  }
}

function byStateThenTitle(first, second) {
  return (
    STATE_ORDER.indexOf(first.publicationStateCode) -
      STATE_ORDER.indexOf(second.publicationStateCode) ||
    first.titleName.localeCompare(second.titleName, 'en-GB')
  )
}

function deletedNotice(req) {
  const identifier = req.query.deleted
  return typeof identifier === 'string' &&
    sessionChanges(req)?.deletedIdentifiers.includes(identifier)
    ? `Data asset ${identifier} has been deleted`
    : undefined
}

export function listDataAssets(req, res) {
  const { catalogue, persona, today } = req.manage
  const dataAssets = managedDataAssets(catalogue, persona, today).sort(
    byStateThenTitle
  )
  res.render('manage/your-data-assets', {
    navigationItem: 'manage-list',
    pageName: 'Your data assets',
    personaText: personaDescription(catalogue, persona),
    canCreate: req.manage.canCreate,
    notice: deletedNotice(req),
    rows: dataAssets.map((dataAsset) => ({
      href: manageHref(dataAsset.identifier),
      titleName: dataAsset.titleName,
      identifier: dataAsset.identifier,
      stateTag: stateTag(catalogue, dataAsset.publicationStateCode),
      metadataDate: dataAsset.metadataDate,
      nextReviewDate: dataAsset.nextReviewDate
    }))
  })
}

const CHANGE_NOTICES = Object.freeze({
  deprecated: ['DEPRECATED', 'This data asset has been deprecated'],
  retired: ['RETIRED', 'This data asset has been retired']
})

// A notice only shows when it's true, so an edited address can't make the
// page say something that didn't happen
function overviewNotice(req) {
  const { dataAsset, identifier } = req.manage
  if (
    req.query.created === 'yes' &&
    dataAsset.publicationStateCode === 'DRAFT'
  ) {
    return `Data asset created. Its identifier is ${identifier}`
  }
  const { changed } = req.query
  const [state, notice] =
    typeof changed === 'string' && Object.hasOwn(CHANGE_NOTICES, changed)
      ? CHANGE_NOTICES[changed]
      : []
  return state === dataAsset.publicationStateCode ? notice : undefined
}

function taskItems(context, sections) {
  return sections.map((section) => ({
    group: section.group,
    title: { text: section.title },
    href: manageHref(context.identifier, section.id),
    hint: section.optional ? { text: 'Optional' } : undefined,
    status:
      section.status === 'Completed'
        ? { text: 'Completed' }
        : {
            tag: {
              text: section.status,
              classes:
                section.status === 'In progress'
                  ? 'govuk-tag--light-blue'
                  : 'govuk-tag--blue'
            }
          }
  }))
}

function publishItem(context, tasks) {
  const ready = tasks.completedCount === tasks.requiredCount
  return {
    group: 'Publish',
    title: { text: 'Check and publish' },
    href: ready ? manageHref(context.identifier, 'publish') : undefined,
    status: ready
      ? { tag: { text: 'Not yet started', classes: 'govuk-tag--blue' } }
      : {
          text: 'Cannot start yet',
          classes: 'govuk-task-list__status--cannot-start-yet'
        }
  }
}

function groupedTasks(items) {
  return Map.groupBy(items, (item) => item.group)
}

export function showOverview(req, res) {
  const context = req.manage
  const { catalogue, dataAsset, today } = context
  const tasks = taskList(dataAsset, today)
  const state = dataAsset.publicationStateCode
  const items = taskItems(context, tasks.sections)
  if (state === 'DRAFT') {
    items.push(publishItem(context, tasks))
  }
  res.render('manage/overview', {
    navigationItem: 'manage',
    pageName: dataAsset.titleName,
    identifier: dataAsset.identifier,
    titleName: dataAsset.titleName,
    state,
    stateTag: stateTag(catalogue, state),
    lifecycleName: dataAsset.lifecycleStateCode
      ? catalogue.referenceLists
          .get('dataAssetLifecycleStates')
          .get(dataAsset.lifecycleStateCode).name
      : 'Not provided',
    notice: overviewNotice(req),
    completedCount: tasks.completedCount,
    requiredCount: tasks.requiredCount,
    taskGroups: [...groupedTasks(items)].map(([heading, groupItems]) => ({
      heading,
      items: groupItems
    })),
    isEditable: isEditable(context),
    links: {
      review: manageHref(dataAsset.identifier, 'review', 'record'),
      deprecate: manageHref(dataAsset.identifier, 'deprecate'),
      retire: manageHref(dataAsset.identifier, 'retire'),
      delete: manageHref(dataAsset.identifier, 'delete'),
      history: manageHref(dataAsset.identifier, 'history'),
      preview: manageHref(dataAsset.identifier, 'preview'),
      catalogue: `/data-assets/${dataAsset.identifier}`
    }
  })
}

export function showSection(req, res) {
  const context = req.manage
  const section = sectionWithId(req.params.section)
  if (!section) {
    throw new NotFoundError()
  }
  res.render('manage/section', {
    navigationItem: 'manage',
    pageName: `${section.title}: ${context.dataAsset.titleName}`,
    caption: context.dataAsset.titleName,
    heading: section.title,
    overviewHref: manageHref(context.identifier),
    isPublished: context.dataAsset.publicationStateCode === 'PUBLISHED',
    ...sectionSummary(context, section)
  })
}

function checkAnswerSections(context) {
  return SECTIONS.map((section) => ({
    title: section.title,
    href: manageHref(context.identifier, section.id),
    summary: sectionSummary(context, section)
  }))
}

function renderPublishPage(res, context, checks) {
  res.render('manage/publish', {
    navigationItem: 'manage',
    pageName: checks.length
      ? `You cannot publish ${context.dataAsset.titleName} yet`
      : `Check before you publish ${context.dataAsset.titleName}`,
    titleName: context.dataAsset.titleName,
    overviewHref: manageHref(context.identifier),
    actions: publicationActions(context, checks),
    sections: checks.length ? [] : checkAnswerSections(context),
    hasCustodian: (context.dataAsset.custodians ?? []).length > 0
  })
}

function requireDraft(context) {
  if (context.dataAsset.publicationStateCode !== 'DRAFT') {
    throw new NotFoundError()
  }
}

export function showPublish(req, res) {
  const context = req.manage
  requireDraft(context)
  renderPublishPage(
    res,
    context,
    taskList(context.dataAsset, context.today).checks
  )
}

// The checks run again on the saved data, so nothing is published unless
// it passes them now (S26). The Acceptance Date is the date of the first
// publication (LDAT-252, question 29).
export function publishDataAsset(req, res) {
  const context = req.manage
  requireDraft(context)
  readAnswers(req.body, [])
  const { checks } = taskList(context.dataAsset, context.today)
  if (checks.length > 0) {
    renderPublishPage(res, context, checks)
    return
  }
  commitChange(req, {
    action: 'publish',
    identifier: context.identifier,
    dataAsset: editedDataAsset(
      context,
      (dataAsset) => {
        dataAsset.publicationStateCode = 'PUBLISHED'
        dataAsset.acceptanceDate ??= context.today
      },
      { backToDraft: false }
    )
  })
  res.redirect(303, manageHref(context.identifier, 'published'))
}

export function showPublished(req, res) {
  const context = req.manage
  if (context.dataAsset.publicationStateCode !== 'PUBLISHED') {
    throw new NotFoundError()
  }
  res.render('manage/published', {
    navigationItem: 'manage',
    pageName: 'Data asset published',
    identifier: context.identifier,
    titleName: context.dataAsset.titleName,
    catalogueHref: `/data-assets/${context.identifier}`,
    canCreate: context.canCreate
  })
}

export function showPreview(req, res) {
  const context = req.manage
  res.render('data-assets/data-asset', {
    navigationItem: 'manage',
    pageName: `Preview: ${context.dataAsset.titleName}`,
    isPreview: true,
    overviewHref: manageHref(context.identifier),
    ...dataAssetPage(context.catalogue, context.dataAsset, {
      today: context.today
    })
  })
}

// Newest change first, with the lines of each change in the order they
// were described
function newestFirst(entries) {
  return [...Map.groupBy(entries, (entry) => entry.dateTime).values()]
    .toReversed()
    .flat()
}

export function showHistory(req, res) {
  const context = req.manage
  const entries = newestFirst(historyFor(req, context.identifier))
  const isNewThisSession = entries.some(
    (entry) => entry.description === 'Data asset created'
  )
  res.render('manage/history', {
    navigationItem: 'manage',
    pageName: `Change history: ${context.dataAsset.titleName}`,
    titleName: context.dataAsset.titleName,
    overviewHref: manageHref(context.identifier),
    rows: entries.map((entry) => [
      { text: formatDateTime(entry.dateTime) },
      { text: entry.description },
      { text: entry.madeBy }
    ]),
    createdText: isNewThisSession
      ? undefined
      : `Created ${formatDateTime(context.dataAsset.systemCreatedDateTime)}`
  })
}

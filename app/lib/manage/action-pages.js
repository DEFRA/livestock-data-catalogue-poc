import { nextDataAssetIdentifier } from '../identifiers.js'
import { isVisible } from '../visibility.js'
import {
  MOST_NEW_DATA_ASSETS,
  issuedIdentifiers,
  newDataAssetCount
} from '../working-copy.js'
import {
  NotFoundError,
  canSee,
  editChange,
  editedDataAsset,
  linkingDataAssets,
  manageHref,
  systemDateTime
} from './context.js'
import {
  TITLE_IN_USE,
  descriptionField,
  isTitleInUse,
  titleField
} from './detail-pages.js'
import {
  OR_DIVIDER,
  YES_NO_OPTIONS,
  dateField,
  dateParts,
  organisationOptions,
  peopleOptions,
  radiosField
} from './fields.js'

// Creating a data asset, and the actions that change its state: record a
// review, deprecate, retire and delete (D25 in the journeys 2 and 3 plan)

// A new data asset is reviewed every 12 months unless someone changes it
// (LDAT-252, question 36)
const DEFAULT_REVIEW_FREQUENCY = 12

const NOBODY = 'nobody'
const NO_REPLACEMENT = 'none'

function overviewHref(context) {
  return manageHref(context.identifier)
}

function createProblems(context, answers) {
  if (newDataAssetCount(context.req) >= MOST_NEW_DATA_ASSETS) {
    return [
      {
        name: 'titleName',
        text: `You can create up to ${MOST_NEW_DATA_ASSETS} data assets in a prototype session. Reset the prototype in Prototype settings to start again`
      }
    ]
  }
  return isTitleInUse(context.catalogue, answers.titleName)
    ? [{ name: 'titleName', text: TITLE_IN_USE }]
    : []
}

// Only a catalogue administrator creates data assets (LDAT-252, question
// 24). S05 needs a title, description and owner before anything is saved,
// so they share one page.
export function createDataAsset(context) {
  return {
    heading: 'What is the data asset?',
    caption: 'Create a data asset',
    allowed: () => true,
    fields: [
      titleField('Title'),
      descriptionField('Description'),
      radiosField(
        'organisationName',
        'Which organisation owns it?',
        organisationOptions(context.catalogue),
        {
          hint: 'You cannot change this after you create the data asset',
          required: 'Select the organisation that owns the data asset'
        }
      )
    ],
    values: {},
    backHref: '/manage/data-assets',
    buttonText: 'Create data asset',
    validate: (answers) => createProblems(context, answers),
    save(answers) {
      const identifier = nextDataAssetIdentifier(issuedIdentifiers(context.req))
      const now = systemDateTime()
      const dataAsset = {
        identifier,
        titleName: answers.titleName,
        description: answers.description,
        organisationName: answers.organisationName,
        publicationStateCode: 'DRAFT',
        metadataDate: context.today,
        reviewFrequencyMonthQuantity: DEFAULT_REVIEW_FREQUENCY,
        systemCreatedDateTime: now,
        systemCreatedByUserId: context.persona.entraObjectId,
        systemUpdatedDateTime: now,
        systemUpdatedByUserId: context.persona.entraObjectId
      }
      return {
        change: { action: 'create', identifier, dataAsset },
        redirect: `${manageHref(identifier)}?created=yes`
      }
    }
  }
}

function reviewProblems(answers) {
  return answers.nextReviewDate < answers.lastReviewedDate
    ? [
        {
          name: 'nextReviewDate',
          text: 'The next review date must be the same as or after the date it was reviewed'
        }
      ]
    : []
}

// Working out the next review date waits for a later feature (LDAT-252,
// question 36), so the user enters it
function recordReview(context) {
  const people = peopleOptions(context.catalogue)
  return {
    heading: 'Record a review',
    fields: [
      dateField('lastReviewedDate', 'When was it reviewed?', {
        required: 'Enter the date it was reviewed',
        dateName: 'The date it was reviewed'
      }),
      radiosField('lastReviewedByName', 'Who reviewed it?', people, {
        required: 'Select who reviewed it'
      }),
      dateField('nextReviewDate', 'When is the next review due?', {
        required: 'Enter the date the next review is due',
        dateName: 'The date the next review is due'
      }),
      radiosField('approvedByName', 'Who approved it? (optional)', [
        ...people,
        OR_DIVIDER,
        { value: NOBODY, text: 'Nobody' }
      ])
    ],
    values: { lastReviewedDate: dateParts(context.today) },
    backHref: manageHref(context.identifier, 'review'),
    validate: reviewProblems,
    save(answers) {
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.lastReviewedDate = answers.lastReviewedDate
          dataAsset.lastReviewedByName = answers.lastReviewedByName
          dataAsset.nextReviewDate = answers.nextReviewDate
          dataAsset.approvedByName =
            answers.approvedByName === NOBODY
              ? undefined
              : answers.approvedByName
        }),
        redirect: manageHref(context.identifier, 'review')
      }
    }
  }
}

function stateChange(context, publicationStateCode, update) {
  return {
    action: publicationStateCode.toLowerCase(),
    identifier: context.identifier,
    dataAsset: editedDataAsset(
      context,
      (dataAsset) => {
        dataAsset.publicationStateCode = publicationStateCode
        update(dataAsset)
      },
      { backToDraft: false }
    )
  }
}

function replacementOptions(context) {
  return [
    ...context.catalogue.collections.dataAssets
      .filter(
        (dataAsset) =>
          dataAsset.identifier !== context.identifier && isVisible(dataAsset)
      )
      .map((dataAsset) => ({
        value: dataAsset.identifier,
        text: dataAsset.titleName,
        hint: dataAsset.identifier
      })),
    OR_DIVIDER,
    { value: NO_REPLACEMENT, text: 'No data asset replaces it' }
  ]
}

// Deprecated data assets stay visible, flagged as being replaced (S11).
// Choosing the replacement records a REPLACED_BY relationship (S16).
function deprecate(context) {
  const heading = 'Which data asset replaces it?'
  return {
    heading: `Deprecate ${context.dataAsset.titleName}`,
    allowed: () => context.dataAsset.publicationStateCode === 'PUBLISHED',
    warning:
      'Catalogue users will still see this data asset, with a label saying it is being replaced.',
    fields: [
      radiosField('replacement', heading, replacementOptions(context), {
        required:
          'Select the data asset that replaces it, or select that none does'
      })
    ],
    values: {},
    backHref: overviewHref(context),
    buttonText: 'Deprecate data asset',
    save(answers) {
      return {
        change: stateChange(context, 'DEPRECATED', (dataAsset) => {
          if (answers.replacement === NO_REPLACEMENT) {
            return
          }
          dataAsset.relationships = [
            ...(dataAsset.relationships ?? []).filter(
              (relationship) =>
                relationship.relationshipTypeCode !== 'REPLACED_BY'
            ),
            {
              targetResourceIdentifier: answers.replacement,
              relationshipTypeCode: 'REPLACED_BY'
            }
          ]
        }),
        redirect: `${overviewHref(context)}?changed=deprecated`
      }
    }
  }
}

const RETIRABLE_STATES = new Set(['DRAFT', 'PUBLISHED', 'DEPRECATED'])

function deletionFields(context) {
  if (context.dataAsset.publicationStateCode === 'DRAFT') {
    return []
  }
  return [
    radiosField('isDeleted', 'Has the data been deleted? (optional)', [
      {
        ...YES_NO_OPTIONS[0],
        conditional: dateField('deletionDate', 'When was it deleted?', {
          required: 'Enter the date the data was deleted',
          dateName: 'The date the data was deleted'
        })
      },
      YES_NO_OPTIONS[1]
    ])
  ]
}

// A draft is retired with no checks (LDAT-235, question 22). A retired data
// asset can't be published again (LDAT-252, question 26).
function retire(context) {
  return {
    heading: `Retire ${context.dataAsset.titleName}`,
    allowed: () => RETIRABLE_STATES.has(context.dataAsset.publicationStateCode),
    warning:
      'Catalogue users will no longer be able to find or see this data asset. You cannot publish it again.',
    fields: deletionFields(context),
    values: {},
    backHref: overviewHref(context),
    buttonText: 'Retire data asset',
    buttonClasses: 'govuk-button--warning',
    save(answers) {
      return {
        change: stateChange(context, 'RETIRED', (dataAsset) => {
          if (answers.isDeleted === 'yes') {
            dataAsset.deletionDate = answers.deletionDate
          }
        }),
        redirect: `${overviewHref(context)}?changed=retired`
      }
    }
  }
}

// Deleting a draft that other data assets link to would break their
// links, so the page says why it can't be deleted instead
function deleteBlocked(context, linking) {
  const { titleName } = context.dataAsset
  return {
    heading: `You cannot delete ${titleName}`,
    allowed: () => true,
    readOnly: true,
    fields: [],
    paragraphs: [
      `Other data assets link to ${titleName}, so deleting it would break their links:`
    ],
    list: linking.map((dataAsset) =>
      canSee(context, dataAsset)
        ? dataAsset.titleName
        : 'a data asset you do not manage'
    ),
    after: [
      'You can retire it instead. A catalogue administrator can remove the links.'
    ],
    links: [
      {
        href: manageHref(context.identifier, 'retire'),
        text: `Retire ${titleName}`
      },
      { href: overviewHref(context), text: `Return to ${titleName}` }
    ],
    backHref: overviewHref(context)
  }
}

// Drafts can be deleted, but once published, an entry can only be retired
// or deprecated, even after a change takes it back to Draft (LDAT-252,
// question 26). A deleted identifier is never issued again (S05).
export function canDelete(dataAsset) {
  return (
    dataAsset.publicationStateCode === 'DRAFT' &&
    dataAsset.acceptanceDate === undefined
  )
}

function deleteDraft(context) {
  if (!canDelete(context.dataAsset)) {
    throw new NotFoundError()
  }
  const linking = linkingDataAssets(context)
  if (linking.length > 0) {
    return deleteBlocked(context, linking)
  }
  const heading = `Are you sure you want to delete ${context.dataAsset.titleName}?`
  return {
    heading,
    fields: [
      radiosField('confirm', heading, YES_NO_OPTIONS, {
        classes: 'govuk-radios--inline',
        required: `Select yes if you want to delete ${context.dataAsset.titleName}`
      })
    ],
    buttonText: 'Continue',
    values: {},
    backHref: overviewHref(context),
    save(answers) {
      if (answers.confirm !== 'yes') {
        return { redirect: overviewHref(context) }
      }
      return {
        change: { action: 'delete', identifier: context.identifier },
        redirect: `/manage/data-assets?deleted=${context.identifier}`
      }
    }
  }
}

export const ACTION_ROUTES = Object.freeze({
  'review/record': recordReview,
  deprecate,
  retire,
  delete: deleteDraft
})

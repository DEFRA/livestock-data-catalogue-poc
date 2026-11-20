import {
  outstandingForPublication,
  publicationChecks
} from '../../schemas/catalogue/publication.js'
import { checkAnswers, readAnswers } from '../forms.js'
import { isMaterialAttribute } from '../history.js'
import { isVisible } from '../visibility.js'
import { SessionFullError, commitChange } from '../working-copy.js'
import { NotFoundError, isEditable } from './context.js'

// A question page is defined by a function of the page's context, which
// returns:
// - heading, fields, values (the answers to show first), backHref
// - save(values): what to change, and where to go next
// - optionally caption, paragraphs, warning, inset, buttonText, validate
//   (checks that need more than one answer or other records), allowed
//   (whether the page exists for this data asset and persona; by default
//   only draft, published and deprecated data assets can be changed), and
//   changes (the data asset attributes the page changes, which say whether
//   saving it is a material change)
// - or readOnly, with a list, more paragraphs after it and links, for a
//   page that explains why something can't be done. It has no form.

const SESSION_FULL =
  'This prototype session cannot hold any more changes. Reset the prototype in Prototype settings to start again'

function pageFor(definePage, req) {
  const page = definePage(req.manage)
  const allowed = page.allowed ?? isEditable
  if (!allowed(req.manage)) {
    throw new NotFoundError()
  }
  return page
}

function errorHref(page, error) {
  const field = page.fields.find((candidate) => candidate.name === error.name)
  return field?.type === 'date' ? `#${error.name}-day` : `#${error.name}`
}

export const BACK_TO_DRAFT_WARNING =
  'Saving a change will take this data asset out of the catalogue until you publish it again.'

const LIVE_CHANGE_INSET =
  'Catalogue users will see this change as soon as you save it.'

const STILL_VISIBLE = 'Catalogue users can still see this data asset, so'

// What a data asset catalogue users can see must keep having, in words
const STILL_NEEDED = new Map([
  [
    'DATA_OWNER',
    `${STILL_VISIBLE} it must have a data owner. To change who it is, use Change the data owner`
  ],
  [
    'DATA_STEWARD',
    `${STILL_VISIBLE} it must have a data steward. Add another data steward before you end this one`
  ],
  ['distributions', `${STILL_VISIBLE} it must have at least 1 distribution`]
])

const STILL_COMPLETE = `${STILL_VISIBLE} it must keep everything it needs to be published`

// Only a material change sends a published data asset back to Draft
// (LDAT-252, answer 41), so only a page that makes one says so before the
// first change. A page that makes material and other changes names the
// material ones, which are its fields of the same names. A page that
// doesn't say what it changes warns, to be safe.
function publishedWarning(context, page) {
  if (context.dataAsset?.publicationStateCode !== 'PUBLISHED') {
    return undefined
  }
  if (page.changes === undefined) {
    return BACK_TO_DRAFT_WARNING
  }
  const material = page.changes.filter(isMaterialAttribute)
  if (material.length === 0) {
    return undefined
  }
  if (material.length === page.changes.length) {
    return BACK_TO_DRAFT_WARNING
  }
  const labels = page.fields
    .filter((field) => material.includes(field.name))
    .map((field) => `“${field.label}”`)
  return `Changing your answer to ${labels.join(' or ')} will take this data asset out of the catalogue until you publish it again.`
}

// A change to a data asset that stays in the catalogue, such as any change
// to a deprecated one (LDAT-252, answer 42), is seen straight away
function liveChangeInset(context) {
  return context.dataAsset && isVisible(context.dataAsset)
    ? LIVE_CHANGE_INSET
    : undefined
}

// A data asset that catalogue users can still see after a change must
// still pass the S26 checks it passed before, as the working copy's rules
// require, so the page says what it needs instead of saving the change.
// Checks it already failed don't count, as in the working copy.
function stillCompleteProblems(context, page, change) {
  const after = change?.dataAsset
  if (after === undefined || !isVisible(after)) {
    return []
  }
  const { today } = context
  const known = new Set(outstandingForPublication(context.dataAsset, { today }))
  const texts = publicationChecks(after, { today })
    .filter((check) => !known.has(check.message))
    .map(
      (check) =>
        STILL_NEEDED.get(check.field) ??
        STILL_NEEDED.get(check.kind) ??
        STILL_COMPLETE
    )
  return [...new Set(texts)].map((text) => ({
    name: page.fields[0].name,
    text
  }))
}

function render(res, context, page, values, errors) {
  const warning = page.warning ?? publishedWarning(context, page)
  res.render('manage/question', {
    navigationItem: 'manage',
    pageName: page.heading,
    hasErrors: errors.length > 0,
    errorList: errors.map((error) => ({
      text: error.text,
      href: error.href ?? errorHref(page, error)
    })),
    // A date's error also says which of its boxes to highlight
    errorTexts: Object.fromEntries(
      errors.flatMap((error) => [
        [error.name, error.text],
        ...(error.parts ? [[`${error.name}-parts`, error.parts]] : [])
      ])
    ),
    values,
    heading: page.heading,
    // One question that is the page's purpose is its heading, as the
    // question pages pattern says. Otherwise the page has its own heading.
    isQuestionHeading:
      page.fields.length === 1 && page.fields[0].label === page.heading,
    caption: page.caption ?? context.dataAsset?.titleName,
    fields: page.fields,
    paragraphs: page.paragraphs ?? [],
    warning,
    inset: page.inset ?? (warning ? undefined : liveChangeInset(context)),
    buttonText: page.buttonText ?? 'Save and continue',
    buttonClasses: page.buttonClasses,
    backHref: page.backHref,
    readOnly: page.readOnly,
    list: page.list ?? [],
    after: page.after ?? [],
    links: page.links ?? []
  })
}

export function questionPage(definePage) {
  return {
    show(req, res) {
      const page = pageFor(definePage, req)
      render(res, req.manage, page, page.values ?? {}, [])
    },
    save(req, res) {
      const page = pageFor(definePage, req)
      if (page.readOnly) {
        throw new NotFoundError()
      }
      const raw = readAnswers(req.body, page.fields)
      const { values, errors } = checkAnswers(page.fields, raw, req)
      const problems =
        errors.length > 0 ? errors : (page.validate?.(values) ?? [])
      if (problems.length > 0) {
        render(res, req.manage, page, raw, problems)
        return
      }
      const { change, redirect } = page.save(values)
      const incomplete = stillCompleteProblems(req.manage, page, change)
      if (incomplete.length > 0) {
        render(res, req.manage, page, raw, incomplete)
        return
      }
      try {
        if (change) {
          commitChange(req, change)
        }
      } catch (error) {
        if (!(error instanceof SessionFullError)) {
          throw error
        }
        render(res, req.manage, page, raw, [
          { name: page.fields[0].name, text: SESSION_FULL }
        ])
        return
      }
      res.redirect(303, redirect)
    }
  }
}

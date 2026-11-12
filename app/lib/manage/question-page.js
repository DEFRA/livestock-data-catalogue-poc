import { TamperedFormError, checkAnswers, readAnswers } from '../forms.js'
import { logEvent } from '../log.js'
import { commitChange } from '../working-copy.js'
import { NotFoundError, isEditable } from './context.js'

// A question page is defined by a function of the page's context, which
// returns:
// - heading, fields, values (the answers to show first), backHref
// - save(values): what to change, and where to go next
// - optionally caption, paragraphs, warning, inset, buttonText, validate
//   (checks that need more than one answer or other records), and allowed
//   (whether the page exists for this data asset and persona; by default
//   only drafts and published data assets can be changed)

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

function render(res, context, page, values, errors) {
  res.render('manage/question', {
    navigationItem: 'manage',
    pageName: page.heading,
    hasErrors: errors.length > 0,
    errorList: errors.map((error) => ({
      text: error.text,
      href: error.href ?? errorHref(page, error)
    })),
    errorTexts: Object.fromEntries(
      errors.map((error) => [error.name, error.text])
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
    warning: page.warning,
    inset: page.inset,
    buttonText: page.buttonText ?? 'Save and continue',
    buttonClasses: page.buttonClasses,
    backHref: page.backHref,
    cancelHref: page.cancelHref
  })
}

function readForm(req, page) {
  try {
    return readAnswers(req.body, page.fields)
  } catch (error) {
    if (error instanceof TamperedFormError) {
      logEvent({
        level: 'warn',
        message: 'Form refused: it had fields the page does not send',
        event: { category: ['web'], type: ['denied'], outcome: 'failure' },
        req
      })
    }
    throw error
  }
}

export function questionPage(definePage) {
  return {
    show(req, res) {
      const page = pageFor(definePage, req)
      render(res, req.manage, page, page.values ?? {}, [])
    },
    save(req, res) {
      const page = pageFor(definePage, req)
      const raw = readForm(req, page)
      const { values, errors } = checkAnswers(page.fields, raw, req)
      const problems =
        errors.length > 0 ? errors : (page.validate?.(values) ?? [])
      if (problems.length > 0) {
        render(res, req.manage, page, raw, problems)
        return
      }
      const { change, redirect } = page.save(values)
      if (change) {
        commitChange(req, change)
      }
      res.redirect(303, redirect)
    }
  }
}

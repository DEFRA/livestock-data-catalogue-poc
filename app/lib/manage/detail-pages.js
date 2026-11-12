import { editChange, manageHref } from './context.js'
import {
  checkboxesField,
  dateField,
  dateParts,
  longTextField,
  peopleOptions,
  radiosField,
  referenceOptions,
  sameTextIgnoringCase,
  textField
} from './fields.js'

// The questions in the sections that describe a data asset (section 6.6 of
// the journeys 2 and 3 plan). Each answer is saved straight away, then the
// user goes back to the section's summary.

const MOST_KEYWORDS = 30
const LONGEST_KEYWORD = 200

// A question page in a section: its fields, the answers it shows first,
// any checks that need more than one answer, and how it changes the data
// asset
export function sectionQuestion(section, definition) {
  return (context) => {
    const fields = definition.fields(context)
    return {
      heading: definition.heading ?? fields[0].label,
      fields,
      values: definition.values(context.dataAsset),
      backHref: manageHref(context.identifier, section),
      validate:
        definition.validate &&
        ((answers) => definition.validate(answers, context)),
      save(answers) {
        return {
          change: editChange(context, (dataAsset) =>
            definition.update(dataAsset, answers)
          ),
          redirect: manageHref(context.identifier, section)
        }
      }
    }
  }
}

// A question with one field, saved as it is in the field of the same name
export function fieldQuestion(section, makeField, { validate } = {}) {
  return (context) => {
    const field = makeField(context)
    return sectionQuestion(section, {
      fields: () => [field],
      values: (dataAsset) => ({ [field.name]: dataAsset[field.name] }),
      validate,
      update(dataAsset, answers) {
        dataAsset[field.name] = answers[field.name]
      }
    })(context)
  }
}

function datesQuestion(section, definition) {
  return sectionQuestion(section, {
    ...definition,
    values: (dataAsset) =>
      Object.fromEntries(
        definition.dateFields.map((name) => [name, dateParts(dataAsset[name])])
      ),
    update(dataAsset, answers) {
      for (const name of definition.dateFields) {
        dataAsset[name] = answers[name]
      }
    }
  })
}

export const TITLE_IN_USE = 'A data asset with this title already exists'

export function isTitleInUse(catalogue, title, identifier) {
  return catalogue.collections.dataAssets.some(
    (dataAsset) =>
      dataAsset.identifier !== identifier &&
      sameTextIgnoringCase(dataAsset.titleName, title)
  )
}

export function titleField(label = 'What is the data asset called?') {
  return textField('titleName', label, {
    errorName: 'Title',
    hint: 'Use a name people will recognise, for example Animal Movement',
    classes: 'govuk-!-width-full',
    required: 'Enter a title'
  })
}

export function descriptionField(label = 'Describe the data asset') {
  return longTextField('description', label, {
    errorName: 'Description',
    hint: 'Say what data it contains, why it exists and how it can be used',
    required: 'Enter a description'
  })
}

function titleNotInUse(answers, context) {
  return isTitleInUse(context.catalogue, answers.titleName, context.identifier)
    ? [{ name: 'titleName', text: TITLE_IN_USE }]
    : []
}

const about = {
  title: fieldQuestion('about', () => titleField(), {
    validate: titleNotInUse
  }),
  description: fieldQuestion('about', () => descriptionField()),
  type: fieldQuestion('about', ({ catalogue }) =>
    radiosField(
      'dataAssetTypeCode',
      'What type of data is it?',
      referenceOptions(catalogue, 'dataAssetTypes', { withHints: true }),
      { required: 'Select the type of data' }
    )
  ),
  domain: fieldQuestion('about', ({ catalogue }) =>
    radiosField(
      'domainCode',
      'Which livestock domain is it in?',
      referenceOptions(catalogue, 'domains'),
      { required: 'Select the domain' }
    )
  ),
  version: fieldQuestion('about', () =>
    textField('versionNumber', 'What version is it? (optional)', {
      errorName: 'Version',
      hint: 'For example, 2.3',
      classes: 'govuk-input--width-10'
    })
  )
}

// One keyword a line. Blank lines are ignored, and a repeat, ignoring case,
// is kept once (S14, LDAT-235 question 19).
export function keywordLines(text = '') {
  const keywords = []
  for (const line of text.split(/\r?\n/)) {
    const keyword = line.trim()
    if (
      keyword !== '' &&
      !keywords.some((known) => sameTextIgnoringCase(known, keyword))
    ) {
      keywords.push(keyword)
    }
  }
  return keywords
}

function keywordsCheck(text) {
  const keywords = keywordLines(text)
  if (keywords.some((keyword) => keyword.length > LONGEST_KEYWORD)) {
    return 'Each keyword must be 200 characters or fewer'
  }
  return keywords.length > MOST_KEYWORDS
    ? `Enter ${MOST_KEYWORDS} keywords or fewer`
    : undefined
}

// An existing keyword is reused, with its own spelling and language. A new
// one is created in English, the default (S14, LDAT-235 question 18).
export function resolveKeywords(catalogue, names) {
  const known = catalogue.collections.keywords
  const added = []
  const resolved = names.map((name) => {
    const existing = known.find((keyword) =>
      sameTextIgnoringCase(keyword.name, name)
    )
    if (existing) {
      return existing.name
    }
    added.push({ name, languageCode: 'en' })
    return name
  })
  return { names: resolved, added }
}

function keywordsQuestion(context) {
  return {
    heading: 'Add keywords',
    fields: [
      {
        type: 'textarea',
        name: 'keywords',
        label: 'Add keywords',
        hint: 'Enter each keyword on a new line, for example cattle',
        rows: 6,
        required: 'Enter at least one keyword',
        check: keywordsCheck
      }
    ],
    values: { keywords: (context.dataAsset.keywordNames ?? []).join('\n') },
    backHref: manageHref(context.identifier, 'classification'),
    save(answers) {
      const keywords = resolveKeywords(
        context.catalogue,
        keywordLines(answers.keywords)
      )
      return {
        change: editChange(
          context,
          (dataAsset) => {
            dataAsset.keywordNames = keywords.names
          },
          { keywords: keywords.added }
        ),
        redirect: manageHref(context.identifier, 'classification')
      }
    }
  }
}

const classification = {
  categories: fieldQuestion('classification', ({ catalogue }) =>
    checkboxesField(
      'categoryCodes',
      'Which categories describe this data asset?',
      referenceOptions(catalogue, 'categories'),
      {
        hint: 'Select all that apply',
        required: 'Select at least one category'
      }
    )
  ),
  keywords: keywordsQuestion,
  jurisdictions: fieldQuestion('classification', ({ catalogue }) =>
    checkboxesField(
      'jurisdictionCodes',
      'Where does this data asset apply?',
      referenceOptions(catalogue, 'jurisdictions'),
      {
        hint: 'Select all that apply',
        required: 'Select at least one jurisdiction'
      }
    )
  )
}

const status = {
  lifecycle: fieldQuestion('status', ({ catalogue }) =>
    radiosField(
      'lifecycleStateCode',
      'What stage is the data asset at?',
      referenceOptions(catalogue, 'dataAssetLifecycleStates', {
        withHints: true
      }),
      {
        hint: 'This is about the data itself, not this catalogue entry',
        required: 'Select the stage the data asset is at'
      }
    )
  ),
  'update-frequency': fieldQuestion('status', ({ catalogue }) =>
    radiosField(
      'updateFrequencyCode',
      'How often is the data updated?',
      referenceOptions(catalogue, 'updateFrequencies'),
      { required: 'Select how often the data is updated' }
    )
  )
}

const accessAndProvenance = {
  'access-rights': fieldQuestion('access-and-provenance', () =>
    longTextField(
      'accessRightsDescription',
      'Who can access and use the data?',
      {
        errorName: 'Access rights',
        hint: 'Say whether it is open, restricted or shared under an agreement, and who can use it',
        required: 'Enter who can access and use the data'
      }
    )
  ),
  provenance: fieldQuestion('access-and-provenance', () =>
    longTextField('provenanceDescription', 'Where does the data come from?', {
      errorName: 'Provenance',
      hint: 'Say where it comes from, who has held it and how it has been changed',
      required: 'Enter where the data comes from'
    })
  ),
  // The creator is a person, chosen from the list (LDAT-252, question 38)
  creator: fieldQuestion('access-and-provenance', ({ catalogue }) =>
    radiosField(
      'creatorReference',
      'Who created the data?',
      peopleOptions(catalogue),
      {
        hint: 'The person who first produced it',
        required: 'Select who created the data'
      }
    )
  )
}

// S06: the date the data last changed, and the date it was accepted,
// can't be before the date it was created. Dates saved on other pages
// count too.
function creationOrderProblems(answers, { dataAsset }) {
  const created = answers.creationDate ?? dataAsset.creationDate
  const changed = answers.modificationDate ?? dataAsset.modificationDate
  const accepted = dataAsset.acceptanceDate
  const problems = []
  if (created && accepted && accepted < created) {
    problems.push({
      name: 'creationDate',
      text: 'The date the data asset was created must be the same as or before the date it was accepted'
    })
  }
  if (created && changed && changed < created) {
    problems.push(
      answers.modificationDate
        ? {
            name: 'modificationDate',
            text: 'The date the data was last changed must be the same as or after the date it was created'
          }
        : {
            name: 'creationDate',
            text: 'The date the data asset was created must be the same as or before the date the data was last changed'
          }
    )
  }
  return problems
}

function laterDateProblem(answers, later, earlier, text) {
  return answers[later] && answers[earlier] && answers[later] < answers[earlier]
    ? [{ name: later, text }]
    : []
}

const dates = {
  created: datesQuestion('dates', {
    dateFields: ['creationDate'],
    fields: () => [
      dateField('creationDate', 'When was the data asset created?', {
        required: 'Enter the date the data asset was created',
        dateName: 'The date the data asset was created'
      })
    ],
    validate: creationOrderProblems
  }),
  'last-changed': datesQuestion('dates', {
    dateFields: ['modificationDate'],
    fields: () => [
      dateField('modificationDate', 'When was the data last changed?', {
        hint: 'The last change to the data itself, not to this catalogue entry. For example, 27 3 2024',
        required: 'Enter the date the data was last changed',
        dateName: 'The date the data was last changed'
      })
    ],
    validate: creationOrderProblems
  }),
  valid: datesQuestion('dates', {
    heading: 'When is the data asset valid?',
    dateFields: ['validFromDate', 'validToDate'],
    fields: () => [
      dateField('validFromDate', 'Valid from', {
        required: 'Enter the date the data asset is valid from',
        dateName: 'The date the data asset is valid from'
      }),
      dateField('validToDate', 'Valid to (optional)', {
        hint: 'Leave this blank if it has no end date. For example, 27 3 2024',
        dateName: 'The date the data asset is valid to'
      })
    ],
    validate: (answers) =>
      laterDateProblem(
        answers,
        'validToDate',
        'validFromDate',
        'The date the data asset is valid to must be the same as or after the date it is valid from'
      )
  }),
  coverage: datesQuestion('dates', {
    heading: 'What period does the data cover? (optional)',
    dateFields: ['coverageStartDate', 'coverageEndDate'],
    fields: () => [
      dateField('coverageStartDate', 'From', {
        dateName: 'The start of the period'
      }),
      dateField('coverageEndDate', 'To', { dateName: 'The end of the period' })
    ],
    validate: (answers) =>
      laterDateProblem(
        answers,
        'coverageEndDate',
        'coverageStartDate',
        'The end of the period must be the same as or after the start'
      )
  }),
  area: fieldQuestion('dates', () =>
    textField(
      'spatialCoverageDescription',
      'What area does the data cover? (optional)',
      { errorName: 'Area', hint: 'For example, England' }
    )
  )
}

function reviewFrequencyCheck(text) {
  if (!/^\d+$/.test(text)) {
    return 'Enter the review frequency as a whole number of months'
  }
  const months = Number(text)
  if (months < 1) {
    return 'Review frequency must be at least 1 month'
  }
  return months > 120
    ? 'Review frequency must be 120 months or fewer'
    : undefined
}

const review = {
  frequency: sectionQuestion('review', {
    fields: () => [
      textField(
        'reviewFrequencyMonthQuantity',
        'How often should this entry be reviewed? (optional)',
        {
          errorName: 'Review frequency',
          classes: 'govuk-input--width-3',
          inputmode: 'numeric',
          suffix: 'months',
          check: reviewFrequencyCheck
        }
      )
    ],
    values: (dataAsset) => ({
      reviewFrequencyMonthQuantity:
        dataAsset.reviewFrequencyMonthQuantity === undefined
          ? ''
          : String(dataAsset.reviewFrequencyMonthQuantity)
    }),
    update(dataAsset, answers) {
      dataAsset.reviewFrequencyMonthQuantity =
        answers.reviewFrequencyMonthQuantity === undefined
          ? undefined
          : Number(answers.reviewFrequencyMonthQuantity)
    }
  })
}

export const DETAIL_QUESTIONS = Object.freeze({
  about,
  classification,
  status,
  'access-and-provenance': accessAndProvenance,
  dates,
  review
})

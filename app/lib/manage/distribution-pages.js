import { referenceValue } from '../reference-data.js'
import { editChange, itemAt, manageHref, systemDateTime } from './context.js'
import {
  OR_DIVIDER,
  YES_NO_OPTIONS,
  addressField,
  longTextField,
  radiosField,
  referenceOptions,
  sameTextIgnoringCase,
  textField
} from './fields.js'

// Distributions (S18 to S24). Adding one saves it after its name, which
// is all S18 needs, then asks each question in turn. Changing one goes
// back to the distributions summary.

const MOST_DISTRIBUTIONS = 20

// The questions in the order they're asked when a distribution is added
const ADDING_ORDER = Object.freeze([
  'type',
  'access-method',
  'format',
  'authentication',
  'licence',
  'addresses',
  'data-service',
  'version-and-size'
])

const ADDING = 'adding=yes'
const NONE = 'none'
const NEW_DATA_SERVICE = 'new'

function summaryHref(context) {
  return manageHref(context.identifier, 'distributions')
}

function isAdding(context) {
  return context.req.query.adding === 'yes'
}

function questionHref(context, position, question, adding) {
  const href = manageHref(
    context.identifier,
    'distributions',
    String(position),
    question
  )
  return adding ? `${href}?${ADDING}` : href
}

// After a question: the next one when adding, otherwise the summary
function nextHref(context, position, question) {
  const next = ADDING_ORDER[ADDING_ORDER.indexOf(question) + 1]
  return isAdding(context) && next
    ? questionHref(context, position, next, true)
    : summaryHref(context)
}

function backHref(context, position, question) {
  const previous = ADDING_ORDER[ADDING_ORDER.indexOf(question) - 1]
  if (!isAdding(context)) {
    return summaryHref(context)
  }
  return previous
    ? questionHref(context, position, previous, true)
    : questionHref(context, position, 'name')
}

function isNameInUse(dataAsset, name, ignoredPosition) {
  return (dataAsset.distributions ?? []).some(
    (distribution, position) =>
      position !== ignoredPosition &&
      sameTextIgnoringCase(distribution.name, name)
  )
}

function nameFields() {
  return [
    textField('name', 'Name', {
      errorName: 'Name',
      hint: 'For example, Movements API',
      required: 'Enter a name for the distribution'
    }),
    longTextField('description', 'Description (optional)', {
      errorName: 'Description'
    })
  ]
}

const NAME_IN_USE = 'This data asset already has a distribution with this name'

function addDistribution(context) {
  const distributions = context.dataAsset.distributions ?? []
  return {
    heading: 'What is the distribution called?',
    fields: nameFields(),
    values: {},
    backHref: summaryHref(context),
    validate(answers) {
      if (distributions.length >= MOST_DISTRIBUTIONS) {
        return [
          {
            name: 'name',
            text: `A data asset can have up to ${MOST_DISTRIBUTIONS} distributions`
          }
        ]
      }
      return isNameInUse(context.dataAsset, answers.name)
        ? [{ name: 'name', text: NAME_IN_USE }]
        : []
    },
    save(answers) {
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.distributions = [
            ...distributions,
            { name: answers.name, description: answers.description }
          ].map(withoutEmptyFields)
        }),
        redirect: questionHref(
          context,
          distributions.length,
          ADDING_ORDER[0],
          true
        )
      }
    }
  }
}

function withoutEmptyFields(distribution) {
  return Object.fromEntries(
    Object.entries(distribution).filter(([, value]) => value !== undefined)
  )
}

// A question about one distribution, which updates its fields
function distributionQuestion(question, definition) {
  return (context) => {
    const { item, position } = itemAt(
      context.dataAsset.distributions,
      context.req.params.position
    )
    const fields = definition.fields(context, item)
    return {
      heading: definition.heading ?? fields[0].label,
      caption: `${context.dataAsset.titleName}: ${item.name}`,
      fields,
      values: definition.values(item),
      backHref: backHref(context, position, question),
      validate:
        definition.validate &&
        ((answers) => definition.validate(answers, context, position)),
      save(answers) {
        const elsewhere = definition.redirectInstead?.(
          answers,
          context,
          position
        )
        if (elsewhere) {
          return { redirect: elsewhere }
        }
        return {
          change: editChange(context, (dataAsset) => {
            dataAsset.distributions[position] = withoutEmptyFields(
              definition.update(dataAsset.distributions[position], answers)
            )
          }),
          redirect: nextHref(context, position, question)
        }
      }
    }
  }
}

function codeQuestion(question, fieldName, makeField) {
  return distributionQuestion(question, {
    fields: (context) => [makeField(context)],
    values: (distribution) => ({ [fieldName]: distribution[fieldName] }),
    update: (distribution, answers) => ({
      ...distribution,
      [fieldName]: answers[fieldName]
    })
  })
}

function formatOptions(catalogue) {
  return referenceOptions(catalogue, 'distributionFormats').map((option) => ({
    ...option,
    hint: referenceValue(catalogue, 'distributionFormats', option.value)
      .mediaType
  }))
}

function authenticationOptions(catalogue) {
  const options = referenceOptions(catalogue, 'authenticationMethods')
  return [
    ...options.filter((option) => option.value !== 'NONE'),
    OR_DIVIDER,
    ...options.filter((option) => option.value === 'NONE')
  ]
}

function licenceOptions(catalogue) {
  return referenceOptions(catalogue, 'licences').map((option) => {
    const licence = referenceValue(catalogue, 'licences', option.value)
    return {
      ...option,
      text: licence.versionNumber
        ? `${licence.name} ${licence.versionNumber}`
        : licence.name,
      hint:
        option.value === 'NOT_APPLICABLE'
          ? 'Use this only where normal licensing does not apply'
          : undefined
    }
  })
}

function addressFields(distribution) {
  const fields = [
    addressField('accessReference', 'Access address (optional)', {
      errorName: 'Access address',
      example: 'https://api.example.com/movements'
    }),
    addressField('downloadReference', 'Download address (optional)', {
      errorName: 'Download address',
      example: 'https://www.example.com/movements.csv'
    })
  ]
  // A broker and topic only apply to an event stream (S18)
  if (distribution.distributionTypeCode === 'EVENT_STREAM') {
    fields.push(
      addressField('brokerReference', 'Broker address (optional)', {
        errorName: 'Broker address',
        example: 'amqps://broker.example.com'
      }),
      textField('topicName', 'Topic (optional)', { errorName: 'Topic' })
    )
  }
  return fields
}

function dataServiceOptions(catalogue) {
  return [
    ...catalogue.collections.dataServices.map((service) => ({
      value: service.titleName,
      text: service.titleName,
      hint: service.endpointReference
    })),
    OR_DIVIDER,
    { value: NONE, text: 'None' },
    { value: NEW_DATA_SERVICE, text: 'Add a new data service' }
  ]
}

function sizeCheck(text) {
  if (/^-\d+$/.test(text)) {
    return 'Size cannot be negative'
  }
  return /^\d{1,15}$/.test(text)
    ? undefined
    : 'Size must be a whole number of bytes'
}

const QUESTIONS = {
  name: distributionQuestion('name', {
    heading: 'What is the distribution called?',
    fields: () => nameFields(),
    values: (distribution) => ({
      name: distribution.name,
      description: distribution.description
    }),
    validate: (answers, context, position) =>
      isNameInUse(context.dataAsset, answers.name, position)
        ? [{ name: 'name', text: NAME_IN_USE }]
        : [],
    update: (distribution, answers) => ({
      ...distribution,
      name: answers.name,
      description: answers.description
    })
  }),
  type: codeQuestion('type', 'distributionTypeCode', ({ catalogue }) =>
    radiosField(
      'distributionTypeCode',
      'What type of distribution is it?',
      referenceOptions(catalogue, 'distributionTypes'),
      { required: 'Select the type of distribution' }
    )
  ),
  'access-method': codeQuestion(
    'access-method',
    'accessMethodCode',
    ({ catalogue }) =>
      radiosField(
        'accessMethodCode',
        'How is it accessed?',
        referenceOptions(catalogue, 'accessMethods'),
        { required: 'Select how it is accessed' }
      )
  ),
  format: codeQuestion('format', 'distributionFormatCode', ({ catalogue }) =>
    radiosField(
      'distributionFormatCode',
      'What format is the data in?',
      formatOptions(catalogue),
      { required: 'Select the format' }
    )
  ),
  authentication: codeQuestion(
    'authentication',
    'authenticationMethodCode',
    ({ catalogue }) =>
      radiosField(
        'authenticationMethodCode',
        'What authentication does it need?',
        authenticationOptions(catalogue),
        { required: 'Select the authentication it needs, or select None' }
      )
  ),
  licence: codeQuestion('licence', 'licenceCode', ({ catalogue }) =>
    radiosField(
      'licenceCode',
      'Which licence applies?',
      licenceOptions(catalogue),
      {
        required: 'Select the licence'
      }
    )
  ),
  addresses: distributionQuestion('addresses', {
    heading: 'Where can people get it?',
    fields: (context, distribution) => addressFields(distribution),
    values: (distribution) => ({
      accessReference: distribution.accessReference,
      downloadReference: distribution.downloadReference,
      brokerReference: distribution.brokerReference,
      topicName: distribution.topicName
    }),
    update: (distribution, answers) => ({
      ...distribution,
      accessReference: answers.accessReference,
      downloadReference: answers.downloadReference,
      brokerReference: answers.brokerReference,
      topicName: answers.topicName
    })
  }),
  'data-service': distributionQuestion('data-service', {
    fields: ({ catalogue }) => [
      radiosField(
        'dataServiceTitleName',
        'Which data service delivers it?',
        dataServiceOptions(catalogue),
        { required: 'Select the data service, or select None' }
      )
    ],
    values: (distribution) => ({
      dataServiceTitleName: distribution.dataServiceTitleName ?? ''
    }),
    redirectInstead: (answers, context, position) =>
      answers.dataServiceTitleName === NEW_DATA_SERVICE &&
      questionHref(context, position, 'add-data-service', isAdding(context)),
    update: (distribution, answers) => ({
      ...distribution,
      dataServiceTitleName:
        answers.dataServiceTitleName === NONE
          ? undefined
          : answers.dataServiceTitleName
    })
  }),
  'version-and-size': distributionQuestion('version-and-size', {
    heading: 'Version and size (optional)',
    fields: () => [
      textField('versionNumber', 'Version (optional)', {
        errorName: 'Version',
        classes: 'govuk-input--width-10'
      }),
      textField('byteSizeQuantity', 'Size (optional)', {
        errorName: 'Size',
        classes: 'govuk-input--width-10',
        inputmode: 'numeric',
        suffix: 'bytes',
        check: sizeCheck
      })
    ],
    values: (distribution) => ({
      versionNumber: distribution.versionNumber,
      byteSizeQuantity:
        distribution.byteSizeQuantity === undefined
          ? ''
          : String(distribution.byteSizeQuantity)
    }),
    update: (distribution, answers) => ({
      ...distribution,
      versionNumber: answers.versionNumber,
      byteSizeQuantity:
        answers.byteSizeQuantity === undefined
          ? undefined
          : Number(answers.byteSizeQuantity)
    })
  })
}

function isDataServiceTitleInUse(catalogue, title) {
  return catalogue.collections.dataServices.some((service) =>
    sameTextIgnoringCase(service.titleName, title)
  )
}

// A data steward can add a data service with just its title and endpoint
// (LDAT-252, question 33)
function addDataService(context) {
  const { position } = itemAt(
    context.dataAsset.distributions,
    context.req.params.position
  )
  return {
    heading: 'Add a new data service',
    caption: context.dataAsset.titleName,
    fields: [
      textField('titleName', 'Title', {
        hint: 'For example, Livestock Movements API',
        required: 'Enter a title'
      }),
      addressField('endpointReference', 'Endpoint address', {
        example: 'https://api.example.com/movements',
        required: 'Enter the endpoint address'
      })
    ],
    values: {},
    backHref: questionHref(
      context,
      position,
      'data-service',
      isAdding(context)
    ),
    validate: (answers) =>
      isDataServiceTitleInUse(context.catalogue, answers.titleName)
        ? [
            {
              name: 'titleName',
              text: 'A data service with this title already exists'
            }
          ]
        : [],
    save(answers) {
      const now = systemDateTime()
      const dataService = {
        titleName: answers.titleName,
        endpointReference: answers.endpointReference,
        systemCreatedDateTime: now,
        systemCreatedByUserId: context.persona.entraObjectId,
        systemUpdatedDateTime: now,
        systemUpdatedByUserId: context.persona.entraObjectId
      }
      return {
        change: editChange(
          context,
          (dataAsset) => {
            dataAsset.distributions[position].dataServiceTitleName =
              answers.titleName
          },
          { dataServices: [dataService] }
        ),
        redirect: nextHref(context, position, 'data-service')
      }
    }
  }
}

function removeDistribution(context) {
  const { item, position } = itemAt(
    context.dataAsset.distributions,
    context.req.params.position
  )
  const heading = `Are you sure you want to remove ${item.name}?`
  return {
    heading,
    fields: [
      radiosField('confirm', heading, YES_NO_OPTIONS, {
        classes: 'govuk-radios--inline',
        required: `Select yes if you want to remove ${item.name}`
      })
    ],
    values: {},
    backHref: summaryHref(context),
    save(answers) {
      if (answers.confirm !== 'yes') {
        return { redirect: summaryHref(context) }
      }
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.distributions = dataAsset.distributions.filter(
            (_, index) => index !== position
          )
        }),
        redirect: summaryHref(context)
      }
    }
  }
}

export const DISTRIBUTION_ROUTES = Object.freeze({
  'distributions/add': addDistribution,
  ...Object.fromEntries(
    Object.entries(QUESTIONS).map(([question, page]) => [
      `distributions/:position/${question}`,
      page
    ])
  ),
  'distributions/:position/add-data-service': addDataService,
  'distributions/:position/remove': removeDistribution
})

import { isDataAssetIdentifier } from '../identifiers.js'
import { nameFor } from '../reference-data.js'
import {
  canSee,
  editChange,
  itemAt,
  manageHref,
  systemDateTime
} from './context.js'
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

// The information asset that governs a data asset (S25), and the
// resources it's related to (S16)

const NEW_INFORMATION_ASSET = 'new'
const EXTERNAL = 'external'
const MOST_RELATIONSHIPS = 20

function informationAssetHref(context) {
  return manageHref(context.identifier, 'information-asset')
}

function relatedHref(context) {
  return manageHref(context.identifier, 'related-resources')
}

function informationAssetOptions(catalogue) {
  return [
    ...catalogue.collections.informationAssets.map((informationAsset) => ({
      value: informationAsset.name,
      text: informationAsset.name,
      hint: `${nameFor(catalogue, 'securityClassifications', informationAsset.securityClassificationCode)}, kept for ${informationAsset.retentionPeriodDescription}`
    })),
    OR_DIVIDER,
    { value: NEW_INFORMATION_ASSET, text: 'Add a new information asset' }
  ]
}

function chooseInformationAsset(context) {
  const heading = 'Which information asset governs this data asset?'
  return {
    heading,
    fields: [
      radiosField(
        'informationAssetName',
        heading,
        informationAssetOptions(context.catalogue),
        {
          hint: 'It gives the data asset its security classification and retention period',
          required: 'Select the information asset that governs this data asset'
        }
      )
    ],
    values: {
      informationAssetName: context.dataAsset.informationAssetName ?? ''
    },
    backHref: informationAssetHref(context),
    save(answers) {
      if (answers.informationAssetName === NEW_INFORMATION_ASSET) {
        return {
          redirect: manageHref(context.identifier, 'information-asset', 'add')
        }
      }
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.informationAssetName = answers.informationAssetName
        }),
        redirect: informationAssetHref(context)
      }
    }
  }
}

// A data steward can record a new information asset until Phase 1a is
// built (LDAT-252, question 32)
function addInformationAsset(context) {
  return {
    heading: 'Add a new information asset',
    fields: [
      textField('name', 'Name', {
        hint: 'For example, Livestock Traceability Records',
        required: 'Enter a name'
      }),
      radiosField(
        'securityClassificationCode',
        'Security classification',
        referenceOptions(context.catalogue, 'securityClassifications'),
        { required: 'Select the security classification' }
      ),
      textField('retentionPeriodDescription', 'How long is the data kept?', {
        errorName: 'Retention period',
        hint: 'For example, 7 years after the last movement',
        required: 'Enter how long the data is kept'
      })
    ],
    values: {},
    backHref: manageHref(context.identifier, 'information-asset', 'choose'),
    validate: (answers) =>
      context.catalogue.collections.informationAssets.some((existing) =>
        sameTextIgnoringCase(existing.name, answers.name)
      )
        ? [
            {
              name: 'name',
              text: 'An information asset with this name already exists'
            }
          ]
        : [],
    save(answers) {
      const now = systemDateTime()
      const informationAsset = {
        name: answers.name,
        securityClassificationCode: answers.securityClassificationCode,
        retentionPeriodDescription: answers.retentionPeriodDescription,
        systemCreatedDateTime: now,
        systemCreatedByUserId: context.persona.entraObjectId,
        systemUpdatedDateTime: now,
        systemUpdatedByUserId: context.persona.entraObjectId
      }
      return {
        change: editChange(
          context,
          (dataAsset) => {
            dataAsset.informationAssetName = answers.name
          },
          { informationAssets: [informationAsset] }
        ),
        redirect: informationAssetHref(context)
      }
    }
  }
}

function targetOptions(context) {
  return [
    ...context.catalogue.collections.dataAssets
      .filter(
        (dataAsset) =>
          dataAsset.identifier !== context.identifier &&
          canSee(context, dataAsset)
      )
      .map((dataAsset) => ({
        value: dataAsset.identifier,
        text: dataAsset.titleName,
        hint: dataAsset.identifier
      })),
    OR_DIVIDER,
    {
      value: EXTERNAL,
      text: 'Something outside this catalogue',
      conditional: addressField('targetAddress', 'Web address', {
        example: 'https://www.example.com/reports',
        required: 'Enter the web address',
        check: (value) =>
          URL.canParse(value) && new URL(value).protocol === 'https:'
            ? undefined
            : 'Enter a web address in the correct format, like https://www.example.com/reports'
      })
    }
  ]
}

function relationshipTarget(answers) {
  return answers.target === EXTERNAL ? answers.targetAddress : answers.target
}

function relationshipProblems(context, answers) {
  const relationships = context.dataAsset.relationships ?? []
  if (relationships.length >= MOST_RELATIONSHIPS) {
    return [
      {
        name: 'relationshipTypeCode',
        text: `A data asset can have up to ${MOST_RELATIONSHIPS} related resources`
      }
    ]
  }
  const target = relationshipTarget(answers)
  return relationships.some(
    (relationship) =>
      relationship.targetResourceIdentifier === target &&
      relationship.relationshipTypeCode === answers.relationshipTypeCode
  )
    ? [
        {
          name: 'relationshipTypeCode',
          text: 'This data asset already has this relationship'
        }
      ]
    : []
}

function addRelatedResource(context) {
  return {
    heading: 'Add a related resource',
    fields: [
      radiosField(
        'relationshipTypeCode',
        'How is it related?',
        referenceOptions(context.catalogue, 'relationshipTypes'),
        { required: 'Select how it is related' }
      ),
      radiosField('target', 'What is it related to?', targetOptions(context), {
        required:
          'Select the data asset, or select something outside this catalogue'
      }),
      longTextField('description', 'Describe the relationship (optional)', {
        errorName: 'Description'
      })
    ],
    values: {},
    backHref: relatedHref(context),
    validate: (answers) => relationshipProblems(context, answers),
    save(answers) {
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.relationships = [
            ...(dataAsset.relationships ?? []),
            {
              targetResourceIdentifier: relationshipTarget(answers),
              relationshipTypeCode: answers.relationshipTypeCode,
              ...(answers.description
                ? { description: answers.description }
                : {})
            }
          ]
        }),
        redirect: relatedHref(context)
      }
    }
  }
}

// A data asset's title, if the persona can see it, or else its identifier
export function relationshipTargetText(context, relationship) {
  const target = relationship.targetResourceIdentifier
  if (!isDataAssetIdentifier(target)) {
    return target
  }
  const dataAsset = context.catalogue.dataAssetsByIdentifier.get(target)
  return dataAsset && canSee(context, dataAsset) ? dataAsset.titleName : target
}

function removeRelatedResource(context) {
  const { item, position } = itemAt(
    context.dataAsset.relationships,
    context.req.params.position
  )
  const heading = `Are you sure you want to remove ${relationshipTargetText(context, item)} from the related resources?`
  return {
    heading,
    fields: [
      radiosField('confirm', heading, YES_NO_OPTIONS, {
        classes: 'govuk-radios--inline',
        required: 'Select yes if you want to remove it'
      })
    ],
    buttonText: 'Continue',
    values: {},
    backHref: relatedHref(context),
    save(answers) {
      if (answers.confirm !== 'yes') {
        return { redirect: relatedHref(context) }
      }
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.relationships = dataAsset.relationships.filter(
            (_, index) => index !== position
          )
        }),
        redirect: relatedHref(context)
      }
    }
  }
}

export const RELATION_ROUTES = Object.freeze({
  'information-asset/choose': chooseInformationAsset,
  'information-asset/add': addInformationAsset,
  'related-resources/add': addRelatedResource,
  'related-resources/:position/remove': removeRelatedResource
})

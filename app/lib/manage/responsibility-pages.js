import { formatDate } from '../formatting.js'
import { isCurrentOn } from '../periods.js'
import {
  canChangeResponsibility,
  editChange,
  itemAt,
  manageHref,
  NotFoundError
} from './context.js'
import {
  OR_DIVIDER,
  dateField,
  organisationOptions,
  peopleOptions,
  radiosField
} from './fields.js'

// Who is responsible for a data asset (S07, S17). Only a catalogue
// administrator assigns governance roles; a data steward can change the
// delivery group, which isn't a governance role.

const LATEST_DATE = '9999-12-31'
const MOST_ASSIGNMENTS = 30
const MOST_CUSTODIANS = 10

const ROLES = Object.freeze({
  'data-owner': { code: 'DATA_OWNER', name: 'data owner' },
  'data-steward': { code: 'DATA_STEWARD', name: 'data steward' }
})

const NONE = 'none'

function sectionHref(context) {
  return manageHref(context.identifier, 'responsibility')
}

export function overlaps(first, second) {
  return (
    first.effectiveFromDate <= (second.effectiveToDate ?? LATEST_DATE) &&
    second.effectiveFromDate <= (first.effectiveToDate ?? LATEST_DATE)
  )
}

function personWithId(catalogue, entraObjectId) {
  return catalogue.peopleByEntraId.get(entraObjectId)
}

function assignmentsFor(dataAsset, roleCode) {
  return (dataAsset.governanceAssignments ?? []).filter(
    (assignment) => assignment.governanceRoleCode === roleCode
  )
}

function isSamePerson(assignment, person) {
  return (
    assignment.personName === person.name &&
    assignment.personEmailAddressReference === person.emailAddressReference
  )
}

// There's at most 1 data owner at a time, and nobody holds the same role
// twice at once (S17)
function assignmentProblems(context, role, person, period, ignored) {
  const others = assignmentsFor(context.dataAsset, role.code).filter(
    (assignment) => assignment !== ignored && overlaps(assignment, period)
  )
  if (role.code === 'DATA_OWNER' && others.length > 0) {
    return [
      {
        name: 'person',
        text: "End the current data owner's assignment before you add a new data owner"
      }
    ]
  }
  return others.some((assignment) => isSamePerson(assignment, person))
    ? [
        {
          name: 'person',
          text: `${person.name} is already a ${role.name} on these dates`
        }
      ]
    : []
}

function personField(context, role, label = `Who is the ${role.name}?`) {
  return radiosField('person', label, peopleOptions(context.catalogue), {
    required: `Select the ${role.name}`
  })
}

function newAssignment(person, role, effectiveFromDate) {
  return {
    personName: person.name,
    personEmailAddressReference: person.emailAddressReference,
    governanceRoleCode: role.code,
    effectiveFromDate
  }
}

function addAssignment(roleSlug) {
  const role = ROLES[roleSlug]
  return (context) => ({
    heading: `Add a ${role.name}`,
    allowed: canChangeResponsibility,
    paragraphs: [
      'If the person is not listed, they need to be added to the catalogue first.'
    ],
    fields: [
      personField(context, role),
      dateField('effectiveFromDate', `When did they become the ${role.name}?`, {
        required: `Enter the date they became the ${role.name}`,
        dateName: `The date they became the ${role.name}`
      })
    ],
    values: {},
    backHref: sectionHref(context),
    validate(answers) {
      if (
        (context.dataAsset.governanceAssignments ?? []).length >=
        MOST_ASSIGNMENTS
      ) {
        return [
          {
            name: 'person',
            text: `A data asset can have up to ${MOST_ASSIGNMENTS} assignments`
          }
        ]
      }
      const person = personWithId(context.catalogue, answers.person)
      return assignmentProblems(context, role, person, {
        effectiveFromDate: answers.effectiveFromDate
      })
    },
    save(answers) {
      const person = personWithId(context.catalogue, answers.person)
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.governanceAssignments = [
            ...(dataAsset.governanceAssignments ?? []),
            newAssignment(person, role, answers.effectiveFromDate)
          ]
        }),
        redirect: sectionHref(context)
      }
    }
  })
}

function addCustodian(context) {
  return {
    heading: 'Add a data custodian',
    allowed: canChangeResponsibility,
    fields: [
      radiosField(
        'organisationName',
        'Which organisation is a data custodian?',
        organisationOptions(context.catalogue),
        { required: 'Select the organisation' }
      ),
      dateField('effectiveFromDate', 'When did it become a data custodian?', {
        required: 'Enter the date it became a data custodian',
        dateName: 'The date it became a data custodian'
      })
    ],
    values: {},
    backHref: sectionHref(context),
    validate(answers) {
      const custodians = context.dataAsset.custodians ?? []
      if (custodians.length >= MOST_CUSTODIANS) {
        return [
          {
            name: 'organisationName',
            text: `A data asset can have up to ${MOST_CUSTODIANS} data custodians`
          }
        ]
      }
      return custodians.some(
        (custodian) =>
          custodian.organisationName === answers.organisationName &&
          custodian.effectiveFromDate === answers.effectiveFromDate
      )
        ? [
            {
              name: 'organisationName',
              text: 'This organisation is already a data custodian from that date'
            }
          ]
        : []
    },
    save(answers) {
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.custodians = [
            ...(dataAsset.custodians ?? []),
            {
              organisationName: answers.organisationName,
              effectiveFromDate: answers.effectiveFromDate
            }
          ]
        }),
        redirect: sectionHref(context)
      }
    }
  }
}

function endPeriod({ listName, describe }) {
  return (context) => {
    const { position, item } = itemAt(
      context.dataAsset[listName],
      context.req.params.position
    )
    const heading = `When does ${describe(item)}?`
    return {
      heading,
      allowed: canChangeResponsibility,
      fields: [
        dateField('effectiveToDate', heading, {
          required: 'Enter the end date',
          dateName: 'The end date'
        })
      ],
      values: {},
      backHref: sectionHref(context),
      validate: (answers) =>
        answers.effectiveToDate < item.effectiveFromDate
          ? [
              {
                name: 'effectiveToDate',
                text: `The end date must be the same as or after ${formatDate(item.effectiveFromDate)}`
              }
            ]
          : [],
      save(answers) {
        return {
          change: editChange(context, (dataAsset) => {
            dataAsset[listName][position].effectiveToDate =
              answers.effectiveToDate
          }),
          redirect: sectionHref(context)
        }
      }
    }
  }
}

function roleNameOf(assignment) {
  return assignment.governanceRoleCode === 'DATA_OWNER'
    ? 'data owner'
    : 'data steward'
}

function currentOwner(context) {
  return assignmentsFor(context.dataAsset, 'DATA_OWNER').find(
    (assignment) =>
      isCurrentOn(assignment, context.today) &&
      assignment.effectiveToDate === undefined
  )
}

function changeOwnerProblems(context, owner, answers) {
  const problems = []
  if (answers.ownerEndDate < owner.effectiveFromDate) {
    problems.push({
      name: 'ownerEndDate',
      text: `The date ${owner.personName} stops must be the same as or after ${formatDate(owner.effectiveFromDate)}`
    })
  }
  if (answers.effectiveFromDate <= answers.ownerEndDate) {
    problems.push({
      name: 'effectiveFromDate',
      text: `The date the new data owner starts must be after the date ${owner.personName} stops`
    })
  }
  if (problems.length > 0) {
    return problems
  }
  const person = personWithId(context.catalogue, answers.person)
  return assignmentProblems(
    context,
    ROLES['data-owner'],
    person,
    { effectiveFromDate: answers.effectiveFromDate },
    owner
  )
}

// Ending the current data owner and adding the new one together, so there
// is never a time with 2 data owners (S17)
function changeDataOwner(context) {
  const owner = currentOwner(context)
  if (!owner) {
    throw new NotFoundError()
  }
  return {
    heading: 'Change the data owner',
    allowed: canChangeResponsibility,
    fields: [
      dateField(
        'ownerEndDate',
        `When does ${owner.personName} stop being the data owner?`,
        {
          required: `Enter the date ${owner.personName} stops being the data owner`,
          dateName: `The date ${owner.personName} stops being the data owner`
        }
      ),
      personField(context, ROLES['data-owner'], 'Who is the new data owner?'),
      dateField('effectiveFromDate', 'When do they become the data owner?', {
        hint: 'This is usually the day after the current data owner stops. For example, 27 3 2024',
        required: 'Enter the date the new data owner starts',
        dateName: 'The date the new data owner starts'
      })
    ],
    values: {},
    backHref: sectionHref(context),
    validate: (answers) => changeOwnerProblems(context, owner, answers),
    save(answers) {
      const person = personWithId(context.catalogue, answers.person)
      const position = context.dataAsset.governanceAssignments.indexOf(owner)
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.governanceAssignments[position].effectiveToDate =
            answers.ownerEndDate
          dataAsset.governanceAssignments.push(
            newAssignment(
              person,
              ROLES['data-owner'],
              answers.effectiveFromDate
            )
          )
        }),
        redirect: sectionHref(context)
      }
    }
  }
}

function deliveryGroup(context) {
  const groups = context.catalogue.collections.deliveryGroups.map((group) => ({
    value: group.name,
    text: group.name,
    hint: group.organisationName
  }))
  return {
    heading: 'Which delivery group supports this data asset?',
    fields: [
      radiosField(
        'deliveryGroupName',
        'Which delivery group supports this data asset?',
        [...groups, OR_DIVIDER, { value: NONE, text: 'None' }],
        { required: 'Select a delivery group, or select None' }
      )
    ],
    values: { deliveryGroupName: context.dataAsset.deliveryGroupName ?? '' },
    backHref: sectionHref(context),
    save(answers) {
      return {
        change: editChange(context, (dataAsset) => {
          dataAsset.deliveryGroupName =
            answers.deliveryGroupName === NONE
              ? undefined
              : answers.deliveryGroupName
        }),
        redirect: sectionHref(context)
      }
    }
  }
}

export const RESPONSIBILITY_ROUTES = Object.freeze({
  'responsibility/delivery-group': deliveryGroup,
  'responsibility/data-owner/add': addAssignment('data-owner'),
  'responsibility/data-steward/add': addAssignment('data-steward'),
  'responsibility/data-custodian/add': addCustodian,
  'responsibility/change-data-owner': changeDataOwner,
  'responsibility/assignments/:position/end': endPeriod({
    listName: 'governanceAssignments',
    describe: (assignment) =>
      `${assignment.personName} stop being a ${roleNameOf(assignment)}`
  }),
  'responsibility/custodians/:position/end': endPeriod({
    listName: 'custodians',
    describe: (custodian) =>
      `${custodian.organisationName} stop being a data custodian`
  })
})

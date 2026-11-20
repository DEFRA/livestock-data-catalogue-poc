import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildCatalogue } from '../../app/lib/catalogue-data.js'
import {
  describeCreation,
  isMaterialAttribute,
  isMaterialChange
} from '../../app/lib/history.js'
import {
  canChangeResponsibility,
  editChange,
  isEditable
} from '../../app/lib/manage/context.js'
import { RESPONSIBILITY_ROUTES } from '../../app/lib/manage/responsibility-pages.js'
import { sectionWarning, sectionWithId } from '../../app/lib/manage/sections.js'
import { personaFor } from '../../app/lib/personas.js'
import { TODAY, catalogueCopy } from '../helpers/catalogue.js'

// The context a manage page gets for a data asset, in a given state
function contextFor(
  identifier,
  { state, personaId = 'catalogue-administrator' } = {}
) {
  const collections = catalogueCopy()
  const dataAsset = collections.dataAssets.find(
    (candidate) => candidate.identifier === identifier
  )
  if (state) {
    dataAsset.publicationStateCode = state
  }
  const persona = personaFor(personaId)
  return {
    catalogue: buildCatalogue(collections),
    dataAsset,
    identifier,
    persona,
    today: TODAY,
    canAssignRoles: personaId === 'catalogue-administrator'
  }
}

function stateAfter(context, update) {
  return editChange(context, update).dataAsset.publicationStateCode
}

describe('which changes are material (answers 28 and 41)', () => {
  test('a field needed to publish, who is responsible, a state or a distribution', () => {
    for (const attribute of [
      'titleName',
      'description',
      'publicationStateCode',
      'lifecycleStateCode',
      'keywordNames',
      'validFromDate',
      'informationAssetName',
      'governanceAssignments',
      'custodians',
      'distributions'
    ]) {
      assert.equal(isMaterialAttribute(attribute), true, attribute)
    }
  })

  test('not optional fields, the delivery group, relationships or reviews', () => {
    for (const attribute of [
      'versionNumber',
      'validToDate',
      'coverageStartDate',
      'coverageEndDate',
      'spatialCoverageDescription',
      'deliveryGroupName',
      'relationships',
      'reviewFrequencyMonthQuantity',
      'lastReviewedDate',
      'lastReviewedByName',
      'nextReviewDate',
      'approvedByName',
      'metadataDate',
      'constructor'
    ]) {
      assert.equal(isMaterialAttribute(attribute), false, attribute)
    }
  })

  test('a change is material exactly when the change history records it', () => {
    const { catalogue, dataAsset } = contextFor('DA11111')

    assert.equal(
      isMaterialChange(catalogue, dataAsset, {
        ...dataAsset,
        description: 'Changed.'
      }),
      true
    )
    assert.equal(
      isMaterialChange(catalogue, dataAsset, {
        ...dataAsset,
        versionNumber: '9.9',
        relationships: []
      }),
      false
    )
  })
})

describe('saving a change to a data asset', () => {
  test('a material change sends a published data asset back to Draft (answer 41)', () => {
    const context = contextFor('DA11111')

    assert.equal(
      stateAfter(context, (dataAsset) => {
        dataAsset.description = 'Changed.'
      }),
      'DRAFT'
    )
    assert.equal(
      stateAfter(context, (dataAsset) => {
        dataAsset.distributions[0].licenceCode = 'OGL'
      }),
      'DRAFT'
    )
    assert.equal(
      stateAfter(context, (dataAsset) => {
        dataAsset.custodians.pop()
      }),
      'DRAFT'
    )
  })

  test('a change that is not material keeps a published data asset published (answer 41)', () => {
    const context = contextFor('DA11111')

    for (const update of [
      (dataAsset) => {
        dataAsset.versionNumber = '9.9'
      },
      (dataAsset) => {
        dataAsset.deliveryGroupName = undefined
      },
      (dataAsset) => {
        dataAsset.relationships = []
      },
      (dataAsset) => {
        dataAsset.lastReviewedDate = '2026-11-01'
        dataAsset.nextReviewDate = '2027-11-01'
      },
      (dataAsset) => {
        dataAsset.coverageStartDate = '2020-01-01'
        dataAsset.spatialCoverageDescription = 'Wales'
      }
    ]) {
      assert.equal(stateAfter(context, update), 'PUBLISHED')
    }
  })

  test('a deprecated data asset stays deprecated, even after a material change (answer 42)', () => {
    const context = contextFor('DA11114')

    assert.equal(
      stateAfter(context, (dataAsset) => {
        dataAsset.description = 'Changed.'
        dataAsset.governanceAssignments.pop()
      }),
      'DEPRECATED'
    )
  })

  test('a draft stays a draft', () => {
    assert.equal(
      stateAfter(contextFor('DA11112'), (dataAsset) => {
        dataAsset.description = 'Changed.'
      }),
      'DRAFT'
    )
  })

  test('still dates the entry and says who changed it, when nothing material changed', () => {
    const { dataAsset } = editChange(contextFor('DA11111'), (changed) => {
      changed.versionNumber = '9.9'
    })

    assert.equal(dataAsset.metadataDate, TODAY)
    assert.equal(
      dataAsset.systemUpdatedByUserId,
      personaFor('catalogue-administrator').entraObjectId
    )
  })
})

describe('which data assets can be changed (answer 42)', () => {
  test('drafts, published and deprecated data assets, but not retired ones', () => {
    assert.deepEqual(
      ['DRAFT', 'PUBLISHED', 'DEPRECATED', 'RETIRED'].map((state) =>
        isEditable(contextFor('DA11111', { state }))
      ),
      [true, true, true, false]
    )
  })

  test('a catalogue administrator can change who is responsible for a deprecated data asset, but not a retired one', () => {
    assert.equal(canChangeResponsibility(contextFor('DA11114')), true)
    assert.equal(
      canChangeResponsibility(contextFor('DA11114', { state: 'RETIRED' })),
      false
    )
  })

  test('a data steward cannot change who is responsible, in any state (answer 24)', () => {
    for (const state of ['DRAFT', 'PUBLISHED', 'DEPRECATED']) {
      assert.equal(
        canChangeResponsibility(
          contextFor('DA11111', { state, personaId: 'data-steward' })
        ),
        false,
        state
      )
    }
  })
})

describe('the warning on a section of a published data asset (answer 41)', () => {
  const warningOn = (sectionId, options) =>
    sectionWarning(contextFor('DA11111', options), sectionWithId(sectionId))

  test('says saving a change takes it out of the catalogue when every answer in it is material', () => {
    for (const sectionId of [
      'classification',
      'status',
      'access-and-provenance',
      'distributions',
      'information-asset'
    ]) {
      assert.match(
        warningOn(sectionId),
        /^Saving a change will take this data asset out of the catalogue/,
        sectionId
      )
    }
  })

  test('says only some changes do when the section mixes material and other answers', () => {
    for (const sectionId of ['about', 'dates', 'responsibility']) {
      assert.match(
        warningOn(sectionId),
        /^Changing some of these answers will take this data asset out of the catalogue/,
        sectionId
      )
    }
  })

  test('says nothing when no answer in the section is material', () => {
    assert.equal(warningOn('related-resources'), undefined)
    assert.equal(warningOn('review'), undefined)
  })

  test('says nothing to a data steward on who is responsible, where they can only change the delivery group', () => {
    assert.equal(
      warningOn('responsibility', { personaId: 'data-steward' }),
      undefined
    )
  })

  test('says nothing for a draft or a deprecated data asset, which never goes back to Draft', () => {
    assert.equal(warningOn('about', { state: 'DRAFT' }), undefined)
    assert.equal(warningOn('about', { state: 'DEPRECATED' }), undefined)
  })
})

describe('the change history of a new data asset (answer 39)', () => {
  test('says it was created, and who became its data steward', () => {
    assert.deepEqual(
      describeCreation({
        governanceAssignments: [
          {
            personName: 'Sam Specimen',
            personEmailAddressReference: 'sam.specimen@example.com',
            governanceRoleCode: 'DATA_STEWARD',
            effectiveFromDate: '2026-11-20'
          }
        ]
      }),
      [
        'Data asset created',
        'Data steward Sam Specimen added, from 20 November 2026'
      ]
    )
  })

  test('says only that it was created, when nobody was assigned', () => {
    assert.deepEqual(describeCreation({}), ['Data asset created'])
  })
})

describe('a draft with nobody assigned to it yet', () => {
  // Data assets created before answer 39 can have nobody assigned
  const draft = () => contextFor('DA11116', { state: 'DRAFT' })

  test('can have its first data owner added by a catalogue administrator', () => {
    const page = RESPONSIBILITY_ROUTES['responsibility/data-owner/add'](draft())
    const answers = {
      person: '8d8f18d7-ef4f-4188-b706-90c58a9d0fb3',
      effectiveFromDate: '2026-01-01'
    }

    assert.deepEqual(page.validate(answers), [])
    assert.deepEqual(
      page.save(answers).change.dataAsset.governanceAssignments,
      [
        {
          personName: 'Jo Bloggs',
          personEmailAddressReference: 'jo.bloggs@example.com',
          governanceRoleCode: 'DATA_OWNER',
          effectiveFromDate: '2026-01-01'
        }
      ]
    )
  })
})

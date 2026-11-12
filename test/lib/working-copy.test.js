import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildCatalogue, catalogue } from '../../app/lib/catalogue-data.js'
import { describeChanges } from '../../app/lib/history.js'
import {
  SessionFullError,
  buildWorkingCatalogue,
  catalogueFor,
  choosePersona,
  commitChange,
  ensureSessionChanges,
  historyFor,
  issuedIdentifiers,
  resetChanges
} from '../../app/lib/working-copy.js'
import { catalogueCopy, dataAssetIn } from '../helpers/catalogue.js'

// A request with an in-memory session, as the session middleware gives
function sessionRequest() {
  let saved
  return {
    get: () => undefined,
    prototypeSession: {
      get data() {
        return saved
      },
      save(data) {
        saved = structuredClone(data)
      },
      renew(data) {
        saved = structuredClone(data)
      }
    }
  }
}

function administratorRequest() {
  const req = sessionRequest()
  choosePersona(req, 'catalogue-administrator')
  return req
}

function editedCopy(identifier, update) {
  const dataAsset = structuredClone(
    catalogue.dataAssetsByIdentifier.get(identifier)
  )
  update(dataAsset)
  return dataAsset
}

describe('the working copy of the catalogue', () => {
  test('is the mock data itself until something changes', () => {
    assert.equal(buildWorkingCatalogue(catalogue, undefined), catalogue)
    assert.equal(catalogueFor(sessionRequest()), catalogue)
  })

  test('shows changed, new and deleted data assets, and new keywords, over the mock data', () => {
    const changes = ensureSessionChanges(sessionRequest())
    changes.dataAssets.DA11111 = editedCopy('DA11111', (dataAsset) => {
      dataAsset.titleName = 'Changed title'
    })
    changes.dataAssets.DA1111G = editedCopy('DA11113', (dataAsset) => {
      dataAsset.identifier = 'DA1111G'
      dataAsset.titleName = 'A new one'
    })
    changes.deletedIdentifiers.push('DA11112')
    changes.keywords.push({ name: 'made-up keyword', languageCode: 'en' })

    const working = buildWorkingCatalogue(catalogue, changes)

    assert.equal(
      working.dataAssetsByIdentifier.get('DA11111').titleName,
      'Changed title'
    )
    assert.equal(
      working.dataAssetsByIdentifier.get('DA1111G').titleName,
      'A new one'
    )
    assert.equal(working.dataAssetsByIdentifier.has('DA11112'), false)
    assert.ok(
      working.collections.keywords.some(
        (keyword) => keyword.name === 'made-up keyword'
      )
    )
    assert.equal(
      catalogue.dataAssetsByIdentifier.get('DA11111').titleName,
      'Animal Movement'
    )
  })

  test('saves a valid change, with a history entry naming the persona', () => {
    const req = administratorRequest()
    commitChange(req, {
      action: 'edit',
      identifier: 'DA11111',
      dataAsset: editedCopy('DA11111', (dataAsset) => {
        dataAsset.titleName = 'Animal Movements'
      })
    })

    assert.equal(
      catalogueFor(req).dataAssetsByIdentifier.get('DA11111').titleName,
      'Animal Movements'
    )
    const [entry] = historyFor(req, 'DA11111')
    assert.equal(
      entry.description,
      'Title changed from Animal Movement to Animal Movements'
    )
    assert.equal(entry.madeBy, 'Jamie Placeholder, catalogue administrator')
    assert.match(entry.dateTime, /^\d{4}-\d{2}-\d{2}T/)
    assert.deepEqual(historyFor(req, 'DA11113'), [])
  })

  test('refuses a change that breaks a data rule, and saves nothing (fails closed)', () => {
    const req = administratorRequest()
    const before = req.prototypeSession.data

    assert.throws(
      () =>
        commitChange(req, {
          action: 'edit',
          identifier: 'DA11111',
          dataAsset: editedCopy('DA11111', (dataAsset) => {
            dataAsset.titleName = 'livestock holding'
          })
        }),
      /would break 1 of the catalogue's data rules/
    )
    assert.deepEqual(req.prototypeSession.data, before)
  })

  test('refuses a change that breaks the data contract', () => {
    const req = administratorRequest()

    assert.throws(() =>
      commitChange(req, {
        action: 'edit',
        identifier: 'DA11111',
        dataAsset: editedCopy('DA11111', (dataAsset) => {
          dataAsset.publicationStateCode = 'SHARED'
        })
      })
    )
  })

  test('records a created identifier as issued, and a deleted one without a history entry', () => {
    const req = administratorRequest()
    const dataAsset = {
      identifier: 'DA1111G',
      titleName: 'Made-up draft',
      description: 'A made-up draft.',
      organisationName: 'Rural Payments Agency',
      publicationStateCode: 'DRAFT',
      metadataDate: '2026-11-12',
      reviewFrequencyMonthQuantity: 12,
      systemCreatedDateTime: '2026-11-12T09:00:00Z',
      systemCreatedByUserId: '40044d45-47b9-47bc-9e16-ab6cbf0baf31',
      systemUpdatedDateTime: '2026-11-12T09:00:00Z',
      systemUpdatedByUserId: '40044d45-47b9-47bc-9e16-ab6cbf0baf31'
    }
    commitChange(req, { action: 'create', identifier: 'DA1111G', dataAsset })
    commitChange(req, { action: 'delete', identifier: 'DA1111G' })

    assert.ok(issuedIdentifiers(req).includes('DA1111G'))
    assert.ok(issuedIdentifiers(req).includes('DA1111C'))
    assert.equal(catalogueFor(req).dataAssetsByIdentifier.has('DA1111G'), false)
    assert.deepEqual(
      historyFor(req, 'DA1111G').map((entry) => entry.description),
      ['Data asset created']
    )
  })

  test('refuses a change that would make the session too big, and saves nothing', () => {
    const req = administratorRequest()
    const before = req.prototypeSession.data

    assert.throws(
      () =>
        commitChange(req, {
          action: 'edit',
          identifier: 'DA11111',
          dataAsset: editedCopy('DA11111', (dataAsset) => {
            dataAsset.description = 'x'.repeat(500_001)
          })
        }),
      SessionFullError
    )
    assert.deepEqual(req.prototypeSession.data, before)
  })

  test('refuses more than 300 new keywords in a session', () => {
    const req = administratorRequest()
    const keywords = Array.from({ length: 301 }, (_, index) => ({
      name: `made-up keyword ${index}`,
      languageCode: 'en'
    }))

    assert.throws(
      () =>
        commitChange(req, {
          action: 'edit',
          identifier: 'DA11111',
          dataAsset: editedCopy('DA11111', () => {}),
          keywords
        }),
      SessionFullError
    )
  })

  test('choosing a persona gives the session a new form token', () => {
    const req = administratorRequest()
    const { csrfToken } = req.prototypeSession.data
    choosePersona(req, 'data-steward')

    assert.notEqual(req.prototypeSession.data.csrfToken, csrfToken)
    assert.equal(req.prototypeSession.data.personaId, 'data-steward')
  })

  test('removes every change when reset, but keeps the persona and form token', () => {
    const req = administratorRequest()
    const { csrfToken } = req.prototypeSession.data
    commitChange(req, {
      action: 'edit',
      identifier: 'DA11111',
      dataAsset: editedCopy('DA11111', (dataAsset) => {
        dataAsset.titleName = 'Animal Movements'
      })
    })
    resetChanges(req)

    assert.equal(catalogueFor(req), catalogue)
    assert.equal(req.prototypeSession.data.personaId, 'catalogue-administrator')
    assert.equal(req.prototypeSession.data.csrfToken, csrfToken)
    assert.deepEqual(historyFor(req, 'DA11111'), [])
  })
})

describe('the change history (material changes, question 28)', () => {
  function changesTo(identifier, update) {
    const collections = catalogueCopy()
    const before = dataAssetIn(collections, identifier)
    const after = structuredClone(before)
    update(after)
    return describeChanges(buildCatalogue(collections), before, after)
  }

  test('describes codes, people and dates by name', () => {
    assert.deepEqual(
      changesTo('DA11111', (dataAsset) => {
        dataAsset.updateFrequencyCode = 'WEEKLY'
        dataAsset.creatorReference = '7bff5498-dd64-4e3b-949b-e6c6e8b1c023'
        dataAsset.creationDate = '2020-01-02'
      }),
      [
        'Update frequency changed from Real time to Weekly',
        'Creator changed from Jo Bloggs to Sam Specimen',
        'Creation date changed from 1 April 2024 to 2 January 2020'
      ]
    )
  })

  test('does not list changes to optional fields, the delivery group or relationships', () => {
    assert.deepEqual(
      changesTo('DA11111', (dataAsset) => {
        dataAsset.versionNumber = '9.9'
        dataAsset.deliveryGroupName = undefined
        dataAsset.relationships = []
        dataAsset.reviewFrequencyMonthQuantity = 6
      }),
      []
    )
  })

  test('shortens long values to 100 characters', () => {
    const [change] = changesTo('DA11111', (dataAsset) => {
      dataAsset.description = 'x'.repeat(500)
    })

    assert.match(change, /to x{99}…$/)
  })

  test('lists assignments added and ended, and custodians removed', () => {
    assert.deepEqual(
      changesTo('DA11111', (dataAsset) => {
        dataAsset.governanceAssignments[0].effectiveToDate = '2026-12-31'
        dataAsset.governanceAssignments.push({
          personName: 'Alex Example',
          personEmailAddressReference: 'alex.example@example.com',
          governanceRoleCode: 'DATA_OWNER',
          effectiveFromDate: '2027-01-01'
        })
        dataAsset.custodians = dataAsset.custodians.slice(1)
      }),
      [
        'Data owner Alex Example added, from 1 January 2027',
        'Data owner Jo Bloggs now from 1 April 2024 to 31 December 2026',
        'Data custodian Digital, Data and Technology Services removed'
      ]
    )
  })

  test('lists a distribution renamed, changed, added or removed', () => {
    assert.deepEqual(
      changesTo('DA11111', (dataAsset) => {
        dataAsset.distributions[0].name = 'Movements REST API'
        dataAsset.distributions[0].licenceCode = 'OGL'
      }),
      [
        'Distribution Movements API renamed Movements REST API',
        'Distribution Movements REST API: licence changed from Memorandum of Understanding to Open Government Licence'
      ]
    )
    assert.deepEqual(
      changesTo('DA11111', (dataAsset) => {
        dataAsset.distributions.pop()
      }),
      ['Distribution Movement events removed']
    )
    assert.deepEqual(
      changesTo('DA11111', (dataAsset) => {
        dataAsset.distributions.push({ name: 'Movements file' })
      }),
      ['Distribution Movements file added']
    )
  })
})

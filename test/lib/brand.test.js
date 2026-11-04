import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { DEFRA_COLOUR, organisationColour } from '../../app/lib/brand.js'

describe('the brand colour', () => {
  test("is Defra's contrast-safe organisation colour from GOV.UK Frontend", () => {
    assert.match(DEFRA_COLOUR, /^#[0-9a-f]{6}$/)
    assert.equal(
      DEFRA_COLOUR,
      organisationColour('department-for-environment-food-rural-affairs')
    )
  })

  test('fails clearly when GOV.UK Frontend has no colour for the organisation', () => {
    assert.throws(
      () =>
        organisationColour(
          'department-of-livestock',
          '$govuk-colours-organisations: ();'
        ),
      {
        message:
          'GOV.UK Frontend has no contrast-safe colour for department-of-livestock'
      }
    )
  })
})

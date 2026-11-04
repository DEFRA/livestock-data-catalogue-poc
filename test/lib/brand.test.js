import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { DEFRA_COLOUR, organisationColour } from '../../app/lib/brand.js'

describe('the brand colour', () => {
  test('reads the contrast-safe colour, not the main colour', () => {
    const coloursSass = [
      '$govuk-colours-organisations: (',
      '  "department-of-livestock": (',
      '    colour: #00a33b,',
      '    contrast-safe: #008531',
      '  ),',
      ');'
    ].join('\n')

    assert.equal(
      organisationColour('department-of-livestock', coloursSass),
      '#008531'
    )
  })

  test("is Defra's colour from GOV.UK Frontend, as a 6-digit hex colour", () => {
    assert.match(DEFRA_COLOUR, /^#[0-9a-f]{6}$/)
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
